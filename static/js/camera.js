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

  async initialize() {
    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      alert(
        "CRITICAL: Camera API unavailable. Ensure you are accessing via HTTPS or localhost."
      );
      return false;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;

      // Mandatory attributes for iOS Safari inline playback
      this.video.setAttribute("playsinline", "true");
      this.video.setAttribute("webkit-playsinline", "true");
      this.video.setAttribute("autoplay", "true");
      this.video.setAttribute("muted", "true");

      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          resolve();
        };
      });

      this.startLoop();
      return true;
    } catch (err) {
      this.handleError(err);
      return false;
    }
  }

  startLoop() {
    this.isProcessing = true;
    const loop = async () => {
      if (!this.isProcessing) return;
      if (this.video.readyState >= 2 && this.onFrame) {
        await this.onFrame(this.video);
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
