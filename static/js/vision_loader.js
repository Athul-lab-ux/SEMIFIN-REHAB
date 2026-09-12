/**
 * RehabOpt AR — Vision Loader (dual Pose + Hand, tasks-vision 0.10.14)
 * ------------------------------------------------------------------
 * Modern MediaPipe pipeline that returns BOTH pose and hand landmarks
 * on every frame — ported from the reference repository and hardened
 * with the QA watchdog (frame stall → pipeline restart, no reload).
 *
 * Landmark access patterns (matching session engines):
 *   results.pose[11|12|13|14|15|16]           → { x, y, z } (upper arm)
 *   results.pose[23|25|27]                     → { x, y, z } (LEFT hip/knee/ankle)
 *   results.pose[24|26|28]                     → { x, y, z } (RIGHT hip/knee/ankle)
 *   results.hand[0..20]                        → { x, y, z } (full hand)
 *   results.poseAll / results.handAll         → raw arrays for canvas drawing
 *   results.chain                              → single-arm tracking chain (arm + matched hand)
 *   results.legs                               → { left, right } knee chains (for leg sessions)
 *   results.legChain                           → active-side leg chain (hip→knee→ankle)
 */
const VisionLoader = (() => {
  const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
  const BUNDLE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.js";

  let poseLandmarker = null;
  let handLandmarker = null;
  let isRunning = false;
  let onResultsCallback = null;
  let videoElement = null;
  let stream = null;
  let pendingDeviceId = null;
  let rafId = null;
  let lastVideoWidth = 640;
  let lastVideoHeight = 480;

  // --- Dynamic CDN script loading -------------------------------------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  async function ensureBundle() {
    if (typeof window.FilesetResolver !== "undefined") return true;
    try {
      await loadScript(BUNDLE_URL);
      // give the bundle a moment to expose globals
      await new Promise((r) => setTimeout(r, 600));
      return typeof window.FilesetResolver !== "undefined";
    } catch (e) {
      console.error("[VisionLoader] bundle load failed", e);
      return false;
    }
  }

  // --- Model initialization (GPU → CPU fallback) -----------------------
  async function init() {
    if (poseLandmarker && handLandmarker) return true;
    const ready = await ensureBundle();
    if (!ready) return false;

    const base = (delegate) => ({
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate,
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    const handBase = (delegate) => ({
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    try {
      const vision = await window.FilesetResolver.forVisionTasks(WASM_URL);
      poseLandmarker = await window.PoseLandmarker.createFromOptions(vision, base("GPU"));
      handLandmarker = await window.HandLandmarker.createFromOptions(vision, handBase("GPU"));
      return true;
    } catch (e) {
      console.warn("[VisionLoader] GPU init failed, falling back to CPU:", e.message);
      try {
        const vision = await window.FilesetResolver.forVisionTasks(WASM_URL);
        poseLandmarker = await window.PoseLandmarker.createFromOptions(vision, base("CPU"));
        handLandmarker = await window.HandLandmarker.createFromOptions(vision, handBase("CPU"));
        return true;
      } catch (e2) {
        console.error("[VisionLoader] CPU fallback also failed", e2);
        return false;
      }
    }
  }

  // --- Camera lifecycle -------------------------------------------------
  async function start(video, onResults) {
    videoElement = video;
    onResultsCallback = onResults;
    if (isRunning) return true;
    if (!poseLandmarker || !handLandmarker) {
      const ok = await init();
      if (!ok) return false;
    }
    try {
      const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      const deviceId = localStorage.getItem("preferred_camera_id") || undefined;

      const baseVideoConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
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
            frameRate: { ideal: 30 },
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

      if (!stream) throw lastErr || new Error("Failed to access camera");

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
      video.playsInline = true;
      video.muted = true;

      await new Promise((resolve) => {
        if (video.readyState >= 2) return resolve();
        video.onloadedmetadata = () => resolve();
      });
      await video.play().catch(() => {});
      isRunning = true;
      if (window.RehabQA) window.RehabQA.tick();
      loop();
      return true;
    } catch (err) {
      console.error("[VisionLoader] Camera failed:", err);
      let msg = "Camera access error.";
      if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        msg = "Camera permission denied. Allow camera access in your browser.";
      } else if (err && (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")) {
        msg = "No webcam detected on this device.";
      } else if (err && err.name === "NotReadableError") {
        msg = "Camera is locked by another app (Zoom/Teams/another tab).";
      }
      if (typeof alert === "function") alert(msg);
      return false;
    }
  }

  async function stop() {
    isRunning = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (videoElement) { videoElement.srcObject = null; videoElement = null; }
    onResultsCallback = null;
  }

  // --- Frame processing ---------------------------------------------------
  function loop() {
    if (!isRunning) return;
    rafId = requestAnimationFrame(loop);
    if (!videoElement || videoElement.readyState < 2) return;
    try {
      if (videoElement.videoWidth) {
        lastVideoWidth = videoElement.videoWidth;
        lastVideoHeight = videoElement.videoHeight;
      }
      const now = performance.now();
      const results = { pose: null, poseAll: null, hand: null, handAll: null, hand_side: null, chain: null };

      // ---- Pose (mirrored into selfie-view coordinates) ----------------
      try {
        const p = poseLandmarker.detectForVideo(videoElement, now);
        if (p.landmarks && p.landmarks.length > 0) {
          const src = p.landmarks[0];
          results.poseAll = src.map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z || 0 }));
          results.pose = {};
          for (let i = 0; i < src.length; i++) {
            results.pose[i] = { x: 1 - src[i].x, y: src[i].y, z: src[i].z || 0 };
          }
          // Expose lower-body landmarks if the Lite pose model provides them
          // (MediaPipe Pose Lite outputs landmarks 0..22 including hips 23/24,
          // knees 25/26, ankles 27/28). Downstream engines only use what they
          // need; if a landmark is missing the chain is simply not built.
          results.legs = {
            left: { hip: results.pose[23], knee: results.pose[25], ankle: results.pose[27] },
            right: { hip: results.pose[24], knee: results.pose[26], ankle: results.pose[28] },
          };
        }
      } catch (e) { /* pose frame skipped */ }

      // ---- Hand (single hand only — never two simultaneously) ----------
      try {
        const h = handLandmarker.detectForVideo(videoElement, now);
        if (h.landmarks && h.landmarks.length > 0) {
          const src = h.landmarks[0]; // pipeline runs numHands = 1
          results.handAll = src.map((lm) => ({ x: 1 - lm.x, y: lm.y, z: lm.z || 0 }));
          results.hand = {};
          for (let i = 0; i < src.length; i++) {
            results.hand[i] = { x: 1 - src[i].x, y: src[i].y, z: src[i].z || 0 };
          }
          results.hand_side = (results.hand[17].x < results.hand[5].x) ? "right" : "left";
        }
      } catch (e) { /* hand frame skipped */ }

      // ---- Single tracking chain: ONE arm (shoulder→elbow→wrist) + the ----
      // ---- ONE tracked hand matched to that wrist (no second skeleton) ----
      // ---- Single tracking chain: ONE arm (shoulder→elbow→wrist) + the ----
      // ---- ONE tracked hand matched to that wrist (no second skeleton) ----
      if (results.pose) {
        let shIdx = 12; // right arm default
        if (results.hand && results.hand[0]) {
          const hw = results.hand[0];
          const dL = results.pose[15] ? Math.hypot(hw.x - results.pose[15].x, hw.y - results.pose[15].y) : 9;
          const dR = results.pose[16] ? Math.hypot(hw.x - results.pose[16].x, hw.y - results.pose[16].y) : 9;
          shIdx = dR <= dL ? 12 : 11;
        } else {
          // No hand visible: prefer the arm nearer the screen centre for a
          // single clean skeleton instead of drawing both arms
          const c = 0.5;
          const dl = results.pose[15] ? Math.abs(results.pose[15].x - c) : 9;
          const dr = results.pose[16] ? Math.abs(results.pose[16].x - c) : 9;
          shIdx = dr <= dl ? 12 : 11;
        }
        const sh = results.pose[shIdx], el = results.pose[shIdx + 2], wr = results.pose[shIdx + 4];
        if (sh && el && wr) {
          results.chain = {
            side: shIdx === 12 ? "right" : "left",
            sh, el, wr,
            hasHand: !!(results.hand && results.hand[8]),
          };
        }
      }

      // ---- Active-side leg chain (hip → knee → ankle) with a muted ----
      // ---- inactive-side copy for the single-card leg routine. The ----
      // ---- active side is picked the same way the arm chain is: by ----
      // ---- proximity to the visible hand/centre of frame. ----
      if (results.legs) {
        const pickSide = () => {
          if (results.hand && results.hand[0]) {
            const hw = results.hand[0];
            const dL = results.legs.left.hip ? Math.hypot(hw.x - results.legs.left.hip.x, hw.y - results.legs.left.hip.y) : 9;
            const dR = results.legs.right.hip ? Math.hypot(hw.x - results.legs.right.hip.x, hw.y - results.legs.right.hip.y) : 9;
            return dR <= dL ? "right" : "left";
          }
          // No hand: prefer the leg nearer the centre of frame
          const c = 0.5;
          const dl = results.legs.left.hip ? Math.abs(results.legs.left.hip.x - c) : 9;
          const dr = results.legs.right.hip ? Math.abs(results.legs.right.hip.x - c) : 9;
          return dr <= dl ? "right" : "left";
        };
        const side = pickSide();
        const a = results.legs[side].hip, b = results.legs[side].knee, c2 = results.legs[side].ankle;
        if (a && b && c2) {
          results.legChain = { side, hip: a, knee: b, ankle: c2 };
        }
      }
      if (onResultsCallback) onResultsCallback(results);
      if (window.RehabQA) window.RehabQA.tick();
    } catch (e) {
      console.error("[VisionLoader] frame error", e);
    }
  }

  // --- Watchdog: restart pipeline if the loop stalls > 2s ---------------
  function watch(onStall) {
    if (window.RehabQA) {
      window.RehabQA.watch(() => {
        console.warn("[VisionLoader] Frame stall detected — restarting camera pipeline (no reload)");
        const wasRunning = isRunning;
        if (wasRunning) stop();
        // Restart from a fresh stream after models are ready
        setTimeout(() => {
          if (onStall) onStall();
          else if (wasRunning && videoElement && onResultsCallback) {
            start(videoElement, onResultsCallback);
          }
        }, 250);
      });
    }
  }

  // --- Camera device switching from the clinical top bar ------------------
  window.addEventListener("rehab-camera-change", (e) => {
    pendingDeviceId = e.detail && e.detail.deviceId;
    if (isRunning && videoElement && onResultsCallback) {
      stop();
      setTimeout(() => start(videoElement, onResultsCallback), 200);
    }
  });

  function getVideoSize() {
    return { width: lastVideoWidth, height: lastVideoHeight };
  }

  return {
    init, start, stop, watch, getVideoSize,
    isRunning: () => isRunning,
  };
})();

window.VisionLoader = window.VisionLoader || VisionLoader;
