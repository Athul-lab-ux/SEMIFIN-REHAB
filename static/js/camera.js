/**
 * RehabOpt AR — Hardened Client Camera Controller
 * Handles mobile constraints, permission revocations, and camera flips
 */
class RehabCamera {
  constructor(videoElementId, onFrameCallback) {
    this.video = document.getElementById(videoElementId);
    this.onFrame = onFrameCallback;
    this.stream = null;
    this.isProcessing = false;
    this.animationId = null;
  }

  async initialize(preferredDeviceId) {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      alert(
        "CRITICAL: Camera API unavailable. Ensure you are accessing via HTTPS or localhost."
      );
      return false;
    }

    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    let savedDeviceId = (typeof preferredDeviceId !== "undefined" && preferredDeviceId)
      ? preferredDeviceId
      : (localStorage.getItem("preferred_camera_id") || null);

    if (savedDeviceId === "null" || savedDeviceId === "undefined") {
      savedDeviceId = null;
    }

    const baseVideoConstraints = savedDeviceId
      ? { deviceId: { exact: savedDeviceId } }
      : { facingMode: "user" };

    const candidateConstraints = [
      // 1. Preferred constraints (with deviceId or facingMode)
      {
        audio: false,
        video: {
          ...baseVideoConstraints,
          width: { ideal: isMobile ? 480 : 640 },
          height: { ideal: isMobile ? 640 : 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      },
      // 2. Generic user-facing camera fallback
      {
        audio: false,
        video: {
          facingMode: "user",
          frameRate: { ideal: 30 },
        },
      },
      // 3. Fallback without facingMode (needed on Windows/USB webcams)
      {
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      },
      // 4. Resilient fallback to any available video stream
      {
        audio: false,
        video: true,
      },
    ];

    let stream = null;
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
      this.handleError(lastErr || new Error("Failed to initialize video stream"));
      return false;
    }

    this.stream = stream;
    this.video.srcObject = this.stream;

    // Mandatory attributes for iOS Safari inline playback (prevents fullscreen takeover)
    this.video.setAttribute("playsinline", "true");
    this.video.setAttribute("webkit-playsinline", "true");
    this.video.setAttribute("autoplay", "true");
    this.video.setAttribute("muted", "true");
    this.video.playsInline = true;
    this.video.muted = true;

    try {
      await this.video.play();
    } catch (e) {
      // ignore play rejection if browser enforces user gesture
    }

    this.startLoop();

    // Listen for camera switch events from top bar
    if (!this._listenerBound) {
      this._listenerBound = true;
      window.addEventListener("rehab-camera-change", async (e) => {
        if (e.detail && e.detail.deviceId) {
          this.stop();
          await this.initialize(e.detail.deviceId);
        }
      });
    }

    return true;
  }

  startLoop() {
    this.isProcessing = true;
    const loop = async () => {
      if (!this.isProcessing) return;
      try {
        if (this.video && this.video.readyState >= 2 && this.onFrame) {
          await this.onFrame(this.video);
        }
      } catch (err) {
        console.warn("[RehabCamera] onFrame error:", err);
      }
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    this.isProcessing = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  handleError(err) {
    console.error("Camera Error:", err);
    let msg = "Camera access error.";
    if (
      err.name === "NotAllowedError" ||
      err.name === "PermissionDeniedError"
    ) {
      msg =
        "Camera permission denied. Click the lock/camera icon in your address bar and grant access.";
    } else if (
      err.name === "NotFoundError" ||
      err.name === "DevicesNotFoundError"
    ) {
      msg = "No webcam hardware detected on this device.";
    } else if (err.name === "NotReadableError") {
      msg =
        "Camera is currently locked by another application (Zoom, Teams, or another browser tab).";
    }
    alert(msg);
  }
}
