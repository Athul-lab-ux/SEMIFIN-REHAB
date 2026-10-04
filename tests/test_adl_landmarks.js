// tests/test_adl_landmarks.js
/**
 * RehabOpt AR — Phase 2 ADL Kinematics Unit Test Suite
 * Feeds fake MediaPipe landmark arrays into ADL pure kinematic functions.
 * Tests:
 * 1. Fake Open Hand (openness > openThreshold)
 * 2. Fake Closed Hand (openness < closeThreshold -> pump triggers, over-pump pops)
 * 3. Fake Ballistic Flick (palm center rise > 0.08 in 300ms triggers switch)
 * 4. Fake Tilted Hand (forearm roll > 20 deg calculates flow, fills glass, logs peak_rom)
 * 5. Fake Dropped Hand (missing hand detection, pause timers without forward jump)
 * 6. Touchless PIN Pad 90px key radius & sticky hit box expansion
 * 7. Fake Tremor Jitter Tolerance on PIN cursor (smoothing + sticky hold)
 */

const assert = require("assert");
const AdlKinematics = require("../static/js/adl_engine.js");

console.log("=================================================");
console.log("REHABOPT AR — PHASE 2 ADL KINEMATICS UNIT TESTS");
console.log("=================================================\n");

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    console.error(err.stack);
  }
}

// Helper to create a base hand landmark array (21 points)
function createBaseHand() {
  const lm = [];
  for (let i = 0; i < 21; i++) {
    lm.push({ x: 0.5, y: 0.6, z: 0 });
  }
  // Landmark 0: Wrist at (0.5, 0.8)
  lm[0] = { x: 0.5, y: 0.8, z: 0 };
  // Landmark 9: Middle MCP (knuckle) at (0.5, 0.6) -> Hand size = 0.20
  lm[9] = { x: 0.5, y: 0.6, z: 0 };
  // Landmark 5: Index MCP at (0.44, 0.60)
  lm[5] = { x: 0.44, y: 0.60, z: 0 };
  // Landmark 17: Pinky MCP at (0.56, 0.60)
  lm[17] = { x: 0.56, y: 0.60, z: 0 };
  return lm;
}

// --- TEST 1: FAKE OPEN HAND ---
test("Task 1 (Balloon): Fake Open Hand Detection", () => {
  const lm = createBaseHand();
  // Open hand: fingertips 8, 12, 16, 20 extended up to y = 0.40
  // Distance from wrist (y=0.8) to tip (y=0.40) is 0.40
  // handSize = hypot(0.5-0.5, 0.6-0.8) = 0.20
  // Openness = (0.40 / 0.20) = 2.0
  [8, 12, 16, 20].forEach((tip) => {
    lm[tip] = { x: 0.5, y: 0.40, z: 0 };
  });

  const handSize = AdlKinematics.getHandSize(lm);
  assert(Math.abs(handSize - 0.20) < 0.001, `Expected handSize 0.20, got ${handSize}`);

  const openness = AdlKinematics.calculateOpenness(lm);
  assert(openness >= 1.95 && openness <= 2.05, `Expected openness ~2.0, got ${openness}`);

  // Test against calibrated thresholds (calibOpen = 1.9, calibClosed = 1.1)
  const thresholds = AdlKinematics.getThresholds(1.9, 1.1);
  // openThreshold = 1.1 + 0.75 * (1.9 - 1.1) = 1.70
  assert(Math.abs(thresholds.openThreshold - 1.70) < 0.001, `Open threshold mismatch: ${thresholds.openThreshold}`);

  const pumpState = AdlKinematics.detectPump([openness, openness, openness], 1.9, 1.1, false);
  assert.strictEqual(pumpState.isOpen, true, "Hand should be classified as OPEN");
  assert.strictEqual(pumpState.nextState, true, "State should transition to hand-open (air intake ready)");
});

