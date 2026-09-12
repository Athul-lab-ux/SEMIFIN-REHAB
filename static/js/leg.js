/**
 * RehabOpt AR — Leg Recovery Engine (Seated Knee Extension)
 * ------------------------------------------------------------------
 * Single-exercise routine: left leg set → transition → right leg set.
 * Knee flexion/extension tracked by C1 (Hip→Knee→Ankle), with a
 * muted inactive-side skeleton and a glowing active-side indicator.
 *
 * Rep counting is step-locked with a hold step:
 *   1. Bend knee (≤100°)  → hold to settle
 *   2. Extend leg out (≥160°) → hold to complete the rep
 *   3. Return (≤100°) → next rep starts
 *
 * A rep completes only when the full step chain finishes. The active
 * side drives live knee angle and glow; the inactive side skeleton is
 * muted. At the end we compute C6 symmetry = min(L,R) / max(L,R).
 *
 * Session type is recorded as "LEG" in telemetry so reports can tell
 * upper-limb from lower-limb sessions.
 */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);
  const screens = {
    config: $("screen-config"), stage: $("screen-stage"), transition: $("screen-transition"), done: $("screen-done"),
  };
  const toast = $("toast");

  function showToast(msg, type = "info") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 2800);
  }
  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name].classList.add("active");
    if (name === "stage") {
      setTimeout(() => {
        sizeOverlay();
        const v = $("video");
        if (v && v.paused) v.play().catch(() => {});
      }, 50);
    }
  }

  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  // ---------- Config -----------------------------------------------------
  const repsInput = $("cfg-reps"), tsecInput = $("cfg-trans");
  const repsEl = $("lg-reps");
  function updateSummary() {
    const reps = Math.max(1, parseInt(repsInput.value) || 10);
    repsEl.textContent = reps;
  }
  [repsInput, tsecInput].forEach((i) => i.addEventListener("input", updateSummary));
  updateSummary();

  // ---------- State -----------------------------------------------------
  const S = {
    phase: "config",
    repsTarget: 10, tsec: 8,
    side: "left",         // active side right now
    stage: "left",        // left | right  (which leg stage)
    rep: 0, step: 0, holdStart: 0, stuckAt: 0, hintOn: false,
    leftMax: null, rightMax: null,
    paused: false,
    leftCount: 0, rightCount: 0,
    tStart: 0, totalSec: 0,
    stepEnteredAt: 0,
  };

  // ---------- Metric computation -----------------------------------------
  function computeMetrics(res) {
    const M = { kneeMax: null, kneeMin: null, activeKnee: null, kneeDelta: 0 };
    // Active-side leg chain (hip → knee → ankle)
    if (res.legChain && res.legChain.hip && res.legChain.knee && res.legChain.ankle) {
      const a = res.legChain.hip, b = res.legChain.knee, c = res.legChain.ankle;
      const ang = Kinematics.calculateJointAngle(a, b, c);
      M.activeKnee = ang;
      M.kneeDelta = ang - (S.lastKnee ?? ang);
      S.lastKnee = ang;
      if (ang == null || !isFinite(ang)) { M.activeKnee = null; return M; }
      M.kneeMax = Math.max(M.kneeMax ?? -Infinity, ang);
      M.kneeMin = M.kneeMin == null ? ang : Math.min(M.kneeMin, ang);
    } else {
      S.lastKnee = null;
    }
    return M;
  }

  // ---------- Step engine (knee goniometry) ----------------------------
  //              Knee angle (C1)
  //  Stretched 160°     ─────────
  //  Start / rest  ≤100°
  //
  //  Steps:
  //   0. Bend (≤100°)     – settle to start
  //   1. Extend (≥160°)   – hold to complete the rep
  //   2. Return (≤100°)   – finish rep, go to next
  function renderStages(side) {
    $("stage-left").classList.toggle("live", side === "left" && S.phase === "stage");
    $("stage-left").classList.toggle("done", S.stage === "right" && S.phase === "stage");
    $("stage-right").classList.toggle("live", side === "right" && S.phase === "stage");
    $("stage-right").classList.toggle("done", S.stage === "left" && S.phase === "stage");
    $("stage-name").textContent = `${emojiFor(side)} ${side === "left" ? "Left Leg" : "Right Leg"}`;
    $("side-badge").textContent = side === "left" ? "⬅️ Left Leg" : "➡️ Right Leg";
    $("ab-val").textContent = side === "left" ? "⬅️ Left" : "➡️ Right";
    $("ab-val").style.color = side === "left" ? "#fff" : "#fff";
  }

  function emojiFor(side) {
    return side === "left" ? "⬅️" : "➡️";
  }

  const stepBoxes = $("step-boxes");

  // Dynamically render 3 step boxes (Bend / Extend & hold / Return)
  function renderStepBoxes(activeIdx) {
    $("step-boxes").innerHTML = "";
    const labels = [
      "Bend knee back to start",
      "Extend leg long out",
      "Return to start",
    ];
    // Only extend step has a hold
    const holds = [0, 1, 0];
    for (let i = 0; i < 3; i++) {
      const d = document.createElement("div");
      d.className = "step-box" + (i < activeIdx ? " done" : i === activeIdx ? " active" : "");
      d.innerHTML = `
        <span class="sb-num">${i + 1}</span>
        <span class="sb-txt">${labels[i]}</span>
        ${holds[i] ? `<span class="sb-hold">⏱ hold</span>` : ""}
      `;
      stepBoxes.appendChild(d);
    }
  }

  function showStepHint(side) {
    if (!S.step) {
      $("feedback-line").textContent = "Start by bending your knee back down.";
      if (window.RehabBio) window.RehabBio.speak("Bend your knee back down.");
      return;
    }
    if (S.step === 1) {
      $("feedback-line").textContent = "Extend your leg outward until the knee is almost straight.";
      if (window.RehabBio) window.RehabBio.speak("Extend your leg out.");
    } else {
      $("feedback-line").textContent = "Bring your leg back to the start.";
      if (window.RehabBio) window.RehabBio.speak("Return your leg to the start.");
    }
  }

  function renderRepDisplay(side) {
    const which = side === "left" ? S.leftCount : S.rightCount;
    const total = S.repsTarget;
    $("rep-display").textContent = `${which} / ${total}`;
    $("metric-label").textContent = "KNEE °";
  }

  // ---------- Guidance Popup System (4s Initial + 10s Inactivity) --------
  let legGuidanceTimer = null;
  let legGuidanceInterval = null;
  let legGuidanceShowing = false;
  let lastLegActionTime = Date.now();

  function showLegGuidancePopup(durationSec = 4) {
    const popup = $("leg-guidance-popup");
    if (!popup || S.phase !== "stage" || S.paused) return;

    legGuidanceShowing = true;
    popup.classList.add("show");
    if (window.RehabBio) {
      window.RehabBio.speak(`Leg recovery routine. Step 1: Bend knee to 105 degrees. Step 2: Extend leg forward to 135 degrees and hold.`);
    }

    if (legGuidanceTimer) clearTimeout(legGuidanceTimer);
    if (legGuidanceInterval) clearInterval(legGuidanceInterval);

    const startTime = Date.now();
    const totalMs = durationSec * 1000;
    const timerFill = $("lgp-timer-fill");
    const timerText = $("lgp-timer-text");

    legGuidanceInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, (totalMs - elapsed) / 1000);
      const pct = Math.max(0, Math.min(100, ((totalMs - elapsed) / totalMs) * 100));
      if (timerFill) timerFill.style.width = `${pct}%`;
      if (timerText) timerText.textContent = `Closing in ${Math.ceil(remaining)}s...`;

      if (elapsed >= totalMs) {
        hideLegGuidancePopup();
      }
    }, 50);
  }

  function hideLegGuidancePopup() {
    const popup = $("leg-guidance-popup");
    if (popup) popup.classList.remove("show");
    if (legGuidanceTimer) clearTimeout(legGuidanceTimer);
    if (legGuidanceInterval) clearInterval(legGuidanceInterval);
    legGuidanceTimer = null;
    legGuidanceInterval = null;
    legGuidanceShowing = false;
    lastLegActionTime = Date.now();
  }

  const lgpDismiss = $("lgp-dismiss");
  if (lgpDismiss) {
    lgpDismiss.addEventListener("click", hideLegGuidancePopup);
  }

  // ---------- Stage flow ------------------------------------------------
  function startStage(side) {
    S.side = side;
    S.stage = side;
    S.rep = 0;
    S.step = 0;
    S.holdStart = 0;
    S.lastKnee = null;
    S.stuckAt = 0;
    S.hintOn = false;
    lastLegActionTime = Date.now();
    renderStepBoxes(0);
    renderRepDisplay(side);
    $("metric-value").textContent = "—";
    $("hold-display").textContent = "—";
    $("feedback-line").textContent = "";
    showStepHint(side);
    if (S.phase === "stage") showStages(true);
    renderStages(side);
    showLegGuidancePopup(4);
    if (window.RehabBio) window.RehabBio.speak(`${side === "left" ? "Left leg" : "Right leg"}: bend your knee to start.`);
  }

  function finishRep(side) {
    const which = side === "left" ? (S.leftCount += 1) : (S.rightCount += 1);
    lastLegActionTime = Date.now();
    renderRepDisplay(side);
    $("feedback-line").textContent = `${emojiFor(side)} Rep ${which}/${S.repsTarget} ✅`;
    $("hold-display").textContent = "0.0s";
    if (window.RehabBio) window.RehabBio.playBeep(880, 0.06, 0.3);

    // CRITICAL: Progress to transition or finish session when target reached!
    if (which >= S.repsTarget) {
      if (window.RehabBio) window.RehabBio.speak(`${side === "left" ? "Left" : "Right"} leg set complete!`);
      finishSide(side);
      return;
    }

    if (which % 5 === 0 && window.RehabBio) {
      window.RehabBio.speak(`Rep ${which} complete. ${S.repsTarget - which} remaining.`);
    }
    S.step = 0;
    S.holdStart = 0;
    renderStepBoxes(0);
    showStepHint(side);
  }

  function finishSide(side) {
    if (side === "left") {
      S.leftMax = S.leftMax ?? 0;
      showToast("✅ Left leg set complete", "success");
      if (window.RehabBio) window.RehabBio.playSetChime();
      startTransition();
    } else {
      S.rightMax = S.rightMax ?? 0;
      finishSession();
    }
  }

  // ---------- Transition -------------------------------------------------
  function startTransition() {
    S.phase = "transition";
    S.tsec = Math.max(2, parseInt(tsecInput.value) || 8);
    S.tStart = Date.now();
    $("transition-counter").textContent = S.tsec;
    $("transition-fill").style.width = "0%";
    $("transition-hint").textContent = "Rest your leg and get ready for the right side.";
    showScreen("transition");
    if (window.RehabBio) window.RehabBio.speak("Left leg complete. Get ready for the right leg.");
  }

  const tickT = setInterval(() => {
    if (S.phase === "transition") {
      const now = Date.now();
      const remaining = Math.max(0, S.tsec - (now - S.tStart) / 1000);
      $("transition-counter").textContent = Math.ceil(remaining);
      $("transition-fill").style.width = `${(1 - remaining / S.tsec) * 100}%`;
      if (remaining <= 0) {
        clearInterval(tickT);
        startStage("right");
      }
    }
  }, 100);

  // ---------- Finish -----------------------------------------------------
  function finishSession() {
    showScreen("done");
    const L = Math.round(S.leftMax ?? 0);
    const R = Math.round(S.rightMax ?? 0);
    $("kg-left").textContent = `${L}°`;
    $("kg-right").textContent = `${R}°`;

    const bigger = Math.max(L, R);
    let sym = 0;
    if (bigger > 0) sym = Math.round((Math.min(L, R) / bigger) * 100);
    $("kg-sym").textContent = `${sym}%`;
    let interp = "";
    if (L === 0 && R === 0) {
      interp = "No knee extension was detected during this session — check the camera setup and try again.";
    } else if (Math.abs(L - R) <= 20) {
      interp = `${L}° left and ${R}° right. Your legs moved within 20° of each other — a good symmetry range to build on.`;
    } else if (L > R) {
      interp = `Left knee reached ${L}° and right knee reached ${R}°. You have more range on the left side right now — the right side is the one to work on.`;
    } else {
      interp = `Left knee reached ${L}° and right knee reached ${R}°. You have more range on the right side right now — the left side is the one to work on.`;
    }
    $("kg-interp").textContent = interp;

    // Log telemetry
    if (window.RehabBio) window.RehabBio.stopRomTone();

    (async () => {
      try {
        await fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_type: "LEG",
            condition: localStorage.getItem("selectedCondition") || "Lower-Limb",
            duration_seconds: S.totalSec || 1,
            peak_rom: Math.round(Math.max(S.leftMax ?? 0, S.rightMax ?? 0)),
            smoothness_score: 0,
            cheats_blocked: 0,
            score: S.leftCount + S.rightCount,
            metrics_json: JSON.stringify({
              left_max_deg: S.leftMax ?? 0,
              right_max_deg: S.rightMax ?? 0,
              c6_sym: sym,
              total_reps: S.leftCount + S.rightCount,
            }),
          }),
        });
      } catch (e) { console.error("Telemetry error", e); }
    })();
  }

  // ---------- Main loop --------------------------------------------------
  let lastT = 0;
  function onStageFrame(res) {
    if (S.phase !== "stage") return;
    if (S.paused) {
      // While paused, still draw the latest skeleton (so video feed
      // continues visually) but do not advance rep logic.
      drawStage(res);
      $("timer-display").textContent = fmt(S.totalSec);
      return;
    }
    const M = computeMetrics(res);
    $("metric-value").textContent = M.activeKnee == null ? "—" : `${Math.round(M.activeKnee)}°`;
    $("timer-display").textContent = fmt(Date.now() - lastT + S.totalSec);

    const side = S.side;
    const step = S.step;

    // Step 0: idle/bend → set up
    if (step === 0) {
      if (M.activeKnee != null && M.activeKnee <= 105) {
        S.step = 1;
        S.holdStart = 0;
        lastLegActionTime = Date.now();
        renderStepBoxes(1);
        showStepHint(side);
        if (window.RehabBio) window.RehabBio.speak("Ready to extend.");
        return;
      }
      if (M.activeKnee != null && M.activeKnee > 120 && !S.hintOn) {
        S.hintOn = true;
        $("hint-line").textContent = "💡 Bend your knee back down to start.";
      } else if (M.activeKnee == null) {
        S.hintOn = false;
      }
      // Re-trigger 4s guidance popup if patient is inactive for 10s
      if (!legGuidanceShowing && (Date.now() - lastLegActionTime >= 10000)) {
        showLegGuidancePopup(4);
        lastLegActionTime = Date.now();
      }
      return;
    }

    // Step 1: extend hold (calibrated to >= 135° for stroke recovery)
    if (step === 1) {
      if (M.activeKnee != null && M.activeKnee >= 135) {
        lastLegActionTime = Date.now();
        S.holdStart = S.holdStart || Date.now();
        const held = (Date.now() - S.holdStart) / 1000;
        $("hold-display").textContent = `${Math.max(0, 1 - held).toFixed(1)}s`;
        if (held >= 1.0) {
          S.step = 2;
          S.holdStart = 0;
          renderStepBoxes(2);
          if (window.RehabBio) window.RehabBio.speak("Hold complete — bring your leg back.");
          return;
        }
        S.stuckAt = 0;
        return;
      }
      S.holdStart = 0;
      if (M.activeKnee == null) { S.hintOn = false; return; }
      if (!S.hintOn) {
        S.hintOn = true;
        $("hint-line").textContent = "💡 Extend your leg out forward.";
      }
      // Re-trigger 4s guidance popup if patient is inactive for 10s
      if (!legGuidanceShowing && (Date.now() - lastLegActionTime >= 10000)) {
        showLegGuidancePopup(4);
        lastLegActionTime = Date.now();
      }
      return;
    }

    // Step 2: return
    if (step === 2) {
      if (M.activeKnee != null && M.activeKnee <= 105) {
        finishRep(side);
      } else {
        if (M.activeKnee == null) { S.hintOn = false; return; }
        if (!S.hintOn) {
          S.hintOn = true;
          $("hint-line").textContent = "💡 Bring your leg back to the start.";
        }
        // Re-trigger 4s guidance popup if patient is inactive for 10s
        if (!legGuidanceShowing && (Date.now() - lastLegActionTime >= 10000)) {
          showLegGuidancePopup(4);
          lastLegActionTime = Date.now();
        }
      }
    }
  }

  // ---------- Stage skeleton overlay (active leg) -----------------------
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

  function drawStage(res) {
    const W = overlayCanvas.width, H = overlayCanvas.height;
    oCtx.clearRect(0, 0, W, H);
    // Inactive-side skeleton (muted)
    const offSide = S.side === "left" ? "right" : "left";
    const off = res.legs && res.legs[offSide];
    if (off && off.hip && off.knee && off.ankle) {
      drawLegChain(off.hip, off.knee, off.ankle, W, H, "rgba(148,163,184,0.28)");
    }
    // Active-side skeleton
    const on = res.legs && res.legs[S.side];
    if (on && on.hip && on.knee && on.ankle) {
      // One combined path for the active-side bones — fewer canvas state
      // changes than drawing each bone separately.
      oCtx.beginPath();
      oCtx.strokeStyle = "rgba(255,106,0,0.95)";
      oCtx.lineWidth = 5;
      oCtx.lineCap = "round";
      oCtx.moveTo(on.hip.x * W, on.hip.y * H);
      oCtx.lineTo(on.knee.x * W, on.knee.y * H);
      oCtx.lineTo(on.ankle.x * W, on.ankle.y * H);
      oCtx.stroke();
      // Knee marker (the only large filled joint we draw every frame)
      oCtx.beginPath();
      oCtx.fillStyle = "#FF6A00";
      oCtx.arc(on.knee.x * W, on.knee.y * H, 8, 0, Math.PI * 2);
      oCtx.fill();
      oCtx.strokeStyle = "rgba(255,255,255,0.95)";
      oCtx.lineWidth = 2.5;
      oCtx.stroke();
    }
  }

  function drawLegChain(hip, knee, ankle, w, h, color) {
    oCtx.lineCap = "round";
    oCtx.strokeStyle = color;
    oCtx.lineWidth = 5;
    oCtx.beginPath();
    oCtx.moveTo(hip.x * w, hip.y * h);
    oCtx.lineTo(knee.x * w, knee.y * h);
    oCtx.lineTo(ankle.x * w, ankle.y * h);
    oCtx.stroke();
    [[hip, "rgba(100,116,139,0.9)"], [knee, color], [ankle, color]].forEach(([p, col]) => {
      oCtx.beginPath();
      oCtx.arc(p.x * w, p.y * h, 6, 0, Math.PI * 2);
      oCtx.fillStyle = col;
      oCtx.fill();
      oCtx.strokeStyle = "rgba(255,255,255,0.85)";
      oCtx.lineWidth = 1.5;
      oCtx.stroke();
    });
  }

  function onFrame(res) {
    if (S.phase === "stage") {
      onStageFrame(res);
      drawStage(res);
    } else {
      oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
  }

  // ---------- Vision -----------------------------------------------------
  async function startVision() {
    // PaUSE-then-resume is not fully reliable across all browsers when the
    // pipeline is destroyed; a short pause always works by just locking the
    // stage loop instead. We keep VisionLoader alive in the background so the
    // stream keeps running continuously.
    
    if (S.videoOn) return true;
    if (window.RehabQA) {
      const report = window.RehabQA.runStressTest(window.RehabQA.STRESS_TARGET);
      if (!report.passed) console.warn("[QA] Stress test issues:", report.failures.slice(0, 3));
    }
    const ok = await VisionLoader.start($("video"), onFrame);
    if (ok) { S.videoOn = true; VisionLoader.watch(); }
    else showToast("❌ Camera unavailable — leg session needs webcam", "error");
    return ok;
  }
  function stopVision() {
    if (S.videoOn) { VisionLoader.stop(); S.videoOn = false; }
  }

  // ---------- Start / controls ------------------------------------------
  let legCountdownTimer = null;
  function runLegCountdown(label, seconds, onComplete) {
    const overlay = $("leg-countdown-overlay");
    const numEl = $("leg-tco-num");
    const labEl = $("leg-tco-label");
    if (!overlay || !numEl) {
      if (onComplete) onComplete();
      return;
    }
    if (legCountdownTimer) clearInterval(legCountdownTimer);
    let remaining = seconds;
    labEl.textContent = label;
    numEl.textContent = remaining;
    overlay.classList.add("show");
    if (window.RehabBio) window.RehabBio.speak(`${label}. ${remaining}`);

    legCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        numEl.textContent = remaining;
        if (window.RehabBio) window.RehabBio.speak(`${remaining}`);
      } else {
        clearInterval(legCountdownTimer);
        legCountdownTimer = null;
        numEl.textContent = "GO!";
        if (window.RehabBio) window.RehabBio.speak("Go!");
        setTimeout(() => {
          overlay.classList.remove("show");
          if (onComplete) onComplete();
        }, 500);
      }
    }, 1000);
  }

  function pauseLeg() {
    if (S.phase !== "stage" || S.paused) return;
    S.paused = true;
    S.pauseStart = Date.now();
    hideLegGuidancePopup();
    $("lg-pause").style.display = "none";
    $("lg-resume").style.display = "inline-flex";
    $("leg-paused-overlay").classList.add("show");
    if (window.RehabBio) {
      window.RehabBio.stopRomTone();
      window.RehabBio.speak("Leg routine paused");
    }
  }

  function resumeLeg() {
    $("leg-paused-overlay").classList.remove("show");
    runLegCountdown("RESUMING IN", 4, () => {
      S.paused = false;
      S.pauseStart = 0;
      lastLegActionTime = Date.now();
      $("lg-resume").style.display = "none";
      $("lg-pause").style.display = "inline-flex";
    });
  }

  function stopLeg() {
    hideLegGuidancePopup();
    stopVision();
    if (window.RehabBio) window.RehabBio.stopRomTone();
    $("leg-paused-overlay").classList.remove("show");
    $("leg-countdown-overlay").classList.remove("show");
    finishSession();
  }

  $("btn-start").addEventListener("click", async () => {
    S.repsTarget = Math.max(1, parseInt(repsInput.value) || 10);
    S.tsec = Math.max(2, parseInt(tsecInput.value) || 8);
    S.leftMax = null; S.rightMax = null;
    S.leftCount = 0; S.rightCount = 0;
    S.totalSec = 0;
    $("rep-display").textContent = `0 / ${S.repsTarget}`;
    $("timer-display").textContent = "00:00";
    $("feedback-line").textContent = "";
    $("hint-line").textContent = "";
    $("hold-display").textContent = "—";
    $("metric-value").textContent = "—";
    S.phase = "stage";
    showScreen("stage");
    startStage("left");
    if (!await startVision()) {
      S.phase = "config"; showScreen("config"); return;
    }
    lastT = Date.now();
    S.paused = true;
    runLegCountdown("GET READY", 4, () => {
      S.paused = false;
      lastT = Date.now();
    });
  });

  $("lg-pause").addEventListener("click", pauseLeg);
  $("lg-resume").addEventListener("click", resumeLeg);
  $("modal-leg-resume").addEventListener("click", resumeLeg);
  $("lg-quit").addEventListener("click", stopLeg);
  $("modal-leg-stop").addEventListener("click", stopLeg);
  $("lg-again").addEventListener("click", () => window.location.reload());

  // ---------- Tick loop (timers) -----------------------------------------
  setInterval(() => {
    if (S.phase === "stage" && !S.paused) {
      S.totalSec = (Date.now() - lastT) / 1000;
    } else if (S.phase === "stage" && S.paused && S.pauseStart) {
      // While paused, freeze totalSec exactly as it was at pause time.
      const froze = (S.pauseStart - lastT) / 1000;
      S.totalSec = Math.max(0, S.totalSec - froze + (Date.now() - S.pauseStart) / 1000);
    }
  }, 250);
});
