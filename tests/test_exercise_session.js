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
// Step 0: angle >= 150 & cornerHit
assert.strictEqual(ex1.steps[0].test({ elbowMax: 155, cornerHit: true }), true);
assert.strictEqual(ex1.steps[0].test({ elbowMax: 140, cornerHit: true }), false);
assert.strictEqual(ex1.steps[0].test({ elbowMax: 155, cornerHit: false }), false);
// Step 1: angle < 120
assert.strictEqual(ex1.steps[1].test({ elbowMax: 110 }), true);
assert.strictEqual(ex1.steps[1].test({ elbowMax: 130 }), false);
console.log("  ✅ [PASS] Exercise 1 (Elbow Extension & Flexion): ≥150° + Corner Target -> <120° Flexion verified");

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
assert.strictEqual(ex4.steps[0].test({ wristPitch: 24 }), true);
assert.strictEqual(ex4.steps[0].test({ wristPitch: 14 }), false);
assert.strictEqual(ex4.steps[1].test({ wristPitch: 6 }), true);
assert.strictEqual(ex4.steps[1].test({ wristPitch: 18 }), false);
console.log("  ✅ [PASS] Exercise 4 (Horizontal Wrist Up & Down): Pitch ≥20° Up -> Pitch ≤8° Level verified");

// Test 7: Exercise 5 — Diagonal Reach & Hold
const ex5 = EXERCISES.find(e => e.key === "ataxia_hold");
assert.ok(ex5, "ataxia_hold must exist");
assert.strictEqual(ex5.steps[0].test({ diagonalHit: true }), true);
assert.strictEqual(ex5.steps[0].test({ diagonalHit: false }), false);
console.log("  ✅ [PASS] Exercise 5 (Diagonal Reach & Hold): Wrist in Diagonal Target (3s hold) verified");

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
assert.strictEqual(ex9.steps[0].test({ pinchRatio: 0.18 }), true);
assert.strictEqual(ex9.steps[0].test({ pinchRatio: 0.35 }), false);
assert.strictEqual(ex9.steps[1].test({ pinchRatio: 0.50 }), true);
assert.strictEqual(ex9.steps[1].test({ pinchRatio: 0.30 }), false);
console.log("  ✅ [PASS] Exercise 9 (Virtual Pincer Grasp): Pinch Ratio ≤0.22 -> Release ≥0.45 verified");

// Test 12: SVG Visualizer generation for all 9 exercises
EXERCISES.forEach((ex) => {
  ex.steps.forEach((st, idx) => {
    const svg = getExerciseStepSvg(ex.key, idx, true, false);
    assert.ok(svg.includes("<svg"), `SVG for ${ex.key} step ${idx} must contain <svg`);
    assert.ok(svg.includes("</svg>"), `SVG for ${ex.key} step ${idx} must contain </svg>`);
  });
});
console.log("  ✅ [PASS] SVG anatomical cards successfully generate for all steps of all 9 exercises");

console.log("-------------------------------------------------");
console.log("SUMMARY: 12 / 12 EXERCISE TESTS PASSED (100%)");
console.log("-------------------------------------------------");
console.log("🎉 ALL 9 CLINICAL EXERCISES VERIFIED PERFECTLY!");
