/**
 * RehabOpt AR — Stroke Exercise Library (Standardized Clinical Protocol)
 * -----------------------------------------------------------------------------
 * 100% Deterministic Goniometry & Biomechanical Vector Geometry.
 * Exactly 9 calibrated clinical exercises (Exercise 10 omitted):
 *   1. 🦾 Elbow Extension & Flexion (elbow_ext)
 *   2. 🏋️ Shoulder Elevation / Shrug (shoulder_raise)
 *   3. 🖐️ Hand Open & Close (palm_open)
 *   4. 🙌 Horizontal Wrist Up & Down (wrist_stretch)
 *   5. 🎯 Diagonal Reach & Hold (Endurance) (ataxia_hold)
 *   6. ➡️ Two-Target Horizontal Glide (ataxia_push)
 *   7. 🔄 Open Palm Left & Right Rotation (parm_rotate)
 *   8. 🛸 Dynamic Moving Target Pursuit (moving_target_pursuit)
 *   9. 🤏 Virtual Pincer Grasp & Release (apraxia_pinch)
 *
 * Each step renders a high-definition anatomical skeletal card:
 *   - Dark navy-black viewport (#070D18)
 *   - Light blue anatomical joint nodes (#38BDF8)
 *   - Yellow bone vectors (#FBBF24)
 */

const StrokeProfiles = [
  { key: "All", emoji: "🌟", label: "All 9 Clinical Exercises" },
  { key: "Hemiparesis", emoji: "🦾", label: "Upper-Limb Hemiparesis" },
  { key: "Flexor Spasticity", emoji: "✋", label: "Flexor Spasticity" },
  { key: "Motor Ataxia", emoji: "🎯", label: "Motor Ataxia / Dysmetria" },
  { key: "Intention Tremor", emoji: "🫨", label: "Intention Tremor" },
  { key: "Motor Apraxia", emoji: "🧠", label: "Motor Apraxia" },
  { key: "Wrist Drop", emoji: "🤚", label: "Wrist Drop (Extensor Paresis)" },
];

// Helper: step definition with hold duration (seconds)
const S = (label, test, hold = 0) => ({ label, test, hold });

