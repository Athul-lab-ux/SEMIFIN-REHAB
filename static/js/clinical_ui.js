/**
 * RehabOpt AR — Clinical UI Controller (top command bar + rail)
 * ------------------------------------------------------------------
 * - Highlights the active session in the left rail by URL.
 * - Loads patient identity, streak badge, and deficit profile.
 * - Clinical Deficit Profile Selector → persists server-side.
 * - Camera input device switcher (enumerateDevices → localStorage).
 * - Audio biofeedback mute/unmute + Visual Mode switcher
 *   (Standard · High-Contrast · Reduced Motion) + Hemianopia docking.
 * - Live telemetry badge: camera/UI framerate + hardware acceleration.
 *
 * Loaded on every authenticated page AFTER the DOM exists.
 */
(function () {
  const $ = (id) => document.getElementById(id);

  // ---- Active rail link by URL -------------------------------------
  const path = window.location.pathname;
  document.querySelectorAll(".rail-link").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const isActive =
      (path === "/dashboard" && (href === "/dashboard" || href === "/")) ||
      (path.startsWith(href) && href.length > 1) ||
      (path === "/" && href === "/dashboard");
    if (isActive) a.classList.add("active");
  });

  function toast(message, type = "info") {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${type}`;
    setTimeout(() => { el.className = "toast"; }, 3200);
  }

  // ---- Profile / streak ----------------------------------------------
  async function loadProfile() {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.status === "success") {
        const p = data.profile;
        localStorage.setItem("patientId", p.patient_id);
        localStorage.setItem("currentStreak", p.current_streak || 1);
        localStorage.setItem("selectedCondition", p.selected_condition || "Hemiparesis");
        if ($("tb-patient-id")) $("tb-patient-id").textContent = p.patient_id;
        if ($("tb-streak")) $("tb-streak").textContent = `🔥 ${p.current_streak || 1} Days`;
        const sel = $("tb-condition-select");
        if (sel && sel.querySelector(`option[value="${p.selected_condition}"]`)) {
          sel.value = p.selected_condition;
        }
        const condTxt = $("tb-condition-text");
        if (condTxt) condTxt.textContent = p.selected_condition || "Hemiparesis";
      }
    } catch (e) { /* profile fetch best-effort */ }
  }

  // ---- Deficit profile selector --------------------------------------
  const condSel = $("tb-condition-select");
  if (condSel) {
    condSel.addEventListener("change", async () => {
      const condition = condSel.value;
      try {
        const res = await fetch("/api/profile/condition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condition }),
        });
        const data = await res.json();
        if (data.status === "success") {
          localStorage.setItem("selectedCondition", condition);
          toast(`✅ Clinical profile set to ${condition}`, "success");
        } else {
          toast(`❌ ${data.message}`, "error");
        }
      } catch (e) {
        toast("❌ Failed to update profile", "error");
      }
    });
  }

  // ---- Audio biofeedback toggle ---------------------------------------
  const audioBtn = $("tb-audio");
  if (audioBtn) {
    const refresh = () => {
      const on = localStorage.getItem("rehab_sound_enabled") !== "0";
      audioBtn.textContent = on ? "🔊" : "🔇";
      audioBtn.classList.toggle("active", on);
      audioBtn.title = on ? "Audio biofeedback: ON (tap to mute)" : "Audio biofeedback: OFF (tap to unmute)";
      audioBtn.setAttribute("aria-pressed", on ? "true" : "false");
    };
    audioBtn.addEventListener("click", () => {
      const on = localStorage.getItem("rehab_sound_enabled") !== "0";
      localStorage.setItem("rehab_sound_enabled", on ? "0" : "1");
      if (window.RehabBio) {
        if (!on) { window.RehabBio.unlock(); window.RehabBio.playBeep(880); }
      }
      refresh();
    });
    refresh();
  }

  // ---- Visual mode (Standard / High-Contrast / Reduced Motion) --------
  const visSel = $("tb-visual");
  if (visSel) {
    const applyVisual = (mode) => {
      document.documentElement.classList.toggle("hc-mode", mode === "high-contrast");
      document.documentElement.classList.toggle("rm-mode", mode === "reduced-motion");
      localStorage.setItem("rehab_visual_mode", mode);
    };
    const savedMode = localStorage.getItem("rehab_visual_mode") || "standard";
    if (visSel.querySelector(`option[value="${savedMode}"]`)) visSel.value = savedMode;
    applyVisual(savedMode);
    visSel.addEventListener("change", () => applyVisual(visSel.value));
  }

  // ---- Hemianopia HUD docking (left / right / centered) ---------------
  const hemiBtns = document.querySelectorAll("[data-hemi]");
  if (hemiBtns.length) {
    const applyHemi = (side) => {
      const html = document.documentElement;
      html.classList.toggle("hemi-left", side === "left");
      html.classList.toggle("hemi-right", side === "right");
      localStorage.setItem("rehab_hemi", side);
      hemiBtns.forEach((b) => b.classList.toggle("active", b.dataset.hemi === side));
    };
    const savedHemi = localStorage.getItem("rehab_hemi") || "center";
    hemiBtns.forEach((b) =>
      b.addEventListener("click", () => applyHemi(b.dataset.hemi))
    );
    applyHemi(savedHemi);
  }

  // ---- Hemianopia HUD docking via top-bar select ----------------------
  const hemiSel = $("tb-hemi");
  if (hemiSel) {
    const applyHemiSelect = (side) => {
      const html = document.documentElement;
      html.classList.toggle("hemi-left", side === "left");
      html.classList.toggle("hemi-right", side === "right");
      localStorage.setItem("rehab_hemi", side);
    };
    const savedHemi2 = localStorage.getItem("rehab_hemi") || "center";
    if (hemiSel.querySelector(`option[value="${savedHemi2}"]`)) hemiSel.value = savedHemi2;
    applyHemiSelect(savedHemi2);
    hemiSel.addEventListener("change", () => applyHemiSelect(hemiSel.value));
  }

  // ---- Camera input device switcher -----------------------------------
  const camSel = $("tb-camera");
  if (camSel && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const saved = localStorage.getItem("preferred_camera_id") || "";
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const cams = devices.filter((d) => d.kind === "videoinput");
      if (cams.length > 0) {
        camSel.innerHTML = "";
        cams.forEach((d, i) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.textContent = d.label || `Camera ${i + 1}`;
          camSel.appendChild(opt);
        });
        if (saved && cams.some((c) => c.deviceId === saved)) camSel.value = saved;
        camSel.disabled = false;
      } else {
        camSel.innerHTML = '<option value="">No external camera</option>';
      }
    }).catch(() => {});
    camSel.addEventListener("change", () => {
      localStorage.setItem("preferred_camera_id", camSel.value);
      window.dispatchEvent(new CustomEvent("rehab-camera-change", {
        detail: { deviceId: camSel.value },
      }));
    });
  }

  // ---- Live telemetry badge: framerate + hardware acceleration --------
  const fpsEl = $("tb-fps");
  if (fpsEl) {
    let frames = 0;
    let accel = "⚠️ CPU";
    try {
      const probe = document.createElement("canvas").getContext("webgl");
      if (probe && probe.getParameter) {
        const dbg = probe.getExtension("WEBGL_debug_renderer_info");
        const renderer = dbg ? probe.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
        accel = renderer && /swiftshader|software/i.test(String(renderer)) ? "⚠️ CPU" : "⚡ GPU";
      }
    } catch (e) {}
    const loop = (ts) => {
      frames++;
      if (ts - (loop._last || 0) >= 1000) {
        fpsEl.innerHTML = `<b>${frames}</b> fps · ${accel}`;
        loop._last = ts;
        frames = 0;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ---- Sign out -------------------------------------------------------
  const logoutBtn = $("tb-logout");
  if (logoutBtn && window.location.pathname !== "/auth") {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await fetch("/api/logout", { method: "POST" });
      } catch (err) {}
      localStorage.removeItem("patientId");
      localStorage.removeItem("selectedCondition");
      window.location.href = "/auth";
    });
  }

  // ---- Settings panel (simple interactive modal) --------------------
  const settingsBtn = $("tb-settings");
  const existingSettings = document.getElementById("tb-settings-panel");
  if (settingsBtn && !existingSettings) {
    const panel = document.createElement("div");
    panel.id = "tb-settings-panel";
    panel.className = "tb-settings";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Settings");
    panel.innerHTML = `
      <div class="tb-settings-head">
        <span>⚙️ Settings</span>
        <button type="button" class="tb-settings-close" aria-label="Close settings">✕</button>
      </div>
      <div class="tb-settings-body">
        <div class="tb-setting-row">
          <div class="tb-setting-info">
            <div class="tb-setting-label">Saved session</div>
            <div class="tb-setting-val" id="tb-setting-patient">—</div>
          </div>
        </div>
        <div class="tb-setting-row">
          <div class="tb-setting-info">
            <div class="tb-setting-label">Active profile</div>
            <div class="tb-setting-val" id="tb-setting-condition">—</div>
          </div>
        </div>
        <div class="tb-setting-row">
          <div class="tb-setting-info">
            <div class="tb-setting-label">Daily streak</div>
            <div class="tb-setting-val" id="tb-setting-streak">—</div>
          </div>
        </div>
        <div class="tb-setting-row">
          <div class="tb-setting-info">
            <div class="tb-setting-label">App colors</div>
            <div class="tb-setting-val" id="tb-setting-color">—</div>
          </div>
        </div>
        <div class="tb-setting-row">
          <div class="tb-setting-info">
            <div class="tb-setting-label">Sound</div>
            <div class="tb-setting-val" id="tb-setting-sound">—</div>
          </div>
        </div>
        <div class="tb-setting-row">
          <div class="tb-setting-info">
            <div class="tb-setting-label">Visual mode</div>
            <div class="tb-setting-val" id="tb-setting-visual">—</div>
          </div>
        </div>
        <div class="tb-setting-row">
          <div class="tb-setting-info">
            <div class="tb-setting-label">Camera device</div>
            <div class="tb-setting-val" id="tb-setting-camera">—</div>
          </div>
        </div>
        <div class="tb-setting-row tb-setting-row-final">
          <button id="tb-setting-logout" class="clin-btn clin-btn-danger" style="width:100%;">🚪 Sign Out</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    const close = () => {
      panel.classList.remove("open");
    };
    panel.querySelector(".tb-settings-close").addEventListener("click", close);
    settingsBtn.addEventListener("click", () => {
      const openNow = panel.classList.toggle("open");
      settingsBtn.classList.toggle("active", openNow);
      if (openNow) populateSettings();
    });
    document.addEventListener("click", (e) => {
      if (panel.classList.contains("open") &&
          !panel.contains(e.target) &&
          e.target !== settingsBtn) {
        close();
      }
    });

    async function populateSettings() {
      try {
        const res = await fetch("/api/profile");
        const data = await res.json();
        if (data.status === "success") {
          const p = data.profile;
          $("tb-setting-patient").textContent = `${p.patient_name || p.patient_id || "—"}`;
          $("tb-setting-condition").textContent = p.selected_condition || "—";
          $("tb-setting-streak").textContent = `${p.current_streak || 1} Days`;
        }
      } catch (e) {}
      const soundOn = localStorage.getItem("rehab_sound_enabled") !== "0";
      $("tb-setting-sound").textContent = soundOn ? "On" : "Off";
      const visual = localStorage.getItem("rehab_visual_mode") || "Standard Medical";
      const visualMap = { standard: "Standard Medical", "high-contrast": "High Contrast", "reduced-motion": "Reduced Motion" };
      $("tb-setting-visual").textContent = visualMap[visual] || visual;
      const cam = localStorage.getItem("preferred_camera_id") || "Default camera";
      $("tb-setting-camera").textContent = cam;
      const colors = localStorage.getItem("rehab_colors");
      if (colors) {
        try {
          const c = JSON.parse(colors);
          $("tb-setting-color").textContent = `Primary ${c.primary || "—"} · Secondary ${c.secondary || "—"}`;
        } catch (e) {
          $("tb-setting-color").textContent = "—";
        }
      } else {
        $("tb-setting-color").textContent = "—";
      }
      $("tb-setting-logout").addEventListener("click", async () => {
        close();
        try { await fetch("/api/logout", { method: "POST" }); } catch (e) {}
        localStorage.removeItem("patientId");
        localStorage.removeItem("selectedCondition");
        window.location.href = "/auth";
      });
    }
  }

  // Unlock WebAudio on the first user interaction anywhere (iOS/Safari)
  document.addEventListener("pointerdown", () => {
    if (window.RehabBio) window.RehabBio.unlock();
  }, { once: true });

  // ---- Motion-Math & Vision Specs Modal -------------------------------
  const mathBtn = $("tb-math-btn");
  const mathModal = $("rehab-math-modal");
  if (mathBtn && mathModal) {
    const openMathModal = () => { mathModal.style.display = "flex"; };
    const closeMathModal = () => { mathModal.style.display = "none"; };
    mathBtn.addEventListener("click", openMathModal);
    const closeBtn = $("rmm-close");
    if (closeBtn) closeBtn.addEventListener("click", closeMathModal);
    const backdrop = $("rmm-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeMathModal);
    const confirmBtn = $("rmm-confirm");
    if (confirmBtn) confirmBtn.addEventListener("click", closeMathModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && mathModal.style.display !== "none") {
        closeMathModal();
      }
    });
  }

  // Boot
  loadProfile();
})();
