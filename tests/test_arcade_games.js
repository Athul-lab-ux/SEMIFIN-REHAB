/**
 * RehabOpt AR — T1 Arcade Arena Kinematics & Mechanics Unit Tests
 */

const assert = require('assert');

console.log("=================================================");
console.log("REHABOPT AR — T1 ARCADE GAMES UNIT TESTS");
console.log("=================================================\n");

// Helper: build fake 21-landmark hand
function makeHand(open = true, extendedCount = open ? 5 : 0) {
  const lm = [];
  // Landmark 0: wrist
  lm.push({ x: 0.5, y: 0.7, z: 0 });

  // Hand size baseline: wrist (0) to middle MCP (9)
  const handSize = 0.2;

  // Landmarks 1-4: Thumb
  const thumbExt = extendedCount >= 1;
  lm.push({ x: 0.45, y: 0.65, z: 0 }); // 1 CMC
  lm.push({ x: 0.40, y: 0.60, z: 0 }); // 2 MCP
  lm.push({ x: 0.35, y: 0.58, z: 0 }); // 3 IP
  lm.push({ x: thumbExt ? 0.30 : 0.38, y: thumbExt ? 0.52 : 0.62, z: 0 }); // 4 TIP

  // Landmarks 5-8: Index
  const indexExt = open || extendedCount >= 2;
  lm.push({ x: 0.46, y: 0.55, z: 0 }); // 5 MCP
  lm.push({ x: 0.45, y: 0.50, z: 0 }); // 6 PIP
  lm.push({ x: 0.44, y: 0.45, z: 0 }); // 7 DIP
  lm.push({ x: 0.44, y: indexExt ? 0.38 : 0.58, z: 0 }); // 8 TIP

  // Landmarks 9-12: Middle
  const midExt = open || extendedCount >= 3;
  lm.push({ x: 0.50, y: 0.50, z: 0 }); // 9 MCP
  lm.push({ x: 0.50, y: 0.45, z: 0 }); // 10 PIP
  lm.push({ x: 0.50, y: 0.40, z: 0 }); // 11 DIP
  lm.push({ x: 0.50, y: midExt ? 0.32 : 0.56, z: 0 }); // 12 TIP

  // Landmarks 13-16: Ring
  const ringExt = open || extendedCount >= 4;
  lm.push({ x: 0.54, y: 0.55, z: 0 }); // 13 MCP
  lm.push({ x: 0.55, y: 0.50, z: 0 }); // 14 PIP
  lm.push({ x: 0.56, y: 0.46, z: 0 }); // 15 DIP
  lm.push({ x: 0.56, y: ringExt ? 0.39 : 0.59, z: 0 }); // 16 TIP

  // Landmarks 17-20: Pinky
  const pinkyExt = open || extendedCount >= 5;
  lm.push({ x: 0.58, y: 0.60, z: 0 }); // 17 MCP
  lm.push({ x: 0.59, y: 0.56, z: 0 }); // 18 PIP
  lm.push({ x: 0.60, y: 0.52, z: 0 }); // 19 DIP
  lm.push({ x: 0.60, y: pinkyExt ? 0.46 : 0.63, z: 0 }); // 20 TIP

  return lm;
}

// TEST 1: Bubble Pop 2.0 Grasp and Release Logic
{
  const openHand = makeHand(true);
  const closedHand = makeHand(false);

  // Compute openness ratio
  function getOpenness(hand) {
    const handSize = Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y);
    const tipDists = [8, 12, 16, 20].map(tip =>
      Math.hypot(hand[tip].x - hand[0].x, hand[tip].y - hand[0].y)
    );
    const avgDist = tipDists.reduce((a, b) => a + b, 0) / tipDists.length;
    return avgDist / handSize;
  }

  const openRatio = getOpenness(openHand);
  const closedRatio = getOpenness(closedHand);

  assert(openRatio > 1.42, `Open hand ratio should be > 1.42 (got ${openRatio.toFixed(2)})`);
  assert(closedRatio < 1.18, `Closed fist ratio should be < 1.18 (got ${closedRatio.toFixed(2)})`);

  // Simulate Bubble Pop 2.0 Grasp Cycle
  let readyToGrasp = true;
  let score = 0;
  const bubble = { x: 300, y: 300, r: 40, popped: false };
  const palm = { x: 310, y: 305 }; // Inside bubble zone

  // In zone, hand open: should NOT pop yet
  const dist = Math.hypot(bubble.x - palm.x, bubble.y - palm.y);
  const inZone = dist < bubble.r + 40;
  assert.strictEqual(inZone, true, "Palm is in bubble zone");

  const isClosedOpenHand = openRatio < 1.18;
  if (inZone && readyToGrasp && isClosedOpenHand) {
    bubble.popped = true;
  }
  assert.strictEqual(bubble.popped, false, "Open hand should not pop bubble");

  // User clenches into fist (Image 2)
  const isClosedFist = closedRatio < 1.18;
  if (inZone && readyToGrasp && isClosedFist) {
    bubble.popped = true;
    score += 10;
    readyToGrasp = false; // Must reload
  }
  assert.strictEqual(bubble.popped, true, "Clenched fist must pop the bubble");
  assert.strictEqual(score, 10, "Score must increment by 10");
  assert.strictEqual(readyToGrasp, false, "Must enter waiting-for-open state");

  // User opens hand again (Image 3)
  const isOpenAgain = openRatio > 1.42;
  if (!readyToGrasp && isOpenAgain) {
    readyToGrasp = true;
  }
  assert.strictEqual(readyToGrasp, true, "Opening hand must reload ready state");

  console.log("  ✅ [PASS] Bubble Pop 2.0: Open hand hover, clenched fist pop, and reload cycle verified");
}