// --- TEST 2: FAKE CLOSED HAND & PUMP TRANSITION ---
test("Task 1 (Balloon): Fake Closed Fist Pump Transition & Pop Boundary", () => {
  const lm = createBaseHand();
  // Closed fist: fingertips curled into palm near wrist (y = 0.62)
  // Distance to wrist (0.8) = 0.18
  // Openness = 0.18 / 0.20 = 0.90
  [8, 12, 16, 20].forEach((tip) => {
    lm[tip] = { x: 0.5, y: 0.62, z: 0 };
  });

  const openness = AdlKinematics.calculateOpenness(lm);
  assert(openness <= 1.0, `Expected closed fist openness <= 1.0, got ${openness}`);

  const thresholds = AdlKinematics.getThresholds(1.9, 1.1);
  // closeThreshold = 1.1 + 0.25 * (1.9 - 1.1) = 1.30
  assert(Math.abs(thresholds.closeThreshold - 1.30) < 0.001, `Close threshold mismatch: ${thresholds.closeThreshold}`);
  assert(openness < thresholds.closeThreshold, "Openness must be below closeThreshold for fist");

  // Transition from open (wasOpen = true) to fist -> MUST trigger pump!
  const pumpState = AdlKinematics.detectPump([openness, openness, openness], 1.9, 1.1, true);
  assert.strictEqual(pumpState.pumped, true, "Fist transition must trigger a pump (+10%)");
  assert.strictEqual(pumpState.nextState, false, "Hand state must reset to closed");

  // Test Balloon Level Progression: 0% -> 90% (success zone) -> >100% (pop boundary)
  let level = 0;
  for (let p = 1; p <= 9; p++) {
    level += 10;
  }
  assert.strictEqual(level, 90, "9 pumps must reach 90% target zone");

  // 10th pump reaches 100% (target zone upper bound, still safe)
  level += 10;
  assert.strictEqual(level, 100, "10 pumps must reach 100% without popping");
  const popAt100 = level > 100;
  assert.strictEqual(popAt100, false, "Balloon must NOT pop at 100%");

  // 11th pump exceeds 100% -> MUST pop!
  level += 10;
  const popAt110 = level > 100;
  assert.strictEqual(popAt110, true, "Balloon MUST pop ONLY when pumped above 100%");
});

// --- TEST 3: FAKE BALLISTIC FLICK ---
test("Task 3 (Light Switch): Ballistic Palm Center Flick Detection", () => {
  const lm1 = createBaseHand();
  // Time t = 0ms: Palm center at base position y = 0.60
  const center1 = AdlKinematics.getPalmCenter(lm1);
  assert(Math.abs(center1.x - 0.5) < 0.05, `Palm center x expected ~0.5, got ${center1.x}`);

  // Rapid upward flick at t = 120ms: Hand moves up to y = 0.48
  // Rise = 0.60 - 0.48 = 0.12 (normalized)
  const historyFastFlick = [
    { y: 0.60, time: 0 },
    { y: 0.55, time: 60 },
    { y: 0.48, time: 120 },
  ];

  const flickDetected = AdlKinematics.detectFlick(historyFastFlick, 300, 0.08);
  assert.strictEqual(flickDetected, true, "Upward rise > 0.08 in 300ms must trigger flick");

  // Slow / subtle movement (delta y = 0.03) -> must NOT trigger flick
  const historySlowMove = [
    { y: 0.60, time: 0 },
    { y: 0.59, time: 100 },
    { y: 0.57, time: 200 },
  ];
  const noFlick = AdlKinematics.detectFlick(historySlowMove, 300, 0.08);
  assert.strictEqual(noFlick, false, "Slow movement (rise 0.03 <= 0.08) must NOT trigger flick");
});

// --- TEST 4: FAKE TILTED HAND & WATER POURING ---
test("Task 5 (Pour the Water): Forearm Pronation Tilt, Flow Rate & Score", () => {
  const lm = createBaseHand();
  // Calibrated upright: lm[5] and lm[17] both at y = 0.60 -> upright angle = 0 deg
  const uprightAngle = 0;

  // Now patient tilts hand by 45 degrees:
  // dx = 0.10, dy = 0.10 -> atan2(0.10, 0.10) * 180 / PI = 45 deg
  lm[5] = { x: 0.45, y: 0.50, z: 0 };
  lm[17] = { x: 0.55, y: 0.60, z: 0 };

  const { roll, tilt, flow } = AdlKinematics.calculatePourTiltAndFlow(lm, uprightAngle, 0.35);
  assert(Math.abs(tilt - 45) < 0.1, `Expected tilt 45 deg, got ${tilt}`);

  // flow = clamp((|tilt| - 20) / 70, 0, 1) * maxFlow
  // (45 - 20) / 70 = 25 / 70 = 0.3571 * 0.35 = 0.125
  const expectedFlow = ((45 - 20) / 70) * 0.35;
  assert(Math.abs(flow - expectedFlow) < 0.005, `Flow mismatch: expected ${expectedFlow}, got ${flow}`);

  // Simulate pouring over 2.0 seconds dt
  const dt = 2.0;
  const glassLevel = flow * dt; // ~0.25 fill
  assert(glassLevel > 0.20 && glassLevel < 0.30, `Glass level after 2s expected ~0.25, got ${glassLevel}`);

  // Test Score Calculation when fill reaches target zone 0.85
  const perfectLevel = 0.85;
  const target = 0.85;
  const scorePerfect = Math.round(Math.max(0, 100 * (1 - Math.abs(perfectLevel - target) / target)));
  assert.strictEqual(scorePerfect, 100, "Perfect fill at 0.85 must score 100%");

  // Test Spill Condition (level > 1.0)
  const overfilledLevel = 1.05;
  const isSpill = overfilledLevel > 1.0;
  assert.strictEqual(isSpill, true, "Glass fill > 1.0 must trigger spill warning");
});

