/**
 * RehabOpt AR — Stroke Exercise Library (Standardized 4-Step Clinical Protocol)
 * -----------------------------------------------------------------------------
 * 100% Deterministic Goniometry & Biomechanical Vector Geometry.
 * Every exercise is structured into EXACTLY 4 sequential clinical gates:
 *   Step 1: Starting Position (Neutral baseline alignment)
 *   Step 2: Trajectory Initiation (Smooth kinematic drive)
 *   Step 3: Target Achievement & Controlled Hold (Terminal ROM gate + isometric hold)
 *   Step 4: Controlled Eccentric Return (Anti-gravity deceleration to neutral)
 *
 * Each step renders a high-definition anatomical skeletal card:
 *   - Dark navy-black viewport (#070D18)
 *   - Light blue anatomical joint nodes (#38BDF8)
 *   - Yellow bone vectors (#FBBF24)
 */

const StrokeProfiles = [
  { key: "Hemiparesis", emoji: "🦾", label: "Upper-Limb Hemiparesis" },
  { key: "Flexor Spasticity", emoji: "✋", label: "Flexor Spasticity" },
  { key: "Motor Ataxia", emoji: "🎯", label: "Motor Ataxia / Dysmetria" },
  { key: "Intention Tremor", emoji: "🫨", label: "Intention Tremor" },
  { key: "Motor Apraxia", emoji: "🧠", label: "Motor Apraxia" },
  { key: "Wrist Drop", emoji: "🤚", label: "Wrist Drop (Extensor Paresis)" },
];

// Helper: step definition
const S = (label, test, hold = 0) => ({ label, test, hold });

