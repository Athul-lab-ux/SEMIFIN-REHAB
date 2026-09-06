/**
 * RehabOpt AR — New-Patient Onboarding (7 steps)
 * Shows ONLY to patients who have not completed it (server-gated) and is
 * never shown again after submit. Every answer is saved to THIS patient's
 * own row via /api/onboarding (patient_id comes from the session), so the
 * data is never shared with or visible to other users.
 *
 *  1. 🧠  Which type of stroke (single, required)
 *  2. 💬  How did it happen (story — typed or 🎙️ voice)
 *  3. ⬅️  Affected side
 *  4. 🗓️  How long ago
 *  5. 🏠  Daily struggles (multi-select)
 *  6. 🩺  Current therapy + pain level
 *  7. 🎯  Recovery goal (+ optional note with voice)
 */
document.addEventListener("DOMContentLoaded", () => {
  const toast = document.getElementById("toast");
  const cards = ["step1", "step2", "step3", "step4", "step5", "step6", "step7"]
    .map((id) => document.getElementById(id));
  const progressEl = document.getElementById("obo-progress");
  const optionsEl = document.getElementById("stroke-options");
  const TOTAL = cards.length;

  // -------- Patient state (this user only) -------------------------------
  const ans = {
    condition: "",          // required (step 1)
    onset: "",              // story text / voice
    side: "",
    ago: "",
    struggles: [],          // multi-select codes
    therapy: "",
    pain: "",
    goal: "",
    goalNote: "",
  };

  function showToast(msg, type = "info") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 3200);
  }

  // Patient chip
  try {
    const pid = localStorage.getItem("patientId");
    if (pid) document.getElementById("obo-patient").textContent = `🪪 ${pid}`;
  } catch (e) {}

  // -------- Progress dots -------------------------------------------------
  function renderProgress(cur) {
    progressEl.innerHTML = "";
    for (let i = 0; i < TOTAL; i++) {
      if (i > 0) {
        const line = document.createElement("span");
        line.className = "prog-line";
        progressEl.appendChild(line);
      }
      const dot = document.createElement("span");
      dot.className = "prog-dot" + (i <= cur ? " on" : "");
      progressEl.appendChild(dot);
    }
    progressEl.setAttribute("aria-valuenow", String(cur + 1));
  }

  // -------- Step navigation ------------------------------------------------
  function goStep(i) {
    const next = Math.max(0, Math.min(TOTAL - 1, i));
    cards.forEach((card, idx) => { card.style.display = idx === next ? "block" : "none"; });
    cards[next].querySelector(".step-badge").textContent = `Step ${next + 1} of ${TOTAL}`;
    renderProgress(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll(".btn-next").forEach((btn) => {
    btn.addEventListener("click", () => goStep(parseInt(btn.dataset.to, 10)));
  });
  document.querySelectorAll(".btn-back").forEach((btn) => {
    btn.addEventListener("click", () => goStep(parseInt(btn.dataset.to, 10)));
  });

  // -------- Step 1 · Stroke type -------------------------------------------
  const DESCRIPTIONS = {
    Hemiparesis: "Weakness & limited reach on one side",
    "Flexor Spasticity": "Tightness & stiff, clenched fingers",
    "Motor Ataxia": "Coordination & aiming difficulties",
    "Intention Tremor": "Shaking while reaching or holding",
    "Motor Apraxia": "Remembering how to do multi-step tasks",
    "Wrist Drop": "Difficulty lifting the wrist up",
  };

  (window.StrokeProfiles || []).forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "stroke-option";
    btn.dataset.key = p.key;
    btn.innerHTML = `
      <span class="so-emoji">${p.emoji}</span>
      <span class="so-body">
        <span class="so-name">${p.label}</span>
        <span class="so-desc">${DESCRIPTIONS[p.key] || "Post-stroke motor condition"}</span>
      </span>
      <span class="so-check">✓</span>`;
    btn.addEventListener("click", () => {
      ans.condition = p.key;
      optionsEl.querySelectorAll(".stroke-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      document.getElementById("btn-next1").disabled = false;
    });
    optionsEl.appendChild(btn);
  });

  document.getElementById("btn-next1").addEventListener("click", () => goStep(1));

  // -------- Chip rows -------------------------------------------------------
  // Single-choice chips: picking one clears the others in the same row.
  function wireSingle(containerId, setter) {
    const row = document.getElementById(containerId);
    row.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        row.querySelectorAll("button").forEach((x) => x.classList.remove("picked"));
        b.classList.add("picked");
        setter(b.dataset.value);
      });
    });
  }
  // Multi-select chips (daily struggles): each chip toggles on/off.
  function wireMulti(containerId) {
    const row = document.getElementById(containerId);
    row.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        b.classList.toggle("picked");
        const v = b.dataset.value;
        if (b.classList.contains("picked")) {
          if (!ans.struggles.includes(v)) ans.struggles.push(v);
        } else {
          ans.struggles = ans.struggles.filter((s) => s !== v);
        }
      });
    });
  }

  wireSingle("side-chips", (v) => { ans.side = v; });
  wireSingle("ago-chips", (v) => { ans.ago = v; });
  wireMulti("struggle-chips");
  wireSingle("therapy-chips", (v) => { ans.therapy = v; });
  wireSingle("pain-chips", (v) => { ans.pain = v; });
  wireSingle("goal-chips", (v) => { ans.goal = v; });

  // -------- Voice-to-text (shared helper) -----------------------------------
  function bindVoice(btnSel, statusId, targetId) {
    const micBtn = document.querySelector(btnSel);
    const statusEl = document.getElementById(statusId);
    const textEl = document.getElementById(targetId);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.title = "Voice input not supported in this browser";
      micBtn.style.opacity = 0.45;
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) textEl.value = (textEl.value ? textEl.value.trimEnd() + " " : "") + final;
    };
    rec.onend = () => { micBtn.classList.remove("recording"); statusEl.textContent = ""; };
    rec.onerror = () => {
      micBtn.classList.remove("recording");
      statusEl.textContent = "Speech not recognised — try again.";
    };
    micBtn.addEventListener("click", () => {
      if (micBtn.classList.contains("recording")) { rec.stop(); return; }
      // stop the other recorder if it is running
      document.querySelectorAll(".vo-btn.recording").forEach((b) => b.classList.remove("recording"));
      micBtn.classList.add("recording");
      statusEl.textContent = "🎙️ Listening… speak now";
      try { rec.start(); } catch (e) {}
    });
  }
  bindVoice(".vo-btn-a", "voice-status", "onset-text");
  bindVoice(".vo-btn-b", "voice-status2", "goal-text");

  // -------- Submit (step 7) ---------------------------------------------------
  const btnSubmit = document.getElementById("btn-submit");
  btnSubmit.addEventListener("click", async () => {
    if (!ans.condition) { showToast("⚠️ Please pick your stroke type first", "error"); return; }
    btnSubmit.disabled = true;
    btnSubmit.textContent = "⏳ Saving your profile…";
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condition: ans.condition,
          onset: document.getElementById("onset-text").value.trim(),
          affected_side: ans.side,
          onset_ago: ans.ago,
          daily_struggles: ans.struggles,
          doing_therapy: ans.therapy,
          pain_level: ans.pain,
          rehab_goal: ans.goal,
          goal_note: document.getElementById("goal-text").value.trim(),
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        try { localStorage.setItem("selectedCondition", ans.condition); } catch (e) {}
        showToast("🎉 Profile saved — welcome to RehabOpt AR!", "success");
        setTimeout(() => { window.location.href = "/dashboard"; }, 900);
      } else {
        showToast(`❌ ${data.message || "Save failed"}`, "error");
      }
    } catch (e) {
      showToast("❌ Network error — please try again", "error");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "🚀 Start My Recovery";
    }
  });
});
