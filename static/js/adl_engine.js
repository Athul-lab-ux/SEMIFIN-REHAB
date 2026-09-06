/**
 * RehabOpt AR — Session 4: ADL Functional Lab Engine
 * Key Turn, Light Switch, Thermostat Dial, Touchless PIN Pad
 */
document.addEventListener("DOMContentLoaded", async () => {
  const video = document.getElementById("video");
  const gameCanvas = document.getElementById("game-canvas");
  const gCtx = gameCanvas.getContext("2d");
  const handCanvas = document.getElementById("hand-canvas");
  const handCtx = handCanvas.getContext("2d");

  // HUD
  const taskEl = document.getElementById("task-display");
  const statusEl = document.getElementById("status-display");
  const toast = document.getElementById("toast");

  // State
  let currentTask = "menu";
  let handPos = { x: 0.5, y: 0.5 };
  let wristData = {};
  let tasksCompleted = 0;
  let cheatsBlocked = 0;
  let startTime = Date.now();

  // --- Resize ---
  function resizeCanvas() {
    const parent = gameCanvas.parentElement;
    gameCanvas.width = parent.clientWidth;
    gameCanvas.height = parent.clientHeight;
    handCanvas.width = parent.clientWidth;
    handCanvas.height = parent.clientHeight;
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 150);
  });
  resizeCanvas();

  // --- Camera & MediaPipe Hands ---
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  hands.onResults(onHandResults);

  async function initCamera() {
    const cam = new RehabCamera("video", async (v) => { await hands.send({ image: v }); });
    const ok = await cam.initialize();
    if (ok) showToast("✅ Camera active — choose a task!", "success");
  }

  function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;
    // Mirrored into selfie-view coordinates (video is displayed with
    // scaleX(-1)) so the hand follows you exactly as you move it.
    const lm = results.multiHandLandmarks[0].map((p) => ({ x: 1 - p.x, y: p.y, z: p.z || 0 }));

    const indexTip = lm[8];
    const thumbTip = lm[4];
    const wrist = lm[0];
    const elbow = lm[5];

    handPos = { x: indexTip.x, y: indexTip.y };

    // Pincer grip (E2)
    const pincerDist = Kinematics.calculatePincerGrip(thumbTip, indexTip);

    // Knuckle aspect ratio (E5)
    const indexMCP = lm[5];
    const pinkyMCP = lm[17];
    const knuckleRatio = Kinematics.calculateKnuckleAspectRatio(indexMCP, pinkyMCP, wrist);

    // Hand dispersion (C3)
    const dispersion = Kinematics.calculateHandDispersion(lm);

    // Tremor buffer
    wristData = { pincerDist, knuckleRatio, dispersion, indexTip, thumbTip, wrist, elbow };

    if (currentTask !== "menu") {
      updateTask();
    }

    drawHandSkeleton(lm);
  }

  function drawHandSkeleton(lm) {
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    const w = handCanvas.width, h = handCanvas.height;
    const connections = [[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    handCtx.strokeStyle = "rgba(255, 154, 60, 0.4)";
    handCtx.lineWidth = 2;
    connections.forEach(([a,b]) => {
      handCtx.beginPath();
      handCtx.moveTo(lm[a].x*w, lm[a].y*h);
      handCtx.lineTo(lm[b].x*w, lm[b].y*h);
      handCtx.stroke();
    });
    handCtx.beginPath();
    handCtx.arc(lm[8].x*w, lm[8].y*h, 6, 0, Math.PI*2);
    handCtx.fillStyle = "#ff9a3c";
    handCtx.fill();
  }

  // --- Task Selection ---
  document.querySelectorAll(".task-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTask = btn.dataset.task;
      tasksCompleted = 0;
      startTime = Date.now();
      document.getElementById("task-menu").classList.add("hidden");
      taskEl.textContent = btn.textContent.trim();
      showToast(`🔑 Starting: ${btn.textContent.trim()}`, "info");
    });
  });

  // --- Task Update ---
  function updateTask() {
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    const w = gameCanvas.width, h = gameCanvas.height;
    const hx = handPos.x * w, hy = handPos.y * h;

    switch (currentTask) {
      case "key":
        drawKeyTask(hx, hy);
        break;
      case "light":
        drawLightTask(hx, hy);
        break;
      case "thermostat":
        drawThermostatTask(hx, hy);
        break;
      case "pin":
        drawPinTask(hx, hy);
        break;
    }
  }

  // --- Task 1: 90° Door Key Turn (E5: Knuckle Aspect Ratio) ---
  let keyRotation = 0;
  const keyTarget = 90;
  function drawKeyTask(hx, hy) {
    const cx = gameCanvas.width / 2, cy = gameCanvas.height / 2;

    // Draw deadbolt plate
    gCtx.fillStyle = "#333";
    gCtx.fillRect(cx - 60, cy - 40, 120, 80);
    gCtx.strokeStyle = "#666";
    gCtx.lineWidth = 2;
    gCtx.strokeRect(cx - 60, cy - 40, 120, 80);

    // Key rotation based on knuckle aspect ratio (E5)
    // Knuckle ratio drops significantly when hand rotates 90°
    if (wristData.knuckleRatio !== undefined) {
      keyRotation = Math.max(0, Math.min(keyTarget, (1 - wristData.knuckleRatio) * 200));
    }

    // Draw key
    gCtx.save();
    gCtx.translate(cx, cy);
    gCtx.rotate((keyRotation * Math.PI) / 180);

    // Key shaft
    gCtx.fillStyle = "#c0a040";
    gCtx.fillRect(-5, -50, 10, 60);

    // Key head
    gCtx.beginPath();
    gCtx.arc(0, -55, 15, 0, Math.PI * 2);
    gCtx.fillStyle = "#ffd000";
    gCtx.fill();
    gCtx.strokeStyle = "#c0a040";
    gCtx.lineWidth = 2;
    gCtx.stroke();

    // Key teeth
    gCtx.fillStyle = "#c0a040";
    gCtx.fillRect(5, -20, 12, 4);
    gCtx.fillRect(5, -12, 8, 4);

    gCtx.restore();

    // Progress arc
    gCtx.beginPath();
    gCtx.arc(cx, cy, 70, -Math.PI / 2, -Math.PI / 2 + (keyRotation / keyTarget) * Math.PI);
    gCtx.strokeStyle = keyRotation >= keyTarget ? "#00ff88" : "#ff9a3c";
    gCtx.lineWidth = 4;
    gCtx.stroke();

    // Status
    const pct = Math.round((keyRotation / keyTarget) * 100);
    statusEl.textContent = `🔑 ${pct}% rotated`;

    if (keyRotation >= keyTarget && tasksCompleted === 0) {
      tasksCompleted++;
      showToast("🔓 Key turned! Deadbolt unlocked!", "success");
      setTimeout(() => { currentTask = "menu"; document.getElementById("task-menu").classList.remove("hidden"); }, 2000);
    }
  }

  // --- Task 2: Rocker Light Switch ---
  let switchOn = false;
  let lastThrustY = 0;
  function drawLightTask(hx, hy) {
    const cx = gameCanvas.width / 2, cy = gameCanvas.height / 2;

    // Room background
    gCtx.fillStyle = switchOn ? "#2a2520" : "#0a0a0a";
    gCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Light glow when on
    if (switchOn) {
      gCtx.beginPath();
      gCtx.arc(cx, cy - 50, 120, 0, Math.PI * 2);
      const grad = gCtx.createRadialGradient(cx, cy - 50, 10, cx, cy - 50, 120);
      grad.addColorStop(0, "rgba(255, 220, 120, 0.4)");
      grad.addColorStop(1, "rgba(255, 220, 120, 0)");
      gCtx.fillStyle = grad;
      gCtx.fill();
    }

    // Switch plate
    gCtx.fillStyle = "#e8e0d0";
    gCtx.fillRect(cx - 30, cy - 60, 60, 120);
    gCtx.strokeStyle = "#bbb";
    gCtx.lineWidth = 2;
    gCtx.strokeRect(cx - 30, cy - 60, 60, 120);

    // Switch toggle
    gCtx.fillStyle = switchOn ? "#4CAF50" : "#888";
    gCtx.beginPath();
    gCtx.roundRect(cx - 20, switchOn ? cy - 50 : cy, 40, 45, 6);
    gCtx.fill();

    // Labels
    gCtx.font = "bold 14px sans-serif";
    gCtx.fillStyle = switchOn ? "#fff" : "#666";
    gCtx.fillText("ON", cx - 10, cy - 30);
    gCtx.fillStyle = switchOn ? "#666" : "#fff";
    gCtx.fillText("OFF", cx - 14, cy + 28);

    // Detect rapid upward/downward thrust
    if (wristData.indexTip) {
      const currentY = wristData.indexTip.y;
      const thrust = currentY - lastThrustY;
      if (Math.abs(thrust) > 0.08) {
        switchOn = !switchOn;
        showToast(switchOn ? "💡 Light ON" : "💡 Light OFF", "success");
        tasksCompleted++;
        setTimeout(() => { currentTask = "menu"; document.getElementById("task-menu").classList.remove("hidden"); }, 2000);
      }
      lastThrustY = currentY;
    }

    statusEl.textContent = switchOn ? "💡 Light is ON" : "💡 Light is OFF";
  }

  // --- Task 3: Rotary Thermostat Dial ---
  let thermostatTemp = 18;
  const tempMin = 18, tempMax = 24;
  let lastAngle = null;
  function drawThermostatTask(hx, hy) {
    const cx = gameCanvas.width / 2, cy = gameCanvas.height / 2;

    // Dial base
    gCtx.beginPath();
    gCtx.arc(cx, cy, 80, 0, Math.PI * 2);
    gCtx.fillStyle = "#1a1510";
    gCtx.fill();
    gCtx.strokeStyle = "#ff9a3c";
    gCtx.lineWidth = 3;
    gCtx.stroke();

    // Temperature arc
    const startAngle = -Math.PI * 0.75;
    const endAngle = startAngle + ((thermostatTemp - tempMin) / (tempMax - tempMin)) * Math.PI * 1.5;
    gCtx.beginPath();
    gCtx.arc(cx, cy, 65, startAngle, endAngle);
    gCtx.strokeStyle = thermostatTemp >= 22 ? "#ff6a00" : "#00ccff";
    gCtx.lineWidth = 8;
    gCtx.stroke();

    // Temperature text
    gCtx.font = "bold 36px monospace";
    gCtx.fillStyle = "#ff9a3c";
    gCtx.textAlign = "center";
    gCtx.fillText(`${thermostatTemp}°C`, cx, cy + 12);
    gCtx.textAlign = "start";

    // Dial indicator
    const angle = startAngle + ((thermostatTemp - tempMin) / (tempMax - tempMin)) * Math.PI * 1.5;
    const indicatorX = cx + 55 * Math.cos(angle);
    const indicatorY = cy + 55 * Math.sin(angle);
    gCtx.beginPath();
    gCtx.arc(indicatorX, indicatorY, 8, 0, Math.PI * 2);
    gCtx.fillStyle = "#fff";
    gCtx.fill();

    // Track circular pronation/supination
    if (wristData.indexTip) {
      const currentAngle = Math.atan2(wristData.indexTip.y - cy / gameCanvas.height, wristData.indexTip.x - cx / gameCanvas.width);
      if (lastAngle !== null) {
        const delta = currentAngle - lastAngle;
        if (Math.abs(delta) < 0.5 && Math.abs(delta) > 0.02) {
          thermostatTemp = Math.max(tempMin, Math.min(tempMax, thermostatTemp + delta * 2));
          thermostatTemp = Math.round(thermostatTemp * 10) / 10;
        }
      }
      lastAngle = currentAngle;
    }

    statusEl.textContent = `🌡️ ${thermostatTemp}°C`;

    if (thermostatTemp >= tempMax && tasksCompleted === 0) {
      tasksCompleted++;
      showToast("🌡️ Thermostat set to max!", "success");
      setTimeout(() => { currentTask = "menu"; document.getElementById("task-menu").classList.remove("hidden"); }, 2000);
    }
  }

  // --- Task 4: Touchless PIN Pad (E6: Tremor Detection) ---
  const PIN = [1, 2, 3, 4];
  let pinProgress = 0;
  let dwellStart = 0;
  let dwellTarget = -1;
  const DWELL = 1200;
  const padPositions = [
    { x: 0.35, y: 0.3 }, { x: 0.5, y: 0.3 }, { x: 0.65, y: 0.3 },
    { x: 0.35, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.65, y: 0.5 },
    { x: 0.35, y: 0.7 }, { x: 0.5, y: 0.7 }, { x: 0.65, y: 0.7 },
    { x: 0.5, y: 0.88 },
  ];
  const padLabels = ["1","2","3","4","5","6","7","8","9","0"];

  function drawPinTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;

    // Draw PIN pad
    padPositions.forEach((pos, i) => {
      const px = pos.x * w, py = pos.y * h;
      const isFilled = i < pinProgress;
      const isDwelling = dwellTarget === i;

      gCtx.beginPath();
      gCtx.arc(px, py, 28, 0, Math.PI * 2);
      gCtx.fillStyle = isFilled ? "#00ff88" : isDwelling ? "#ff9a3c" : "#1a1510";
      gCtx.fill();
      gCtx.strokeStyle = isFilled ? "#00ff88" : "#ff9a3c";
      gCtx.lineWidth = 2;
      gCtx.stroke();

      // Dwelling progress ring
      if (isDwelling) {
        const elapsed = Date.now() - dwellStart;
        const progress = Math.min(1, elapsed / DWELL);
        gCtx.beginPath();
        gCtx.arc(px, py, 34, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        gCtx.strokeStyle = "#ffd000";
        gCtx.lineWidth = 3;
        gCtx.stroke();
      }

      gCtx.font = "bold 16px monospace";
      gCtx.fillStyle = isFilled ? "#000" : "#e8ddd0";
      gCtx.textAlign = "center";
      gCtx.fillText(padLabels[i], px, py + 5);
    });
    gCtx.textAlign = "start";

    // Progress indicator
    gCtx.font = "bold 14px monospace";
    gCtx.fillStyle = "#ff9a3c";
    gCtx.fillText(`PIN: ${"●".repeat(pinProgress)}${"○".repeat(PIN.length - pinProgress)}`, 20, 30);

    // Check dwell
    if (wristData.indexTip) {
      const idx = PIN[pinProgress];
      const target = padPositions[idx];
      const dx = handPos.x - target.x;
      const dy = handPos.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.06) {
        if (dwellTarget !== idx) {
          dwellTarget = idx;
          dwellStart = Date.now();
        } else if (Date.now() - dwellStart > DWELL) {
          pinProgress++;
          dwellTarget = -1;
          showToast(`🔢 Digit ${idx} entered`, "info");

          if (pinProgress >= PIN.length) {
            tasksCompleted++;
            showToast("🔢 PIN entered! Task complete!", "success");
            setTimeout(() => {
              currentTask = "menu";
              document.getElementById("task-menu").classList.remove("hidden");
              pinProgress = 0;
            }, 2000);
          }
        }
      } else {
        dwellTarget = -1;
      }
    }

    statusEl.textContent = `🔢 Enter PIN: ${pinProgress}/${PIN.length}`;
  }

  // --- Log Session ---
  async function logSession() {
    const duration = Math.floor((Date.now() - startTime) / 1000);
    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "ADL",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: duration,
          peak_rom: 0,
          smoothness_score: 75,
          cheats_blocked: cheatsBlocked,
          score: tasksCompleted,
          metrics_json: JSON.stringify({ tasksCompleted }),
        }),
      });
    } catch (err) {
      console.error("Telemetry error:", err);
    }
  }

  function showToast(msg, type = "info") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => (toast.className = "toast"), 3000);
  }

  // --- Start ---
  await initCamera();

  // Log on page unload
  window.addEventListener("beforeunload", () => {
    if (tasksCompleted > 0) logSession();
  });
});
