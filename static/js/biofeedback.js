/**
 * RehabOpt AR — Multi-Sensory Biofeedback Engine (Part 1.2)
 * ------------------------------------------------------------------
 * 1. Auditory Kinematic Sonification (Web Audio API)
 *    - Continuous sine tone whose pitch scales with active elbow
 *      extension (C1): 60° → 135° maps 220 Hz → 880 Hz.
 *    - Bright dual-tone harmonic chime (523.25 Hz + 659.25 Hz) on a
 *      valid rep completion.
 *    - Low-frequency alert buzz (120 Hz) on compensatory trunk lean.
 * 2. Automated Spoken Guidance (SpeechSynthesis)
 *    - Phase instructions, rep milestones, and inactivity watchdog
 *      announcements.
 *
 * Muted state persists in localStorage ("rehab_sound_enabled") and is
 * honored by the clinical top bar audio toggle.
 */

const Biofeedback = (() => {
  let audioCtx = null;
  let masterGain = null;
  let activeTone = null; // oscillator of the continuous ROM tone

  const soundEnabled = () => localStorage.getItem("rehab_sound_enabled") !== "0";
  const speechEnabled = () => localStorage.getItem("rehab_voice_enabled") !== "0";

  function ensureCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  /** Beep a tone with optional glide. Returns {osc, gain} or null. */
  function tone({ freq = 440, toFreq = null, dur = 0.12, type = "sine", gain = 0.5, when = 0 }) {
    if (!soundEnabled()) return null;
    const ctx = ensureCtx();
    if (!ctx) return null;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    return { osc, gain: g };
  }

  /**
   * Continuous sonification of C1 elbow extension.
   * angle ∈ [60°, 135°] → frequency 220 Hz → 880 Hz (two octaves).
   * Calling continuously from the tracking loop retargets one voice.
   */
  function setRomTone(angleDeg, opts = { minAngle: 60, maxAngle: 135, minHz: 220, maxHz: 880 }) {
    if (!soundEnabled()) { stopRomTone(); return; }
    const ctx = ensureCtx();
    if (!ctx) return;
    if (!activeTone) {
      activeTone = ctx.createOscillator();
      const g = ctx.createGain();
      activeTone.frequency.value = opts.minHz;
      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 0.15);
      activeTone.type = "sine";
      activeTone.connect(g);
      g.connect(masterGain);
      activeTone.start();
      activeTone._gain = g;
    }
    const clamped = Math.max(opts.minAngle, Math.min(opts.maxAngle, angleDeg));
    const ratio = (clamped - opts.minAngle) / Math.max(0.001, opts.maxAngle - opts.minAngle);
    const freq = opts.minHz + ratio * (opts.maxHz - opts.minHz);
    activeTone.frequency.setTargetAtTime(freq, ctx.currentTime, 0.06);
  }

  function stopRomTone() {
    if (activeTone) {
      try {
        activeTone.frequency.setTargetAtTime(0.0001, audioCtx.currentTime, 0.02);
        if (activeTone._gain) activeTone._gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.06);
        const o = activeTone;
        setTimeout(() => { try { o.stop(); } catch (e) {} }, 400);
      } catch (e) {}
      activeTone = null;
    }
  }

  /* --- Discrete clinical cues ------------------------------------ */
  const playRepChime = () => {
    // Bright dual-tone harmonic chime: C5 (523.25 Hz) + E5 (659.25 Hz)
    tone({ freq: 523.25, dur: 0.16, gain: 0.4 });
    tone({ freq: 659.25, dur: 0.2, gain: 0.3, when: 0.02 });
    tone({ freq: 1046.5, dur: 0.22, gain: 0.18, when: 0.09 });
  };
  const playSetChime = () => {
    tone({ freq: 523.25, dur: 0.18, gain: 0.4 });
    tone({ freq: 659.25, dur: 0.18, gain: 0.4, when: 0.14 });
    tone({ freq: 783.99, dur: 0.24, gain: 0.4, when: 0.28 });
  };
  const playWorkoutFanfare = () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, dur: 0.26, gain: 0.35, when: i * 0.16 })
    );
  };
  const playCheatBuzz = () => {
    // low 120 Hz alert buzz — repeats twice
    tone({ freq: 120, type: "square", dur: 0.18, gain: 0.22 });
    tone({ freq: 120, type: "square", dur: 0.18, gain: 0.22, when: 0.26 });
  };
  const playBeep = (freq = 880, dur = 0.08, gain = 0.3) => tone({ freq, dur, gain });

  /* --- Spoken guidance -------------------------------------------- */
  function speak(text, { rate = 0.95, pitch = 1, priority = false } = {}) {
    if (!speechEnabled()) return;
    if (!("speechSynthesis" in window)) return;
    try {
      if (priority) window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.pitch = pitch;
      u.lang = "en-US";
      window.speechSynthesis.speak(u);
    } catch (e) { /* voice unavailable — silent fallback */ }
  }
  const stopSpeech = () => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  /** Unlock audio on first user gesture (required by mobile browsers). */
  function unlock() {
    ensureCtx();
    try { tone({ freq: 440, dur: 0.05, gain: 0.001 }); } catch (e) {}
  }

  return Object.freeze({
    soundEnabled,
    speechEnabled,
    unlock,
    setRomTone,
    stopRomTone,
    playRepChime,
    playSetChime,
    playWorkoutFanfare,
    playCheatBuzz,
    playBeep,
    speak,
    stopSpeech,
  });
})();

// Safe global access for session engines + top bar
window.RehabBio = window.RehabBio || Biofeedback;