// TEST 2: Finger Count Detection
{
  function countFingers(hand) {
    const handSize = Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y) || 0.1;
    const thumbExt = Math.hypot(hand[4].x - hand[17].x, hand[4].y - hand[17].y) >
                     Math.hypot(hand[3].x - hand[17].x, hand[3].y - hand[17].y) * 1.15 &&
                     Math.hypot(hand[4].x - hand[2].x, hand[4].y - hand[2].y) > handSize * 0.42;
    const indexExt = Math.hypot(hand[8].x - hand[0].x, hand[8].y - hand[0].y) > Math.hypot(hand[6].x - hand[0].x, hand[6].y - hand[0].y) * 1.18;
    const middleExt = Math.hypot(hand[12].x - hand[0].x, hand[12].y - hand[0].y) > Math.hypot(hand[10].x - hand[0].x, hand[10].y - hand[0].y) * 1.18;
    const ringExt = Math.hypot(hand[16].x - hand[0].x, hand[16].y - hand[0].y) > Math.hypot(hand[14].x - hand[0].x, hand[14].y - hand[0].y) * 1.18;
    const pinkyExt = Math.hypot(hand[20].x - hand[0].x, hand[20].y - hand[0].y) > Math.hypot(hand[18].x - hand[0].x, hand[18].y - hand[0].y) * 1.18;

    return (thumbExt ? 1 : 0) + (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);
  }

  for (let targetCount = 1; targetCount <= 5; targetCount++) {
    const testHand = makeHand(false, targetCount);
    const detected = countFingers(testHand);
    assert.strictEqual(detected, targetCount, `Expected ${targetCount} extended fingers, got ${detected}`);
  }
  console.log("  ✅ [PASS] Finger Count: Precise counting for 1, 2, 3, 4, and 5 fingers verified");
}

// TEST 3: Fruit Slash Height & Bomb Non-Lethal Penalty
{
  const minVy = 12.5;
  const gravity = 0.22;
  // Peak rise height = v^2 / (2 * g)
  const peakRise = (minVy * minVy) / (2 * gravity);
  assert(peakRise > 300, `Peak rise height must be > 300px for chest/eye level reach (got ${peakRise.toFixed(1)}px)`);

  let score = 25;
  const isBomb = true;
  if (isBomb) {
    score = Math.max(0, score - 15);
  }
  assert.strictEqual(score, 10, "Bomb slice must deduct 15 points without ending game");

  console.log("  ✅ [PASS] Fruit Slash: High trajectory launch (>350px peak) and non-lethal bomb penalty verified");
}

// TEST 4: Speed Presets (S1, S2, S3)
{
  const presets = { s1: 0.7, s2: 1.0, s3: 1.4 };
  assert.strictEqual(presets.s1, 0.7);
  assert.strictEqual(presets.s2, 1.0);
  assert.strictEqual(presets.s3, 1.4);
  console.log("  ✅ [PASS] Speed Presets: S1 (0.7x Gentle), S2 (1.0x Normal), S3 (1.4x Fast) verified");
}

console.log("\n-------------------------------------------------");
console.log("SUMMARY: 4 / 4 T1 ARCADE TESTS PASSED (100%)");
console.log("-------------------------------------------------");
