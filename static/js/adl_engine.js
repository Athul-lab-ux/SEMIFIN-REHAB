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

  // --- Session Controls & 4s Countdown ---
  let adlCountdownTimer = null;
  let adlPaused = false;

  function runAdlCountdown(label, seconds, onComplete) {
    const overlay = document.getElementById("adl-countdown-overlay");
    const numEl = document.getElementById("adl-aco-num");
    const labEl = document.getElementById("adl-aco-label");
    if (!overlay || !numEl) { if (onComplete) onComplete(); return; }
    if (adlCountdownTimer) clearInterval(adlCountdownTimer);
    let remaining = seconds;
    labEl.textContent = label;
    numEl.textContent = remaining;
    overlay.classList.add("show");
    if (window.RehabBio) window.RehabBio.speak(`${label}. ${remaining}`);

    adlCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        numEl.textContent = remaining;
        if (window.RehabBio) window.RehabBio.speak(`${remaining}`);
      } else {
        clearInterval(adlCountdownTimer);
        adlCountdownTimer = null;
        numEl.textContent = "GO!";
        if (window.RehabBio) window.RehabBio.speak("Go!");
        setTimeout(() => {
          overlay.classList.remove("show");
          if (onComplete) onComplete();
        }, 500);
      }
    }, 1000);
  }

  // --- 4s Guidance Popup System (Initial + 10s Inactivity) ---
  const ADL_GUIDES = {
    key: {
      title: "🔑 90° Door Key Turn",
      what: "Rotate the deadbolt key 90° clockwise to unlock the door.",
      how: "Turn your wrist and forearm outward like turning a key in a lock. On touch/mouse: drag across the key horizontally.",
      tip: "Retrains active forearm pronation & supination (E5 knuckle aspect ratio).",
    },
    light: {
      title: "💡 Rocker Light Switch",
      what: "Flip the wall light switch ON and OFF.",
      how: "Perform a rapid upward or downward hand thrust, or tap directly on the rocker switch.",
      tip: "Retrains ballistic wrist/finger extension against gravity.",
    },
    thermostat: {
      title: "🎛️ Rotary Thermostat",
      what: "Adjust the dial temperature from 18°C up to 24°C.",
      how: "Trace a smooth circular motion around the dial with your index finger, or drag around the dial arc.",
      tip: "Retrains circular planar coordination and fine velocity control.",
    },
    pin: {
      title: "🔢 Touchless PIN Pad",
      what: "Enter the security code: 1 → 2 → 3 → 4.",
      how: "Hover your index fingertip over digit 1 for 1.2s until confirmed, then 2, 3, and 4. Or tap each digit directly.",
      tip: "Retrains tremor dampening and steady isometric dwell target control.",
    },
  };

  let adlGuidanceTimer = null;
  let adlGuidanceInterval = null;
  let adlGuidanceShowing = false;
  let lastAdlActionTime = Date.now();

  function showAdlGuidancePopup(taskKey, durationSec = 4) {
    const popup = document.getElementById("adl-guidance-popup");
    const guide = ADL_GUIDES[taskKey];
    if (!popup || !guide) return;
    if (adlPaused || currentTask === "menu") return;

    adlGuidanceShowing = true;
    document.getElementById("agp-title").textContent = guide.title;
    document.getElementById("agp-what").textContent = guide.what;
    document.getElementById("agp-how").textContent = guide.how;
    document.getElementById("agp-tip").textContent = guide.tip;

    popup.classList.add("show");

    if (window.RehabBio) {
      window.RehabBio.speak(`${guide.title}. ${guide.how}`);
    }

    if (adlGuidanceTimer) clearTimeout(adlGuidanceTimer);
    if (adlGuidanceInterval) clearInterval(adlGuidanceInterval);

    const startTime = Date.now();
    const totalMs = durationSec * 1000;
    const timerFill = document.getElementById("agp-timer-fill");
    const timerText = document.getElementById("agp-timer-text");

    adlGuidanceInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, (totalMs - elapsed) / 1000);
      const pct = Math.max(0, Math.min(100, ((totalMs - elapsed) / totalMs) * 100));
      if (timerFill) timerFill.style.width = `${pct}%`;
      if (timerText) timerText.textContent = `Closing in ${Math.ceil(remaining)}s...`;

      if (elapsed >= totalMs) {
        hideAdlGuidancePopup();
      }
    }, 50);
  }

  function hideAdlGuidancePopup() {
    const popup = document.getElementById("adl-guidance-popup");
    if (popup) popup.classList.remove("show");
    if (adlGuidanceTimer) clearTimeout(adlGuidanceTimer);
    if (adlGuidanceInterval) clearInterval(adlGuidanceInterval);
    adlGuidanceTimer = null;
    adlGuidanceInterval = null;
    adlGuidanceShowing = false;
    lastAdlActionTime = Date.now();
  }

  const agpDismiss = document.getElementById("agp-dismiss");
  if (agpDismiss) {
    agpDismiss.addEventListener("click", hideAdlGuidancePopup);
  }

  function pauseAdl() {
    if (currentTask === "menu" || adlPaused) return;
    adlPaused = true;
    hideAdlGuidancePopup();
    document.getElementById("adl-pause").style.display = "none";
    document.getElementById("adl-resume").style.display = "inline-flex";
    document.getElementById("adl-paused-overlay").classList.add("show");
    if (window.RehabBio) window.RehabBio.speak("Task paused");
  }

  function resumeAdl() {
    document.getElementById("adl-paused-overlay").classList.remove("show");
    runAdlCountdown("RESUMING IN", 4, () => {
      adlPaused = false;
      lastAdlActionTime = Date.now();
      document.getElementById("adl-resume").style.display = "none";
      document.getElementById("adl-pause").style.display = "inline-flex";
    });
  }

  function stopAdl() {
    hideAdlGuidancePopup();
    if (currentTask !== "menu") {
      logSession();
    }
    currentTask = "menu";
    adlPaused = false;
    document.getElementById("task-menu").classList.remove("hidden");
    document.getElementById("adl-paused-overlay").classList.remove("show");
    document.getElementById("adl-countdown-overlay").classList.remove("show");
    document.getElementById("adl-pause").style.display = "none";
    document.getElementById("adl-resume").style.display = "none";
    document.getElementById("adl-stop").style.display = "none";
    taskEl.textContent = "Choose a task";
    statusEl.textContent = "Ready";
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  }

  document.getElementById("adl-pause").addEventListener("click", pauseAdl);
  document.getElementById("adl-resume").addEventListener("click", resumeAdl);
  document.getElementById("modal-adl-resume").addEventListener("click", resumeAdl);
  document.getElementById("adl-stop").addEventListener("click", stopAdl);
  document.getElementById("modal-adl-stop").addEventListener("click", stopAdl);

  // --- Task Selection ---
  document.querySelectorAll(".task-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedTask = btn.dataset.task;
      document.getElementById("task-menu").classList.add("hidden");
      taskEl.textContent = btn.textContent.trim().split("\n")[0];
      statusEl.textContent = "Get ready...";
      runAdlCountdown("GET READY", 4, () => {
        currentTask = selectedTask;
        tasksCompleted = 0;
        startTime = Date.now();
        lastAdlActionTime = Date.now();
        document.getElementById("adl-pause").style.display = "inline-flex";
        document.getElementById("adl-resume").style.display = "none";
        document.getElementById("adl-stop").style.display = "inline-flex";
        showToast(`🔑 Task Started: ${taskEl.textContent}`, "info");
        showAdlGuidancePopup(selectedTask, 4);
      });
    });
  });

  function updateTask() {
    if (adlPaused) return;
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

  // Continuous 60 FPS animation loop with 10s idle guidance re-trigger
  function adlRenderLoop() {
    requestAnimationFrame(adlRenderLoop);
    if (currentTask !== "menu" && !adlPaused) {
      updateTask();

      if (!adlGuidanceShowing && (Date.now() - lastAdlActionTime >= 10000)) {
        showAdlGuidancePopup(currentTask, 4);
        lastAdlActionTime = Date.now();
      }
    }
  }
  adlRenderLoop();

  // Pointer / Touch fallback for interactive testing on phones and laptops
  gameCanvas.addEventListener("pointermove", (e) => {
    const rect = gameCanvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    handPos = { x: nx, y: ny };
    lastAdlActionTime = Date.now();
    if (!wristData) {
      wristData = {
        pincerDist: 0.03,
        knuckleRatio: 0.75,
        dispersion: 0.15,
        indexTip: { x: nx, y: ny },
        thumbTip: { x: nx - 0.03, y: ny },
        wrist: { x: nx, y: ny + 0.1 },
        elbow: { x: nx, y: ny + 0.2 },
      };
    } else {
      wristData.indexTip = { x: nx, y: ny };
    }
  });

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
    if (wristData.indexTip && pinProgress < PIN.length) {
      const targetDigit = String(PIN[pinProgress]);
      const targetIdx = padLabels.indexOf(targetDigit);
      const target = padPositions[targetIdx];
      const dx = handPos.x - target.x;
      const dy = handPos.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.08) {
        lastAdlActionTime = Date.now();
        if (dwellTarget !== targetIdx) {
          dwellTarget = targetIdx;
          dwellStart = Date.now();
        } else if (Date.now() - dwellStart > DWELL) {
          pinProgress++;
          dwellTarget = -1;
          showToast(`🔢 Digit ${targetDigit} entered`, "info");

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
        if (dwellTarget === targetIdx) dwellTarget = -1;
      }
    }

    statusEl.textContent = `🔢 Enter PIN: ${pinProgress}/${PIN.length}`;
  }

  // Pointer click/tap interaction for phones, touchscreens, and laptop fallback
  gameCanvas.addEventListener("pointerdown", (e) => {
    if (adlPaused || currentTask === "menu") return;
    lastAdlActionTime = Date.now();
    const rect = gameCanvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (currentTask === "pin" && pinProgress < PIN.length) {
      const targetDigit = String(PIN[pinProgress]);
      const targetIdx = padLabels.indexOf(targetDigit);
      const target = padPositions[targetIdx];
      if (target && Math.hypot(nx - target.x, ny - target.y) < 0.09) {
        pinProgress++;
        dwellTarget = -1;
        showToast(`🔢 Digit ${targetDigit} entered`, "info");
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
    } else if (currentTask === "light") {
      switchOn = !switchOn;
      tasksCompleted++;
      showToast(switchOn ? "💡 Light ON" : "💡 Light OFF", "success");
      setTimeout(() => {
        currentTask = "menu";
        document.getElementById("task-menu").classList.remove("hidden");
      }, 2000);
    } else if (currentTask === "key") {
      keyRotation = Math.min(keyTarget, keyRotation + 18);
      if (keyRotation >= keyTarget && tasksCompleted === 0) {
        tasksCompleted++;
        showToast("🔓 Key turned! Deadbolt unlocked!", "success");
        setTimeout(() => {
          currentTask = "menu";
          document.getElementById("task-menu").classList.remove("hidden");
        }, 2000);
      }
    }
  });

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
