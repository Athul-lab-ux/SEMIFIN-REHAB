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
      // ROM to "How far you can move"
      const romVal = s.peak_rom || 0;
      let romText = "Getting started";
      let romPct = 25;
      if (romVal >= 110) {
        romText = "Strong";
        romPct = 95;
      } else if (romVal >= 60) {
        romText = "Improving";
        romPct = 60;
      }
      snapRom.textContent = romText;
      const romBar = document.getElementById("snap-rom-bar");
      if (romBar) romBar.style.width = `${romPct}%`;

      // Smoothness to 1-5 stars
      const smoothVal = s.avg_smoothness || 0;
      let starCount = 1;
      if (smoothVal >= 80) starCount = 5;
      else if (smoothVal >= 65) starCount = 4;
      else if (smoothVal >= 50) starCount = 3;
      else if (smoothVal >= 30) starCount = 2;
      let starsHtml = "";
      for (let i = 0; i < 5; i++) {
        starsHtml += `<span class="${i < starCount ? 'star-filled' : 'star-empty'}">★</span>`;
      }
      snapSmooth.innerHTML = starsHtml;
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

  // ---- Master Controller Activity Center (SP_OWNER_1) ---------------------
  const ctrlCenter = document.getElementById("controller-center");
  if (ctrlCenter) {
    const totalPatientsEl = document.getElementById("ctrl-total-patients");
    const totalSessionsEl = document.getElementById("ctrl-total-sessions");
    const totalMinsEl = document.getElementById("ctrl-total-mins");
    const patientsTbody = document.getElementById("ctrl-patients-tbody");
    const recentStreamEl = document.getElementById("ctrl-recent-stream");
    const searchInput = document.getElementById("ctrl-patient-search");
    const filterSelect = document.getElementById("ctrl-condition-filter");
    const refreshBtn = document.getElementById("btn-refresh-patients");

    let loadedPatients = [];

    function renderPatientsTable() {
      if (!patientsTbody) return;
      const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
      const conditionFilter = filterSelect ? filterSelect.value : "ALL";

      const filtered = loadedPatients.filter((p) => {
        const matchesQuery =
          !query ||
          (p.patient_id && p.patient_id.toLowerCase().includes(query)) ||
          (p.patient_name && p.patient_name.toLowerCase().includes(query)) ||
          (p.email && p.email.toLowerCase().includes(query)) ||
          (p.username && p.username.toLowerCase().includes(query));

        const matchesCondition =
          conditionFilter === "ALL" || p.selected_condition === conditionFilter;

        return matchesQuery && matchesCondition;
      });

      if (filtered.length === 0) {
        patientsTbody.innerHTML = `
          <tr>
            <td colspan="8" style="padding:24px; text-align:center; color:#94A3B8;">
              ${loadedPatients.length === 0 ? "No patient activities recorded yet." : "No matching patients found."}
            </td>
          </tr>
        `;
        return;
      }

      patientsTbody.innerHTML = filtered
        .map(
          (p) => `
        <tr style="border-bottom:1px solid #E2E8F0; transition:background 0.2s;" onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background='transparent'">
          <td style="padding:10px 14px;">
            <span class="clin-chip" style="font-family:monospace; font-weight:800; background:#E0F2FE; color:#0369A1; padding:3px 7px; border-radius:5px; font-size:11.5px;">${p.patient_id}</span>
          </td>
          <td style="padding:10px 14px;">
            <div style="font-weight:700; color:#1E293B;">${p.patient_name || 'Patient'}</div>
            <div style="font-size:11px; color:#64748B;">${p.email || p.username || ''}</div>
          </td>
          <td style="padding:10px 14px;">
            <span style="font-weight:700; color:#334155;">${iconFor(p.selected_condition)} ${p.selected_condition || 'Hemiparesis'}</span>
          </td>
          <td style="padding:10px 14px;">
            <span style="font-weight:800; color:#EA580C;">🔥 ${p.current_streak || 1}d</span>
          </td>
          <td style="padding:10px 14px;">
            <strong>${p.session_count || 0}</strong> <span style="font-size:11px; color:#64748B;">(${p.total_minutes || 0}m)</span>
          </td>
          <td style="padding:10px 14px;">
            <strong>${Math.round(p.peak_rom || 0)}°</strong> <span style="font-size:11px; color:#64748B;">(${Math.round(p.avg_smoothness || 0)}/100)</span>
          </td>
          <td style="padding:10px 14px; font-size:11.5px; color:#64748B;">
            ${p.last_session_date || (p.created_at ? p.created_at.split(' ')[0] : 'Today')}
          </td>
          <td style="padding:10px 14px; text-align:center;">
            <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
              <a href="/report?patient_id=${encodeURIComponent(p.patient_id)}" class="clin-btn" style="padding:4px 8px; font-size:11px; text-decoration:none; background:#0284C7; color:#FFFFFF; border-radius:6px; font-weight:700; display:inline-block;">
                📋 Report
              </a>
              <button type="button" class="clin-btn inspect-btn" data-pid="${p.patient_id}" style="padding:4px 8px; font-size:11px; background:#F59E0B; color:#FFFFFF; border:none; border-radius:6px; font-weight:700; cursor:pointer;">
                🔍 Inspect
              </button>
            </div>
          </td>
        </tr>
      `
        )
        .join("");
    }

    function renderRecentStream(events) {
      if (!recentStreamEl) return;
      if (!events || events.length === 0) {
        recentStreamEl.innerHTML = `<div style="font-size:12px; color:#94A3B8; text-align:center;">No recent exercises logged yet.</div>`;
        return;
      }
      recentStreamEl.innerHTML = events
        .map(
          (e) => `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:6px 8px; border-bottom:1px dashed #E2E8F0;">
          <div>
            <strong style="color:#0369A1;">${e.patient_id}</strong> (${e.patient_name || 'Patient'}):
            <span style="color:#334155; font-weight:600;"> ${e.session_type}</span> · ${e.condition || 'General'}
          </div>
          <div style="color:#64748B; font-size:11.5px;">
            Duration: <strong>${e.duration_seconds || 0}s</strong> · Score: <strong style="color:#10B981;">${Math.round(e.score || 0)}</strong> · ${e.created_at ? e.created_at.slice(0, 16) : ''}
          </div>
        </div>
      `
        )
        .join("");
    }

    // Inspect Dossier Modal Logic
    const dossierModal = document.getElementById("ctrl-dossier-modal");
    const dossierCloseBtn = document.getElementById("dossier-close-btn");
    const dossierCloseFooter = document.getElementById("dossier-close-footer");

    function closeDossier() {
      if (dossierModal) dossierModal.style.display = "none";
    }

    if (dossierCloseBtn) dossierCloseBtn.addEventListener("click", closeDossier);
    if (dossierCloseFooter) dossierCloseFooter.addEventListener("click", closeDossier);
    if (dossierModal) {
      dossierModal.addEventListener("click", (e) => {
        if (e.target === dossierModal) closeDossier();
      });
    }

    async function inspectPatient(pid) {
      if (!pid) return;
      try {
        const res = await fetch(`/api/admin/patient/${encodeURIComponent(pid)}`);
        if (!res.ok) {
          alert("Failed to load patient dossier. Ensure you have controller privileges.");
          return;
        }
        const data = await res.json();
        if (data.status !== "success") return;

        const p = data.patient || {};
        const rqi = data.recovery_index || {};
        const comps = rqi.components || {};

        const dTitle = document.getElementById("dossier-title");
        if (dTitle) dTitle.textContent = `Dossier: ${p.patient_id} (${p.patient_name})`;
        const dPid = document.getElementById("dos-pid");
        if (dPid) dPid.textContent = p.patient_id;
        const dName = document.getElementById("dos-name");
        if (dName) dName.textContent = p.patient_name;
        const dEmail = document.getElementById("dos-email");
        if (dEmail) dEmail.textContent = p.email || "—";
        const dPhone = document.getElementById("dos-phone");
        if (dPhone) dPhone.textContent = p.patient_phone || "—";
        const dDob = document.getElementById("dos-dob");
        if (dDob) dDob.textContent = p.patient_dob || "—";
        const dCond = document.getElementById("dos-condition");
        if (dCond) dCond.textContent = p.selected_condition || "Hemiparesis";
        const dSide = document.getElementById("dos-side");
        if (dSide) dSide.textContent = p.affected_side || "—";
        const dOnset = document.getElementById("dos-onset");
        if (dOnset) dOnset.textContent = p.stroke_onset || "—";
        const dPain = document.getElementById("dos-pain");
        if (dPain) dPain.textContent = p.pain_level || "—";
        const dTherapy = document.getElementById("dos-therapy");
        if (dTherapy) dTherapy.textContent = p.doing_therapy || "—";
        const dStruggles = document.getElementById("dos-struggles");
        if (dStruggles) dStruggles.textContent = p.daily_struggles || "—";
        const dGoals = document.getElementById("dos-goals");
        if (dGoals) dGoals.textContent = `${p.rehab_goal || "—"} ${p.goal_note ? "— " + p.goal_note : ""}`;

        const dRqi = document.getElementById("dos-rqi-score");
        if (dRqi) dRqi.textContent = rqi.rqi_score != null ? rqi.rqi_score.toFixed(1) : "0.0";
        const dTier = document.getElementById("dos-rqi-tier");
        if (dTier) dTier.textContent = `${rqi.tier_emoji || "🌱"} ${rqi.tier_label || "Starting Out"}`;
        const dAdh = document.getElementById("dos-rqi-adh");
        if (dAdh) dAdh.textContent = comps.adherence != null ? comps.adherence.toFixed(3) : "0.000";
        const dStreak = document.getElementById("dos-streak-label");
        if (dStreak) dStreak.textContent = `Streak: ${rqi.streak || 1}d`;
        const dSmooth = document.getElementById("dos-rqi-smooth");
        if (dSmooth) dSmooth.textContent = comps.smoothness != null ? comps.smoothness.toFixed(3) : "0.000";
        const dSmoothLab = document.getElementById("dos-smooth-label");
        if (dSmoothLab) dSmoothLab.textContent = `Avg: ${Math.round(rqi.avg_smoothness || 0)}/100`;
        const dRange = document.getElementById("dos-rqi-range");
        if (dRange) dRange.textContent = comps.range != null ? comps.range.toFixed(3) : "0.000";
        const dRangeLab = document.getElementById("dos-range-label");
        if (dRangeLab) dRangeLab.textContent = `Peak: ${Math.round(rqi.peak_rom || 0)}°`;
        const dSess = document.getElementById("dos-sessions-val");
        if (dSess) dSess.textContent = `${rqi.total_sessions || 0} / ${rqi.total_exercise_minutes || 0}m`;

        const tBody = document.getElementById("dos-telemetry-tbody");
        if (tBody) {
          const hist = data.telemetry_history || [];
          if (hist.length === 0) {
            tBody.innerHTML = `<tr><td colspan="6" style="padding:10px; text-align:center; color:#94A3B8;">No telemetry sessions logged yet.</td></tr>`;
          } else {
            tBody.innerHTML = hist.map(r => `
              <tr style="border-bottom:1px solid #E2E8F0;">
                <td style="padding:6px 10px;">${(r.created_at || "—").replace("T", " ").slice(0, 16)}</td>
                <td style="padding:6px 10px;"><strong>${r.session_type || "Exercise"}</strong></td>
                <td style="padding:6px 10px;">${r.duration_seconds || 0}s</td>
                <td style="padding:6px 10px;">${Math.round(r.peak_rom || 0)}°</td>
                <td style="padding:6px 10px;">${Math.round(r.smoothness_score || 0)}/100</td>
                <td style="padding:6px 10px; font-weight:700; color:#10B981;">${Math.round(r.score || 0)}</td>
              </tr>
            `).join("");
          }
        }

        const soapList = document.getElementById("dos-soap-list");
        if (soapList) {
          const soaps = data.clinical_reports || [];
          if (soaps.length === 0) {
            soapList.innerHTML = `<div style="font-size:12px; color:#94A3B8; text-align:center; padding:10px;">No SOAP notes recorded.</div>`;
          } else {
            soapList.innerHTML = soaps.map(s => `
              <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:8px; padding:10px; font-size:12px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                  <strong style="color:#0F2A4A;">${s.report_type || "SOAP"} Report · ${s.status || "SAVED"}</strong>
                  <span style="color:#64748B;">${(s.created_at || "").slice(0, 16)}</span>
                </div>
                <div style="color:#334155; white-space:pre-wrap;">${s.soap_assessment || s.content || "Report generated"}</div>
              </div>
            `).join("");
          }
        }

        const btnReport = document.getElementById("dos-btn-report");
        if (btnReport) btnReport.href = `/report?patient_id=${encodeURIComponent(pid)}`;
        const btnProfile = document.getElementById("dos-btn-profile");
        if (btnProfile) btnProfile.href = `/profile?patient_id=${encodeURIComponent(pid)}`;

        if (dossierModal) dossierModal.style.display = "flex";
      } catch (err) {
        console.error("Dossier load error:", err);
      }
    }

    if (patientsTbody) {
      patientsTbody.addEventListener("click", (e) => {
        const btn = e.target.closest(".inspect-btn");
        if (btn) {
          const pid = btn.getAttribute("data-pid");
          inspectPatient(pid);
        }
      });
    }

    async function loadControllerActivities() {
      try {
        const res = await fetch("/api/admin/patients");
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== "success") return;

        if (totalPatientsEl) totalPatientsEl.textContent = data.summary.total_registered_patients || 0;
        if (totalSessionsEl) totalSessionsEl.textContent = data.summary.total_sessions_conducted || 0;
        if (totalMinsEl) totalMinsEl.textContent = `${data.summary.total_exercise_minutes || 0}m`;

        loadedPatients = data.patients || [];
        renderPatientsTable();
        renderRecentStream(data.recent_activity || []);
      } catch (err) {
        console.error("Controller activity load error:", err);
      }
    }

    if (searchInput) searchInput.addEventListener("input", renderPatientsTable);
    if (filterSelect) filterSelect.addEventListener("change", renderPatientsTable);
    if (refreshBtn) refreshBtn.addEventListener("click", loadControllerActivities);

    await loadControllerActivities();
  }

