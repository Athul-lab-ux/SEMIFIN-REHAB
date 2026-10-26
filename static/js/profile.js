/**
 * RehabOpt AR — Patient Profile Controller
 * Loads lifetime clinical data, updates personal information,
 * manages profile photos, custom colour themes and unsaved-change state.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const toast = document.getElementById("toast");

  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 3000);
  }

  const $ = (id) => document.getElementById(id);

  const CONDITION_EMOJI = {
    "Hemiparesis": "🦾",
    "Flexor Spasticity": "✋",
    "Motor Ataxia": "🎯",
    "Intention Tremor": "🫨",
    "Motor Apraxia": "🧠",
    "Wrist Drop": "🤚",
  };

  const SIDE_LABEL = { left: "Left side", right: "Right side", both: "Both sides" };

  const STRUGGLE_LABEL = {
    eating: "🍽️ Eating",
    dressing: "👕 Dressing",
    writing: "✍️ Writing",
    grip: "🤝 Gripping",
    overhead: "🙌 Overhead reach",
    carrying: "🧺 Carrying",
    speaking: "🗣️ Speaking",
    memory: "🧠 Memory",
  };

  const FORM_IDS = [
    "input-name", "input-dob", "input-phone",
    "select-condition", "select-side", "select-onset",
    "select-pain", "select-therapy", "input-goal",
  ];

  let selectedPrimaryColor = "#10B981";
  let selectedSecondaryColor = "";
  let snapshot = null;          // last saved form state (string map)

  // ---------------------------------------------------------------- helpers
  function formState() {
    const state = {};
    FORM_IDS.forEach((id) => {
      const el = $(id);
      state[id] = el ? el.value.trim() : "";
    });
    return state;
  }

  function sameState(a, b) {
    if (!a || !b) return true;
    return Object.keys(a).every((k) => a[k] === b[k]);
  }

  function refreshDirty() {
    const pill = $("dirty-indicator");
    if (!pill || !snapshot) return;
    pill.hidden = sameState(snapshot, formState());
  }

  function updateCompletion() {
    const photo = $("avatar-img");
    const hasPhoto = !!(photo && photo.style.display !== "none" && photo.getAttribute("src"));
    const checks = [
      !!$("input-name").value.trim(),
      !!$("input-dob").value,
      !!$("input-phone").value.trim(),
      !!$("select-side").value,
      !!$("select-onset").value,
      !!$("select-pain").value,
      !!$("select-therapy").value,
      !!$("input-goal").value.trim(),
      hasPhoto,
    ];
    const filled = checks.filter(Boolean).length;
    const pct = Math.round((filled / checks.length) * 100);

    const numEl = $("profile-completion");
    const barEl = $("profile-completion-bar");
    const hintEl = $("profile-completion-hint");
    if (numEl) numEl.textContent = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;
    if (hintEl) {
      if (pct === 100) hintEl.textContent = "Complete — your therapist has the full picture.";
      else if (pct >= 60) hintEl.textContent = "Almost there — add the remaining details when you can.";
      else hintEl.textContent = "Fill in your details so your therapist has the full picture.";
    }
  }

  function syncChips() {
    const cond = $("select-condition").value;
    const side = $("select-side").value;

    const condChip = $("disp-condition-chip");
    if (condChip) condChip.textContent = `${CONDITION_EMOJI[cond] || "🩺"} ${cond}`;

    const sideChip = $("disp-side-chip");
    if (sideChip) sideChip.textContent = SIDE_LABEL[side] || "—";
  }

  function renderStruggles(raw) {
    const wrap = $("disp-struggles");
    if (!wrap) return;
    const keys = String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    wrap.classList.toggle("is-empty", keys.length === 0);

    if (!keys.length) {
      wrap.innerHTML = '<span class="pf-struggle-empty">None recorded — set during onboarding</span>';
      return;
    }
    wrap.innerHTML = keys
      .map((k) => `<span class="pf-struggle-tag">${STRUGGLE_LABEL[k] || k}</span>`)
      .join("");
  }

  function updateGoalCount() {
    const goal = $("input-goal");
    const count = $("goal-count");
    if (goal && count) count.textContent = String(goal.value.length);
  }

  // ---------------------------------------------------------------- load
  async function loadProfile() {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.status !== "success" || !data.profile) {
        showToast("⚠️ Could not load profile details", "error");
        return;
      }
      const p = data.profile;
      const email = p.email || "";

      // Identity
      const name = p.patient_name || (email ? email.split("@")[0] : "Patient");
      $("disp-name").textContent = name;
      $("disp-patient-id").textContent = p.patient_id || "—";
      $("disp-streak").textContent = `${p.current_streak || 1} Day Streak`;
      $("disp-email").textContent = email || "—";
      $("disp-created").textContent = p.created_at ? p.created_at.slice(0, 10) : "Active";
      if ($("disp-created-meta")) {
        $("disp-created-meta").textContent = p.created_at ? p.created_at.slice(0, 10) : "Active";
      }
      if ($("disp-meta-id")) $("disp-meta-id").textContent = p.patient_id || "—";
      if ($("disp-last-session")) {
        $("disp-last-session").textContent = p.last_session_date
          ? String(p.last_session_date).slice(0, 10)
          : "No sessions yet";
      }

      // Lifetime stats
      $("stat-sessions").textContent = p.total_sessions || 0;
      const minutes = Math.round(Number(p.total_minutes) || 0);
      $("stat-minutes").textContent = minutes.toLocaleString();

      const romVal = Math.round(Number(p.best_rom) || 0);
      if ($("stat-best-rom")) $("stat-best-rom").textContent = romVal > 0 ? `${romVal}°` : "—";

      let romText = "Getting started";
      if (romVal >= 110) romText = "Strong";
      else if (romVal >= 60) romText = "Improving";
      $("stat-rom").textContent = romText;

      // Avatar
      const imgEl = $("avatar-img");
      const initEl = $("avatar-initials");
      if (p.profile_photo && p.profile_photo.startsWith("data:image")) {
        imgEl.src = p.profile_photo;
        imgEl.style.display = "block";
        initEl.style.display = "none";
      } else {
        imgEl.style.display = "none";
        initEl.style.display = "block";
        initEl.textContent = (name.charAt(0) || "P").toUpperCase();
      }

      // Form values
      $("input-name").value = p.patient_name || "";
      $("input-email").value = email;
      $("input-dob").value = p.patient_dob || "";
      $("input-phone").value = p.patient_phone || "";
      $("select-condition").value = p.selected_condition || "Hemiparesis";
      if (p.affected_side) $("select-side").value = p.affected_side;
      if (p.onset_ago) $("select-onset").value = p.onset_ago;
      if (p.pain_level) $("select-pain").value = p.pain_level;
      if ($("select-therapy")) $("select-therapy").value = p.doing_therapy || "";
      $("input-goal").value = p.rehab_goal || "";

      renderStruggles(p.daily_struggles);
      syncChips();
      updateGoalCount();
      updateCompletion();

      // Theme colours
      selectedSecondaryColor = p.secondary_color || "";
      if (p.primary_color) {
        selectedPrimaryColor = p.primary_color;
        try { localStorage.setItem("rehab_theme_color", selectedPrimaryColor); } catch (e) {}
        document.querySelectorAll(".color-swatch").forEach((b) => {
          b.classList.toggle(
            "active",
            (b.dataset.color || "").toLowerCase() === selectedPrimaryColor.toLowerCase()
          );
        });
        const st = $("rehab-theme-styles");
        if (st) {
          st.textContent = `:root { --clin-orange: ${selectedPrimaryColor} !important; --clin-brand: ${selectedPrimaryColor} !important; }`;
        }
      }
      updateColorPreview();

      snapshot = formState();
      refreshDirty();
    } catch (e) {
      console.error("Profile load failed:", e);
      showToast("⚠️ Could not load profile details", "error");
    }
  }

  // ---------------------------------------------------------------- colours
  function swatchName(hex) {
    const btn = Array.from(document.querySelectorAll(".color-swatch")).find(
      (b) => (b.dataset.color || "").toLowerCase() === String(hex).toLowerCase()
    );
    if (!btn || !btn.title) return hex;
    return btn.title.replace(/\s*\(.*\)\s*$/, "");
  }

  function updateColorPreview() {
    const line = $("color-preview-line");
    if (!line) return;
    line.innerHTML = `Selected: <b>${swatchName(selectedPrimaryColor)}</b> — applied instantly across sessions.`;
  }

  // ---------------------------------------------------------------- events
  // Dirty tracking + live UI sync
  FORM_IDS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      refreshDirty();
      updateCompletion();
      updateGoalCount();
    });
    el.addEventListener("change", () => {
      refreshDirty();
      updateCompletion();
      syncChips();
    });
  });

  // Photo upload
  const photoInput = $("photo-input");
  if (photoInput) {
    photoInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        showToast("⚠️ Please select an image file", "error");
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        showToast("⚠️ Image too large (maximum 3MB)", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        const imgEl = $("avatar-img");
        const initEl = $("avatar-initials");
        imgEl.src = dataUrl;
        imgEl.style.display = "block";
        initEl.style.display = "none";
        updateCompletion();

        try {
          const res = await fetch("/api/profile/photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ photo: dataUrl }),
          });
          const rdata = await res.json();
          if (rdata.status === "success") {
            showToast("📷 Profile photo updated successfully!", "success");
          } else {
            showToast(`❌ ${rdata.message}`, "error");
          }
        } catch (err) {
          showToast("❌ Could not save photo to server", "error");
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Copy patient ID
  const copyBtn = $("copy-id-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const pid = $("disp-patient-id").textContent.trim();
      navigator.clipboard.writeText(pid).then(() => {
        showToast("📋 Patient ID copied to clipboard!", "success");
      }).catch(() => {
        showToast("📋 ID: " + pid, "info");
      });
    });
  }

  // Theme swatches
  document.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      selectedPrimaryColor = swatch.dataset.color;
      document.documentElement.style.setProperty("--clin-orange", selectedPrimaryColor);
      document.documentElement.style.setProperty("--clin-brand", selectedPrimaryColor);
      try {
        localStorage.setItem("rehab_theme_color", selectedPrimaryColor);
      } catch (e) {}
      const st = $("rehab-theme-styles");
      if (st) {
        st.textContent = `:root { --clin-orange: ${selectedPrimaryColor} !important; --clin-brand: ${selectedPrimaryColor} !important; }`;
      }
      updateColorPreview();

      // Persist immediately so the theme survives leaving without pressing Save
      fetch("/api/profile/colors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_color: selectedPrimaryColor,
          secondary_color: selectedSecondaryColor,
        }),
      }).catch(() => {});
      showToast(`🎨 Theme colour set: ${swatchName(selectedPrimaryColor)}`, "info");
    });
  });

  // Save
  async function saveProfile() {
    const saveBtns = [$("save-profile-btn"), $("save-profile-btn-bottom")].filter(Boolean);
    saveBtns.forEach((b) => { b.disabled = true; b.dataset.label = b.textContent; b.textContent = "⏳ Saving…"; });

    const name = $("input-name").value.trim();
    const payload = {
      patient_name: name,
      patient_phone: $("input-phone").value.trim(),
      patient_dob: $("input-dob").value.trim(),
      selected_condition: $("select-condition").value,
      affected_side: $("select-side").value,
      onset_ago: $("select-onset").value,
      pain_level: $("select-pain").value,
      doing_therapy: $("select-therapy") ? $("select-therapy").value : "",
      rehab_goal: $("input-goal").value.trim(),
      primary_color: selectedPrimaryColor,
      secondary_color: selectedSecondaryColor,
    };

    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === "success") {
        showToast("✅ Profile and medical settings saved successfully!", "success");
        if (name) {
          $("disp-name").textContent = name;
          if ($("avatar-img").style.display === "none") {
            $("avatar-initials").textContent = name.charAt(0).toUpperCase();
          }
        }
        syncChips();
        snapshot = formState();
        refreshDirty();
        try { localStorage.setItem("selectedCondition", payload.selected_condition); } catch (e) {}
        try { if (name) localStorage.setItem("patient_name", name); } catch (e) {}
        if (selectedPrimaryColor) {
          try { localStorage.setItem("rehab_theme_color", selectedPrimaryColor); } catch (e) {}
        }
      } else {
        showToast(`❌ ${data.message || "Could not save changes"}`, "error");
      }
    } catch (err) {
      showToast("❌ Network error. Changes could not be saved.", "error");
    } finally {
      saveBtns.forEach((b) => { b.disabled = false; b.textContent = b.dataset.label || "💾 Save changes"; });
    }
  }

  [$("save-profile-btn"), $("save-profile-btn-bottom")].forEach((btn) => {
    if (btn) btn.addEventListener("click", saveProfile);
  });

  // Discard
  const discardBtn = $("btn-discard");
  if (discardBtn) {
    discardBtn.addEventListener("click", () => {
      if (!snapshot) return;
      FORM_IDS.forEach((id) => {
        const el = $(id);
        if (el && snapshot[id] !== undefined) el.value = snapshot[id];
      });
      syncChips();
      updateGoalCount();
      updateCompletion();
      refreshDirty();
      showToast("↺ Unsaved changes discarded", "info");
    });
  }

  // Warn before leaving with unsaved edits
  window.addEventListener("beforeunload", (e) => {
    const pill = $("dirty-indicator");
    if (pill && !pill.hidden) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  await loadProfile();
});