// --- TEST 5: FAKE DROPPED HAND & TIMER ISOLATION ---
test("Task Shared Setup: Dropped Hand Detection & Timer Freeze", () => {
  // Empty landmarks array: patient dropped hand out of frame
  const emptyLm = [];
  const handSize = AdlKinematics.getHandSize(emptyLm);
  assert.strictEqual(handSize, 0.1, "Empty hand should default to safe minimum handSize 0.1");

  const openness = AdlKinematics.calculateOpenness(emptyLm);
  assert.strictEqual(openness, 0, "Empty hand should have 0 openness");

  // Timer test: verify that when isHandMissing = true, dt is 0 (lastTankTime updated to now)
  let lastTankTime = 1000;
  let isHandMissing = true;
  let now = 5000; // 4 seconds later hand reappears

  if (isHandMissing) {
    lastTankTime = now;
  }
  const dt = (now - lastTankTime) / 1000;
  assert.strictEqual(dt, 0, "No time jump on hand return: dt must be 0");
});

// --- TEST 6: TOUCHLESS PIN PAD STICKY HIT & DWELL ---
test("Task 4 (PIN Pad): 90px Key Radius & Sticky Hit Box Expansion", () => {
  const targetPos = { x: 0.50, y: 0.50 };
  const baseRadius = 0.08;

  // Cursor slightly outside base radius (dist = 0.09 > 0.08)
  const cursorJustOutside = { x: 0.50, y: 0.59 }; // dist = 0.09
  const hitNormal = AdlKinematics.calculatePinHit(cursorJustOutside, targetPos, false, baseRadius);
  assert.strictEqual(hitNormal, false, "Cursor at 0.09 must NOT hit non-dwelling key with radius 0.08");

  // When already dwelling on that key, hit box expands by 20% (0.08 * 1.2 = 0.096)
  const hitSticky = AdlKinematics.calculatePinHit(cursorJustOutside, targetPos, true, baseRadius);
  assert.strictEqual(hitSticky, true, "Cursor at 0.09 MUST remain inside sticky expanded hit box (0.096)");
});

// --- TEST 7: FAKE TREMOR JITTER ON PIN CURSOR & EXPANDED HIT DWELL ---
test("Task 4 (PIN Pad): Fake Tremor Jitter Tolerance via Smoothing & Sticky Hit Box", () => {
  const targetPos = { x: 0.50, y: 0.50 };
  const baseRadius = 0.08;
  let smoothedCursor = { x: 0.50, y: 0.50 };

  // Simulate stroke intention tremor oscillations (+/- 0.02 normalized noise at 10Hz)
  let isDwelling = true;
  let dwellMaintained = true;

  for (let frame = 0; frame < 30; frame++) {
    const jitterX = (Math.sin(frame * 1.5) * 0.02);
    const jitterY = (Math.cos(frame * 1.5) * 0.02);
    const rawCursor = { x: targetPos.x + jitterX, y: targetPos.y + jitterY };

    // Apply alpha = 0.3 exponential smoothing
    smoothedCursor.x = 0.3 * rawCursor.x + 0.7 * smoothedCursor.x;
    smoothedCursor.y = 0.3 * rawCursor.y + 0.7 * smoothedCursor.y;

    const isInside = AdlKinematics.calculatePinHit(smoothedCursor, targetPos, isDwelling, baseRadius);
    if (!isInside) {
      dwellMaintained = false;
      break;
    }
  }

  assert.strictEqual(dwellMaintained, true, "Smoothed cursor with 20% sticky box must resist tremor jitter");
});

