/**
 * RehabOpt AR — Session 4: ADL Functional Lab Engine (P4 Clinical Overhaul)
 * 4 Core Clinical Tasks with 6 Visual Skeletal Steps each:
 * 1. 🎈 Balloon Air Pump
 * 2. 🚰 4-Tank Water Reaction
 * 3. 💡 Rocker Light Switch
 * 4. 🔢 Touchless PIN Pad
 * Pure deterministic mathematics (no ML/DL guessing).
 */
if (typeof document !== "undefined") {
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
  const isDebug = new URLSearchParams(window.location.search).get("debug") === "1";
  let isHandMissing = false;

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
  let palmCenterHistory = [];
  let lastFlickTime = 0;

  // Patient identity & persistent calibration
  const activePatientId = localStorage.getItem("last_patient_id") || "SP_00001";
  let calibOpen = parseFloat(localStorage.getItem("adl_calib_open_" + activePatientId)) || 1.9;
  let calibClosed = parseFloat(localStorage.getItem("adl_calib_closed_" + activePatientId)) || 1.1;
  let opennessHistory = [];
  let currentOpenness = 1.5;
  let sessionCalibrated = false;
  let calibStep = 0; // 0: inactive, 1: open, 2: closed
  let calibTimer = null;
  let calibSamples = [];

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
    { level: 0, secured: false, overflowAlerted: false },
    { level: 0, secured: false, overflowAlerted: false },
    { level: 0, secured: false, overflowAlerted: false },
    { level: 0, secured: false, overflowAlerted: false },
  ];
  let activeTankIndex = 0;
  let tankActivationTime = performance.now();
  let tanksSecuredCount = 0;
  let waterSplashParticles = [];
  let tankFillSpeed = 12.0; // % per second (gentle pace for seniors)
  let lastTankPressTime = 0;
  let lastTankTime = performance.now();
  let tankDwellTarget = -1;
  let tankDwellStart = 0;

  // 5. 🫗 Pour the Water Game States (Pronation / Supination Biomechanics)
  let pourGlassLevel = 0; // 0 to 1.15 (0% to 115%)
  let pourTargetReached = false;
  let pourParticles = [];
  let lastPourTime = performance.now();
  let pourSpillAlerted = false;
  let uprightAngle = 0;
  let uprightCalibrated = false;
  let smoothedPourTilt = 0;
  let patientMaxFlow = 0.35; // 35% fill per second at full tilt (patient-adjustable)
  let taskPeakRom = 0;

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
  const DWELL_MS = 350;
  const padPositions = [
    { x: 0.34, y: 0.28 }, { x: 0.50, y: 0.28 }, { x: 0.66, y: 0.28 },
    { x: 0.34, y: 0.45 }, { x: 0.50, y: 0.45 }, { x: 0.66, y: 0.45 },
    { x: 0.34, y: 0.62 }, { x: 0.50, y: 0.62 }, { x: 0.66, y: 0.62 },
    { x: 0.50, y: 0.79 },
  ];
  const padLabels = ["1","2","3","4","5","6","7","8","9","0"];
  let smoothedCursor = { x: 0.5, y: 0.5 };
  let lastPinPressTime = 0;

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
    pour: {
      name: "🫗 Pour the Water",
      steps: [
        { name: "Neutral Rest", desc: "Hold pitcher upright at home base" },
        { name: "Align Over Glass", desc: "Move pitcher above drinking glass" },
        { name: "Rotate Forearm", desc: "Tilt hand (pronation) to start pouring" },
        { name: "Pour Water Stream", desc: "Hold tilt as water fills the glass" },
        { name: "Fill Target Zone", desc: "Fill glass into green zone (75-95%)" },
        { name: "Rotate Upright", desc: "Level hand upright to stop pouring" },
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

    if (taskKey === "pour") {
      switch (stepIndex) {
        case 0:
          body = `
            <rect x="55" y="40" width="22" height="30" rx="3" fill="none" stroke="${dots}" stroke-width="1.5"/>
            <rect x="25" y="25" width="20" height="28" rx="3" fill="#1E293B" stroke="${lines}" stroke-width="1.5"/>
            <path d="M 25 32 L 20 32 L 20 42 L 25 42" stroke="${lines}" stroke-width="1.5" fill="none"/>
            <circle cx="35" cy="65" r="5" fill="${dots}"/>
          `;
          break;
        case 1:
          body = `
            <rect x="55" y="40" width="22" height="30" rx="3" fill="none" stroke="${dots}" stroke-width="1.5"/>
            <rect x="45" y="16" width="20" height="26" rx="3" fill="#1E293B" stroke="${lines}" stroke-width="1.5"/>
            <path d="M 45 22 L 40 22 L 40 32 L 45 32" stroke="${lines}" stroke-width="1.5" fill="none"/>
            <line x1="30" y1="30" x2="42" y2="24" stroke="${dots}" stroke-width="1.5" stroke-dasharray="2,2"/>
          `;
          break;
        case 2:
          body = `
            <rect x="55" y="40" width="22" height="30" rx="3" fill="none" stroke="${dots}" stroke-width="1.5"/>
            <g transform="translate(48,22) rotate(35)">
              <rect x="-10" y="-12" width="20" height="26" rx="3" fill="#1E293B" stroke="${lines}" stroke-width="1.5"/>
              <path d="M -10 -4 L -15 -4 L -15 6 L -10 6" stroke="${lines}" stroke-width="1.5" fill="none"/>
            </g>
            <path d="M 32 18 A 12 12 0 0 1 44 14" stroke="${amber}" stroke-width="2" fill="none"/>
          `;
          break;
        case 3:
          body = `
            <rect x="55" y="40" width="22" height="30" rx="3" fill="none" stroke="${dots}" stroke-width="1.5"/>
            <rect x="57" y="55" width="18" height="13" rx="2" fill="#38BDF8" opacity="0.6"/>
            <g transform="translate(45,20) rotate(50)">
              <rect x="-10" y="-12" width="20" height="26" rx="3" fill="#1E293B" stroke="${lines}" stroke-width="1.5"/>
            </g>
            <path d="M 52 26 Q 58 35 62 55" stroke="#38BDF8" stroke-width="2.5" fill="none"/>
          `;
          break;
        case 4:
          body = `
            <rect x="55" y="40" width="22" height="30" rx="3" fill="none" stroke="${dots}" stroke-width="1.5"/>
            <rect x="57" y="46" width="18" height="22" rx="2" fill="${green}" opacity="0.7"/>
            <line x1="53" y1="46" x2="79" y2="46" stroke="${green}" stroke-width="2"/>
            <text x="66" y="36" font-size="8" font-weight="bold" fill="${green}" text-anchor="middle">TARGET</text>
          `;
          break;
        case 5:
          body = `
            <rect x="55" y="40" width="22" height="30" rx="3" fill="none" stroke="${dots}" stroke-width="1.5"/>
            <rect x="57" y="46" width="18" height="22" rx="2" fill="${green}" opacity="0.7"/>
            <rect x="25" y="25" width="20" height="28" rx="3" fill="#1E293B" stroke="${lines}" stroke-width="1.5"/>
            <path d="M 40 18 A 12 12 0 0 0 28 22" stroke="${green}" stroke-width="2" fill="none"/>
            <text x="66" y="60" font-size="10" fill="#FFFFFF" text-anchor="middle">✓</text>
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
    lastAdlActionTime = performance.now();
    stepStartTime = performance.now();
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
    dwellStart = 0;
    lastPinPressTime = 0;

    // Balloon Task reset
    balloonLevel = 0;
    balloonHandOpen = false;
    balloonFullStartTime = null;
    balloonPopped = false;
    balloonParticles = [];
    balloonPumps = 0;

    // Water Tanks reset
    waterTanks = [
      { level: 0, secured: false, overflowAlerted: false },
      { level: 0, secured: false, overflowAlerted: false },
      { level: 0, secured: false, overflowAlerted: false },
      { level: 0, secured: false, overflowAlerted: false },
    ];
    activeTankIndex = Math.floor(Math.random() * 4);
    tankActivationTime = performance.now();
    tanksSecuredCount = 0;
    waterSplashParticles = [];
    lastTankTime = performance.now();
    tankDwellTarget = -1;
    tankDwellStart = 0;

    // Pour the Water reset
    pourGlassLevel = 0;
    pourTargetReached = false;
    pourParticles = [];
    lastPourTime = performance.now();
    pourSpillAlerted = false;
    smoothedPourTilt = 0;
    taskPeakRom = 0;
  }

  // --- Guidance Popup Content & 10s Inactivity Re-trigger (5 Clinical Tasks) ---
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
    pour: {
      title: "🫗 Pour the Water",
      what: "Tilt your hand to pour water from the pitcher into the target glass, then return upright.",
      how: "Hold the pitcher upright, position it above the glass, rotate your forearm (pronation) to tilt and pour until the glass fills to the green mark, then rotate back upright.",
      tip: "Retrains forearm pronation and supination rotation, essential for eating, drinking, and turning door handles.",
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
  hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
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
      isHandMissing = true;
      lastTankTime = performance.now();
      lastPourTime = performance.now();
      tankDwellStart = 0;
      dwellTarget = -1;
      handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);
      handCtx.fillStyle = "rgba(239, 68, 68, 0.9)";
      handCtx.font = "bold 24px Inter, sans-serif";
      handCtx.textAlign = "center";
      handCtx.fillText("Please show your hand", handCanvas.width / 2, handCanvas.height / 2);
      handCtx.textAlign = "start";
      return;
    }
    isHandMissing = false;
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
    const handSize = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y) || 0.1;
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

    // Openness (4 fingers to wrist)
    const openDists = [
      Math.hypot(lm[8].x - lm[0].x, lm[8].y - lm[0].y),
      Math.hypot(lm[12].x - lm[0].x, lm[12].y - lm[0].y),
      Math.hypot(lm[16].x - lm[0].x, lm[16].y - lm[0].y),
      Math.hypot(lm[20].x - lm[0].x, lm[20].y - lm[0].y),
    ];
    const rawOpenness = (openDists[0] + openDists[1] + openDists[2] + openDists[3]) / 4 / handSize;
    
    opennessHistory.push(rawOpenness);
    if (opennessHistory.length > 3) opennessHistory.shift();
    currentOpenness = opennessHistory.reduce((a, b) => a + b, 0) / opennessHistory.length;

    // Calibration sample collector if calibration active
    if (calibStep === 1 || calibStep === 2) {
      calibSamples.push(rawOpenness);
    }

    // Pincer distance (Thumb to Index)
    const pincerDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);

    // Knuckle coronal vector (wrist supination/rotation)
    const knuckleDx = indexMCP.x - pinkyMCP.x;
    const knuckleDy = indexMCP.y - pinkyMCP.y;
    const knuckleAngle = Math.atan2(knuckleDy, knuckleDx) * (180 / Math.PI);

    const palmCenter = {
      x: (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5,
      y: (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5
    };
    
    const nowPerf = performance.now();
    palmCenterHistory.push({ y: palmCenter.y, time: nowPerf });
    // Keep only last 300ms
    palmCenterHistory = palmCenterHistory.filter(pt => nowPerf - pt.time <= 300);

    // Smoothing for PIN Pad cursor (alpha = 0.3)
    smoothedCursor.x = 0.3 * indexTip.x + 0.7 * smoothedCursor.x;
    smoothedCursor.y = 0.3 * indexTip.y + 0.7 * smoothedCursor.y;

    wristData = {
      indexTip,
      smoothedCursor,
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
      palmCenter,
    };

    if (currentTask === "balloon" && !adlPaused) {
      processBalloonHandMotion(currentOpenness);
    }

    if (currentTask !== "menu") {
      evaluateStepProgression();
      updateTask();
    }

    if (isDebug) {
      drawHandSkeleton(lm);
    }
  }

  // --- Balloon Hand Open / Close Biomechanics Detection ---
  function processBalloonHandMotion(openness) {
    const openThreshold = calibClosed + 0.75 * (calibOpen - calibClosed);
    const closeThreshold = calibClosed + 0.25 * (calibOpen - calibClosed);

    const isOpen = openness > openThreshold;
    const isClosed = openness < closeThreshold;

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

    if (balloonLevel > 100) return;

    balloonLevel = Math.min(110, balloonLevel + 10);
    balloonPumps++;

    if (window.RehabBio) {
      window.RehabBio.playBeep(480 + balloonLevel * 3.5, 0.09, 0.3);
    }

    if (balloonLevel > 100) {
      popBalloon();
    } else if (balloonLevel >= 90) {
      if (balloonFullStartTime === null) {
        balloonFullStartTime = Date.now();
        currentStepIndex = 4; // Step 5: 5s Caution Hold
        updateStepCardsUI();
        if (window.RehabBio) {
          window.RehabBio.speak("Super! Target zone reached! Hold steady for 5 seconds!");
          window.RehabBio.playRepChime();
        }
        showToast("🎉 Target zone! Hold steady 5s — DO NOT over-pump!", "warning");
      } else {
        // Pumped again but still in target zone (100)
        showToast("⚠️ Careful! One more pump will pop it!", "warning");
      }
    } else {
      if (currentStepIndex === 1 || currentStepIndex === 2) {
        currentStepIndex = 3; // Fill to 100%
        updateStepCardsUI();
      }
      showToast(`🎈 Air: ${balloonLevel}% (Pump ${balloonPumps})`, "info");
    }
  }

  function popBalloon() {
    balloonPopped = true;
    balloonPopTime = performance.now();
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
      window.RehabBio.speak("That's okay! Take a breath and tap Try Again!");
    }
    showToast("💥 Balloon popped! That's okay — tap Try Again below.", "danger");

    const wrap = document.getElementById("balloon-tryagain-wrap");
    if (wrap) wrap.style.display = "block";
  }

  function secureActiveTank() {
    const now = Date.now();
    if (now - lastTankPressTime < 450) return; // Debounce
    lastTankPressTime = now;

    const reactionMs = Math.round(performance.now() - tankActivationTime);
    waterTanks[activeTankIndex].secured = true;
    waterTanks[activeTankIndex].level = 0; // reset level on secure
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
      tankActivationTime = performance.now();
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

        case 1: // Step 2: Forward Reach / Open Hand / Align
          if (currentTask === "balloon") {
            if (balloonHandOpen) advanceStep();
          } else if (currentTask === "watertanks") {
            // Handled when tank secured
          } else if (currentTask === "light") {
            if (distToTarget < 0.22 && now - stepStartTime >= 350) advanceStep();
          } else if (currentTask === "pour") {
            if (handPos.x > 0.35 && handPos.x < 0.75 && handPos.y < 0.65 && now - stepStartTime >= 350) advanceStep();
          }
          break;

        case 2: // Step 3: Contact Align / Clench Fist / Forearm Rotate
          if (currentTask === "balloon") {
            if (balloonPumps >= 1) advanceStep();
          } else if (currentTask === "watertanks") {
            // Handled when tank secured
          } else if (currentTask === "light") {
            if (distToTarget < 0.16 && now - stepStartTime >= 350) advanceStep();
          } else if (currentTask === "pour") {
            if (Math.abs(wristData.knuckleAngle) > 30 && now - stepStartTime >= 350) advanceStep();
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
          } else if (currentTask === "pour") {
            actionDone = pourGlassLevel >= 40;
          }
          if (actionDone) {
            if (now - stepStartTime >= 350) advanceStep();
          }
          break;

        case 4: // Step 5: Peak Sustain / 5s Caution Hold / Fill Target
          if (currentTask === "balloon") {
            // Evaluated continuously in drawBalloonTask (5s timer)
          } else if (currentTask === "watertanks") {
            // Evaluated via tank shutoffs
          } else if (currentTask === "pour") {
            if (pourGlassLevel >= 75 && pourGlassLevel <= 100) {
              pourTargetReached = true;
              advanceStep();
            }
          } else if (now - stepStartTime >= 800) {
            advanceStep();
          }
          break;

        case 5: // Step 6: Home Return / Level Upright
          if (currentTask === "pour") {
            if (Math.abs(wristData.knuckleAngle) < 22 && pourTargetReached && now - stepStartTime >= 400) {
              advanceStep();
            }
          } else if (distToTarget > 0.18 || handPos.y > 0.60) {
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

  // --- Hand Calibration & Task Execution Workflows ---
  function startCalibration(onComplete) {
    const overlay = document.getElementById("adl-calib-overlay");
    const stepLabel = document.getElementById("calib-step-label");
    const numEl = document.getElementById("calib-num");
    const instrEl = document.getElementById("calib-instruction");
    const hintEl = document.getElementById("calib-hint");
    const skipBtn = document.getElementById("calib-skip-btn");

    if (!overlay) {
      sessionCalibrated = true;
      onComplete();
      return;
    }

    calibSamples = [];
    calibStep = 1;
    overlay.style.display = "flex";

    const finishCalibration = (openVal, closedVal) => {
      if (calibTimer) clearInterval(calibTimer);
      calibStep = 0;
      overlay.style.display = "none";
      sessionCalibrated = true;
      calibOpen = openVal;
      calibClosed = closedVal;
      try {
        localStorage.setItem("adl_calib_open_" + activePatientId, calibOpen.toFixed(2));
        localStorage.setItem("adl_calib_closed_" + activePatientId, calibClosed.toFixed(2));
      } catch (e) {}
      if (skipBtn) skipBtn.onclick = null;
      onComplete();
    };

    if (skipBtn) {
      skipBtn.onclick = () => {
        showToast("Hand calibration skipped. Using standard defaults.", "info");
        finishCalibration(1.9, 1.1);
      };
    }

    // Step 1: Open hand
    stepLabel.textContent = "HAND CALIBRATION (STEP 1 OF 2)";
    instrEl.textContent = "Open your hand wide";
    hintEl.textContent = "Spread fingers wide facing the camera (2s)";
    let timeLeft = 2;
    numEl.textContent = timeLeft;

    calibTimer = setInterval(() => {
      timeLeft--;
      if (timeLeft > 0) {
        numEl.textContent = timeLeft;
      } else {
        clearInterval(calibTimer);
        const recordedOpen = calibSamples.length > 0
          ? calibSamples.reduce((a, b) => a + b, 0) / calibSamples.length
          : 1.9;

        // Step 2: Close hand
        calibSamples = [];
        calibStep = 2;
        stepLabel.textContent = "HAND CALIBRATION (STEP 2 OF 2)";
        instrEl.textContent = "Close your hand into a fist";
        hintEl.textContent = "Clench your hand into a fist (2s)";
        timeLeft = 2;
        numEl.textContent = timeLeft;

        calibTimer = setInterval(() => {
          timeLeft--;
          if (timeLeft > 0) {
            numEl.textContent = timeLeft;
          } else {
            clearInterval(calibTimer);
            const recordedClosed = calibSamples.length > 0
              ? calibSamples.reduce((a, b) => a + b, 0) / calibSamples.length
              : 1.1;

            let finalOpen = Math.max(1.4, recordedOpen);
            let finalClosed = Math.min(finalOpen - 0.25, Math.max(0.7, recordedClosed));
            if (finalOpen <= finalClosed + 0.2) {
              finalOpen = 1.9;
              finalClosed = 1.1;
            }
            showToast("✅ Hand movement range calibrated!", "success");
            finishCalibration(finalOpen, finalClosed);
          }
        }, 1000);
      }
    }, 1000);
  }

  function startPourUprightCalibration(onComplete) {
    const acoOverlay = document.getElementById("adl-countdown-overlay");
    const acoLabel = document.getElementById("adl-aco-label");
    const acoNum = document.getElementById("adl-aco-num");
    const acoHint = document.getElementById("adl-aco-hint");

    if (!acoOverlay) {
      onComplete();
      return;
    }

    acoOverlay.classList.add("show");
    acoLabel.textContent = "UPRIGHT FOREARM CALIBRATION";
    acoHint.textContent = "Hold your hand straight upright like holding a drinking glass";
    let countdown = 3;
    acoNum.textContent = countdown;

    const uprightSamples = [];
    const sampleInterval = setInterval(() => {
      if (wristData && wristData.pinkyMCP && wristData.indexMCP) {
        const dx = wristData.pinkyMCP.x - wristData.indexMCP.x;
        const dy = wristData.pinkyMCP.y - wristData.indexMCP.y;
        uprightSamples.push(Math.atan2(dy, dx) * (180 / Math.PI));
      }
    }, 100);

    const timer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        acoNum.textContent = countdown;
      } else {
        clearInterval(timer);
        clearInterval(sampleInterval);
        acoOverlay.classList.remove("show");

        if (uprightSamples.length > 0) {
          uprightAngle = uprightSamples.reduce((a, b) => a + b, 0) / uprightSamples.length;
        } else {
          uprightAngle = 0;
        }
        uprightCalibrated = true;
        smoothedPourTilt = 0;
        taskPeakRom = 0;
        showToast("✅ Forearm upright calibrated! Tilt to pour.", "success");
        onComplete();
      }
    }, 1000);
  }

  function startTaskExecution(selectedTask) {
    currentTask = selectedTask;
    currentStepIndex = 0;
    repsCompleted = 0;
    tasksCompleted = 0;
    resetTaskVariables();
    startTime = performance.now();
    stepStartTime = performance.now();
    lastAdlActionTime = performance.now();

    renderStepCards(selectedTask);
    updateStepCardsUI();

    document.getElementById("adl-pause").style.display = "inline-flex";
    document.getElementById("adl-resume").style.display = "none";
    document.getElementById("adl-stop").style.display = "inline-flex";

    const lightWrap = document.getElementById("light-fallback-wrap");
    if (lightWrap) lightWrap.style.display = (selectedTask === "light") ? "block" : "none";

    const balloonWrap = document.getElementById("balloon-tryagain-wrap");
    if (balloonWrap) balloonWrap.style.display = "none";

    showToast(`🔑 Task Started: ${taskEl.textContent}`, "info");
    showAdlGuidancePopup(selectedTask, 4);
  }

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

      const proceed = () => {
        if (selectedTask === "pour") {
          startPourUprightCalibration(() => startTaskExecution(selectedTask));
        } else {
          runAdlCountdown("GET READY", 4, () => startTaskExecution(selectedTask));
        }
      };

      if (!sessionCalibrated) {
        startCalibration(proceed);
      } else {
        proceed();
      }
    });
  });

  // --- 4 Task Rendering Engines (Translucent, Non-Cluttering AR Overlays) ---
  function updateTask() {
    if (adlPaused || isHandMissing) return;
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
      case "pour":
        drawPourTask(hx, hy);
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
    const nowPerf = performance.now();
    const dt = (nowPerf - lastTankTime) / 1000;
    lastTankTime = nowPerf;

    if (activeTankIndex >= 0 && activeTankIndex < 4) {
      const tank = waterTanks[activeTankIndex];
      tank.level += tankFillSpeed * dt;
      if (tank.level >= 100) {
        tank.level = 100;
        if (!tank.overflowAlerted) {
          tank.overflowAlerted = true;
          showToast(`⚠️ Tank ${activeTankIndex + 1} overflowed!`, "danger");
          if (window.RehabBio) window.RehabBio.playBuzz();
        }
      }
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

      // Hit check on active tank button with 350ms dwell
      const activeCx = tankCentersX[activeTankIndex];
      const dist = Math.hypot(itx - activeCx, ity - buttonY);
      if (dist < buttonR + 18) {
        if (tankDwellTarget !== activeTankIndex) {
          tankDwellTarget = activeTankIndex;
          tankDwellStart = performance.now();
        } else {
          const dwellElapsed = performance.now() - tankDwellStart;
          const dwellProg = Math.min(1.0, dwellElapsed / 350);
          gCtx.beginPath();
          gCtx.arc(activeCx, buttonY, buttonR + 8, -Math.PI / 2, -Math.PI / 2 + dwellProg * Math.PI * 2);
          gCtx.strokeStyle = "#10B981";
          gCtx.lineWidth = 4;
          gCtx.stroke();

          if (dwellElapsed >= 350) {
            secureActiveTank();
            tankDwellTarget = -1;
          }
        }
      } else {
        if (tankDwellTarget === activeTankIndex) {
          tankDwellTarget = -1;
        }
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
    if (palmCenterHistory.length > 0 && currentStepIndex >= 2) {
      const oldestY = palmCenterHistory[0].y;
      const newestY = palmCenterHistory[palmCenterHistory.length - 1].y;
      const now = Date.now();
      
      // Flick: rise of more than 0.08 normalized inside that 300ms window, 1s cooldown
      const nowP = performance.now();
      if (oldestY - newestY > 0.08 && !switchOn && nowP - lastFlickTime > 1000) {
        switchOn = true;
        lastFlickTime = nowP;
        if (window.RehabBio) window.RehabBio.playBeep(880, 0.08, 0.3);
      }
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

    // Draw keypad buttons (keys at least 90px diameter, radius >= 45px)
    const keyRadius = Math.max(45, Math.min(52, w * 0.055));

    padPositions.forEach((pos, i) => {
      const px = pos.x * w, py = pos.y * h;
      const label = padLabels[i];
      const isTarget = currentTargetDigit !== null && label === String(currentTargetDigit);
      const isDwelling = dwellTarget === i;

      // Outer pulsing glow for target digit
      if (isTarget) {
        gCtx.beginPath();
        gCtx.arc(px, py, keyRadius + 8, 0, Math.PI * 2);
        gCtx.strokeStyle = "rgba(245, 158, 11, 0.45)";
        gCtx.lineWidth = 4;
        gCtx.stroke();
      }

      // Key button body (radius >= 45px -> diameter >= 90px)
      gCtx.beginPath();
      gCtx.arc(px, py, keyRadius, 0, Math.PI * 2);
      gCtx.fillStyle = isTarget ? "rgba(245, 158, 11, 0.35)" : "rgba(15, 20, 32, 0.85)";
      gCtx.fill();
      gCtx.strokeStyle = isTarget ? "#F59E0B" : "#38BDF8";
      gCtx.lineWidth = isTarget ? 3 : 1.5;
      gCtx.stroke();

      // Dwell progress ring
      if (isDwelling) {
        const elapsed = performance.now() - dwellStart;
        const prog = Math.min(1.0, elapsed / DWELL_MS);
        gCtx.beginPath();
        gCtx.arc(px, py, keyRadius + 5, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        gCtx.strokeStyle = "#10B981";
        gCtx.lineWidth = 4;
        gCtx.stroke();
      }

      // Digit label (large senior typography)
      gCtx.font = "bold 22px monospace";
      gCtx.fillStyle = isTarget ? "#FFFFFF" : "#E2E8F0";
      gCtx.textAlign = "center";
      gCtx.fillText(label, px, py + 8);
    });
    gCtx.textAlign = "start";

    // Index Fingertip Interaction Detection
    if (wristData && wristData.smoothedCursor) {
      const itx = wristData.smoothedCursor.x * w, ity = wristData.smoothedCursor.y * h;

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

      // Check hit on target digit with smoothed cursor
      if (currentTargetDigit !== null) {
        const targetIdx = padLabels.indexOf(String(currentTargetDigit));
        const targetPos = padPositions[targetIdx];
        const targetPx = targetPos.x * w;
        const targetPy = targetPos.y * h;
        const dist = Math.hypot(itx - targetPx, ity - targetPy);

        // Sticky hit box: 20% larger when cursor is inside
        const hitRadius = (dwellTarget === targetIdx) ? keyRadius * 1.2 : keyRadius;

        if (dist < hitRadius) {
          if (dwellTarget !== targetIdx) {
            // Require 500ms cooldown after press before registering next key
            if (performance.now() - lastPinPressTime > 500) {
              dwellTarget = targetIdx;
              dwellStart = performance.now();
            }
          } else if (performance.now() - dwellStart >= DWELL_MS) { // 350ms dwell
            pinProgress++;
            dwellTarget = -1;
            lastPinPressTime = performance.now();
            if (window.RehabBio) {
              window.RehabBio.playBeep(880, 0.08, 0.3);
            }
            showToast(`✅ Digit ${currentTargetDigit} accepted!`, "success");
            advanceStep();
          }
        } else {
          // Dwell timer resets immediately when cursor leaves key
          if (dwellTarget === targetIdx) dwellTarget = -1;
        }
      }
    }
  }

  // 5. 🫗 Pour the Water Task (Forearm Pronation / Supination Biomechanics)
  function drawPourTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastPourTime) / 1000);
    lastPourTime = now;

    const gw = 120;
    const gh = 170;
    const gx = w * 0.58;
    const gy = h * 0.52;

    // Hand roll = atan2(lm17.y - lm5.y, lm17.x - lm5.x) in degrees minus uprightAngle
    let rawRoll = 0;
    if (wristData && wristData.pinkyMCP && wristData.indexMCP) {
      const dx = wristData.pinkyMCP.x - wristData.indexMCP.x;
      const dy = wristData.pinkyMCP.y - wristData.indexMCP.y;
      rawRoll = Math.atan2(dy, dx) * (180 / Math.PI) - uprightAngle;
      while (rawRoll > 180) rawRoll -= 360;
      while (rawRoll < -180) rawRoll += 360;
    }

    // Smooth with alpha = 0.3
    smoothedPourTilt = 0.3 * rawRoll + 0.7 * smoothedPourTilt;
    const tilt = Math.abs(smoothedPourTilt);
    taskPeakRom = Math.max(taskPeakRom, tilt);

    // flow = clamp((|tilt| - 20) / 70, 0, 1) * maxFlow
    const flow = Math.min(1, Math.max(0, (tilt - 20) / 70)) * patientMaxFlow;
    const rollAngleDeg = smoothedPourTilt;

    const px = Math.max(80, Math.min(w - 80, hx));
    const py = Math.max(60, Math.min(gy - 30, hy));

    const isTilting = tilt > 20;
    const spoutX = px + (rollAngleDeg >= 0 ? 40 : -40);
    const spoutY = py + 20;

    const overGlass = spoutX >= gx - 40 && spoutX <= gx + gw + 40 && spoutY < gy + 30;

    if (isTilting && overGlass && !adlPaused && !isHandMissing) {
      pourGlassLevel = Math.min(125, pourGlassLevel + flow * dt * 100);

      for (let i = 0; i < 3; i++) {
        pourParticles.push({
          x: spoutX + (Math.random() - 0.5) * 8,
          y: spoutY,
          vx: (Math.random() - 0.5) * 1.5,
          vy: 8 + Math.random() * 6,
          radius: 2.5 + Math.random() * 3,
          color: Math.random() > 0.4 ? "#38BDF8" : "#60A5FA",
          alpha: 0.9,
        });
      }

      if (window.RehabBio && Math.random() < 0.2) {
        window.RehabBio.playBeep(420 + pourGlassLevel * 2, 0.04, 0.12);
      }
    }

    if (pourGlassLevel > 100 && !pourSpillAlerted) {
      pourSpillAlerted = true;
      if (window.RehabBio) {
        window.RehabBio.playBuzz();
        window.RehabBio.speak("Careful! Glass is overflowing! Level the pitcher upright!");
      }
      showToast("⚠️ Glass is overflowing! Level pitcher back upright!", "warning");
    }

    if (pourGlassLevel >= 75 && pourGlassLevel <= 100 && !pourTargetReached) {
      pourTargetReached = true;
      if (window.RehabBio) {
        window.RehabBio.playBeep(784, 0.08, 0.3);
        window.RehabBio.speak("Target zone reached! Now rotate pitcher upright!");
      }
      showToast("🎉 Perfect fill! Rotate pitcher upright to finish rep!", "success");
    }

    pourParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= 0.025;
    });
    pourParticles = pourParticles.filter((p) => p.alpha > 0 && p.y < gy + gh);

    pourParticles.forEach((p) => {
      gCtx.save();
      gCtx.globalAlpha = Math.max(0, p.alpha);
      gCtx.fillStyle = p.color;
      gCtx.beginPath();
      gCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      gCtx.fill();
      gCtx.restore();
    });

    // Draw Target Drinking Glass
    gCtx.save();
    gCtx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    gCtx.lineWidth = 3;
    gCtx.fillStyle = "rgba(15, 23, 42, 0.65)";
    gCtx.beginPath();
    gCtx.moveTo(gx, gy);
    gCtx.lineTo(gx + 12, gy + gh);
    gCtx.lineTo(gx + gw - 12, gy + gh);
    gCtx.lineTo(gx + gw, gy);
    gCtx.closePath();
    gCtx.fill();
    gCtx.stroke();

    const targetY1 = gy + gh * (1 - 0.95);
    const targetY2 = gy + gh * (1 - 0.75);
    gCtx.fillStyle = "rgba(16, 185, 129, 0.22)";
    gCtx.fillRect(gx + 10, targetY1, gw - 20, targetY2 - targetY1);
    gCtx.strokeStyle = "#10B981";
    gCtx.lineWidth = 1.5;
    gCtx.setLineDash([4, 4]);
    gCtx.strokeRect(gx + 10, targetY1, gw - 20, targetY2 - targetY1);
    gCtx.setLineDash([]);

    gCtx.font = "bold 11px Inter, sans-serif";
    gCtx.fillStyle = "#10B981";
    gCtx.fillText("🎯 TARGET (75-95%)", gx + gw + 8, targetY2 - 4);

    if (pourGlassLevel > 0) {
      const fillH = Math.min(gh - 8, (Math.min(100, pourGlassLevel) / 100) * (gh - 14));
      const fillY = gy + gh - 4 - fillH;
      const grad = gCtx.createLinearGradient(gx, fillY, gx, gy + gh);
      grad.addColorStop(0, pourGlassLevel > 100 ? "#F59E0B" : "#38BDF8");
      grad.addColorStop(1, "#1D4ED8");
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.moveTo(gx + 14, gy + gh - 4);
      gCtx.lineTo(gx + 12, fillY);
      gCtx.lineTo(gx + gw - 12, fillY);
      gCtx.lineTo(gx + gw - 14, gy + gh - 4);
      gCtx.closePath();
      gCtx.fill();

      gCtx.strokeStyle = "#93C5FD";
      gCtx.lineWidth = 2;
      gCtx.beginPath();
      gCtx.moveTo(gx + 12, fillY);
      gCtx.lineTo(gx + gw - 12, fillY);
      gCtx.stroke();
    }

    gCtx.font = "bold 14px monospace";
    gCtx.fillStyle = pourGlassLevel >= 75 && pourGlassLevel <= 100 ? "#10B981" : (pourGlassLevel > 100 ? "#EF4444" : "#FFFFFF");
    gCtx.textAlign = "center";
    gCtx.fillText(`GLASS: ${Math.round(pourGlassLevel)}%`, gx + gw * 0.5, gy + gh + 24);
    gCtx.textAlign = "start";
    gCtx.restore();

    // Draw Pitcher at Hand Position
    gCtx.save();
    gCtx.translate(px, py);
    const rad = (rollAngleDeg * Math.PI) / 180;
    gCtx.rotate(rad);

    gCtx.fillStyle = "rgba(30, 41, 59, 0.88)";
    gCtx.strokeStyle = isTilting ? "#38BDF8" : "#94A3B8";
    gCtx.lineWidth = 2.5;
    gCtx.beginPath();
    gCtx.roundRect(-30, -40, 60, 80, 10);
    gCtx.fill();
    gCtx.stroke();

    gCtx.fillStyle = "#38BDF8";
    gCtx.beginPath();
    gCtx.moveTo(25, -30);
    gCtx.lineTo(44, -38);
    gCtx.lineTo(30, -20);
    gCtx.closePath();
    gCtx.fill();

    gCtx.strokeStyle = "#94A3B8";
    gCtx.lineWidth = 4;
    gCtx.beginPath();
    gCtx.arc(-32, 0, 16, Math.PI * 0.5, Math.PI * 1.5, false);
    gCtx.stroke();

    gCtx.fillStyle = "rgba(56, 189, 248, 0.5)";
    gCtx.fillRect(-26, 0, 52, 36);

    gCtx.font = "bold 11px Inter, sans-serif";
    gCtx.fillStyle = "#FFFFFF";
    gCtx.textAlign = "center";
    gCtx.fillText("PITCHER", 0, -6);

    gCtx.font = "10px monospace";
    gCtx.fillStyle = isTilting ? "#38BDF8" : "#94A3B8";
    gCtx.fillText(`${Math.round(Math.abs(rollAngleDeg))}°`, 0, 14);
    gCtx.restore();

    gCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
    gCtx.strokeStyle = isTilting ? "#38BDF8" : "#64748B";
    gCtx.lineWidth = 1.5;
    const bannerW = Math.min(480, w * 0.8);
    const bannerX = (w - bannerW) / 2;
    gCtx.beginPath();
    gCtx.roundRect(bannerX, 16, bannerW, 36, 10);
    gCtx.fill();
    gCtx.stroke();

    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.fillStyle = isTilting ? "#38BDF8" : "#E2E8F0";
    gCtx.textAlign = "center";
    let statusMsg = "Tilt forearm (pronation) to stream water into the glass";
    if (pourGlassLevel > 100) statusMsg = "⚠️ OVERFLOW! Rotate forearm back upright!";
    else if (pourTargetReached) statusMsg = "🎯 Great job! Rotate hand upright to complete rep!";
    else if (isTilting && overGlass) statusMsg = "🌊 Pouring into glass… reach the green target zone!";
    gCtx.fillText(statusMsg, w * 0.5, 39);
    gCtx.textAlign = "start";
  }

  // No second animation loop: Updates & rendering are driven directly by onHandResults callback.

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
    } else if (currentTask === "pour") {
      pourGlassLevel = Math.min(100, pourGlassLevel + 25);
      showToast(`🫗 Water poured: ${Math.round(pourGlassLevel)}%`, "info");
      if (pourGlassLevel >= 75) {
        pourTargetReached = true;
        advanceStep();
      }
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
    const duration = Math.floor((performance.now() - startTime) / 1000);
    let finalScore = 100;
    let finalPeakRom = 85;

    if (currentTask === "pour") {
      const normalizedLevel = (pourGlassLevel || 0) / 100.0;
      finalScore = Math.round(Math.max(0, 100 * (1 - Math.abs(normalizedLevel - 0.85) / 0.85)));
      finalPeakRom = Math.round(taskPeakRom || 45);
    } else if (currentTask === "balloon") {
      finalScore = Math.min(100, Math.round(balloonLevel));
      finalPeakRom = Math.round(currentOpenness * 45);
    } else if (currentTask === "watertanks") {
      finalScore = Math.round((tanksSecuredCount / 4) * 100);
      finalPeakRom = 80;
    } else if (currentTask === "light") {
      finalScore = switchOn ? 100 : 50;
      finalPeakRom = 90;
    } else if (currentTask === "pin") {
      finalScore = Math.round((pinProgress / 4) * 100);
      finalPeakRom = 75;
    }

    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "ADL",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: Math.max(1, duration),
          peak_rom: finalPeakRom,
          smoothness_score: 82,
          cheats_blocked: cheatsBlocked,
          score: finalScore,
          metrics_json: JSON.stringify({
            task: currentTask,
            reps: repsCompleted,
            duration,
            score: finalScore,
            peak_rom: finalPeakRom,
          }),
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

  // Light switch fallback button listener
  const lightFallbackBtn = document.getElementById("light-fallback-btn");
  if (lightFallbackBtn) {
    lightFallbackBtn.addEventListener("click", () => {
      if (currentTask !== "light" || adlPaused) return;
      switchOn = !switchOn;
      lastFlickTime = performance.now();
      if (window.RehabBio) window.RehabBio.playBeep(880, 0.08, 0.3);
      showToast(switchOn ? "💡 Switch turned ON!" : "💡 Switch turned OFF", "success");
      if (switchOn && currentStepIndex === 3) {
        advanceStep();
      }
    });
  }

  // Balloon try again button listener
  const balloonTryAgainBtn = document.getElementById("balloon-tryagain-btn");
  if (balloonTryAgainBtn) {
    balloonTryAgainBtn.addEventListener("click", () => {
      const wrap = document.getElementById("balloon-tryagain-wrap");
      if (wrap) wrap.style.display = "none";
      balloonLevel = 0;
      balloonHandOpen = false;
      balloonFullStartTime = null;
      balloonPopped = false;
      balloonParticles = [];
      balloonPumps = 0;
      currentStepIndex = 1;
      updateStepCardsUI();
      showToast("🔄 Balloon reset! Open and close hand to pump.", "info");
    });
  }

  // Initialize camera
  await initCamera();
  });
}

// --- Pure Deterministic Kinematics Module (Exported for Testing) ---
const AdlKinematics = {
  getHandSize(lm) {
    if (!lm || lm.length < 10) return 0.1;
    return Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y) || 0.1;
  },
  calculateOpenness(lm) {
    if (!lm || lm.length < 21) return 0;
    const handSize = this.getHandSize(lm);
    const tips = [8, 12, 16, 20];
    const sum = tips.reduce((acc, t) => acc + Math.hypot(lm[t].x - lm[0].x, lm[t].y - lm[0].y), 0);
    return sum / tips.length / handSize;
  },
  getThresholds(calibOpen, calibClosed) {
    return {
      openThreshold: calibClosed + 0.75 * (calibOpen - calibClosed),
      closeThreshold: calibClosed + 0.25 * (calibOpen - calibClosed),
    };
  },
  detectPump(opennessHistory, calibOpen, calibClosed, wasOpen) {
    const { openThreshold, closeThreshold } = this.getThresholds(calibOpen, calibClosed);
    const current = opennessHistory.reduce((a, b) => a + b, 0) / (opennessHistory.length || 1);
    if (current > openThreshold) {
      return { isOpen: true, isClosed: false, pumped: false, nextState: true };
    } else if (current < closeThreshold && wasOpen) {
      return { isOpen: false, isClosed: true, pumped: true, nextState: false };
    }
    return { isOpen: false, isClosed: false, pumped: false, nextState: wasOpen };
  },
  getPalmCenter(lm) {
    if (!lm || lm.length < 21) return { x: 0.5, y: 0.5 };
    const pts = [0, 5, 9, 13, 17];
    return {
      x: pts.reduce((s, i) => s + lm[i].x, 0) / pts.length,
      y: pts.reduce((s, i) => s + lm[i].y, 0) / pts.length,
    };
  },
  detectFlick(history, windowMs = 300, minRise = 0.08) {
    if (!history || history.length < 2) return false;
    const oldestY = history[0].y;
    const newestY = history[history.length - 1].y;
    return (oldestY - newestY) > minRise;
  },
  calculatePourTiltAndFlow(lm, uprightAngle = 0, maxFlow = 0.35) {
    if (!lm || lm.length < 21) return { roll: 0, tilt: 0, flow: 0 };
    const dx = lm[17].x - lm[5].x;
    const dy = lm[17].y - lm[5].y;
    let roll = Math.atan2(dy, dx) * (180 / Math.PI) - uprightAngle;
    while (roll > 180) roll -= 360;
    while (roll < -180) roll += 360;
    const tilt = Math.abs(roll);
    const flow = Math.min(1, Math.max(0, (tilt - 20) / 70)) * maxFlow;
    return { roll, tilt, flow };
  },
  calculatePinHit(cursor, targetPos, isDwelling, baseRadius = 0.08) {
    const dist = Math.hypot(cursor.x - targetPos.x, cursor.y - targetPos.y);
    const hitRadius = isDwelling ? baseRadius * 1.2 : baseRadius;
    return dist < hitRadius;
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = AdlKinematics;
}
