/**
 * RehabOpt AR — Guided Therapy Engine (High-Visibility Clinical AR Target System)
 * -----------------------------------------------------------------------------
 * Deterministic AR Biofeedback for Stroke Upper-Limb Rehabilitation:
 *   1. 🦾 Elbow Extension & Flexion (elbow_ext) — Top Corner Target (≥150°)
 *   2. 🏋️ Shoulder Elevation / Shrug (shoulder_raise) — Shrug Target (Slightly Above Baseline)
 *   3. 🖐️ Hand Open & Close (palm_open) — Fist to Wide Open Palm Targets
 *   4. 🙌 Horizontal Wrist Up & Down (wrist_stretch) — Floating Upward Target (≥20°)
 *   5. 🎯 Diagonal Reach & Hold (Endurance) (ataxia_hold) — Diagonal Radar Target (3s)
 *   6. ➡️ Two-Target Horizontal Glide (ataxia_push) — S1 & S2 Guideway Targets
 *   7. 🔄 Open Palm Left & Right Rotation (parm_rotate) — Left & Right Rotational Targets
 *   8. 🛸 Dynamic Moving Target Pursuit (moving_target_pursuit) — Smooth Gliding Orb (10s Countdown)
 *   9. 🤏 Virtual Pincer Grasp & Release (apraxia_pinch) — Caliper Target
 *
 * Rep Counting Architecture:
 *   - Half Reps (0.5): Awarded on reaching target / peak contraction with 🔔 chime + audio prompt
 *   - Full Reps (1.0): Completed on controlled return to baseline with 🎉 chime
 *   - Continuous 60 FPS Canvas Rendering: Target circles are ALWAYS visible and pulsating
 *   - Anti-cheat trunk lock: E1 tilt > 10° freezes workout progression
 */