const EXERCISES = [
  /* ============ 1 · HEMIPARESIS: ELBOW EXTENSION & FLEXION ============ */
  {
    key: "elbow_ext",
    profile: "Hemiparesis",
    profiles: ["Hemiparesis", "All"],
    emoji: "🦾",
    name: "Elbow Extension & Flexion",
    metric: "ELBOW °",
    hint: "Straighten arm to top corner target (≥135°) and hold (0.5 Rep), then bend elbow back in (<125°) to complete 1 Rep.",
    steps: [
      S("Step 1: Extend Arm (≥135°) & Touch Corner Target", (m) => (m.cornerHit || (m.activeElbow != null ? m.activeElbow >= 135 : (m.elbowMax != null && m.elbowMax >= 135))), 0.4),
      S("Step 2: Bend Elbow Back In (<125°)", (m) => (m.activeElbow != null ? m.activeElbow < 125 : (m.elbowMin != null ? m.elbowMin < 125 : (m.elbowMax != null && m.elbowMax < 125)))),
    ],
  },

  /* ============ 2 · HEMIPARESIS: SHOULDER ELEVATION / SHRUG ============ */
  {
    key: "shoulder_raise",
    profile: "Hemiparesis",
    profiles: ["Hemiparesis", "All"],
    emoji: "🏋️",
    name: "Shoulder Elevation / Shrug",
    metric: "SHOULDER",
    hint: "Shrug your shoulder up into the target and hold (0.5 Rep), then lower your shoulder back down to complete 1 Rep.",
    steps: [
      S("Step 1: Shrug Shoulder Up into Target & Hold", (m) => !!m.shoulderShrugHit, 0.5),
      S("Step 2: Lower Shoulder Back Down to Rest Position", (m) => !!m.shoulderRelaxed),
    ],
  },

  /* ============ 3 · FLEXOR SPASTICITY: HAND OPEN & CLOSE ============ */
  {
    key: "palm_open",
    profile: "Flexor Spasticity",
    profiles: ["Flexor Spasticity", "All"],
    emoji: "🖐️",
    name: "Hand Open & Close (Fist to Open Palm)",
    metric: "PALM",
    hint: "Close fingers into a tight fist (0.5 Rep), then spread all 5 fingers wide into an open palm to complete 1 Rep.",
    steps: [
      S("Step 1: Close Hand into Fist ✊ & Hold", (m) => !!m.isFist, 0.3),
      S("Step 2: Open Palm Wide 🖐️ & Hold", (m) => !!m.isOpenPalm, 0.4),
    ],
  },

  /* ============ 4 · FLEXOR SPASTICITY / WRIST DROP: HORIZONTAL WRIST UP & DOWN ============ */
  {
    key: "wrist_stretch",
    profile: "Flexor Spasticity",
    profiles: ["Flexor Spasticity", "Wrist Drop", "All"],
    emoji: "🙌",
    name: "Horizontal Wrist Up & Down",
    metric: "WRIST °",
    hint: "Hold forearm horizontal. Tilt wrist UP into target (≥14°) and hold (0.5 Rep), then bring wrist DOWN to level to complete 1 Rep.",
    steps: [
      S("Step 1: Cock Wrist UPward (≥14°) & Hold", (m) => (m.wristPitch != null && m.wristPitch >= 14) || (m.wristLift != null && m.wristLift >= 0.08) || (m.dev != null && m.dev >= 12), 0.3),
      S("Step 2: Return Wrist DOWN to Level (≤12°)", (m) => (m.wristPitch != null && m.wristPitch <= 12) || (m.wristLift != null && m.wristLift <= 0.04) || (m.dev != null && m.dev <= 10)),
    ],
  },

  /* ============ 5 · MOTOR ATAXIA: DIAGONAL REACH & HOLD (ENDURANCE) ============ */
  {
    key: "ataxia_hold",
    profile: "Motor Ataxia",
    profiles: ["Motor Ataxia", "All"],
    emoji: "🎯",
    name: "Diagonal Reach & Hold (Endurance)",
    metric: "HOLD",
    hint: "Reach wrist diagonally upward into target circle and hold steady for 1 second.",
    steps: [
      S("Reach Wrist into Diagonal Target & Hold Steady", (m) => !!m.diagonalHit, 1.0),
    ],
  },

  /* ============ 6 · MOTOR ATAXIA: TWO-TARGET HORIZONTAL GLIDE ============ */
  {
    key: "ataxia_push",
    profile: "Motor Ataxia",
    profiles: ["Motor Ataxia", "All"],
    emoji: "➡️",
    name: "Two-Target Horizontal Glide",
    metric: "GLIDE",
    hint: "Glide wrist horizontally from Station 1 to Station 2 (0.5 Rep), then glide back to Station 1 to complete 1 Rep.",
    steps: [
      S("Step 1: Glide Wrist to Station 2 (Right) & Hold", (m) => !!m.s2Hit, 0.4),
      S("Step 2: Glide Wrist Back to Station 1 (Left) & Hold", (m) => !!m.s1Hit, 0.4),
    ],
  },

  /* ============ 7 · INTENTION TREMOR / WRIST DROP: OPEN PALM LEFT & RIGHT ROTATION ============ */
  {
    key: "parm_rotate",
    profile: "Intention Tremor",
    profiles: ["Intention Tremor", "Wrist Drop", "All"],
    emoji: "🔄",
    name: "Open Palm Left & Right Rotation",
    metric: "ROTATE",
    hint: "Keep palm wide open. Rotate hand Left (0.5 Rep), then rotate hand Right to complete 1 Rep.",
    steps: [
      S("Step 1: Rotate Open Palm Left ⬅️ & Hold", (m) => !!m.rotateLeftHit, 0.3),
      S("Step 2: Rotate Open Palm Right ➡️ & Hold", (m) => !!m.rotateRightHit, 0.3),
    ],
  },

  /* ============ 8 · INTENTION TREMOR: DYNAMIC MOVING TARGET PURSUIT ============ */
  {
    key: "moving_target_pursuit",
    profile: "Intention Tremor",
    profiles: ["Intention Tremor", "All"],
    emoji: "🛸",
    name: "Dynamic Moving Target Pursuit",
    metric: "PURSUIT",
    hint: "Follow the moving target with your wrist. Keep inside for the 6s countdown.",
    steps: [
      S("Follow Moving Target with Wrist (Counting Down)", (m) => !!m.movingPursuitComplete),
    ],
  },

  /* ============ 9 · MOTOR APRAXIA: VIRTUAL PINCER GRASP & RELEASE ============ */
  {
    key: "apraxia_pinch",
    profile: "Motor Apraxia",
    profiles: ["Motor Apraxia", "All"],
    emoji: "🤏",
    name: "Virtual Pincer Grasp & Release",
    metric: "PINCH",
    hint: "Pinch thumb and index fingertip together tightly (0.5 Rep), then release fingers wide open to complete 1 Rep.",
    steps: [
      S("Step 1: Pinch Thumb & Index Together 🤏 & Hold", (m) => (m.pinchRatio != null && m.pinchRatio <= 0.36) || (m.pinch != null && m.pinch <= 0.065), 0.4),
      S("Step 2: Release Fingers Wide Open 🖐️", (m) => (m.pinchRatio != null && m.pinchRatio >= 0.38) || (m.pinch != null && m.pinch >= 0.075) || !!m.isOpenPalm),
    ],
  },
];