const EXERCISES = [
  /* ============ 1 · HEMIPARESIS (active weakness / ROM loss) ============ */
  {
    key: "elbow_ext", profile: "Hemiparesis", emoji: "🦾", name: "Elbow Extension & Flexion",
    metric: "ELBOW °", hint: "Start with bent elbow, straighten arm outward past 125°, hold, then bend elbow back down.",
    steps: [
      S("Step 1: Start with elbow flexed / bent (≤95°)", (m) => m.elbowMax != null && m.elbowMax <= 95),
      S("Step 2: Reach and straighten arm outward (>95°)", (m) => m.elbowMax != null && m.elbowMax > 95 && m.elbowMax < 125),
      S("Step 3: Lock straight elbow extension (≥125°)", (m) => m.elbowMax != null && m.elbowMax >= 125, 0.8),
      S("Step 4: Bend elbow back down (≤100° - 1 Rep)", (m) => m.elbowMax != null && m.elbowMax <= 100),
    ],
  },
  {
    key: "fwd_reach", profile: "Hemiparesis", emoji: "📏", name: "Forward Planar Reach",
    metric: "REACH", hint: "Drive your hand forward along an imaginary table, avoiding trunk tilt.",
    steps: [
      S("Arm resting by side (neutral ≤100°)", (m) => m.elbowMax != null && m.elbowMax <= 100),
      S("Drive hand forward across table", (m) => m.reach != null && m.reach > 0.06),
      S("Full forward reach & hold (≥120°)", (m) => (m.elbowMax != null && m.elbowMax >= 120) || (m.reach != null && m.reach > 0.12), 0.8),
      S("Smoothly glide hand back to side (≤105° - 1 Rep)", (m) => m.elbowMax != null && m.elbowMax <= 105),
    ],
  },
  {
    key: "shoulder_raise", profile: "Hemiparesis", emoji: "🏋️", name: "Shoulder Raise (High Shelf)",
    metric: "ELEV °", hint: "Elevate your affected arm overhead without shrugging your shoulder.",
    steps: [
      S("Arm resting down at side (<35°)", (m) => m.elevMax != null && m.elevMax < 35),
      S("Raise arm toward eye level (35°-55°)", (m) => m.elevMax != null && m.elevMax >= 35 && m.elevMax < 55),
      S("Overhead reach target & hold (≥55°)", (m) => m.elevMax != null && m.elevMax >= 55, 0.8),
      S("Slowly lower arm to side (<35° - 1 Rep)", (m) => m.elevMax != null && m.elevMax < 35),
    ],
  },

  /* ============ 2 · FLEXOR SPASTICITY (involuntary tightness) ============ */
  {
    key: "palm_open", profile: "Flexor Spasticity", emoji: "🖐️", name: "Hand Open & Close (Fist to Open Palm)",
    metric: "PALM", hint: "Start in closed fist, open your palm wide with fingers spread, hold, then close fist again.",
    steps: [
      S("Step 1: Start with closed fist / curled fingers", (m) => m.spread != null && m.spread <= 0.070),
      S("Step 2: Unfurl and open hand wide outward", (m) => m.spread != null && m.spread > 0.072 && m.spread < 0.090),
      S("Step 3: Hold wide open palm stretch", (m) => m.spread != null && m.spread >= 0.088, 0.8),
      S("Step 4: Close fingers tightly back into fist (1 Rep)", (m) => m.spread != null && m.spread <= 0.070),
    ],
  },
  {
    key: "slow_unfurl", profile: "Flexor Spasticity", emoji: "🐢", name: "Slow Elbow Unfurling",
    metric: "ELBOW °", hint: "Slowly straighten arm outward without rushing, hold, then bend elbow back down.",
    steps: [
      S("Step 1: Start with flexed elbow (≤95°)", (m) => m.elbowMax != null && m.elbowMax <= 95),
      S("Step 2: Slowly open elbow outward (>95°)", (m) => m.elbowMax != null && m.elbowMax > 95 && m.elbowMax < 120 && (m.speed == null || m.speed < 1.2)),
      S("Step 3: Hold gentle straight extension (≥120°)", (m) => m.elbowMax != null && m.elbowMax >= 120 && (m.speed == null || m.speed < 1.0), 1.0),
      S("Step 4: Bend elbow back down to flexed rest (≤98° - 1 Rep)", (m) => m.elbowMax != null && m.elbowMax <= 98),
    ],
  },
  {
    key: "wrist_stretch", profile: "Flexor Spasticity", emoji: "🙌", name: "Horizontal Wrist Extension Stretch",
    metric: "WRIST °", hint: "Hold forearm horizontal. Tilt wrist UP against gravity, hold stretch, then bring wrist DOWN.",
    steps: [
      S("Step 1: Neutral horizontal wrist (|angle| ≤12°)", (m) => (m.wristPitch != null && Math.abs(m.wristPitch) <= 12) || (m.dev != null && Math.abs(m.dev) <= 8)),
      S("Step 2: Tilt wrist UPward (>14°)", (m) => (m.wristPitch != null && m.wristPitch > 14 && m.wristPitch < 20) || (m.dev != null && m.dev > 8 && m.dev < 14)),
      S("Step 3: Hold upward wrist stretch (≥18°)", (m) => (m.wristPitch != null && m.wristPitch >= 18) || (m.dev != null && m.dev >= 14), 1.0),
      S("Step 4: Return wrist DOWN to level (≤8° - 1 Rep)", (m) => (m.wristPitch != null && m.wristPitch <= 8) || (m.dev != null && m.dev <= 8)),
    ],
  },

  /* ============ 3 · MOTOR ATAXIA (overshoot / uncoordinated reach) ============ */
  {
    key: "ataxia_hold", profile: "Motor Ataxia", emoji: "🎯", name: "Target Holding",
    metric: "STABLE", hint: "Damp terminal oscillation by holding your index fingertip steady in the center.",
    steps: [
      S("Resting hand outside center zone (x<0.35)", (m) => m.tipX != null && m.tipX < 0.35),
      S("Navigate fingertip toward target ring", (m) => m.tipX != null && m.tipX >= 0.35 && m.tipX <= 0.65),
      S("Lock dead-center & hold steady (2s)", (m) => m.tipX != null && m.tipX > 0.40 && m.tipX < 0.60 && m.tipY > 0.40 && m.tipY < 0.60, 2.0),
      S("Controlled withdrawal to edge (x<0.35)", (m) => m.tipX != null && m.tipX < 0.35),
    ],
  },
  {
    key: "ataxia_push", profile: "Motor Ataxia", emoji: "➡️", name: "Corridor Linear Push",
    metric: "PATH", hint: "Push your hand along a horizontal rail without vertical wandering.",
    steps: [
      S("Align on the left entry corridor (x<0.30)", (m) => m.tipX != null && m.tipX < 0.30),
      S("Glide steadily through center corridor", (m) => m.tipX != null && m.tipX >= 0.30 && m.tipX < 0.70 && (m.speed == null || m.speed < 1.2)),
      S("Reach right terminal zone & hold (x>0.70)", (m) => m.tipX != null && m.tipX >= 0.70, 0.8),
      S("Smoothly return back to left rail (x<0.30)", (m) => m.tipX != null && m.tipX < 0.30),
    ],
  },
  {
    key: "ataxia_hop", profile: "Motor Ataxia", emoji: "⤴️", name: "Point-to-Point Hopping",
    metric: "ZONE", hint: "Accurately hop between low and high targets without dysmetric overshoot.",
    steps: [
      S("Rest fingertip in the low target zone (y>0.64)", (m) => m.tipY != null && m.tipY > 0.64),
      S("Launch upward toward high target", (m) => m.tipY != null && m.tipY <= 0.64 && m.tipY > 0.34),
      S("Land cleanly in high target zone (y<0.34)", (m) => m.tipY != null && m.tipY <= 0.34, 0.8),
      S("Return and dock in low target (y>0.64)", (m) => m.tipY != null && m.tipY > 0.64),
    ],
  },

  /* ============ 4 · INTENTION TREMOR (terminal shaking) ============ */
  {
    key: "tremor_hold", profile: "Intention Tremor", emoji: "🤚", name: "Endpoint Stabilization Hold",
    metric: "STILL 2.5s", hint: "Reach the target and quiet terminal tremor through isometric stabilization.",
    steps: [
      S("Rest beside the target (x<0.35)", (m) => m.tipX != null && m.tipX < 0.35),
      S("Move hand into target zone", (m) => m.tipX != null && m.tipX >= 0.35 && m.tipX <= 0.65),
      S("Quiet all oscillation & hold (2.5s)", (m) => m.tipX != null && m.tipX > 0.40 && m.tipX < 0.60 && m.tipY > 0.40 && m.tipY < 0.60, 2.5),
      S("Smoothly withdraw to edge (x<0.35)", (m) => m.tipX != null && m.tipX < 0.35),
    ],
  },
  {
    key: "tremor_hover", profile: "Intention Tremor", emoji: "🧘", name: "Mid-Air Hover Zone",
    metric: "HOLD 3s", hint: "Keep your hand floating high and steady without sinking.",
    steps: [
      S("Arm resting down low (y>0.60)", (m) => m.tipY != null && m.tipY > 0.60),
      S("Ascend into upper hover ceiling", (m) => m.tipY != null && m.tipY <= 0.60 && m.tipY > 0.34),
      S("Hover steady inside ceiling (3s)", (m) => m.tipY != null && m.tipY <= 0.34 && m.tipX > 0.30 && m.tipX < 0.70, 3.0),
      S("Controlled lowering to resting base", (m) => m.tipY != null && m.tipY > 0.60),
    ],
  },
  {
    key: "tremor_aim", profile: "Intention Tremor", emoji: "🎯", name: "Precision Aim & Hold",
    metric: "AIM", hint: "Point index finger at the upper target bullseye and maintain stability.",
    steps: [
      S("Hand resting low (y>0.58)", (m) => m.tipY != null && m.tipY > 0.58),
      S("Elevate and aim toward upper bullseye", (m) => m.tipY != null && m.tipY <= 0.58 && m.tipY > 0.32),
      S("Lock inside bullseye & hold (2s)", (m) => m.tipY != null && m.tipY <= 0.32 && m.tipX > 0.40 && m.tipX < 0.60, 2.0),
      S("Lower hand back to low rest (y>0.58)", (m) => m.tipY != null && m.tipY > 0.58),
    ],
  },

  /* ============ 5 · MOTOR APRAXIA (sequencing / motor memory) ============ */
  {
    key: "apraxia_lift", profile: "Motor Apraxia", emoji: "🫳", name: "Two-Stage Lift & Lock",
    metric: "STAGE", hint: "Follow the kinematic sequence: lift forearm, cock wrist up, then release.",
    steps: [
      S("Arm neutral down by hip (<20°)", (m) => m.elevMax != null && m.elevMax < 20),
      S("Stage 1 — lift forearm to horizontal (35°-75°)", (m) => m.elevMax != null && m.elevMax >= 35 && m.elevMax <= 75, 0.8),
      S("Stage 2 — cock wrist up & lock (dev >10°)", (m) => m.dev != null && m.dev > 10, 1.0),
      S("Lower arm and relax wrist (<20°)", (m) => m.elevMax != null && m.elevMax < 20),
    ],
  },
  {
    key: "apraxia_pinch", profile: "Motor Apraxia", emoji: "🤏", name: "Virtual Pincer Grasp & Release",
    metric: "PINCH", hint: "Execute fine-motor sequence: open wide, pinch virtual peg, release wide.",
    steps: [
      S("Open hand wide (pinch >0.08)", (m) => m.pinch != null && m.pinch > 0.08),
      S("Approach thumb and index together", (m) => m.pinch != null && m.pinch <= 0.08 && m.pinch > 0.05),
      S("Lock tight pincer grasp & hold (pinch <0.05)", (m) => m.pinch != null && m.pinch < 0.05, 1.2),
      S("Release back to wide open hand (>0.08)", (m) => m.pinch != null && m.pinch > 0.08),
    ],
  },
  {
    key: "apraxia_zone", profile: "Motor Apraxia", emoji: "🔢", name: "Sequential Zone Tap",
    metric: "SEQ", hint: "Touch the spatial targets in exact sequence: 1 (top-left) → 2 (top-right) → 3 (bottom).",
    steps: [
      S("Neutral ready position", (m) => m.tipX != null),
      S("Tap Zone 1 (top-left)", (m) => m.tipX != null && m.tipX < 0.45 && m.tipY < 0.40, 0.7),
      S("Tap Zone 2 (top-right)", (m) => m.tipX != null && m.tipX > 0.55 && m.tipY < 0.40, 0.7),
      S("Tap Zone 3 (bottom-center)", (m) => m.tipX != null && m.tipX > 0.40 && m.tipX < 0.60 && m.tipY > 0.60, 0.8),
    ],
  },
  {
    key: "apraxia_oco", profile: "Motor Apraxia", emoji: "✋", name: "Fist → Open Palm → Fist",
    metric: "CYCLE", hint: "Follow the 4-phase sequence: closed fist → open palm → hold → close fist.",
    steps: [
      S("Step 1: Clench hand into closed fist", (m) => m.spread != null && m.spread <= 0.070),
      S("Step 2: Open palm wide & spread fingers", (m) => m.spread != null && m.spread >= 0.088, 0.6),
      S("Step 3: Hold wide open palm", (m) => m.spread != null && m.spread >= 0.088, 0.8),
      S("Step 4: Close tightly into fist again (1 Rep)", (m) => m.spread != null && m.spread <= 0.070),
    ],
  },

  /* ============ 6 · WRIST DROP (extensor paresis) ============ */
  {
    key: "wrist_cockup", profile: "Wrist Drop", emoji: "📈", name: "Horizontal Wrist Up & Down",
    metric: "WRIST °", hint: "Hold forearm horizontally across chest with closed fist. Tilt wrist UP, hold, then bring DOWN.",
    steps: [
      S("Step 1: Forearm horizontal & closed fist (|angle| ≤12°)", (m) => (m.wristPitch != null && Math.abs(m.wristPitch) <= 12) || (m.dev != null && Math.abs(m.dev) <= 8)),
      S("Step 2: Cock wrist UPward (>14°)", (m) => (m.wristPitch != null && m.wristPitch > 14 && m.wristPitch < 20) || (m.dev != null && m.dev > 8 && m.dev < 14)),
      S("Step 3: Hold peak wrist UP position (≥18°)", (m) => (m.wristPitch != null && m.wristPitch >= 18) || (m.dev != null && m.dev >= 14), 0.8),
      S("Step 4: Lower wrist DOWN to neutral (≤8° - 1 Rep)", (m) => (m.wristPitch != null && m.wristPitch <= 8) || (m.dev != null && m.dev <= 8)),
    ],
  },
  {
    key: "wrist_sweep", profile: "Wrist Drop", emoji: "↔️", name: "Radial–Ulnar Wrist Sweeps",
    metric: "DEV °", hint: "Sweep your wrist horizontally from radial outward to ulnar inward.",
    steps: [
      S("Neutral wrist center (|dev| <6°)", (m) => (m.dev != null && Math.abs(m.dev) < 6) || (m.wristPitch != null && Math.abs(m.wristPitch) < 8)),
      S("Sweep outward toward thumb (dev >8°)", (m) => (m.dev != null && m.dev > 8) || (m.wristPitch != null && m.wristPitch > 10), 0.8),
      S("Sweep inward toward pinky (dev <-6°)", (m) => (m.dev != null && m.dev < -6) || (m.wristPitch != null && m.wristPitch < -8), 0.8),
      S("Return to neutral center (≤6° - 1 Rep)", (m) => (m.dev != null && Math.abs(m.dev) < 6) || (m.wristPitch != null && Math.abs(m.wristPitch) < 8)),
    ],
  },
  {
    key: "wrist_point", profile: "Wrist Drop", emoji: "👉", name: "Point & Hold",
    metric: "POINT 2s", hint: "Keep wrist cocked upward while extending index finger to point.",
    steps: [
      S("Hand resting on surface (neutral)", (m) => (m.dev != null && m.dev < 7) || (m.wristPitch != null && m.wristPitch < 10)),
      S("Lift wrist and extend index finger", (m) => ((m.dev != null && m.dev >= 7) || (m.wristPitch != null && m.wristPitch >= 10)) && m.spread != null && m.spread > 0.04),
      S("Maintain lifted wrist point & hold (2s)", (m) => ((m.dev != null && m.dev >= 8) || (m.wristPitch != null && m.wristPitch >= 12)) && m.spread != null && m.spread > 0.05, 2.0),
      S("Relax hand and wrist back to rest (1 Rep)", (m) => (m.dev != null && m.dev < 7) || (m.wristPitch != null && m.wristPitch < 10)),
    ],
  },
  {
    key: "wrist_openlift", profile: "Wrist Drop", emoji: "🖐️", name: "Open Palm + Lift",
    metric: "OPEN+LIFT", hint: "Simultaneously open all fingers wide AND cock your wrist up.",
    steps: [
      S("Relaxed hand & wrist (neutral)", (m) => m.spread != null && m.spread < 0.075),
      S("Initiate finger unfurl & wrist lift", (m) => m.spread != null && m.spread >= 0.075 && ((m.dev != null && m.dev >= 7) || (m.wristPitch != null && m.wristPitch >= 10))),
      S("Full open palm + cocked wrist hold", (m) => m.spread != null && m.spread > 0.088 && ((m.dev != null && m.dev >= 9) || (m.wristPitch != null && m.wristPitch >= 14)), 1.0),
      S("Smooth return to relaxed posture (1 Rep)", (m) => m.spread != null && m.spread < 0.075),
    ],
  },
];