// --- Recovery Quality Index (Performance Meter) ---
async function loadRQI() {
  try {
    const res = await fetch('/api/rqi');
    const data = await res.json();
    if (data.status !== 'success') return;
    
    const tierEl = document.getElementById('rqi-tier');
    const labelEl = document.getElementById('rqi-label');
    const arcEl = document.getElementById('rqi-arc');
    
    if (tierEl) {
      tierEl.className = 'ds-tier ' + data.tier;
      tierEl.textContent = data.tier_emoji + ' ' + data.tier_label;
    }
    if (labelEl) {
      labelEl.textContent = data.tier_label;
    }
    if (arcEl) {
      // Arc length is ~251px (half circle). Calculate fill based on tier.
      const tierPercent = {starting: 15, steady: 40, strong: 65, peak: 90};
      const pct = tierPercent[data.tier] || 15;
      const offset = 251 - (251 * pct / 100);
      arcEl.style.strokeDashoffset = offset;
      
      // Color by tier
      const tierColors = {starting: '#66bb6a', steady: '#42a5f5', strong: '#fdd835', peak: '#ec407a'};
      arcEl.style.stroke = tierColors[data.tier] || '#10B981';
    }
  } catch(e) {
    console.warn('RQI load failed:', e);
  }
}

  await loadSnapshot();
  await loadRQI();
});