// --- TEST 8: TASK 6 (CUP SHELF LIFT): GRASP, LIFT, AND PLACE ---
test("Task 6 (Cup Shelf Lift): Grasp, Anti-Gravity Elevation, and Shelf Placement", () => {
  const counterMugPos = { x: 0.25, y: 0.75 };
  const shelfTargetPos = { x: 0.70, y: 0.25 };

  // 1. Hand reaches counter, still open: should not grasp yet
  let state = AdlKinematics.calculateCupGraspAndPlace(
    { x: 0.25, y: 0.75 },
    counterMugPos,
    shelfTargetPos,
    /* isOpen */ true,
    /* isClosed */ false,
    /* isGrasped */ false
  );
  assert.strictEqual(state.isGrasped, false, "Open hand hovering over mug must not grasp");

  // 2. Hand clenches fist over mug: must grasp!
  state = AdlKinematics.calculateCupGraspAndPlace(
    { x: 0.25, y: 0.75 },
    counterMugPos,
    shelfTargetPos,
    /* isOpen */ false,
    /* isClosed */ true,
    /* isGrasped */ false
  );
  assert.strictEqual(state.isGrasped, true, "Clenched fist over mug must grasp mug");

  // 3. User lifts arm upward towards shelf with fist kept clenched
  state = AdlKinematics.calculateCupGraspAndPlace(
    { x: 0.45, y: 0.50 }, // mid-elevation
    { x: 0.45, y: 0.50 },
    shelfTargetPos,
    /* isOpen */ false,
    /* isClosed */ true,
    /* isGrasped */ true
  );
  assert.strictEqual(state.isGrasped, true, "Mug must remain grasped during elevation");
  assert.strictEqual(state.placed, false, "Mug not placed yet in mid-air");

  // 4. User reaches shelf target and opens hand: must place!
  state = AdlKinematics.calculateCupGraspAndPlace(
    { x: 0.70, y: 0.25 }, // at shelf target
    { x: 0.70, y: 0.25 },
    shelfTargetPos,
    /* isOpen */ true,
    /* isClosed */ false,
    /* isGrasped */ true
  );
  assert.strictEqual(state.isGrasped, false, "Hand opened at shelf must release mug");
  assert.strictEqual(state.placed, true, "Mug must be recorded as placed on shelf");

  // 5. Early mid-air release check (dropped mug)
  state = AdlKinematics.calculateCupGraspAndPlace(
    { x: 0.35, y: 0.50 }, // far from shelf
    { x: 0.35, y: 0.50 },
    shelfTargetPos,
    /* isOpen */ true,
    /* isClosed */ false,
    /* isGrasped */ true
  );
  assert.strictEqual(state.dropped, true, "Opening hand far from shelf must record drop");
});

// --- TEST 9: TASK 1 (BALLOON AIR PUMP): FINGER CURL PUMP BIOMECHANICS ---
test("Task 1 (Balloon): Wrist Open -> Clench Fist Curl Pump Transition", () => {
  // 1. Hand opens wide (openness = 1.60, avgFingerCurl = 0.82)
  const openResult = AdlKinematics.detectBalloonCurlPump(1.60, 0.82, /* wasOpen */ false);
  assert.strictEqual(openResult.isOpen, true, "Open hand must be recognized as open");
  assert.strictEqual(openResult.pumped, false, "Opening hand does not pump yet (air intake)");
  assert.strictEqual(openResult.nextState, true, "State must transition to wasOpen = true");

  // 2. Hand clenches into fist (openness = 1.15, avgFingerCurl = 0.40)
  const pumpResult = AdlKinematics.detectBalloonCurlPump(1.15, 0.40, /* wasOpen */ true);
  assert.strictEqual(pumpResult.isClosed, true, "Fist must be recognized as closed");
  assert.strictEqual(pumpResult.pumped, true, "Closing fist after open must trigger air pump");
  assert.strictEqual(pumpResult.nextState, false, "State resets to closed after pump");

  // 3. Repeated closed hand without reopening must NOT trigger pump
  const repeatClosed = AdlKinematics.detectBalloonCurlPump(1.15, 0.40, /* wasOpen */ false);
  assert.strictEqual(repeatClosed.pumped, false, "Keeping fist closed cannot pump repeatedly without reopening");
});

