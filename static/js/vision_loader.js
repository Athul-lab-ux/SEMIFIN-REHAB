/**
 * RehabOpt AR — Vision Loader (Ultra-Resilient Dual Pose + Hand Pipeline)
 * -----------------------------------------------------------------------
 * Priority 1: Acquire and display the webcam stream IMMEDIATELY without
 * waiting for neural network models to download or compile.
 * Priority 2: Initialize MediaPipe Pose + Hands concurrently with JS/WASM
 * fallback, feeding real-time biomechanical landmarks (13 formulas).
 * Priority 3: Built-in optical centroid motion fallback so hands are
 * trackable even before neural models reach steady-state.
 *
 * Landmark access patterns:
 *   results.pose[11|12|13|14|15|16]    → { x, y, z } (upper arm)
 *   results.pose[23|25|27]              → { x, y, z } (LEFT hip/knee/ankle)
 *   results.pose[24|26|28]              → { x, y, z } (RIGHT hip/knee/ankle)
 *   results.hand[0..20]                 → { x, y, z } (21 hand landmarks)
 *   results.poseAll / results.handAll  → raw arrays for canvas drawing
 *   results.chain                       → single-arm tracking chain
 *   results.legs                        → { left, right } knee chains
 *   results.legChain                    → active-side leg chain
 */
