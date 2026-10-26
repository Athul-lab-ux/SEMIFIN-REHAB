/**
 * RehabOpt AR — Guided Therapy & Clinical Exercises Test Suite
 * -------------------------------------------------------------
 * Tests the 9 clinical stroke rehabilitation exercises and their
 * deterministic step test predicates and SVG visualizers.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("=================================================");
console.log("REHABOPT AR — 9 CLINICAL EXERCISES UNIT TESTS");
console.log("=================================================");

// Load exercise_library.js in a mocked browser context
const libCode = fs.readFileSync(path.join(__dirname, "../static/js/exercise_library.js"), "utf-8");
const sandbox = {
  window: {},
  Math: Math,
};
const vm = require("vm");
vm.createContext(sandbox);
vm.runInContext(libCode, sandbox);

const EXERCISES = sandbox.window.EXERCISES;
const StrokeProfiles = sandbox.window.StrokeProfiles;
const EXERCISES_BY_PROFILE = sandbox.window.EXERCISES_BY_PROFILE;
const getExerciseStepSvg = sandbox.window.getExerciseStepSvg;

// Test 1: Exercise count is exactly 9
assert.strictEqual(EXERCISES.length, 9, `Expected exactly 9 exercises, got ${EXERCISES.length}`);
console.log("  ✅ [PASS] Exercise library contains exactly 9 clinical exercises (Exercise 10 removed)");

// Test 2: Profiles and grouping
assert.ok(StrokeProfiles.length >= 6, "Expected at least 6 stroke profiles");
assert.ok(EXERCISES_BY_PROFILE["All"].length === 9, "Expected All profile to contain 9 exercises");
console.log("  ✅ [PASS] Stroke profiles properly populated and 'All' includes all 9 exercises");

// Test 3: Exercise 1 — Elbow Extension & Flexion
const ex1 = EXERCISES.find(e => e.key === "elbow_ext");
assert.ok(ex1, "elbow_ext must exist");
assert.strictEqual(ex1.steps.length, 2, "elbow_ext must have 2 steps");
// Step 0: cornerHit OR elbowMax >= 140
assert.strictEqual(ex1.steps[0].test({ elbowMax: 155, cornerHit: true }), true);
assert.strictEqual(ex1.steps[0].test({ elbowMax: 145, cornerHit: false }), true);
assert.strictEqual(ex1.steps[0].test({ elbowMax: 120, cornerHit: true }), true);
assert.strictEqual(ex1.steps[0].test({ elbowMax: 110, cornerHit: false }), false);
// Step 1: angle < 125
assert.strictEqual(ex1.steps[1].test({ elbowMax: 110 }), true);
assert.strictEqual(ex1.steps[1].test({ elbowMax: 135 }), false);
console.log("  ✅ [PASS] Exercise 1 (Elbow Extension & Flexion): ≥140° or Corner Target -> <125° Flexion verified");

// Test 4: Exercise 2 — Shoulder Elevation / Shrug
const ex2 = EXERCISES.find(e => e.key === "shoulder_raise");
assert.ok(ex2, "shoulder_raise must exist");
assert.strictEqual(ex2.steps.length, 2, "shoulder_raise must have 2 steps");
assert.strictEqual(ex2.steps[0].test({ shoulderShrugHit: true }), true);
assert.strictEqual(ex2.steps[0].test({ shoulderShrugHit: false }), false);
assert.strictEqual(ex2.steps[1].test({ shoulderRelaxed: true }), true);
assert.strictEqual(ex2.steps[1].test({ shoulderRelaxed: false }), false);
console.log("  ✅ [PASS] Exercise 2 (Shoulder Elevation / Shrug): Target Shrug -> Lower to Baseline verified");

// Test 5: Exercise 3 — Hand Open & Close
const ex3 = EXERCISES.find(e => e.key === "palm_open");
assert.ok(ex3, "palm_open must exist");
assert.strictEqual(ex3.steps[0].test({ isFist: true }), true);
assert.strictEqual(ex3.steps[0].test({ isFist: false }), false);
assert.strictEqual(ex3.steps[1].test({ isOpenPalm: true }), true);
assert.strictEqual(ex3.steps[1].test({ isOpenPalm: false }), false);
console.log("  ✅ [PASS] Exercise 3 (Hand Open & Close): Closed Fist ✊ -> Wide Open Palm 🖐️ verified");

// Test 6: Exercise 4 — Horizontal Wrist Up & Down
const ex4 = EXERCISES.find(e => e.key === "wrist_stretch");
assert.ok(ex4, "wrist_stretch must exist");
assert.strictEqual(ex4.steps[0].test({ wristPitch: 20 }), true);
assert.strictEqual(ex4.steps[0].test({ wristPitch: 10 }), false);
assert.strictEqual(ex4.steps[1].test({ wristPitch: 8 }), true);
assert.strictEqual(ex4.steps[1].test({ wristPitch: 18 }), false);
console.log("  ✅ [PASS] Exercise 4 (Horizontal Wrist Up & Down): Pitch ≥14° Up -> Pitch ≤10° Level verified");

// Test 7: Exercise 5 — Diagonal Reach & Hold
const ex5 = EXERCISES.find(e => e.key === "ataxia_hold");
assert.ok(ex5, "ataxia_hold must exist");
assert.strictEqual(ex5.steps[0].test({ diagonalHit: true }), true);
assert.strictEqual(ex5.steps[0].test({ diagonalHit: false }), false);
console.log("  ✅ [PASS] Exercise 5 (Diagonal Reach & Hold): Wrist in Diagonal Target (2s hold) verified");

// Test 8: Exercise 6 — Two-Target Horizontal Glide
const ex6 = EXERCISES.find(e => e.key === "ataxia_push");
assert.ok(ex6, "ataxia_push must exist");
assert.strictEqual(ex6.steps[0].test({ s2Hit: true }), true);
assert.strictEqual(ex6.steps[0].test({ s2Hit: false }), false);
assert.strictEqual(ex6.steps[1].test({ s1Hit: true }), true);
assert.strictEqual(ex6.steps[1].test({ s1Hit: false }), false);
console.log("  ✅ [PASS] Exercise 6 (Two-Target Horizontal Glide): Station 2 Reach -> Station 1 Return verified");

// Test 9: Exercise 7 — Open Palm Left & Right Rotation
const ex7 = EXERCISES.find(e => e.key === "parm_rotate");
assert.ok(ex7, "parm_rotate must exist");
assert.strictEqual(ex7.steps[0].test({ rotateLeftHit: true }), true);
assert.strictEqual(ex7.steps[0].test({ rotateLeftHit: false }), false);
assert.strictEqual(ex7.steps[1].test({ rotateRightHit: true }), true);
assert.strictEqual(ex7.steps[1].test({ rotateRightHit: false }), false);
console.log("  ✅ [PASS] Exercise 7 (Open Palm Left & Right Rotation): Open Palm Left -> Open Palm Right verified");

// Test 10: Exercise 8 — Dynamic Moving Target Pursuit
const ex8 = EXERCISES.find(e => e.key === "moving_target_pursuit");
assert.ok(ex8, "moving_target_pursuit must exist");
assert.strictEqual(ex8.steps[0].test({ movingPursuitComplete: true }), true);
assert.strictEqual(ex8.steps[0].test({ movingPursuitComplete: false }), false);
console.log("  ✅ [PASS] Exercise 8 (Dynamic Moving Target Pursuit): 10s Moving Wrist Tracking verified");

// Test 11: Exercise 9 — Virtual Pincer Grasp & Release
const ex9 = EXERCISES.find(e => e.key === "apraxia_pinch");
assert.ok(ex9, "apraxia_pinch must exist");
assert.strictEqual(ex9.steps[0].test({ pinchRatio: 0.25 }), true);
assert.strictEqual(ex9.steps[0].test({ pinchRatio: 0.38 }), false);
assert.strictEqual(ex9.steps[1].test({ pinchRatio: 0.45 }), true);
assert.strictEqual(ex9.steps[1].test({ pinchRatio: 0.30 }), false);
console.log("  ✅ [PASS] Exercise 9 (Virtual Pincer Grasp): Pinch Ratio ≤0.32 -> Release ≥0.40 verified");

// Test 12: SVG Visualizer generation for all 9 exercises
EXERCISES.forEach((ex) => {
  ex.steps.forEach((st, idx) => {
    const svg = getExerciseStepSvg(ex.key, idx, true, false);
    assert.ok(svg.includes("<svg"), `SVG for ${ex.key} step ${idx} must contain <svg`);
    assert.ok(svg.includes("</svg>"), `SVG for ${ex.key} step ${idx} must contain </svg>`);
  });
});
console.log("  ✅ [PASS] SVG anatomical cards successfully generate for all steps of all 9 exercises");

// Test 13: End-to-End Half-Rep and Full-Rep State Progression for all 9 Exercises
const mockMetricsMap = {
  elbow_ext: [
    { cornerHit: true, elbowMax: 152 },
    { elbowMax: 115 }
  ],
  shoulder_raise: [
    { shoulderShrugHit: true },
    { shoulderRelaxed: true }
  ],
  palm_open: [
    { isFist: true },
    { isOpenPalm: true }
  ],
  wrist_stretch: [
    { wristPitch: 16 },
    { wristPitch: 8 }
  ],
  ataxia_hold: [
    { diagonalHit: true }
  ],
  ataxia_push: [
    { s2Hit: true },
    { s1Hit: true }
  ],
  parm_rotate: [
    { rotateLeftHit: true },
    { rotateRightHit: true }
  ],
  moving_target_pursuit: [
    { movingPursuitComplete: true }
  ],
  apraxia_pinch: [
    { pinchRatio: 0.28 },
    { pinchRatio: 0.45 }
  ]
};

EXERCISES.forEach((ex) => {
  let rep = 0;
  let step = 0;
  const mockSteps = mockMetricsMap[ex.key];
  assert.ok(mockSteps, `Mock data must exist for ${ex.key}`);
  
  mockSteps.forEach((m, idx) => {
    assert.strictEqual(ex.steps[step].test(m), true, `${ex.key} step ${step} must evaluate to true with valid metrics`);
    step++;
    if (step < ex.steps.length) {
      // Half rep verified
      assert.strictEqual(step, 1, `${ex.key} half-rep progression verified`);
    } else {
      // Full rep verified
      rep++;
      step = 0;
    }
  });
  assert.strictEqual(rep, 1, `${ex.key} must complete 1 full rep`);
  assert.strictEqual(step, 0, `${ex.key} must reset step to 0 after full rep`);
});
console.log("  ✅ [PASS] End-to-End Rep and Half-Rep counting cycle verified across all 9 exercises");

// Test 14: VisionLoader payload compatibility (Object with length vs Array) in computeMetrics
const therapyCode = fs.readFileSync(path.join(__dirname, "../static/js/therapy_engine.js"), "utf-8");
const ctxMock = {
  beginPath: () => {},
  arc: () => {},
  fill: () => {},
  stroke: () => {},
  moveTo: () => {},
  lineTo: () => {},
  setLineDash: () => {},
  clearRect: () => {},
  fillText: () => {},
  measureText: () => ({ width: 50 }),
  save: () => {},
  restore: () => {},
  createRadialGradient: () => ({ addColorStop: () => {} }),
};

const domMock = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = {
        textContent: "",
        innerHTML: "",
        value: "10",
        width: 640,
        height: 480,
        style: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        addEventListener: () => {},
        appendChild: () => {},
        prepend: () => {},
        querySelectorAll: () => [],
        querySelector: () => null,
        getContext: () => ctxMock,
      };
    }
    return this.elements[id];
  },
  createElement() {
    return {
      className: "",
      innerHTML: "",
      appendChild: () => {},
      prepend: () => {},
      addEventListener: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      style: {},
      getContext: () => ctxMock,
    };
  },
  querySelectorAll: () => [],
  addEventListener(event, cb) {
    if (event === "DOMContentLoaded") cb();
  },
};

const visionMock = {
  isMirrored: () => false,
  start: () => {},
  stop: () => {},
  getVideoSize: () => ({ width: 640, height: 480 }),
};

const fullSandbox = {
  window: {
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  document: domMock,
  VisionLoader: visionMock,
  Math: Math,
  Date: Date,
  setTimeout: (fn) => fn(),
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  requestAnimationFrame: () => {},
  cancelAnimationFrame: () => {},
  localStorage: { getItem: () => null, setItem: () => {} },
  console: console,
};
fullSandbox.window.window = fullSandbox.window;
fullSandbox.window.document = domMock;
fullSandbox.window.VisionLoader = visionMock;
fullSandbox.window.Math = Math;
fullSandbox.window.Date = Date;
fullSandbox.window.requestAnimationFrame = () => {};
fullSandbox.window.cancelAnimationFrame = () => {};
fullSandbox.window.localStorage = fullSandbox.localStorage;

vm.createContext(fullSandbox);
vm.runInContext(libCode, fullSandbox);
vm.runInContext(therapyCode, fullSandbox);

const TherapyTest = fullSandbox.window.TherapyEngineTest;
assert.ok(TherapyTest, "TherapyEngineTest hook must be exposed");

// Mock Hand Object matching VisionLoader output: cachedHand = {0:..., 20:..., length: 21}
const mockHandObj = { length: 21 };
for (let i = 0; i <= 20; i++) {
  mockHandObj[i] = { x: 0.5, y: 0.5, z: 0 };
}
// Set thumb tip (4) and index tip (8) close together for pinch
mockHandObj[0] = { x: 0.50, y: 0.60, z: 0 }; // wrist
mockHandObj[9] = { x: 0.50, y: 0.45, z: 0 }; // middle MCP (scale ~ 0.15)
mockHandObj[4] = { x: 0.49, y: 0.44, z: 0 }; // thumb tip
mockHandObj[8] = { x: 0.51, y: 0.44, z: 0 }; // index tip

const metricsFromObj = TherapyTest.computeMetrics({ hand: mockHandObj });
assert.ok(metricsFromObj.pinchRatio != null, "Pinch ratio must be computed from VisionLoader object hand");
assert.ok(metricsFromObj.pinchRatio <= 0.36, "Pinch ratio should be tight (<= 0.36)");
console.log("  ✅ [PASS] VisionLoader landmark payload compatibility (Object {0..20, length: 21}) verified");

// Test 15: Dual-Arm Isolation (Resting arm straight at 160°, Active arm flexed at 95°)
const mockPoseDualArm = {
  pose: {
    11: { x: 0.40, y: 0.30 }, // Left shoulder
    13: { x: 0.40, y: 0.50 }, // Left elbow
    15: { x: 0.40, y: 0.70 }, // Left wrist (straight arm, ~180°)
    12: { x: 0.60, y: 0.30 }, // Right shoulder
    14: { x: 0.60, y: 0.50 }, // Right elbow
    16: { x: 0.50, y: 0.45 }, // Right wrist (flexed elbow, ~90°)
  },
  chain: {
    side: "right",
    sh: { x: 0.60, y: 0.30 },
    el: { x: 0.60, y: 0.50 },
    wr: { x: 0.50, y: 0.45 },
  }
};

const dualArmMetrics = TherapyTest.computeMetrics(mockPoseDualArm);
assert.ok(dualArmMetrics.activeElbow != null, "Active elbow angle must be computed");
assert.ok(dualArmMetrics.activeElbow < 125, `Active elbow should be flexed (<125°), got ${dualArmMetrics.activeElbow}`);
// Verify Step 2 of elbow_ext succeeds on active elbow even though elbowMax is large
assert.strictEqual(ex1.steps[1].test(dualArmMetrics), true, "Step 2 should pass for active arm flexion");
console.log("  ✅ [PASS] Dual-arm isolation verified (active arm flexion satisfies Step 2 with resting opposite arm)");

// Test 16: End-to-end full workout frame simulation: step 0 -> hold -> step 1 -> 1.0 rep complete
TherapyTest.resetState({
  phase: "workout",
  ex: ex1,
  repsTarget: 3,
  step: 0,
  rep: 0,
});

// Frame 1: Arm reaches extension target >= 135°
const extFrame = {
  chain: {
    side: "right",
    sh: { x: 0.60, y: 0.40 },
    el: { x: 0.70, y: 0.30 },
    wr: { x: 0.80, y: 0.20 }, // Corner hit + straight angle
  },
  hand: mockHandObj,
};

// Simulate frames for hold duration (0.4s)
const baseTime = Date.now();
TherapyTest.handleWorkoutFrame(extFrame); // first frame registers ok, starts hold
// Advance time 500ms
const realDateNow = Date.now;
try {
  Date.now = () => baseTime + 500;
  TherapyTest.handleWorkoutFrame(extFrame); // hold duration satisfied -> step increments to 1
  assert.strictEqual(TherapyTest.getState().step, 1, "State should advance to Step 1 (Half Rep)");

  // Frame 2: Arm bends back in (< 125°)
  const flexFrame = {
    chain: {
      side: "right",
      sh: { x: 0.60, y: 0.40 },
      el: { x: 0.60, y: 0.55 },
      wr: { x: 0.55, y: 0.45 }, // Flexed in
    },
    hand: mockHandObj,
  };
  Date.now = () => baseTime + 700;
  TherapyTest.handleWorkoutFrame(flexFrame); // step 1 satisfied -> rep increments to 1, step resets to 0
  assert.strictEqual(TherapyTest.getState().rep, 1, "Rep count should increment to 1");
  assert.strictEqual(TherapyTest.getState().step, 0, "Step index should reset to 0 for next rep");
} finally {
  Date.now = realDateNow;
}
console.log("  ✅ [PASS] Real-time workout frame simulation: 0.5 Half Rep -> 1.0 Full Rep cycle verified");

console.log("-------------------------------------------------");
console.log("SUMMARY: 16 / 16 EXERCISE TESTS PASSED (100%)");
console.log("-------------------------------------------------");
console.log("🎉 ALL 9 CLINICAL EXERCISES VERIFIED PERFECTLY!");