document.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM -----------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const screens = {
    config: $("screen-config"), warmup: $("screen-warmup"), workout: $("screen-workout"),
    rest: $("screen-rest"), break_: $("screen-break"), done: $("screen-done"),
  };
  const toast = $("toast");

  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 2800);
  }

  function showScreen(name) {
    Object.values(screens).forEach((el) => { if (el) el.classList.remove("active"); });
    const target = screens[name === "break" ? "break_" : name];
    if (target) target.classList.add("active");
    if (name === "workout") {
      setTimeout(() => {
        sizeOverlay();
        const v = $("video");
        if (v && v.paused) v.play().catch(() => {});
      }, 50);
    }
  }

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  // ---------- AR Skeleton & High-Visibility Target Overlay ----------------
  const overlayCanvas = $("overlay-canvas");
  const oCtx = overlayCanvas.getContext("2d");

  function sizeOverlay() {
    const stage = overlayCanvas.parentElement;
    if (!stage) return;
    overlayCanvas.width = Math.max(1, Math.round(stage.clientWidth));
    overlayCanvas.height = Math.max(1, Math.round(stage.clientHeight));
  }
  sizeOverlay();
  let ovResizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(ovResizeTimer);
    ovResizeTimer = setTimeout(sizeOverlay, 150);
  });

  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17],            // Palm knuckle base
  ];

  /**
   * High-Visibility Clinical AR Target Circle Drawer
   * Draws a glowing, high-contrast circular target with crosshairs, bullseye,
   * pulsating radar rings, circular hold progress gauge, and dark floating badge pill.
   */
  function drawTargetCircle(x, y, radius, label, color = "#38BDF8", isHit = false, progressPct = 0, centerText = "") {
    oCtx.save();
    const activeColor = isHit ? "#00FF66" : color;
    const pulse = Math.sin(Date.now() / 200) * 5;

    // 1. Semi-transparent glowing backdrop fill (makes target visible on ANY camera background)
    oCtx.beginPath();
    oCtx.arc(x, y, radius, 0, Math.PI * 2);
    oCtx.fillStyle = isHit
      ? "rgba(0, 255, 102, 0.32)"
      : (color === "#FBBF24" ? "rgba(251, 191, 36, 0.28)" : (color === "#10B981" ? "rgba(16, 185, 129, 0.28)" : "rgba(56, 189, 248, 0.28)"));
    oCtx.fill();

    // 2. Outer pulsating radar wave ring
    oCtx.beginPath();
    oCtx.arc(x, y, radius + 9 + pulse, 0, Math.PI * 2);
    oCtx.strokeStyle = isHit ? "rgba(0, 255, 102, 0.75)" : (color === "#FBBF24" ? "rgba(251, 191, 36, 0.65)" : "rgba(56, 189, 248, 0.65)");
    oCtx.lineWidth = 2.5;
    oCtx.stroke();

    // 3. Main target perimeter circle
    oCtx.beginPath();
    oCtx.arc(x, y, radius, 0, Math.PI * 2);
    oCtx.strokeStyle = activeColor;
    oCtx.lineWidth = isHit ? 5 : 4;
    oCtx.stroke();

    // 4. Inner concentric guide ring
    oCtx.beginPath();
    oCtx.arc(x, y, radius * 0.52, 0, Math.PI * 2);
    oCtx.strokeStyle = isHit ? "rgba(0, 255, 102, 0.9)" : "rgba(255, 255, 255, 0.6)";
    oCtx.lineWidth = 2;
    oCtx.stroke();

    // 5. High-contrast Crosshairs (+)
    oCtx.beginPath();
    oCtx.moveTo(x - radius * 0.9, y); oCtx.lineTo(x - radius * 0.22, y);
    oCtx.moveTo(x + radius * 0.22, y); oCtx.lineTo(x + radius * 0.9, y);
    oCtx.moveTo(x, y - radius * 0.9); oCtx.lineTo(x, y - radius * 0.22);
    oCtx.moveTo(x, y + radius * 0.22); oCtx.lineTo(x, y + radius * 0.9);
    oCtx.strokeStyle = isHit ? "#00FF66" : "#FFFFFF";
    oCtx.lineWidth = 2.2;
    oCtx.stroke();

    // 6. Solid Bullseye Center Dot
    oCtx.beginPath();
    oCtx.arc(x, y, 6.5, 0, Math.PI * 2);
    oCtx.fillStyle = isHit ? "#00FF66" : "#FFFFFF";
    oCtx.fill();
    oCtx.strokeStyle = "#070D18";
    oCtx.lineWidth = 2;
    oCtx.stroke();

    // 7. Circular hold progress bar (fills when holding inside target)
    if (progressPct > 0) {
      oCtx.beginPath();
      oCtx.arc(x, y, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1.0, progressPct));
      oCtx.strokeStyle = "#00FF66";
      oCtx.lineWidth = 6;
      oCtx.lineCap = "round";
      oCtx.stroke();
    }

    // 8. Large center text (e.g. countdown seconds or status)
    if (centerText) {
      oCtx.font = "900 17px Segoe UI, sans-serif";
      oCtx.textAlign = "center";
      oCtx.textBaseline = "middle";
      oCtx.fillStyle = isHit ? "#00FF66" : "#FFFFFF";
      oCtx.shadowColor = "rgba(0, 0, 0, 0.9)";
      oCtx.shadowBlur = 8;
      oCtx.fillText(centerText, x, y + 1);
      oCtx.shadowBlur = 0;
    }

    // 9. Floating badge pill
    if (label) {
      oCtx.font = "bold 13px Segoe UI, sans-serif";
      oCtx.textAlign = "center";
      oCtx.textBaseline = "alphabetic";
      const tw = oCtx.measureText(label).width;
      const pw = tw + 24;
      const ph = 26;
      const px = x - pw / 2;
      const py = y - radius - 20;

      oCtx.fillStyle = "rgba(7, 13, 24, 0.94)";
      oCtx.beginPath();
      if (oCtx.roundRect) oCtx.roundRect(px, py - 18, pw, ph, 8);
      else oCtx.rect(px, py - 18, pw, ph);
      oCtx.fill();

      oCtx.strokeStyle = isHit ? "#00FF66" : activeColor;
      oCtx.lineWidth = 2;
      oCtx.stroke();

      oCtx.fillStyle = isHit ? "#00FF66" : "#FFFFFF";
      oCtx.fillText(label, x, py);
    }

    oCtx.restore();
  }

  function drawOverlay(res) {
    try {
      const W = overlayCanvas.width, H = overlayCanvas.height;
      oCtx.clearRect(0, 0, W, H);

      const X = (p) => (p ? p.x * W : 0), Y = (p) => (p ? p.y * H : 0);
      oCtx.lineCap = "round";
      oCtx.lineJoin = "round";

      const ex = S.ex;
      const exKey = ex ? ex.key : "";
      const M = S.metrics || {};
      const now = Date.now();

      // 1. Arm skeleton (OpenCV Spec: Green bones #00C853, Yellow joints #FFEB3B)
      const c = res && (res.chain || (res.pose && (
        (res.pose[12] && res.pose[14] && res.pose[16] && { sh: res.pose[12], el: res.pose[14], wr: res.pose[16] }) ||
        (res.pose[11] && res.pose[13] && res.pose[15] && { sh: res.pose[11], el: res.pose[13], wr: res.pose[15] })
      )));

      if (c && c.sh && c.el && c.wr && (c.sh.x !== 0 || c.sh.y !== 0)) {
        oCtx.strokeStyle = "rgba(0, 200, 83, 0.95)";
        oCtx.lineWidth = 4.5;
        oCtx.beginPath();
        oCtx.moveTo(X(c.sh), Y(c.sh));
        oCtx.lineTo(X(c.el), Y(c.el));
        oCtx.lineTo(X(c.wr), Y(c.wr));
        oCtx.stroke();

        const joints = [
          { p: c.sh, label: "Shoulder" },
          { p: c.el, label: "Elbow" },
          { p: c.wr, label: "Wrist" },
        ];

        joints.forEach(({ p, label }) => {
          const px = X(p), py = Y(p);
          oCtx.beginPath();
          oCtx.arc(px, py, 7, 0, Math.PI * 2);
          oCtx.fillStyle = "#FFEB3B";
          oCtx.fill();
          oCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
          oCtx.lineWidth = 2;
          oCtx.stroke();

          // Clinical joint tag
          oCtx.font = "bold 11px Segoe UI, sans-serif";
          const lw = oCtx.measureText(label).width;
          oCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
          oCtx.fillRect(px + 10, py - 9, lw + 10, 18);
          oCtx.strokeStyle = "rgba(255, 235, 59, 0.6)";
          oCtx.lineWidth = 1;
          oCtx.strokeRect(px + 10, py - 9, lw + 10, 18);
          oCtx.fillStyle = "#FFFFFF";
          oCtx.fillText(label, px + 15, py + 4);
        });

        // Live Elbow Angle readout & arc
        let deg = null;
        if (window.Kinematics && typeof Kinematics.calculateJointAngle === "function") {
          deg = Math.round(Kinematics.calculateJointAngle(c.sh, c.el, c.wr));
        } else {
          const v1x = c.sh.x - c.el.x, v1y = c.sh.y - c.el.y;
          const v2x = c.wr.x - c.el.x, v2y = c.wr.y - c.el.y;
          const dot = v1x * v2x + v1y * v2y;
          const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
          if (mag > 0.0001) deg = Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI));
        }

        if (deg !== null && !isNaN(deg)) {
          const elX = X(c.el), elY = Y(c.el);
          const a1 = Math.atan2(c.sh.y - c.el.y, c.sh.x - c.el.x);
          const a2 = Math.atan2(c.wr.y - c.el.y, c.wr.x - c.el.x);

          oCtx.beginPath();
          oCtx.arc(elX, elY, 28, a1, a2, false);
          oCtx.strokeStyle = "rgba(255, 235, 59, 0.9)";
          oCtx.lineWidth = 2.5;
          oCtx.setLineDash([4, 4]);
          oCtx.stroke();
          oCtx.setLineDash([]);

          const degStr = `θ = ${deg}°`;
          oCtx.font = "bold 13px Segoe UI, sans-serif";
          const tw = oCtx.measureText(degStr).width;
          oCtx.fillStyle = "rgba(15, 23, 42, 0.9)";
          oCtx.fillRect(elX - tw / 2 - 8, elY + 18, tw + 16, 22);
          oCtx.strokeStyle = "#FFEB3B";
          oCtx.lineWidth = 1.5;
          oCtx.strokeRect(elX - tw / 2 - 8, elY + 18, tw + 16, 22);
          oCtx.fillStyle = "#FFEB3B";
          oCtx.fillText(degStr, elX - tw / 2, elY + 34);
        }
      }

      // 2. Full 21 Hand Landmarks & Connecting Bones
      if (res && res.hand && res.hand[0]) {
        // Draw hand bones: Bright Green (#00FF00)
        oCtx.strokeStyle = "#00FF00";
        oCtx.lineWidth = 2.5;
        for (const [i, j] of HAND_CONNECTIONS) {
          const p1 = res.hand[i], p2 = res.hand[j];
          if (p1 && p2) {
            oCtx.beginPath();
            oCtx.moveTo(X(p1), Y(p1));
            oCtx.lineTo(X(p2), Y(p2));
            oCtx.stroke();
          }
        }

        // Draw ALL 21 RED DOTS (#FF0000) on all joints (0 to 20)
        for (let i = 0; i < 21; i++) {
          const p = res.hand[i];
          if (!p) continue;
          const px = X(p), py = Y(p);
          oCtx.beginPath();
          oCtx.arc(px, py, 4.5, 0, Math.PI * 2);
          oCtx.fillStyle = "#FF0000";
          oCtx.fill();
          oCtx.strokeStyle = "#FFFFFF";
          oCtx.lineWidth = 1;
          oCtx.stroke();
        }

        // Index fingertip targeting halo (Landmark 8)
        if (res.hand[8]) {
          oCtx.beginPath();
          oCtx.arc(X(res.hand[8]), Y(res.hand[8]), 12, 0, Math.PI * 2);
          oCtx.strokeStyle = "rgba(0, 255, 0, 0.85)";
          oCtx.lineWidth = 2;
          oCtx.stroke();
        }
      }

      // 3. Exercise-Specific AR Visual Target Circles (ALWAYS DRAWN & PULSATING)
      if (S.phase === "workout" && exKey) {

        /* --- EXERCISE 1: Elbow Extension & Flexion (Top Corner Target) --- */
        if (exKey === "elbow_ext") {
          const isLeft = (c && c.sh && c.sh.x < 0.5);
          const cx = (isLeft ? 0.20 : 0.80) * W;
          const cy = 0.20 * H;
          const r = 50;

          if (S.step === 0) {
            const held = (M.cornerHit && M.elbowMax != null && M.elbowMax >= 150 && S.holdStart > 0)
              ? Math.min(1.0, (now - S.holdStart) / 1000) : 0;
            const centerText = held > 0 ? `${Math.max(0, 1.0 - held).toFixed(1)}s` : (M.elbowMax != null ? `${Math.round(M.elbowMax)}°` : "≥150°");
            drawTargetCircle(cx, cy, r, "🎯 CORNER TARGET: EXTEND WRIST (≥150°)", "#38BDF8", (M.cornerHit && M.elbowMax != null && M.elbowMax >= 150), held, centerText);
          } else {
            // Step 1: Flex elbow back in (< 120°)
            const isFlexed = M.elbowMax != null && M.elbowMax < 120;
            drawTargetCircle(cx, cy, r, "🎯 STEP 2: BEND ELBOW BACK IN (<120°)", "#FBBF24", isFlexed, 0, M.elbowMax != null ? `${Math.round(M.elbowMax)}°` : "<120°");
          }
        }

        /* --- EXERCISE 2: Shoulder Elevation / Shrug (Slightly Above Shoulder) --- */
        else if (exKey === "shoulder_raise") {
          const sh = c ? c.sh : null;
          const sx = (sh && sh.x > 0) ? X(sh) : 0.65 * W;
          const baseY = S.shoulderBaselineY != null ? S.shoulderBaselineY : ((sh && sh.y > 0) ? sh.y : 0.45);
          const targetY = Math.max(0.18 * H, (baseY - 0.08) * H);
          const r = 46;

          if (S.step === 0) {
            const held = (M.shoulderShrugHit && S.holdStart > 0) ? Math.min(2.0, (now - S.holdStart) / 1000) : 0;
            const centerText = held > 0 ? `${Math.max(0, 2.0 - held).toFixed(1)}s` : "SHRUG ⬆️";
            drawTargetCircle(sx, targetY, r, "🎯 SHRUG TARGET: LIFT SHOULDER HERE (HOLD 2s)", "#FBBF24", M.shoulderShrugHit, (held / 2.0), centerText);
          } else {
            drawTargetCircle(sx, baseY * H, r, "🎯 LOWER SHOULDER BACK TO REST POSITION", "#10B981", M.shoulderRelaxed, 0, "REST ⬇️");
          }
        }

        /* --- EXERCISE 3: Hand Open & Close (Fist to Open Palm) --- */
        else if (exKey === "palm_open") {
          const hx = (res && res.hand && res.hand[0]) ? X(res.hand[0]) : 0.58 * W;
          const hy = (res && res.hand && res.hand[0]) ? Y(res.hand[0]) : 0.48 * H;
          const r = 54;

          if (S.step === 0) {
            const held = (M.isFist && S.holdStart > 0) ? Math.min(0.5, (now - S.holdStart) / 1000) : 0;
            drawTargetCircle(hx, hy, r, "🎯 TARGET: CURL FINGERS INTO FIST ✊", "#F59E0B", M.isFist, (held / 0.5), "FIST ✊");
          } else {
            const held = (M.isOpenPalm && S.holdStart > 0) ? Math.min(0.7, (now - S.holdStart) / 1000) : 0;
            drawTargetCircle(hx, hy, r, "🎯 TARGET: SPREAD ALL 5 FINGERS WIDE 🖐️", "#10B981", M.isOpenPalm, (held / 0.7), "OPEN 🖐️");
          }
        }

        /* --- EXERCISE 4: Horizontal Wrist Up & Down --- */
        else if (exKey === "wrist_stretch") {
          const wx = (res && res.hand && res.hand[0]) ? X(res.hand[0]) : 0.58 * W;
          const wy = (res && res.hand && res.hand[0]) ? (Y(res.hand[0]) - 80) : 0.35 * H;
          const r = 46;

          if (S.step === 0) {
            const isUp = (M.wristPitch != null && M.wristPitch >= 20);
            const held = (isUp && S.holdStart > 0) ? Math.min(0.8, (now - S.holdStart) / 1000) : 0;
            const centerText = M.wristPitch != null ? `${M.wristPitch}°` : "UP ⬆️";
            drawTargetCircle(wx, wy, r, "🎯 TARGET: TILT WRIST UP ⬆️ (≥20°)", "#38BDF8", isUp, (held / 0.8), centerText);
          } else {
            const isDown = (M.wristPitch != null && M.wristPitch <= 8);
            const centerText = M.wristPitch != null ? `${M.wristPitch}°` : "LEVEL ↔️";
            drawTargetCircle(wx, wy, r, "🎯 RETURN WRIST DOWN TO LEVEL (≤8°)", "#10B981", isDown, 0, centerText);
          }
        }

        /* --- EXERCISE 5: Diagonal Reach & Hold (Endurance) --- */
        else if (exKey === "ataxia_hold") {
          const isLeft = (c && c.sh && c.sh.x < 0.5);
          const dx = (isLeft ? 0.22 : 0.78) * W;
          const dy = 0.22 * H;
          const r = 52;

          const held = (M.diagonalHit && S.holdStart > 0) ? Math.min(3.0, (now - S.holdStart) / 1000) : 0;
          const centerText = held > 0 ? `${Math.max(0, 3.0 - held).toFixed(1)}s` : "HOLD 🎯";
          drawTargetCircle(dx, dy, r, "🎯 TARGET: DIAGONAL STEADY HOLD (3s)", "#10B981", M.diagonalHit, (held / 3.0), centerText);
        }

        /* --- EXERCISE 6: Two-Target Horizontal Glide --- */
        else if (exKey === "ataxia_push") {
          const s1x = 0.28 * W, s1y = 0.55 * H;
          const s2x = 0.72 * W, s2y = 0.55 * H;
          const r = 44;

          // Horizontal guide rail
          oCtx.beginPath();
          oCtx.setLineDash([8, 6]);
          oCtx.moveTo(s1x, s1y);
          oCtx.lineTo(s2x, s2y);
          oCtx.strokeStyle = "rgba(56, 189, 248, 0.6)";
          oCtx.lineWidth = 3;
          oCtx.stroke();
          oCtx.setLineDash([]);

          // Station 1 (Left Target Circle)
          const s1Held = (S.step === 1 && M.s1Hit && S.holdStart > 0) ? Math.min(1.0, (now - S.holdStart) / 1000) : 0;
          drawTargetCircle(s1x, s1y, r, "🎯 STATION 1 (LEFT)", "#38BDF8", M.s1Hit, s1Held, "S1");

          // Station 2 (Right Target Circle)
          const s2Held = (S.step === 0 && M.s2Hit && S.holdStart > 0) ? Math.min(1.0, (now - S.holdStart) / 1000) : 0;
          drawTargetCircle(s2x, s2y, r, "🎯 STATION 2 (RIGHT)", "#FBBF24", M.s2Hit, s2Held, "S2");
        }

        /* --- EXERCISE 7: Open Palm Left & Right Rotation --- */
        else if (exKey === "parm_rotate") {
          const cx = (res && res.hand && res.hand[0]) ? X(res.hand[0]) : 0.58 * W;
          const cy = (res && res.hand && res.hand[0]) ? Y(res.hand[0]) : 0.50 * H;
          const r = 44;

          // Left Rotational Target Circle
          const lHeld = (S.step === 0 && M.rotateLeftHit && S.holdStart > 0) ? Math.min(0.6, (now - S.holdStart) / 1000) : 0;
          drawTargetCircle(cx - 100, cy, r, "🎯 TARGET: ROTATE LEFT ⬅️", "#38BDF8", M.rotateLeftHit, (lHeld / 0.6), "LEFT ⬅️");

          // Right Rotational Target Circle
          const rHeld = (S.step === 1 && M.rotateRightHit && S.holdStart > 0) ? Math.min(0.6, (now - S.holdStart) / 1000) : 0;
          drawTargetCircle(cx + 100, cy, r, "🎯 TARGET: ROTATE RIGHT ➡️", "#FBBF24", M.rotateRightHit, (rHeld / 0.6), "RIGHT ➡️");
        }

        /* --- EXERCISE 8: Dynamic Moving Target Pursuit --- */
        else if (exKey === "moving_target_pursuit") {
          // Dynamic trajectory computed continuously
          const t = (now - S.exStart) / 1000;
          const movX = 0.50 + 0.26 * Math.sin(t * 0.75);
          const movY = 0.45 + 0.10 * Math.sin(t * 1.5);
          const tx = movX * W;
          const ty = movY * H;
          const r = 52;

          // Motion tail trail behind the moving target
          for (let trail = 1; trail <= 4; trail++) {
            const trailT = t - trail * 0.12;
            const trX = (0.50 + 0.26 * Math.sin(trailT * 0.75)) * W;
            const trY = (0.45 + 0.10 * Math.sin(trailT * 1.5)) * H;
            oCtx.beginPath();
            oCtx.arc(trX, trY, r * (1 - trail * 0.18), 0, Math.PI * 2);
            oCtx.fillStyle = M.movingTargetHit ? `rgba(0, 255, 102, ${0.25 / trail})` : `rgba(245, 158, 11, ${0.25 / trail})`;
            oCtx.fill();
          }

          const rem = M.pursuitRemaining != null ? M.pursuitRemaining : 10.0;
          const centerText = `${rem.toFixed(1)}s`;
          const heldProgress = (10.0 - rem) / 10.0;
          const label = M.movingTargetHit ? "🎯 WRIST IN TARGET — COUNTING DOWN!" : "⚠️ KEEP WRIST INSIDE TARGET (10s)";

          drawTargetCircle(tx, ty, r, label, M.movingTargetHit ? "#00FF66" : "#F59E0B", M.movingTargetHit, heldProgress, centerText);
        }

        /* --- EXERCISE 9: Virtual Pincer Grasp & Release --- */
        else if (exKey === "apraxia_pinch") {
          const px = (res && res.hand && res.hand[8]) ? X(res.hand[8]) : 0.58 * W;
          const py = (res && res.hand && res.hand[8]) ? Y(res.hand[8]) : 0.50 * H;
          const r = 48;

          if (S.step === 0) {
            const isPinched = (M.pinchRatio != null && M.pinchRatio <= 0.22);
            const held = (isPinched && S.holdStart > 0) ? Math.min(0.8, (now - S.holdStart) / 1000) : 0;
            drawTargetCircle(px, py, r, "🎯 TARGET: PINCH THUMB & INDEX 🤏", "#10B981", isPinched, (held / 0.8), "PINCH 🤏");
          } else {
            const isReleased = (M.pinchRatio != null && M.pinchRatio >= 0.45);
            drawTargetCircle(px, py, r + 6, "🎯 TARGET: RELEASE FINGERS WIDE 🖐️", "#38BDF8", isReleased, 0, "OPEN 🖐️");
          }
        }
      }
    } catch (err) {
      console.warn("[Therapy] drawOverlay error caught defensively:", err);
    }
  }

  // Continuous 60 FPS Render Loop (Ensures target circles are ALWAYS visible and pulsating)
  let lastVisionRes = null;
  function renderLoop() {
    if (screens.workout && screens.workout.classList.contains("active")) {
      drawOverlay(lastVisionRes);
    }
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

  // ---------- Config UI -------------------------------------------------
  const profilePills = $("profile-pills");
  const exGrid = $("ex-grid");
  const profileNote = $("profile-note");
  let profile = localStorage.getItem("selectedCondition") || "All";
  let selected = new Set();

  const PROFILE_NOTES = {
    All: "Comprehensive upper-limb neuro-rehabilitation covering shoulder, elbow, wrist, and hand fine-motor control.",
    Hemiparesis: "Rebuild active range of motion, elbow extension, and shoulder elevation with postural stability.",
    "Flexor Spasticity": "Slow, controlled hand unfurling and wrist mobility to quiet velocity-dependent tightness.",
    "Motor Ataxia": "Target precision and horizontal trajectory drills to reduce overshoot and dysmetria.",
    "Intention Tremor": "Open-palm rotation and dynamic moving target pursuit to retrain terminal motor control.",
    "Motor Apraxia": "Virtual pincer grasp and fine motor coordination retraining.",
    "Wrist Drop": "Active horizontal wrist extension and rotation to retrain radial-nerve motor control.",
  };

  // Profile pills initialization
  window.StrokeProfiles.forEach((p) => {
    const b = document.createElement("button");
    b.className = "profile-pill";
    b.innerHTML = `${p.emoji}<span>${p.label}</span>`;
    b.addEventListener("click", () => { profile = p.key; renderConfig(); });
    profilePills.appendChild(b);
  });

  function exerciseCard(ex) {
    const div = document.createElement("label");
    div.className = "ex-card" + (selected.has(ex.key) ? " picked" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = ex.key;
    cb.checked = selected.has(ex.key);
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(ex.key); else selected.delete(ex.key);
      div.classList.toggle("picked", cb.checked);
      updateSummary();
    });
    div.innerHTML = `
      <span class="ex-emoji">${ex.emoji}</span>
      <span class="ex-body">
        <span class="ex-name">${ex.name}</span>
        <span class="ex-meta">${ex.metric} · ${ex.steps.length} steps</span>
      </span>`;
    div.prepend(cb);
    return div;
  }

  function renderConfig() {
    profilePills.querySelectorAll(".profile-pill").forEach((b) => {
      const key = StrokeProfiles.find((p) => b.textContent.includes(p.label))?.key;
      b.classList.toggle("active", key === profile || b.textContent.includes(profile));
    });
    const info = StrokeProfiles.find((p) => p.key === profile) || StrokeProfiles[0];
    profileNote.textContent = `${info.emoji} ${PROFILE_NOTES[profile] || ""}`;

    selected = new Set([...selected].filter((k) => EXERCISES.some((e) => e.key === k && (profile === "All" || e.profile === profile || (Array.isArray(e.profiles) && e.profiles.includes(profile))))));
    if (!selected.size) (EXERCISES_BY_PROFILE[profile] || EXERCISES).slice(0, 3).forEach((e) => selected.add(e.key));

    exGrid.innerHTML = "";
    (EXERCISES_BY_PROFILE[profile] || EXERCISES).forEach((ex) => exGrid.appendChild(exerciseCard(ex)));
    updateSummary();
  }

  function currentSelection() {
    return [...selected].filter((k) => EXERCISES.some((e) => e.key === k));
  }

  function updateSummary() {
    const reps = parseInt($("cfg-reps").value) || 10;
    const sets = parseInt($("cfg-sets").value) || 3;
    $("cfg-reps-total").textContent = currentSelection().length * reps * sets;
    $("cfg-ex-count").textContent = currentSelection().length;
    $("btn-start").disabled = currentSelection().length === 0;
  }

  // ---------- Session State ----------------------------------------------
  const S = {
    phase: "config", queue: [], qi: 0, ex: null,
    set: 1, rep: 0, step: 0, holdStart: 0,
    repsTarget: 10, setsTarget: 3, restSec: 35, breakSec: 60,
    paused: false, cheat: false, stuckAt: 0, stepEnteredAt: 0,
    timerStart: 0, setStart: 0, exStart: 0, activeTimeMs: 0,
    results: [],
    videoOn: false, lastTip: null, lastT: 0, speed: 0, metrics: null,
    hintOn: false, secTick: 0,
    lastActionTime: Date.now(), guidanceShowing: false,
    shoulderBaselineY: null,
    pursuitRemaining: 10.0,
    pursuitLastTime: Date.now(),
  };

  // ---------- Guidance Popup System ---------------------------------------
  let guidanceTimer = null;
  let guidanceInterval = null;

  function showGuidancePopup(durationSec = 10, isStuckAlert = false) {
    const popup = $("therapy-guidance-popup");
    if (!popup || !S.ex) return;
    if (S.paused || S.phase !== "workout") return;

    S.guidanceShowing = true;
    $("tgp-title").textContent = `${S.ex.emoji} ${S.ex.name}`;
    $("tgp-what").textContent = S.ex.hint || `Follow each numbered step in sequence to complete each rep.`;

    const curIdx = S.step || 0;
    const stepsEl = $("tgp-steps");
    stepsEl.innerHTML = S.ex.steps.map((st, i) => {
      const isCurrent = (i === curIdx);
      const isDone = (i < curIdx);
      return `
        <div class="tgp-step-item ${isCurrent ? 'current' : isDone ? 'done' : ''}" style="display:flex; align-items:flex-start; gap:10px; margin:6px 0; padding:8px 10px; border-radius:8px; background:${isCurrent ? 'rgba(255, 107, 0, 0.22)' : isDone ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)'}; border:1.5px solid ${isCurrent ? '#FF6B00' : isDone ? '#10B981' : 'rgba(255, 255, 255, 0.08)'}; box-shadow:${isCurrent ? '0 0 14px rgba(255, 107, 0, 0.4)' : 'none'};">
          <span style="display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:${isCurrent ? '#FF6B00' : isDone ? '#10B981' : '#475569'}; color:#fff; font-size:12px; font-weight:800; flex-shrink:0;">
            ${isDone ? '✓' : i + 1}
          </span>
          <div style="flex:1;">
            ${isCurrent ? `<div style="color:#FBBF24; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">👉 CURRENT STEP: DO THIS NOW</div>` : ''}
            <div style="font-size:13px; font-weight:${isCurrent ? '700' : '500'}; color:${isCurrent ? '#FFF' : isDone ? '#94A3B8' : '#CBD5E1'};">
              ${st.label} ${st.hold ? `<em style="color:#FDBA74; font-style:normal; font-weight:700;">(hold ${st.hold}s)</em>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join("");

    popup.classList.add("show");

    if (window.RehabBio) {
      if (isStuckAlert) {
        window.RehabBio.speak(`Step assistance: ${S.ex.steps[curIdx]?.label || 'Follow the step'}`);
      } else {
        window.RehabBio.speak(`${S.ex.name}. Step ${curIdx + 1}: ${S.ex.steps[curIdx]?.label || ''}`);
      }
    }

    if (guidanceTimer) clearTimeout(guidanceTimer);
    if (guidanceInterval) clearInterval(guidanceInterval);

    const startTime = Date.now();
    const totalMs = durationSec * 1000;
    const timerFill = $("tgp-timer-fill");
    const timerText = $("tgp-timer-text");

    guidanceInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, (totalMs - elapsed) / 1000);
      const pct = Math.max(0, Math.min(100, ((totalMs - elapsed) / totalMs) * 100));
      if (timerFill) timerFill.style.width = `${pct}%`;
      if (timerText) timerText.textContent = `Closing in ${Math.ceil(remaining)}s...`;

      if (elapsed >= totalMs) {
        hideGuidancePopup();
      }
    }, 50);
  }

  function hideGuidancePopup() {
    const popup = $("therapy-guidance-popup");
    if (popup) popup.classList.remove("show");
    if (guidanceTimer) clearTimeout(guidanceTimer);
    if (guidanceInterval) clearInterval(guidanceInterval);
    guidanceTimer = null;
    guidanceInterval = null;
    S.guidanceShowing = false;
    S.lastActionTime = Date.now();
  }

  const dismissBtn = $("tgp-dismiss");
  if (dismissBtn) dismissBtn.addEventListener("click", hideGuidancePopup);

  // ---------- Metrics Per Frame -------------------------------------------
  function computeMetrics(res) {
    const M = {
      elbowMax: null, elbowMin: null, elevMax: null, reach: 0, tilt: 0,
      spread: null, pinch: null, fan: null, dev: null, wristPitch: null,
      wristVerticalAngle: null, tipX: null, tipY: null, speed: 0,
      wristX: null, wristY: null, cornerHit: false, shoulderShrugHit: false,
      shoulderRelaxed: false, isFist: false, isOpenPalm: false, tipDistRatio: null,
      diagonalHit: false, s1Hit: false, s2Hit: false, rotateLeftHit: false,
      rotateRightHit: false, wristRotX: 0, movingTargetHit: false,
      movingPursuitComplete: false, pursuitRemaining: 10.0, pinchRatio: null,
    };

    // Dynamic Moving Target Pursuit kinematics (ALWAYS calculated every frame)
    const t = (Date.now() - S.exStart) / 1000;
    const movX = 0.50 + 0.26 * Math.sin(t * 0.75);
    const movY = 0.45 + 0.10 * Math.sin(t * 1.5);
    M.movingTarget = { x: movX, y: movY, r: 0.12 };

    if (!res) return M;

    try {
      // 1. Arm pose evaluation
      const c = res.chain || (res.pose && (
        (res.pose[12] && res.pose[14] && res.pose[16] && { sh: res.pose[12], el: res.pose[14], wr: res.pose[16] }) ||
        (res.pose[11] && res.pose[13] && res.pose[15] && { sh: res.pose[11], el: res.pose[13], wr: res.pose[15] })
      ));

      if (res.pose) {
        const arms = [
          { sh: res.pose[11], el: res.pose[13], wr: res.pose[15] },
          { sh: res.pose[12], el: res.pose[14], wr: res.pose[16] },
        ];
        const elbows = [], elevs = [];
        arms.forEach((a) => {
          if (a.sh && a.el && a.wr && (a.sh.x !== 0 || a.sh.y !== 0)) {
            try {
              let ang = null;
              if (window.Kinematics && typeof Kinematics.calculateJointAngle === "function") {
                ang = Kinematics.calculateJointAngle(a.sh, a.el, a.wr);
              } else {
                const v1x = a.sh.x - a.el.x, v1y = a.sh.y - a.el.y;
                const v2x = a.wr.x - a.el.x, v2y = a.wr.y - a.el.y;
                const dot = v1x * v2x + v1y * v2y;
                const mag = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
                if (mag > 0.0001) ang = (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
              }
              if (ang != null && !isNaN(ang)) elbows.push(ang);
              const dx = Math.abs(a.el.x - a.sh.x), dy = Math.abs(a.el.y - a.sh.y);
              elevs.push((Math.atan2(dx, dy) * 180) / Math.PI);
              M.reach = Math.max(M.reach, Math.abs(a.wr.x - a.sh.x));
            } catch (e) {}
          }
        });
        if (elbows.length) { M.elbowMax = Math.max(...elbows); M.elbowMin = Math.min(...elbows); }
        if (elevs.length) M.elevMax = Math.max(...elevs);

        // Trunk compensation detection (tilt > 10°)
        if (res.pose[11] && res.pose[12] && window.Kinematics && typeof Kinematics.calculateTrunkTilt === "function") {
          try {
            M.tilt = Kinematics.calculateTrunkTilt(res.pose[11], res.pose[12]).tiltDegrees || 0;
          } catch (e) {}
        }
      }

      // Active shoulder tracking for Shoulder Elevation / Shrug
      if (c && c.sh && (c.sh.x !== 0 || c.sh.y !== 0)) {
        M.sh = c.sh;
        if (S.shoulderBaselineY == null && c.sh.y > 0) {
          S.shoulderBaselineY = c.sh.y;
        }
        if (S.shoulderBaselineY != null) {
          // Shrug target achieved when shoulder lifts up by >= 0.045
          M.shoulderShrugHit = (c.sh.y <= S.shoulderBaselineY - 0.045);
          // Shoulder lowered back down to resting baseline
          M.shoulderRelaxed = (c.sh.y >= S.shoulderBaselineY - 0.02);
        }
      }

      // 2. Active wrist point tracking
      const wrist = (res.hand && res.hand[0]) || (c && c.wr) || (res.pose && (res.pose[16] || res.pose[15]));
      if (wrist) {
        M.wrist = wrist;
        M.wristX = wrist.x;
        M.wristY = wrist.y;

        // Top corner target hit for Elbow Extension (adaptive left/right side)
        const isLeft = (c && c.sh && c.sh.x < 0.5);
        const cornerX = isLeft ? 0.20 : 0.80;
        const cornerY = 0.20;
        const dCorner = Math.hypot(wrist.x - cornerX, (wrist.y - cornerY) * 0.75);
        M.cornerHit = (dCorner <= 0.15);

        // Diagonal reach target hit for Ataxia Hold
        const diagX = isLeft ? 0.22 : 0.78;
        const diagY = 0.22;
        const dDiag = Math.hypot(wrist.x - diagX, (wrist.y - diagY) * 0.75);
        M.diagonalHit = (dDiag <= 0.14);

        // Two-target horizontal stations (S1 & S2) for Ataxia Push
        M.s1Hit = Math.hypot(wrist.x - 0.28, (wrist.y - 0.55) * 0.75) <= 0.13;
        M.s2Hit = Math.hypot(wrist.x - 0.72, (wrist.y - 0.55) * 0.75) <= 0.13;

        // Moving pursuit hit check
        const dMov = Math.hypot(wrist.x - movX, (wrist.y - movY) * 0.75);
        M.movingTargetHit = (dMov <= 0.13);
      } else {
        M.movingTargetHit = false;
        M.cornerHit = false;
        M.diagonalHit = false;
        M.s1Hit = false;
        M.s2Hit = false;
      }

      // Moving pursuit reverse timer
      if (S.ex && S.ex.key === "moving_target_pursuit" && S.phase === "workout" && !S.paused) {
        const now = Date.now();
        const dt = Math.min(0.2, (now - S.pursuitLastTime) / 1000);
        S.pursuitLastTime = now;

        if (M.movingTargetHit) {
          S.pursuitRemaining = Math.max(0, S.pursuitRemaining - dt);
        } else {
          // Re-sets back to initial starting countdown (10.0s) whenever wrist leaves target
          S.pursuitRemaining = 10.0;
        }
        M.pursuitRemaining = S.pursuitRemaining;
        M.movingPursuitComplete = (S.pursuitRemaining <= 0.05);
      }

      // 3. Hand 21 Landmark Biometrics
      if (res.hand && res.hand.length >= 21) {
        // Palm scale (wrist 0 to middle MCP 9)
        const palmScale = Math.max(0.04, Math.hypot(res.hand[9].x - res.hand[0].x, res.hand[9].y - res.hand[0].y));
        const palmCenter = { x: (res.hand[0].x + res.hand[9].x) / 2, y: (res.hand[0].y + res.hand[9].y) / 2 };

        // Scale-invariant finger extension ratio
        let sumDist = 0;
        [4, 8, 12, 16, 20].forEach((idx) => {
          if (res.hand[idx]) sumDist += Math.hypot(res.hand[idx].x - palmCenter.x, res.hand[idx].y - palmCenter.y);
        });
        const tipDistRatio = (sumDist / 5) / palmScale;
        M.tipDistRatio = tipDistRatio;
        M.spread = tipDistRatio;
        M.isFist = (tipDistRatio <= 0.82);
        M.isOpenPalm = (tipDistRatio >= 1.15);

        // Horizontal Wrist Up & Down (Pitch angle: wrist 0 vs middle knuckle 9)
        if (res.hand[0] && (res.hand[9] || res.hand[12])) {
          const wr = res.hand[0];
          const kn = res.hand[9] || res.hand[12];
          const dy = wr.y - kn.y;
          const dx = Math.abs(kn.x - wr.x);
          const pitch = (Math.atan2(dy, Math.max(0.02, dx)) * 180) / Math.PI;
          M.wristPitch = Math.round(pitch);
          M.wristVerticalAngle = M.wristPitch;
          M.dev = M.wristPitch;
        }

        // Open Palm Left & Right Rotation (Knuckle lateral offset vs wrist)
        if (res.hand[0] && (res.hand[9] || res.hand[12])) {
          const wr = res.hand[0];
          const kn = res.hand[9] || res.hand[12];
          const rotX = kn.x - wr.x;
          M.wristRotX = rotX;
          const isPalmOpen = (M.isOpenPalm || tipDistRatio >= 1.0);
          M.rotateLeftHit = isPalmOpen && (rotX < -0.10);
          M.rotateRightHit = isPalmOpen && (rotX > 0.10);
        }

        // Scale-invariant Virtual Pincer Grasp (Thumb 4 to Index 8 / palmScale)
        if (res.hand[4] && res.hand[8]) {
          const pinchDist = Math.hypot(res.hand[4].x - res.hand[8].x, res.hand[4].y - res.hand[8].y);
          M.pinch = pinchDist;
          M.pinchRatio = pinchDist / palmScale;
        }

        // Speed calculation
        const tip = res.hand[8];
        if (tip) {
          M.tipX = tip.x; M.tipY = tip.y;
          const now = Date.now(), dt = (now - S.lastT) / 1000;
          if (S.lastTip && dt > 0) {
            S.speed = Math.hypot(tip.x - S.lastTip.x, tip.y - S.lastTip.y) / dt;
            M.speed = S.speed;
          }
          S.lastTip = { x: tip.x, y: tip.y }; S.lastT = now;
        }
      }
    } catch (err) {
      console.warn("[Therapy] computeMetrics caught error:", err);
    }
    return M;
  }

  // ---------- Metric Readout ----------------------------------------------
  function metricReadout(ex, M) {
    if (!ex || !M) return "—";
    switch (ex.key) {
      case "elbow_ext":
        return M.elbowMax != null ? `${Math.round(M.elbowMax)}° ${M.cornerHit ? "🎯 HIT" : ""}` : "—";
      case "shoulder_raise":
        return M.shoulderShrugHit ? "SHRUG REACHED ⭐" : (M.shoulderRelaxed ? "REST BASELINE" : "LIFT SHOULDER");
      case "palm_open":
        if (M.isOpenPalm) return "OPEN PALM 🖐️";
        if (M.isFist) return "CLOSED FIST ✊";
        return "MOVING...";
      case "wrist_stretch":
        if (M.wristPitch == null) return "—";
        if (M.wristPitch >= 20) return `${M.wristPitch}° UP ⬆️`;
        if (M.wristPitch <= 8) return `${M.wristPitch}° LEVEL ↔️`;
        return `${M.wristPitch}°`;
      case "ataxia_hold":
        return M.diagonalHit ? "LOCKED IN TARGET 🎯" : "REACH TARGET";
      case "ataxia_push":
        if (M.s1Hit) return "STATION 1 📍";
        if (M.s2Hit) return "STATION 2 🎯";
        return "GLIDING ➡️";
      case "parm_rotate":
        if (M.rotateLeftHit) return "ROTATED LEFT ⬅️";
        if (M.rotateRightHit) return "ROTATED RIGHT ➡️";
        return "ROTATE HAND 🔄";
      case "moving_target_pursuit":
        return M.movingTargetHit ? `${M.pursuitRemaining.toFixed(1)}s INSIDE 🛸` : "OUTSIDE (RESET) ⚠️";
      case "apraxia_pinch":
        if (M.pinchRatio != null && M.pinchRatio <= 0.22) return "PINCH LOCKED 🤏";
        if (M.pinchRatio != null && M.pinchRatio >= 0.45) return "OPEN WIDE 🖐️";
        return "PINCHING...";
      default:
        return M.elbowMax != null ? `${Math.round(M.elbowMax)}°` : "—";
    }
  }

  // ---------- Step Engine -------------------------------------------------
  const stepBoxes = $("step-boxes");

  function renderSteps(ex, activeIdx) {
    if (!stepBoxes || !ex || !ex.steps) return;
    stepBoxes.innerHTML = "";
    ex.steps.forEach((st, i) => {
      const isDone = i < activeIdx;
      const isActive = i === activeIdx;
      const d = document.createElement("div");
      d.className = "step-box" + (isDone ? " done" : isActive ? " active" : "");
      
      const svg = window.getExerciseStepSvg ? window.getExerciseStepSvg(ex.key, i, isActive, isDone) : "";
      d.innerHTML = `
        ${svg}
        <div class="sb-meta">
          <span class="sb-num-badge">${isDone ? "✓ DONE" : isActive ? "STEP " + (i + 1) : (i + 1)}</span>
          ${st.hold ? `<span class="sb-hold">⏱ ${st.hold}s</span>` : ""}
        </div>
        <span class="sb-txt">${st.label}</span>`;
      stepBoxes.appendChild(d);
    });
  }

  function speakStep(ex, idx) {
    const st = ex.steps[idx];
    if (!st) return;
    $("current-step-name").textContent = st.label;
    if (window.RehabBio) window.RehabBio.speak(`Step ${idx + 1}. ${st.label}`);
  }

  function handleWorkoutFrame(res) {
    if (S.phase !== "workout" || S.paused) return;
    try {
      const M = computeMetrics(res);
      S.metrics = M;
      $("metric-value").textContent = metricReadout(S.ex, M);

      // Anti-cheat trunk lock (E1 > 10°)
      if (M.tilt > 10) {
        if (!S.cheat) {
          S.cheat = true;
          $("cheat-banner").classList.add("show");
          if (window.RehabBio) {
            window.RehabBio.stopRomTone();
            window.RehabBio.playCheatBuzz();
            window.RehabBio.speak("Posture cheat detected: keep your shoulders level.", { priority: true });
          }
        }
        S.holdStart = 0;
        return;
      }
      if (S.cheat) {
        S.cheat = false;
        $("cheat-banner").classList.remove("show");
      }

      if (!S.ex || !S.ex.steps) return;
      const step = S.ex.steps[S.step];
      if (!step || typeof step.test !== "function") return;

      const ok = step.test(M, S, res);
      const now = Date.now();
      if (M.speed > 0.04 || ok) S.lastActionTime = now;

      // Update hold timer display on HUD
      if (S.ex.key === "moving_target_pursuit") {
        $("hold-display").textContent = `${Math.max(0, S.pursuitRemaining).toFixed(1)}s`;
      } else if (step.hold > 0 && ok) {
        if (!S.holdStart) S.holdStart = now;
        const held = (now - S.holdStart) / 1000;
        $("hold-display").textContent = `${Math.max(0, step.hold - held).toFixed(1)}s`;
      } else if (step.hold > 0) {
        $("hold-display").textContent = `${step.hold}s`;
      } else {
        $("hold-display").textContent = "—";
      }

      if (ok) {
        // Pitch-tone sonification for elbow ROM
        if (window.RehabBio) {
          if (S.ex.metric && S.ex.metric.indexOf("ELBOW") === 0 && M.elbowMax != null) {
            window.RehabBio.setRomTone(M.elbowMax, { minAngle: 40, maxAngle: 160 });
          } else {
            window.RehabBio.stopRomTone();
          }
        }

        if (step.hold > 0) {
          if (!S.holdStart) S.holdStart = now;
          const held = (now - S.holdStart) / 1000;
          if (held < step.hold) { S.hintOn = false; return; }
        }

        // Step completed successfully!
        S.holdStart = 0;
        S.step++;
        S.hintOn = false;
        S.stuckAt = 0;
        S.lastActionTime = now;
        if (S.guidanceShowing) hideGuidancePopup();

        if (window.RehabBio) window.RehabBio.playBeep(1046.5, 0.12, 0.35); // Pleasant chime

        if (S.step >= S.ex.steps.length) {
          // Full rep complete!
          completeRep();
        } else {
          // Half-rep feedback (e.g. 0.5 of 2-step clinical drill)
          if (S.step === 1 && S.ex.steps.length === 2) {
            $("rep-display").textContent = `${S.rep + 0.5} / ${S.repsTarget}`;
            $("feedback-line").textContent = `⭐ Half Rep (0.5) Complete! Next: ${S.ex.steps[1].label}`;
            if (window.RehabBio) window.RehabBio.speak("Half rep complete! Now follow step 2.");
          } else {
            speakStep(S.ex, S.step);
          }
          renderSteps(S.ex, S.step);
        }
      } else {
        // Step condition not yet satisfied
        if (window.RehabBio) window.RehabBio.stopRomTone();
        S.holdStart = 0;
        if (!S.stuckAt) S.stuckAt = now;
        if (now - S.stuckAt > 2200 && !S.hintOn) {
          S.hintOn = true;
          $("hint-line").textContent = `💡 Try: ${step.label}`;
          if (window.RehabBio) window.RehabBio.speak(`Try: ${step.label}`);
        }
        // 10s Inactivity / Stuck Guidance Alert
        if (now - S.stuckAt >= 10000 && !S.guidanceShowing) {
          showGuidancePopup(10, true);
          S.stuckAt = now;
        }
      }
    } catch (err) {
      console.warn("[Therapy] handleWorkoutFrame handled error:", err);
    }
  }

  function completeRep() {
    S.rep++;
    S.step = 0;
    S.stuckAt = 0;
    S.pursuitRemaining = 10.0;
    S.lastActionTime = Date.now();
    renderSteps(S.ex, 0);
    $("rep-display").textContent = `${S.rep} / ${S.repsTarget}`;
    $("hold-display").textContent = "—";
    $("hint-line").textContent = "";

    const praise = ["Nice form!", "Great reach!", "Keep it going!", "Excellent rep!", "Superb control!"];
    $("feedback-line").textContent = `${praise[(S.rep - 1) % praise.length]} Rep ${S.rep}/${S.repsTarget} ✅`;

    if (window.RehabBio) window.RehabBio.playRepChime();
    if (window.RehabBio) window.RehabBio.speak(`Repetition ${S.rep} complete.`);

    if (S.rep >= S.repsTarget) {
      // Set finished
      S.set++;
      if (S.set > S.setsTarget) { finishExercise(); return; }
      $("wo-set").textContent = `Set ${S.set}/${S.setsTarget}`;
      S.phase = "rest";
      S.countdown = S.restSec;
      S.lastCountdown = Date.now();
      if (window.RehabBio) window.RehabBio.playSetChime();
      renderRest();
      showScreen("rest");
      updateCountdownUI();
    }
  }

  // ---------- Set / Exercise Flow -----------------------------------------
  function finishExercise() {
    hideGuidancePopup();
    S.results.push({
      key: S.ex.key, name: S.ex.name, emoji: S.ex.emoji,
      reps: S.repsTarget * S.setsTarget, sets: S.setsTarget,
      elapsed: Math.round((Date.now() - S.exStart) / 1000),
    });
    logExercise(S.results[S.results.length - 1]);
    if (window.RehabBio) { window.RehabBio.stopRomTone(); window.RehabBio.playWorkoutFanfare(); }
    S.qi++;
    if (S.qi >= S.queue.length) { renderDone(); showScreen("done"); stopVision(); return; }
    // Break between exercises
    S.phase = "break";
    S.countdown = S.breakSec;
    S.lastCountdown = Date.now();
    $("break-next").textContent = `Next up: ${S.queue[S.qi].emoji} ${S.queue[S.qi].name}`;
    $("break-stats").innerHTML = `${S.results[S.results.length - 1].emoji} <b>${S.results[S.results.length - 1].name}</b> — ${S.results[S.results.length - 1].reps} reps · ${S.results[S.results.length - 1].sets} sets · ${S.results[S.results.length - 1].elapsed}s`;
    showScreen("break");
    updateCountdownUI();
  }

  function startNextExercise() {
    S.ex = S.queue[S.qi];
    S.set = 1; S.rep = 0; S.step = 0; S.holdStart = 0; S.stuckAt = 0;
    S.shoulderBaselineY = null;
    S.pursuitRemaining = 10.0;
    S.pursuitLastTime = Date.now();
    S.exStart = Date.now();
    S.lastActionTime = Date.now();

    $("wo-now").textContent = `${S.ex.emoji} ${S.ex.name}`;
    $("wo-set").textContent = `Set 1/${S.setsTarget}`;
    $("rep-display").textContent = `0 / ${S.repsTarget}`;
    $("hold-display").textContent = "—";
    $("metric-label").textContent = S.ex.metric;
    $("hint-line").textContent = ""; $("feedback-line").textContent = "";
    renderSteps(S.ex, 0);
    S.phase = "workout";
    showScreen("workout");
    speakStep(S.ex, 0);
    showGuidancePopup(4);
  }

  // ---------- Countdowns (Warm-up / Rest / Break) -------------------------
  function renderRest() {
    $("rest-counter").textContent = S.countdown;
    $("rest-fill").style.width = "0%";
  }

  function updateCountdownUI() {
    if (S.phase === "warmup") {
      $("warmup-counter").textContent = Math.max(1, Math.ceil(S.countdown));
      $("warmup-fill").style.width = `${(S.totalCount - S.countdown) / S.totalCount * 100}%`;
    } else if (S.phase === "rest") {
      $("rest-counter").textContent = Math.max(0, Math.ceil(S.countdown));
      $("rest-fill").style.width = `${(S.restSec - S.countdown) / S.restSec * 100}%`;
    } else if (S.phase === "break") {
      $("break-counter").textContent = Math.max(0, Math.ceil(S.countdown));
      $("break-fill").style.width = `${(S.breakSec - S.countdown) / S.breakSec * 100}%`;
    }
  }

  const ticker = setInterval(() => {
    if (S.phase === "warmup" || S.phase === "rest" || S.phase === "break") {
      const dt = (Date.now() - S.lastCountdown) / 1000;
      S.lastCountdown = Date.now();
      S.countdown = Math.max(0, S.countdown - dt);
      updateCountdownUI();
      if (S.countdown <= 0) {
        if (S.phase === "warmup") startNextExercise();
        else if (S.phase === "rest") {
          S.phase = "workout";
          showScreen("workout");
          S.setStart = Date.now();
          S.lastActionTime = Date.now();
          showGuidancePopup(4);
        }
        else if (S.phase === "break") startNextExercise();
      }
    } else if (S.phase === "workout" && !S.paused) {
      // Smart active movement timer: only increments when patient is actively moving
      const isMoving = (Date.now() - S.lastActionTime) < 2000;
      if (isMoving) {
        S.activeTimeMs += 250;
        $("timer-display").textContent = fmt(S.activeTimeMs);
        $("timer-display").style.opacity = "1";
      } else {
        $("timer-display").style.opacity = "0.6";
      }

      // Re-trigger 10s guidance popup if patient is stuck or inactive for 10s
      const isStuck = S.stuckAt > 0 && (Date.now() - S.stuckAt >= 10000);
      const isInactive = (Date.now() - S.lastActionTime >= 10000);
      if (!S.guidanceShowing && (isStuck || isInactive)) {
        showGuidancePopup(10, true);
        S.lastActionTime = Date.now();
        S.stuckAt = Date.now();
      }
    }
  }, 250);

  // ---------- Vision ------------------------------------------------------
  async function startVision() {
    if (S.videoOn) return true;
    if (window.RehabQA) {
      const report = window.RehabQA.runStressTest(window.RehabQA.STRESS_TARGET);
      if (!report.passed) console.warn("[QA] Stress test issues:", report.failures.slice(0, 3));
    }
    const ok = await VisionLoader.start($("video"), onFrame);
    if (ok) { S.videoOn = true; VisionLoader.watch(); }
    else showToast("❌ Camera unavailable — allow webcam access", "error");
    return ok;
  }

  function stopVision() {
    if (S.videoOn) { VisionLoader.stop(); S.videoOn = false; }
  }

  function onFrame(res) {
    try {
      lastVisionRes = res;
      if (S.phase === "workout") {
        handleWorkoutFrame(res);
      }
    } catch (err) {
      console.warn("[Therapy] onFrame handled error:", err);
    }
  }

  // ---------- Workout Launch & Controls -----------------------------------
  let countdownTimer = null;
  function runStageCountdown(label, seconds, onComplete) {
    const overlay = $("therapy-countdown-overlay");
    const numEl = $("tco-num");
    const labEl = $("tco-label");
    if (!overlay || !numEl) {
      if (onComplete) onComplete();
      return;
    }
    if (countdownTimer) clearInterval(countdownTimer);
    let remaining = seconds;
    labEl.textContent = label;
    numEl.textContent = remaining;
    overlay.classList.add("show");
    if (window.RehabBio) window.RehabBio.speak(`${label}. ${remaining}`);

    countdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        numEl.textContent = remaining;
        if (window.RehabBio) window.RehabBio.speak(`${remaining}`);
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        numEl.textContent = "GO!";
        if (window.RehabBio) window.RehabBio.speak("Go!");
        setTimeout(() => {
          overlay.classList.remove("show");
          if (onComplete) onComplete();
        }, 500);
      }
    }, 1000);
  }

  function pauseWorkout() {
    if (S.phase !== "workout" || S.paused) return;
    S.paused = true;
    hideGuidancePopup();
    $("pause-btn").style.display = "none";
    $("resume-btn").style.display = "inline-flex";
    $("therapy-paused-overlay").classList.add("show");
    if (window.RehabBio) {
      window.RehabBio.stopRomTone();
      window.RehabBio.speak("Session paused");
    }
  }

  function resumeWorkout() {
    $("therapy-paused-overlay").classList.remove("show");
    runStageCountdown("RESUMING IN", 4, () => {
      S.paused = false;
      S.lastActionTime = Date.now();
      $("resume-btn").style.display = "none";
      $("pause-btn").style.display = "inline-flex";
    });
  }

  function stopWorkout() {
    hideGuidancePopup();
    stopVision();
    const camToggleBtn = $("cam-toggle-btn");
    if (camToggleBtn) {
      camToggleBtn.textContent = "📷 Camera: OFF";
      camToggleBtn.classList.add("danger");
    }
    if (window.RehabBio) window.RehabBio.stopRomTone();
    $("therapy-paused-overlay").classList.remove("show");
    $("therapy-countdown-overlay").classList.remove("show");
    if (S.results.length === 0 && S.ex) {
      const elapsed = S.exStart ? Math.round((Date.now() - S.exStart) / 1000) : 0;
      S.results.push({
        key: S.ex.key, name: S.ex.name, emoji: S.ex.emoji,
        reps: S.rep || 0, sets: S.set || 1,
        elapsed: Math.max(1, elapsed),
      });
      logExercise(S.results[0]);
    }
    renderDone();
    showScreen("done");
  }

  async function launchWorkout(isInitial = false) {
    let queue = currentSelection();
    if (!queue.length) {
      const exs = EXERCISES;
      if (exs.length) queue = [exs[0]];
    }
    if (!queue.length) {
      if (!isInitial) showToast("⚠️ Select at least one exercise", "error");
      return;
    }
    S.queue = queue;
    S.qi = 0;
    S.repsTarget = Math.max(1, parseInt($("cfg-reps").value) || 10);
    S.setsTarget = Math.max(1, parseInt($("cfg-sets").value) || 3);
    S.restSec = Math.max(0, parseInt($("cfg-rest").value) || 35);
    S.breakSec = Math.max(0, parseInt($("cfg-break").value) || 60);
    S.results = []; S.timerStart = 0; S.activeTimeMs = 0;

    // Load first exercise into state and HUD
    S.ex = S.queue[S.qi];
    S.set = 1; S.rep = 0; S.step = 0; S.holdStart = 0; S.stuckAt = 0;
    S.shoulderBaselineY = null;
    S.pursuitRemaining = 10.0;
    S.pursuitLastTime = Date.now();
    S.exStart = Date.now();
    S.lastActionTime = Date.now();

    $("wo-now").textContent = `${S.ex.emoji} ${S.ex.name}`;
    $("wo-set").textContent = `Set 1/${S.setsTarget}`;
    $("rep-display").textContent = `0 / ${S.repsTarget}`;
    $("hold-display").textContent = "—";
    $("metric-label").textContent = S.ex.metric;
    $("hint-line").textContent = ""; $("feedback-line").textContent = "";
    renderSteps(S.ex, 0);

    // Show workout stage IMMEDIATELY
    S.phase = "workout";
    showScreen("workout");

    // Acquire webcam stream
    const ok = await startVision();
    if (ok) {
      const camToggleBtn = $("cam-toggle-btn");
      if (camToggleBtn) {
        camToggleBtn.textContent = "📷 Camera: ON";
        camToggleBtn.classList.remove("danger");
      }
    } else if (!isInitial) {
      S.phase = "config";
      showScreen("config");
      return;
    }

    // Run 4s countdown overlay directly over the live camera feed
    runStageCountdown("GET READY", 4, () => {
      S.lastActionTime = Date.now();
      speakStep(S.ex, 0);
      showGuidancePopup(4);
    });
  }

  $("btn-start").addEventListener("click", () => launchWorkout(false));

  if ($("cfg-btn")) {
    $("cfg-btn").addEventListener("click", () => {
      S.phase = "config";
      showScreen("config");
    });
  }

  $("pause-btn").addEventListener("click", pauseWorkout);
  $("resume-btn").addEventListener("click", resumeWorkout);
  $("modal-resume-btn").addEventListener("click", resumeWorkout);
  $("stop-btn").addEventListener("click", stopWorkout);
  $("modal-stop-btn").addEventListener("click", stopWorkout);

  // Dedicated Camera ON / OFF Toggle Button
  const camToggleBtn = $("cam-toggle-btn");
  if (camToggleBtn) {
    camToggleBtn.addEventListener("click", async () => {
      if (S.videoOn) {
        stopVision();
        camToggleBtn.textContent = "📷 Camera: OFF";
        camToggleBtn.classList.add("danger");
        showToast("📷 Camera paused to save CPU/battery", "info");
      } else {
        const ok = await startVision();
        if (ok) {
          camToggleBtn.textContent = "📷 Camera: ON";
          camToggleBtn.classList.remove("danger");
          showToast("📷 Camera resumed", "success");
        }
      }
    });
  }

  // Dynamic Mirror Mode Toggle
  const mirrorToggleBtn = $("mirror-toggle-btn");
  if (mirrorToggleBtn) {
    const isM = VisionLoader.isMirrored();
    mirrorToggleBtn.textContent = isM ? "🪞 Mirror: Natural" : "🪞 Mirror: Inverted";
    mirrorToggleBtn.addEventListener("click", () => {
      const next = !VisionLoader.isMirrored();
      VisionLoader.setMirrored(next);
      const v = $("video");
      if (v) v.style.transform = next ? "scaleX(-1)" : "scaleX(1)";
      mirrorToggleBtn.textContent = next ? "🪞 Mirror: Natural" : "🪞 Mirror: Inverted";
      showToast(next ? "🪞 Mirror: Natural (Left = Left)" : "🪞 Mirror: Inverted", "info");
    });
  }

  // Age Presets click binding
  document.querySelectorAll(".age-preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".age-preset-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const reps = btn.dataset.reps;
      const sets = btn.dataset.sets;
      const rest = btn.dataset.rest;
      if (reps) $("cfg-reps").value = reps;
      if (sets) $("cfg-sets").value = sets;
      if (rest) $("cfg-rest").value = rest;
      updateSummary();
    });
  });

  $("skip-rest").addEventListener("click", () => { S.phase = "workout"; showScreen("workout"); });
  $("skip-break").addEventListener("click", () => startNextExercise());
  $("again-btn").addEventListener("click", () => window.location.reload());

  // ---------- Logging -----------------------------------------------------
  async function logExercise(result) {
    try {
      const peakRom = S.metrics && S.metrics.elbowMax != null ? Math.round(S.metrics.elbowMax) : (S.metrics && S.metrics.wristPitch != null ? Math.round(Math.abs(S.metrics.wristPitch)) : 75);
      const devRom = S.metrics && S.metrics.dev != null ? Math.round(Math.abs(S.metrics.dev)) : (S.metrics && S.metrics.wristPitch != null ? Math.round(Math.abs(S.metrics.wristPitch)) : 0);
      const dispersion = S.metrics && S.metrics.spread != null ? parseFloat(S.metrics.spread.toFixed(3)) : 0.08;
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "THERAPY",
          condition: profile,
          duration_seconds: Math.max(1, result.elapsed),
          peak_rom: peakRom,
          smoothness_score: 92,
          cheats_blocked: S.cheat ? 1 : 0,
          score: result.reps,
          metrics_json: JSON.stringify({
            exercise: result.name,
            reps: result.reps,
            sets: result.sets,
            profile: profile,
            peak_elbow_rom_deg: peakRom,
            mean_wrist_deviation_deg: devRom,
            hand_dispersion_index: dispersion,
            trunk_cheat_events: S.cheat ? 1 : 0,
            repetitions_completed: result.reps,
            active_duration_seconds: result.elapsed,
          }),
        }),
      });
    } catch (e) { console.error("Telemetry error", e); }
  }

  function renderDone() {
    const totalReps = S.results.reduce((a, r) => a + r.reps, 0);
    const totalSec = Math.round(S.activeTimeMs / 1000);
    const list = S.results.map((r) => `<div class="done-row"><span>${r.emoji} ${r.name}</span><span>${r.reps} reps · ${r.sets} sets</span></div>`).join("");
    $("done-summary").innerHTML = `
      <div class="done-totals"><div><b>${S.results.length}</b><span>Exercises</span></div>
      <div><b>${totalReps}</b><span>Total reps</span></div>
      <div><b>${Math.max(1, Math.round(totalSec / 60))}m</b><span>Active Movement</span></div></div>
      ${list}`;
  }

  // ---------- Boot -------------------------------------------------------
  ["cfg-reps", "cfg-sets", "cfg-rest", "cfg-break"].forEach((id) => {
    $(id).addEventListener("input", updateSummary);
  });
  renderConfig();
  // Auto-launch workout so camera turns on immediately upon opening Exercise Drills
  launchWorkout(true);
});