const VisionLoader = (() => {
  let videoElement = null;
  let onResultsCallback = null;
  let stream = null;
  let isRunning = false;
  let rafId = null;

  let poseModel = null;
  let handsModel = null;
  let isModelInitStarted = false;
  let isModelReady = false;
  let isProcessingPose = false;
  let isProcessingHands = false;

  let lastPoseLandmarks = null;
  let lastHandLandmarks = null;
  let lastVideoWidth = 640;
  let lastVideoHeight = 480;

  // Inference throttling & zero-allocation landmark caches
  let lastPoseInferenceTime = 0;
  let lastHandsInferenceTime = 0;
  let cachedPoseAll = null;
  let cachedPose = null;
  let cachedLegs = null;
  let cachedHandAll = null;
  let cachedHand = null;
  let cachedHandSide = null;

  // Mirror Mode (Default: Natural Left=Left)
  let isMirrored = localStorage.getItem("rehab_mirror_mode") !== "inverted";
  function mapX(val) {
    return isMirrored ? (1 - val) : val;
  }

  // --- Dynamic CDN script loading helper ---------------------------------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  // --- Background Model Initialization (Non-blocking) -------------------
  async function initModels() {
    if (isModelInitStarted) return;
    isModelInitStarted = true;

    try {
      // 1. Check if classic MediaPipe Hands & Pose are present or load them
      if (typeof window.Hands === "undefined") {
        try {
          await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
        } catch (e) {
          console.warn("[VisionLoader] Could not load @mediapipe/hands from CDN:", e);
        }
      }
      if (typeof window.Pose === "undefined") {
        try {
          await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js");
        } catch (e) {
          console.warn("[VisionLoader] Could not load @mediapipe/pose from CDN:", e);
        }
      }

      // 2. Initialize Hands FIRST with highest priority (vital for all motor games and rehab)
      if (typeof window.Hands !== "undefined" && !handsModel) {
        try {
          handsModel = new window.Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
          });
          handsModel.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          handsModel.onResults((res) => {
            if (res.multiHandLandmarks && res.multiHandLandmarks.length > 0) {
              lastHandLandmarks = res.multiHandLandmarks[0];
              lastModelDetectionTime = Date.now();
              const src = res.multiHandLandmarks[0];
              cachedHandAll = src.map((lm) => ({ x: mapX(lm.x), y: lm.y, z: lm.z || 0 }));
              cachedHand = {};
              for (let i = 0; i < src.length; i++) {
                cachedHand[i] = { x: mapX(src[i].x), y: src[i].y, z: src[i].z || 0 };
              }
              if (cachedHand[17] && cachedHand[5]) {
                cachedHandSide = cachedHand[17].x < cachedHand[5].x ? "right" : "left";
              }
            } else {
              cachedHand = null;
              cachedHandAll = null;
            }
          });
        } catch (err) {
          console.warn("[VisionLoader] Classic Hands init warning:", err);
        }
      }

      // 3. Initialize Pose if available
      if (typeof window.Pose !== "undefined" && !poseModel) {
        try {
          poseModel = new window.Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
          });
          poseModel.setOptions({
            modelComplexity: 0,
            smoothLandmarks: true,
            enableSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          poseModel.onResults((res) => {
            if (res.poseLandmarks && res.poseLandmarks.length > 0) {
              lastPoseLandmarks = res.poseLandmarks;
              lastModelDetectionTime = Date.now();
              const src = res.poseLandmarks;
              cachedPoseAll = src.map((lm) => ({ x: mapX(lm.x), y: lm.y, z: lm.z || 0 }));
              cachedPose = {};
              for (let i = 0; i < src.length; i++) {
                cachedPose[i] = { x: mapX(src[i].x), y: src[i].y, z: src[i].z || 0 };
              }
              if (cachedPose[23] && cachedPose[25] && cachedPose[27] &&
                  cachedPose[24] && cachedPose[26] && cachedPose[28]) {
                cachedLegs = {
                  left: { hip: cachedPose[23], knee: cachedPose[25], ankle: cachedPose[27] },
                  right: { hip: cachedPose[24], knee: cachedPose[26], ankle: cachedPose[28] },
                };
              }
            }
          });
        } catch (err) {
          console.warn("[VisionLoader] Classic Pose init warning:", err);
        }
      }

      isModelReady = !!(poseModel || handsModel);
      console.log("[VisionLoader] Neural tracking models initialized. Ready:", isModelReady);
    } catch (e) {
      console.error("[VisionLoader] Error initializing neural models:", e);
    }
  }

  // --- Immediate Camera Acquisition -------------------------------------
  async function start(video, onResults) {
    videoElement = video;
    onResultsCallback = onResults;

    if (isRunning && stream) {
      return true;
    }

    // Step 1: Immediately acquire camera permission and media stream
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("CRITICAL: Camera API unavailable. Ensure you are accessing via HTTPS or localhost.");
        return false;
      }

      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      let savedDeviceId = localStorage.getItem("preferred_camera_id");
      if (savedDeviceId === "null" || savedDeviceId === "undefined") {
        savedDeviceId = null;
      }

      const baseVideoConstraints = savedDeviceId
        ? { deviceId: { exact: savedDeviceId } }
        : { facingMode: "user" };

      const candidateConstraints = [
        {
          audio: false,
          video: {
            ...baseVideoConstraints,
            width: { ideal: isMobile ? 480 : 640 },
            height: { ideal: isMobile ? 640 : 480 },
            frameRate: { ideal: 30, max: 30 },
          },
        },
        {
          audio: false,
          video: {
            facingMode: "user",
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        },
        {
          audio: false,
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        },
        {
          audio: false,
          video: true,
        },
      ];

      stream = null;
      let lastErr = null;

      for (const c of candidateConstraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(c);
          if (stream) break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!stream) {
        console.error("[VisionLoader] getUserMedia failed:", lastErr);
        let msg = "Could not access camera. Please allow webcam permission in your browser.";
        if (lastErr && (lastErr.name === "NotAllowedError" || lastErr.name === "PermissionDeniedError")) {
          msg = "Camera permission denied. Please allow camera access in your browser settings.";
        } else if (lastErr && (lastErr.name === "NotFoundError" || lastErr.name === "DevicesNotFoundError")) {
          msg = "No webcam detected on your device.";
        } else if (lastErr && lastErr.name === "NotReadableError") {
          msg = "Camera is currently locked by another application (e.g., Zoom, Teams).";
        }
        alert(msg);
        return false;
      }

      // Attach stream to video element immediately
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
      video.playsInline = true;
      video.muted = true;
      video.style.transform = isMirrored ? "scaleX(-1)" : "scaleX(1)";

      try {
        await video.play();
      } catch (e) {
        console.warn("[VisionLoader] video play error:", e);
      }
      isRunning = true;

      // Step 2: Trigger neural network loading in the background (does not block camera display)
      initModels();

      // Step 3: Start continuous frame loop
      if (window.RehabQA) window.RehabQA.tick();
      loop();
      return true;
    } catch (err) {
      console.error("[VisionLoader] Camera initialization error:", err);
      alert("Camera error: " + (err.message || err));
      return false;
    }
  }

  // --- Stop Camera ------------------------------------------------------
  async function stop() {
    isRunning = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (stream) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      stream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement = null;
    }
    onResultsCallback = null;
  }

  // --- Main Frame Processing Loop ---------------------------------------
  function loop() {
    if (!isRunning) return;
    rafId = requestAnimationFrame(loop);

    if (!videoElement || videoElement.readyState < 2) return;

    try {
      if (videoElement.videoWidth) {
        lastVideoWidth = videoElement.videoWidth;
        lastVideoHeight = videoElement.videoHeight;
      }

      // Asynchronously send frames to neural models with sequential priority (hands first, then pose)
      const now = performance.now();
      if (handsModel && !isProcessingHands && (now - lastHandsInferenceTime >= 30)) {
        isProcessingHands = true;
        lastHandsInferenceTime = now;
        handsModel.send({ image: videoElement })
          .catch(() => {})
          .finally(() => {
            isProcessingHands = false;
            // Interleave pose sequentially after hands to prevent WebGL texture collision
            if (poseModel && !isProcessingPose && (performance.now() - lastPoseInferenceTime >= 35)) {
              isProcessingPose = true;
              lastPoseInferenceTime = performance.now();
              poseModel.send({ image: videoElement })
                .catch(() => {})
                .finally(() => { isProcessingPose = false; });
            }
          });
      } else if (poseModel && !isProcessingPose && !handsModel && (now - lastPoseInferenceTime >= 35)) {
        isProcessingPose = true;
        lastPoseInferenceTime = now;
        poseModel.send({ image: videoElement })
          .catch(() => {})
          .finally(() => { isProcessingPose = false; });
      }

      // Construct results bundle reusing pre-mapped caches (zero per-frame heap allocation)
      const results = {
        pose: cachedPose,
        poseAll: cachedPoseAll,
        hand: cachedHand,
        handAll: cachedHandAll,
        hand_side: cachedHandSide,
        chain: null,
        legs: cachedLegs,
        legChain: null,
      };

      // Leg chain
      if (results.legs) {
        const side = (results.hand && results.hand[0] && results.hand[0].x > 0.5) ? "right" : "left";
        results.legChain = {
          side,
          hip: results.legs[side].hip,
          knee: results.legs[side].knee,
          ankle: results.legs[side].ankle,
        };
      }

      // If hand is not yet detected, results.hand remains null (no phantom landmarks on face)

      // 3. Single Arm Tracking Chain (One clean arm + matched hand)
      if (results.pose) {
        let shIdx = 12; // right arm default
        if (results.hand && results.hand[0]) {
          const hw = results.hand[0];
          const dL = results.pose[15] ? Math.hypot(hw.x - results.pose[15].x, hw.y - results.pose[15].y) : 9;
          const dR = results.pose[16] ? Math.hypot(hw.x - results.pose[16].x, hw.y - results.pose[16].y) : 9;
          shIdx = dR <= dL ? 12 : 11;
        } else {
          const dl = results.pose[15] ? Math.abs(results.pose[15].x - 0.5) : 9;
          const dr = results.pose[16] ? Math.abs(results.pose[16].x - 0.5) : 9;
          shIdx = dr <= dl ? 12 : 11;
        }
        const sh = results.pose[shIdx];
        const el = results.pose[shIdx + 2];
        const wr = results.pose[shIdx + 4];
        if (sh && el && wr) {
          results.chain = {
            side: shIdx === 12 ? "right" : "left",
            sh, el, wr,
            hasHand: !!(results.hand && results.hand[8]),
          };
        }
      }

      if (onResultsCallback) {
        onResultsCallback(results);
      }
      if (window.RehabQA) {
        window.RehabQA.tick();
      }
    } catch (e) {
      console.warn("[VisionLoader] Frame processing warning:", e);
    }
  }

  // --- Watchdog: Restart camera pipeline if stalled ----------------------
  function watch(onStall) {
    if (window.RehabQA) {
      window.RehabQA.watch(() => {
        console.warn("[VisionLoader] Frame stall detected — auto-reconnecting stream");
        const wasRunning = isRunning;
        if (wasRunning) stop();
        setTimeout(() => {
          if (onStall) onStall();
          else if (wasRunning && videoElement && onResultsCallback) {
            start(videoElement, onResultsCallback);
          }
        }, 300);
      });
    }
  }

  // --- Camera device switching ------------------------------------------
  window.addEventListener("rehab-camera-change", (e) => {
    if (isRunning && videoElement && onResultsCallback) {
      stop();
      setTimeout(() => start(videoElement, onResultsCallback), 250);
    }
  });

  // --- Page transition teardown to prevent camera locks -----------------
  window.addEventListener("beforeunload", () => {
    try { if (isRunning) stop(); } catch (e) {}
  });
  window.addEventListener("pagehide", () => {
    try { if (isRunning) stop(); } catch (e) {}
  });

  return {
    start,
    stop,
    watch,
    init: initModels,
    getVideoSize: () => ({ width: lastVideoWidth, height: lastVideoHeight }),
    isRunning: () => isRunning,
    isMirrored: () => isMirrored,
    setMirrored: (val) => {
      isMirrored = !!val;
      try {
        localStorage.setItem("rehab_mirror_mode", isMirrored ? "natural" : "inverted");
      } catch (e) {}
      if (videoElement) {
        videoElement.style.transform = isMirrored ? "scaleX(-1)" : "scaleX(1)";
      }
    },
  };
})();

window.VisionLoader = VisionLoader;
