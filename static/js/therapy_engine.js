/**
 * RehabOpt AR — Guided Therapy Engine (Wave 3)
 * ------------------------------------------------------------------
 * Patient flow: pick stroke profile → pick exercises → set reps/sets/
 * rest-between-sets/break-between-exercises → step-locked guided reps.
 *
 * Detection model: every exercise is a chain of numbered steps; a step
 * with a hold time must be held; a rep completes when the final step
 * finishes; a set completes at reps_target; rest follows between sets,
 * a break between exercises. Trunk tilt > 10° (E1) freezes progress.
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
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 2800);
  }

  function showScreen(name) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[name === "break" ? "break_" : name].classList.add("active");
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

  // ---------- Single-arm skeleton overlay ----------------------------------
  // Only the loader's ONE tracking chain (arm matched to the one detected
  // hand) is drawn — never a second skeleton — on top of the mirrored video.
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

  function drawOverlay(res) {
    try {
      const W = overlayCanvas.width, H = overlayCanvas.height;
      oCtx.clearRect(0, 0, W, H);
      if (!res) return;

      const X = (p) => p.x * W, Y = (p) => p.y * H;
      oCtx.lineCap = "round";
      oCtx.lineJoin = "round";

      // 1. Arm skeleton (Shoulder -> Elbow -> Wrist)
      const c = res.chain || (res.pose && (
        (res.pose[12] && res.pose[14] && res.pose[16] && { sh: res.pose[12], el: res.pose[14], wr: res.pose[16] }) ||
        (res.pose[11] && res.pose[13] && res.pose[15] && { sh: res.pose[11], el: res.pose[13], wr: res.pose[15] })
      ));

      if (c && c.sh && c.el && c.wr && (c.sh.x !== 0 || c.sh.y !== 0)) {
        oCtx.strokeStyle = "rgba(56, 189, 248, 0.9)";
        oCtx.lineWidth = 4.5;
        oCtx.beginPath();
        oCtx.moveTo(X(c.sh), Y(c.sh));
        oCtx.lineTo(X(c.el), Y(c.el));
        oCtx.lineTo(X(c.wr), Y(c.wr));
        oCtx.stroke();

        [[c.sh, "rgba(100, 116, 139, 0.9)"], [c.el, "#10B981"], [c.wr, "#38BDF8"]].forEach(([p, col]) => {
          oCtx.beginPath();
          oCtx.arc(X(p), Y(p), 6.5, 0, Math.PI * 2);
          oCtx.fillStyle = col;
          oCtx.fill();
          oCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
          oCtx.lineWidth = 2;
          oCtx.stroke();
        });
      }

      // 2. Full 21 Hand Landmarks & Connecting Bones
      if (res.hand && res.hand[0]) {
        // Draw hand bones
        oCtx.strokeStyle = "rgba(16, 185, 129, 0.85)";
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

        // Draw 21 hand joint nodes
        for (let i = 0; i < 21; i++) {
          const p = res.hand[i];
          if (!p) continue;
          const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
          const radius = i === 8 ? 6 : isTip ? 4.5 : 3.5;
          oCtx.beginPath();
          oCtx.arc(X(p), Y(p), radius, 0, Math.PI * 2);
          oCtx.fillStyle = i === 8 ? "#38BDF8" : isTip ? "#34D399" : "#FFFFFF";
          oCtx.fill();
          oCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
          oCtx.lineWidth = 1;
          oCtx.stroke();
        }

        // Index fingertip targeting halo
        if (res.hand[8]) {
          oCtx.beginPath();
          oCtx.arc(X(res.hand[8]), Y(res.hand[8]), 14, 0, Math.PI * 2);
          oCtx.strokeStyle = "rgba(56, 189, 248, 0.9)";
          oCtx.lineWidth = 2.5;
          oCtx.stroke();
        }
      }
    } catch (err) {
      console.warn("[Therapy] drawOverlay error caught defensively:", err);
    }
  }

  // ---------- Config UI -------------------------------------------------
  const profilePills = $("profile-pills");
  const exGrid = $("ex-grid");
  const profileNote = $("profile-note");
  let profile = localStorage.getItem("selectedCondition") || "Hemiparesis";
  let selected = new Set();

  const PROFILE_NOTES = {
    Hemiparesis: "Rebuild active range of motion and reach strength with trunk-compensation blocking.",
    "Flexor Spasticity": "Slow, controlled opening and unfurling to quiet velocity-dependent tightness.",
    "Motor Ataxia": "Zone-based precision drills to reduce overshoot and trajectory wandering.",
    "Intention Tremor": "Endpoint stabilisation and steady hovering to retrain terminal motor control.",
    "Motor Apraxia": "Sequenced multi-stage drills that rebuild motor memory step by step.",
    "Wrist Drop": "Active wrist cock-up and sweeps to retrain radial-nerve extension.",
  };

  // profile pills
  window.StrokeProfiles.forEach((p) => {
    const b = document.createElement("button");
    b.className = "profile-pill";
    b.innerHTML = `${p.emoji}<span>${p.label}</span>`;
    b.addEventListener("click", () => { profile = p.key; renderConfig(); });
    profilePills.appendChild(b);
  });

  function exerciseCard(ex) {
    // <label> semantics toggle the checkbox on any card click
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
    // Keep selections that belong to the new profile, else preselect first 3
    selected = new Set([...selected].filter((k) => EXERCISES.some((e) => e.key === k && e.profile === profile)));
    if (!selected.size) EXERCISES_BY_PROFILE[profile].slice(0, 3).forEach((e) => selected.add(e.key));
    exGrid.innerHTML = "";
    EXERCISES_BY_PROFILE[profile].forEach((ex) => exGrid.appendChild(exerciseCard(ex)));
    updateSummary();
  }

  function syncChecks() {
    exGrid.querySelectorAll(".ex-card").forEach((card, i) => {
      const cb = card.querySelector("input");
      cb.value = EXERCISES_BY_PROFILE[profile][i].key;
      cb.checked = selected.has(cb.value);
      card.classList.toggle("picked", cb.checked);
    });
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

  // ---------- Session state ----------------------------------------------
  const S = {
    phase: "config", queue: [], qi: 0, ex: null,
    set: 1, rep: 0, step: 0, holdStart: 0,
    repsTarget: 10, setsTarget: 3, restSec: 35, breakSec: 60,
    paused: false, cheat: false, stuckAt: 0, stepEnteredAt: 0,
    timerStart: 0, setStart: 0, exStart: 0, activeTimeMs: 0,
    results: [], // per finished exercise
    videoOn: false, lastTip: null, lastT: 0, speed: 0, metrics: null,
    hintOn: false, secTick: 0,
    lastActionTime: Date.now(), guidanceShowing: false,
  };

  // ---------- 4s Guidance Popup System (Initial + 10s Inactivity) --------
  let guidanceTimer = null;
  let guidanceInterval = null;

  function showGuidancePopup(durationSec = 4) {
    const popup = $("therapy-guidance-popup");
    if (!popup || !S.ex) return;
    if (S.paused || S.phase !== "workout") return;

    S.guidanceShowing = true;
    $("tgp-title").textContent = `${S.ex.emoji} ${S.ex.name}`;
    $("tgp-what").textContent = S.ex.hint || `Follow each numbered step in sequence to complete each rep.`;

    const stepsEl = $("tgp-steps");
    stepsEl.innerHTML = S.ex.steps.map((st, i) => `
      <div style="display:flex; align-items:center; gap:8px; margin:4px 0; font-size:12.5px; color:#E2E8F0;">
        <span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:var(--clin-orange); color:#fff; font-size:11.5px; font-weight:800; flex-shrink:0;">${i+1}</span>
        <span><b>${st.label}</b> ${st.hold ? `<em style="color:#FDBA74; font-style:normal; font-weight:700;">(hold ${st.hold}s)</em>` : ""}</span>
      </div>
    `).join("");

    popup.classList.add("show");

    if (window.RehabBio) {
      window.RehabBio.speak(`${S.ex.name}. Step 1: ${S.ex.steps[0].label}`);
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
    S.lastActionTime = Date.now(); // reset clock after dismissal
  }

  const dismissBtn = $("tgp-dismiss");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", hideGuidancePopup);
  }

  // ---------- Metrics per frame ------------------------------------------
  function computeMetrics(res) {
    const M = { elbowMax: null, elbowMin: null, elevMax: null, reach: 0, tilt: 0,
                spread: null, pinch: null, fan: null, dev: null, tipX: null, tipY: null,
                speed: 0 };
    if (!res) return M;
    try {
      // Pose arm metrics (either arm may drive the drill)
      if (res.pose) {
        const arms = [
          { sh: res.pose[11], el: res.pose[13], wr: res.pose[15] },
          { sh: res.pose[12], el: res.pose[14], wr: res.pose[16] },
        ];
        const elbows = [], elevs = [];
        arms.forEach((a) => {
          if (a.sh && a.el && a.wr && (a.sh.x !== 0 || a.sh.y !== 0)) {
            try {
              if (window.Kinematics && typeof Kinematics.calculateJointAngle === "function") {
                elbows.push(Kinematics.calculateJointAngle(a.sh, a.el, a.wr));
              }
              const dx = Math.abs(a.el.x - a.sh.x), dy = Math.abs(a.el.y - a.sh.y);
              elevs.push((Math.atan2(dx, dy) * 180) / Math.PI);
              M.reach = Math.max(M.reach, Math.abs(a.wr.x - a.sh.x));
            } catch (e) {}
          }
        });
        if (elbows.length) { M.elbowMax = Math.max(...elbows); M.elbowMin = Math.min(...elbows); }
        if (elevs.length) M.elevMax = Math.max(...elevs);
        if (res.pose[11] && res.pose[12] && window.Kinematics && typeof Kinematics.calculateTrunkTilt === "function") {
          try {
            M.tilt = Kinematics.calculateTrunkTilt(res.pose[11], res.pose[12]).tiltDegrees || 0;
          } catch (e) {}
        }
      }
      // Hand metrics
      if (res.hand && res.hand.length >= 21) {
        const pts = [];
        for (let i = 0; i < 21; i++) pts.push(res.hand[i] || { x: 0, y: 0 });
        M.spread = handVariance(pts);
        M.pinch = res.hand[4] && res.hand[8]
          ? Math.sqrt((res.hand[4].x - res.hand[8].x) ** 2 + (res.hand[4].y - res.hand[8].y) ** 2) : null;
        M.fan = res.hand[8] && res.hand[20]
          ? Math.sqrt((res.hand[8].x - res.hand[20].x) ** 2 + (res.hand[8].y - res.hand[20].y) ** 2) : null;
        if (res.hand[5] && res.hand[0] && res.hand[12] && window.Kinematics && typeof Kinematics.calculateWristDeviation === "function") {
          try {
            M.dev = Kinematics.calculateWristDeviation(
              { x: res.hand[5].x, y: res.hand[5].y },
              { x: res.hand[0].x, y: res.hand[0].y },
              { x: res.hand[12].x, y: res.hand[12].y }
            );
          } catch (e) {}
        }
        const tip = res.hand[8];
        if (tip) {
          M.tipX = tip.x; M.tipY = tip.y;
          const now = Date.now(), dt = (now - S.lastT) / 1000;
          if (S.lastTip && dt > 0) {
            S.speed = Math.sqrt((tip.x - S.lastTip.x) ** 2 + (tip.y - S.lastTip.y) ** 2) / dt;
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

  function handVariance(pts) {
    let cx = 0, cy = 0, n = 0;
    for (const p of pts) { if (p) { cx += p.x; cy += p.y; n++; } }
    if (n < 5) return 1;
    cx /= n; cy /= n;
    let s = 0;
    for (const p of pts) { if (p) s += (p.x - cx) ** 2 + (p.y - cy) ** 2; }
    return Math.sqrt(s / n);
  }

  // ---------- Metric readout ---------------------------------------------
  function metricReadout(ex, M) {
    switch (ex.metric) {
      case "ELBOW °": return M.elbowMax != null ? `${Math.round(M.elbowMax)}°` : "—";
      case "ELEV °": return M.elevMax != null ? `${Math.round(M.elevMax)}°` : "—";
      case "REACH": return M.reach != null ? `${Math.round(M.reach * 100)}%` : "—";
      case "BOTH ELBOW": return M.elbowMin != null ? `${Math.round(M.elbowMin)}°` : "—";
      case "PALM": case "CYCLE": return M.spread != null ? (M.spread > 0.10 ? "OPEN 🖐️" : "fist ✊") : "—";
      case "FAN": return M.fan != null ? `${Math.round(M.fan * 100)}` : "—";
      case "DEV °": return M.dev != null ? `${Math.round(M.dev)}°` : "—";
      case "PINCH": return M.pinch != null ? `${Math.round(M.pinch * 100)}` : "—";
      default: return M.tipY != null ? `x ${Math.round(M.tipX * 100)} · y ${Math.round(M.tipY * 100)}` : "—";
    }
  }

  // ---------- Step engine -------------------------------------------------
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
      const ok = step.test(M);
      const now = Date.now();
      if (M.speed > 0.04 || ok) S.lastActionTime = now;

      if (ok) {
        // Pitch-tone sonification for elbow ROM drills
        if (window.RehabBio) {
          if (S.ex.metric && S.ex.metric.indexOf("ELBOW") === 0 && M.elbowMax != null) {
            window.RehabBio.setRomTone(M.elbowMax, { minAngle: 30, maxAngle: 150 });
          } else if (S.ex.metric === "DEV °" && M.dev != null) {
            window.RehabBio.setRomTone(Math.abs(M.dev), { minAngle: 0, maxAngle: 25, minHz: 220, maxHz: 700 });
          } else {
            window.RehabBio.stopRomTone();
          }
        }
        if (step.hold > 0) {
          if (!S.holdStart) S.holdStart = now;
          const held = (now - S.holdStart) / 1000;
          $("hold-display").textContent = `${Math.max(0, step.hold - held).toFixed(1)}s`;
          if (held < step.hold) { S.hintOn = false; return; }
        }
        // Step complete
        S.holdStart = 0;
        S.step++;
        S.hintOn = false;
        S.lastActionTime = now;
        const line = $("feedback-line");
        if (window.RehabBio) window.RehabBio.playBeep(880, 0.06, 0.3);
        if (S.step >= S.ex.steps.length) completeRep();
        else {
          speakStep(S.ex, S.step);
          renderSteps(S.ex, S.step);
          line.textContent = "";
        }
      } else {
        // Not achieved yet
        if (window.RehabBio) window.RehabBio.stopRomTone();
        S.holdStart = 0;
        if (!S.stuckAt) S.stuckAt = now;
        if (now - S.stuckAt > 2200 && !S.hintOn) {
          S.hintOn = true;
          $("hint-line").textContent = `💡 Try: ${step.label}`;
          if (window.RehabBio) window.RehabBio.speak(`Try: ${step.label}`);
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
    S.lastActionTime = Date.now();
    renderSteps(S.ex, 0);
    $("rep-display").textContent = `${S.rep} / ${S.repsTarget}`;
    $("hint-line").textContent = "";
    $("feedback-line").textContent = "";
    const praise = ["Nice!", "Great form!", "Keep going!", "Excellent!", "Beautiful rep!"];
    $("feedback-line").textContent = `${praise[(S.rep - 1) % praise.length]} Rep ${S.rep}/${S.repsTarget} ✅`;
    if (window.RehabBio) window.RehabBio.playRepChime();
    if (S.rep === 5 || S.rep === S.repsTarget) {
      if (window.RehabBio) window.RehabBio.speak(`Repetition ${S.rep} complete. ${Math.max(0, S.repsTarget - S.rep)} remaining.`);
    }
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

  // ---------- Set / exercise / program flow --------------------------------
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
    S.exStart = Date.now();
    S.lastActionTime = Date.now();
    $("wo-now").textContent = `${S.ex.emoji} ${S.ex.name}`;
    $("wo-set").textContent = `Set 1/${S.setsTarget}`;
    $("rep-display").textContent = `0 / ${S.repsTarget}`;
    $("metric-label").textContent = S.ex.metric;
    $("hint-line").textContent = ""; $("feedback-line").textContent = "";
    renderSteps(S.ex, 0);
    S.phase = "workout";
    showScreen("workout");
    speakStep(S.ex, 0);
    showGuidancePopup(4);
  }

  // ---------- Countdowns (warm-up / rest / break) -------------------------
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

      // Re-trigger 4s guidance popup if patient is inactive for 10s
      if (!S.guidanceShowing && (Date.now() - S.lastActionTime >= 10000)) {
        showGuidancePopup(4);
        S.lastActionTime = Date.now();
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
      if (S.phase === "workout") {
        handleWorkoutFrame(res);
      }
      drawOverlay(res);
    } catch (err) {
      console.warn("[Therapy] onFrame handled error:", err);
    }
  }

  // ---------- Start / controls ---------------------------------------------
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
      const exs = (window.EXERCISE_LIBRARY && (window.EXERCISE_LIBRARY[profile] || window.EXERCISE_LIBRARY["Hemiparesis"])) || [];
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
    S.exStart = Date.now();
    S.lastActionTime = Date.now();
    $("wo-now").textContent = `${S.ex.emoji} ${S.ex.name}`;
    $("wo-set").textContent = `Set 1/${S.setsTarget}`;
    $("rep-display").textContent = `0 / ${S.repsTarget}`;
    $("metric-label").textContent = S.ex.metric;
    $("hint-line").textContent = ""; $("feedback-line").textContent = "";
    renderSteps(S.ex, 0);

    // Show workout stage IMMEDIATELY so video element is unhidden in the active DOM tree!
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

  // Dynamic Mirror Mode Toggle (P7: Natural Left = Left)
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

  // ---------- Logging --------------------------------------------------------
  async function logExercise(result) {
    try {
      const peakRom = S.metrics && S.metrics.elbowMax ? Math.round(S.metrics.elbowMax) : 75;
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "THERAPY",
          condition: profile,
          duration_seconds: Math.max(1, result.elapsed),
          peak_rom: peakRom,
          smoothness_score: 88,
          cheats_blocked: S.cheat ? 1 : 0,
          score: result.reps,
          metrics_json: JSON.stringify({ exercise: result.name, reps: result.reps, sets: result.sets, profile: profile, peak_rom: peakRom }),
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

  // ---------- Boot ----------------------------------------------------------
  ["cfg-reps", "cfg-sets", "cfg-rest", "cfg-break"].forEach((id) => {
    $(id).addEventListener("input", updateSummary);
  });
  renderConfig();
  // Auto-launch workout so camera turns on immediately upon opening Exercise Drills
  launchWorkout(true);
});