// Convenience grouping
const EXERCISES_BY_PROFILE = Object.fromEntries(
  StrokeProfiles.map((p) => [p.key, EXERCISES.filter((e) => e.profile === p.key)])
);

/**
 * High-Definition Skeletal Visualizer (SVG)
 * Generates an anatomical stick posture for each of the 4 clinical steps:
 *  - Dark navy-black viewport (#070D18)
 *  - Light blue joint nodes (#38BDF8)
 *  - Yellow bone linkages (#FBBF24)
 *  - State accenting (active glow, done checkmark)
 */
function getExerciseStepSvg(exKey, stepIndex, isActive = false, isDone = false) {
  const accentColor = isDone ? "#10B981" : isActive ? "#38BDF8" : "#94A3B8";
  const boneColor = isDone ? "#34D399" : isActive ? "#FBBF24" : "#D97706";
  const jointColor = isDone ? "#6EE7B7" : isActive ? "#38BDF8" : "#64748B";
  const glow = isActive ? `filter="url(#glow-${stepIndex})"` : "";

  // Base coordinates for stick figure centered in 120 x 90 box
  const hx = 60, hy = 18; // head
  const nx = 60, ny = 27; // neck
  const tx = 60, ty = 60; // torso pelvis
  const lSh = { x: 44, y: 32 }, rSh = { x: 76, y: 32 };
  // Non-active left arm resting
  const lEl = { x: 40, y: 48 }, lWr = { x: 38, y: 64 };

  // Calculate active right arm joints based on exercise type and step
  let rEl = { x: 80, y: 48 }, rWr = { x: 84, y: 64 };
  let handShape = null; // optional hand detail

  if (exKey === "elbow_ext" || exKey === "slow_unfurl") {
    if (stepIndex === 0) { rEl = { x: 80, y: 48 }; rWr = { x: 70, y: 38 }; } // flexed
    else if (stepIndex === 1) { rEl = { x: 86, y: 46 }; rWr = { x: 92, y: 46 }; } // extending
    else if (stepIndex === 2) { rEl = { x: 92, y: 42 }; rWr = { x: 108, y: 42 }; } // fully extended
    else { rEl = { x: 82, y: 48 }; rWr = { x: 74, y: 40 }; } // returning
  } else if (exKey === "shoulder_raise" || exKey === "apraxia_vert" || exKey === "tremor_hover") {
    if (stepIndex === 0) { rEl = { x: 78, y: 48 }; rWr = { x: 80, y: 66 }; } // down
    else if (stepIndex === 1) { rEl = { x: 88, y: 40 }; rWr = { x: 98, y: 42 }; } // mid
    else if (stepIndex === 2) { rEl = { x: 84, y: 22 }; rWr = { x: 88, y: 8 }; } // high overhead
    else { rEl = { x: 82, y: 44 }; rWr = { x: 82, y: 62 }; } // down
  } else if (exKey === "fwd_reach" || exKey === "ataxia_push" || exKey === "tremor_slowstop") {
    if (stepIndex === 0) { rEl = { x: 78, y: 48 }; rWr = { x: 78, y: 62 }; }
    else if (stepIndex === 1) { rEl = { x: 88, y: 48 }; rWr = { x: 96, y: 52 }; }
    else if (stepIndex === 2) { rEl = { x: 96, y: 44 }; rWr = { x: 112, y: 44 }; } // reach
    else { rEl = { x: 82, y: 50 }; rWr = { x: 80, y: 60 }; }
  } else if (exKey === "side_sweep" || exKey === "ataxia_stop") {
    if (stepIndex === 0) { rEl = { x: 78, y: 48 }; rWr = { x: 80, y: 66 }; }
    else if (stepIndex === 1) { rEl = { x: 92, y: 44 }; rWr = { x: 102, y: 48 }; }
    else if (stepIndex === 2) { rEl = { x: 98, y: 32 }; rWr = { x: 114, y: 32 }; } // wide side sweep
    else { rEl = { x: 82, y: 48 }; rWr = { x: 82, y: 64 }; }
  } else if (exKey === "bimanual_push") {
    if (stepIndex === 0) {
      lEl.x = 42; lEl.y = 48; lWr.x = 50; lWr.y = 42;
      rEl = { x: 78, y: 48 }; rWr = { x: 70, y: 42 };
    } else if (stepIndex === 1) {
      lEl.x = 34; lEl.y = 44; lWr.x = 24; lWr.y = 44;
      rEl = { x: 86, y: 44 }; rWr = { x: 96, y: 44 };
    } else if (stepIndex === 2) {
      lEl.x = 26; lEl.y = 40; lWr.x = 12; lWr.y = 40;
      rEl = { x: 94, y: 40 }; rWr = { x: 108, y: 40 };
    } else {
      lEl.x = 40; lEl.y = 48; lWr.x = 48; lWr.y = 44;
      rEl = { x: 80, y: 48 }; rWr = { x: 72, y: 44 };
    }
  } else if (exKey === "palm_open" || exKey === "finger_fan" || exKey === "fist_rhythm" || exKey === "wrist_cockup" || exKey === "wrist_stretch" || exKey === "wrist_slow" || exKey === "wrist_point" || exKey === "wrist_openlift" || exKey === "apraxia_pinch" || exKey === "apraxia_oco") {
    // Detailed hand view for hand/wrist drills
    return getHandStepSvg(exKey, stepIndex, isActive, isDone);
  } else {
    // General coordination / target drills
    if (stepIndex === 0) { rEl = { x: 78, y: 48 }; rWr = { x: 82, y: 64 }; }
    else if (stepIndex === 1) { rEl = { x: 86, y: 46 }; rWr = { x: 94, y: 46 }; }
    else if (stepIndex === 2) { rEl = { x: 92, y: 40 }; rWr = { x: 104, y: 38 }; }
    else { rEl = { x: 80, y: 50 }; rWr = { x: 82, y: 62 }; }
  }

  return `
    <svg viewBox="0 0 120 90" class="step-skeletal-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow-${stepIndex}" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <rect width="120" height="90" rx="8" fill="#070D18" stroke="${accentColor}" stroke-width="${isActive ? "2" : "1"}" />
      <!-- Head & Spine -->
      <circle cx="${hx}" cy="${hy}" r="8" fill="none" stroke="${boneColor}" stroke-width="2.5" ${glow} />
      <circle cx="${hx}" cy="${hy}" r="3" fill="${jointColor}" />
      <line x1="${nx}" y1="${ny}" x2="${tx}" y2="${ty}" stroke="${boneColor}" stroke-width="3" stroke-linecap="round" />
      <line x1="${lSh.x}" y1="${lSh.y}" x2="${rSh.x}" y2="${rSh.y}" stroke="${boneColor}" stroke-width="3" stroke-linecap="round" />
      <!-- Left Arm (Resting or bimanual) -->
      <line x1="${lSh.x}" y1="${lSh.y}" x2="${lEl.x}" y2="${lEl.y}" stroke="${boneColor}" stroke-width="2.5" stroke-linecap="round" />
      <line x1="${lEl.x}" y1="${lEl.y}" x2="${lWr.x}" y2="${lWr.y}" stroke="${boneColor}" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="${lSh.x}" cy="${lSh.y}" r="3.5" fill="${jointColor}" />
      <circle cx="${lEl.x}" cy="${lEl.y}" r="3.5" fill="${jointColor}" />
      <circle cx="${lWr.x}" cy="${lWr.y}" r="3.5" fill="${jointColor}" />
      <!-- Active Right Arm -->
      <line x1="${rSh.x}" y1="${rSh.y}" x2="${rEl.x}" y2="${rEl.y}" stroke="${boneColor}" stroke-width="3.5" stroke-linecap="round" ${glow} />
      <line x1="${rEl.x}" y1="${rEl.y}" x2="${rWr.x}" y2="${rWr.y}" stroke="${boneColor}" stroke-width="3.5" stroke-linecap="round" ${glow} />
      <circle cx="${rSh.x}" cy="${rSh.y}" r="4.5" fill="${jointColor}" />
      <circle cx="${rEl.x}" cy="${rEl.y}" r="4.5" fill="${jointColor}" />
      <circle cx="${rWr.x}" cy="${rWr.y}" r="5" fill="${accentColor}" />
      <!-- Step number badge -->
      <g transform="translate(6, 6)">
        <circle cx="9" cy="9" r="8" fill="${isDone ? "#10B981" : isActive ? "#2563EB" : "#1E293B"}" />
        <text x="9" y="13" font-size="10" font-weight="900" text-anchor="middle" fill="#fff">${isDone ? "✓" : stepIndex + 1}</text>
      </g>
    </svg>`;
}