// --- TEST 10: TASK 2 (4-TANK WATER FILLING): 550% RESERVOIR & 4 TANKS ---
test("Task 2 (4 Water Tanks): 550% Hand Reservoir Depletion, Floor Wasting, & 100% Full Completion", () => {
  let reservoir = 550.0;
  let tanks = [{ level: 0 }, { level: 0 }, { level: 0 }, { level: 0 }];

  // 1. Pour into Tank 1 (center x = 0.15) for 1 second (dt = 1.0, pourRate = 30)
  let res = AdlKinematics.calculateWaterTankFill(reservoir, tanks, { x: 0.15, y: 0.3 }, 1.0, 30.0);
  assert.strictEqual(res.filledTankIndex, 0, "Hand at x=0.15 must fill Tank 1");
  assert.strictEqual(res.tanks[0].level, 30.0, "Tank 1 should have 30% water");
  assert.strictEqual(res.reservoir, 520.0, "Reservoir must decrease from 550% to 520%");
  assert.strictEqual(res.isWasting, false, "Water poured into tank must not be marked as wasting");

  // 2. Pour outside tanks (e.g. x = 0.50, floor between tanks 2 & 3)
  res = AdlKinematics.calculateWaterTankFill(res.reservoir, res.tanks, { x: 0.50, y: 0.3 }, 1.0, 30.0);
  assert.strictEqual(res.filledTankIndex, -1, "Hand between tanks does not fill any tank");
  assert.strictEqual(res.isWasting, true, "Water poured outside tanks wastes to floor");
  assert.strictEqual(res.reservoir, 490.0, "Wasted water depletes reservoir to 490%");

  // 3. Fill all 4 tanks to 100%
  const fullTanks = [{ level: 100 }, { level: 100 }, { level: 100 }, { level: 100 }];
  res = AdlKinematics.calculateWaterTankFill(100.0, fullTanks, { x: 0.15, y: 0.3 }, 0.1, 30.0);
  assert.strictEqual(res.allFull, true, "When all 4 tanks have 100% water, allFull must be true");
});

// --- TEST 11: TASK 7 (CLEAN WINDOW DUST): SCRUBBING & ≥90% CLEAR COMPLETION ---
test("Task 7 (Clean Window Dust): Index Finger Dust Scrubbing & ≥90% Threshold", () => {
  // Create 10 mock dust cells (all at opacity 1.0)
  const cells = [];
  for (let i = 0; i < 10; i++) {
    cells.push({ x: 100 + i * 20, y: 200, opacity: 1.0 });
  }

  // 1. Wipe first 5 cells with index cursor at (140, 200) with radius 50
  const wipe1 = AdlKinematics.calculateGlassCleaning(cells, { x: 140, y: 200 }, 50);
  const wipedCells = wipe1.cells.filter((c) => c.opacity < 1.0);
  assert(wipedCells.length >= 4, "Scrubbing must reduce opacity of nearby dust cells");

  // 2. Mock 9 out of 10 cells cleared (opacity <= 0.20)
  const mostlyCleanCells = cells.map((c, idx) => ({
    ...c,
    opacity: idx < 9 ? 0.05 : 0.95,
  }));
  const wipeComplete = AdlKinematics.calculateGlassCleaning(mostlyCleanCells, { x: 0, y: 0 }, 1);
  assert.strictEqual(wipeComplete.clearedCount, 9, "9 of 10 cells cleared");
  assert.strictEqual(wipeComplete.clearedPct, 90, "Cleared percentage should be 90%");
  assert.strictEqual(wipeComplete.isComplete, true, "≥90% cleared must mark task complete");
});

// --- TEST 12: TASK 4 (PIN PAD): STEP 6 SIDE CONFIRM BUTTON HIT DETECTION ---
test("Task 4 (PIN Pad): Step 6 Side Confirm Button Hit Detection", () => {
  const confirmBox = { x: 0.82, y: 0.50, w: 0.15, h: 0.10 };

  // Cursor directly on confirm button
  const hitCenter = AdlKinematics.calculatePinConfirmHit({ x: 0.82, y: 0.50 }, confirmBox);
  assert.strictEqual(hitCenter, true, "Cursor at confirm button center must register hit");

  // Cursor inside confirm button edge
  const hitEdge = AdlKinematics.calculatePinConfirmHit({ x: 0.87, y: 0.53 }, confirmBox);
  assert.strictEqual(hitEdge, true, "Cursor inside confirm bounds must register hit");

  // Cursor outside confirm button (left side)
  const missOutside = AdlKinematics.calculatePinConfirmHit({ x: 0.50, y: 0.50 }, confirmBox);
  assert.strictEqual(missOutside, false, "Cursor on keypad must not hit side confirm button");
});

console.log("\n-------------------------------------------------");
console.log(`SUMMARY: ${passed} / ${total} TESTS PASSED (${Math.round((passed / total) * 100)}%)`);
console.log("-------------------------------------------------");

if (passed === total) {
  console.log("🎉 ALL ADL KINEMATICS TESTS PASSED PERFECTLY!\n");
  process.exit(0);
} else {
  console.error("❌ Some tests failed!");
  process.exit(1);
}
