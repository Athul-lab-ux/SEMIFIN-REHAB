/**
 * RehabOpt AR — Session 4: ADL Functional Lab Engine (P4 Clinical Overhaul)
 * 6 Mandated Clinical Tasks with 6 Visual Skeletal Steps each:
 * 1. 🔑 90° Door Key Turn
 * 2. 💡 Rocker Light Switch
 * 3. 🎛️ Rotary Thermostat
 * 4. 🔢 Touchless PIN Pad
 * 5. 🚰 Water Faucet Twist
 * 6. 💊 Pill Bottle Cap Twist
 * Pure deterministic mathematics (no ML/DL guessing).
 */
document.addEventListener("DOMContentLoaded", async () => {
  const video = document.getElementById("video");
  const gameCanvas = document.getElementById("game-canvas");
  const gCtx = gameCanvas.getContext("2d");
  const handCanvas = document.getElementById("hand-canvas");
  const handCtx = handCanvas.getContext("2d");

  // HUD Elements
  const taskEl = document.getElementById("task-display");
  const stepEl = document.getElementById("step-display");
  const repsEl = document.getElementById("reps-display");
  const toast = document.getElementById("toast");
  const stepsBar = document.getElementById("adl-steps-bar");
  const btnCam = document.getElementById("adl-cam-btn");
  const btnMirror = document.getElementById("adl-mirror-btn");

  // State
  let currentTask = "menu";
  let currentStepIndex = 0;
  let repsCompleted = 0;
  const targetReps = 3;
  let handPos = { x: 0.5, y: 0.5 };
  let wristData = null;
  let tasksCompleted = 0;
  let cheatsBlocked = 0;
  let startTime = Date.now();
  let stepStartTime = Date.now();
  let lastAdlActionTime = Date.now();
  let cameraActive = true;
  let adlCamera = null;
  let isMirrored = localStorage.getItem("rehab_mirror_mode") !== "inverted"; // default natural (left = left)

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
      showToast(`🪞 Mirror Mode: ${isMirrored ? "Natural (Left = Left)" : "Inverted"}`, "info");
    });
  }

  const ADL_HAND_CONNECTIONS = [
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  // Task Specific Motor States
  let keyRotation = 0;
  const keyTarget = 90;
  let switchOn = false;
  let lastThrustY = 0.5;
  let thermostatTemp = 18;
  const tempMin = 18, tempMax = 24;
  let lastThermostatAngle = null;
  const PIN = [1, 2, 3, 4];
  let pinProgress = 0;
  let dwellStart = 0;
  let dwellTarget = -1;
  const DWELL_MS = 800;
  const padPositions = [
    { x: 0.38, y: 0.28 }, { x: 0.50, y: 0.28 }, { x: 0.62, y: 0.28 },
    { x: 0.38, y: 0.45 }, { x: 0.50, y: 0.45 }, { x: 0.62, y: 0.45 },
    { x: 0.38, y: 0.62 }, { x: 0.50, y: 0.62 }, { x: 0.62, y: 0.62 },
    { x: 0.50, y: 0.78 },
  ];
  const padLabels = ["1","2","3","4","5","6","7","8","9","0"];
  let faucetAngle = 0;
  let waterFlowing = false;
  let pillDepressed = false;
  let pillAngle = 0;

  // --- Resize Canvas ---
  function resizeCanvas() {
    const parent = gameCanvas.parentElement;
    if (!parent) return;
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

  // --- 6-Step Clinical Protocol Definitions for All 6 Tasks ---
  const ADL_TASKS = {
    key: {
      name: "🔑 90° Door Key Turn",
      steps: [
        { name: "Neutral Rest", desc: "Rest hand at ready position" },
        { name: "Forward Reach", desc: "Move hand toward keyhole" },
        { name: "Pincer Contact", desc: "Pinch thumb & index on key" },
        { name: "90° Supination", desc: "Rotate forearm outward 90°" },
        { name: "Unlock Sustain", desc: "Hold turned key for 1 sec" },
        { name: "Home Return", desc: "Retract hand to neutral base" },
      ],
    },
    light: {
      name: "💡 Rocker Light Switch",
      steps: [
        { name: "Neutral Rest", desc: "Hand relaxed below switch" },
        { name: "Upward Approach", desc: "Reach hand up to switch plate" },
        { name: "Contact Align", desc: "Point index finger at rocker" },
        { name: "Rapid Thrust", desc: "Flick hand upward to flip ON" },
        { name: "Contact Sustain", desc: "Hold position steady 1 sec" },
        { name: "Downward Retract", desc: "Return hand to home base" },
      ],
    },
    thermostat: {
      name: "🎛️ Rotary Thermostat",
      steps: [
        { name: "Neutral Rest", desc: "Hand relaxed in lap/ready" },
        { name: "Planar Approach", desc: "Reach hand to thermostat dial" },
        { name: "Dial Grasp", desc: "Form circular grip on outer rim" },
        { name: "Arc Rotation", desc: "Rotate smoothly to 24°C" },
        { name: "Target Sustain", desc: "Hold at 24°C for 1 sec" },
        { name: "Home Return", desc: "Retract hand to neutral base" },
      ],
    },
    pin: {
      name: "🔢 Touchless PIN Pad",
      steps: [
        { name: "Neutral Rest", desc: "Hand poised in front" },
        { name: "Enter Digit 1", desc: "Hover index fingertip on 1" },
        { name: "Enter Digit 2", desc: "Hover index fingertip on 2" },
        { name: "Enter Digit 3", desc: "Hover index fingertip on 3" },
        { name: "Enter Digit 4", desc: "Hover index fingertip on 4" },
        { name: "Code Confirmed", desc: "Retract hand to complete rep" },
      ],
    },
    faucet: {
      name: "🚰 Water Faucet Twist",
      steps: [
        { name: "Neutral Rest", desc: "Hand at home base" },
        { name: "Forward Reach", desc: "Reach hand toward faucet valve" },
        { name: "Cylindrical Grasp", desc: "Wrap hand around handle" },
        { name: "Rotary Torque", desc: "Rotate handle 180° clockwise" },
        { name: "Flow Sustain", desc: "Hold open while water flows" },
        { name: "Retract Home", desc: "Retract hand to neutral base" },
      ],
    },
    pill: {
      name: "💊 Pill Bottle Cap Twist",
      steps: [
        { name: "Neutral Rest", desc: "Hand relaxed at start" },
        { name: "Overhead Reach", desc: "Position palm directly above cap" },
        { name: "Axial Depression", desc: "Press downward onto childproof cap" },
        { name: "Counter-Twist", desc: "Twist counter-clockwise 60°" },
        { name: "Cap Release", desc: "Hold open cap steady 1 sec" },
        { name: "Home Return", desc: "Retract hand to finish cycle" },
      ],
    },
  };

  // --- SVG Generator: Dark Navy `#070D18`, Light Blue `#38BDF8`, Yellow `#FBBF24` ---
  function getAdlStepSvg(taskKey, stepIndex) {
    const dots = "#38BDF8";
    const lines = "#FBBF24";
    const bg = "#070D18";
    const amber = "#F59E0B";

    // 6 Distinct Posture Variations based on Step Index (0 to 5)
    let body = "";
    switch (stepIndex) {
      case 0: // Neutral Rest
        body = `
          <line x1="20" y1="65" x2="38" y2="52" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="38" y1="52" x2="52" y2="40" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="52" y1="40" x2="62" y2="34" stroke="${lines}" stroke-width="2" stroke-linecap="round"/>
          <circle cx="20" cy="65" r="3.5" fill="${dots}"/>
          <circle cx="38" cy="52" r="3.5" fill="${dots}"/>
          <circle cx="52" cy="40" r="3.5" fill="${dots}"/>
          <circle cx="62" cy="34" r="3" fill="${dots}"/>
          <circle cx="82" cy="24" r="7" fill="none" stroke="${amber}" stroke-width="1.5" stroke-dasharray="2 2"/>
        `;
        break;
      case 1: // Forward Reach
        body = `
          <line x1="18" y1="62" x2="42" y2="46" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="42" y1="46" x2="66" y2="30" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="66" y1="30" x2="76" y2="24" stroke="${lines}" stroke-width="2" stroke-linecap="round"/>
          <circle cx="18" cy="62" r="3.5" fill="${dots}"/>
          <circle cx="42" cy="46" r="3.5" fill="${dots}"/>
          <circle cx="66" cy="30" r="3.5" fill="${dots}"/>
          <circle cx="76" cy="24" r="3" fill="${dots}"/>
          <circle cx="82" cy="24" r="7" fill="none" stroke="${amber}" stroke-width="2"/>
        `;
        break;
      case 2: // Contact Align
        body = `
          <line x1="22" y1="58" x2="48" y2="42" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="48" y1="42" x2="74" y2="28" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="74" y1="28" x2="80" y2="24" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="74" y1="28" x2="78" y2="20" stroke="${lines}" stroke-width="2" stroke-linecap="round"/>
          <circle cx="22" cy="58" r="3.5" fill="${dots}"/>
          <circle cx="48" cy="42" r="3.5" fill="${dots}"/>
          <circle cx="74" cy="28" r="3.5" fill="${dots}"/>
          <circle cx="80" cy="24" r="3" fill="${dots}"/>
          <circle cx="78" cy="20" r="3" fill="${dots}"/>
          <rect x="76" y="16" width="12" height="16" rx="2" fill="none" stroke="${amber}" stroke-width="1.8"/>
        `;
        break;
      case 3: // Motor Action Execution (Rotated / Flicked)
        body = `
          <line x1="25" y1="56" x2="52" y2="40" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="52" y1="40" x2="76" y2="34" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="76" y1="34" x2="84" y2="22" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="25" cy="56" r="3.5" fill="${dots}"/>
          <circle cx="52" cy="40" r="3.5" fill="${dots}"/>
          <circle cx="76" cy="34" r="3.5" fill="${dots}"/>
          <circle cx="84" cy="22" r="3.5" fill="${dots}"/>
          <path d="M 72 16 A 10 10 0 1 1 88 28" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round"/>
          <polyline points="86,22 88,28 82,28" fill="none" stroke="#10B981" stroke-width="2"/>
        `;
        break;
      case 4: // Peak Sustain (Hold Steady)
        body = `
          <line x1="25" y1="56" x2="52" y2="40" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="52" y1="40" x2="76" y2="34" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="76" y1="34" x2="84" y2="22" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="25" cy="56" r="3.5" fill="${dots}"/>
          <circle cx="52" cy="40" r="3.5" fill="${dots}"/>
          <circle cx="76" cy="34" r="3.5" fill="${dots}"/>
          <circle cx="84" cy="22" r="3.5" fill="${dots}"/>
          <circle cx="84" cy="22" r="8" fill="none" stroke="#F59E0B" stroke-width="2"/>
          <circle cx="84" cy="22" r="12" fill="none" stroke="#10B981" stroke-width="1" stroke-dasharray="3 3"/>
        `;
        break;
      case 5: // Home Return
        body = `
          <line x1="22" y1="62" x2="40" y2="50" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="40" y1="50" x2="55" y2="42" stroke="${lines}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="55" y1="42" x2="64" y2="36" stroke="${lines}" stroke-width="2" stroke-linecap="round"/>
          <circle cx="22" cy="62" r="3.5" fill="${dots}"/>
          <circle cx="40" cy="50" r="3.5" fill="${dots}"/>
          <circle cx="55" cy="42" r="3.5" fill="${dots}"/>
          <circle cx="64" cy="36" r="3" fill="${dots}"/>
          <polyline points="72,26 62,32 68,38" fill="none" stroke="#38BDF8" stroke-width="2" stroke-linecap="round"/>
        `;
        break;
    }

    return `<svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg" style="background:${bg}; border-radius:6px; display:block;">
      <rect width="100" height="80" fill="${bg}"/>
      ${body}
    </svg>`;
  }

  // --- Render 6 Step Cards into `#adl-steps-bar` ---
  function renderStepCards(taskKey) {
    if (!stepsBar) return;
    const taskInfo = ADL_TASKS[taskKey];
    if (!taskInfo) {
      stepsBar.style.display = "none";
      return;
    }

    stepsBar.innerHTML = "";
    taskInfo.steps.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = `adl-step-card ${idx === currentStepIndex ? "active" : ""}`;
      card.id = `adl-card-${idx}`;
      card.dataset.step = idx;
      card.innerHTML = `
        <div class="step-badge">STEP ${idx + 1}</div>
        <div class="step-svg-wrap">${getAdlStepSvg(taskKey, idx)}</div>
        <div class="step-title">${step.name}</div>
        <div class="step-desc">${step.desc}</div>
      `;
      stepsBar.appendChild(card);
    });
    stepsBar.style.display = "grid";
  }

  function updateStepCardsUI() {
    const taskInfo = ADL_TASKS[currentTask];
    if (!taskInfo) return;

    for (let i = 0; i < 6; i++) {
      const card = document.getElementById(`adl-card-${i}`);
      if (!card) continue;
      card.classList.remove("active", "matched");
      if (i < currentStepIndex) {
        card.classList.add("matched");
      } else if (i === currentStepIndex) {
        card.classList.add("active");
      }
    }

    if (stepEl && taskInfo.steps[currentStepIndex]) {
      stepEl.textContent = `Step ${currentStepIndex + 1}: ${taskInfo.steps[currentStepIndex].name}`;
    }
  }

  // --- Advance to Next Step ---
  function advanceStep() {
    lastAdlActionTime = Date.now();
    stepStartTime = Date.now();
    const taskInfo = ADL_TASKS[currentTask];
    if (!taskInfo) return;

    if (window.RehabBio) {
      window.RehabBio.playBeep(660 + currentStepIndex * 70, 0.08, 0.25);
    }

    currentStepIndex++;
    if (currentStepIndex >= 6) {
      // Completed full 6-step clinical cycle!
      repsCompleted++;
      if (repsEl) repsEl.textContent = `${repsCompleted} / ${targetReps}`;
      if (window.RehabBio) {
        window.RehabBio.speak(`Repetition ${repsCompleted} complete! Excellent!`);
      }

      if (repsCompleted >= targetReps) {
        tasksCompleted++;
        showToast(`🎉 ${taskInfo.name} Completed! (${targetReps} reps)`, "success");
        currentStepIndex = 5;
        updateStepCardsUI();
        setTimeout(() => {
          stopAdl();
        }, 2200);
        return;
      } else {
        showToast(`✅ Rep ${repsCompleted} of ${targetReps} complete! Return to Step 1`, "info");
        currentStepIndex = 0;
        resetTaskVariables();
      }
    }

    updateStepCardsUI();
  }

  function resetTaskVariables() {
    keyRotation = 0;
    switchOn = false;
    thermostatTemp = 18;
    pinProgress = 0;
    dwellTarget = -1;
    faucetAngle = 0;
    waterFlowing = false;
    pillDepressed = false;
    pillAngle = 0;
  }

  // --- Guidance Popup Content & 10s Inactivity Re-trigger ---
  const ADL_GUIDES = {
    key: {
      title: "🔑 90° Door Key Turn",
      what: "Rotate the deadbolt key 90° clockwise to unlock the door.",
      how: "Turn forearm like turning a key in a lock. Follow the 6 visual steps at the bottom of the screen.",
      tip: "Retrains active forearm pronation & supination (knuckle coronal vector).",
    },
    light: {
      title: "💡 Rocker Light Switch",
      what: "Flip the wall light switch ON and OFF.",
      how: "Perform a rapid upward hand thrust to flip the rocker switch up.",
      tip: "Retrains ballistic wrist & finger extension against gravity.",
    },
    thermostat: {
      title: "🎛️ Rotary Thermostat",
      what: "Adjust dial smoothly from 18°C up to 24°C.",
      how: "Trace a circular clockwise arc around the dial with your index finger.",
      tip: "Retrains circular planar coordination and smooth velocity control.",
    },
    pin: {
      title: "🔢 Touchless PIN Pad",
      what: "Enter security code: 1 → 2 → 3 → 4.",
      how: "Hover index fingertip steadily over digit 1, 2, 3, then 4 until the dwell ring completes.",
      tip: "Retrains tremor dampening and steady isometric hover target control.",
    },
    faucet: {
      title: "🚰 Water Faucet Twist",
      what: "Twist faucet handle 180° clockwise to start water.",
      how: "Wrap hand around handle and turn clockwise. Water flows when fully opened.",
      tip: "Retrains cylindrical grasp strength and rotational torque.",
    },
    pill: {
      title: "💊 Pill Bottle Cap Twist",
      what: "Depress childproof cap downward and twist 60° counter-clockwise.",
      how: "Press downward onto the cap with palm, then twist inward.",
      tip: "Retrains axial compression combined with fine motor rotational decoupling.",
    },
  };

  let adlGuidanceInterval = null;
  let adlGuidanceShowing = false;

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

    if (adlGuidanceInterval) clearInterval(adlGuidanceInterval);

    const sTime = Date.now();
    const totalMs = durationSec * 1000;
    const timerFill = document.getElementById("agp-timer-fill");
    const timerText = document.getElementById("agp-timer-text");

    adlGuidanceInterval = setInterval(() => {
      const elapsed = Date.now() - sTime;
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
    if (adlGuidanceInterval) clearInterval(adlGuidanceInterval);
    adlGuidanceInterval = null;
    adlGuidanceShowing = false;
    lastAdlActionTime = Date.now();
  }

  const agpDismiss = document.getElementById("agp-dismiss");
  if (agpDismiss) agpDismiss.addEventListener("click", hideAdlGuidancePopup);

  const agpGotIt = document.getElementById("agp-got-it");
  if (agpGotIt) agpGotIt.addEventListener("click", hideAdlGuidancePopup);

  // --- Camera & MediaPipe Hands ---
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.7, minTrackingConfidence: 0.5 });
  hands.onResults(onHandResults);

  async function initCamera() {
    adlCamera = new RehabCamera("video", async (v) => { await hands.send({ image: v }); });
    const ok = await adlCamera.initialize();
    if (ok) {
      cameraActive = true;
      updateMirrorUI();
      if (btnCam) {
        btnCam.textContent = "📷 Camera: ON";
        btnCam.classList.remove("danger");
      }
      showToast("✅ Camera active — choose a task!", "success");
    }
  }

  // Dedicated Camera ON / OFF Toggle Button
  if (btnCam) {
    btnCam.addEventListener("click", async () => {
      if (cameraActive) {
        if (adlCamera) adlCamera.stop();
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
        showToast("📷 Camera resumed", "success");
      }
    });
  }

  function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
      return;
    }
    // Map landmarks based on mirror mode (P7: Natural Left = Left)
    const lm = results.multiHandLandmarks[0].map((p) => ({
      x: isMirrored ? (1 - p.x) : p.x,
      y: p.y,
      z: p.z || 0,
    }));

    const indexTip = lm[8];
    const thumbTip = lm[4];
    const wrist = lm[0];
    const indexMCP = lm[5];
    const pinkyMCP = lm[17];

    handPos = { x: indexTip.x, y: indexTip.y };

    // Pincer distance
    const pincerDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

    // Knuckle coronal vector (wrist supination/rotation)
    const knuckleDx = indexMCP.x - pinkyMCP.x;
    const knuckleDy = indexMCP.y - pinkyMCP.y;
    const knuckleAngle = Math.atan2(knuckleDy, knuckleDx) * (180 / Math.PI);

    wristData = { indexTip, thumbTip, wrist, indexMCP, pinkyMCP, pincerDist, knuckleAngle };

    if (currentTask !== "menu") {
      evaluateStepProgression();
      updateTask();
    }

    drawHandSkeleton(lm);
  }

  function drawHandSkeleton(lm) {
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    const w = handCanvas.width, h = handCanvas.height;
    handCtx.strokeStyle = "rgba(56, 189, 248, 0.4)";
    handCtx.lineWidth = 2;
    ADL_HAND_CONNECTIONS.forEach(([a, b]) => {
      handCtx.beginPath();
      handCtx.moveTo(lm[a].x * w, lm[a].y * h);
      handCtx.lineTo(lm[b].x * w, lm[b].y * h);
      handCtx.stroke();
    });

    // Joints in light blue `#38BDF8`
    lm.forEach((p, idx) => {
      handCtx.beginPath();
      handCtx.arc(p.x * w, p.y * h, idx === 8 ? 6 : 3, 0, Math.PI * 2);
      handCtx.fillStyle = idx === 8 ? "#FBBF24" : "#38BDF8";
      handCtx.fill();
    });
  }

  // --- Pure Deterministic 6-Step Gate Evaluation ---
  function evaluateStepProgression() {
    if (adlPaused || currentTask === "menu" || !wristData) return;
    const cx = 0.5, cy = 0.46;
    const distToTarget = Math.hypot(handPos.x - cx, handPos.y - cy);
    const now = Date.now();

    switch (currentStepIndex) {
      case 0: // Step 1: Neutral Rest (Hand at ready base, distance > 0.22)
        if (distToTarget > 0.20 || handPos.y > 0.65) {
          if (now - stepStartTime >= 500) advanceStep();
        }
        break;

      case 1: // Step 2: Forward Reach (Approaching target center < 0.22)
        if (distToTarget < 0.22) {
          advanceStep();
        }
        break;

      case 2: // Step 3: Contact Align (Entering active target zone < 0.15)
        if (distToTarget < 0.15) {
          advanceStep();
        }
        break;

      case 3: // Step 4: Motor Action Execution
        let actionDone = false;
        if (currentTask === "key") {
          actionDone = keyRotation >= 85;
        } else if (currentTask === "light") {
          actionDone = switchOn === true;
        } else if (currentTask === "thermostat") {
          actionDone = thermostatTemp >= 23.5;
        } else if (currentTask === "pin") {
          actionDone = pinProgress >= 4;
        } else if (currentTask === "faucet") {
          actionDone = faucetAngle >= 150;
        } else if (currentTask === "pill") {
          actionDone = pillDepressed && pillAngle >= 50;
        }
        if (actionDone) advanceStep();
        break;

      case 4: // Step 5: Peak Sustain (Hold for 1.0 second)
        if (now - stepStartTime >= 1000) {
          advanceStep();
        }
        break;

      case 5: // Step 6: Home Return (Retract hand back to base > 0.22)
        if (distToTarget > 0.22 || handPos.y > 0.65) {
          advanceStep();
        }
        break;
    }
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
      stepStartTime = Date.now();
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
    currentStepIndex = 0;
    repsCompleted = 0;
    resetTaskVariables();

    // Turn off camera hardware LED when session stops
    if (cameraActive) {
      if (adlCamera) adlCamera.stop();
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

    document.getElementById("task-menu").classList.remove("hidden");
    document.getElementById("adl-paused-overlay").classList.remove("show");
    document.getElementById("adl-countdown-overlay").classList.remove("show");
    if (stepsBar) stepsBar.style.display = "none";
    document.getElementById("adl-pause").style.display = "none";
    document.getElementById("adl-resume").style.display = "none";
    document.getElementById("adl-stop").style.display = "none";
    taskEl.textContent = "Choose a task";
    if (stepEl) stepEl.textContent = "Ready";
    if (repsEl) repsEl.textContent = `0 / ${targetReps}`;
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  }

  document.getElementById("adl-pause").addEventListener("click", pauseAdl);
  document.getElementById("adl-resume").addEventListener("click", resumeAdl);
  document.getElementById("modal-adl-resume").addEventListener("click", resumeAdl);
  document.getElementById("adl-stop").addEventListener("click", stopAdl);
  document.getElementById("modal-adl-stop").addEventListener("click", stopAdl);

  // --- Task Selection from Menu ---
  document.querySelectorAll(".task-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedTask = btn.dataset.task;
      if (!cameraActive) {
        initCamera();
      }
      document.getElementById("task-menu").classList.add("hidden");
      taskEl.textContent = btn.textContent.trim().split("\n")[0];
      if (stepEl) stepEl.textContent = "Step 1: Neutral Rest";
      if (repsEl) repsEl.textContent = `0 / ${targetReps}`;

      runAdlCountdown("GET READY", 4, () => {
        currentTask = selectedTask;
        currentStepIndex = 0;
        repsCompleted = 0;
        tasksCompleted = 0;
        resetTaskVariables();
        startTime = Date.now();
        stepStartTime = Date.now();
        lastAdlActionTime = Date.now();

        renderStepCards(selectedTask);
        updateStepCardsUI();

        document.getElementById("adl-pause").style.display = "inline-flex";
        document.getElementById("adl-resume").style.display = "none";
        document.getElementById("adl-stop").style.display = "inline-flex";
        showToast(`🔑 Task Started: ${taskEl.textContent}`, "info");
        showAdlGuidancePopup(selectedTask, 4);
      });
    });
  });

  // --- 6 Task Rendering Engines (Translucent, Non-Cluttering AR Overlays) ---
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
      case "faucet":
        drawFaucetTask(hx, hy);
        break;
      case "pill":
        drawPillTask(hx, hy);
        break;
    }
  }

  // 1. 🔑 Key Task
  function drawKeyTask(hx, hy) {
    const cx = gameCanvas.width * 0.5, cy = gameCanvas.height * 0.46;

    // Outer deadbolt plate (translucent dark metal)
    gCtx.fillStyle = "rgba(20, 24, 34, 0.78)";
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(cx - 70, cy - 50, 140, 100, 12);
    gCtx.fill();
    gCtx.stroke();

    // Key cylinder
    gCtx.beginPath();
    gCtx.arc(cx, cy, 26, 0, Math.PI * 2);
    gCtx.fillStyle = "rgba(10, 13, 20, 0.9)";
    gCtx.fill();
    gCtx.strokeStyle = "#FBBF24";
    gCtx.lineWidth = 2.5;
    gCtx.stroke();

    // Knuckle rotation computation (Vector math)
    if (wristData && currentStepIndex >= 3) {
      if (wristData.knuckleAngle !== undefined) {
        // Map angle changes to 0 - 90 deg
        keyRotation = Math.max(keyRotation, Math.min(keyTarget, Math.abs(wristData.knuckleAngle) * 1.1));
      }
    }

    // Key body
    gCtx.save();
    gCtx.translate(cx, cy);
    gCtx.rotate((keyRotation * Math.PI) / 180);

    gCtx.fillStyle = "#FBBF24";
    gCtx.fillRect(-5, -45, 10, 50);

    gCtx.beginPath();
    gCtx.arc(0, -48, 14, 0, Math.PI * 2);
    gCtx.fillStyle = "#F59E0B";
    gCtx.fill();
    gCtx.strokeStyle = "#FBBF24";
    gCtx.lineWidth = 2;
    gCtx.stroke();

    gCtx.fillStyle = "#FBBF24";
    gCtx.fillRect(5, -22, 10, 4);
    gCtx.fillRect(5, -14, 7, 4);
    gCtx.restore();

    // 90° Arc Guide
    gCtx.beginPath();
    gCtx.arc(cx, cy, 55, -Math.PI / 2, -Math.PI / 2 + (keyRotation / keyTarget) * (Math.PI / 2));
    gCtx.strokeStyle = keyRotation >= keyTarget ? "#10B981" : "#F59E0B";
    gCtx.lineWidth = 5;
    gCtx.stroke();
  }

  // 2. 💡 Light Switch Task
  function drawLightTask(hx, hy) {
    const cx = gameCanvas.width * 0.5, cy = gameCanvas.height * 0.46;

    // Switch plate
    gCtx.fillStyle = "rgba(20, 24, 34, 0.82)";
    gCtx.strokeStyle = switchOn ? "#10B981" : "#64748B";
    gCtx.lineWidth = 2.5;
    gCtx.beginPath();
    gCtx.roundRect(cx - 36, cy - 65, 72, 130, 10);
    gCtx.fill();
    gCtx.stroke();

    // Rocker toggle
    gCtx.fillStyle = switchOn ? "#10B981" : "#475569";
    gCtx.beginPath();
    gCtx.roundRect(cx - 24, switchOn ? cy - 50 : cy, 48, 50, 6);
    gCtx.fill();

    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.fillStyle = switchOn ? "#070D18" : "#94A3B8";
    gCtx.fillText("ON", cx - 10, cy - 25);
    gCtx.fillStyle = switchOn ? "#94A3B8" : "#FFFFFF";
    gCtx.fillText("OFF", cx - 12, cy + 32);

    // Ballistic flick detection
    if (wristData && wristData.indexTip && currentStepIndex >= 2) {
      const currentY = wristData.indexTip.y;
      const thrust = currentY - lastThrustY;
      if (thrust < -0.06 && !switchOn) {
        switchOn = true;
        if (window.RehabBio) window.RehabBio.playBeep(880, 0.08, 0.3);
      }
      lastThrustY = currentY;
    }
  }

  // 3. 🎛️ Rotary Thermostat Task
  function drawThermostatTask(hx, hy) {
    const cx = gameCanvas.width * 0.5, cy = gameCanvas.height * 0.46;
    const r = 75;

    // Dial ring
    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.fillStyle = "rgba(15, 20, 30, 0.84)";
    gCtx.fill();
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 3;
    gCtx.stroke();

    // Arc from 18°C to 24°C
    const startAngle = -Math.PI * 0.75;
    const progress = (thermostatTemp - tempMin) / (tempMax - tempMin);
    const endAngle = startAngle + progress * Math.PI * 1.5;

    gCtx.beginPath();
    gCtx.arc(cx, cy, r - 12, startAngle, endAngle);
    gCtx.strokeStyle = thermostatTemp >= 23.5 ? "#10B981" : "#F59E0B";
    gCtx.lineWidth = 7;
    gCtx.stroke();

    // Digital readout
    gCtx.font = "bold 28px monospace";
    gCtx.fillStyle = "#E2E8F0";
    gCtx.textAlign = "center";
    gCtx.fillText(`${thermostatTemp.toFixed(1)}°C`, cx, cy + 8);
    gCtx.font = "11px Inter, sans-serif";
    gCtx.fillStyle = "#94A3B8";
    gCtx.fillText("GOAL: 24.0°C", cx, cy + 28);
    gCtx.textAlign = "start";

    // Circular tracking
    if (wristData && wristData.indexTip && currentStepIndex >= 3) {
      const angle = Math.atan2(wristData.indexTip.y - 0.46, wristData.indexTip.x - 0.5);
      if (lastThermostatAngle !== null) {
        let delta = angle - lastThermostatAngle;
        if (delta > Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        if (delta > 0.02 && delta < 0.6) {
          thermostatTemp = Math.min(tempMax, thermostatTemp + delta * 3.5);
        }
      }
      lastThermostatAngle = angle;
    }
  }

  // 4. 🔢 Touchless PIN Pad Task
  function drawPinTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;

    // PIN Display banner
    gCtx.fillStyle = "rgba(7, 13, 24, 0.88)";
    gCtx.beginPath();
    gCtx.roundRect(w * 0.35, h * 0.12, w * 0.3, 38, 8);
    gCtx.fill();
    gCtx.strokeStyle = "#38BDF8";
    gCtx.stroke();

    gCtx.font = "bold 18px monospace";
    gCtx.fillStyle = "#FBBF24";
    gCtx.textAlign = "center";
    const stars = "● ".repeat(pinProgress) + "○ ".repeat(4 - pinProgress);
    gCtx.fillText(`CODE: ${stars}`, w * 0.5, h * 0.12 + 25);
    gCtx.textAlign = "start";

    padPositions.forEach((pos, i) => {
      const px = pos.x * w, py = pos.y * h;
      const isCompleted = i < pinProgress;
      const isTarget = currentStepIndex >= 1 && currentStepIndex <= 4 && padLabels[i] === String(PIN[currentStepIndex - 1]);
      const isDwelling = dwellTarget === i;

      gCtx.beginPath();
      gCtx.arc(px, py, 26, 0, Math.PI * 2);
      gCtx.fillStyle = isCompleted ? "rgba(16, 185, 129, 0.8)" : isTarget ? "rgba(245, 158, 11, 0.25)" : "rgba(15, 20, 32, 0.8)";
      gCtx.fill();
      gCtx.strokeStyle = isCompleted ? "#10B981" : isTarget ? "#F59E0B" : "#38BDF8";
      gCtx.lineWidth = isTarget ? 3 : 1.5;
      gCtx.stroke();

      if (isDwelling) {
        const elapsed = Date.now() - dwellStart;
        const prog = Math.min(1, elapsed / DWELL_MS);
        gCtx.beginPath();
        gCtx.arc(px, py, 32, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        gCtx.strokeStyle = "#10B981";
        gCtx.lineWidth = 4;
        gCtx.stroke();
      }

      gCtx.font = "bold 15px monospace";
      gCtx.fillStyle = isCompleted ? "#070D18" : "#E2E8F0";
      gCtx.textAlign = "center";
      gCtx.fillText(padLabels[i], px, py + 5);
    });
    gCtx.textAlign = "start";

    // Dwell check
    if (wristData && wristData.indexTip && currentStepIndex >= 1 && currentStepIndex <= 4) {
      const targetDigit = String(PIN[currentStepIndex - 1]);
      const targetIdx = padLabels.indexOf(targetDigit);
      const target = padPositions[targetIdx];
      const dist = Math.hypot(handPos.x - target.x, handPos.y - target.y);

      if (dist < 0.08) {
        if (dwellTarget !== targetIdx) {
          dwellTarget = targetIdx;
          dwellStart = Date.now();
        } else if (Date.now() - dwellStart >= DWELL_MS) {
          pinProgress++;
          dwellTarget = -1;
          showToast(`🔢 Digit ${targetDigit} accepted`, "info");
          advanceStep();
        }
      } else {
        if (dwellTarget === targetIdx) dwellTarget = -1;
      }
    }
  }

  // 5. 🚰 Water Faucet Task
  function drawFaucetTask(hx, hy) {
    const cx = gameCanvas.width * 0.5, cy = gameCanvas.height * 0.46;

    // Faucet neck
    gCtx.strokeStyle = "#94A3B8";
    gCtx.lineWidth = 14;
    gCtx.lineCap = "round";
    gCtx.beginPath();
    gCtx.moveTo(cx - 50, cy + 50);
    gCtx.lineTo(cx - 50, cy - 30);
    gCtx.arcTo(cx - 50, cy - 70, cx, cy - 70, 30);
    gCtx.lineTo(cx + 30, cy - 70);
    gCtx.lineTo(cx + 30, cy - 45);
    gCtx.stroke();

    // Water flow animation if opened
    if (faucetAngle >= 140) {
      waterFlowing = true;
      gCtx.strokeStyle = "rgba(56, 189, 248, 0.7)";
      gCtx.lineWidth = 8;
      gCtx.beginPath();
      gCtx.moveTo(cx + 30, cy - 45);
      gCtx.lineTo(cx + 30, cy + 70);
      gCtx.stroke();
    }

    // Rotary Valve Handle
    gCtx.save();
    gCtx.translate(cx - 50, cy - 10);
    gCtx.rotate((faucetAngle * Math.PI) / 180);

    gCtx.fillStyle = "#38BDF8";
    gCtx.fillRect(-28, -6, 56, 12);
    gCtx.fillRect(-6, -28, 12, 56);
    gCtx.beginPath();
    gCtx.arc(0, 0, 10, 0, Math.PI * 2);
    gCtx.fillStyle = "#F59E0B";
    gCtx.fill();
    gCtx.restore();

    // Hand torque detection
    if (wristData && currentStepIndex >= 3) {
      faucetAngle = Math.min(180, faucetAngle + 1.2);
    }
  }

  // 6. 💊 Pill Bottle Task
  function drawPillTask(hx, hy) {
    const cx = gameCanvas.width * 0.5, cy = gameCanvas.height * 0.46;

    // Bottle body
    gCtx.fillStyle = "rgba(245, 158, 11, 0.35)";
    gCtx.strokeStyle = "#F59E0B";
    gCtx.lineWidth = 2.5;
    gCtx.beginPath();
    gCtx.roundRect(cx - 40, cy - 10, 80, 110, 10);
    gCtx.fill();
    gCtx.stroke();

    // White childproof cap
    const capY = pillDepressed ? cy - 22 : cy - 32;
    gCtx.fillStyle = "#F8FAFC";
    gCtx.strokeStyle = "#64748B";
    gCtx.lineWidth = 2;
    gCtx.save();
    gCtx.translate(cx, capY);
    gCtx.rotate((-pillAngle * Math.PI) / 180);
    gCtx.fillRect(-34, -12, 68, 24);
    gCtx.strokeRect(-34, -12, 68, 24);
    gCtx.restore();

    // Downward depression + twist detection
    if (wristData && currentStepIndex >= 2) {
      if (Math.hypot(handPos.x - 0.5, handPos.y - 0.40) < 0.12) {
        pillDepressed = true;
        if (currentStepIndex >= 3) {
          pillAngle = Math.min(60, pillAngle + 1.5);
        }
      }
    }
  }

  // --- Continuous 60 FPS Render Loop & 10s Inactivity Popup ---
  function adlRenderLoop() {
    requestAnimationFrame(adlRenderLoop);
    if (currentTask !== "menu" && !adlPaused) {
      updateTask();

      // If user is idle or stuck on a step for 10 seconds, trigger guidance popup!
      if (!adlGuidanceShowing && Date.now() - lastAdlActionTime >= 10000) {
        showAdlGuidancePopup(currentTask, 4);
        lastAdlActionTime = Date.now();
      }
    }
  }
  adlRenderLoop();

  // Pointer / Touch fallback for interactive testing on laptops, touchpads, and phones
  gameCanvas.addEventListener("pointerdown", (e) => {
    if (adlPaused || currentTask === "menu") return;
    lastAdlActionTime = Date.now();
    const rect = gameCanvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    handPos = { x: nx, y: ny };

    if (currentTask === "pin") {
      padPositions.forEach((pos, i) => {
        if (Math.hypot(nx - pos.x, ny - pos.y) < 0.08) {
          if (currentStepIndex >= 1 && currentStepIndex <= 4 && padLabels[i] === String(PIN[currentStepIndex - 1])) {
            pinProgress++;
            showToast(`🔢 Digit ${padLabels[i]} accepted`, "info");
            advanceStep();
          }
        }
      });
    } else if (currentTask === "light") {
      switchOn = true;
      advanceStep();
    } else if (currentTask === "key") {
      keyRotation = Math.min(keyTarget, keyRotation + 30);
      if (keyRotation >= keyTarget) advanceStep();
    } else if (currentTask === "thermostat") {
      thermostatTemp = Math.min(tempMax, thermostatTemp + 2.0);
      if (thermostatTemp >= tempMax) advanceStep();
    } else if (currentTask === "faucet") {
      faucetAngle = Math.min(180, faucetAngle + 60);
      if (faucetAngle >= 150) advanceStep();
    } else if (currentTask === "pill") {
      pillDepressed = true;
      pillAngle = Math.min(60, pillAngle + 30);
      if (pillAngle >= 50) advanceStep();
    }
  });

  gameCanvas.addEventListener("pointermove", (e) => {
    if (adlPaused || currentTask === "menu") return;
    const rect = gameCanvas.getBoundingClientRect();
    handPos = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    if (!wristData) {
      wristData = {
        indexTip: handPos,
        thumbTip: { x: handPos.x - 0.04, y: handPos.y },
        wrist: { x: handPos.x, y: handPos.y + 0.15 },
        knuckleAngle: 45,
      };
    }
  });

  // --- Telemetry Logging ---
  async function logSession() {
    const duration = Math.floor((Date.now() - startTime) / 1000);
    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "ADL",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: Math.max(1, duration),
          peak_rom: 85,
          smoothness_score: 82,
          cheats_blocked: cheatsBlocked,
          score: repsCompleted,
          metrics_json: JSON.stringify({ task: currentTask, reps: repsCompleted, duration }),
        }),
      });
    } catch (err) {
      console.error("Telemetry error:", err);
    }
  }

  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { if (toast) toast.className = "toast"; }, 3000);
  }

  // Initialize camera
  await initCamera();
});
