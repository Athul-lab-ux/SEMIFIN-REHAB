/**
 * RehabOpt AR — Patient Profile Controller
 * Loads lifetime clinical data, updates personal information,
 * manages profile photos, and handles custom color themes.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const toast = document.getElementById("toast");

  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 3000);
  }

  let selectedPrimaryColor = "#FF6A00";

  // --- Load Profile Data ---
  async function loadProfile() {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.status !== "success" || !data.profile) {
        showToast("⚠️ Could not load profile details", "error");
        return;
      }
      const p = data.profile;

      // Identity & Meta
      const name = p.patient_name || p.email.split("@")[0] || "Patient";
      document.getElementById("disp-name").textContent = name;
      document.getElementById("disp-patient-id").textContent = p.patient_id;
      document.getElementById("disp-streak").textContent = `${p.current_streak || 1} Day Streak`;
      document.getElementById("disp-email").textContent = p.email;
      document.getElementById("disp-created").textContent = p.created_at ? p.created_at.slice(0, 10) : "Active";

      // Stats
      document.getElementById("stat-sessions").textContent = p.total_sessions || 0;
      document.getElementById("stat-minutes").textContent = p.total_minutes || 0;
      document.getElementById("stat-rom").textContent = `${p.best_rom || 0}°`;

      // Avatar
      const imgEl = document.getElementById("avatar-img");
      const initEl = document.getElementById("avatar-initials");
      if (p.profile_photo && p.profile_photo.startsWith("data:image")) {
        imgEl.src = p.profile_photo;
        imgEl.style.display = "block";
        initEl.style.display = "none";
      } else {
        imgEl.style.display = "none";
        initEl.style.display = "block";
        initEl.textContent = name.charAt(0).toUpperCase();
      }

      // Form Inputs
      document.getElementById("input-name").value = p.patient_name || "";
      document.getElementById("input-email").value = p.email || "";
      document.getElementById("input-dob").value = p.patient_dob || "";
      document.getElementById("input-phone").value = p.patient_phone || "";
      document.getElementById("select-condition").value = p.selected_condition || "Hemiparesis";
      if (p.affected_side) document.getElementById("select-side").value = p.affected_side;
      if (p.onset_ago) document.getElementById("select-onset").value = p.onset_ago;
      if (p.pain_level) document.getElementById("select-pain").value = p.pain_level;
      document.getElementById("input-goal").value = p.rehab_goal || "";

      // Theme Colors
      if (p.primary_color) {
        selectedPrimaryColor = p.primary_color;
        document.querySelectorAll(".color-swatch").forEach((b) => {
          b.classList.toggle("active", b.dataset.color.toLowerCase() === selectedPrimaryColor.toLowerCase());
        });
      }
    } catch (e) {
      console.error("Profile load failed:", e);
    }
  }

  await loadProfile();

  // --- Profile Photo Upload ---
  const photoInput = document.getElementById("photo-input");
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
      const imgEl = document.getElementById("avatar-img");
      const initEl = document.getElementById("avatar-initials");
      imgEl.src = dataUrl;
      imgEl.style.display = "block";
      initEl.style.display = "none";

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

  // --- Copy Patient ID ---
  document.getElementById("copy-id-btn").addEventListener("click", () => {
    const pid = document.getElementById("disp-patient-id").textContent;
    navigator.clipboard.writeText(pid).then(() => {
      showToast("📋 Patient ID copied to clipboard!", "success");
    }).catch(() => {
      showToast("📋 ID: " + pid, "info");
    });
  });

  // --- Color Swatches ---
  document.querySelectorAll(".color-swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
      document.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("active"));
      swatch.classList.add("active");
      selectedPrimaryColor = swatch.dataset.color;
      document.documentElement.style.setProperty("--clin-orange", selectedPrimaryColor);
    });
  });

  // --- Save Profile Changes ---
  async function saveProfile() {
    const name = document.getElementById("input-name").value.trim();
    const phone = document.getElementById("input-phone").value.trim();
    const dob = document.getElementById("input-dob").value.trim();
    const condition = document.getElementById("select-condition").value;
    const side = document.getElementById("select-side").value;
    const onset = document.getElementById("select-onset").value;
    const pain = document.getElementById("select-pain").value;
    const goal = document.getElementById("input-goal").value.trim();

    const saveBtns = [
      document.getElementById("save-profile-btn"),
      document.getElementById("save-profile-btn-bottom"),
    ];
    saveBtns.forEach((b) => { if (b) { b.disabled = true; b.textContent = "⏳ Saving…"; } });

    try {
      const res = await fetch("/api/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: name,
          patient_phone: phone,
          patient_dob: dob,
          selected_condition: condition,
          affected_side: side,
          onset_ago: onset,
          pain_level: pain,
          rehab_goal: goal,
          primary_color: selectedPrimaryColor,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        showToast("✅ Profile and medical settings saved successfully!", "success");
        if (name) document.getElementById("disp-name").textContent = name;
        localStorage.setItem("selectedCondition", condition);
        if (name) localStorage.setItem("patient_name", name);
      } else {
        showToast(`❌ ${data.message}`, "error");
      }
    } catch (err) {
      showToast("❌ Network error. Changes could not be saved.", "error");
    } finally {
      saveBtns.forEach((b) => { if (b) { b.disabled = false; b.textContent = "💾 Save Changes"; } });
    }
  }

  document.getElementById("save-profile-btn").addEventListener("click", saveProfile);
  const bottomBtn = document.getElementById("save-profile-btn-bottom");
  if (bottomBtn) bottomBtn.addEventListener("click", saveProfile);
});
