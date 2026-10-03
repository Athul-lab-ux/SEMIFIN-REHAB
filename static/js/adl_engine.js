/**
 * RehabOpt AR — Session 4: ADL Functional Lab Engine (P4 Clinical Overhaul)
 * 4 Core Clinical Tasks with 6 Visual Skeletal Steps each:
 * 1. 🎈 Balloon Air Pump
 * 2. 🚰 4-Tank Water Reaction
 * 3. 💡 Rocker Light Switch
 * 4. 🔢 Touchless PIN Pad
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
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17],            // Palm knuckle base
  ];

  // Task Specific Motor States
  let switchOn = false;
  let lastThrustY = 0.5;

  // 1. Balloon Air Pump States
  let balloonLevel = 0; // 0 to 100%
  let balloonHandOpen = false;
  let balloonFullStartTime = null;
  let balloonPopped = false;
  let balloonPopTime = 0;
  let balloonParticles = [];
  let balloonPumps = 0;
  let lastPumpActionTime = 0;

  // 2. 4-Tank Water Reaction Game States
  let waterTanks = [
    { level: 0, secured: false },
    { level: 0, secured: false },
    { level: 0, secured: false },
    { level: 0, secured: false },
  ];
  let activeTankIndex = 0;
  let tankActivationTime = Date.now();
  let tanksSecuredCount = 0;
  let waterSplashParticles = [];
  let tankFillSpeed = 0.40;
  let lastTankPressTime = 0;

  // Randomized 4-digit PIN generator for cognitive-motor index finger tapping
  function generateRandomPin() {
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const seq = [];
    while (seq.length < 4) {
      const pick = digits[Math.floor(Math.random() * digits.length)];
      if (seq.length === 0 || pick !== seq[seq.length - 1]) {
        seq.push(pick);
      }
    }
    return seq;
  }

  let randomPin = generateRandomPin();
  let lastAnnouncedDigit = null;
  let pinProgress = 0;
  let dwellStart = 0;
  let dwellTarget = -1;
  const DWELL_MS = 600;
  const padPositions = [
    { x: 0.38, y: 0.28 }, { x: 0.50, y: 0.28 }, { x: 0.62, y: 0.28 },
    { x: 0.38, y: 0.45 }, { x: 0.50, y: 0.45 }, { x: 0.62, y: 0.45 },
    { x: 0.38, y: 0.62 }, { x: 0.50, y: 0.62 }, { x: 0.62, y: 0.62 },
    { x: 0.50, y: 0.78 },
  ];
  const padLabels = ["1","2","3","4","5","6","7","8","9","0"];

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

  // --- 6-Step Clinical Protocol Definitions for 4 Core Tasks ---
  const ADL_TASKS = {
    balloon: {
      name: "🎈 Balloon Air Pump",
      steps: [
        { name: "Neutral Rest", desc: "Hand relaxed at ready base" },
        { name: "Open Hand", desc: "Spread fingers wide for air intake" },
        { name: "Clench Fist", desc: "Squeeze tight fist to pump air" },
        { name: "Fill to 100%", desc: "Pump repeatedly until bar is full" },
        { name: "5s Caution Hold", desc: "Hold steady 5s — DO NOT over-pump!" },
        { name: "Rep Complete", desc: "Relax hand to complete rep" },
      ],
    },
    watertanks: {
      name: "🚰 4-Tank Water Reaction",
      steps: [
        { name: "Neutral Rest", desc: "Hand poised at ready base" },
        { name: "Tank 1 Reaction", desc: "Spot active filling tank & tap button" },
        { name: "Tank 2 Reaction", desc: "Fast tap on next filling tank" },
        { name: "Tank 3 Reaction", desc: "Fast tap on next filling tank" },
        { name: "Tank 4 Reaction", desc: "Fast tap on next filling tank" },
        { name: "All Tanks Secured", desc: "Return hand to home base" },
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
    pin: {
      name: "🔢 Touchless PIN Pad",
      steps: [
        { name: "Neutral Rest", desc: "Hand poised in front" },
        { name: "Enter Digit 1", desc: "Tap random digit with index finger" },
        { name: "Enter Digit 2", desc: "Tap random digit with index finger" },
        { name: "Enter Digit 3", desc: "Tap random digit with index finger" },
        { name: "Enter Digit 4", desc: "Tap random digit with index finger" },
        { name: "Code Confirmed", desc: "Retract hand to complete rep" },
      ],
    },
  };

  // --- SVG Generator: Dark Navy `#070D18`, Light Blue `#38BDF8`, Yellow `#FBBF24` ---
  function getAdlStepSvg(taskKey, stepIndex) {
    const dots = "#38BDF8";
    const lines = "#FBBF24";
    const bg = "#070D18";
    const amber = "#F59E0B";
    const green = "#10B981";
    const red = "#EF4444";

    let body = "";
    if (taskKey === "balloon") {
      switch (stepIndex) {
        case 0: // Neutral Rest
          body = `
            <circle cx="50" cy="35" r="14" fill="${red}" opacity="0.6"/>
            <line x1="50" y1="49" x2="50" y2="60" stroke="#94A3B8" stroke-width="1.5"/>
            <circle cx="50" cy="70" r="4" fill="${dots}"/>
          `;
          break;
        case 1: // Open Hand (Air Intake)
          body = `
            <circle cx="50" cy="30" r="16" fill="${red}" opacity="0.7"/>
            <line x1="25" y1="58" x2="35" y2="46" stroke="${lines}" stroke-width="2"/>
            <line x1="40" y1="58" x2="45" y2="44" stroke="${lines}" stroke-width="2"/>
            <line x1="50" y1="58" x2="50" y2="42" stroke="${lines}" stroke-width="2"/>
            <line x1="60" y1="58" x2="55" y2="44" stroke="${lines}" stroke-width="2"/>
            <line x1="75" y1="58" x2="65" y2="46" stroke="${lines}" stroke-width="2"/>
            <circle cx="50" cy="65" r="6" fill="${dots}"/>
          `;
          break;
        case 2: // Clench Fist (Pump)
          body = `
            <circle cx="50" cy="28" r="19" fill="${red}" opacity="0.8"/>
            <circle cx="50" cy="58" r="10" fill="${amber}"/>
            <path d="M 50 48 L 50 62 M 46 56 L 50 62 L 54 56" stroke="#FFFFFF" stroke-width="2"/>
          `;
          break;
        case 3: // Fill to 100%
          body = `
            <circle cx="50" cy="28" r="22" fill="${red}"/>
            <rect x="20" y="58" width="60" height="10" rx="5" fill="#1E293B" stroke="${dots}" stroke-width="1"/>
            <rect x="22" y="60" width="56" height="6" rx="3" fill="${green}"/>
          `;
          break;
        case 4: // 5s Caution Hold
          body = `
            <circle cx="50" cy="28" r="22" fill="${red}"/>
            <circle cx="50" cy="60" r="12" fill="${amber}" stroke="#FFFFFF" stroke-width="1.5"/>
            <text x="50" y="64" font-size="10" font-weight="bold" fill="#070D18" text-anchor="middle">5s</text>
          `;
          break;
        case 5: // Complete
          body = `
            <circle cx="50" cy="28" r="22" fill="${red}"/>
            <circle cx="50" cy="60" r="12" fill="${green}"/>
            <path d="M 44 60 L 48 64 L 56 56" stroke="#FFFFFF" stroke-width="2" fill="none"/>
          `;
          break;
      }
    } else if (taskKey === "watertanks") {
      switch (stepIndex) {
        case 0: // Neutral Rest
          body = `
            <line x1="15" y1="20" x2="85" y2="20" stroke="${dots}" stroke-width="3"/>
            <rect x="18" y="32" width="12" height="20" rx="2" fill="#1E293B" stroke="#64748B"/>
            <rect x="36" y="32" width="12" height="20" rx="2" fill="#1E293B" stroke="#64748B"/>
            <rect x="54" y="32" width="12" height="20" rx="2" fill="#1E293B" stroke="#64748B"/>
            <rect x="72" y="32" width="12" height="20" rx="2" fill="#1E293B" stroke="#64748B"/>
            <circle cx="50" cy="68" r="4" fill="${dots}"/>
          `;
          break;
        case 1:
        case 2:
        case 3:
        case 4: // Tank Reactions
          const tX = [24, 42, 60, 78][stepIndex - 1];
          body = `
            <line x1="15" y1="18" x2="85" y2="18" stroke="${dots}" stroke-width="3"/>
            <line x1="${tX}" y1="18" x2="${tX}" y2="30" stroke="${amber}" stroke-width="2"/>
            <rect x="${tX - 6}" y="30" width="12" height="20" rx="2" fill="#1E293B" stroke="${amber}" stroke-width="1.5"/>
            <rect x="${tX - 5}" y="38" width="10" height="11" rx="1" fill="${dots}"/>
            <circle cx="${tX}" cy="58" r="6" fill="${red}"/>
            <line x1="50" y1="74" x2="${tX}" y2="60" stroke="${green}" stroke-width="2" stroke-linecap="round"/>
            <circle cx="${tX}" cy="60" r="3" fill="${green}"/>
          `;
          break;
        case 5: // All Secured
          body = `
            <rect x="18" y="30" width="12" height="20" rx="2" fill="${green}" opacity="0.6"/>
            <rect x="36" y="30" width="12" height="20" rx="2" fill="${green}" opacity="0.6"/>
            <rect x="54" y="30" width="12" height="20" rx="2" fill="${green}" opacity="0.6"/>
            <rect x="72" y="30" width="12" height="20" rx="2" fill="${green}" opacity="0.6"/>
            <path d="M 42 66 L 48 72 L 60 60" stroke="${green}" stroke-width="2.5" fill="none"/>
          `;
          break;
      }
    } else {
      // Default skeletal stick poses for light and pin
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
        case 3: // Motor Action Execution
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
        case 4: // Peak Sustain
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
      if (currentTask === "pin" && currentStepIndex >= 1 && currentStepIndex <= 4) {
        const targetDigit = randomPin[currentStepIndex - 1];
        stepEl.textContent = `Step ${currentStepIndex + 1}: Tap Digit [ ${targetDigit} ] (Index Finger)`;
      } else if (currentTask === "watertanks" && currentStepIndex >= 1 && currentStepIndex <= 4) {
        stepEl.textContent = `Step ${currentStepIndex + 1}: Shut Filling Tank ${activeTankIndex + 1}!`;
      } else if (currentTask === "balloon" && currentStepIndex === 4) {
        stepEl.textContent = `Step 5: ⚠️ CAUTION: Hold Steady 5s (DO NOT PUMP!)`;
      } else {
        stepEl.textContent = `Step ${currentStepIndex + 1}: ${taskInfo.steps[currentStepIndex].name}`;
      }
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
        showToast(`🎉 Target ${targetReps} reps achieved! Keep practicing or click Stop when done.`, "success");
        if (window.RehabBio) {
          window.RehabBio.speak(`Goal achieved! ${repsCompleted} repetitions completed. Great work!`);
          window.RehabBio.playRepChime();
        }
        // Log telemetry without stopping session or killing camera
        logSession();
        // Allow patient to continue practicing without kicking them out
        currentStepIndex = 0;
        resetTaskVariables();
      } else {
        showToast(`✅ Rep ${repsCompleted} of ${targetReps} complete! Return to Step 1`, "info");
        currentStepIndex = 0;
        resetTaskVariables();
      }
    }

    updateStepCardsUI();
  }

  function resetTaskVariables() {
    switchOn = false;
    randomPin = generateRandomPin();
    lastAnnouncedDigit = null;
    pinProgress = 0;
    dwellTarget = -1;

    // Balloon Task reset
    balloonLevel = 0;
    balloonHandOpen = false;
    balloonFullStartTime = null;
    balloonPopped = false;
    balloonParticles = [];
    balloonPumps = 0;

    // Water Tanks reset
    waterTanks = [
      { level: 0, secured: false },
      { level: 0, secured: false },
      { level: 0, secured: false },
      { level: 0, secured: false },
    ];
    activeTankIndex = Math.floor(Math.random() * 4);
    tankActivationTime = Date.now();
    tanksSecuredCount = 0;
    waterSplashParticles = [];
  }

  // --- Guidance Popup Content & 10s Inactivity Re-trigger (4 Core Tasks) ---
  const ADL_GUIDES = {
    balloon: {
      title: "🎈 Balloon Air Pump",
      what: "Pump the balloon to 100% by opening and closing your hand, then hold steady 5s.",
      how: "Spread fingers wide to intake air, then squeeze a tight fist to pump. Once 100%, hold still for 5 seconds — DO NOT pump again or it pops!",
      tip: "Retrains repetitive finger extension & flexion coordination, grip control, and response inhibition.",
    },
    watertanks: {
      title: "🚰 4-Tank Water Reaction",
      what: "Quickly tap the button of whichever water tank starts filling.",
      how: "Watch the 4 tanks. When a tank starts filling with water, quickly reach and tap its shutoff button with your index finger.",
      tip: "Retrains rapid visual-motor reaction speed, targeted index pointing, and spatial reach.",
    },
    light: {
      title: "💡 Rocker Light Switch",
      what: "Flip the wall light switch ON and OFF.",
      how: "Perform a rapid upward hand thrust to flip the rocker switch up.",
      tip: "Retrains ballistic wrist & finger extension against gravity.",
    },
    pin: {
      title: "🔢 Touchless PIN Pad",
      what: "Tap the 4 randomly announced numbers in order.",
      how: "Listen to each random number and reach to tap it directly using your index fingertip.",
      tip: "Retrains cognitive-motor sequence targeting and index finger precision.",
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
    const middleTip = lm[12];
    const ringTip = lm[16];
    const pinkyTip = lm[20];
    const wrist = lm[0];
    const indexMCP = lm[5];
    const pinkyMCP = lm[17];
    const middleMCP = lm[9];

    handPos = { x: indexTip.x, y: indexTip.y };

    // Scale invariant: knuckle width or wrist to middle MCP
    const palmScale = Math.hypot(indexMCP.x - pinkyMCP.x, indexMCP.y - pinkyMCP.y) || 0.1;
    // Thumb to pinky span
    const handSpan = Math.hypot(thumbTip.x - pinkyTip.x, thumbTip.y - pinkyTip.y);
    const spanRatio = handSpan / palmScale;

    // Fingertip to palm center average
    const tipDistances = [
      Math.hypot(thumbTip.x - middleMCP.x, thumbTip.y - middleMCP.y),
      Math.hypot(indexTip.x - middleMCP.x, indexTip.y - middleMCP.y),
      Math.hypot(middleTip.x - middleMCP.x, middleTip.y - middleMCP.y),
      Math.hypot(ringTip.x - middleMCP.x, ringTip.y - middleMCP.y),
      Math.hypot(pinkyTip.x - middleMCP.x, pinkyTip.y - middleMCP.y),
    ];
    const avgTipDist = tipDistances.reduce((a, b) => a + b, 0) / 5;
    const tipRatio = avgTipDist / palmScale;

    // Pincer distance (Thumb to Index)
    const pincerDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

    // Knuckle coronal vector (wrist supination/rotation)
    const knuckleDx = indexMCP.x - pinkyMCP.x;
    const knuckleDy = indexMCP.y - pinkyMCP.y;
    const knuckleAngle = Math.atan2(knuckleDy, knuckleDx) * (180 / Math.PI);

    wristData = {
      indexTip,
      thumbTip,
      middleTip,
      ringTip,
      pinkyTip,
      wrist,
      indexMCP,
      pinkyMCP,
      middleMCP,
      palmScale,
      handSpan,
      spanRatio,
      tipRatio,
      pincerDist,
      knuckleAngle,
    };

    if (currentTask === "balloon" && !adlPaused) {
      processBalloonHandMotion(spanRatio, tipRatio);
    }

    if (currentTask !== "menu") {
      evaluateStepProgression();
      updateTask();
    }

    drawHandSkeleton(lm);
  }

  // --- Balloon Hand Open / Close Biomechanics Detection ---
  function processBalloonHandMotion(spanRatio, tipRatio) {
    // Open hand: fingers spread wide (span ratio > 1.25 or avg tip distance > 1.28)
    const isOpen = spanRatio > 1.25 || tipRatio > 1.28;
    // Closed fist: fingers curled (span ratio < 0.96 and avg tip distance < 0.96)
    const isClosed = spanRatio < 0.96 || tipRatio < 0.96;

    if (isOpen) {
      if (!balloonHandOpen) {
        balloonHandOpen = true;
        if (balloonLevel < 100 && !balloonPopped) {
          if (window.RehabBio) window.RehabBio.playBeep(440, 0.04, 0.15);
        }
      }
    } else if (isClosed && balloonHandOpen) {
      // Hand transition: was open, now closed into fist -> PUMP!
      balloonHandOpen = false;
      triggerBalloonPump();
    }
  }

  function triggerBalloonPump() {
    const now = Date.now();
    if (now - lastPumpActionTime < 350) return; // Debounce rapid triggers
    lastPumpActionTime = now;

    if (balloonPopped) return;

    // If already at 100% and holding in the 5s caution period:
    if (balloonLevel >= 100 && balloonFullStartTime !== null) {
      const elapsedHold = now - balloonFullStartTime;
      if (elapsedHold < 5000) {
        // MISTAKENLY PUMPED DURING 5s CAUTION HOLD! POP!
        popBalloon();
        return;
      }
    }

    if (balloonLevel < 100) {
      balloonLevel = Math.min(100, balloonLevel + 20); // 5 pumps to reach 100%
      balloonPumps++;

      if (window.RehabBio) {
        window.RehabBio.playBeep(480 + balloonLevel * 3.5, 0.09, 0.3);
      }

      if (balloonLevel >= 100) {
        balloonFullStartTime = Date.now();
        currentStepIndex = 4; // Step 5: 5s Caution Hold
        updateStepCardsUI();
        if (window.RehabBio) {
          window.RehabBio.speak("Super! Balloon fully pumped! Hold steady for 5 seconds!");
          window.RehabBio.playRepChime();
        }
        showToast("🎉 Super! Balloon fully pumped! Hold steady 5s — DO NOT over-pump!", "warning");
      } else {
        if (currentStepIndex === 1 || currentStepIndex === 2) {
          currentStepIndex = 3; // Fill to 100%
          updateStepCardsUI();
        }
        showToast(`🎈 Air: ${balloonLevel}% (Pump ${balloonPumps}/5)`, "info");
      }
    }
  }

  function popBalloon() {
    balloonPopped = true;
    balloonPopTime = Date.now();
    balloonFullStartTime = null;

    // Create explosion burst particles
    const cx = gameCanvas.width * 0.5, cy = gameCanvas.height * 0.46;
    balloonParticles = [];
    const colors = ["#EF4444", "#F59E0B", "#10B981", "#38BDF8", "#EC4899", "#8B5CF6", "#FBBF24", "#FFFFFF"];
    for (let i = 0; i < 50; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 10;
      balloonParticles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: 3 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
      });
    }

    if (window.RehabBio) {
      window.RehabBio.playBuzz();
      window.RehabBio.speak("Oh no! Balloon popped! Be careful not to over pump!");
    }
    showToast("💥 Ohh no! Balloon popped! Be careful not to over-pump!", "danger");

    // Auto reset after 2.8 seconds so patient can try again
    setTimeout(() => {
      if (currentTask === "balloon") {
        balloonLevel = 0;
        balloonHandOpen = false;
        balloonFullStartTime = null;
        balloonPopped = false;
        balloonParticles = [];
        balloonPumps = 0;
        currentStepIndex = 1;
        updateStepCardsUI();
        showToast("🔄 Balloon reset! Open and close hand gently to pump.", "info");
      }
    }, 2800);
  }

  function secureActiveTank() {
    const now = Date.now();
    if (now - lastTankPressTime < 450) return; // Debounce
    lastTankPressTime = now;

    const reactionMs = now - tankActivationTime;
    waterTanks[activeTankIndex].secured = true;
    tanksSecuredCount++;

    const tankCentersX = [
      gameCanvas.width * 0.18,
      gameCanvas.width * 0.39,
      gameCanvas.width * 0.61,
      gameCanvas.width * 0.82,
    ];
    const cx = tankCentersX[activeTankIndex];
    const buttonY = gameCanvas.height * 0.38 + Math.min(130, gameCanvas.height * 0.26) + 38;

    for (let p = 0; p < 25; p++) {
      const ang = -Math.PI * 0.1 - Math.random() * Math.PI * 0.8;
      const spd = 3 + Math.random() * 7;
      waterSplashParticles.push({
        x: cx,
        y: buttonY,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: 2.5 + Math.random() * 4,
        alpha: 1.0,
      });
    }

    if (window.RehabBio) {
      window.RehabBio.playBeep(880, 0.08, 0.35);
      window.RehabBio.speak("Tank secured!");
    }
    showToast(`✅ Tank ${activeTankIndex + 1} shut in ${reactionMs}ms! (${tanksSecuredCount}/4)`, "success");

    advanceStep();

    if (tanksSecuredCount < 4) {
      const otherIndices = [0, 1, 2, 3].filter((idx) => idx !== activeTankIndex);
      activeTankIndex = otherIndices[Math.floor(Math.random() * otherIndices.length)];
      tankActivationTime = Date.now();
      if (window.RehabBio) {
        window.RehabBio.speak(`Tank ${activeTankIndex + 1} filling!`);
      }
    }
  }

  function drawHandSkeleton(lm) {
    if (!lm || lm.length < 21) return;
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    const w = handCanvas.width, h = handCanvas.height;

    // 1. Bright Green Bones (#00FF00)
    handCtx.strokeStyle = "#00FF00";
    handCtx.lineWidth = 2.5;
    handCtx.lineCap = "round";
    handCtx.lineJoin = "round";
    ADL_HAND_CONNECTIONS.forEach(([a, b]) => {
      if (lm[a] && lm[b]) {
        handCtx.beginPath();
        handCtx.moveTo(lm[a].x * w, lm[a].y * h);
        handCtx.lineTo(lm[b].x * w, lm[b].y * h);
        handCtx.stroke();
      }
    });

    // 2. All 21 Red Dots (#FF0000)
    for (let i = 0; i < 21; i++) {
      const p = lm[i];
      if (!p) continue;
      const px = p.x * w, py = p.y * h;

      handCtx.beginPath();
      handCtx.arc(px, py, 4.5, 0, Math.PI * 2);
      handCtx.fillStyle = "#FF0000";
      handCtx.fill();
      handCtx.strokeStyle = "#FFFFFF";
      handCtx.lineWidth = 1;
      handCtx.stroke();

      if (i === 8) {
        // Index tip targeting ring
        handCtx.beginPath();
        handCtx.arc(px, py, 11, 0, Math.PI * 2);
        handCtx.strokeStyle = "#00FF00";
        handCtx.lineWidth = 2;
        handCtx.stroke();
      }
    }
  }

  // --- Pure Deterministic 6-Step Gate Evaluation ---
  function evaluateStepProgression() {
    try {
      if (adlPaused || currentTask === "menu" || !wristData) return;
      const cx = 0.5, cy = 0.46;
      const distToTarget = Math.hypot(handPos.x - cx, handPos.y - cy);
      const now = Date.now();

      switch (currentStepIndex) {
        case 0: // Step 1: Neutral Rest (Hand at ready base)
          if (distToTarget > 0.18 || handPos.y > 0.60) {
            if (now - stepStartTime >= 400) advanceStep();
          }
          break;

        case 1: // Step 2: Forward Reach / Open Hand
          if (currentTask === "balloon") {
            if (balloonHandOpen) advanceStep();
          } else if (currentTask === "watertanks") {
            // Handled when tank secured
          } else if (currentTask === "light") {
            if (distToTarget < 0.22 && now - stepStartTime >= 350) advanceStep();
          }
          break;

        case 2: // Step 3: Contact Align / Clench Fist
          if (currentTask === "balloon") {
            if (balloonPumps >= 1) advanceStep();
          } else if (currentTask === "watertanks") {
            // Handled when tank secured
          } else if (currentTask === "light") {
            if (distToTarget < 0.16 && now - stepStartTime >= 350) advanceStep();
          }
          break;

        case 3: // Step 4: Motor Action Execution
          let actionDone = false;
          if (currentTask === "balloon") {
            actionDone = balloonLevel >= 100;
          } else if (currentTask === "watertanks") {
            actionDone = tanksSecuredCount >= 4;
          } else if (currentTask === "light") {
            actionDone = switchOn === true;
          } else if (currentTask === "pin") {
            actionDone = pinProgress >= 4;
          }
          if (actionDone) {
            if (now - stepStartTime >= 350) advanceStep();
          }
          break;

        case 4: // Step 5: Peak Sustain / 5s Caution Hold
          if (currentTask === "balloon") {
            // Evaluated continuously in drawBalloonTask (5s timer)
          } else if (currentTask === "watertanks") {
            // Evaluated via tank shutoffs
          } else if (now - stepStartTime >= 800) {
            advanceStep();
          }
          break;

        case 5: // Step 6: Home Return
          if (distToTarget > 0.18 || handPos.y > 0.60) {
            if (now - stepStartTime >= 400) advanceStep();
          }
          break;
      }
    } catch (err) {
      console.warn("[ADL] evaluateStepProgression caught error:", err);
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

    // Return to menu cleanly while keeping camera live for next task selection
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
    showToast("📋 Returned to Task Menu — select a task to practice", "info");
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

  // --- 4 Task Rendering Engines (Translucent, Non-Cluttering AR Overlays) ---
  function updateTask() {
    if (adlPaused) return;
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    const w = gameCanvas.width, h = gameCanvas.height;
    const hx = handPos.x * w, hy = handPos.y * h;

    switch (currentTask) {
      case "balloon":
        drawBalloonTask(hx, hy);
        break;
      case "watertanks":
        drawWaterTanksTask(hx, hy);
        break;
      case "light":
        drawLightTask(hx, hy);
        break;
      case "pin":
        drawPinTask(hx, hy);
        break;
    }
  }

  // 1. 🎈 Balloon Air Pump Task
  function drawBalloonTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;
    const cx = w * 0.5, cy = h * 0.46;

    // Update particles if popped
    if (balloonParticles.length > 0) {
      balloonParticles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25; // gravity
        p.alpha -= 0.02;
      });
      balloonParticles = balloonParticles.filter((p) => p.alpha > 0);

      balloonParticles.forEach((p) => {
        gCtx.save();
        gCtx.globalAlpha = Math.max(0, p.alpha);
        gCtx.fillStyle = p.color;
        gCtx.beginPath();
        gCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        gCtx.fill();
        gCtx.restore();
      });
    }

    // Top Progress Gauge Bar
    const barW = Math.min(420, w * 0.68);
    const barH = 26;
    const barX = (w - barW) / 2;
    const barY = h * 0.09;

    // Bar background
    gCtx.fillStyle = "rgba(15, 23, 42, 0.88)";
    gCtx.strokeStyle = balloonLevel >= 100 ? "#F59E0B" : "#38BDF8";
    gCtx.lineWidth = balloonLevel >= 100 ? 3 : 2;
    gCtx.beginPath();
    gCtx.roundRect(barX, barY, barW, barH, 13);
    gCtx.fill();
    gCtx.stroke();

    // Bar fill
    const fillW = (balloonLevel / 100) * (barW - 6);
    if (fillW > 0) {
      const grad = gCtx.createLinearGradient(barX + 3, barY, barX + fillW, barY);
      grad.addColorStop(0, "#38BDF8");
      grad.addColorStop(0.7, "#10B981");
      grad.addColorStop(1.0, balloonLevel >= 100 ? "#F59E0B" : "#34D399");
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.roundRect(barX + 3, barY + 3, fillW, barH - 6, 10);
      gCtx.fill();
    }

    // Bar text label
    gCtx.font = "bold 13px monospace";
    gCtx.fillStyle = "#FFFFFF";
    gCtx.textAlign = "center";
    gCtx.fillText(`AIR GAUGE: ${balloonLevel}% / 100%`, w * 0.5, barY + 18);
    gCtx.textAlign = "start";

    // 5-Second Hold Countdown or Caution Banner
    if (balloonLevel >= 100 && balloonFullStartTime !== null && !balloonPopped) {
      const elapsed = Date.now() - balloonFullStartTime;
      const rem = Math.max(0, (5000 - elapsed) / 1000).toFixed(1);

      // Caution Banner
      gCtx.fillStyle = "rgba(245, 158, 11, 0.92)";
      gCtx.strokeStyle = "#FFFFFF";
      gCtx.lineWidth = 2;
      gCtx.beginPath();
      gCtx.roundRect(barX - 10, barY + barH + 10, barW + 20, 52, 10);
      gCtx.fill();
      gCtx.stroke();

      gCtx.font = "bold 15px Inter, sans-serif";
      gCtx.fillStyle = "#070D18";
      gCtx.textAlign = "center";
      gCtx.fillText(`⚠️ CAUTION: HOLD STEADY FOR ${rem}s!`, w * 0.5, barY + barH + 32);
      gCtx.font = "bold 12px Inter, sans-serif";
      gCtx.fillText("DO NOT OPEN & CLOSE HAND — OVER-PUMP WILL POP!", w * 0.5, barY + barH + 50);
      gCtx.textAlign = "start";

      // Check if 5-second hold completed successfully!
      if (elapsed >= 5000) {
        balloonFullStartTime = null;
        advanceStep();
        if (window.RehabBio) {
          window.RehabBio.speak("Super! You held steady without popping the balloon!");
        }
        showToast("🌟 Repetition complete! Balloon securely held without popping!", "success");
      }
    } else if (balloonPopped) {
      // Popped alert banner
      gCtx.fillStyle = "rgba(239, 68, 68, 0.95)";
      gCtx.strokeStyle = "#FFFFFF";
      gCtx.lineWidth = 2;
      gCtx.beginPath();
      gCtx.roundRect(barX - 10, barY + barH + 10, barW + 20, 50, 10);
      gCtx.fill();
      gCtx.stroke();

      gCtx.font = "bold 15px Inter, sans-serif";
      gCtx.fillStyle = "#FFFFFF";
      gCtx.textAlign = "center";
      gCtx.fillText("💥 OHH NO! BALLOON POPPED!", w * 0.5, barY + barH + 32);
      gCtx.font = "12px Inter, sans-serif";
      gCtx.fillText("Be careful not to over-pump during the 5s hold!", w * 0.5, barY + barH + 48);
      gCtx.textAlign = "start";
    }

    // Balloon Rendering
    if (!balloonPopped) {
      const baseR = 36;
      const maxExtraR = 74;
      const currentR = baseR + (balloonLevel / 100) * maxExtraR;

      // Balloon string
      gCtx.strokeStyle = "#94A3B8";
      gCtx.lineWidth = 2;
      gCtx.beginPath();
      gCtx.moveTo(cx, cy + currentR + 10);
      gCtx.quadraticCurveTo(cx - 15, cy + currentR + 35, cx + 5, cy + currentR + 65);
      gCtx.stroke();

      // Balloon knot
      gCtx.fillStyle = "#B91C1C";
      gCtx.beginPath();
      gCtx.moveTo(cx - 8, cy + currentR + 10);
      gCtx.lineTo(cx + 8, cy + currentR + 10);
      gCtx.lineTo(cx, cy + currentR);
      gCtx.closePath();
      gCtx.fill();

      // Balloon body (oval)
      gCtx.save();
      const bGrad = gCtx.createRadialGradient(
        cx - currentR * 0.3,
        cy - currentR * 0.35,
        currentR * 0.1,
        cx,
        cy,
        currentR
      );
      bGrad.addColorStop(0, "#F87171");
      bGrad.addColorStop(0.65, "#EF4444");
      bGrad.addColorStop(1.0, "#991B1B");

      gCtx.fillStyle = bGrad;
      gCtx.beginPath();
      gCtx.ellipse(cx, cy, currentR * 0.88, currentR, 0, 0, Math.PI * 2);
      gCtx.fill();

      // Shiny 3D highlight
      gCtx.fillStyle = "rgba(255, 255, 255, 0.45)";
      gCtx.beginPath();
      gCtx.ellipse(
        cx - currentR * 0.36,
        cy - currentR * 0.38,
        currentR * 0.22,
        currentR * 0.32,
        -Math.PI / 6,
        0,
        Math.PI * 2
      );
      gCtx.fill();
      gCtx.restore();
    }

    // Hand Status Pill
    const handPillW = 270, handPillH = 34;
    const handPillX = (w - handPillW) / 2;
    const handPillY = h * 0.84;
    gCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
    gCtx.strokeStyle = balloonHandOpen ? "#10B981" : "#F59E0B";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(handPillX, handPillY, handPillW, handPillH, 17);
    gCtx.fill();
    gCtx.stroke();

    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.fillStyle = balloonHandOpen ? "#10B981" : "#F59E0B";
    gCtx.textAlign = "center";
    if (balloonLevel >= 100) {
      gCtx.fillText("🛑 HOLD HAND STILL (DO NOT PUMP)", w * 0.5, handPillY + 22);
    } else if (balloonHandOpen) {
      gCtx.fillText("✋ Hand OPEN (Air Drawn) → Clench FIST!", w * 0.5, handPillY + 22);
    } else {
      gCtx.fillText("✊ Fist Pumped → Open Fingers Wide!", w * 0.5, handPillY + 22);
    }
    gCtx.textAlign = "start";
  }

  // 2. 🚰 4-Tank Water Reaction Game Task
  function drawWaterTanksTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;

    // Splash particles
    if (waterSplashParticles.length > 0) {
      waterSplashParticles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // gravity
        p.alpha -= 0.03;
      });
      waterSplashParticles = waterSplashParticles.filter((p) => p.alpha > 0);
      waterSplashParticles.forEach((p) => {
        gCtx.save();
        gCtx.globalAlpha = Math.max(0, p.alpha);
        gCtx.fillStyle = "#38BDF8";
        gCtx.beginPath();
        gCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        gCtx.fill();
        gCtx.restore();
      });
    }

    // Layout dimensions
    const tankCentersX = [w * 0.18, w * 0.39, w * 0.61, w * 0.82];
    const tankW = Math.min(84, w * 0.16);
    const tankH = Math.min(130, h * 0.26);
    const tankY = h * 0.38;
    const buttonY = tankY + tankH + 38;
    const buttonR = 25;
    const mainPipeY = h * 0.16;

    // Main Overhead Pipe
    const pipeX1 = w * 0.10, pipeX2 = w * 0.90;
    gCtx.fillStyle = "rgba(30, 41, 59, 0.9)";
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 3;
    gCtx.beginPath();
    gCtx.roundRect(pipeX1, mainPipeY - 12, pipeX2 - pipeX1, 24, 6);
    gCtx.fill();
    gCtx.stroke();

    // Animated water pulse in main pipe
    const pulseOffset = (Date.now() / 15) % 40;
    gCtx.strokeStyle = "rgba(56, 189, 248, 0.75)";
    gCtx.lineWidth = 8;
    gCtx.setLineDash([15, 12]);
    gCtx.lineDashOffset = -pulseOffset;
    gCtx.beginPath();
    gCtx.moveTo(pipeX1 + 10, mainPipeY);
    gCtx.lineTo(pipeX2 - 10, mainPipeY);
    gCtx.stroke();
    gCtx.setLineDash([]); // reset

    // Pipe Title Banner
    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.fillStyle = "#E2E8F0";
    gCtx.textAlign = "center";
    gCtx.fillText("MAIN WATER SUPPLY CONDUIT", w * 0.5, mainPipeY - 18);

    // Active Tank Reaction Prompt
    gCtx.font = "bold 14px Inter, sans-serif";
    gCtx.fillStyle = "#FBBF24";
    gCtx.fillText(
      `🚨 REACTION SPEED TRAINING: SHUT TANK ${activeTankIndex + 1} VALVE FAST! (Secured: ${tanksSecuredCount}/4)`,
      w * 0.5,
      mainPipeY + 34
    );
    gCtx.textAlign = "start";

    // Fill active tank over time
    if (activeTankIndex >= 0 && activeTankIndex < 4) {
      waterTanks[activeTankIndex].level = Math.min(100, waterTanks[activeTankIndex].level + tankFillSpeed);
    }

    // Draw the 4 Tanks
    for (let i = 0; i < 4; i++) {
      const cx = tankCentersX[i];
      const isActive = i === activeTankIndex;
      const isSecured = waterTanks[i].secured;
      const level = waterTanks[i].level;

      // Vertical sub-pipe from main conduit to tank
      gCtx.fillStyle = "rgba(30, 41, 59, 0.9)";
      gCtx.strokeStyle = isActive ? "#F59E0B" : "#64748B";
      gCtx.lineWidth = isActive ? 2.5 : 1.5;
      gCtx.fillRect(cx - 7, mainPipeY + 12, 14, tankY - (mainPipeY + 12));
      gCtx.strokeRect(cx - 7, mainPipeY + 12, 14, tankY - (mainPipeY + 12));

      // Falling water stream if active
      if (isActive) {
        gCtx.strokeStyle = "rgba(56, 189, 248, 0.85)";
        gCtx.lineWidth = 8;
        gCtx.setLineDash([8, 6]);
        gCtx.lineDashOffset = -(Date.now() / 12) % 30;
        gCtx.beginPath();
        gCtx.moveTo(cx, mainPipeY + 12);
        gCtx.lineTo(cx, tankY + tankH - (level / 100) * (tankH - 10));
        gCtx.stroke();
        gCtx.setLineDash([]);
      }

      // Tank Container Body
      gCtx.fillStyle = "rgba(15, 23, 42, 0.82)";
      gCtx.strokeStyle = isActive ? "#F59E0B" : isSecured ? "#10B981" : "#475569";
      gCtx.lineWidth = isActive ? 3 : 2;
      gCtx.beginPath();
      gCtx.roundRect(cx - tankW / 2, tankY, tankW, tankH, 8);
      gCtx.fill();
      gCtx.stroke();

      // Water Level in Tank
      const fillHeight = (level / 100) * (tankH - 8);
      if (fillHeight > 0) {
        gCtx.save();
        gCtx.beginPath();
        gCtx.roundRect(cx - tankW / 2 + 3, tankY + tankH - fillHeight - 3, tankW - 6, fillHeight, [0, 0, 6, 6]);
        gCtx.fillStyle = isSecured ? "rgba(16, 185, 129, 0.75)" : "rgba(56, 189, 248, 0.75)";
        gCtx.fill();
        gCtx.restore();
      }

      // Tank Label
      gCtx.font = "bold 12px monospace";
      gCtx.fillStyle = isActive ? "#FBBF24" : "#94A3B8";
      gCtx.textAlign = "center";
      gCtx.fillText(`TANK ${i + 1}`, cx, tankY - 6);

      // Percentage Text
      gCtx.font = "bold 11px monospace";
      gCtx.fillStyle = "#FFFFFF";
      gCtx.fillText(`${Math.round(level)}%`, cx, tankY + tankH / 2);

      // Status Badge
      if (isSecured) {
        gCtx.fillStyle = "#10B981";
        gCtx.font = "bold 10px Inter, sans-serif";
        gCtx.fillText("✅ SHUT", cx, tankY + 18);
      } else if (isActive) {
        gCtx.fillStyle = "#EF4444";
        gCtx.font = "bold 10px Inter, sans-serif";
        gCtx.fillText("⚠️ FILLING", cx, tankY + 18);
      }

      // Shutoff Valve Button
      gCtx.beginPath();
      gCtx.arc(cx, buttonY, buttonR, 0, Math.PI * 2);
      gCtx.fillStyle = isActive ? "rgba(239, 68, 68, 0.9)" : "rgba(30, 41, 59, 0.85)";
      gCtx.fill();
      gCtx.strokeStyle = isActive ? "#FFFFFF" : isSecured ? "#10B981" : "#64748B";
      gCtx.lineWidth = isActive ? 3 : 1.5;
      gCtx.stroke();

      // Active button pulsing ring
      if (isActive) {
        const pulseR = buttonR + 6 + Math.sin(Date.now() / 120) * 4;
        gCtx.beginPath();
        gCtx.arc(cx, buttonY, pulseR, 0, Math.PI * 2);
        gCtx.strokeStyle = "rgba(245, 158, 11, 0.6)";
        gCtx.lineWidth = 2.5;
        gCtx.stroke();
      }

      gCtx.font = "bold 11px Inter, sans-serif";
      gCtx.fillStyle = "#FFFFFF";
      gCtx.fillText(isActive ? "SHUT!" : isSecured ? "CLOSED" : "VALVE", cx, buttonY + 4);
    }
    gCtx.textAlign = "start";

    // Index Fingertip Detection & Reticle
    if (wristData && wristData.indexTip) {
      const itx = wristData.indexTip.x * w, ity = wristData.indexTip.y * h;

      // Reticle
      gCtx.beginPath();
      gCtx.arc(itx, ity, 13, 0, Math.PI * 2);
      gCtx.strokeStyle = "#10B981";
      gCtx.lineWidth = 2.5;
      gCtx.stroke();

      gCtx.font = "bold 10px Inter, sans-serif";
      gCtx.fillStyle = "#10B981";
      gCtx.textAlign = "center";
      gCtx.fillText("👆 TAP", itx, ity - 16);
      gCtx.textAlign = "start";

      // Hit check on active tank button
      const activeCx = tankCentersX[activeTankIndex];
      const dist = Math.hypot(itx - activeCx, ity - buttonY);
      if (dist < buttonR + 18) {
        secureActiveTank();
      }
    }
  }

  // 3. 💡 Light Switch Task
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

  // 4. 🔢 Touchless PIN Pad Task (Randomized Numbers Clicked via Index Finger)
  function drawPinTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;
    const currentTargetDigit = (currentStepIndex >= 1 && currentStepIndex <= 4)
      ? randomPin[currentStepIndex - 1]
      : null;

    // Speak prompt whenever a new target digit becomes active
    if (currentTargetDigit !== null && lastAnnouncedDigit !== currentTargetDigit) {
      lastAnnouncedDigit = currentTargetDigit;
      if (window.RehabBio) {
        window.RehabBio.speak(`Tap digit ${currentTargetDigit} with your index finger`);
      }
      showToast(`👉 Tap digit ${currentTargetDigit} using your index finger`, "info");
    }

    // Top Prompt Banner
    gCtx.fillStyle = "rgba(7, 13, 24, 0.92)";
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(w * 0.22, h * 0.08, w * 0.56, 56, 12);
    gCtx.fill();
    gCtx.stroke();

    // Display Active Target Prompt
    gCtx.font = "bold 15px Inter, sans-serif";
    gCtx.fillStyle = "#FBBF24";
    gCtx.textAlign = "center";
    if (currentTargetDigit !== null) {
      gCtx.fillText(`👉 TAP DIGIT: [ ${currentTargetDigit} ] WITH INDEX FINGER`, w * 0.5, h * 0.08 + 24);
    } else {
      gCtx.fillText("✅ CODE CONFIRMED! RETRACT HAND", w * 0.5, h * 0.08 + 24);
    }

    // PIN Progress Display
    let pinCodeDisplay = "PIN: ";
    for (let k = 0; k < 4; k++) {
      if (k < pinProgress) {
        pinCodeDisplay += `[ ${randomPin[k]} ] `;
      } else {
        pinCodeDisplay += `[ _ ] `;
      }
    }
    gCtx.font = "bold 13px monospace";
    gCtx.fillStyle = "#E2E8F0";
    gCtx.fillText(pinCodeDisplay, w * 0.5, h * 0.08 + 46);
    gCtx.textAlign = "start";

    // Draw keypad buttons
    padPositions.forEach((pos, i) => {
      const px = pos.x * w, py = pos.y * h;
      const label = padLabels[i];
      const isTarget = currentTargetDigit !== null && label === String(currentTargetDigit);
      const isDwelling = dwellTarget === i;

      // Outer pulsing glow for target digit
      if (isTarget) {
        gCtx.beginPath();
        gCtx.arc(px, py, 34, 0, Math.PI * 2);
        gCtx.strokeStyle = "rgba(245, 158, 11, 0.45)";
        gCtx.lineWidth = 4;
        gCtx.stroke();
      }

      // Key button body
      gCtx.beginPath();
      gCtx.arc(px, py, 26, 0, Math.PI * 2);
      gCtx.fillStyle = isTarget ? "rgba(245, 158, 11, 0.35)" : "rgba(15, 20, 32, 0.85)";
      gCtx.fill();
      gCtx.strokeStyle = isTarget ? "#F59E0B" : "#38BDF8";
      gCtx.lineWidth = isTarget ? 3 : 1.5;
      gCtx.stroke();

      // Dwell progress ring
      if (isDwelling) {
        const elapsed = Date.now() - dwellStart;
        const prog = Math.min(1, elapsed / DWELL_MS);
        gCtx.beginPath();
        gCtx.arc(px, py, 32, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        gCtx.strokeStyle = "#10B981";
        gCtx.lineWidth = 4;
        gCtx.stroke();
      }

      // Digit label
      gCtx.font = "bold 17px monospace";
      gCtx.fillStyle = isTarget ? "#FFFFFF" : "#E2E8F0";
      gCtx.textAlign = "center";
      gCtx.fillText(label, px, py + 6);
    });
    gCtx.textAlign = "start";

    // Index Fingertip Interaction Detection
    if (wristData && wristData.indexTip) {
      const itx = wristData.indexTip.x * w, ity = wristData.indexTip.y * h;

      // Index finger reticle
      gCtx.beginPath();
      gCtx.arc(itx, ity, 12, 0, Math.PI * 2);
      gCtx.strokeStyle = "#10B981";
      gCtx.lineWidth = 2.5;
      gCtx.stroke();

      gCtx.font = "bold 10px Inter, sans-serif";
      gCtx.fillStyle = "#10B981";
      gCtx.textAlign = "center";
      gCtx.fillText("👆 INDEX", itx, ity - 16);
      gCtx.textAlign = "start";

      // Check hit on target digit with index finger
      if (currentTargetDigit !== null) {
        const targetIdx = padLabels.indexOf(String(currentTargetDigit));
        const targetPos = padPositions[targetIdx];
        const dist = Math.hypot(wristData.indexTip.x - targetPos.x, wristData.indexTip.y - targetPos.y);

        if (dist < 0.08) {
          if (dwellTarget !== targetIdx) {
            dwellTarget = targetIdx;
            dwellStart = Date.now();
          } else if (Date.now() - dwellStart >= DWELL_MS) {
            pinProgress++;
            dwellTarget = -1;
            if (window.RehabBio) {
              window.RehabBio.playBeep(880, 0.08, 0.3);
            }
            showToast(`✅ Digit ${currentTargetDigit} accepted!`, "success");
            advanceStep();
          }
        } else {
          if (dwellTarget === targetIdx) dwellTarget = -1;
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

    if (currentTask === "balloon") {
      balloonHandOpen = true;
      triggerBalloonPump();
    } else if (currentTask === "watertanks") {
      const tankCentersX = [
        gameCanvas.width * 0.18,
        gameCanvas.width * 0.39,
        gameCanvas.width * 0.61,
        gameCanvas.width * 0.82,
      ];
      const buttonY = gameCanvas.height * 0.38 + Math.min(130, gameCanvas.height * 0.26) + 38;
      const buttonR = 25;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      tankCentersX.forEach((cx, idx) => {
        if (Math.hypot(px - cx, py - buttonY) < buttonR + 22) {
          if (idx === activeTankIndex) {
            secureActiveTank();
          } else {
            showToast(`⚠️ Tank ${idx + 1} is not filling! Shut Tank ${activeTankIndex + 1}!`, "warning");
          }
        }
      });
    } else if (currentTask === "pin") {
      padPositions.forEach((pos, i) => {
        if (Math.hypot(nx - pos.x, ny - pos.y) < 0.08) {
          if (currentStepIndex >= 1 && currentStepIndex <= 4 && padLabels[i] === String(randomPin[currentStepIndex - 1])) {
            pinProgress++;
            showToast(`🔢 Digit ${padLabels[i]} accepted`, "info");
            advanceStep();
          }
        }
      });
    } else if (currentTask === "light") {
      switchOn = true;
      advanceStep();
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
