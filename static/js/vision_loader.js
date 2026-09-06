/**
 * RehabOpt AR — Vision Loader (dual Pose + Hand, tasks-vision 0.10.14)
 * ------------------------------------------------------------------
 * Modern MediaPipe pipeline that returns BOTH pose and hand landmarks
 * on every frame — ported from the reference repository and hardened
 * with the QA watchdog (frame stall → pipeline restart, no reload).
 *
 * Landmark access patterns (matching session engines):
 *   results.pose[11|12|13|14|15|16]  → { x, y, z } (shoulder/elbow/wrist)
 *   results.hand[0..20]              → { x, y, z } (full hand)
 *   results.poseAll / results.handAll → raw arrays for canvas drawing
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
      const deviceId = localStorage.getItem("preferred_camera_id") || undefined;
      const constraints = {
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId }, facingMode: "user" }
          : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
      };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
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
      const results = { pose: null, poseAll: null, hand: null, handAll: null, hand_side: null };
      try {
        const p = poseLandmarker.detectForVideo(videoElement, now);
        if (p.landmarks && p.landmarks.length > 0) {
          results.poseAll = p.landmarks[0];
          results.pose = {};
          for (let i = 0; i < p.landmarks[0].length; i++) {
            results.pose[i] = { x: p.landmarks[0][i].x, y: p.landmarks[0][i].y, z: p.landmarks[0][i].z || 0 };
          }
        }
      } catch (e) { /* pose frame skipped */ }
      try {
        const h = handLandmarker.detectForVideo(videoElement, now);
        if (h.landmarks && h.landmarks.length > 0) {
          results.handAll = h.landmarks[0];
          results.hand = {};
          for (let i = 0; i < h.landmarks[0].length; i++) {
            results.hand[i] = { x: h.landmarks[0][i].x, y: h.landmarks[0][i].y, z: h.landmarks[0][i].z || 0 };
          }
          const lm = h.landmarks[0];
          results.hand_side = (lm[17].x < lm[5].x) ? "right" : "left";
        }
      } catch (e) { /* hand frame skipped */ }
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
