/**
 * RehabOpt AR — Session 3: Neon Air-Canvas Engine
 * --------------------------------------------------------------------------
 * Gestures:
 *  - 1 Finger Open (Index): Draw or pick color / clear / rub with index finger
 *  - 2 Fingers Open (Index + Middle): Stop drawing (pen lift) & pointer click (Start/Stop/Pause/Resume)
 *  - 3 Fingers Open (Index + Middle + Ring): Move / Pan drawing across screen
 *  - Full Hand Open (4-5 Fingers): Continue drawing
 *  - 4s Countdown: On Start and Resume before drawing is active
 */
document.addEventListener("DOMContentLoaded", async () => {
  const video = document.getElementById("video");
  const drawCanvas = document.getElementById("draw-canvas");
  const drawCtx = drawCanvas.getContext("2d");
  const handCanvas = document.getElementById("hand-canvas");
  const handCtx = handCanvas.getContext("2d");

  // HUD & Info elements
  const accuracyEl = document.getElementById("accuracy-display");
  const toolEl = document.getElementById("tool-display");
  const modeEl = document.getElementById("mode-display");
  const toast = document.getElementById("toast");

  // Controls elements
  const btnStart = document.getElementById("canvas-start-btn");
  const btnPause = document.getElementById("canvas-pause-btn");
  const btnResume = document.getElementById("canvas-resume-btn");
  const btnStop = document.getElementById("canvas-stop-btn");
  const modalResume = document.getElementById("modal-canvas-resume");
  const modalStop = document.getElementById("modal-canvas-stop");
  const rubBtn = document.getElementById("rub-btn");
  const clearBtn = document.getElementById("clear-btn");

  // State
  let sessionActive = false;
  let sessionPaused = false;
  let isEraser = false;
  let isDrawing = false;
  let lastPoint = null;
  let panLastPoint = null;
  let currentTemplate = "freeform";
  let currentColor = "#00ff88";
  let brushSize = 6; // Default 6px (range 2px - 24px)
  let templatePoints = [];
  let accuracy = 100;
  let totalError = 0;
  let errorCount = 0;
  let sessionStartTime = 0;

  // Extra 30% Engineering: 3-Frame Hysteresis Debounce & EMA Landmark Smoothing
  let gestureHistory = [];
  let activeGesture = "IDLE";
  let smoothedPoint = null;

  // Brush Slider Elements
  const bsrTrack = document.getElementById("bsr-track");
  const bsrFill = document.getElementById("bsr-fill");
  const bsrThumb = document.getElementById("bsr-thumb");
  const bsrVal = document.getElementById("bsr-val");
  const btnCam = document.getElementById("canvas-cam-btn");
  const btnMirror = document.getElementById("canvas-mirror-btn");
  let canvasCamera = null;
  let cameraActive = true;
  let isMirrored = localStorage.getItem("rehab_mirror_mode") !== "inverted"; // default natural (left = left)
  let panBufferCanvas = null;

  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17],            // Palm knuckle base
  ];

  function updateMirrorUI() {
    const v = document.getElementById("video");
    if (v) v.style.transform = isMirrored ? "scaleX(-1)" : "scaleX(1)";
    if (btnMirror) {
      btnMirror.textContent = isMirrored ? "🪞 Mirror: Natural" : "🪞 Mirror: Inverted";
    }
  }
  updateMirrorUI();

  if (btnMirror) {
    btnMirror.addEventListener("click", () => {
      isMirrored = !isMirrored;
      try {
        localStorage.setItem("rehab_mirror_mode", isMirrored ? "natural" : "inverted");
      } catch (e) {}
      updateMirrorUI();
      showToast(isMirrored ? "🪞 Mirror: Natural (Left = Left)" : "🪞 Mirror: Inverted", "info");
    });
  }

  function setBrushSize(size) {
    brushSize = Math.max(2, Math.min(24, Math.round(size)));
    const pct = ((brushSize - 2) / (24 - 2)) * 100;
    if (bsrFill) bsrFill.style.height = `${pct}%`;
    if (bsrThumb) bsrThumb.style.top = `${pct}%`;
    if (bsrVal) bsrVal.textContent = `${brushSize}px`;
    document.querySelectorAll(".inair-size-btn").forEach((b) => {
      const bsz = parseInt(b.dataset.size, 10);
      b.classList.toggle("active", Math.abs(bsz - brushSize) <= 3);
    });
  }
  setBrushSize(6);

  // Mouse / Touch click on brush slider
  if (bsrTrack) {
    const handleSliderTrack = (e) => {
      const rect = bsrTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setBrushSize(2 + ratio * (24 - 2));
    };
    bsrTrack.addEventListener("pointerdown", handleSliderTrack);
    bsrTrack.addEventListener("pointermove", (e) => { if (e.buttons === 1) handleSliderTrack(e); });
  }

  // Dwell-click hover state
  let hoverBtn = null;
  let hoverStart = 0;
  const DWELL_CLICK_TIME = 450; // 0.45s dwell ring fill for clinical responsiveness

  const TEMPLATES = {
    freeform: { name: "✨ Custom", points: [] },
    line: { name: "📏 Line", points: generateLine() },
    circle: { name: "⭕ Circle", points: generateCircle(0.38) },
    square: { name: "⬜ Square", points: generateSquare(0.32) },
    infinity: { name: "∞ Infinity", points: generateInfinity() },
    triangle: { name: "🔺 Triangle", points: generateTriangle() },
    spiral: { name: "🌀 Spiral", points: generateSpiral() },
    star: { name: "⭐ Star", points: generateStar() },
    figure8: { name: "8 Figure-8", points: generateFigure8() },
    sine: { name: "〰️ Sine Wave", points: generateSine() },
    zigzag: { name: "⚡ Zig-zag", points: generateZigzag() },
  };

  // --- Template Generators ---
  function generateLine() {
    const pts = [];
    for (let i = 0; i <= 100; i++) pts.push({ x: 0.2 + (i / 100) * 0.6, y: 0.5 });
    return pts;
  }
  function generateCircle(r) {
    const pts = [];
    const cx = 0.5, cy = 0.5;
    for (let a = 0; a <= Math.PI * 2; a += 0.05) {
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }
  function generateSquare(s) {
    const pts = [];
    const cx = 0.5, cy = 0.5, h = s;
    for (let i = 0; i <= 20; i++) pts.push({ x: cx - h + (2 * h * i) / 20, y: cy - h });
    for (let i = 0; i <= 20; i++) pts.push({ x: cx + h, y: cy - h + (2 * h * i) / 20 });
    for (let i = 0; i <= 20; i++) pts.push({ x: cx + h - (2 * h * i) / 20, y: cy + h });
    for (let i = 0; i <= 20; i++) pts.push({ x: cx - h, y: cy + h - (2 * h * i) / 20 });
    return pts;
  }
  function generateInfinity() {
    const pts = [];
    for (let t = 0; t <= Math.PI * 2; t += 0.04) {
      const denom = 1 + Math.sin(t) * Math.sin(t);
      pts.push({ x: 0.5 + (0.25 * Math.cos(t)) / denom, y: 0.5 + (0.25 * Math.sin(t) * Math.cos(t)) / denom });
    }
    return pts;
  }
  function generateTriangle() {
    return [{ x: 0.5, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.2 }];
  }
  function generateSpiral() {
    const pts = [];
    for (let t = 0; t <= Math.PI * 4; t += 0.08) {
      const r = 0.05 + t * 0.035;
      pts.push({ x: 0.5 + r * Math.cos(t), y: 0.5 + r * Math.sin(t) });
    }
    return pts;
  }
  function generateStar() {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? 0.3 : 0.12;
      pts.push({ x: 0.5 + r * Math.cos(angle), y: 0.5 + r * Math.sin(angle) });
    }
    pts.push(pts[0]);
    return pts;
  }
  function generateFigure8() {
    const pts = [];
    for (let t = 0; t <= Math.PI * 2; t += 0.04) {
      pts.push({ x: 0.5 + 0.25 * Math.sin(t), y: 0.5 + 0.2 * Math.sin(2 * t) });
    }
    return pts;
  }
  function generateSine() {
    const pts = [];
    for (let i = 0; i <= 100; i++) pts.push({ x: 0.1 + (i / 100) * 0.8, y: 0.5 + 0.15 * Math.sin(i * 0.12) });
    return pts;
  }
  function generateZigzag() {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push({ x: 0.1 + (i / 10) * 0.8, y: i % 2 === 0 ? 0.3 : 0.7 });
    return pts;
  }

  // --- Resize ---
  function resizeCanvas() {
    const parent = drawCanvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    // Preserve content across resize
    const tmp = document.createElement("canvas");
    tmp.width = drawCanvas.width;
    tmp.height = drawCanvas.height;
    if (tmp.width > 0 && tmp.height > 0) {
      tmp.getContext("2d").drawImage(drawCanvas, 0, 0);
    }
    drawCanvas.width = w;
    drawCanvas.height = h;
    handCanvas.width = w;
    handCanvas.height = h;
    if (tmp.width > 0 && tmp.height > 0) {
      drawCtx.drawImage(tmp, 0, 0);
    }
    drawTemplate();
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 150);
  });
  resizeCanvas();

  // --- Toast ---
  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 2800);
  }

  // --- 4-second Countdown Overlay ---
  let canvasCountdownTimer = null;
  function runCanvasCountdown(label, seconds, onComplete) {
    const overlay = document.getElementById("aircanvas-countdown-overlay");
    const numEl = document.getElementById("canvas-aco-num");
    const labEl = document.getElementById("canvas-aco-label");
    if (!overlay || !numEl) {
      if (onComplete) onComplete();
      return;
    }
    if (canvasCountdownTimer) clearInterval(canvasCountdownTimer);
    let remaining = seconds;
    labEl.textContent = label;
    numEl.textContent = remaining;
    overlay.classList.add("show");
    if (window.RehabBio) window.RehabBio.speak(`${label}. ${remaining}`);

    canvasCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        numEl.textContent = remaining;
        if (window.RehabBio) window.RehabBio.speak(`${remaining}`);
      } else {
        clearInterval(canvasCountdownTimer);
        canvasCountdownTimer = null;
        numEl.textContent = "DRAW!";
        if (window.RehabBio) window.RehabBio.speak("Draw!");
        setTimeout(() => {
          overlay.classList.remove("show");
          if (onComplete) onComplete();
        }, 500);
      }
    }, 1000);
  }

  // --- Session Controls Synchronization ---
  function updateSessionButtons(state) {
    const inairStart = document.getElementById("inair-start-btn");
    const inairPause = document.getElementById("inair-pause-btn");
    const inairResume = document.getElementById("inair-resume-btn");
    const inairStop = document.getElementById("inair-stop-btn");

    if (state === "running") {
      btnStart.style.display = "none";
      btnPause.style.display = "inline-flex";
      btnResume.style.display = "none";
      btnStop.style.display = "inline-flex";
      if (inairStart) inairStart.style.display = "none";
      if (inairPause) inairPause.style.display = "inline-flex";
      if (inairResume) inairResume.style.display = "none";
      if (inairStop) inairStop.style.display = "inline-flex";
    } else if (state === "paused") {
      btnPause.style.display = "none";
      btnResume.style.display = "inline-flex";
      if (inairPause) inairPause.style.display = "none";
      if (inairResume) inairResume.style.display = "inline-flex";
    } else {
      // idle / stopped
      btnStart.style.display = "inline-flex";
      btnPause.style.display = "none";
      btnResume.style.display = "none";
      btnStop.style.display = "none";
      if (inairStart) inairStart.style.display = "inline-flex";
      if (inairPause) inairPause.style.display = "none";
      if (inairResume) inairResume.style.display = "none";
      if (inairStop) inairStop.style.display = "none";
    }
  }

  async function startDrawingSession() {
    if (!cameraActive) {
      await initCamera();
    }
    runCanvasCountdown("STARTING IN", 5, () => {
      sessionActive = true;
      sessionPaused = false;
      sessionStartTime = Date.now();
      updateSessionButtons("running");
      showToast("🎨 Session Active — Draw with Open Hand!", "success");
    });
  }

  function pauseDrawingSession() {
    if (!sessionActive || sessionPaused) return;
    sessionPaused = true;
    lastPoint = null;
    panLastPoint = null;
    document.getElementById("aircanvas-paused-overlay").classList.add("show");
    updateSessionButtons("paused");
    if (window.RehabBio) window.RehabBio.speak("Drawing paused");
  }

  function resumeDrawingSession() {
    document.getElementById("aircanvas-paused-overlay").classList.remove("show");
    runCanvasCountdown("RESUMING IN", 5, () => {
      sessionPaused = false;
      updateSessionButtons("running");
      showToast("▶ Drawing Resumed!", "info");
    });
  }

  async function stopDrawingSession() {
    const elapsed = sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 1000) : 0;
    sessionActive = false;
    sessionPaused = false;
    lastPoint = null;
    panLastPoint = null;

    document.getElementById("aircanvas-paused-overlay").classList.remove("show");
    document.getElementById("aircanvas-countdown-overlay").classList.remove("show");
    updateSessionButtons("idle");

    // Turn off camera hardware LED when session stops
    if (cameraActive) {
      if (canvasCamera) canvasCamera.stop();
      const v = document.getElementById("video");
      if (v && v.srcObject) {
        try {
          v.srcObject.getTracks().forEach((t) => t.stop());
        } catch (e) {}
        v.srcObject = null;
      }
      cameraActive = false;
      if (btnCam) {
        btnCam.textContent = "📷 Camera: OFF";
        btnCam.classList.add("danger");
      }
    }

    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "AIR_CANVAS",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: Math.max(1, elapsed),
          peak_rom: 85,
          smoothness_score: Math.min(100, accuracy),
          cheats_blocked: 0,
          score: accuracy,
          metrics_json: JSON.stringify({ template: currentTemplate, accuracy, duration: elapsed }),
        }),
      });
      showToast(`📊 Session Saved! Accuracy: ${accuracy}%`, "success");
    } catch (e) {
      console.error("Telemetry error", e);
    }
  }

  btnStart.addEventListener("click", startDrawingSession);
  btnPause.addEventListener("click", pauseDrawingSession);
  btnResume.addEventListener("click", resumeDrawingSession);
  btnStop.addEventListener("click", stopDrawingSession);
  modalResume.addEventListener("click", resumeDrawingSession);
  modalStop.addEventListener("click", stopDrawingSession);

  // Dedicated Camera ON / OFF Toggle Button
  if (btnCam) {
    btnCam.addEventListener("click", async () => {
      if (cameraActive) {
        if (canvasCamera) canvasCamera.stop();
        const v = document.getElementById("video");
        if (v && v.srcObject) {
          try {
            v.srcObject.getTracks().forEach((t) => t.stop());
          } catch (e) {}
          v.srcObject = null;
        }
        cameraActive = false;
        btnCam.textContent = "📷 Camera: OFF";
        btnCam.classList.add("danger");
        showToast("📷 Camera paused to save CPU/battery", "info");
      } else {
        await initCamera();
        cameraActive = true;
        btnCam.textContent = "📷 Camera: ON";
        btnCam.classList.remove("danger");
        showToast("📷 Camera resumed", "success");
      }
    });
  }

  // --- Dwell Pointer Hover / Click Mode ---
  // --- Dwell Pointer Hover / Click Mode ---
  function checkHoverInteract(tip) {
    const rect = drawCanvas.getBoundingClientRect();
    const screenX = rect.left + tip.x * rect.width;
    const screenY = rect.top + tip.y * rect.height;

    // Highlight pointer position with glowing target ring
    handCtx.beginPath();
    handCtx.arc(tip.x * handCanvas.width, tip.y * handCanvas.height, 12, 0, Math.PI * 2);
    handCtx.strokeStyle = "#00CCFF";
    handCtx.lineWidth = 3;
    handCtx.stroke();

    let target = null;
    const el = document.elementFromPoint(screenX, screenY);
    if (el) {
      target = el.closest(".inair-btn, .c-ctrl-btn, .color-btn, .palette-tool, .template-btn, .btn-cam-toggle");
    }
    if (!target) {
      // Direct bounding box fallback for .inair-btn and touchless buttons
      const candidates = document.querySelectorAll(".inair-btn, .c-ctrl-btn, .template-btn");
      for (const btn of candidates) {
        if (btn.offsetParent === null) continue;
        const bRect = btn.getBoundingClientRect();
        if (screenX >= bRect.left && screenX <= bRect.right && screenY >= bRect.top && screenY <= bRect.bottom) {
          target = btn;
          break;
        }
      }
    }

    if (hoverBtn && hoverBtn !== target) {
      hoverBtn.classList.remove("hovered");
    }

    if (target && target !== hoverBtn) {
      hoverBtn = target;
      hoverBtn.classList.add("hovered");
      hoverStart = Date.now();
    } else if (target && target === hoverBtn) {
      hoverBtn.classList.add("hovered");
      const elapsed = Date.now() - hoverStart;
      const progress = Math.min(1, elapsed / DWELL_CLICK_TIME);

      // Dwell circle fill around fingertip
      handCtx.beginPath();
      handCtx.arc(tip.x * handCanvas.width, tip.y * handCanvas.height, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      handCtx.strokeStyle = "#10B981";
      handCtx.lineWidth = 4;
      handCtx.stroke();

      if (elapsed >= DWELL_CLICK_TIME) {
        hoverBtn.click();
        hoverBtn.classList.remove("hovered");
        if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
          window.RehabBio.playBeep(880, 0.08, 0.3);
        } else {
          try {
            const actx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = actx.createOscillator();
            const g = actx.createGain();
            osc.connect(g);
            g.connect(actx.destination);
            osc.frequency.setValueAtTime(880, actx.currentTime);
            g.gain.setValueAtTime(0.2, actx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.08);
            osc.start();
            osc.stop(actx.currentTime + 0.08);
          } catch (e) {}
        }
        hoverBtn = null;
        hoverStart = Date.now() + 800; // prevent rapid re-triggering
      }
    } else {
      if (hoverBtn) hoverBtn.classList.remove("hovered");
      hoverBtn = null;
    }
  }

  // --- Gesture Detection Helper ---
  function getFingerStatus(lm) {
    // MediaPipe Hand Landmark indexes:
    // 8: Index tip, 6: Index PIP
    // 12: Middle tip, 10: Middle PIP
    // 16: Ring tip, 14: Ring PIP
    // 20: Pinky tip, 18: Pinky PIP
    const indexOpen = lm[8].y < lm[6].y;
    const middleOpen = lm[12].y < lm[10].y;
    const ringOpen = lm[16].y < lm[14].y;
    const pinkyOpen = lm[20].y < lm[18].y;

    // Thumb extended check
    const thumbDistTip = Math.hypot(lm[4].x - lm[0].x, lm[4].y - lm[0].y);
    const thumbDistIP = Math.hypot(lm[3].x - lm[0].x, lm[3].y - lm[0].y);
    const thumbOpen = thumbDistTip > thumbDistIP * 1.15;

    const openCount = (indexOpen ? 1 : 0) + (middleOpen ? 1 : 0) +
                      (ringOpen ? 1 : 0) + (pinkyOpen ? 1 : 0) +
                      (thumbOpen ? 1 : 0);

    return { thumbOpen, indexOpen, middleOpen, ringOpen, pinkyOpen, openCount };
  }

  // --- Camera & MediaPipe Hands ---
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onHandResults);

  async function initCamera() {
    canvasCamera = new RehabCamera("video", async (videoEl) => {
      await hands.send({ image: videoEl });
    });
    const ok = await canvasCamera.initialize();
    if (ok) {
      cameraActive = true;
      if (btnCam) {
        btnCam.textContent = "📷 Camera: ON";
        btnCam.classList.remove("danger");
      }
      showToast("✅ Camera active — raise your hand to begin!", "success");
    }
  }

  // --- Hand Frame Processing ---
  function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      isDrawing = false;
      lastPoint = null;
      panLastPoint = null;
      smoothedPoint = null;
      gestureHistory = [];
      handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
      return;
    }

    // Map landmarks based on mirror mode (P7: Natural Left = Left)
    const lm = results.multiHandLandmarks[0].map((p) => ({
      x: isMirrored ? (1 - p.x) : p.x,
      y: p.y,
      z: p.z || 0,
    }));
    const rawTip = lm[8];

    // EMA Landmark Smoothing: alpha = 0.35
    if (!smoothedPoint) {
      smoothedPoint = { x: rawTip.x, y: rawTip.y };
    } else {
      smoothedPoint.x = smoothedPoint.x * 0.65 + rawTip.x * 0.35;
      smoothedPoint.y = smoothedPoint.y * 0.65 + rawTip.y * 0.35;
    }

    const px = smoothedPoint.x * drawCanvas.width;
    const py = smoothedPoint.y * drawCanvas.height;
    const currentPoint = { x: px, y: py, nx: smoothedPoint.x, ny: smoothedPoint.y };

    const f = getFingerStatus(lm);

    // Raw gesture classification
    let rawGesture = "IDLE";
    if (f.indexOpen && f.middleOpen && f.ringOpen && !f.pinkyOpen) {
      rawGesture = "MOVE";
    } else if (f.indexOpen && !f.ringOpen && !f.pinkyOpen) {
      rawGesture = "POINTER";
    } else if (f.openCount >= 4) {
      rawGesture = "DRAW";
    } else {
      rawGesture = "IDLE";
    }

    // 3-Frame Hysteresis Debounce (Prevents mode flickering/clashes)
    gestureHistory.push(rawGesture);
    if (gestureHistory.length > 3) gestureHistory.shift();

    const counts = {};
    for (const g of gestureHistory) counts[g] = (counts[g] || 0) + 1;
    for (const g of ["MOVE", "POINTER", "DRAW", "IDLE"]) {
      if ((counts[g] || 0) >= 2) {
        activeGesture = g;
        break;
      }
    }

    // =========================================================================
    // 1. Gesture Mode Evaluation (User Mandated Rules)
    // =========================================================================

    // RULE 1: 3 Fingers Open -> Move / Pan Drawing
    if (activeGesture === "MOVE") {
      if (modeEl) modeEl.textContent = "🤟 Mode: MOVE DRAWING";
      lastPoint = null;
      isDrawing = false;
      if (panLastPoint) {
        const dx = px - panLastPoint.x;
        const dy = py - panLastPoint.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          if (!panBufferCanvas) {
            panBufferCanvas = document.createElement("canvas");
          }
          if (panBufferCanvas.width !== drawCanvas.width || panBufferCanvas.height !== drawCanvas.height) {
            panBufferCanvas.width = drawCanvas.width;
            panBufferCanvas.height = drawCanvas.height;
          }
          const bufCtx = panBufferCanvas.getContext("2d");
          bufCtx.clearRect(0, 0, panBufferCanvas.width, panBufferCanvas.height);
          bufCtx.drawImage(drawCanvas, 0, 0);
          drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
          drawTemplate();
          drawCtx.drawImage(panBufferCanvas, dx, dy);
        }
      }
      panLastPoint = { x: px, y: py };
      drawHandSkeleton(lm, "#A855F7");
      return;
    }
    panLastPoint = null;

    // RULE 2: Pointing Gesture or Top Dock Area -> Stop Drawing & Touchless In-Air Controls Mode
    const inDockArea = smoothedPoint.y < 0.22;
    if (inDockArea || activeGesture === "POINTER" || (f.indexOpen && !f.ringOpen && !f.pinkyOpen && activeGesture !== "MOVE")) {
      if (modeEl) modeEl.textContent = "✌️ Mode: TOUCHLESS CONTROLS";
      lastPoint = null;
      isDrawing = false;

      // Check if hovering over left brush slider rail
      if (smoothedPoint.x < 0.16 && !inDockArea) {
        // Map y from 0.15 (top) to 0.85 (bottom)
        const ratio = Math.max(0, Math.min(1, (smoothedPoint.y - 0.15) / 0.70));
        const newSize = Math.round(2 + ratio * (24 - 2));
        setBrushSize(newSize);

        // Visual feedback on handCanvas
        handCtx.beginPath();
        handCtx.arc(px, py, newSize, 0, Math.PI * 2);
        handCtx.strokeStyle = "#38BDF8";
        handCtx.lineWidth = 3;
        handCtx.stroke();

        handCtx.fillStyle = "#FFFFFF";
        handCtx.font = "bold 13px Inter, sans-serif";
        handCtx.fillText(`Size: ${newSize}px`, px + 16, py + 5);
      } else {
        // In-air dock buttons and top toolbar touchless dwell pointer
        checkHoverInteract(smoothedPoint);
      }

      drawHandSkeleton(lm, "#00CCFF");
      return;
    }

    // RULE 3: Full Hand Open (4 or 5 Fingers) -> Continuous Drawing
    if (activeGesture === "DRAW") {
      const modeLabel = isEraser ? "🧽 Mode: RUB / ERASER" : `🖐️ Mode: FULL HAND DRAW (${brushSize}px)`;
      if (modeEl) modeEl.textContent = modeLabel;

      if (!sessionActive || sessionPaused) {
        lastPoint = null;
        drawHandSkeleton(lm, "#94A3B8");
        return;
      }

      if (lastPoint) {
        if (isEraser) {
          drawCtx.save();
          drawCtx.globalCompositeOperation = "destination-out";
          drawCtx.beginPath();
          drawCtx.arc(px, py, brushSize * 2.5 + 8, 0, Math.PI * 2);
          drawCtx.fill();
          drawCtx.restore();
          if (templatePoints.length > 0) drawTemplate();
        } else {
          drawCtx.beginPath();
          drawCtx.moveTo(lastPoint.x, lastPoint.y);
          drawCtx.lineTo(px, py);
          drawCtx.strokeStyle = currentColor;
          drawCtx.lineWidth = brushSize;
          drawCtx.shadowColor = currentColor;
          drawCtx.shadowBlur = Math.min(8, brushSize + 2);
          drawCtx.lineCap = "round";
          drawCtx.lineJoin = "round";
          drawCtx.stroke();
          drawCtx.shadowBlur = 0;

          if (templatePoints.length > 0) updateAccuracy(currentPoint);
        }
      }
      lastPoint = currentPoint;
      drawHandSkeleton(lm, isEraser ? "#FF4444" : currentColor);
      return;
    }

    // RULE 4: IDLE / Lifted
    if (modeEl) modeEl.textContent = "⏸️ Mode: IDLE / LIFTED";
    lastPoint = null;
    drawHandSkeleton(lm, "#64748B");
  }

  // --- Hand Skeleton Visualizer (Exact 6M Reference: Bright Green bones #00FF00, Red dots #FF0000) ---
  function drawHandSkeleton(lm, color) {
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    const w = handCanvas.width;
    const h = handCanvas.height;

    // 1. Bones: Bright Green (#00FF00)
    handCtx.strokeStyle = "#00FF00";
    handCtx.lineWidth = 2.5;
    handCtx.lineCap = "round";
    handCtx.lineJoin = "round";
    handCtx.globalAlpha = 0.95;
    HAND_CONNECTIONS.forEach(([a, b]) => {
      if (lm[a] && lm[b]) {
        handCtx.beginPath();
        handCtx.moveTo(lm[a].x * w, lm[a].y * h);
        handCtx.lineTo(lm[b].x * w, lm[b].y * h);
        handCtx.stroke();
      }
    });
    handCtx.globalAlpha = 1.0;

    // 2. All 21 Joint Landmarks: RED DOTS (#FF0000)
    for (let i = 0; i < 21; i++) {
      const p = lm[i];
      if (!p) continue;
      const px = p.x * w;
      const py = p.y * h;

      handCtx.beginPath();
      handCtx.arc(px, py, 4.5, 0, Math.PI * 2);
      handCtx.fillStyle = "#FF0000";
      handCtx.fill();
      handCtx.strokeStyle = "#FFFFFF";
      handCtx.lineWidth = 1;
      handCtx.stroke();

      if (i === 8) {
        // Landmark 8: Index fingertip stylus ring
        handCtx.beginPath();
        handCtx.arc(px, py, isEraser ? 16 : 10, 0, Math.PI * 2);
        handCtx.strokeStyle = color || "#00FF00";
        handCtx.lineWidth = 2;
        handCtx.stroke();
      }
    }
  }

  // --- Template Drawing ---
  function drawTemplate() {
    if (currentTemplate === "freeform" || templatePoints.length === 0) return;
    drawCtx.beginPath();
    drawCtx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    drawCtx.lineWidth = 2;
    drawCtx.setLineDash([6, 4]);
    templatePoints.forEach((p, i) => {
      const px = p.x * drawCanvas.width;
      const py = p.y * drawCanvas.height;
      if (i === 0) drawCtx.moveTo(px, py);
      else drawCtx.lineTo(px, py);
    });
    drawCtx.stroke();
    drawCtx.setLineDash([]);
  }

  function setTemplate(name) {
    currentTemplate = name;
    templatePoints = TEMPLATES[name].points || [];
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawTemplate();
    totalError = 0;
    errorCount = 0;
    accuracy = 100;
    if (accuracyEl) accuracyEl.textContent = `📐 ${accuracy}%`;
    if (toolEl) toolEl.textContent = TEMPLATES[name].name;
    showToast(`📐 Template: ${TEMPLATES[name].name}`, "info");
  }

  // --- Ataxia Corridor Scoring (E4) ---
  function updateAccuracy(point) {
    let minDist = Infinity;
    templatePoints.forEach((tp) => {
      const dx = point.nx - tp.x;
      const dy = point.ny - tp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    });

    totalError += minDist;
    errorCount++;
    const avgError = totalError / errorCount;
    accuracy = Math.max(0, Math.round(100 - avgError * 480));
    if (accuracyEl) accuracyEl.textContent = `📐 ${accuracy}%`;
  }

  // --- Template Buttons ---
  document.querySelectorAll(".template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".template-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setTemplate(btn.dataset.template);
    });
  });

  // --- Color Palette Selection ---
  document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      isEraser = false;
      currentColor = btn.dataset.color;
      document.querySelectorAll(".color-btn, .inair-color-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.color === currentColor);
      });
      if (rubBtn) rubBtn.classList.remove("active");
      const inairRub = document.getElementById("inair-rub-btn");
      if (inairRub) inairRub.classList.remove("active");
      showToast(`🎨 Color: ${btn.title || currentColor}`, "info");
    });
  });

  // --- Rub / Eraser Toggle ---
  if (rubBtn) {
    rubBtn.addEventListener("click", () => {
      isEraser = !isEraser;
      rubBtn.classList.toggle("active", isEraser);
      const inairRub = document.getElementById("inair-rub-btn");
      if (inairRub) inairRub.classList.toggle("active", isEraser);
      if (isEraser) {
        document.querySelectorAll(".color-btn, .inair-color-btn").forEach((b) => b.classList.remove("active"));
      }
      showToast(isEraser ? "🧽 Rub / Eraser mode active" : "✏️ Drawing mode active", "info");
    });
  }

  // --- Clear Canvas ---
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      totalError = 0;
      errorCount = 0;
      accuracy = 100;
      if (accuracyEl) accuracyEl.textContent = "📐 100%";
      drawTemplate();
      showToast("🧹 Canvas cleared", "info");
    });
  }

  // --- In-Air Virtual Control Dock Listeners ---
  const inairStart = document.getElementById("inair-start-btn");
  const inairPause = document.getElementById("inair-pause-btn");
  const inairResume = document.getElementById("inair-resume-btn");
  const inairStop = document.getElementById("inair-stop-btn");
  const inairRub = document.getElementById("inair-rub-btn");
  const inairClear = document.getElementById("inair-clear-btn");

  if (inairStart) inairStart.addEventListener("click", startDrawingSession);
  if (inairPause) inairPause.addEventListener("click", pauseDrawingSession);
  if (inairResume) inairResume.addEventListener("click", resumeDrawingSession);
  if (inairStop) inairStop.addEventListener("click", stopDrawingSession);

  // In-Air Colors
  document.querySelectorAll(".inair-color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      isEraser = false;
      currentColor = btn.dataset.color;
      document.querySelectorAll(".color-btn, .inair-color-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.color === currentColor);
      });
      if (rubBtn) rubBtn.classList.remove("active");
      if (inairRub) inairRub.classList.remove("active");
      showToast(`🎨 Color: ${btn.title || currentColor}`, "info");
    });
  });

  // In-Air Brush Sizes
  document.querySelectorAll(".inair-size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sz = parseInt(btn.dataset.size, 10);
      setBrushSize(sz);
      showToast(`✏️ Brush: ${btn.textContent.trim()} (${sz}px)`, "info");
    });
  });

  // In-Air Rub / Eraser
  if (inairRub) {
    inairRub.addEventListener("click", () => {
      isEraser = !isEraser;
      if (rubBtn) rubBtn.classList.toggle("active", isEraser);
      inairRub.classList.toggle("active", isEraser);
      if (isEraser) {
        document.querySelectorAll(".color-btn, .inair-color-btn").forEach((b) => b.classList.remove("active"));
      }
      showToast(isEraser ? "🧽 Rub / Eraser mode active" : "✏️ Drawing mode active", "info");
    });
  }

  // In-Air Clear
  if (inairClear) {
    inairClear.addEventListener("click", () => {
      drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
      totalError = 0;
      errorCount = 0;
      accuracy = 100;
      if (accuracyEl) accuracyEl.textContent = "📐 100%";
      drawTemplate();
      showToast("🧹 Canvas cleared", "info");
    });
  }

  // --- Initialize Camera ---
  await initCamera();
});
