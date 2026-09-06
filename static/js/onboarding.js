/**
 * RehabOpt — Streamlined Patient Onboarding
 * Step 0: Personal details (optional)
 * Step 1: Stroke type selection (required, Continue disabled until selected)
 * Step 2: How did it happen (optional story / voice)
 * Step 3: Finish screen (saves profile & opens main app)
 */
document.addEventListener("DOMContentLoaded", async () => {
  const toast = document.getElementById("toast");
  const step0 = document.getElementById("step0");
  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const stepFinish = document.getElementById("step-finish");
  const progressEl = document.getElementById("obo-progress");
  const optionsEl = document.getElementById("stroke-options");
  const nextBtn1 = document.getElementById("btn-next1");
  const nextBtn2 = document.getElementById("btn-next2");
  const openAppBtn = document.getElementById("btn-open-app");
  const patientChip = document.getElementById("obo-patient");

  const TOTAL_STEPS = 4; // 0, 1, 2, 3 (finish)

  const ans = {
    patient_id: "",
    name: "",
    dob: "",
    phone: "",
    condition: "",
    conditionLabel: "",
    onset: ""
  };

  const DESCRIPTIONS = {
    Hemiparesis: "Weakness & limited reach on one side",
    "Flexor Spasticity": "Tightness & stiff, clenched fingers",
    "Motor Ataxia": "Coordination & aiming difficulties",
    "Intention Tremor": "Shaking while reaching or holding",
    "Motor Apraxia": "Remembering how to do multi-step tasks",
    "Wrist Drop": "Difficulty lifting the wrist up",
    "Lower-Limb": "Weakness or stiffness in one or both legs",
    LowerLimb: "Weakness or stiffness in one or both legs"
  };

  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.className = "toast";
    }, 3200);
  }

  // --- Initial Profile Check & Load ---
  try {
    const res = await fetch("/api/profile");
    const data = await res.json();
    if (data.status === "success" && data.profile) {
      const p = data.profile;
      // If patient already completed onboarding, go directly to main app
      if (p.onboarding_done) {
        window.location.href = "/dashboard";
        return;
      }
      ans.patient_id = p.patient_id || "";
      if (patientChip && p.patient_id) {
        patientChip.textContent = `🪪 ${p.patient_id}`;
      }
      if (p.patient_name) {
        ans.name = p.patient_name;
        const nameInput = document.getElementById("pat-name");
        if (nameInput) nameInput.value = p.patient_name;
      }
      if (p.patient_dob) {
        ans.dob = p.patient_dob;
        const dobInput = document.getElementById("pat-dob");
        if (dobInput) dobInput.value = p.patient_dob;
      }
      if (p.patient_phone) {
        ans.phone = p.patient_phone;
        const phoneInput = document.getElementById("pat-phone");
        if (phoneInput) phoneInput.value = p.patient_phone;
      }
      if (p.selected_condition) {
        ans.condition = p.selected_condition;
      }
    }
  } catch (err) {
    console.warn("Could not fetch profile in onboarding", err);
  }

  // Fallback to local storage for personal fields
  try {
    const saved = localStorage.getItem("rehab_personal");
    if (saved) {
      const p = JSON.parse(saved);
      if (p && !ans.name && p.name) {
        ans.name = p.name;
        const nameInput = document.getElementById("pat-name");
        if (nameInput) nameInput.value = p.name;
      }
      if (p && !ans.dob && p.dob) {
        ans.dob = p.dob;
        const dobInput = document.getElementById("pat-dob");
        if (dobInput) dobInput.value = p.dob;
      }
      if (p && !ans.phone && p.phone) {
        ans.phone = p.phone;
        const phoneInput = document.getElementById("pat-phone");
        if (phoneInput) phoneInput.value = p.phone;
      }
    }
  } catch (e) {}

  // --- Render Progress Dots ---
  function renderProgress(curStep) {
    if (!progressEl) return;
    progressEl.innerHTML = "";
    for (let i = 0; i < TOTAL_STEPS; i++) {
      if (i > 0) {
        const line = document.createElement("span");
        line.className = "prog-line" + (i <= curStep ? " on" : "");
        progressEl.appendChild(line);
      }
      const dot = document.createElement("span");
      dot.className = "prog-dot" + (i <= curStep ? " on" : "");
      dot.setAttribute("data-step", String(i));
      progressEl.appendChild(dot);
    }
    progressEl.setAttribute("aria-valuenow", String(curStep + 1));
  }

  // --- Step Navigation ---
  function goStep(targetIndex) {
    const next = Math.max(0, Math.min(TOTAL_STEPS - 1, targetIndex));

    if (step0) step0.style.display = next === 0 ? "block" : "none";
    if (step1) step1.style.display = next === 1 ? "block" : "none";
    if (step2) step2.style.display = next === 2 ? "block" : "none";
    if (stepFinish) stepFinish.style.display = next === 3 ? "block" : "none";

    renderProgress(next);

    // Update finish screen preview
    if (next === 3) {
      const sumName = document.getElementById("sum-name");
      const sumCond = document.getElementById("sum-condition");
      if (sumName) {
        sumName.textContent = ans.name || ans.patient_id || "Patient";
      }
      if (sumCond) {
        sumCond.textContent = ans.conditionLabel || ans.condition || "Hemiparesis";
      }
    }

    if (window.scrollTo) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // --- Step 0 Button Listeners ---
  function saveStep0Data() {
    const nameEl = document.getElementById("pat-name");
    const dobEl = document.getElementById("pat-dob");
    const phoneEl = document.getElementById("pat-phone");
    ans.name = nameEl ? nameEl.value.trim() : "";
    ans.dob = dobEl ? dobEl.value.trim() : "";
    ans.phone = phoneEl ? phoneEl.value.trim() : "";

    try {
      localStorage.setItem(
        "rehab_personal",
        JSON.stringify({ name: ans.name, dob: ans.dob, phone: ans.phone })
      );
    } catch (e) {}
  }

  const btnNext0 = document.getElementById("btn-next0");
  if (btnNext0) {
    btnNext0.addEventListener("click", () => {
      saveStep0Data();
      goStep(1);
    });
  }

  const btnSkip0 = document.getElementById("btn-skip0");
  if (btnSkip0) {
    btnSkip0.addEventListener("click", () => {
      saveStep0Data();
      goStep(1);
    });
  }

  // --- Step 1 Stroke Options Rendering & Selection ---
  function setNext1Enabled(enabled) {
    if (!nextBtn1) return;
    if (enabled) {
      nextBtn1.disabled = false;
      nextBtn1.setAttribute("aria-disabled", "false");
    } else {
      nextBtn1.disabled = true;
      nextBtn1.setAttribute("aria-disabled", "true");
    }
  }

  function renderStrokeOptions() {
    if (!optionsEl) return;
    optionsEl.innerHTML = "";

    const defaultProfiles = [
      { key: "Hemiparesis", emoji: "🦾", label: "Upper-Limb Hemiparesis" },
      { key: "Flexor Spasticity", emoji: "✋", label: "Flexor Spasticity" },
      { key: "Motor Ataxia", emoji: "🎯", label: "Motor Ataxia / Dysmetria" },
      { key: "Intention Tremor", emoji: "🫨", label: "Intention Tremor" },
      { key: "Motor Apraxia", emoji: "🧠", label: "Motor Apraxia" },
      { key: "Wrist Drop", emoji: "🤚", label: "Wrist Drop (Extensor Paresis)" },
      { key: "Lower-Limb", emoji: "🦵", label: "Lower-Limb Crural Paresis" }
    ];

    const profiles =
      window.StrokeProfiles && window.StrokeProfiles.length
        ? window.StrokeProfiles
        : defaultProfiles;

    profiles.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stroke-option";
      btn.dataset.key = p.key;

      const isSelected = ans.condition === p.key;
      if (isSelected) {
        btn.classList.add("selected");
        ans.conditionLabel = `${p.emoji} ${p.label}`;
      }

      btn.innerHTML = `
        <span class="so-emoji">${p.emoji}</span>
        <span class="so-body">
          <span class="so-name">${p.label}</span>
          <span class="so-desc">${DESCRIPTIONS[p.key] || "Post-stroke motor rehabilitation"}</span>
        </span>
        <span class="so-check" aria-hidden="true">✓</span>
      `;

      btn.addEventListener("click", () => {
        ans.condition = p.key;
        ans.conditionLabel = `${p.emoji} ${p.label}`;
        optionsEl
          .querySelectorAll(".stroke-option")
          .forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        setNext1Enabled(true);
      });

      optionsEl.appendChild(btn);
    });

    if (ans.condition) {
      setNext1Enabled(true);
    } else {
      setNext1Enabled(false);
    }
  }

  renderStrokeOptions();

  if (nextBtn1) {
    nextBtn1.addEventListener("click", () => {
      if (!ans.condition) {
        showToast("⚠️ Please choose your stroke condition first", "error");
        return;
      }
      goStep(2);
    });
  }

  const btnBack1 = document.getElementById("btn-back1");
  if (btnBack1) {
    btnBack1.addEventListener("click", () => goStep(0));
  }

  // --- Step 2 Story & Voice Input ---
  const voiceBtn = document.getElementById("voice-btn");
  const voiceStatus = document.getElementById("voice-status");
  const onsetInput = document.getElementById("onset-text");

  let recognition = null;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRec) {
    recognition = new SpeechRec();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      let finalTranscript = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalTranscript += e.results[i][0].transcript;
        }
      }
      if (finalTranscript && onsetInput) {
        onsetInput.value = (onsetInput.value ? onsetInput.value.trimEnd() + " " : "") + finalTranscript;
      }
    };

    recognition.onend = () => {
      if (voiceBtn) voiceBtn.classList.remove("recording");
      if (voiceStatus) voiceStatus.textContent = "";
    };

    recognition.onerror = (ev) => {
      if (voiceBtn) voiceBtn.classList.remove("recording");
      if (voiceStatus) {
        voiceStatus.textContent =
          ev.error === "not-allowed"
            ? "Microphone permission denied."
            : "Speech not recognized — please try again.";
      }
    };
  } else {
    if (voiceBtn) {
      voiceBtn.title = "Voice dictation is supported in modern Chrome, Edge or Safari";
      voiceBtn.style.opacity = "0.6";
    }
  }

  if (voiceBtn) {
    voiceBtn.addEventListener("click", () => {
      if (!recognition) {
        showToast("🎙️ Voice dictation not supported on this browser — you can type your story instead", "info");
        return;
      }
      if (voiceBtn.classList.contains("recording")) {
        recognition.stop();
        return;
      }
      voiceBtn.classList.add("recording");
      if (voiceStatus) voiceStatus.textContent = "🎙️ Listening… speak now";
      try {
        recognition.start();
      } catch (e) {
        console.warn("Recognition start error", e);
      }
    });
  }

  if (nextBtn2) {
    nextBtn2.addEventListener("click", () => {
      if (onsetInput) {
        ans.onset = onsetInput.value.trim();
      }
      goStep(3); // Moves forward to Finish screen
    });
  }

  const btnBack2 = document.getElementById("btn-back2");
  if (btnBack2) {
    btnBack2.addEventListener("click", () => goStep(1));
  }

  // --- Step Finish: Save Profile & Launch Main App ---
  const btnBackFinish = document.getElementById("btn-back-finish");
  if (btnBackFinish) {
    btnBackFinish.addEventListener("click", () => goStep(2));
  }

  if (openAppBtn) {
    openAppBtn.addEventListener("click", async () => {
      if (!ans.condition) {
        showToast("⚠️ Please select a stroke condition in Step 1", "error");
        goStep(1);
        return;
      }

      openAppBtn.disabled = true;
      openAppBtn.textContent = "⏳ Saving your profile…";

      if (onsetInput) {
        ans.onset = onsetInput.value.trim();
      }

      const payload = {
        condition: ans.condition,
        patient_name: ans.name,
        patient_dob: ans.dob,
        patient_phone: ans.phone,
        onset: ans.onset
      };

      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === "success") {
          try {
            localStorage.setItem("selectedCondition", ans.condition);
          } catch (e) {}
          showToast("🎉 Profile saved! Welcome to RehabOpt.", "success");
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 800);
        } else {
          showToast(`❌ ${data.message || "Save failed. Please try again."}`, "error");
          openAppBtn.disabled = false;
          openAppBtn.textContent = "Open My App ➜";
        }
      } catch (err) {
        showToast("❌ Network error saving profile. Please try again.", "error");
        openAppBtn.disabled = false;
        openAppBtn.textContent = "Open My App ➜";
      }
    });
  }

  // Start at Step 0 (Personal Details)
  goStep(0);
});
