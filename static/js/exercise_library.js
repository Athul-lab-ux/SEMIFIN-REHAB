/**
 * RehabOpt AR — Stroke Exercise Library (Wave 3)
 * ------------------------------------------------------------------
 * Exercises are categorised by post-stroke impairment profile. Each
 * patient opens the category for their deficit, picks the exercises
 * they want, and chooses reps / sets / rest-between-sets /
 * break-between-exercises.
 *
 * Every exercise is "step-locked" (as in the reference app): a rep
 * only counts when the patient completes each numbered step in order,
 * with optional hold seconds. Detection is deterministic math on the
 * frame metrics object `m` computed by the therapy engine:
 *
 *   m.elbowMax / m.elbowMin  largest/smallest elbow angle (either arm)
 *   m.elevMax                arm elevation from vertical (°)
 *   m.reach                  wrist displaced forward from shoulder
 *   m.spread                 hand landmark variance (small = fist)
 *   m.pinch                  thumb(4)–index(8) distance
 *   m.fan                    index(8)–pinky(20) distance
 *   m.dev                    signed wrist deviation (E3-style)
 *   m.tipX / m.tipY          index fingertip (normalised)
 *   m.speed                  fingertip speed (normalised / s)
 *   m.tilt                   trunk tilt E1 (°)  — anti-cheat
 */
const StrokeProfiles = [
  { key: "Hemiparesis", emoji: "🦾", label: "Upper-Limb Hemiparesis" },
  { key: "Flexor Spasticity", emoji: "✋", label: "Flexor Spasticity" },
  { key: "Motor Ataxia", emoji: "🎯", label: "Motor Ataxia / Dysmetria" },
  { key: "Intention Tremor", emoji: "🫨", label: "Intention Tremor" },
  { key: "Motor Apraxia", emoji: "🧠", label: "Motor Apraxia" },
  { key: "Wrist Drop", emoji: "🤚", label: "Wrist Drop (Extensor Paresis)" },
  { key: "LowerLimb", emoji: "🦵", label: "Lower-Limb Crural Paresis" },
];

// step helper shorthand
const S = (label, test, hold = 0) => ({ label, test, hold });

