/**
 * RehabOpt AR — Clinical Dashboard (Command Center)
 * Loads live recovery snapshot from /api/report/stats and keeps the
 * condition spotlight in sync with the profile selected in the top bar.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const snapStreak = document.getElementById("snap-streak");
  const snapSessions = document.getElementById("snap-sessions");
  const snapRom = document.getElementById("snap-rom");
  const snapSmooth = document.getElementById("snap-smooth");
  const conditionChip = document.getElementById("spot-condition-chip");
  const conditionLabel = document.getElementById("dash-condition-label");
  const conditionDesc = document.getElementById("spot-description");

  // Short clinical blurbs shown in the spotlight card.
  const SPOTLIGHT = {
    "Hemiparesis":
      "Focus on guided elbow extension to rebuild active range of motion while trunk " +
      "compensation is monitored and blocked automatically.",
    "Flexor Spasticity":
      "Slow, controlled elbow unfurling and open-palm dispersion stretches — speed is " +
      "capped to avoid triggering velocity-dependent stretch reflexes.",
    "Motor Ataxia":
      "Coordination retraining: intercept precise spatial targets and trace corridors " +
      "to reduce overshoot and trajectory wandering.",
    "Intention Tremor":
      "Stabilization holds and smooth, speed-governed reaches target the 3–6 Hz terminal " +
      "shaking band measured by the tremor detector.",
    "Motor Apraxia":
      "Sequenced multi-step drills rebuild motor memory — stage-by-stage cues guide each " +
      "part of the movement chain.",
    "Wrist Drop":
      "Active wrist cock-up and radial-ulnar sweeps retrain radial nerve extension against " +
      "gravity, tracked by signed wrist deviation.",
  };

  const iconFor = (c) =>
    ({
      Hemiparesis: "🦾",
      "Flexor Spasticity": "✋",
      "Motor Ataxia": "🎯",
      "Intention Tremor": "🫨",
      "Motor Apraxia": "🧠",
      "Wrist Drop": "🤚",
    }[c] || "🩺");

  function applyCondition(condition) {
    const c = condition || "Hemiparesis";
    conditionChip.textContent = c;
    conditionChip.style.background = "";
    conditionLabel.textContent = `${iconFor(c)} ${c}`;
    conditionDesc.textContent = SPOTLIGHT[c] || SPOTLIGHT.Hemiparesis;
  }

  // Sync spotlight whenever the profile changes (top bar selector).
  const profileSel = document.getElementById("tb-condition-select");
  if (profileSel) {
    profileSel.addEventListener("change", () => applyCondition(profileSel.value));
    applyCondition(profileSel.value);
  } else {
    applyCondition(localStorage.getItem("selectedCondition") || "Hemiparesis");
  }

  // ---- Load recovery snapshot -------------------------------------------
  async function loadSnapshot() {
    try {
      const res = await fetch("/api/report/stats");
      const data = await res.json();
      if (data.status !== "success") return;
      const s = data.stats;
      snapStreak.textContent = s.streak;
      snapSessions.textContent = s.total_sessions;
      snapRom.textContent = `${Math.round(s.peak_rom)}°`;
      snapSmooth.innerHTML = `${Math.round(s.avg_smoothness)}<span class="unit">/100</span>`;
      localStorage.setItem("currentStreak", s.streak);
      // Sync the streak chip in the top bar once profile data arrives too
      const tbStreak = document.getElementById("tb-streak");
      if (tbStreak) tbStreak.textContent = `🔥 ${s.streak} Days`;
      // Keep the spotlight profile identical to the server truth
      applyCondition(s.condition);
      if (profileSel && profileSel.querySelector(`option[value="${s.condition}"]`)) {
        profileSel.value = s.condition;
      }
    } catch (err) {
      console.error("Snapshot load error:", err);
    }
  }

  await loadSnapshot();
});
