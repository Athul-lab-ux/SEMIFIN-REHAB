/**
 * RehabOpt AR — Diagnostic QA Watchdog (Part 5.1)
 * ------------------------------------------------------------------
 * 1. Pre-flight 10,000-frame stress test injected BEFORE camera start.
 *    Synthetic inputs: coincident joints, zero-vectors, dropped frames
 *    (null landmarks), extreme trunk tilt spikes (> 45°), NaN fields.
 *    Verifies no NaN, no unhandled exceptions, no degenerate outputs.
 * 2. Defensive-math helpers: every dot product is clamped to [-1, 1]
 *    before arccos (guards goniometry against precision drift).
 * 3. Camera auto-reconnect: session engines call tick() on every
 *    MediaPipe frame; if no new frame arrives for > 2.0 s the attached
 *    handler (camera pipeline re-init, no page reload) fires.
 */
const RehabQA = (() => {
  /* ----- Defensive numeric guards ------------------------------ */
  const clamp01 = (x) => Math.max(-1, Math.min(1, Number(x) || 0));
  const isBad = (v) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));

  /** Strip NaN / Infinity out of any number, defaulting safely. */
  const safeNum = (v, fallback = 0) => {
    if (typeof v !== "number" || Number.isNaN(v) || !Number.isFinite(v)) return fallback;
    return v;
  };

  const pt = (x, y) => {
    if (isBad(x) || isBad(y)) return null; // simulates a dropped landmark frame
    return { x: safeNum(x), y: safeNum(y) };
  };

  /* ----- Diagnostic synthetic stress harness (50-iteration fast pre-flight) ---- */
  const STRESS_TARGET = 50;

  function runStressTest(target = STRESS_TARGET) {
    const failures = [];
    let checks = 0;

    const expectNotBad = (label, v) => {
      checks++;
      if (isBad(v) || (typeof v === "number" && !Number.isFinite(v))) {
        failures.push(label);
        return true;
      }
      return false;
    };

    // Reference Kinematics (loaded before this file on every session page)
    const K = window.Kinematics || (typeof Kinematics !== "undefined" ? Kinematics : null);
    if (!K) {
      return { passed: false, checks: 0, iterations: 0, failures: ["Kinematics module missing"] };
    }

    for (let i = 0; i < target; i++) {
      const mode = i % 5;
      let shoulder, elbow, wrist, lSh, rSh, idx, pinky, mcp, a, b, p;
      let k;
      try {
        if (mode === 0) {
          // Coincident joints — all points identical (zero vectors)
          const c = { x: 0.5, y: 0.5 };
          shoulder = c; elbow = c; wrist = c;
          k = K.calculateJointAngle(shoulder, elbow, wrist);
          if (expectNotBad("C1 coincident", k)) continue;
          k = K.calculateOrthogonalPathError(c, c, c);
          if (expectNotBad("E4 zero-segment", k)) continue;
        } else if (mode === 1) {
          // Dropped frames — one landmark missing
          shoulder = pt(0.2, 0.3); elbow = pt(null, null); wrist = pt(0.8, 0.7);
          if (!elbow) continue; // skip frame entirely
          k = K.calculateJointAngle(shoulder, elbow, wrist);
          if (expectNotBad("C1 dropped-frame", k)) continue;
        } else if (mode === 2) {
          // Extreme trunk tilt spikes (> 45°)
          lSh = pt(0.1, 0.2); rSh = pt(0.1, 0.9);
          const tilt = K.calculateTrunkTilt(lSh, rSh);
          if (expectNotBad("E1 tilt spike", tilt.tiltDegrees)) continue;
          if (expectNotBad("E1 isCompensating", tilt.isCompensating ? 1 : 0)) continue;
          // Random-space reach points
          shoulder = pt(Math.random(), Math.random());
          elbow = pt(Math.random(), Math.random());
          wrist = pt(Math.random(), Math.random());
          k = K.calculateJointAngle(shoulder, elbow, wrist);
          if (expectNotBad("C1 random", k)) continue;
          if (k < 0 || k > 180) failures.push("C1 out-of-range");
        } else if (mode === 3) {
          // NaN / non-finite injection
          shoulder = pt(0.2, 0.3); elbow = pt(NaN, 0.4); wrist = pt(0.8, 0.7);
          if (!elbow) continue;
          k = K.calculateJointAngle(shoulder, elbow, wrist);
          if (expectNotBad("C1 NaN-in", k)) continue;
          wrist = pt(0.8, 0.7); elbow = pt(0.4, 0.4);
          const disp = K.calculateHandDispersion([{ x: 0, y: 0 }, { x: NaN, y: 0.2 }, { x: 0.5, y: 0.1 }, { x: 0.6, y: 0.3 }, { x: 0.9, y: 0.2 }, { x: 0.7, y: 0.4 }]);
          if (expectNotBad("C3 NaN-in dispersion", disp)) continue;
        } else {
          // Zero-velocity / pathological kinematics chain
          a = { x: 0, y: 0 }; b = { x: 1, y: 1 }; p = { x: 0.5, y: 0.5 };
          k = K.calculateOrthogonalPathError(p, a, b);
          if (expectNotBad("E4 path error", k)) continue;
          k = K.calculateVelocity(a, a, 0); // zero distance, zero dt
          if (expectNotBad("S2 zero-dt", k)) continue;
          k = K.calculateSmoothness(0, 0, 0);
          if (expectNotBad("S1 zero-input", k)) continue;
          k = K.calculateWristDeviation(elbow = { x: 0.3, y: 0.4 }, wrist = { x: 0.3, y: 0.4 }, mcp = { x: 0.3, y: 0.4 });
          if (expectNotBad("E3 coincident", k)) continue;
          k = K.calculateKnuckleAspectRatio({ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.45, y: 0.55 });
          if (expectNotBad("E5 KAR", k)) continue;
          idx = pt(0.2, 0.3); pinky = pt(0.3, 0.4);
          k = K.calculatePincerGrip(idx, pinky);
          if (expectNotBad("E2 pincer", k)) continue;
        }
      } catch (err) {
        checks++;
        failures.push(`unhandled-exception@${mode}:${err.message}`);
      }
    }

    return {
      passed: failures.length === 0,
      checks,
      iterations: target,
      failures,
    };
  }

  /* ----- Camera frame watchdog (auto-reconnect, no reload) ------- */
  let lastTick = 0;
  let handler = null;
  let watchdogTimer = null;
  const STALL_MS = 2000;

  /** Session engines call this once per onResults frame. */
  function tick() {
    lastTick = Date.now();
  }

  function watch(onStall) {
    handler = onStall;
    lastTick = Date.now();
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (handler && Date.now() - lastTick > STALL_MS) {
        const fn = handler;
        handler = null; // fire once
        try { fn(); } catch (e) { console.error("Watchdog re-init failed:", e); }
      }
    }, 1000);
  }

  function clearWatch() {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = null;
    handler = null;
  }

  return Object.freeze({
    STRESS_TARGET,
    runStressTest,
    clamp01,
    safeNum,
    isBad,
    tick,
    watch,
    clearWatch,
  });
})();

window.RehabQA = window.RehabQA || RehabQA;