const EXERCISES = [
  /* ============ 1 · HEMIPARESIS (active weakness / ROM loss) ============ */
  {
    key: "elbow_ext", profile: "Hemiparesis", emoji: "🦾", name: "Elbow Extension",
    metric: "ELBOW °", hint: "Straighten and bend your affected elbow, keeping your shoulders level.",
    steps: [
      S("Bend your elbow (flex)", (m) => m.elbowMax != null && m.elbowMax <= 90),
      S("Extend arm toward the target", (m) => m.elbowMax != null && m.elbowMax >= 115, 1),
      S("Return to the bent position", (m) => m.elbowMax != null && m.elbowMax <= 95),
    ],
  },
  {
    key: "fwd_reach", profile: "Hemiparesis", emoji: "📏", name: "Forward Planar Reach",
    metric: "REACH", hint: "Reach your hand forward as far as you can, then bring it back.",
    steps: [
      S("Rest your arm by your side", (m) => m.elbowMax != null && m.elbowMax <= 100),
      S("Push your hand far forward", (m) => m.elbowMax != null && m.elbowMax >= 125 && m.reach > 0.10, 1),
      S("Return your hand back", (m) => m.elbowMax != null && m.elbowMax <= 105),
    ],
  },
  {
    key: "shoulder_raise", profile: "Hemiparesis", emoji: "🏋️", name: "Shoulder Raise (High Shelf)",
    metric: "ELEV °", hint: "Raise your arm up beside your ear, then lower it slowly.",
    steps: [
      S("Arm resting down", (m) => m.elevMax != null && m.elevMax < 35),
      S("Raise your arm up high", (m) => m.elevMax != null && m.elevMax >= 55, 0.8),
      S("Lower your arm slowly", (m) => m.elevMax != null && m.elevMax < 35),
    ],
  },
  {
    key: "side_sweep", profile: "Hemiparesis", emoji: "↔️", name: "Lateral Shoulder Sweep",
    metric: "ELEV °", hint: "Sweep your straight arm out to the side and back, without shrugging.",
    steps: [
      S("Arm at your side", (m) => m.elevMax != null && m.elevMax < 35),
      S("Sweep your arm outward", (m) => m.elevMax != null && m.elevMax >= 45, 0.8),
      S("Return arm to your side", (m) => m.elevMax != null && m.elevMax < 35),
    ],
  },
  {
    key: "bimanual_push", profile: "Hemiparesis", emoji: "🤲", name: "Bimanual Symmetrical Push",
    metric: "BOTH ELBOW", hint: "Push BOTH arms forward together, keeping them matching.",
    steps: [
      S("Both elbows bent", (m) => m.elbowMax != null && m.elbowMax <= 105),
      S("Push both hands forward together", (m) => m.elbowMin != null && m.elbowMin >= 120, 1),
      S("Return both arms", (m) => m.elbowMax != null && m.elbowMax <= 105),
    ],
  },

  /* ============ 2 · FLEXOR SPASTICITY (involuntary tightness) ============ */
  {
    key: "palm_open", profile: "Flexor Spasticity", emoji: "🖐️", name: "Open-Palm Dispersion Stretch",
    metric: "PALM", hint: "Slowly open your curled fingers as wide as they will go.",
    steps: [
      S("Make a loose fist", (m) => m.spread != null && m.spread < 0.08),
      S("Open your palm wide", (m) => m.spread != null && m.spread > 0.095, 1.0),
      S("Relax your hand", (m) => m.spread != null && m.spread < 0.09),
    ],
  },
  {
    key: "slow_unfurl", profile: "Flexor Spasticity", emoji: "🐢", name: "Slow Elbow Unfurling",
    metric: "ELBOW °", hint: "Straighten your arm SLOWLY — speed is capped to avoid reflex tightness.",
    steps: [
      S("Elbow bent (flexed)", (m) => m.elbowMax != null && m.elbowMax <= 100),
      S("Slowly extend past the gate", (m) => m.elbowMax != null && m.elbowMax >= 115 && (m.speed == null || m.speed < 1.0), 1),
      S("Return slowly", (m) => m.elbowMax != null && m.elbowMax <= 100),
    ],
  },
  {
    key: "fist_rhythm", profile: "Flexor Spasticity", emoji: "✊", name: "Fist–Open Rhythm",
    metric: "PALM", hint: "Clench slowly, hold, then open wide — feel the release.",
    steps: [
      S("Slowly clench a fist", (m) => m.spread != null && m.spread < 0.06, 0.6),
      S("Open your hand wide", (m) => m.spread != null && m.spread > 0.095, 0.6),
    ],
  },
  {
    key: "finger_fan", profile: "Flexor Spasticity", emoji: "🖐️", name: "Finger Fan-Out",
    metric: "FAN", hint: "Spread your fingers apart from each other like a fan.",
    steps: [
      S("Fingers together", (m) => m.fan != null && m.fan < 0.11),
      S("Fan your fingers wide apart", (m) => m.fan != null && m.fan > 0.13, 1.0),
      S("Relax fingers", (m) => m.fan != null && m.fan < 0.11),
    ],
  },
  {
    key: "wrist_stretch", profile: "Flexor Spasticity", emoji: "🙌", name: "Wrist Extension Stretch",
    metric: "DEV °", hint: "Bend your wrist backward (knuckles up) and hold the stretch.",
    steps: [
      S("Neutral wrist", (m) => m.dev != null && Math.abs(m.dev) < 10),
      S("Extend wrist backward", (m) => m.dev != null && m.dev > 10, 1.0),
      S("Return to neutral", (m) => m.dev != null && Math.abs(m.dev) < 10),
    ],
  },

  /* ============ 3 · MOTOR ATAXIA (overshoot / uncoordinated reach) ============ */
  {
    key: "ataxia_hold", profile: "Motor Ataxia", emoji: "🎯", name: "Target Holding",
    metric: "STABLE", hint: "Guide your fingertip into the centre zone and hold it there.",
    steps: [
      S("Move hand to the left edge", (m) => m.tipX != null && m.tipX < 0.3),
      S("Steer into the centre zone", (m) => m.tipX != null && m.tipX > 0.4 && m.tipX < 0.6 && m.tipY > 0.4 && m.tipY < 0.6, 2.5),
      S("Drift back to the left", (m) => m.tipX != null && m.tipX < 0.3),
    ],
  },
  {
    key: "ataxia_push", profile: "Motor Ataxia", emoji: "➡️", name: "Corridor Linear Push",
    metric: "PATH", hint: "Push your hand slowly along an invisible rail, left to right.",
    steps: [
      S("Start on the left", (m) => m.tipX != null && m.tipX < 0.3),
      S("Cross over to the right side", (m) => m.tipX != null && m.tipX > 0.7 && (m.speed == null || m.speed < 1.1)),
      S("Return to the left", (m) => m.tipX != null && m.tipX < 0.3),
    ],
  },
  {
    key: "ataxia_hop", profile: "Motor Ataxia", emoji: "⤴️", name: "Point-to-Point Hopping",
    metric: "ZONE", hint: "Hop your hand between the low zone and the high zone.",
    steps: [
      S("Hand in the low zone", (m) => m.tipY != null && m.tipY > 0.64),
      S("Hop to the high zone", (m) => m.tipY != null && m.tipY < 0.34, 0.5),
      S("Land back in the low zone", (m) => m.tipY != null && m.tipY > 0.64),
    ],
  },
  {
    key: "ataxia_stop", profile: "Motor Ataxia", emoji: "⏹️", name: "Decelerated Stop-on-Circle",
    metric: "STOP", hint: "Push outward to the ring and decelerate — stop inside without bouncing.",
    steps: [
      S("Centre position", (m) => m.tipX != null && m.tipX > 0.4 && m.tipX < 0.6),
      S("Push to the outer ring & stop", (m) => m.tipX != null && m.tipX > 0.7 && (m.speed == null || m.speed < 0.55), 1.2),
      S("Return to centre", (m) => m.tipX != null && m.tipX > 0.4 && m.tipX < 0.6),
    ],
  },
  {
    key: "ataxia_diag", profile: "Motor Ataxia", emoji: "⤡", name: "Diagonal Trajectory Track",
    metric: "PATH", hint: "Trace a diagonal line from the low-left corner to the high-right corner.",
    steps: [
      S("Low-left corner", (m) => m.tipX != null && m.tipX < 0.32 && m.tipY > 0.62),
      S("High-right corner", (m) => m.tipX != null && m.tipX > 0.68 && m.tipY < 0.36, 0.6),
      S("Back to low-left", (m) => m.tipX != null && m.tipX < 0.32 && m.tipY > 0.62),
    ],
  },

  /* ============ 4 · INTENTION TREMOR (terminal shaking) ============ */
  {
    key: "tremor_hold", profile: "Intention Tremor", emoji: "🤚", name: "Endpoint Stabilization Hold",
    metric: "STILL 2.5s", hint: "Reach the centre and hold very still for 2.5 seconds.",
    steps: [
      S("Hand beside the centre", (m) => m.tipX != null && m.tipX < 0.35),
      S("Hold perfectly still in centre", (m) => m.tipX != null && m.tipX > 0.4 && m.tipX < 0.6 && m.tipY > 0.4 && m.tipY < 0.6, 2.5),
      S("Move away", (m) => m.tipX != null && m.tipX < 0.35),
    ],
  },
  {
    key: "tremor_hover", profile: "Intention Tremor", emoji: "🧘", name: "Mid-Air Hover Zone",
    metric: "HOLD 4s", hint: "Keep your hand floating high and steady for 4 seconds.",
    steps: [
      S("Hand resting low", (m) => m.tipY != null && m.tipY > 0.6),
      S("Hover high & steady", (m) => m.tipY != null && m.tipY < 0.34 && m.tipX > 0.3 && m.tipX < 0.7, 4),
      S("Lower your hand", (m) => m.tipY != null && m.tipY > 0.6),
    ],
  },
  {
    key: "tremor_slowstop", profile: "Intention Tremor", emoji: "🐌", name: "Speed-Governed Stop",
    metric: "SLOW", hint: "Glide toward the centre slowly, then come to a full stop.",
    steps: [
      S("Start from the left", (m) => m.tipX != null && m.tipX < 0.3),
      S("Glide to centre, then stop", (m) => m.tipX != null && m.tipX > 0.42 && m.tipX < 0.58 && (m.speed == null || m.speed < 0.5), 1.5),
      S("Drift back left", (m) => m.tipX != null && m.tipX < 0.3),
    ],
  },
  {
    key: "tremor_recip", profile: "Intention Tremor", emoji: "⇄", name: "Reciprocal Line Hover",
    metric: "HOVER", hint: "Hover over the left line, then the right line — alternate.",
    steps: [
      S("Hover the LEFT line", (m) => m.tipX != null && m.tipX > 0.22 && m.tipX < 0.32, 1.5),
      S("Hover the RIGHT line", (m) => m.tipX != null && m.tipX > 0.68 && m.tipX < 0.78, 1.5),
    ],
  },
  {
    key: "tremor_aim", profile: "Intention Tremor", emoji: "🎯", name: "Precision Aim & Hold",
    metric: "AIM", hint: "Point at the small target zone and lock on without shaking off.",
    steps: [
      S("Aim at the upper zone", (m) => m.tipY != null && m.tipY < 0.3 && m.tipX > 0.4 && m.tipX < 0.6, 2),
      S("Lower to rest", (m) => m.tipY != null && m.tipY > 0.6),
    ],
  },

  /* ============ 5 · MOTOR APRAXIA (sequencing / motor memory) ============ */
  {
    key: "apraxia_lift", profile: "Motor Apraxia", emoji: "🫳", name: "Two-Stage Lift & Lock",
    metric: "STAGE", hint: "Stage 1: lift your forearm. Stage 2: cock your wrist up and lock.",
    steps: [
      S("Stage 1 — lift your forearm", (m) => m.elevMax != null && m.elevMax >= 35 && m.elevMax <= 75, 0.8),
      S("Stage 2 — extend wrist & lock", (m) => m.dev != null && m.dev > 10, 1),
      S("Relax arm down", (m) => m.elevMax != null && m.elevMax < 20),
    ],
  },
  {
    key: "apraxia_pinch", profile: "Motor Apraxia", emoji: "🤏", name: "Virtual Pincer Grasp & Release",
    metric: "PINCH", hint: "Pinch thumb and index together, hold, then open wide.",
    steps: [
      S("Open hand wide", (m) => m.pinch != null && m.pinch > 0.08),
      S("Pinch & hold the virtual peg", (m) => m.pinch != null && m.pinch < 0.05, 1.5),
      S("Release wide", (m) => m.pinch != null && m.pinch > 0.08),
    ],
  },
  {
    key: "apraxia_zone", profile: "Motor Apraxia", emoji: "🔢", name: "Sequential Zone Tap",
    metric: "SEQ", hint: "Touch the zones in order: 1 (top-left), 2 (top-right), 3 (bottom).",
    steps: [
      S("Tap zone 1 — top-left", (m) => m.tipX != null && m.tipX < 0.45 && m.tipY < 0.4, 0.7),
      S("Tap zone 2 — top-right", (m) => m.tipX != null && m.tipX > 0.55 && m.tipY < 0.4, 0.7),
      S("Tap zone 3 — bottom centre", (m) => m.tipX != null && m.tipX > 0.4 && m.tipX < 0.6 && m.tipY > 0.62, 0.8),
    ],
  },
  {
    key: "apraxia_oco", profile: "Motor Apraxia", emoji: "✋", name: "Open → Close → Open",
    metric: "CYCLE", hint: "Follow the sequence: open, close a fist, then open again.",
    steps: [
      S("Open your hand", (m) => m.spread != null && m.spread > 0.10),
      S("Close a fist", (m) => m.spread != null && m.spread < 0.05, 0.8),
      S("Open again wide", (m) => m.spread != null && m.spread > 0.10, 0.5),
    ],
  },
  {
    key: "apraxia_vert", profile: "Motor Apraxia", emoji: "↕️", name: "Patterned Vertical Reach",
    metric: "PATTERN", hint: "Follow the pattern: down low, up high, back down.",
    steps: [
      S("Hand down low", (m) => m.tipY != null && m.tipY > 0.68),
      S("Reach up high", (m) => m.tipY != null && m.tipY < 0.3, 0.6),
      S("Down low again", (m) => m.tipY != null && m.tipY > 0.68),
    ],
  },

  /* ============ 6 · WRIST DROP (extensor paresis) ============ */
  {
    key: "wrist_cockup", profile: "Wrist Drop", emoji: "📈", name: "Active Wrist Cock-Up",
    metric: "DEV °", hint: "Rest your forearm, then actively lift your wrist UP against gravity.",
    steps: [
      S("Neutral wrist", (m) => m.dev != null && Math.abs(m.dev) < 8),
      S("Cock wrist upward (+8°)", (m) => m.dev != null && m.dev > 8, 1.0),
      S("Return to neutral", (m) => m.dev != null && Math.abs(m.dev) < 8),
    ],
  },
  {
    key: "wrist_sweep", profile: "Wrist Drop", emoji: "↔️", name: "Radial–Ulnar Wrist Sweeps",
    metric: "DEV °", hint: "Sweep your wrist sideways — one direction, then the other.",
    steps: [
      S("Sweep wrist outward (radial)", (m) => m.dev != null && m.dev > 7),
      S("Sweep wrist inward (ulnar)", (m) => m.dev != null && m.dev < -6),
      S("Sweep outward again", (m) => m.dev != null && m.dev > 7),
    ],
  },
  {
    key: "wrist_slow", profile: "Wrist Drop", emoji: "🐢", name: "Slow Wrist Extension",
    metric: "DEV °", hint: "Extend your wrist up slowly and hold — control the whole range.",
    steps: [
      S("Wrist relaxed down", (m) => m.dev != null && m.dev < 6),
      S("Slowly extend up & hold", (m) => m.dev != null && m.dev > 8 && (m.speed == null || m.speed < 0.9), 1.0),
      S("Relax back down", (m) => m.dev != null && m.dev < 6),
    ],
  },
  {
    key: "wrist_point", profile: "Wrist Drop", emoji: "👉", name: "Point & Hold",
    metric: "POINT 2s", hint: "Point your index finger while your wrist stays lifted for 2 seconds.",
    steps: [
      S("Hand resting", (m) => m.dev != null && m.dev < 7),
      S("Point & keep wrist lifted", (m) => m.dev != null && m.dev > 7 && m.spread != null && m.spread > 0.05, 1.5),
      S("Rest your hand", (m) => m.dev != null && m.dev < 7),
    ],
  },
  {
    key: "wrist_openlift", profile: "Wrist Drop", emoji: "🖐️", name: "Open Palm + Lift",
    metric: "OPEN+LIFT", hint: "Open your palm wide AND lift your wrist up together.",
    steps: [
      S("Relax hand & wrist", (m) => m.spread != null && m.spread < 0.09 && (m.dev == null || m.dev < 8)),
      S("Open palm + lift wrist", (m) => m.spread != null && m.spread > 0.09 && m.dev != null && m.dev > 7, 0.8),
      S("Relax again", (m) => m.spread != null && m.spread < 0.09),
    ],
  },
];

// Convenience grouping
const EXERCISES_BY_PROFILE = Object.fromEntries(
  StrokeProfiles.map((p) => [p.key, EXERCISES.filter((e) => e.profile === p.key)])
);

if (typeof window !== "undefined") {
  window.StrokeProfiles = StrokeProfiles;
  window.EXERCISES = EXERCISES;
  window.EXERCISES_BY_PROFILE = EXERCISES_BY_PROFILE;
}