// Grouping by clinical profile
const EXERCISES_BY_PROFILE = Object.fromEntries(
  StrokeProfiles.map((p) => [
    p.key,
    p.key === "All"
      ? EXERCISES
      : EXERCISES.filter((e) => e.profile === p.key || (Array.isArray(e.profiles) && e.profiles.includes(p.key))),
  ])
);

/**
 * High-Definition Skeletal Visualizer (SVG)
 * Generates an anatomical stick posture for each step:
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

  // Dedicated hand view for hand/wrist drills
  if (exKey === "palm_open" || exKey === "wrist_stretch" || exKey === "parm_rotate" || exKey === "apraxia_pinch") {
    return getHandStepSvg(exKey, stepIndex, isActive, isDone);
  }

  // Base coordinates for stick figure centered in 120 x 90 box
  const hx = 60, hy = 18; // head
  const nx = 60, ny = 27; // neck
  const tx = 60, ty = 60; // torso pelvis
  let lSh = { x: 44, y: 32 }, rSh = { x: 76, y: 32 };
  const lEl = { x: 40, y: 48 }, lWr = { x: 38, y: 64 }; // resting left arm

  // Calculate active right arm joints based on exercise type and step
  let rEl = { x: 80, y: 48 }, rWr = { x: 84, y: 64 };
  let targetGraphic = "";

  if (exKey === "elbow_ext") {
    if (stepIndex === 0) {
      // Step 1: Arm fully extended reaching toward upper right target
      rEl = { x: 90, y: 36 }; rWr = { x: 106, y: 22 };
      targetGraphic = `
        <circle cx="106" cy="22" r="7" fill="none" stroke="#38BDF8" stroke-width="1.8" stroke-dasharray="2 2" />
        <circle cx="106" cy="22" r="2.5" fill="#38BDF8" />
      `;
    } else {
      // Step 2: Elbow bent / flexed inward toward chest (<125°)
      rEl = { x: 84, y: 48 }; rWr = { x: 72, y: 38 };
    }
  } else if (exKey === "shoulder_raise") {
    if (stepIndex === 0) {
      // Step 1: Shoulder shrugged upward toward target
      rSh = { x: 76, y: 24 };
      rEl = { x: 82, y: 42 }; rWr = { x: 84, y: 60 };
      targetGraphic = `
        <circle cx="76" cy="18" r="6" fill="none" stroke="#FBBF24" stroke-width="1.8" />
        <path d="M 76 22 L 76 14 M 73 17 L 76 14 L 79 17" stroke="#FBBF24" stroke-width="1.5" stroke-linecap="round" />
      `;
    } else {
      // Step 2: Shoulder lowered back down to baseline
      rSh = { x: 76, y: 34 };
      rEl = { x: 80, y: 50 }; rWr = { x: 82, y: 66 };
    }
  } else if (exKey === "ataxia_hold") {
    // Diagonal reach & hold: arm extended into upper diagonal circle
    rEl = { x: 88, y: 38 }; rWr = { x: 104, y: 24 };
    targetGraphic = `
      <circle cx="104" cy="24" r="8" fill="none" stroke="#10B981" stroke-width="1.5" />
      <circle cx="104" cy="24" r="3" fill="#10B981" />
      <line x1="94" y1="24" x2="114" y2="24" stroke="#10B981" stroke-width="1" stroke-dasharray="2 2" />
      <line x1="104" y1="14" x2="104" y2="34" stroke="#10B981" stroke-width="1" stroke-dasharray="2 2" />
    `;
  } else if (exKey === "ataxia_push") {
    // Horizontal corridor push
    targetGraphic = `
      <line x1="50" y1="52" x2="110" y2="52" stroke="#475569" stroke-width="2" stroke-dasharray="3 3" />
      <circle cx="50" cy="52" r="5" fill="none" stroke="#38BDF8" stroke-width="1.5" />
      <circle cx="110" cy="52" r="5" fill="none" stroke="#FBBF24" stroke-width="1.5" />
    `;
    if (stepIndex === 0) {
      // Reaching across to right station
      rEl = { x: 92, y: 46 }; rWr = { x: 110, y: 52 };
    } else {
      // Returning to left station
      rEl = { x: 70, y: 48 }; rWr = { x: 50, y: 52 };
    }
  } else if (exKey === "moving_target_pursuit") {
    // Arm pursuing moving target orb
    rEl = { x: 88, y: 44 }; rWr = { x: 100, y: 42 };
    targetGraphic = `
      <circle cx="100" cy="42" r="9" fill="rgba(56, 189, 248, 0.2)" stroke="#38BDF8" stroke-width="2" />
      <circle cx="100" cy="42" r="3" fill="#38BDF8" />
      <path d="M 85 46 Q 95 36 108 44" fill="none" stroke="rgba(56, 189, 248, 0.5)" stroke-width="1.5" stroke-dasharray="2 2" />
    `;
  } else {
    rEl = { x: 80, y: 48 }; rWr = { x: 84, y: 64 };
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
      ${targetGraphic}
      <!-- Head & Spine -->
      <circle cx="${hx}" cy="${hy}" r="8" fill="none" stroke="${boneColor}" stroke-width="2.5" ${glow} />
      <circle cx="${hx}" cy="${hy}" r="3" fill="${jointColor}" />
      <line x1="${nx}" y1="${ny}" x2="${tx}" y2="${ty}" stroke="${boneColor}" stroke-width="3" stroke-linecap="round" />
      <line x1="${lSh.x}" y1="${lSh.y}" x2="${rSh.x}" y2="${rSh.y}" stroke="${boneColor}" stroke-width="3" stroke-linecap="round" />
      <!-- Left Arm (Resting) -->
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
  let spread = 1.0;
  let wristAngle = 0; // degrees upward cock or lateral rotation
  let customGraphic = "";

  if (exKey === "palm_open") {
    // Step 0: Fist, Step 1: Wide Open Palm
    spread = (stepIndex === 0) ? 0.35 : 1.45;
  } else if (exKey === "wrist_stretch") {
    // Step 0: Cocked UP (pitch >= 14°), Step 1: Return level (pitch <= 10°)
    wristAngle = (stepIndex === 0) ? -32 : 0;
    spread = 0.50;
    if (stepIndex === 0) {
      customGraphic = `
        <path d="M 60 30 L 60 16 M 56 20 L 60 16 L 64 20" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" />
        <text x="60" y="12" font-size="8" font-weight="800" text-anchor="middle" fill="#38BDF8">UP ⬆️</text>
      `;
    }
  } else if (exKey === "parm_rotate") {
    // Step 0: Rotate Left, Step 1: Rotate Right
    wristAngle = (stepIndex === 0) ? -28 : 28;
    spread = 1.25;
    const arrowPath = (stepIndex === 0)
      ? `M 42 22 Q 32 30 36 42 M 38 22 L 42 22 L 42 26`
      : `M 78 22 Q 88 30 84 42 M 82 22 L 78 22 L 78 26`;
    customGraphic = `
      <path d="${arrowPath}" fill="none" stroke="#FBBF24" stroke-width="2" stroke-linecap="round" />
      <text x="${stepIndex === 0 ? 32 : 88}" y="16" font-size="8" font-weight="800" text-anchor="middle" fill="#FBBF24">${stepIndex === 0 ? "LEFT ⬅️" : "RIGHT ➡️"}</text>
    `;
  } else if (exKey === "apraxia_pinch") {
    // Step 0: Tight pinch, Step 1: Release wide
    spread = (stepIndex === 0) ? 0.28 : 1.40;
    if (stepIndex === 0) {
      customGraphic = `
        <circle cx="56" cy="30" r="5" fill="none" stroke="#10B981" stroke-width="1.8" />
        <text x="60" y="14" font-size="8" font-weight="800" text-anchor="middle" fill="#10B981">PINCH 🤏</text>
      `;
    }
  }

  // Generate 5 finger rays
  const fingers = [-24, -12, 0, 12, 24].map((baseAngle, i) => {
    const a = (baseAngle * spread + wristAngle - 90) * (Math.PI / 180);
    const len = (spread < 0.4)
      ? 14 // curled in fist
      : i === 2 ? 34 : (i === 1 || i === 3) ? 30 : 24;
    return {
      x: palmCx + Math.cos(a) * len,
      y: palmCy + Math.sin(a) * len,
    };
  });

  return `
    <svg viewBox="0 0 120 90" class="step-skeletal-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="120" height="90" rx="8" fill="#070D18" stroke="${accentColor}" stroke-width="${isActive ? "2" : "1"}" />
      ${customGraphic}
      <!-- Forearm & Wrist -->
      <line x1="${wx}" y1="88" x2="${wx}" y2="${wy}" stroke="${boneColor}" stroke-width="4" stroke-linecap="round" />
      <circle cx="${wx}" cy="${wy}" r="5" fill="${accentColor}" />
      <!-- Palm Bridge -->
      <polygon points="${wx - 14},${wy} ${wx + 14},${wy} ${palmCx + 16},${palmCy} ${palmCx - 16},${palmCy}" fill="none" stroke="${boneColor}" stroke-width="2.5" />
      <circle cx="${palmCx}" cy="${palmCy}" r="4" fill="${jointColor}" />
      <!-- 5 Fingers -->
      ${fingers.map((f) => `
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
