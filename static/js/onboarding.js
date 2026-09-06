/**
 * RehabOpt AR — New-Patient Onboarding
 * Shows ONLY to patients who have not completed it (server-gated).
 * Step 1: which type of stroke (single choice from StrokeProfiles).
 * Step 2: how it happened — typed or 🎙️ voice-to-text, plus affected
 *         side and onset time. Submits to /api/onboarding, then the
 *         patient enters the dashboard normally (never shown again).
 */
document.addEventListener("DOMContentLoaded", async () => {
  const toast = document.getElementById("toast");
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const optionsEl = document.getElementById("stroke-options");
  const btnNext = document.getElementById("btn-next1");
  const btnBack = document.getElementById("btn-back1");
  const btnSubmit = document.getElementById("btn-submit");

  let chosen = "";       // condition key
  let side = "";         // left | right | both
  let ago = "";          // onset bucket

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

  // ---- Step 1 options ------------------------------------------------
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
      chosen = p.key;
      optionsEl.querySelectorAll(".stroke-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      btnNext.disabled = false;
    });
    optionsEl.appendChild(btn);
  });

  function goStep1() {
    step2.style.display = "none";
    step1.style.display = "block";
    document.getElementById("prog-dot2").classList.remove("on");
  }
  function goStep2() {
    if (!chosen) { showToast("⚠️ Please pick your stroke type first", "error"); return; }
    step1.style.display = "none";
    step2.style.display = "block";
    document.getElementById("prog-dot2").classList.add("on");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  btnNext.addEventListener("click", goStep2);
  btnBack.addEventListener("click", goStep1);

  // ---- Chip rows ------------------------------------------------------
  function wireChips(containerId, attr, onPick) {
    const row = document.getElementById(containerId);
    row.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        row.querySelectorAll("button").forEach((x) => x.classList.remove("picked"));
        b.classList.add("picked");
        onPick(b.dataset[attr]);
      });
    });
  }
  wireChips("side-chips", "side", (v) => { side = v; });
  wireChips("ago-chips", "ago", (v) => { ago = v; });

  // ---- Voice-to-text --------------------------------------------------
  const micBtn = document.getElementById("btn-voice");
  const voiceStatus = document.getElementById("voice-status");
  const textarea = document.getElementById("onset-text");
  let recognition = null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SR) {
    recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      }
      if (final) textarea.value = (textarea.value ? textarea.value.trimEnd() + " " : "") + final;
    };
    recognition.onend = () => { micBtn.classList.remove("recording"); voiceStatus.textContent = ""; };
    recognition.onerror = (ev) => {
      micBtn.classList.remove("recording");
      voiceStatus.textContent = ev.error === "not-allowed"
        ? "Microphone permission denied." : "Speech not recognised — try again.";
    };
  } else {
    micBtn.title = "Voice input not supported in this browser";
    micBtn.style.opacity = 0.45;
  }

  micBtn.addEventListener("click", () => {
    if (!recognition) { showToast("🎙️ Voice input isn't supported here — try Chrome", "error"); return; }
    if (micBtn.classList.contains("recording")) { recognition.stop(); return; }
    micBtn.classList.add("recording");
    voiceStatus.textContent = "🎙️ Listening… speak now";
    try { recognition.start(); } catch (e) {}
  });

  // ---- Submit -----------------------------------------------------------
  btnSubmit.addEventListener("click", async () => {
    if (!chosen) { showToast("⚠️ Please pick your stroke type", "error"); return; }
    btnSubmit.disabled = true;
    btnSubmit.textContent = "⏳ Saving your profile…";
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condition: chosen,
          onset: textarea.value.trim(),
          affected_side: side,
          onset_ago: ago,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        localStorage.setItem("selectedCondition", chosen);
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