/**
 * Hand / Wrist Specific Skeletal Visualizer
 */
function getHandStepSvg(exKey, stepIndex, isActive, isDone) {
  const accentColor = isDone ? "#10B981" : isActive ? "#38BDF8" : "#94A3B8";
  const boneColor = isDone ? "#34D399" : isActive ? "#FBBF24" : "#D97706";
  const jointColor = isDone ? "#6EE7B7" : isActive ? "#38BDF8" : "#64748B";

  // Hand layout: wrist at bottom center (60, 75)
  const wx = 60, wy = 75;
  const palmCx = 60, palmCy = 52;
  // 5 finger tips depending on step
  let spread = 1.0;
  let wristAngle = 0; // degrees upward cock

  if (exKey === "palm_open" || exKey === "apraxia_oco") {
    spread = stepIndex === 0 ? 0.30 : stepIndex === 1 ? 0.75 : stepIndex === 2 ? 1.4 : 0.30;
  } else if (exKey === "fist_rhythm") {
    spread = stepIndex === 0 ? 0.5 : stepIndex === 1 ? 0.25 : stepIndex === 2 ? 1.4 : 0.5;
  } else if (exKey === "finger_fan") {
    spread = stepIndex === 0 ? 0.4 : stepIndex === 1 ? 0.8 : stepIndex === 2 ? 1.5 : 0.4;
  } else if (exKey === "wrist_cockup" || exKey === "wrist_stretch" || exKey === "wrist_slow") {
    wristAngle = stepIndex === 0 ? 0 : stepIndex === 1 ? -18 : stepIndex === 2 ? -34 : 0;
    spread = 0.45;
  } else if (exKey === "apraxia_pinch") {
    spread = stepIndex === 0 ? 1.2 : stepIndex === 1 ? 0.6 : stepIndex === 2 ? 0.25 : 1.2;
  } else {
    spread = stepIndex === 2 ? 1.2 : 0.7;
    wristAngle = stepIndex === 2 ? -20 : 0;
  }

  // Generate 5 finger rays
  const fingers = [-24, -12, 0, 12, 24].map((baseAngle, i) => {
    const a = (baseAngle * spread + wristAngle - 90) * (Math.PI / 180);
    const len = i === 2 ? 34 : (i === 1 || i === 3) ? 30 : 24;
    return {
      x: palmCx + Math.cos(a) * len,
      y: palmCy + Math.sin(a) * len,
    };
  });

  return `
    <svg viewBox="0 0 120 90" class="step-skeletal-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="90" rx="8" fill="#070D18" stroke="${accentColor}" stroke-width="${isActive ? "2" : "1"}" />
      <!-- Forearm & Wrist -->
      <line x1="${wx}" y1="88" x2="${wx}" y2="${wy}" stroke="${boneColor}" stroke-width="4" stroke-linecap="round" />
      <circle cx="${wx}" cy="${wy}" r="5" fill="${accentColor}" />
      <!-- Palm Bridge -->
      <polygon points="${wx - 14},${wy} ${wx + 14},${wy} ${palmCx + 16},${palmCy} ${palmCx - 16},${palmCy}" fill="none" stroke="${boneColor}" stroke-width="2.5" />
      <circle cx="${palmCx}" cy="${palmCy}" r="4" fill="${jointColor}" />
      <!-- 5 Fingers -->
      ${fingers.map((f, i) => `
        <line x1="${palmCx}" y1="${palmCy}" x2="${f.x}" y2="${f.y}" stroke="${boneColor}" stroke-width="2.8" stroke-linecap="round" />
        <circle cx="${f.x}" cy="${f.y}" r="3.5" fill="${jointColor}" />
      `).join("")}
      <!-- Step number badge -->
      <g transform="translate(6, 6)">
        <circle cx="9" cy="9" r="8" fill="${isDone ? "#10B981" : isActive ? "#2563EB" : "#1E293B"}" />
        <text x="9" y="13" font-size="10" font-weight="900" text-anchor="middle" fill="#fff">${isDone ? "✓" : stepIndex + 1}</text>
      </g>
    </svg>`;
}

if (typeof window !== "undefined") {
  window.StrokeProfiles = StrokeProfiles;
  window.EXERCISES = EXERCISES;
  window.EXERCISES_BY_PROFILE = EXERCISES_BY_PROFILE;
  window.getExerciseStepSvg = getExerciseStepSvg;
}
