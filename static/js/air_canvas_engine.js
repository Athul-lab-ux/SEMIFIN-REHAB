/**
 * RehabOpt AR — Session 3: Neon Air-Canvas Engine
 * Parametric templates, dwell-time tool selection, peace sign gesture, ataxia corridor
 */
document.addEventListener("DOMContentLoaded", async () => {
  const video = document.getElementById("video");
  const drawCanvas = document.getElementById("draw-canvas");
  const drawCtx = drawCanvas.getContext("2d");
  const handCanvas = document.getElementById("hand-canvas");
  const handCtx = handCanvas.getContext("2d");

  // HUD
  const accuracyEl = document.getElementById("accuracy-display");
  const toolEl = document.getElementById("tool-display");
  const toast = document.getElementById("toast");

  // State
  let isDrawing = false;
  let lastPoint = null;
  let currentTemplate = "freeform";
  let currentColor = "#00ff88";
  let templatePoints = [];
  let accuracy = 100;
  let totalError = 0;
  let errorCount = 0;
  let calibrationDone = false;
  let calibrationTimer = 4;
  let dwellTarget = null;
  let dwellStart = 0;
  const DWELL_TIME = 1500; // 1.5 seconds

  const COLORS = ["#00ff88", "#ff6a00", "#00ccff", "#ff4488", "#ffd000"];

  const TEMPLATES = {
    freeform: { name: "✏️ Freeform", points: [] },
    line: { name: "📏 Line", points: generateLine() },
    circle: { name: "⭕ Circle", points: generateCircle(0.4) },
    square: { name: "⬜ Square", points: generateSquare(0.35) },
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
    for (let i = 0; i <= 100; i++) {
      pts.push({ x: 0.2 + (i / 100) * 0.6, y: 0.5 });
    }
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
    const cx = 0.5, cy = 0.5;
    const h = s;
    // Top edge
    for (let i = 0; i <= 20; i++) pts.push({ x: cx - h + (2 * h * i) / 20, y: cy - h });
    // Right edge
    for (let i = 0; i <= 20; i++) pts.push({ x: cx + h, y: cy - h + (2 * h * i) / 20 });
    // Bottom edge
    for (let i = 0; i <= 20; i++) pts.push({ x: cx + h - (2 * h * i) / 20, y: cy + h });
    // Left edge
    for (let i = 0; i <= 20; i++) pts.push({ x: cx - h, y: cy + h - (2 * h * i) / 20 });
    return pts;
  }

  function generateInfinity() {
    const pts = [];
    for (let t = 0; t <= Math.PI * 2; t += 0.04) {
      const denom = 1 + Math.sin(t) * Math.sin(t);
      pts.push({ x: 0.5 + 0.25 * Math.cos(t) / denom, y: 0.5 + 0.25 * Math.sin(t) * Math.cos(t) / denom });
    }
    return pts;
  }

  function generateTriangle() {
    return [
      { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }, { x: 0.5, y: 0.2 },
    ];
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
    for (let i = 0; i <= 100; i++) {
      const x = 0.1 + (i / 100) * 0.8;
      pts.push({ x, y: 0.5 + 0.15 * Math.sin(i * 0.12) });
    }
    return pts;
  }

  function generateZigzag() {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      pts.push({ x: 0.1 + (i / 10) * 0.8, y: i % 2 === 0 ? 0.3 : 0.7 });
    }
    return pts;
  }

  // --- Resize ---
  function resizeCanvas() {
    const parent = drawCanvas.parentElement;
    drawCanvas.width = parent.clientWidth;
    drawCanvas.height = parent.clientHeight;
    handCanvas.width = parent.clientWidth;
    handCanvas.height = parent.clientHeight;
    drawTemplate();
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // --- Camera & MediaPipe Hands ---
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onHandResults);

  async function initCamera() {
    const cam = new RehabCamera("video", async (videoEl) => {
      await hands.send({ image: videoEl });
    });
    const ok = await cam.initialize();
    if (ok) showToast("✅ Camera active — raise your hand!", "success");
  }

  function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      isDrawing = false;
      return;
    }

    const lm = results.multiHandLandmarks[0];
    const indexTip = lm[8];
    const thumbTip = lm[4];
    const middleTip = lm[12];
    const ringTip = lm[16];

    // Peace sign detection (✌️): index + middle extended, ring + pinky folded
    const isPeaceSign =
      lm[8].y < lm[6].y &&
      lm[12].y < lm[10].y &&
      lm[16].y > lm[14].y &&
      lm[20].y > lm[18].y;

    if (isPeaceSign) {
      isDrawing = false; // Pen lift
      lastPoint = null;
      drawHandSkeleton(lm, "#00ccff");
      return;
    }

    // Index fingertip as stylus
    const px = indexTip.x * drawCanvas.width;
    const py = indexTip.y * drawCanvas.height;
    const point = { x: px, y: py, nx: indexTip.x, ny: indexTip.y };

    // Check if hovering over toolbar (dwell-time selection)
    checkDwellSelection(indexTip);

    // Draw
    if (lastPoint && !dwellTarget) {
      drawCtx.beginPath();
      drawCtx.moveTo(lastPoint.x, lastPoint.y);
      drawCtx.lineTo(px, py);
      drawCtx.strokeStyle = currentColor;
      drawCtx.lineWidth = 3;
      drawCtx.shadowColor = currentColor;
      drawCtx.shadowBlur = 6;
      drawCtx.stroke();
      drawCtx.shadowBlur = 0;

      // Ataxia corridor scoring (E4)
      if (templatePoints.length > 0) {
        updateAccuracy(point);
      }
    }

    lastPoint = point;
    drawHandSkeleton(lm, currentColor);
  }

  function drawHandSkeleton(lm, color) {
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    const w = handCanvas.width;
    const h = handCanvas.height;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
    ];

    handCtx.strokeStyle = color;
    handCtx.lineWidth = 2;
    handCtx.globalAlpha = 0.5;
    connections.forEach(([a, b]) => {
      handCtx.beginPath();
      handCtx.moveTo(lm[a].x * w, lm[a].y * h);
      handCtx.lineTo(lm[b].x * w, lm[b].y * h);
      handCtx.stroke();
    });
    handCtx.globalAlpha = 1;

    // Index tip highlight
    handCtx.beginPath();
    handCtx.arc(lm[8].x * w, lm[8].y * h, 6, 0, Math.PI * 2);
    handCtx.fillStyle = color;
    handCtx.fill();
  }

  // --- Dwell-Time Tool Selection ---
  function checkDwellSelection(tip) {
    // Map finger position to toolbar area (top of screen)
    if (tip.y < 0.08) {
      const toolbarItems = Object.keys(TEMPLATES);
      const idx = Math.floor(tip.x * toolbarItems.length);
      const target = toolbarItems[Math.min(idx, toolbarItems.length - 1)];

      if (dwellTarget !== target) {
        dwellTarget = target;
        dwellStart = Date.now();
      } else if (Date.now() - dwellStart > DWELL_TIME) {
        setTemplate(dwellTarget);
        dwellTarget = null;
      }
    } else {
      dwellTarget = null;
    }
  }

  // --- Template Drawing ---
  function drawTemplate() {
    if (currentTemplate === "freeform" || templatePoints.length === 0) return;

    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawCtx.beginPath();
    drawCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
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
    accuracyEl.textContent = `📐 ${accuracy}%`;
    toolEl.textContent = TEMPLATES[name].name;
    showToast(`📐 Template: ${TEMPLATES[name].name}`, "info");
  }

  // --- Ataxia Corridor Scoring (E4) ---
  function updateAccuracy(point) {
    // Find nearest template point
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
    accuracy = Math.max(0, Math.round(100 - avgError * 500));
    accuracyEl.textContent = `📐 ${accuracy}%`;
  }

  // --- Template Selector Buttons ---
  document.querySelectorAll(".template-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTemplate(btn.dataset.template);
    });
  });

  // --- Color Palette ---
  document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentColor = btn.dataset.color;
      document.querySelectorAll(".color-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // --- Clear Canvas ---
  document.getElementById("clear-btn").addEventListener("click", () => {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    totalError = 0;
    errorCount = 0;
    accuracy = 100;
    accuracyEl.textContent = "📐 100%";
    drawTemplate();
    showToast("🧹 Canvas cleared", "info");
  });

  // --- Toast ---
  function showToast(msg, type = "info") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => (toast.className = "toast"), 3000);
  }

  // --- Start ---
  await initCamera();
});
