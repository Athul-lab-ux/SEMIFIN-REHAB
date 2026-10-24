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
  let celebrationActive = false;   // Big ending popup is showing
  let suppressStopLog = false;     // Prevent double telemetry log when ending via celebration
  let currentStepIndex = 0;
  let repsCompleted = 0;
  let targetReps = 3;
  let sessionTimerInterval = null;
  let taskElapsedSeconds = 0;
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
  let taskEnding = false;          // Task finished — input frozen until we return to the menu
  let pendingTargetReps = 3;        // Value picked in the setup popup before the task starts
  let lastFrameTime = 0;            // performance.now() of the previous tracked hand frame

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
  // 💡 Rocker switch: the index fingertip physically drags the rocker knob.
  let lightKnobT = 0;          // 0 = rocker fully DOWN (OFF), 1 = rocker fully UP (ON)
  let lightDragging = false;   // index fingertip is gripping the rocker knob
  let lightLastToggle = 0;     // debounce between ON/OFF changes
  let lightFlips = 0;          // ON/OFF changes performed in the current rep

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

  // 1. Balloon Air Pump States (Left Balloon, Right Pumper, Dual Gesture Detection)
  let balloonLevel = 0; // 0 to 100%
  let balloonHandOpen = true; // Primed for initial squeeze
  let balloonFullStartTime = null;
  let balloonPopped = false;
  let balloonPopTime = 0;
  let balloonParticles = [];
  let balloonPumps = 0;
  let lastPumpActionTime = 0;
  let pumpPlungerOffset = 0;

  // 2. 🚰 4-Tank Water Filling States (Bottom 4 Tanks, 550% Hand Reservoir)
  let waterTanks = [
    { level: 0 },
    { level: 0 },
    { level: 0 },
    { level: 0 },
  ];
  let waterHandReservoir = 550.0; // 550% capacity in patient's reservoir
  let waterSplashParticles = [];
  let waterFloorSplashes = [];
  let lastTankTime = performance.now();
  let tanksCompletedAnnounced = false;

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

  // 6. ☕ Cup Shelf Lift States (Anti-Gravity Shoulder Elevation & ARAT Pick & Place)
  let shelfCupGrasped = false;
  let shelfCupPlaced = false;
  let shelfCupPlacedTime = 0;
  let shelfCupPos = null; // { x, y }
  let shelfParticles = [];
  let shelfSteamTime = 0;
  let shelfDropAlerted = false;
  let shelfPlacedCups = [];        // cups already standing on the shelf (persist across reps)
  let shelfLastPlaceQuality = 100; // 100 = centred in the slot, lower = placed nearby
  const SHELF_SLOTS = 4;           // 4 cups per set

  // 7. 🪟 Clean Window Dust States
  let cleanGlassCells = [];
  const CLEAN_GLASS_COLS = 28;
  const CLEAN_GLASS_ROWS = 18;
  let cleanGlassClearedCount = 0;
  let cleanGlassClearedPct = 0;
  let cleanGlassSparkles = [];
  let cleanGlassCompleted = false;
  let cleanGlassCompletedTime = 0;
  let lastCleanHudPct = -1;   // last percentage written into the step header

  function initCleanGlassCells() {
    cleanGlassCells = [];
    cleanGlassClearedCount = 0;
    cleanGlassClearedPct = 0;
    cleanGlassCompleted = false;
    cleanGlassSparkles = [];
    for (let r = 0; r < CLEAN_GLASS_ROWS; r++) {
      for (let c = 0; c < CLEAN_GLASS_COLS; c++) {
        cleanGlassCells.push({
          row: r,
          col: c,
          opacity: 1.0,
          cleared: false,
        });
      }
    }
  }
  initCleanGlassCells();

  // PIN Pad States (Left-side Confirm Button in Step 6)
  let pinConfirmHovered = false;
  let pinConfirmDwellStart = 0;
  let pinWrongIdx = -1;         // wrong key currently under the fingertip
  let pinWrongStart = 0;        // when the fingertip arrived on that wrong key

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

  // ---------------------------------------------------------------------------
  // 🎯 Reps / Times setup — the patient picks the dose before every task starts
  // ---------------------------------------------------------------------------
  const ADL_REP_CONFIG = {
    balloon:    { label: "🎯 Repetitions", unit: "reps",  min: 1, max: 15, def: 3, prompt: "Choose how many reps you want to complete." },
    watertanks: { label: "🎯 Repetitions", unit: "reps",  min: 1, max: 15, def: 1, prompt: "Each rep fills all 4 tanks to 100%." },
    light:      { label: "🎯 Repetitions", unit: "reps",  min: 1, max: 15, def: 3, prompt: "Each rep = rocker UP (ON) then DOWN (OFF)." },
    pin:        { label: "🎯 No. of Times", unit: "times", min: 1, max: 15, def: 5, prompt: "Each time = enter 4 digits, then confirm." },
    cupshelf:   { label: "☕ No. of Cups", unit: "cups",  min: 1, max: 4,  def: 4, prompt: "Place every cup on the upper shelf." },
    cleanglass: { label: "🎯 No. of Times", unit: "times", min: 1, max: 3, def: 1, prompt: "Each time = clean the whole window." },
  };

  let setupTaskKey = null;
  let setupValue = 3;
  let setupOnConfirm = null;

  function renderSetupValue() {
    const cfg = ADL_REP_CONFIG[setupTaskKey];
    const valEl = document.getElementById("asp-value");
    if (valEl) valEl.textContent = setupValue;
    const minus = document.getElementById("asp-minus");
    const plus = document.getElementById("asp-plus");
    if (cfg) {
      if (minus) minus.disabled = setupValue <= cfg.min;
      if (plus) plus.disabled = setupValue >= cfg.max;
    }
  }

  function openRepsSetup(taskKey, onConfirm) {
    const cfg = ADL_REP_CONFIG[taskKey];
    const popup = document.getElementById("adl-setup-popup");
    if (!cfg || !popup) {
      // Tasks without a dose selector (Pour the Water) start straight away
      if (onConfirm) onConfirm(cfg ? cfg.def : 1);
      return;
    }
    setupTaskKey = taskKey;
    setupValue = cfg.def;
    setupOnConfirm = onConfirm;

    const titleEl = document.getElementById("asp-title");
    const subEl = document.getElementById("asp-sub");
    const unitEl = document.getElementById("asp-unit");
    const rangeEl = document.getElementById("asp-range-text");
    if (titleEl) titleEl.textContent = ADL_TASKS[taskKey] ? ADL_TASKS[taskKey].name : "Task";
    if (subEl) subEl.textContent = cfg.prompt;
    if (unitEl) unitEl.textContent = cfg.unit;
    if (rangeEl) rangeEl.textContent = `Range: ${cfg.min} – ${cfg.max} ${cfg.unit}`;
    renderSetupValue();
    popup.classList.add("show");

    if (window.RehabBio) {
      window.RehabBio.speak(`${cfg.prompt} Currently ${cfg.def} ${cfg.unit}.`);
    }
  }

  (function wireSetupPopup() {
    const popup = document.getElementById("adl-setup-popup");
    if (!popup) return;
    const cfgNow = () => ADL_REP_CONFIG[setupTaskKey] || { min: 1, max: 15 };
    const minus = document.getElementById("asp-minus");
    const plus = document.getElementById("asp-plus");
    const start = document.getElementById("asp-start");

    if (minus) {
      minus.addEventListener("click", () => {
        const c = cfgNow();
        setupValue = Math.max(c.min, setupValue - 1);
        renderSetupValue();
      });
    }
    if (plus) {
      plus.addEventListener("click", () => {
        const c = cfgNow();
        setupValue = Math.min(c.max, setupValue + 1);
        renderSetupValue();
      });
    }
    if (start) {
      start.addEventListener("click", () => {
        popup.classList.remove("show");
        const cb = setupOnConfirm;
        setupOnConfirm = null;
        if (cb) cb(setupValue);
      });
    }
    const cancel = document.getElementById("asp-cancel");
    if (cancel) {
      cancel.addEventListener("click", () => {
        popup.classList.remove("show");
        setupOnConfirm = null;
        document.getElementById("task-menu").classList.remove("hidden");
        showToast("Task cancelled — choose a task when you are ready.", "info");
      });
    }
  })();

  // ---------------------------------------------------------------------------
  // 📈 Measured session performance (feeds the recovery / performance score)
  // Every value below is computed from what the patient actually did — no
  // fixed constants are sent to the server.
  // ---------------------------------------------------------------------------
  const ADL_TIME_BENCHMARK = { balloon: 45, watertanks: 60, light: 25, pin: 40, pour: 25, cupshelf: 30, cleanglass: 45 };

  const perf = {
    task: null,
    repScores: [],
    repTimes: [],
    repStartedAt: 0,
    repWaterUsed: 0,
    repPinMistakes: 0,
    pops: 0, repPops: 0, spills: 0, drops: 0, totalWaterUsed: 0, pinMistakes: 0, extraFlips: 0,
    lastX: null, lastY: null, lastSpeed: null,
    speedN: 0, speedSum: 0, jerkSum: 0, jerkN: 0,
    minX: 1, maxX: 0, minY: 1, maxY: 0,
    frames: 0,

    reset(taskKey) {
      this.task = taskKey;
      this.repScores = [];
      this.repTimes = [];
      this.repStartedAt = performance.now();
      this.repWaterUsed = 0;
      this.repPinMistakes = 0;
      this.pops = 0; this.repPops = 0; this.spills = 0; this.drops = 0;
      this.totalWaterUsed = 0; this.pinMistakes = 0; this.extraFlips = 0;
      this.lastX = null; this.lastY = null; this.lastSpeed = null;
      this.speedN = 0; this.speedSum = 0; this.jerkSum = 0; this.jerkN = 0;
      this.minX = 1; this.maxX = 0; this.minY = 1; this.maxY = 0;
      this.frames = 0;
    },

    // Called for every tracked hand frame: reach envelope + movement fluidity
    observe(x, y, dt) {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      this.frames++;
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;

      const step = Math.max(0.008, dt || 0.033);
      if (this.lastX !== null) {
        const speed = Math.hypot(x - this.lastX, y - this.lastY) / step;
        this.speedN++;
        this.speedSum += speed;
        if (this.lastSpeed !== null) {
          this.jerkSum += Math.abs(speed - this.lastSpeed);
          this.jerkN++;
        }
        this.lastSpeed = speed;
      }
      this.lastX = x;
      this.lastY = y;
    },

    addRep(score) {
      this.repScores.push(Math.max(0, Math.min(100, Math.round(score || 0))));
      this.repTimes.push(Math.max(1, (performance.now() - this.repStartedAt) / 1000));
      this.repStartedAt = performance.now();
      this.repWaterUsed = 0;
      this.repPinMistakes = 0;
      this.repPops = 0;
    },

    // Movement fluidity from frame-to-frame speed changes (tremor proxy)
    smoothness() {
      if (this.jerkN < 8 || this.speedN < 8) return 55;
      const meanSpeed = this.speedSum / this.speedN;
      if (meanSpeed <= 0.0001) return 40;
      const ratio = Math.min(1.6, (this.jerkSum / this.jerkN) / meanSpeed);
      return Math.round(Math.max(25, Math.min(98, 100 - 45 * ratio)));
    },

    // Functional reach envelope measured in this session
    reachRom() {
      if (this.frames < 10) return 0;
      const ext = Math.min(1, Math.hypot(this.maxX - this.minX, this.maxY - this.minY));
      return Math.round(Math.min(165, 30 + 135 * ext));
    },

    timeEfficiency() {
      const bench = ADL_TIME_BENCHMARK[this.task] || 40;
      const spent = this.repTimes.length
        ? this.repTimes.reduce((a, b) => a + b, 0) / this.repTimes.length
        : taskElapsedSeconds;
      if (!spent || spent <= 0) return 50;
      return Math.round(Math.max(15, Math.min(100, (bench / spent) * 100)));
    },

    summary() {
      const avgRep = this.repScores.length
        ? this.repScores.reduce((a, b) => a + b, 0) / this.repScores.length
        : 0;
      const completion = targetReps > 0 ? Math.min(1, repsCompleted / targetReps) : 1;
      const smooth = this.smoothness();
      const timeEff = this.timeEfficiency();
      const penalty = Math.min(
        25,
        this.pops * 6 + this.spills * 4 + this.drops * 5 +
        Math.min(10, Math.max(0, this.totalWaterUsed - 400 * Math.max(1, repsCompleted)) / 40) +
        this.pinMistakes * 2 + this.extraFlips
      );
      let score = 0.5 * avgRep + 0.2 * smooth + 0.15 * timeEff + 0.15 * completion * 100 - penalty;
      score = Math.round(Math.max(0, Math.min(100, score)));
      const peakRom = this.task === "pour"
        ? Math.round(Math.max(taskPeakRom || 0, this.reachRom()))
        : this.reachRom();
      return {
        score,
        smoothness: smooth,
        peakRom,
        avgRep: Math.round(avgRep),
        completion: Math.round(completion * 100),
        timeEfficiency: timeEff,
        penalty: Math.round(penalty),
        reps: repsCompleted,
        target: targetReps,
      };
    },
  };

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

  // --- 6-Step Clinical Protocol Definitions for 7 Tasks ---
  const ADL_TASKS = {
    balloon: {
      name: "🎈 Balloon Air Pump",
      steps: [
        { name: "Neutral Ready", desc: "Hand open facing air pump" },
        { name: "Air Intake", desc: "Open fingers wide to draw air into pump" },
        { name: "Clench to Pump", desc: "Squeeze tight fist to compress cylinder" },
        { name: "Fill to 100%", desc: "Repeatedly squeeze fist until meter is 100%" },
        { name: "5s Caution Hold", desc: "Hold steady 5s — DO NOT over-pump!" },
        { name: "Rep Complete", desc: "Relax hand to complete rep" },
      ],
    },
    watertanks: {
      name: "🚰 4-Tank Water Filling",
      steps: [
        { name: "Neutral Poise", desc: "Hold 550% reservoir poised above tanks" },
        { name: "Fill Tank 1", desc: "Stream water into first tank to 100%" },
        { name: "Fill Tank 2", desc: "Move stream over second tank to 100%" },
        { name: "Fill Tank 3", desc: "Move stream over third tank to 100%" },
        { name: "Fill Tank 4", desc: "Move stream over fourth tank to 100%" },
        { name: "All Tanks Full", desc: "All 4 tanks at 100% — Lab complete!" },
      ],
    },
    light: {
      name: "💡 Rocker Light Switch",
      steps: [
        { name: "Neutral Rest", desc: "Hand relaxed below the switch" },
        { name: "Point Index", desc: "Show only your index finger" },
        { name: "Touch Rocker", desc: "Bring the fingertip onto the rocker knob" },
        { name: "Push UP → ON", desc: "Slide the rocker up — room light ON" },
        { name: "Push DOWN → OFF", desc: "Slide the rocker down — room light OFF" },
        { name: "Retract Hand", desc: "Return hand to home base" },
      ],
    },
    pin: {
      name: "🔢 Touchless PIN Pad",
      steps: [
        { name: "Neutral Ready", desc: "Hand poised in front of keypad" },
        { name: "Enter Digit 1", desc: "Tap random digit with index finger" },
        { name: "Enter Digit 2", desc: "Tap random digit with index finger" },
        { name: "Enter Digit 3", desc: "Tap random digit with index finger" },
        { name: "Enter Digit 4", desc: "Tap random digit with index finger" },
        { name: "Tap Confirm", desc: "Tap side [ ✅ CONFIRM ] button to finish set" },
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
    cupshelf: {
      name: "☕ Cup Shelf Lift",
      steps: [
        { name: "Neutral Rest", desc: "Hand poised at counter ready base" },
        { name: "Reach to Cup", desc: "Lower hand down towards the mug" },
        { name: "Pinch to Grasp", desc: "Bring thumb & index together on cup tip 🤏" },
        { name: "Anti-Gravity Lift", desc: "Lift arm upward toward upper shelf" },
        { name: "Align at Shelf", desc: "Hold mug steady inside the shelf slot" },
        { name: "Release to Place", desc: "Spread thumb & index apart to place 🖐️" },
      ],
    },
    cleanglass: {
      name: "🪟 Clean Window Dust",
      steps: [
        { name: "Neutral Ready", desc: "Raise index finger toward dusty window" },
        { name: "Initial Wipe", desc: "Rub circular strokes on upper dusty area" },
        { name: "Center Scrub", desc: "Clean heavy white dust across center" },
        { name: "Wide Perimeters", desc: "Wipe perimeter corners clear of dust" },
        { name: "Detail Scrub", desc: "Clear remaining dust patches on glass" },
        { name: "Crystal Clean", desc: "Glass is crystal clear (≥90% clear)" },
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
    } else if (taskKey === "cupshelf") {
      switch (stepIndex) {
        case 0:
          body = `
            <line x1="15" y1="65" x2="85" y2="65" stroke="#475569" stroke-width="2"/>
            <rect x="25" y="48" width="16" height="17" rx="3" fill="#0284C7" stroke="${lines}" stroke-width="1.5"/>
            <path d="M 41 53 A 4 4 0 0 1 41 61" stroke="${lines}" stroke-width="1.5" fill="none"/>
            <circle cx="65" cy="55" r="5" fill="${dots}"/>
          `;
          break;
        case 1:
          body = `
            <line x1="15" y1="65" x2="85" y2="65" stroke="#475569" stroke-width="2"/>
            <rect x="25" y="48" width="16" height="17" rx="3" fill="#0284C7" stroke="${lines}" stroke-width="1.5"/>
            <path d="M 41 53 A 4 4 0 0 1 41 61" stroke="${lines}" stroke-width="1.5" fill="none"/>
            <path d="M 65 30 Q 50 40 33 46" stroke="${lines}" stroke-width="2" stroke-dasharray="3,3" fill="none"/>
            <circle cx="33" cy="46" r="5" fill="${dots}"/>
          `;
          break;
        case 2:
          body = `
            <line x1="15" y1="65" x2="85" y2="65" stroke="#475569" stroke-width="2"/>
            <rect x="35" y="48" width="16" height="17" rx="3" fill="#0284C7" stroke="${lines}" stroke-width="1.5"/>
            <path d="M 51 53 A 4 4 0 0 1 51 61" stroke="${lines}" stroke-width="1.5" fill="none"/>
            <circle cx="43" cy="48" r="8" fill="${green}" opacity="0.4"/>
            <circle cx="43" cy="48" r="5" fill="${green}"/>
            <text x="43" y="42" font-size="8" fill="#FFF" text-anchor="middle">🤏</text>
          `;
          break;
        case 3:
          body = `
            <line x1="50" y1="25" x2="90" y2="25" stroke="#475569" stroke-width="2"/>
            <path d="M 35 60 Q 42 40 55 35" stroke="${amber}" stroke-width="2.5" fill="none"/>
            <polygon points="55,30 60,36 53,38" fill="${amber}"/>
            <rect x="47" y="35" width="16" height="17" rx="3" fill="#0284C7" stroke="${lines}" stroke-width="1.5"/>
            <text x="55" y="30" font-size="8" fill="${amber}" text-anchor="middle">⬆️ LIFT</text>
          `;
          break;
        case 4:
          body = `
            <line x1="45" y1="28" x2="92" y2="28" stroke="#475569" stroke-width="2"/>
            <rect x="62" y="11" width="18" height="17" rx="3" fill="none" stroke="${green}" stroke-dasharray="3,3" stroke-width="2"/>
            <rect x="60" y="13" width="16" height="15" rx="2" fill="#0284C7" stroke="${lines}" stroke-width="1.5"/>
            <text x="70" y="8" font-size="7" font-weight="bold" fill="${green}" text-anchor="middle">TARGET</text>
          `;
          break;
        case 5:
          body = `
            <line x1="45" y1="28" x2="92" y2="28" stroke="#475569" stroke-width="2"/>
            <rect x="62" y="11" width="16" height="17" rx="3" fill="#0284C7" stroke="${green}" stroke-width="1.5"/>
            <path d="M 78 16 A 4 4 0 0 1 78 24" stroke="${green}" stroke-width="1.5" fill="none"/>
            <circle cx="60" cy="18" r="6" fill="${dots}"/>
            <text x="70" y="45" font-size="9" fill="${green}" text-anchor="middle">✓ PLACED</text>
          `;
          break;
      }
    } else if (taskKey === "cleanglass") {
      switch (stepIndex) {
        case 0:
          body = `
            <rect x="18" y="14" width="64" height="52" rx="4" fill="#1E293B" stroke="${dots}" stroke-width="1.5"/>
            <rect x="22" y="18" width="56" height="44" rx="2" fill="rgba(241,245,249,0.85)"/>
            <line x1="50" y1="18" x2="50" y2="62" stroke="#475569" stroke-width="1.5"/>
            <line x1="22" y1="40" x2="78" y2="40" stroke="#475569" stroke-width="1.5"/>
            <circle cx="50" cy="72" r="4" fill="${dots}"/>
          `;
          break;
        case 1:
        case 2:
        case 3:
        case 4:
          body = `
            <rect x="18" y="14" width="64" height="52" rx="4" fill="#0F172A" stroke="${dots}" stroke-width="1.5"/>
            <rect x="22" y="18" width="56" height="44" rx="2" fill="rgba(241,245,249,0.35)"/>
            <line x1="50" y1="18" x2="50" y2="62" stroke="#334155" stroke-width="1"/>
            <line x1="22" y1="40" x2="78" y2="40" stroke="#334155" stroke-width="1"/>
            <path d="M 32 28 Q 50 22 65 32 Q 48 46 34 40" stroke="${amber}" stroke-width="3" fill="none" stroke-linecap="round"/>
            <circle cx="65" cy="32" r="5" fill="${green}"/>
            <circle cx="65" cy="32" r="9" fill="none" stroke="${dots}" stroke-width="1.5"/>
            <text x="50" y="74" font-size="8" fill="${amber}" font-weight="bold" text-anchor="middle">SCRUB</text>
          `;
          break;
        case 5:
          body = `
            <rect x="18" y="14" width="64" height="52" rx="4" fill="#0284C7" stroke="${green}" stroke-width="2"/>
            <rect x="22" y="18" width="56" height="44" rx="2" fill="rgba(56, 189, 248, 0.25)"/>
            <line x1="50" y1="18" x2="50" y2="62" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
            <line x1="22" y1="40" x2="78" y2="40" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
            <path d="M 40 42 L 48 50 L 62 34" stroke="${green}" stroke-width="3" fill="none" stroke-linecap="round"/>
            <text x="50" y="74" font-size="8" font-weight="bold" fill="${green}" text-anchor="middle">CLEAN! ✨</text>
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
      } else if (currentTask === "pin" && currentStepIndex === 5) {
        stepEl.textContent = `Step 6: Tap [ ✅ CONFIRM ] Button on the LEFT!`;
      } else if (currentTask === "watertanks") {
        const fullCount = waterTanks.filter(t => t.level >= 100).length;
        if (fullCount >= 4) {
          stepEl.textContent = `Step 6: All 4 Tanks 100% Full! Complete!`;
        } else {
          stepEl.textContent = `Step ${fullCount + 1}: Fill Tank ${fullCount + 1} to 100% (${fullCount}/4 Full)`;
        }
      } else if (currentTask === "cleanglass") {
        stepEl.textContent = `Step ${currentStepIndex + 1}: ${taskInfo.steps[currentStepIndex].name} (${Math.round(cleanGlassClearedPct)}% Cleared)`;
      } else if (currentTask === "balloon" && currentStepIndex === 4) {
        stepEl.textContent = `Step 5: ⚠️ CAUTION: Hold Steady 5s (DO NOT PUMP!)`;
      } else if (currentTask === "cupshelf") {
        if (currentStepIndex === 1) {
          stepEl.textContent = `Step 2: Reach down towards the coffee mug`;
        } else if (currentStepIndex === 2) {
          stepEl.textContent = `Step 3: Show 2 fingers (thumb+index) 🤏 and pinch together to grasp`;
        } else if (currentStepIndex === 3) {
          stepEl.textContent = `Step 4: Lift arm upward ⬆️ toward top shelf`;
        } else if (currentStepIndex === 4 || currentStepIndex === 5) {
          stepEl.textContent = `Step 5/6: Align inside shelf target & spread fingers 🖐️`;
        } else {
          stepEl.textContent = `Step ${currentStepIndex + 1}: ${taskInfo.steps[currentStepIndex].name}`;
        }
      } else {
        stepEl.textContent = `Step ${currentStepIndex + 1}: ${taskInfo.steps[currentStepIndex].name}`;
      }
    }
  }

  // --- Advance to Next Step ---
  function advanceStep() {
    if (taskEnding) return;
    lastAdlActionTime = performance.now();
    stepStartTime = performance.now();
    const taskInfo = ADL_TASKS[currentTask];
    if (!taskInfo) return;

    if (window.RehabBio) {
      window.RehabBio.playBeep(660 + currentStepIndex * 70, 0.08, 0.25);
    }
    currentStepIndex++;
    if (currentStepIndex >= 6) {
      completeRep();
      return;
    }
    updateStepCardsUI();
  }

  // --- Quality of the rep that just ended (measured from what the patient did) ---
  function taskRepQuality() {
    switch (currentTask) {
      case "balloon": {
        if (perf.repPops > 0) return Math.max(45, 100 - perf.repPops * 25);
        return balloonLevel >= 100 ? 100 : Math.round(Math.max(20, Math.min(100, balloonLevel)));
      }
      case "watertanks": {
        // 400% of water is exactly what 4 empty tanks hold — any surplus is wasted effort
        const extra = Math.max(0, perf.repWaterUsed - 400);
        return Math.round(Math.max(45, 100 - extra / 4));
      }
      case "light": {
        const extraFlips = Math.max(0, lightFlips - 2);
        return Math.max(50, 100 - extraFlips * 10);
      }
      case "pin":
        return Math.max(40, 100 - perf.repPinMistakes * 12);
      case "pour": {
        const level = Math.min(1.2, pourGlassLevel / 100);
        return Math.round(Math.max(0, 100 * (1 - Math.abs(level - 0.85) / 0.85)));
      }
      case "cupshelf":
        return shelfLastPlaceQuality;
      case "cleanglass":
        return Math.round(Math.max(0, Math.min(100, cleanGlassClearedPct)));
      default:
        return 70;
    }
  }

  // --- One rep (a full 6-step cycle) completed ---
  function completeRep() {
    if (taskEnding) return true;
    repsCompleted++;
    perf.addRep(taskRepQuality());
    if (repsEl) repsEl.textContent = `${repsCompleted} / ${targetReps}`;
    if (window.RehabBio) {
      window.RehabBio.speak(`Repetition ${repsCompleted} complete! Excellent!`);
    }

    if (repsCompleted >= targetReps) {
      tasksCompleted++;
      finishTask();
      return true;
    }

    showToast(`✅ ${repsCompleted} of ${targetReps} complete! Next one starts at Step 1`, "info");
    currentStepIndex = 0;
    resetTaskVariables();
    stepStartTime = performance.now();
    updateStepCardsUI();
    return false;
  }

  // --- End of the whole task: freeze the scene, log real metrics, celebrate, exit ---
  function finishTask() {
    if (taskEnding) return;
    taskEnding = true;
    hideAdlGuidancePopup();
    if (sessionTimerInterval) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
    }
    if (repsEl) repsEl.textContent = `${repsCompleted} / ${targetReps}`;
    if (window.RehabBio) {
      window.RehabBio.playRepChime();
      window.RehabBio.speak(`Task complete! ${repsCompleted} of ${targetReps} finished.`);
    }
    suppressStopLog = true;   // the celebration exit must not log the session twice
    logSession();             // log the measured score once
    showAdlCelebration(currentTask);
  }

  function resetTaskVariables() {
    switchOn = false;
    lightKnobT = 0;
    lightDragging = false;
    lightFlips = 0;
    randomPin = generateRandomPin();
    lastAnnouncedDigit = null;
    pinProgress = 0;
    dwellTarget = -1;
    dwellStart = 0;
    lastPinPressTime = 0;
    pinConfirmHovered = false;
    pinConfirmDwellStart = 0;

    // Balloon Task reset
    balloonLevel = 0;
    balloonHandOpen = true; // Primed for first clench
    balloonFullStartTime = null;
    balloonPopped = false;
    balloonParticles = [];
    balloonPumps = 0;
    pumpPlungerOffset = 0;

    // Water Tanks reset
    waterTanks = [
      { level: 0 },
      { level: 0 },
      { level: 0 },
      { level: 0 },
    ];
    waterHandReservoir = 550.0;
    waterSplashParticles = [];
    waterFloorSplashes = [];
    lastTankTime = performance.now();
    tanksCompletedAnnounced = false;

    // Pour the Water reset
    pourGlassLevel = 0;
    pourTargetReached = false;
    pourParticles = [];
    lastPourTime = performance.now();
    pourSpillAlerted = false;
    smoothedPourTilt = 0;
    taskPeakRom = 0;

    // Cup Shelf Lift reset
    shelfCupGrasped = false;
    shelfCupPlaced = false;
    shelfCupPlacedTime = 0;
    shelfCupPos = null;
    shelfParticles = [];
    shelfDropAlerted = false;
    shelfLastPlaceQuality = 100;
    // NOTE: shelfPlacedCups intentionally survives a rep — the cups already on
    // the shelf stay there across the whole task and are cleared on task start.

    // Clean Window Dust reset
    initCleanGlassCells();
    lastCleanHudPct = -1;
  }

  // --- Guidance Popup Content & 10s Inactivity Re-trigger (7 Clinical Tasks) ---
  const ADL_GUIDES = {
    balloon: {
      title: "🎈 Balloon Air Pump",
      what: "Pump the balloon to 100% by opening and closing your hand, then hold steady 5s.",
      how: "Spread fingers wide to intake air into the right cylinder pump, then clench a tight fist to pump air through the connecting hose into the left balloon. Once 100%, hold still for 5 seconds — DO NOT pump again or it pops!",
      tip: "Retrains repetitive finger extension & flexion coordination, grip control, and response inhibition.",
    },
    watertanks: {
      title: "🚰 4-Tank Water Filling",
      what: "Fill all 4 tanks to 100% using your 550% hand reservoir — that is one rep.",
      how: "Move your hand over a tank; water streams down into it. Fill all four to 100%. Water poured outside the tanks is wasted and lowers your score, so aim before you pour. The reservoir refills automatically if it runs dry.",
      tip: "Retrains targeted spatial positioning, sustained arm reach, and bilateral coordination.",
    },
    light: {
      title: "💡 Rocker Light Switch",
      what: "Switch the room light ON and OFF by moving the rocker with your index finger.",
      how: "Show only your index finger (point at the camera). Touch the rocker knob, then slide it UP ⬆ to switch the light ON and DOWN ⬇ to switch it OFF. Keep the index finger extended — the rocker only moves while you hold it.",
      tip: "Retrains index finger isolation, graded vertical wrist control against gravity, and fine force control.",
    },
    pin: {
      title: "🔢 Touchless PIN Pad",
      what: "Tap the 4 random digits in order, then tap the CONFIRM button on the LEFT side.",
      how: "Listen to each random number and tap it directly with your index fingertip. Once all 4 digits are in, move your fingertip to the [ ✅ CONFIRM ] button on the LEFT side and hold briefly. Each confirm completes one time.",
      tip: "Retrains cognitive-motor sequence targeting and index finger precision.",
    },
    pour: {
      title: "🫗 Pour the Water",
      what: "Pour water from the pitcher into the glass until it reaches the green target zone.",
      how: "Hold the pitcher upright, position it above the glass, then rotate your forearm (pronation) to pour. The task ends as soon as the glass reaches the green 75–95% target — one clean fill, scored on how close you stop to 85%.",
      tip: "Retrains forearm pronation and supination rotation, essential for eating, drinking, and turning door handles.",
    },
    cupshelf: {
      title: "☕ Cup Shelf Lift",
      what: "Place every cup on the upper shelf using a thumb + index pinch.",
      how: "1. Show TWO fingers — thumb and index (☝️🤏).\n2. Bring thumb & index CLOSER together near the cup to grip it.\n3. Lift your arm up to the upper shelf and SPREAD thumb & index apart above a free slot. Landing close to the slot also counts. The next cup then appears on the counter.",
      tip: "Retrains precise thumb-index pincer control, anti-gravity shoulder elevation, and coordinated grasp-to-release (ARAT protocol).",
    },
    cleanglass: {
      title: "🪟 Clean Window Dust",
      what: "Wipe heavy white dust off the large glass window with your index finger.",
      how: "Use smooth wiping and scrubbing motions with your index finger across the whole pane. The set ends when the window is ≥90% clear; if you chose more than one time, fresh dust returns for the next set.",
      tip: "Retrains active shoulder flexion, elbow extension, and horizontal adduction/abduction across a large functional reach workspace.",
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
    if (taskEnding) return;   // Task is finished — scene frozen until we return to the menu
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
    const pincerNorm = pincerDist / palmScale;

    // Finger extension ratios (tip → MCP distance / knuckle width).
    // Used for "index finger only" pointing and for the 2-finger (thumb+index) grasp.
    const fingerRatios = [5, 9, 13, 17].map((mcp, i) => {
      const tip = [8, 12, 16, 20][i];
      return Math.hypot(lm[tip].x - lm[mcp].x, lm[tip].y - lm[mcp].y) / palmScale;
    });
    const indexExtended = fingerRatios[0] > 0.95;
    // Forgiving enough for a real (often partly bent) middle finger, while a
    // flat open hand (ratio ≈ 2.5) or a fist (index not extended) never matches.
    const isPointing = indexExtended && fingerRatios[1] < 1.15;
    const twoFingerGrip = indexExtended && fingerRatios[1] < 1.15;

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
      pincerNorm,
      fingerRatios,
      indexExtended,
      isPointing,
      twoFingerGrip,
      knuckleAngle,
      palmCenter,
    };

    // Measured performance sampling (reach envelope + movement fluidity)
    const frameNow = performance.now();
    const frameDt = lastFrameTime ? (frameNow - lastFrameTime) / 1000 : 0.033;
    lastFrameTime = frameNow;
    if (perf.task && currentTask !== "menu") {
      perf.observe(indexTip.x, indexTip.y, frameDt);
    }

    if (currentTask === "balloon" && !adlPaused) {
      processBalloonHandMotion(currentOpenness, lm, handSize);
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
  function processBalloonHandMotion(openness, lm, handSize) {
    let avgFingerCurl = 1.0;
    if (lm && lm.length >= 21) {
      const c1 = Math.hypot(lm[8].x - lm[5].x, lm[8].y - lm[5].y);
      const c2 = Math.hypot(lm[12].x - lm[9].x, lm[12].y - lm[9].y);
      const c3 = Math.hypot(lm[16].x - lm[13].x, lm[16].y - lm[13].y);
      const c4 = Math.hypot(lm[20].x - lm[17].x, lm[20].y - lm[17].y);
      avgFingerCurl = (c1 + c2 + c3 + c4) / 4 / (handSize || 0.1);
    }

    const openThreshold = calibClosed + 0.65 * (calibOpen - calibClosed);
    const closeThreshold = calibClosed + 0.35 * (calibOpen - calibClosed);

    const isOpen = openness > Math.min(openThreshold, 1.50) || avgFingerCurl > 0.72;
    const isClosed = openness < Math.max(closeThreshold, 1.25) || avgFingerCurl < 0.50;

    if (isOpen) {
      if (!balloonHandOpen) {
        balloonHandOpen = true;
        pumpPlungerOffset = 0;
        if (balloonLevel < 100 && !balloonPopped) {
          if (window.RehabBio) window.RehabBio.playBeep(440, 0.04, 0.15);
        }
      }
    } else if (isClosed && balloonHandOpen) {
      // Hand transition: was open, now closed into fist -> PUMP!
      balloonHandOpen = false;
      pumpPlungerOffset = 32;
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
    perf.pops++;
    perf.repPops++;

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
      if (adlPaused || taskEnding || currentTask === "menu" || !wristData) return;
      // Water tanks and window cleaning drive their own step index from
      // measured progress, so the generic gates must not touch them.
      if (currentTask === "watertanks" || currentTask === "cleanglass") return;

      const cx = 0.5, cy = 0.46;
      const distToTarget = Math.hypot(handPos.x - cx, handPos.y - cy);
      const now = performance.now();   // same clock as stepStartTime
      const held = (ms) => now - stepStartTime >= ms;

      switch (currentStepIndex) {
        case 0: // Step 1: Neutral Rest (hand at ready base)
          if ((distToTarget > 0.18 || handPos.y > 0.60) && held(400)) advanceStep();
          break;

        case 1: // Step 2: Approach / reach
          if (currentTask === "balloon") {
            if (balloonHandOpen) advanceStep();
          } else if (currentTask === "light") {
            if (wristData.isPointing && distToTarget < 0.30 && held(350)) advanceStep();
          } else if (currentTask === "pour") {
            if (handPos.x > 0.35 && handPos.x < 0.75 && handPos.y < 0.65 && held(350)) advanceStep();
          }
          // cupshelf: reach + pinch are evaluated in drawCupShelfTask
          break;

        case 2: // Step 3: Contact / grasp
          if (currentTask === "balloon") {
            if (balloonPumps >= 1) advanceStep();
          } else if (currentTask === "light") {
            // The index fingertip must actually grip the rocker knob
            if (lightDragging && held(250)) advanceStep();
          } else if (currentTask === "pin") {
            // Each digit advances the step from the keypad itself
          } else if (currentTask === "pour") {
            if (Math.abs(wristData.knuckleAngle) > 30 && held(350)) advanceStep();
          }
          break;

        case 3: // Step 4: Motor action
          {
            let actionDone = false;
            if (currentTask === "balloon") {
              actionDone = balloonLevel >= 100;
            } else if (currentTask === "light") {
              actionDone = switchOn === true;      // rocker pushed UP
            } else if (currentTask === "pin") {
              actionDone = pinProgress >= 4;
            } else if (currentTask === "pour") {
              actionDone = pourGlassLevel >= 40;
            }
            if (actionDone && held(350)) advanceStep();
          }
          break;

        case 4: // Step 5: sustain / second half of the action
          if (currentTask === "balloon") {
            // 5s caution hold is timed in drawBalloonTask
          } else if (currentTask === "light") {
            if (switchOn === false && held(400)) advanceStep();   // rocker pushed DOWN
          } else if (currentTask === "pour") {
            // Target zone completion is handled in drawPourTask
          } else if (currentTask === "pin") {
            // Confirm tap is handled in drawPinTask
          } else if (currentTask !== "cupshelf" && held(800)) {
            advanceStep();
          }
          break;

        case 5: // Step 6: return home / release
          if (currentTask === "pin" || currentTask === "cupshelf") {
            // Finished by the confirm button / the fingertip release
          } else if ((distToTarget > 0.18 || handPos.y > 0.60) && held(400)) {
            advanceStep();
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

  function stopAdl(options = {}) {
    hideAdlGuidancePopup();
    taskEnding = false;
    if (celebrationTimer) { clearTimeout(celebrationTimer); celebrationTimer = null; }
    hideAdlCelebration();
    if (sessionTimerInterval) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
    }
    const timerDisplay = document.getElementById("adl-timer-display");
    if (timerDisplay) timerDisplay.textContent = "00:00";
    if (suppressStopLog) {
      suppressStopLog = false;  // Already logged logSession in celebration path
    } else if (currentTask !== "menu") {
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
    const repsLabelEl = document.getElementById("reps-label");
    if (repsLabelEl) repsLabelEl.textContent = "🎯 Repetitions";
    const lightWrap = document.getElementById("light-fallback-wrap");
    if (lightWrap) lightWrap.style.display = "none";
    const balloonWrap = document.getElementById("balloon-tryagain-wrap");
    if (balloonWrap) balloonWrap.style.display = "none";
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
    taskEnding = false;
    const repCfg = ADL_REP_CONFIG[selectedTask];
    targetReps = Math.max(1, pendingTargetReps || (repCfg ? repCfg.def : 1));
    // Clear per-task furniture (cups already shelved, dust, counters)
    shelfPlacedCups = [];
    lastFrameTime = 0;
    if (repsEl) repsEl.textContent = `0 / ${targetReps}`;
    const repsLabelEl = document.getElementById("reps-label");
    if (repsLabelEl) repsLabelEl.textContent = repCfg ? repCfg.label : "🎯 Repetitions";
    resetTaskVariables();
    perf.reset(selectedTask);
    startTime = performance.now();
    stepStartTime = performance.now();
    lastAdlActionTime = performance.now();

    // Start live HUD stopwatch
    if (sessionTimerInterval) clearInterval(sessionTimerInterval);
    taskElapsedSeconds = 0;
    const timerDisplay = document.getElementById("adl-timer-display");
    if (timerDisplay) timerDisplay.textContent = "00:00";
    sessionTimerInterval = setInterval(() => {
      if (!adlPaused && currentTask !== "menu") {
        taskElapsedSeconds++;
        const mm = String(Math.floor(taskElapsedSeconds / 60)).padStart(2, "0");
        const ss = String(taskElapsedSeconds % 60).padStart(2, "0");
        if (timerDisplay) timerDisplay.textContent = `${mm}:${ss}`;
      }
    }, 1000);

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
      if (taskEnding) return;
      const selectedTask = btn.dataset.task;
      if (!cameraActive) {
        initCamera();
      }

      // Every task first asks for its dose (reps / times / cups)
      const beginTask = (chosenReps) => {
        pendingTargetReps = Math.max(1, chosenReps || 1);
        document.getElementById("task-menu").classList.add("hidden");
        taskEl.textContent = btn.textContent.trim().split("\n")[0];
        if (stepEl) stepEl.textContent = "Step 1: Neutral Rest";
        if (repsEl) repsEl.textContent = `0 / ${pendingTargetReps}`;

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
      };

      openRepsSetup(selectedTask, beginTask);
    });
  });

  // --- 4 Task Rendering Engines (Translucent, Non-Cluttering AR Overlays) ---
  function updateTask() {
    if (adlPaused || isHandMissing || taskEnding) return;
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
      case "cupshelf":
        drawCupShelfTask(hx, hy);
        break;
      case "cleanglass":
        drawCleanGlassTask(hx, hy);
        break;
    }
  }

  // 1. 🎈 Balloon Air Pump Task (Left Balloon, Right Pumper, Connecting Hose)
  function drawBalloonTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;
    const bx = w * 0.28, by = h * 0.48; // Balloon on LEFT side
    const px = w * 0.74, py = h * 0.50; // Mechanical Pumper on RIGHT side

    // Smoothly return plunger offset
    if (pumpPlungerOffset > 0) {
      pumpPlungerOffset = Math.max(0, pumpPlungerOffset - 1.5);
    }

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
    const barW = Math.min(480, w * 0.72);
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

    // 5-Second Hold Countdown or Caution Banner (hold starts at 90%)
    if (balloonFullStartTime !== null && !balloonPopped) {
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

      if (elapsed >= 5000) {
        balloonFullStartTime = null;
        advanceStep();
        if (window.RehabBio) {
          window.RehabBio.speak("Super! You held steady without popping the balloon!");
        }
        showToast("🌟 Repetition complete! Balloon securely held without popping!", "success");
      }
    } else if (balloonPopped) {
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

      // Hands-free recovery: the balloon refills itself, no mouse needed.
      if (performance.now() - balloonPopTime > 2500) {
        balloonPopped = false;
        balloonLevel = 0;
        balloonPumps = 0;
        balloonHandOpen = false;
        balloonFullStartTime = null;
        const tryWrap = document.getElementById("balloon-tryagain-wrap");
        if (tryWrap) tryWrap.style.display = "none";
        if (currentStepIndex > 2) currentStepIndex = 2;
        updateStepCardsUI();
        showToast("🔄 Balloon refilled — open your hand and pump again.", "info");
      }
    }

    // Balloon metrics
    const baseR = 36;
    const maxExtraR = 74;
    const currentR = baseR + (balloonLevel / 100) * maxExtraR;
    const knotX = bx + 6;
    const knotY = by + currentR + 4;
    const hoseStartY = py + 55;
    const hoseStartX = px - 18;

    // 1. CONNECTING PNEUMATIC HOSE (Wire connecting right pumper to left balloon)
    gCtx.save();
    // Outer rubber hose
    gCtx.strokeStyle = "#1E293B";
    gCtx.lineWidth = 9;
    gCtx.beginPath();
    gCtx.moveTo(hoseStartX, hoseStartY);
    gCtx.bezierCurveTo(px - 140, py + 120, bx + 120, knotY + 45, knotX, knotY);
    gCtx.stroke();

    // Inner glowing pneumatic core
    gCtx.strokeStyle = balloonPumps > 0 ? "#38BDF8" : "#334155";
    gCtx.lineWidth = 4;
    gCtx.stroke();

    // Animated Air Pulse Bubbles travelling along the hose
    const hosePhase = (Date.now() / 20) % 60;
    gCtx.strokeStyle = "#FFFFFF";
    gCtx.lineWidth = 3;
    gCtx.setLineDash([8, 18]);
    gCtx.lineDashOffset = -hosePhase;
    gCtx.stroke();
    gCtx.setLineDash([]);
    gCtx.restore();

    // 2. BALLOON RENDERING (on LEFT side)
    if (!balloonPopped) {
      gCtx.save();
      // Balloon knot
      gCtx.fillStyle = "#B91C1C";
      gCtx.beginPath();
      gCtx.moveTo(bx - 8, knotY);
      gCtx.lineTo(bx + 8, knotY);
      gCtx.lineTo(bx, by + currentR);
      gCtx.closePath();
      gCtx.fill();

      // Balloon body (oval)
      const bGrad = gCtx.createRadialGradient(
        bx - currentR * 0.3,
        by - currentR * 0.35,
        currentR * 0.1,
        bx,
        by,
        currentR
      );
      bGrad.addColorStop(0, "#F87171");
      bGrad.addColorStop(0.65, "#EF4444");
      bGrad.addColorStop(1.0, "#991B1B");

      gCtx.fillStyle = bGrad;
      gCtx.beginPath();
      gCtx.ellipse(bx, by, currentR * 0.88, currentR, 0, 0, Math.PI * 2);
      gCtx.fill();

      // Shiny 3D highlight
      gCtx.fillStyle = "rgba(255, 255, 255, 0.45)";
      gCtx.beginPath();
      gCtx.ellipse(
        bx - currentR * 0.36,
        by - currentR * 0.38,
        currentR * 0.22,
        currentR * 0.32,
        -Math.PI / 6,
        0,
        Math.PI * 2
      );
      gCtx.fill();

      // Balloon Text Label
      gCtx.font = "bold 13px Inter, sans-serif";
      gCtx.fillStyle = "#FFFFFF";
      gCtx.textAlign = "center";
      gCtx.fillText("🎈 BALLOON", bx, by + 4);
      gCtx.restore();
    }

    // 3. MECHANICAL AIR CYLINDER PUMPER (on RIGHT side)
    gCtx.save();
    // Base floor stand
    gCtx.fillStyle = "#1E293B";
    gCtx.strokeStyle = "#475569";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(px - 44, py + 58, 88, 14, 6);
    gCtx.fill();
    gCtx.stroke();

    // Pump Main Cylinder
    const cylW = 48, cylH = 110;
    const cylTopY = py - 46;
    const cylGrad = gCtx.createLinearGradient(px - cylW / 2, cylTopY, px + cylW / 2, cylTopY);
    cylGrad.addColorStop(0, "#475569");
    cylGrad.addColorStop(0.3, "#94A3B8");
    cylGrad.addColorStop(0.7, "#64748B");
    cylGrad.addColorStop(1.0, "#334155");

    gCtx.fillStyle = cylGrad;
    gCtx.beginPath();
    gCtx.roundRect(px - cylW / 2, cylTopY, cylW, cylH, 8);
    gCtx.fill();
    gCtx.strokeStyle = "#CBD5E1";
    gCtx.lineWidth = 1.5;
    gCtx.stroke();

    // Pressure Gauge on Cylinder Side
    const gaugeX = px + cylW / 2 + 12;
    const gaugeY = cylTopY + 36;
    gCtx.beginPath();
    gCtx.arc(gaugeX, gaugeY, 14, 0, Math.PI * 2);
    gCtx.fillStyle = "#0F172A";
    gCtx.fill();
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.stroke();
    // Needle
    const needleAngle = -Math.PI * 0.7 + (balloonLevel / 100) * Math.PI * 1.4;
    gCtx.beginPath();
    gCtx.moveTo(gaugeX, gaugeY);
    gCtx.lineTo(gaugeX + Math.cos(needleAngle) * 10, gaugeY + Math.sin(needleAngle) * 10);
    gCtx.strokeStyle = "#EF4444";
    gCtx.lineWidth = 2;
    gCtx.stroke();

    // Cylinder Label
    gCtx.font = "bold 9px monospace";
    gCtx.fillStyle = "#E2E8F0";
    gCtx.textAlign = "center";
    gCtx.fillText("AIR PUMP", px, cylTopY + 50);
    gCtx.font = "bold 11px monospace";
    gCtx.fillStyle = "#38BDF8";
    gCtx.fillText(`${balloonLevel}%`, px, cylTopY + 68);

    // Piston Rod (moves down on fist clench)
    const shaftH = 38 - (pumpPlungerOffset * 0.7);
    const shaftTopY = cylTopY - shaftH;
    gCtx.fillStyle = "#E2E8F0";
    gCtx.fillRect(px - 4, shaftTopY, 8, shaftH);

    // T-Handle Grip on Top of Plunger
    gCtx.fillStyle = balloonHandOpen ? "#10B981" : "#F59E0B";
    gCtx.strokeStyle = "#FFFFFF";
    gCtx.lineWidth = 1.5;
    gCtx.beginPath();
    gCtx.roundRect(px - 32, shaftTopY - 12, 64, 12, 5);
    gCtx.fill();
    gCtx.stroke();

    gCtx.font = "bold 9px Inter, sans-serif";
    gCtx.fillStyle = "#070D18";
    gCtx.fillText(balloonHandOpen ? "PULL UP" : "PUSH DOWN", px, shaftTopY - 3);
    gCtx.restore();

    // Bottom Hand Status Pill
    const handPillW = 320, handPillH = 34;
    const handPillX = (w - handPillW) / 2;
    const handPillY = h * 0.84;
    gCtx.fillStyle = "rgba(15, 23, 42, 0.88)";
    gCtx.strokeStyle = balloonHandOpen ? "#10B981" : "#F59E0B";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(handPillX, handPillY, handPillW, handPillH, 17);
    gCtx.fill();
    gCtx.stroke();

    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.fillStyle = balloonHandOpen ? "#10B981" : "#F59E0B";
    gCtx.textAlign = "center";
    if (balloonFullStartTime !== null) {
      gCtx.fillText("🛑 HOLD HAND STILL (DO NOT PUMP)", w * 0.5, handPillY + 22);
    } else if (balloonHandOpen) {
      gCtx.fillText("🖐️ Hand OPEN (Air Intake) → Clench FIST ✊ to Pump!", w * 0.5, handPillY + 22);
    } else {
      gCtx.fillText("✊ Fist Pumped! Open Fingers Wide 🖐️ for Next Intake", w * 0.5, handPillY + 22);
    }
    gCtx.textAlign = "start";
  }

  // 2. 🚰 4-Tank Water Filling Task (550% Hand Reservoir, Bottom 4 Tanks)
  function drawWaterTanksTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;
    const now = performance.now();
    const dt = Math.min(0.08, (now - lastTankTime) / 1000);
    lastTankTime = now;

    // Splash particles animation
    if (waterSplashParticles.length > 0) {
      waterSplashParticles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35; // gravity
        p.alpha -= 0.035;
      });
      waterSplashParticles = waterSplashParticles.filter((p) => p.alpha > 0);
      waterSplashParticles.forEach((p) => {
        gCtx.save();
        gCtx.globalAlpha = Math.max(0, p.alpha);
        gCtx.fillStyle = p.color || "#38BDF8";
        gCtx.beginPath();
        gCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        gCtx.fill();
        gCtx.restore();
      });
    }

    // Top Reservoir Gauge Bar
    const barW = Math.min(500, w * 0.74);
    const barH = 28;
    const barX = (w - barW) / 2;
    const barY = h * 0.08;

    gCtx.fillStyle = "rgba(15, 23, 42, 0.90)";
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(barX, barY, barW, barH, 14);
    gCtx.fill();
    gCtx.stroke();

    // Reservoir fill (max 550%)
    const resPercent = Math.max(0, Math.min(1.0, waterHandReservoir / 550.0));
    const resFillW = resPercent * (barW - 6);
    if (resFillW > 0) {
      const grad = gCtx.createLinearGradient(barX + 3, barY, barX + resFillW, barY);
      grad.addColorStop(0, "#0284C7");
      grad.addColorStop(0.5, "#38BDF8");
      grad.addColorStop(1.0, "#60A5FA");
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.roundRect(barX + 3, barY + 3, resFillW, barH - 6, 11);
      gCtx.fill();
    }

    gCtx.font = "bold 13px Inter, monospace";
    gCtx.fillStyle = "#FFFFFF";
    gCtx.textAlign = "center";
    gCtx.fillText(`💧 HAND RESERVOIR: ${Math.round(waterHandReservoir)}% / 550%`, w * 0.5, barY + 19);
    gCtx.textAlign = "start";

    // Auto-refill reservoir if user emptied it before all tanks full
    if (waterHandReservoir <= 0) {
      waterHandReservoir = 550.0;
      showToast("💧 Hand reservoir refilled (+550%)! Keep pouring.", "info");
    }

    // Layout of 4 Bottom Tanks
    const tankCentersX = [w * 0.15, w * 0.38, w * 0.62, w * 0.85];
    const tankW = Math.min(108, w * 0.17);
    const tankH = Math.min(150, h * 0.28);
    const tankY = h * 0.62;

    // Hand / Pitcher stream origin
    const px = Math.max(40, Math.min(w - 40, hx));
    const py = Math.max(50, Math.min(tankY - 45, hy));
    const pourRate = 30.0; // 30% per second fill rate

    // Determine if stream is hovering over any tank
    let activeHoverTank = -1;
    for (let i = 0; i < 4; i++) {
      const cx = tankCentersX[i];
      if (Math.abs(px - cx) <= tankW / 2 + 10) {
        activeHoverTank = i;
        break;
      }
    }

    // Water Stream Physics
    const streamStartY = py + 26;
    let streamEndY = h * 0.94; // floor default

    if (activeHoverTank !== -1) {
      const targetTank = waterTanks[activeHoverTank];
      const waterSurfaceY = tankY + tankH - (targetTank.level / 100) * (tankH - 12);
      streamEndY = waterSurfaceY;

      // Fill tank & deplete reservoir
      if (waterHandReservoir > 0) {
        if (targetTank.level < 100) {
          const fillDelta = Math.min(100 - targetTank.level, pourRate * dt);
          targetTank.level += fillDelta;
          waterHandReservoir = Math.max(0, waterHandReservoir - fillDelta);
          perf.repWaterUsed += fillDelta;
          perf.totalWaterUsed += fillDelta;
        } else {
          // Tank already 100% full: water overflows
          const wasted = pourRate * dt;
          waterHandReservoir = Math.max(0, waterHandReservoir - wasted);
          perf.repWaterUsed += wasted;
          perf.totalWaterUsed += wasted;
        }

        // Bubbles inside tank
        for (let b = 0; b < 2; b++) {
          waterSplashParticles.push({
            x: px + (Math.random() - 0.5) * 16,
            y: streamEndY,
            vx: (Math.random() - 0.5) * 3,
            vy: -2 - Math.random() * 3,
            radius: 2 + Math.random() * 3,
            color: "#60A5FA",
            alpha: 0.9,
          });
        }
      }
    } else {
      // Pouring outside tanks -> wastes realistically onto floor
      if (waterHandReservoir > 0) {
        const wasted = pourRate * dt;
        waterHandReservoir = Math.max(0, waterHandReservoir - wasted);
        perf.repWaterUsed += wasted;
        perf.totalWaterUsed += wasted;
        // Floor splash particles
        for (let b = 0; b < 2; b++) {
          waterSplashParticles.push({
            x: px + (Math.random() - 0.5) * 20,
            y: streamEndY,
            vx: (Math.random() - 0.5) * 4,
            vy: -1 - Math.random() * 2,
            radius: 2 + Math.random() * 2.5,
            color: "#93C5FD",
            alpha: 0.75,
          });
        }
      }
    }

    // Draw cascading water stream
    gCtx.save();
    gCtx.strokeStyle = "rgba(56, 189, 248, 0.85)";
    gCtx.lineWidth = 9;
    gCtx.lineCap = "round";
    gCtx.setLineDash([12, 8]);
    gCtx.lineDashOffset = -(Date.now() / 10) % 20;
    gCtx.beginPath();
    gCtx.moveTo(px, streamStartY);
    gCtx.lineTo(px, streamEndY);
    gCtx.stroke();
    gCtx.setLineDash([]);
    gCtx.restore();

    // Draw the 4 Bottom Tanks
    let fullTanksCount = 0;
    for (let i = 0; i < 4; i++) {
      const cx = tankCentersX[i];
      const tank = waterTanks[i];
      const isFull = tank.level >= 100;
      if (isFull) fullTanksCount++;
      const isOver = activeHoverTank === i;

      // Tank Body (Clear Acrylic Container)
      gCtx.save();
      gCtx.fillStyle = "rgba(15, 23, 42, 0.82)";
      gCtx.strokeStyle = isFull ? "#10B981" : isOver ? "#38BDF8" : "#475569";
      gCtx.lineWidth = isOver ? 3 : 2;
      gCtx.beginPath();
      gCtx.roundRect(cx - tankW / 2, tankY, tankW, tankH, [6, 6, 12, 12]);
      gCtx.fill();
      gCtx.stroke();

      // Measurement tick marks (25%, 50%, 75%, 100%)
      gCtx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      gCtx.lineWidth = 1;
      [0.25, 0.50, 0.75].forEach((frac) => {
        const markY = tankY + tankH - frac * (tankH - 12);
        gCtx.beginPath();
        gCtx.moveTo(cx - tankW / 2 + 4, markY);
        gCtx.lineTo(cx - tankW / 2 + 14, markY);
        gCtx.stroke();
      });

      // Water Level in Tank
      const fillHeight = (Math.min(100, tank.level) / 100) * (tankH - 12);
      if (fillHeight > 0) {
        const waterTopY = tankY + tankH - fillHeight - 4;
        const wGrad = gCtx.createLinearGradient(cx, waterTopY, cx, tankY + tankH);
        if (isFull) {
          wGrad.addColorStop(0, "#34D399");
          wGrad.addColorStop(1, "#059669");
        } else {
          wGrad.addColorStop(0, "#38BDF8");
          wGrad.addColorStop(1, "#1D4ED8");
        }
        gCtx.fillStyle = wGrad;
        gCtx.beginPath();
        gCtx.roundRect(cx - tankW / 2 + 4, waterTopY, tankW - 8, fillHeight, [3, 3, 8, 8]);
        gCtx.fill();

        // Water surface shine
        gCtx.strokeStyle = isFull ? "#A7F3D0" : "#BAE6FD";
        gCtx.lineWidth = 2;
        gCtx.beginPath();
        gCtx.moveTo(cx - tankW / 2 + 6, waterTopY);
        gCtx.lineTo(cx + tankW / 2 - 6, waterTopY);
        gCtx.stroke();
      }

      // Tank Header Label
      gCtx.font = "bold 13px Inter, sans-serif";
      gCtx.fillStyle = isFull ? "#34D399" : isOver ? "#38BDF8" : "#E2E8F0";
      gCtx.textAlign = "center";
      gCtx.fillText(`TANK ${i + 1}`, cx, tankY - 10);

      // Percentage Text
      gCtx.font = "bold 14px monospace";
      gCtx.fillStyle = "#FFFFFF";
      gCtx.fillText(isFull ? "100% FULL ✅" : `${Math.round(tank.level)}%`, cx, tankY + tankH / 2);
      gCtx.restore();
    }

    // Draw Water Dispenser Pitcher at hand position
    gCtx.save();
    gCtx.translate(px, py);
    gCtx.fillStyle = "rgba(30, 41, 59, 0.92)";
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(-22, -26, 44, 52, 8);
    gCtx.fill();
    gCtx.stroke();

    // Spout at bottom
    gCtx.fillStyle = "#38BDF8";
    gCtx.beginPath();
    gCtx.moveTo(-10, 26);
    gCtx.lineTo(10, 26);
    gCtx.lineTo(0, 34);
    gCtx.closePath();
    gCtx.fill();

    // Pitcher Label
    gCtx.font = "bold 9px Inter, sans-serif";
    gCtx.fillStyle = "#FFFFFF";
    gCtx.textAlign = "center";
    gCtx.fillText("POURER", 0, -6);
    gCtx.fillText(`💧 ${Math.round(waterHandReservoir)}%`, 0, 10);
    gCtx.restore();

    // Update Step Index dynamically based on tanks filled
    if (!taskEnding) {
      const nextStep = Math.min(5, fullTanksCount);
      if (nextStep !== currentStepIndex) {
        currentStepIndex = nextStep;
        updateStepCardsUI();
      }
    }

    // Completion: all 4 tanks at 100% = one full rep
    const allFull = fullTanksCount >= 4;
    if (allFull && !tanksCompletedAnnounced) {
      tanksCompletedAnnounced = true;
      if (window.RehabBio) {
        window.RehabBio.playRepChime();
        window.RehabBio.speak("Outstanding! All 4 water tanks are 100% filled!");
      }
      showToast("🎉 All 4 tanks 100% full! Outstanding job!", "success");
      completeRep();
    }
  }

  // 3. 💡 Light Switch Task — INDEX-FINGER ROCKER DRAG
  // The patient points the index finger, touches the rocker knob and physically
  // slides it UP (room light ON) or DOWN (room light OFF). The rocker only moves
  // while an extended index finger is actually holding it.
  const LIGHT = {
    grabRadius: 0.18,     // Fingertip-to-knob distance that grips the rocker (normalized)
    travel: 0.30,         // Knob travel from bottom (OFF) to top (ON), × canvas height
    onAt: 0.62,           // Knob pushed past this = ON
    offAt: 0.38,          // Knob pushed past this = OFF
    cooldownMs: 450,      // Debounce between state changes
    lastToggle: 0,
  };

  function drawLightTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;
    const cx = w * 0.5, cy = h * 0.46;
    const plateW = 92, plateH = 190;

    // ---- 0. Room lighting — the whole background follows the wall switch ----
    gCtx.save();
    if (switchOn) {
      const glow = gCtx.createRadialGradient(cx, cy - plateH * 0.35, 20, cx, cy - plateH * 0.35, w * 0.78);
      glow.addColorStop(0, "rgba(253, 224, 71, 0.32)");
      glow.addColorStop(0.45, "rgba(251, 191, 36, 0.13)");
      glow.addColorStop(1, "rgba(251, 191, 36, 0)");
      gCtx.fillStyle = glow;
    } else {
      gCtx.fillStyle = "rgba(2, 6, 14, 0.55)";
    }
    gCtx.fillRect(0, 0, w, h);
    gCtx.restore();

    // ---- 1. Wall plate ----
    gCtx.fillStyle = "rgba(20, 24, 34, 0.82)";
    gCtx.strokeStyle = switchOn ? "#10B981" : "#64748B";
    gCtx.lineWidth = 2.5;
    gCtx.beginPath();
    gCtx.roundRect(cx - plateW / 2, cy - plateH / 2, plateW, plateH, 12);
    gCtx.fill();
    gCtx.stroke();

    // ---- 2. Rocker driven ONLY by an extended index finger ----
    const itx = wristData && wristData.smoothedCursor ? wristData.smoothedCursor.x * w : hx;
    const ity = wristData && wristData.smoothedCursor ? wristData.smoothedCursor.y * h : hy;
    const pointing = !!(wristData && wristData.isPointing);

    // Knob geometry (0 = rocker fully DOWN/OFF, 1 = fully UP/ON)
    const knobR = 26;
    const knobTopY = cy - (LIGHT.travel * h) / 2;
    const knobBottomY = cy + (LIGHT.travel * h) / 2;
    const knobY = knobBottomY - lightKnobT * (knobBottomY - knobTopY);

    const nearKnob = Math.hypot(itx - cx, ity - knobY) < LIGHT.grabRadius * h;
    // Generous corridor: a shaking hand must not lose the rocker mid-slide
    const nearPlate = Math.abs(itx - cx) < plateW * 1.3 && Math.abs(ity - cy) < plateH * 0.85;

    // Grip the rocker with the index fingertip, then slide it
    if (pointing && (nearKnob || (lightDragging && nearPlate))) {
      lightDragging = true;
      const t = (knobBottomY - ity) / (knobBottomY - knobTopY);
      lightKnobT = Math.max(0, Math.min(1, t));
    } else if (lightDragging && (!pointing || !nearPlate)) {
      lightDragging = false;   // finger let go of the rocker
    }

    // Live light state follows the knob position (hysteresis stops flicker)
    const lightNow = performance.now();
    let wantOn = switchOn;
    if (lightKnobT >= LIGHT.onAt) wantOn = true;
    else if (lightKnobT <= LIGHT.offAt) wantOn = false;

    if (wantOn !== switchOn && lightNow - LIGHT.lastToggle >= LIGHT.cooldownMs) {
      switchOn = wantOn;
      LIGHT.lastToggle = lightNow;
      lastFlickTime = lightNow;
      lightFlips++;
      if (window.RehabBio) {
        window.RehabBio.playBeep(switchOn ? 880 : 440, 0.08, 0.3);
        window.RehabBio.speak(switchOn ? "Light on!" : "Light off!");
      }
      showToast(switchOn ? "💡 Light ON (rocker pushed UP)" : "🔌 Light OFF (rocker pushed DOWN)", "success");
    }

    // Rocker slot + knob (the knob slides with the finger)
    const rockerH = LIGHT.travel * h + 52;
    const rockerY = cy - rockerH / 2;
    gCtx.fillStyle = "rgba(8, 12, 20, 0.9)";
    gCtx.strokeStyle = lightDragging ? "#FBBF24" : "#334155";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(cx - plateW / 2 + 12, rockerY, plateW - 24, rockerH, 10);
    gCtx.fill();
    gCtx.stroke();

    gCtx.save();
    if (switchOn) {
      gCtx.shadowColor = "#FDE047";
      gCtx.shadowBlur = 22;
    }
    gCtx.beginPath();
    gCtx.roundRect(cx - knobR, knobY - 18, knobR * 2, 36, 8);
    gCtx.fillStyle = lightDragging ? "#FBBF24" : (switchOn ? "#10B981" : "#475569");
    gCtx.fill();
    gCtx.strokeStyle = "#FFFFFF";
    gCtx.lineWidth = 1.5;
    gCtx.stroke();
    gCtx.restore();

    // Knob grip lines
    gCtx.strokeStyle = "rgba(7, 13, 24, 0.55)";
    gCtx.lineWidth = 2;
    for (let g = -1; g <= 1; g++) {
      gCtx.beginPath();
      gCtx.moveTo(cx - 10, knobY + g * 7);
      gCtx.lineTo(cx + 10, knobY + g * 7);
      gCtx.stroke();
    }

    // Labels
    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.textAlign = "left";
    gCtx.fillStyle = switchOn ? "#10B981" : "#38BDF8";
    gCtx.fillText("ON ⬆", cx - 18, cy - plateH / 2 + 34);
    gCtx.fillStyle = !switchOn ? "#FFFFFF" : "#64748B";
    gCtx.fillText("OFF ⬇", cx - 18, cy + plateH / 2 - 10);
    gCtx.textAlign = "start";

    // Glowing light bulb indicator above the switch plate (ON = glowing yellow)
    const bulbY = cy - plateH / 2 - 70;
    gCtx.save();
    if (switchOn) {
      gCtx.shadowColor = "#FDE047";
      gCtx.shadowBlur = 40;
    }
    gCtx.font = "52px Segoe UI Emoji, sans-serif";
    gCtx.textAlign = "center";
    gCtx.fillText(switchOn ? "💡" : "🔴", cx, bulbY);
    gCtx.restore();
    gCtx.font = "bold 12px Inter, sans-serif";
    gCtx.fillStyle = switchOn ? "#FDE047" : "#94A3B8";
    gCtx.textAlign = "center";
    gCtx.fillText(switchOn ? "ON — rocker UP" : "OFF — rocker DOWN", cx, bulbY + 34);

    // Fingertip reticle
    if (wristData && wristData.smoothedCursor) {
      gCtx.beginPath();
      gCtx.arc(itx, ity, 12, 0, Math.PI * 2);
      gCtx.strokeStyle = lightDragging ? "#FBBF24" : (pointing ? "#10B981" : "#38BDF8");
      gCtx.lineWidth = 2.5;
      gCtx.stroke();
      gCtx.font = "bold 10px Inter, sans-serif";
      gCtx.fillStyle = lightDragging ? "#FBBF24" : (pointing ? "#10B981" : "#94A3B8");
      gCtx.textAlign = "center";
      gCtx.fillText(
        lightDragging ? "HOLD & SLIDE ⬆ / ⬇" : (pointing ? "POINT AT THE ROCKER" : "SHOW INDEX FINGER ☝️"),
        itx, ity - 16
      );
      gCtx.textAlign = "start";
    }

    // Status banner at bottom: instruction + current state
    const bannerW = Math.min(520, w * 0.84);
    const bannerX = (w - bannerW) / 2;
    const bannerY = h * 0.88;
    gCtx.fillStyle = "rgba(15, 23, 42, 0.9)";
    gCtx.strokeStyle = switchOn ? "#10B981" : "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(bannerX, bannerY, bannerW, 38, 12);
    gCtx.fill();
    gCtx.stroke();
    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.textAlign = "center";
    gCtx.fillStyle = "#FFFFFF";
    const lightStatus = switchOn
      ? "💡 LIGHT ON — slide the rocker DOWN ⬇ with your index finger to switch OFF"
      : "🔌 LIGHT OFF — point your index finger & slide the rocker UP ⬆ to switch ON";
    gCtx.fillText(lightStatus, w * 0.5, bannerY + 24);
    gCtx.textAlign = "start";
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
      gCtx.fillText("👉 STEP 6: TAP [ ✅ CONFIRM ] BUTTON ON THE LEFT!", w * 0.5, h * 0.08 + 24);
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

    // Confirm Button on the LEFT side — always visible and reachable (never off-screen)
    const confirmBox = { x: Math.max(96, w * 0.13), y: h * 0.50, w: 150, h: 78 };
    const confirmArmed = pinProgress >= 4;
    if (currentStepIndex >= 1) {
      gCtx.save();
      const hx2 = wristData && wristData.smoothedCursor ? wristData.smoothedCursor.x * w : hx;
      const hy2 = wristData && wristData.smoothedCursor ? wristData.smoothedCursor.y * h : hy;
      const hoverConfirm = (
        hx2 >= confirmBox.x - confirmBox.w / 2 && hx2 <= confirmBox.x + confirmBox.w / 2 &&
        hy2 >= confirmBox.y - confirmBox.h / 2 && hy2 <= confirmBox.y + confirmBox.h / 2
      );
      if (confirmArmed) {
        gCtx.fillStyle = pinConfirmHovered ? "rgba(16, 185, 129, 0.95)" : "rgba(5, 150, 105, 0.85)";
        gCtx.strokeStyle = "#FFFFFF";
        gCtx.lineWidth = pinConfirmHovered ? 3.5 : 2;
      } else {
        gCtx.fillStyle = "rgba(71, 85, 105, 0.55)";
        gCtx.strokeStyle = "rgba(148, 163, 184, 0.6)";
        gCtx.lineWidth = 2;
      }
      gCtx.beginPath();
      gCtx.roundRect(confirmBox.x - confirmBox.w / 2, confirmBox.y - confirmBox.h / 2, confirmBox.w, confirmBox.h, 14);
      gCtx.fill();
      gCtx.stroke();

      if (confirmArmed) {
        // Pulsing outer ring
        const pulseR = 50 + Math.sin(Date.now() / 120) * 4;
        gCtx.beginPath();
        gCtx.arc(confirmBox.x, confirmBox.y, pulseR, 0, Math.PI * 2);
        gCtx.strokeStyle = "rgba(16, 185, 129, 0.4)";
        gCtx.lineWidth = 2.5;
        gCtx.stroke();
      }

      gCtx.font = "bold 16px Inter, sans-serif";
      gCtx.fillStyle = "#FFFFFF";
      gCtx.textAlign = "center";
      gCtx.fillText("✅ CONFIRM", confirmBox.x, confirmBox.y - 2);
      gCtx.font = "bold 9px Inter, sans-serif";
      if (confirmArmed) {
        gCtx.fillText("Hold / Tap to Submit", confirmBox.x, confirmBox.y + 18);
      } else {
        gCtx.fillText(`Enter 4 digits first (${pinProgress}/4)`, confirmBox.x, confirmBox.y + 18);
      }
      gCtx.restore();
    }

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

      // 1. Check hit on target digit with smoothed cursor
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

          // Holding a WRONG key for a moment counts as a targeting error
          let wrongIdx = -1;
          padPositions.forEach((pos, i) => {
            if (padLabels[i] !== String(currentTargetDigit) &&
                Math.hypot(itx - pos.x * w, ity - pos.y * h) < keyRadius) {
              wrongIdx = i;
            }
          });
          if (wrongIdx === -1) {
            pinWrongIdx = -1;
            pinWrongStart = 0;
          } else if (wrongIdx !== pinWrongIdx) {
            pinWrongIdx = wrongIdx;
            pinWrongStart = performance.now();
          } else if (performance.now() - pinWrongStart > 650) {
            pinWrongIdx = -1;
            pinWrongStart = 0;
            perf.repPinMistakes++;
            perf.pinMistakes++;
            showToast(`⚠️ That is ${padLabels[wrongIdx]} — the target is ${currentTargetDigit}`, "warning");
          }
        }
      }

      // 2. Check hit / dwell on Side Confirm button in Step 6
      if (pinProgress >= 4) {
        const isOverConfirm = (
          itx >= confirmBox.x - confirmBox.w / 2 &&
          itx <= confirmBox.x + confirmBox.w / 2 &&
          ity >= confirmBox.y - confirmBox.h / 2 &&
          ity <= confirmBox.y + confirmBox.h / 2
        );

        if (isOverConfirm) {
          if (!pinConfirmHovered) {
            pinConfirmHovered = true;
            pinConfirmDwellStart = performance.now();
          } else {
            const dwellElapsed = performance.now() - pinConfirmDwellStart;
            const dwellProg = Math.min(1.0, dwellElapsed / DWELL_MS);

            // Dwell progress ring around confirm button
            gCtx.beginPath();
            gCtx.arc(confirmBox.x, confirmBox.y, 44, -Math.PI / 2, -Math.PI / 2 + dwellProg * Math.PI * 2);
            gCtx.strokeStyle = "#FFFFFF";
            gCtx.lineWidth = 4;
            gCtx.stroke();

            if (dwellElapsed >= DWELL_MS) {
              pinConfirmHovered = false;
              pinConfirmDwellStart = 0;
              if (window.RehabBio) {
                window.RehabBio.playRepChime();
                window.RehabBio.speak("PIN code confirmed!");
              }
              showToast("🎉 PIN Confirmed! Set complete!", "success");
              advanceStep();
              randomPin = generateRandomPin();
              pinProgress = 0;
            }
          }
        } else {
          pinConfirmHovered = false;
        }
      }
    }
  }

  // 7. 🪟 Clean Window Dust Task (Large Window Scrubbing with Index Finger)
  function drawCleanGlassTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;

    // Window dimensions
    const winX = w * 0.12;
    const winY = h * 0.15;
    const winW = w * 0.76;
    const winH = h * 0.68;

    // Update & draw sparkles
    if (cleanGlassSparkles.length > 0) {
      cleanGlassSparkles.forEach((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.alpha -= 0.03;
      });
      cleanGlassSparkles = cleanGlassSparkles.filter((s) => s.alpha > 0);
      cleanGlassSparkles.forEach((s) => {
        gCtx.save();
        gCtx.globalAlpha = Math.max(0, s.alpha);
        gCtx.fillStyle = s.color || "#FDE047";
        gCtx.beginPath();
        gCtx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        gCtx.fill();
        gCtx.restore();
      });
    }

    // Top HUD Progress Meter
    const barW = Math.min(500, w * 0.74);
    const barH = 28;
    const barX = (w - barW) / 2;
    const barY = h * 0.08;

    gCtx.fillStyle = "rgba(15, 23, 42, 0.90)";
    gCtx.strokeStyle = cleanGlassClearedPct >= 90 ? "#10B981" : "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.roundRect(barX, barY, barW, barH, 14);
    gCtx.fill();
    gCtx.stroke();

    // Fill
    const fillW = Math.max(0, Math.min(1.0, cleanGlassClearedPct / 100.0)) * (barW - 6);
    if (fillW > 0) {
      const grad = gCtx.createLinearGradient(barX + 3, barY, barX + fillW, barY);
      grad.addColorStop(0, "#38BDF8");
      grad.addColorStop(0.7, "#10B981");
      grad.addColorStop(1.0, "#34D399");
      gCtx.fillStyle = grad;
      gCtx.beginPath();
      gCtx.roundRect(barX + 3, barY + 3, fillW, barH - 6, 11);
      gCtx.fill();
    }

    gCtx.font = "bold 13px Inter, monospace";
    gCtx.fillStyle = "#FFFFFF";
    gCtx.textAlign = "center";
    gCtx.fillText(`🪟 WINDOW DUST CLEANED: ${Math.round(cleanGlassClearedPct)}% / 100% (Target: ≥90%)`, w * 0.5, barY + 19);
    gCtx.textAlign = "start";

    // Draw Window Outer Frame & Bevel
    gCtx.save();
    gCtx.fillStyle = "#1E293B";
    gCtx.strokeStyle = "#475569";
    gCtx.lineWidth = 4;
    gCtx.beginPath();
    gCtx.roundRect(winX - 12, winY - 12, winW + 24, winH + 24, 12);
    gCtx.fill();
    gCtx.stroke();

    // Clear Transparent Glass Background
    const glassGrad = gCtx.createLinearGradient(winX, winY, winX + winW, winY + winH);
    glassGrad.addColorStop(0, "rgba(186, 230, 253, 0.18)");
    glassGrad.addColorStop(0.5, "rgba(224, 242, 254, 0.28)");
    glassGrad.addColorStop(1, "rgba(186, 230, 253, 0.18)");
    gCtx.fillStyle = glassGrad;
    gCtx.fillRect(winX, winY, winW, winH);

    // Cross Mullions dividing window into 4 panes
    gCtx.fillStyle = "#334155";
    gCtx.fillRect(winX + winW / 2 - 4, winY, 8, winH);
    gCtx.fillRect(winX, winY + winH / 2 - 4, winW, 8);

    // Draw Heavy White Dust Layer Grid
    const cw = winW / CLEAN_GLASS_COLS;
    const ch = winH / CLEAN_GLASS_ROWS;

    cleanGlassCells.forEach((cell) => {
      if (cell.opacity > 0.04) {
        const cx = winX + cell.col * cw;
        const cy = winY + cell.row * ch;
        // Heavy chalky white dust
        gCtx.fillStyle = `rgba(248, 250, 252, ${cell.opacity * 0.94})`;
        gCtx.fillRect(cx, cy, cw + 0.5, ch + 0.5);
      }
    });

    // Glass Diagonal Specular Glare (visible on clean portions)
    gCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    gCtx.lineWidth = 14;
    gCtx.beginPath();
    gCtx.moveTo(winX + 30, winY + winH - 20);
    gCtx.lineTo(winX + winW - 40, winY + 20);
    gCtx.stroke();
    gCtx.restore();

    // Index Fingertip Cleaning Detection
    const itx = wristData && wristData.smoothedCursor ? wristData.smoothedCursor.x * w : hx;
    const ity = wristData && wristData.smoothedCursor ? wristData.smoothedCursor.y * h : hy;
    const cleanRadius = 55;

    // Check if cursor is on window
    if (itx >= winX - 20 && itx <= winX + winW + 20 && ity >= winY - 20 && ity <= winY + winH + 20) {
      // Clean cells within radius
      cleanGlassCells.forEach((cell) => {
        const cellCenterX = winX + cell.col * cw + cw / 2;
        const cellCenterY = winY + cell.row * ch + ch / 2;
        const d = Math.hypot(itx - cellCenterX, ity - cellCenterY);
        if (d < cleanRadius) {
          const wipeFactor = (1 - d / cleanRadius) * 0.40;
          cell.opacity = Math.max(0, cell.opacity - wipeFactor);
          if (cell.opacity <= 0.05 && !cell.cleared) {
            cell.cleared = true;
            cleanGlassClearedCount++;
          }
        }
      });

      // Recalculate percentage cleared
      cleanGlassClearedPct = (cleanGlassClearedCount / cleanGlassCells.length) * 100.0;

      // Add wipe sparkles around finger
      if (Math.random() < 0.35) {
        cleanGlassSparkles.push({
          x: itx + (Math.random() - 0.5) * 40,
          y: ity + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          radius: 2 + Math.random() * 3,
          color: Math.random() > 0.5 ? "#FDE047" : "#38BDF8",
          alpha: 1.0,
        });
      }
    }

    // Draw Cleaning Reticle / Squeegee Pad at Index Fingertip
    gCtx.save();
    gCtx.beginPath();
    gCtx.arc(itx, ity, cleanRadius, 0, Math.PI * 2);
    gCtx.fillStyle = "rgba(56, 189, 248, 0.14)";
    gCtx.fill();
    gCtx.strokeStyle = "#38BDF8";
    gCtx.lineWidth = 2;
    gCtx.stroke();

    // Finger Reticle Center Dot
    gCtx.beginPath();
    gCtx.arc(itx, ity, 8, 0, Math.PI * 2);
    gCtx.fillStyle = "#10B981";
    gCtx.fill();
    gCtx.strokeStyle = "#FFFFFF";
    gCtx.lineWidth = 2;
    gCtx.stroke();

    gCtx.font = "bold 11px Inter, sans-serif";
    gCtx.fillStyle = "#FFFFFF";
    gCtx.textAlign = "center";
    gCtx.fillText("🪟 CLEANING", itx, ity - cleanRadius - 6);
    gCtx.restore();

    // Step index + HUD header follow the LIVE cleaned percentage
    if (!taskEnding) {
      let stepFromPct;
      if (cleanGlassClearedPct < 20) stepFromPct = 0;
      else if (cleanGlassClearedPct < 40) stepFromPct = 1;
      else if (cleanGlassClearedPct < 60) stepFromPct = 2;
      else if (cleanGlassClearedPct < 80) stepFromPct = 3;
      else if (cleanGlassClearedPct < 90) stepFromPct = 4;
      else stepFromPct = 5;
      const pctShown = Math.round(cleanGlassClearedPct);
      if (stepFromPct !== currentStepIndex || pctShown !== lastCleanHudPct) {
        currentStepIndex = stepFromPct;
        lastCleanHudPct = pctShown;
        updateStepCardsUI();
      }
    }

    // Completion Check (≥90% cleared — the four panes are fully wiped)
    if (cleanGlassClearedPct >= 90 && !cleanGlassCompleted) {
      cleanGlassCompleted = true;
      cleanGlassCompletedTime = performance.now();
      // Burst celebration sparkles across the whole window!
      for (let i = 0; i < 40; i++) {
        cleanGlassSparkles.push({
          x: winX + Math.random() * winW,
          y: winY + Math.random() * winH,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          radius: 3 + Math.random() * 4,
          color: ["#FDE047", "#34D399", "#38BDF8", "#F472B6"][Math.floor(Math.random() * 4)],
          alpha: 1.0,
        });
      }
      if (window.RehabBio) {
        window.RehabBio.playRepChime();
        window.RehabBio.speak("Window is sparkling clean! Excellent shoulder and arm reach!");
      }
      showToast("🎉 Window is sparkling clean (≥90%)! Outstanding work!", "success");
      completeRep();
      return;
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
      perf.spills++;
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
        window.RehabBio.speak("Target reached! The glass is filled — task complete!");
      }
      showToast("🎉 Perfect fill! Glass reached the green zone — task complete!", "success");
      completeRep();
      return;
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
    gCtx.textAlign = "center";
    gCtx.fillText("🎯 TARGET 75–95%", gx + gw / 2, targetY1 - 10);
    gCtx.textAlign = "start";

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

  // 6. ☕ Cup Shelf Lift Task (Anti-Gravity Elevation & ARAT Pick-and-Place)
  function drawCupShelfTask(hx, hy) {
    const w = gameCanvas.width, h = gameCanvas.height;

    // Scene geometry
    const tableY = h * 0.76;
    const shelfY = h * 0.26;
    const shelfX = w * 0.50;
    const shelfW = w * 0.44;

    // 4 shelf slots along the upper shelf — one cup per slot
    const slotXs = [0.16, 0.38, 0.62, 0.84].map((f) => shelfX + shelfW * f);
    const slotY = shelfY - 30;
    const activeSlot = Math.min(SHELF_SLOTS - 1, shelfPlacedCups.length);
    const shelfTargetX = slotXs[activeSlot];
    const shelfTargetY = slotY;

    const cupInitX = w * 0.22;
    const cupInitY = tableY - 40;

    if (!shelfCupPos) {
      shelfCupPos = { x: cupInitX, y: cupInitY };
    }

    // 1. Draw Kitchen Environment
    // Bottom Countertop
    gCtx.save();
    gCtx.fillStyle = "#1E293B";
    gCtx.fillRect(0, tableY, w, h - tableY);
    // Countertop wood trim edge
    gCtx.fillStyle = "#334155";
    gCtx.fillRect(0, tableY, w, 12);
    gCtx.fillStyle = "#64748B";
    gCtx.font = "bold 11px Inter, sans-serif";
    gCtx.fillText("🪵 LOWER COUNTERTOP", 24, tableY + 30);

    // Top Cupboard Shelf
    gCtx.fillStyle = "#0F172A";
    gCtx.roundRect(shelfX, shelfY, shelfW, 14, [4, 4, 4, 4]);
    gCtx.fill();
    gCtx.fillStyle = "#38BDF8";
    gCtx.fillRect(shelfX, shelfY, shelfW, 3);
    gCtx.fillStyle = "#94A3B8";
    gCtx.font = "bold 11px Inter, sans-serif";
    gCtx.textAlign = "center";
    gCtx.fillText("🗄️ UPPER CUPBOARD SHELF", shelfTargetX, shelfY + 28);
    gCtx.textAlign = "start";

    // 2. Shelf slots — the next empty slot is the live target
    const distToTarget = Math.hypot(shelfCupPos.x - shelfTargetX, shelfCupPos.y - shelfTargetY);
    const inTargetSlot = distToTarget < 70;   // "near the target" also counts

    slotXs.forEach((sx, i) => {
      if (i < shelfPlacedCups.length) return;   // already holding a cup
      const isActive = i === activeSlot;
      gCtx.save();
      gCtx.beginPath();
      gCtx.roundRect(sx - 24, slotY - 26, 48, 52, 10);
      if (isActive && inTargetSlot && shelfCupGrasped) {
        gCtx.fillStyle = "rgba(16, 185, 129, 0.35)";
        gCtx.fill();
        gCtx.strokeStyle = "#10B981";
        gCtx.lineWidth = 3.5;
        gCtx.setLineDash([6, 4]);
      } else {
        gCtx.fillStyle = isActive ? "rgba(56, 189, 248, 0.12)" : "rgba(148, 163, 184, 0.06)";
        gCtx.fill();
        gCtx.strokeStyle = isActive ? "#38BDF8" : "rgba(148, 163, 184, 0.35)";
        gCtx.lineWidth = 2;
        gCtx.setLineDash([5, 5]);
      }
      gCtx.stroke();
      gCtx.setLineDash([]);

      if (isActive) {
        gCtx.font = "bold 10px Inter, sans-serif";
        gCtx.textAlign = "center";
        gCtx.fillStyle = inTargetSlot ? "#34D399" : "#38BDF8";
        gCtx.fillText(inTargetSlot ? "✨ OPEN FINGERS 🖐️" : "PLACE HERE 🎯", sx, slotY - 32);
      }
      gCtx.restore();
    });

    // 3. Hand Interaction — a thumb + index pinch grips, spreading the fingers releases
    const distHandToCup = Math.hypot(hx - shelfCupPos.x, hy - shelfCupPos.y);
    const pincerNorm = (wristData && wristData.pincerNorm !== undefined) ? wristData.pincerNorm : 1.5;
    const twoFingers = !!(wristData && wristData.twoFingerGrip);
    // With the two-finger (thumb+index) gesture a looser pinch still grips;
    // any other hand shape must pinch very tight, so a closed fist cannot grab.
    const isHandGrasping = twoFingers ? pincerNorm < 0.75 : pincerNorm < 0.5;
    const isHandOpening = pincerNorm > 1.05;

    // STATE: the cup is still on the counter
    if (!shelfCupGrasped) {
      if (distHandToCup < 120 && currentStepIndex === 1) advanceStep();   // reached the cup
      if (distHandToCup < 90 && isHandGrasping) {
        shelfCupGrasped = true;
        shelfDropAlerted = false;
        if (currentStepIndex <= 2) {
          currentStepIndex = 2;                 // Step 3: pinch to grasp
          stepStartTime = performance.now();
          updateStepCardsUI();
        }
        if (window.RehabBio) {
          window.RehabBio.playBeep(520, 0.08, 0.3);
          window.RehabBio.speak("Cup grabbed with thumb and index! Lift upward against gravity.");
        }
        showToast("🤏 Cup grabbed with thumb & index! Now lift toward the shelf.", "info");
      }
    }

    // STATE: grasped — the cup travels with the fingertips
    if (shelfCupGrasped) {
      shelfCupPos.x = hx;
      shelfCupPos.y = hy;

      // Dashed guide toward the open shelf slot
      gCtx.save();
      gCtx.beginPath();
      gCtx.moveTo(shelfCupPos.x, shelfCupPos.y - 30);
      gCtx.lineTo(shelfTargetX, shelfTargetY + 30);
      gCtx.strokeStyle = "rgba(251, 191, 36, 0.6)";
      gCtx.lineWidth = 2.5;
      gCtx.setLineDash([6, 6]);
      gCtx.stroke();
      gCtx.restore();

      // Anti-gravity lift step
      if (hy < h * 0.55 && currentStepIndex === 3) {
        advanceStep();   // Step 5: align at the shelf
      }

      if (inTargetSlot) {
        if (currentStepIndex === 4) advanceStep();   // Step 6: release to place

        if (isHandOpening) {
          // Placing near the slot still counts, with a proportional score
          shelfLastPlaceQuality = distToTarget < 38
            ? 100
            : Math.max(60, Math.round(100 - (distToTarget - 38) * 1.1));

          shelfCupGrasped = false;
          shelfCupPlaced = true;
          shelfCupPlacedTime = performance.now();
          shelfPlacedCups.push({ x: shelfTargetX, y: shelfTargetY });
          shelfCupPos = { x: cupInitX, y: cupInitY };

          for (let i = 0; i < 28; i++) {
            shelfParticles.push({
              x: shelfTargetX,
              y: shelfTargetY,
              vx: (Math.random() - 0.5) * 6,
              vy: -2 - Math.random() * 5,
              r: 3 + Math.random() * 3,
              color: ["#FBBF24", "#34D399", "#38BDF8", "#F472B6"][Math.floor(Math.random() * 4)],
              alpha: 1.0,
            });
          }

          if (window.RehabBio) {
            window.RehabBio.playRepChime();
            window.RehabBio.speak(`Cup ${shelfPlacedCups.length} of ${targetReps} placed on the shelf.`);
          }
          showToast(`🎉 Cup ${shelfPlacedCups.length}/${targetReps} placed on the shelf!`, "success");
          completeRep();
          return;
        }
      } else if (isHandOpening && hy < tableY - 60) {
        // Released too early — the cup goes back to the counter
        if (!shelfDropAlerted) {
          shelfDropAlerted = true;
          perf.drops++;
          if (window.RehabBio) window.RehabBio.playBuzz();
          showToast("⚠️ Mug dropped! Keep the pinch closed until you reach a shelf slot.", "warning");
        }
        shelfCupGrasped = false;
        shelfCupPos = { x: cupInitX, y: cupInitY };
        currentStepIndex = 1;
        updateStepCardsUI();
      }
    }

    // 4. Draw Celebration Particles
    shelfParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.alpha -= 0.02;
    });
    shelfParticles = shelfParticles.filter((p) => p.alpha > 0);

    shelfParticles.forEach((p) => {
      gCtx.save();
      gCtx.globalAlpha = Math.max(0, p.alpha);
      gCtx.fillStyle = p.color;
      gCtx.beginPath();
      gCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      gCtx.fill();
      gCtx.restore();
    });

    // 5. Draw the cups ☕ — shelved cups stay in their slots, the active one follows the hand
    const drawMug = (mx, my, scale, filled) => {
      const cw = 44 * scale, ch = 48 * scale;
      gCtx.save();
      // Drop shadow
      gCtx.beginPath();
      gCtx.ellipse(mx, my + ch / 2 + 4, cw / 2 + 6, 8, 0, 0, Math.PI * 2);
      gCtx.fillStyle = "rgba(0, 0, 0, 0.4)";
      gCtx.fill();

      // Mug body
      gCtx.beginPath();
      gCtx.roundRect(mx - cw / 2, my - ch / 2, cw, ch, [4, 4, 10, 10]);
      gCtx.fillStyle = filled ? "#10B981" : (shelfCupGrasped ? "#F59E0B" : "#0284C7");
      gCtx.fill();
      gCtx.lineWidth = 2.5;
      gCtx.strokeStyle = "#FFFFFF";
      gCtx.stroke();

      // Handle
      gCtx.beginPath();
      gCtx.arc(mx + cw / 2 + 5, my, 11 * scale, -Math.PI / 2, Math.PI / 2);
      gCtx.lineWidth = 4;
      gCtx.strokeStyle = filled ? "#10B981" : (shelfCupGrasped ? "#F59E0B" : "#0284C7");
      gCtx.stroke();

      // Mug Rim Top
      gCtx.beginPath();
      gCtx.ellipse(mx, my - ch / 2, cw / 2, 7 * scale, 0, 0, Math.PI * 2);
      gCtx.fillStyle = "#0F172A"; // dark coffee inside
      gCtx.fill();
      gCtx.lineWidth = 1.5;
      gCtx.strokeStyle = "#FFFFFF";
      gCtx.stroke();

      // Coffee surface shine
      gCtx.beginPath();
      gCtx.ellipse(mx, my - ch / 2, cw / 2 - 3, 5 * scale, 0, 0, Math.PI * 2);
      gCtx.fillStyle = "#78350F";
      gCtx.fill();

      // Mug icon / badge in center
      gCtx.font = `${Math.round(18 * scale)}px Segoe UI Emoji, sans-serif`;
      gCtx.textAlign = "center";
      gCtx.textBaseline = "middle";
      gCtx.fillText("☕", mx, my + 2);
      gCtx.restore();
    };

    // Cups already standing on the shelf
    shelfPlacedCups.forEach((cup) => drawMug(cup.x, cup.y, 0.92, true));

    // Active cup (on the counter, or travelling with the hand)
    drawMug(shelfCupPos.x, shelfCupPos.y, 1, shelfCupPlaced);

    // Animated steam rising from the active cup
    shelfSteamTime += 0.05;
    for (let i = 0; i < 2; i++) {
      const sx = shelfCupPos.x - 6 + i * 12 + Math.sin(shelfSteamTime + i) * 4;
      const sy = shelfCupPos.y - 34 - ((shelfSteamTime * 12 + i * 8) % 22);
      gCtx.beginPath();
      gCtx.arc(sx, sy, 3, 0, Math.PI * 2);
      gCtx.fillStyle = "rgba(255, 255, 255, 0.4)";
      gCtx.fill();
    }

    // 6. Floating Status Badge
    gCtx.save();
    gCtx.fillStyle = "rgba(15, 23, 42, 0.88)";
    gCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    gCtx.lineWidth = 1.5;
    const bannerW = Math.min(480, w * 0.8);
    const bannerX = (w - bannerW) / 2;
    gCtx.beginPath();
    gCtx.roundRect(bannerX, 16, bannerW, 36, 10);
    gCtx.fill();
    gCtx.stroke();

    gCtx.font = "bold 13px Inter, sans-serif";
    gCtx.textAlign = "center";
    gCtx.textBaseline = "middle";

    let statusMsg = `Cup ${Math.min(shelfPlacedCups.length + 1, targetReps)}/${targetReps} — show thumb + index ☝️🤏 and reach the mug`;
    if (shelfCupGrasped) {
      if (inTargetSlot) {
        gCtx.fillStyle = "#34D399";
        statusMsg = "✨ In the shelf slot! SPREAD thumb & index apart 🖐️ to place!";
      } else {
        gCtx.fillStyle = "#FBBF24";
        statusMsg = "⬆️ Lift your arm upward toward the open shelf slot!";
      }
    } else if (shelfCupPlaced) {
      gCtx.fillStyle = "#34D399";
      statusMsg = `🎉 Cup ${shelfPlacedCups.length} of ${targetReps} placed — FANTASTIC!`;
    } else if (distHandToCup < 80) {
      gCtx.fillStyle = "#38BDF8";
      statusMsg = "🤏 Bring thumb & index CLOSER together to grab the cup!";
    } else {
      gCtx.fillStyle = "#E2E8F0";
      statusMsg = `Cup ${Math.min(shelfPlacedCups.length + 1, targetReps)}/${targetReps} — show thumb + index ☝️🤏 and reach the mug`;
    }
    gCtx.fillText(statusMsg, w * 0.5, 34);
    gCtx.restore();
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
      pumpPlungerOffset = 32;
      triggerBalloonPump();
    } else if (currentTask === "watertanks") {
      const tankCentersX = [
        gameCanvas.width * 0.15,
        gameCanvas.width * 0.38,
        gameCanvas.width * 0.62,
        gameCanvas.width * 0.85,
      ];
      const tankW = Math.min(108, gameCanvas.width * 0.17);
      const px = e.clientX - rect.left;

      tankCentersX.forEach((cx, idx) => {
        if (Math.abs(px - cx) < tankW / 2 + 20) {
          if (waterHandReservoir > 0 && waterTanks[idx].level < 100) {
            const fillAmt = Math.min(25, 100 - waterTanks[idx].level);
            waterTanks[idx].level += fillAmt;
            waterHandReservoir = Math.max(0, waterHandReservoir - fillAmt);
            showToast(`💧 Tank ${idx + 1}: ${Math.round(waterTanks[idx].level)}% full!`, "info");
          }
        }
      });
    } else if (currentTask === "pin") {
      const confirmBox2 = { x: Math.max(96, gameCanvas.width * 0.13), y: gameCanvas.height * 0.50, w: 150, h: 78 };
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (pinProgress >= 4 &&
          Math.abs(px - confirmBox2.x) <= confirmBox2.w / 2 &&
          Math.abs(py - confirmBox2.y) <= confirmBox2.h / 2) {
        if (window.RehabBio) {
          window.RehabBio.playRepChime();
          window.RehabBio.speak("PIN code confirmed!");
        }
        showToast("🎉 PIN Confirmed! Set complete!", "success");
        advanceStep();  // Completes 6-step cycle -> rep++ and returns to Step 1 cleanly
        randomPin = generateRandomPin();
        pinProgress = 0;
        return;
      }

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
      // Tap fallback: toggles the rocker exactly like a fingertip drag
      switchOn = !switchOn;
      lightKnobT = switchOn ? 1 : 0;
      lightFlips++;
      LIGHT.lastToggle = performance.now();
      if (window.RehabBio) window.RehabBio.playBeep(switchOn ? 880 : 440, 0.08, 0.3);
      showToast(switchOn ? "💡 Switch turned ON" : "🔌 Switch turned OFF", "success");
      if (switchOn && currentStepIndex === 3) {
        advanceStep();
      }
    } else if (currentTask === "pour") {
      pourGlassLevel = Math.min(100, pourGlassLevel + 25);
      showToast(`🫗 Water poured: ${Math.round(pourGlassLevel)}%`, "info");
      if (pourGlassLevel >= 75) {
        pourTargetReached = true;
        advanceStep();
      }
    } else if (currentTask === "cupshelf") {
      if (!shelfCupGrasped) {
        shelfCupGrasped = true;
        shelfLastPlaceQuality = 100;
        showToast("🤏 Mug grasped (pincer)! Now lift upward.", "info");
        if (currentStepIndex <= 2) {
          currentStepIndex = 2;
          updateStepCardsUI();
        }
      } else {
        // Tap = place the cup in the next open shelf slot
        const w = gameCanvas.width, h = gameCanvas.height;
        const shelfX = w * 0.50, shelfW = w * 0.44, shelfY = h * 0.26;
        const slotXs = [0.16, 0.38, 0.62, 0.84].map((f) => shelfX + shelfW * f);
        const slot = Math.min(SHELF_SLOTS - 1, shelfPlacedCups.length);
        shelfCupGrasped = false;
        shelfCupPlaced = true;
        shelfCupPlacedTime = performance.now();
        shelfPlacedCups.push({ x: slotXs[slot], y: shelfY - 30 });
        shelfCupPos = { x: w * 0.22, y: h * 0.76 - 40 };
        showToast(`🎉 Cup ${shelfPlacedCups.length}/${targetReps} placed on the shelf!`, "success");
        completeRep();
        return;
      }
    } else if (currentTask === "cleanglass") {
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (cleanGlassCells && cleanGlassCells.length > 0) {
        cleanGlassCells.forEach((c) => {
          if (Math.hypot(px - c.x, py - c.y) < 55) {
            c.opacity = Math.max(0, c.opacity - 0.4);
          }
        });
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
        smoothedCursor: handPos,
        thumbTip: { x: handPos.x - 0.04, y: handPos.y },
        wrist: { x: handPos.x, y: handPos.y + 0.15 },
        knuckleAngle: 45,
      };
    } else {
      wristData.smoothedCursor = handPos;
      wristData.indexTip = handPos;
    }

    if (currentTask === "cleanglass") {
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (cleanGlassCells && cleanGlassCells.length > 0) {
        cleanGlassCells.forEach((c) => {
          if (Math.hypot(px - c.x, py - c.y) < 55) {
            c.opacity = Math.max(0, c.opacity - 0.35);
          }
        });
      }
    }
  });

  // --- Telemetry Logging ---
  async function logSession() {
    if (!perf.task) return;   // no task was played — nothing to log
    const duration = taskElapsedSeconds > 0 ? taskElapsedSeconds : Math.floor((performance.now() - startTime) / 1000);
    // Every number below is measured from the patient's own movement this session
    const summary = perf.summary();

    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "ADL",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: Math.max(1, duration),
          peak_rom: summary.peakRom,
          smoothness_score: summary.smoothness,
          cheats_blocked: cheatsBlocked,
          score: summary.score,
          metrics_json: JSON.stringify({
            task: perf.task,
            reps: summary.reps,
            target_reps: summary.target,
            duration,
            score: summary.score,
            rep_quality: summary.avgRep,
            completion_pct: summary.completion,
            time_efficiency: summary.timeEfficiency,
            smoothness: summary.smoothness,
            peak_rom: summary.peakRom,
            penalties: summary.penalty,
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

  // --- 🎆 GRAND ENDING CELEBRATION POPUP (all 7 ADL tasks) ---
  // Big full-screen "SUPER / FANTASTIC" finale after finishing an ADL task.
  // Then exits cleanly back to the task menu, ready to start again immediately.
  const CELEBRATE_MESSAGES = [
    { big: "SUPER! 🌟", sub: "Outstanding performance — every move on target!" },
    { big: "FANTASTIC! 🎉", sub: "Therapist-grade control. That was beautiful!" },
    { big: "EXCELLENT! 💪", sub: "Strong, steady and smooth. Superb repetition!" },
    { big: "AMAZING! ✨", sub: "You crushed it — full marks on control!" },
    { big: "WONDERFUL! 👏", sub: "Perfect coordination from start to finish!" },
  ];

  let celebrationTimer = null;

  function showAdlCelebration(taskKey, customPhrase) {
    if (celebrationActive) return;
    const popup = document.getElementById("adl-celebration-popup");
    const bigEl = document.getElementById("acm-big");
    const subEl = document.getElementById("acm-sub");
    const taskElx = document.getElementById("acm-task");
    if (!popup || !bigEl || !subEl) {
      // Template fallback: speak + toast, still exit cleanly
      if (window.RehabBio) {
        window.RehabBio.playWorkoutFanfare();
      }
      showToast("🎉 Fantastic! Task completed!", "success");
      suppressStopLog = true;
      stopAdl();
      return;
    }

    celebrationActive = true;
    const m = CELEBRATE_MESSAGES[Math.floor(Math.random() * CELEBRATE_MESSAGES.length)];
    bigEl.textContent = customPhrase ? customPhrase : m.big;
    subEl.textContent = customPhrase ? "Fantastic movement sequence — full control! 🎉" : m.sub;
    if (taskElx) {
      taskElx.textContent = taskKey && ADL_TASKS[taskKey]
        ? `${ADL_TASKS[taskKey].name} — Session Complete!`
        : "Session Complete!";
    }
    // Show the measured performance so recovery progress is visible
    const scoreEl = document.getElementById("acm-score");
    if (scoreEl) {
      const s = perf.summary();
      scoreEl.textContent = `📈 Performance ${s.score}/100 · Smoothness ${s.smoothness}/100 · Reach ${s.peakRom}°`;
    }
    popup.classList.add("show");

    if (window.RehabBio) {
      window.RehabBio.playWorkoutFanfare();
      const spoken = customPhrase || `${m.big.replace(/[^A-Za-z]/g, "")} Fantastic session complete!`;
      window.RehabBio.speak(spoken);
    }

    if (celebrationTimer) clearTimeout(celebrationTimer);
    celebrationTimer = setTimeout(() => {
      hideAdlCelebration();
      suppressStopLog = true;
      stopAdl();   // Clean exit to Task Menu — camera stays live, ready to start again
    }, 2600);
  }

  function hideAdlCelebration() {
    const popup = document.getElementById("adl-celebration-popup");
    if (popup) popup.classList.remove("show");
    if (celebrationTimer) { clearTimeout(celebrationTimer); celebrationTimer = null; }
    celebrationActive = false;
  }

  // Light switch fallback button listener
  const lightFallbackBtn = document.getElementById("light-fallback-btn");
  if (lightFallbackBtn) {
    lightFallbackBtn.addEventListener("click", () => {
      if (currentTask !== "light" || adlPaused || taskEnding) return;
      switchOn = !switchOn;
      lightKnobT = switchOn ? 1 : 0;
      lightFlips++;
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
  detectBalloonCurlPump(openness, avgFingerCurl, wasOpen, calibOpen = 1.9, calibClosed = 1.1) {
    const openThreshold = calibClosed + 0.65 * (calibOpen - calibClosed);
    const closeThreshold = calibClosed + 0.35 * (calibOpen - calibClosed);
    const isOpen = openness > Math.min(openThreshold, 1.50) || avgFingerCurl > 0.72;
    const isClosed = openness < Math.max(closeThreshold, 1.25) || avgFingerCurl < 0.50;

    if (isOpen) {
      return { isOpen: true, isClosed: false, pumped: false, nextState: true };
    } else if (isClosed && wasOpen) {
      return { isOpen: false, isClosed: true, pumped: true, nextState: false };
    }
    return { isOpen: false, isClosed: isClosed, pumped: false, nextState: wasOpen };
  },
  calculateWaterTankFill(reservoir, tanks, handPos, dt = 0.05, pourRate = 30.0) {
    const tankCentersX = [0.15, 0.38, 0.62, 0.85];
    const tankHalfWidth = 0.08;
    let targetIndex = -1;

    for (let i = 0; i < 4; i++) {
      if (Math.abs(handPos.x - tankCentersX[i]) <= tankHalfWidth) {
        targetIndex = i;
        break;
      }
    }

    const updatedTanks = tanks.map((t) => ({ ...t }));
    let updatedReservoir = reservoir;
    let isWasting = false;

    if (targetIndex !== -1 && updatedReservoir > 0) {
      const currentLevel = updatedTanks[targetIndex].level;
      if (currentLevel < 100) {
        const fillDelta = Math.min(100 - currentLevel, pourRate * dt);
        updatedTanks[targetIndex].level = Math.min(100, currentLevel + fillDelta);
        updatedReservoir = Math.max(0, updatedReservoir - fillDelta);
      } else {
        updatedReservoir = Math.max(0, updatedReservoir - pourRate * dt);
      }
    } else if (updatedReservoir > 0) {
      isWasting = true;
      updatedReservoir = Math.max(0, updatedReservoir - pourRate * dt);
    }

    const allFull = updatedTanks.filter((t) => t.level >= 100).length >= 4;
    return {
      reservoir: updatedReservoir,
      tanks: updatedTanks,
      filledTankIndex: targetIndex,
      allFull,
      isWasting,
    };
  },
  calculateGlassCleaning(gridCells, cursorPos, radius = 55) {
    if (!gridCells || gridCells.length === 0) {
      return { clearedCount: 0, totalCount: 0, clearedPct: 100, isComplete: true };
    }
    const updated = gridCells.map((c) => {
      const dist = Math.hypot(cursorPos.x - c.x, cursorPos.y - c.y);
      if (dist < radius) {
        return { ...c, opacity: Math.max(0, c.opacity - 0.4) };
      }
      return { ...c };
    });
    const clearedCount = updated.filter((c) => c.opacity <= 0.20).length;
    const clearedPct = (clearedCount / updated.length) * 100;
    return {
      cells: updated,
      clearedCount,
      totalCount: updated.length,
      clearedPct,
      isComplete: clearedPct >= 90,
    };
  },
  calculatePinConfirmHit(cursorPos, confirmBox = { x: 0.82, y: 0.50, w: 0.15, h: 0.10 }) {
    return (
      cursorPos.x >= confirmBox.x - confirmBox.w / 2 &&
      cursorPos.x <= confirmBox.x + confirmBox.w / 2 &&
      cursorPos.y >= confirmBox.y - confirmBox.h / 2 &&
      cursorPos.y <= confirmBox.y + confirmBox.h / 2
    );
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
  calculateCupGraspAndPlace(cursor, cupPos, targetPos, isOpen, isClosed, isGrasped) {
    const distToCup = Math.hypot(cursor.x - cupPos.x, cursor.y - cupPos.y);
    const distToTarget = Math.hypot(cursor.x - targetPos.x, cursor.y - targetPos.y);
    let nextGrasped = isGrasped;
    let placed = false;
    let dropped = false;

    if (!isGrasped && distToCup < 0.12 && isClosed) {
      nextGrasped = true;
    } else if (isGrasped) {
      if (distToTarget < 0.12 && isOpen) {
        nextGrasped = false;
        placed = true;
      } else if (isOpen && distToTarget >= 0.12) {
        nextGrasped = false;
        dropped = true;
      }
    }
    return { isGrasped: nextGrasped, placed, dropped, distToCup, distToTarget };
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = AdlKinematics;
}
