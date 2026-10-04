/**
 * RehabOpt AR — Clinical Report Card & AI SOAP
 * Loads the 6 biomarker summary, requests a structured SOAP progress
 * note through the zero-leak server proxy, and exports a 1-page PDF.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const els = {
    patientId: document.getElementById("report-patient-id"),
    condition: document.getElementById("report-condition"),
    streak: document.getElementById("report-streak"),
    sessions: document.getElementById("report-sessions"),
    rom: document.getElementById("report-rom"),
    smoothness: document.getElementById("report-smoothness"),
    cheats: document.getElementById("report-cheats"),
    duration: document.getElementById("report-duration"),
    adherence: document.getElementById("report-adherence"),
    date: document.getElementById("report-date"),
    date2: document.getElementById("report-date2"),
    soap: document.getElementById("soap-note"),
    generateBtn: document.getElementById("generate-soap-btn"),
    printBtn: document.getElementById("print-btn"),
    legLeft: document.getElementById("leg-left"),
    legRight: document.getElementById("leg-right"),
    legC6: document.getElementById("leg-c6"),
    legSnapshot: document.getElementById("leg-snapshot"),
    legSummary: document.getElementById("leg-summary"),
  };
  const toast = document.getElementById("toast");

  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 3200);
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
  if (els.date) els.date.textContent = `Date: ${today}`;
  if (els.date2) els.date2.textContent = today;

  const urlParams = new URLSearchParams(window.location.search);
  const targetPid = urlParams.get("patient_id");

  // --- Load biomarker summary --------------------------------------------
  async function loadStats() {
    try {
      const statsEndpoint = targetPid ? `/api/report/stats?patient_id=${encodeURIComponent(targetPid)}` : "/api/report/stats";
      const res = await fetch(statsEndpoint);
      const data = await res.json();
      if (data.status !== "success") return;
      const s = data.stats || {};
      const pid = s.patient_id || targetPid || localStorage.getItem("patientId") || "SP_00001";
      if (els.patientId) {
        els.patientId.textContent = s.patient_name ? `${pid} · ${s.patient_name}` : pid;
      }
      if (els.condition) els.condition.textContent = s.condition;
      if (els.streak) els.streak.textContent = `${s.streak} Day${s.streak === 1 ? "" : "s"}`;
      if (els.sessions) els.sessions.textContent = s.total_sessions;
      if (els.rom) els.rom.textContent = `${Math.round(s.peak_rom)}°`;
      if (els.smoothness) els.smoothness.textContent = `${Math.round(s.avg_smoothness)}/100`;
      if (els.cheats) els.cheats.textContent = s.total_cheats;
      if (els.duration) els.duration.textContent = `${Math.round(s.avg_duration)}s`;
      if (els.adherence) {
        els.adherence.textContent = `${s.streak} consecutive active days`;
      }

      // Surface the most recent logged leg routine if one exists for this patient
      if (els.legLeft && els.legRight && els.legC6 && els.legSnapshot) {
        let leg = null;
        try {
          const legEndpoint = targetPid ? `/api/telemetry/history?patient_id=${encodeURIComponent(targetPid)}&only_leg=1&limit=1` : "/api/telemetry/history?only_leg=1&limit=1";
          const legRes = await fetch(legEndpoint);
          const legData = await legRes.json();
          if (legData.status === "success" && legData.history && legData.history.length) {
            leg = legData.history[0];
          }
        } catch (e) { /* omit leg snapshot on network error */ }
        if (leg) {
          const lj = JSON.parse(leg.metrics_json || "{}");
          const L = Math.round(lj.left_max_deg || 0);
          const R = Math.round(lj.right_max_deg || 0);
          const c6 = lj.c6_sym != null ? Math.round(lj.c6_sym) : 0;
          els.legLeft.textContent = `${L}°`;
          els.legRight.textContent = `${R}°`;
          els.legC6.textContent = `${c6}%`;
          els.legSummary.textContent = legSnapText(L, R, c6);
          els.legSnapshot.classList.add("show");
        }
      }

      if (data.is_owner) {
        const dossierSec = document.getElementById("dossier-section");
        if (dossierSec) dossierSec.style.display = "block";

        const contactEl = document.getElementById("dossier-contact");
        const strokeEl = document.getElementById("dossier-stroke");
        const therapyEl = document.getElementById("dossier-therapy");
        const goalEl = document.getElementById("dossier-goal");

        const intake = data.intake || {};
        if (contactEl) {
          contactEl.textContent = `${intake.patient_name || s.patient_name || "Patient"} · DOB: ${intake.patient_dob || "—"} · Phone: ${intake.patient_phone || "—"}`;
        }
        if (strokeEl) {
          strokeEl.textContent = `Side: ${intake.affected_side || "Hemiparesis"} · Onset: ${intake.stroke_onset || intake.onset_ago || "Recent"}`;
        }
        if (therapyEl) {
          therapyEl.textContent = `Pain: ${intake.pain_level || "Mild"} · Therapy: ${intake.doing_therapy || "Self-guided"}`;
        }
        if (goalEl) {
          goalEl.textContent = `${intake.rehab_goal || "Improve functional range"} ${intake.goal_note ? "— " + intake.goal_note : ""}`;
        }

        loadTelemetryAudit(pid, data);
      }
    } catch (err) {
      console.error("Stats error:", err);
    }
  }

  // --- Pretty-render SOAP headings ([S]/[O]/[A]/[P] or S/O/A/P labels) ----
  function renderSoap(text) {
    const lines = String(text).split("\n");
    return lines.map((ln) => {
      const t = ln.trim();
      if (/^(\[S\]|SUBJECTIVE)/i.test(t)) return `<b style="color:#0F2A4A;">[S] Subjective</b>${t.replace(/^\[S\][\s:]*/i, " — ")}`;
      if (/^(\[O\]|OBJECTIVE)/i.test(t)) return `<b style="color:#0F2A4A;">[O] Objective</b>${t.replace(/^\[O\][\s:]*/i, " — ")}`;
      if (/^(\[A\]|ASSESSMENT)/i.test(t)) return `<b style="color:#0F2A4A;">[A] Assessment</b>${t.replace(/^\[A\][\s:]*/i, " — ")}`;
      if (/^(\[P\]|PLAN)/i.test(t)) return `<b style="color:#0F2A4A;">[P] Plan</b>${t.replace(/^\[P\][\s:]*/i, " — ")}`;
      return ln;
    }).join("\n");
  }

  // --- Generate AI SOAP Note (server-side Gemini proxy) -------------------
  if (els.generateBtn) {
    els.generateBtn.addEventListener("click", async () => {
      els.generateBtn.disabled = true;
      els.generateBtn.textContent = "⏳ Analyzing telemetry…";
      els.soap.textContent = "🤖 Clinical AI is synthesizing the SOAP progress note…";

      try {
        const statsEndpoint = targetPid ? `/api/report/stats?patient_id=${encodeURIComponent(targetPid)}` : "/api/report/stats";
        const statsRes = await fetch(statsEndpoint);
        const statsData = await statsRes.json();
        const s = statsData.status === "success" ? statsData.stats : {};

        const res = await fetch("/api/generate-soap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: s.patient_id || targetPid,
            condition: s.condition || "Hemiparesis",
            streak: s.streak || 1,
            repetitions_completed: 0,
            active_duration_seconds: Math.round(s.avg_duration || 0),
            metrics: {
              peak_elbow_rom_deg: s.peak_rom || 0,
              baseline_elbow_rom_deg: 60,
              trunk_cheat_events: s.total_cheats || 0,
              max_trunk_tilt_deg: 0,
              normalized_jerk_score: s.avg_smoothness || 0,
              mean_wrist_deviation_deg: 0,
              hand_dispersion_index: 0,
              tremor_frequency_hz: 0,
              leg_left_knee_deg: 0,
              leg_right_knee_deg: 0,
              leg_c6_sym: 0,
            },
          }),
        });

        const data = await res.json();
        if (data.status === "success") {
      els.soap.innerHTML = renderSoap(data.soap_note);
      // Refresh the leg snapshot after a new SOAP is generated (latest telemetry)
      try {
        const refreshRes = await fetch("/api/telemetry/history?only_leg=1&limit=1");
        const refreshData = await refreshRes.json();
        if (refreshData.status === "success" && refreshData.history && refreshData.history.length) {
          const leg = refreshData.history[0];
          const lj = JSON.parse(leg.metrics_json || "{}");
          const L = Math.round(lj.left_max_deg || 0);
          const R = Math.round(lj.right_max_deg || 0);
          const c6 = lj.c6_sym != null ? Math.round(lj.c6_sym) : 0;
          if (els.legLeft) els.legLeft.textContent = `${L}°`;
          if (els.legRight) els.legRight.textContent = `${R}°`;
          if (els.legC6) els.legC6.textContent = `${c6}%`;
          if (els.legSummary) els.legSummary.textContent = legSnapText(L, R, c6);
          if (els.legSnapshot) els.legSnapshot.classList.add("show");
        }
      } catch (e) { /* keep existing snapshot on error */ }
      showToast("✅ SOAP note generated", "success");
        } else {
          els.soap.innerHTML = `<b>⚠️ ${data.message || "Generation failed"}</b>`;
          showToast(`❌ ${data.message || "Generation failed"}`, "error");
        }
      } catch (err) {
        els.soap.textContent = "⚠️ Failed to reach the AI proxy. Check server configuration.";
        showToast("❌ Network error", "error");
      } finally {
        els.generateBtn.disabled = false;
        els.generateBtn.textContent = "🤖 Generate AI SOAP Note";
      }
    });
  }

  // --- One-page PDF export ------------------------------------------------
  if (els.printBtn) {
    els.printBtn.addEventListener("click", () => window.print());
  }

  // Leg snapshot interpretation text
  function legSnapText(L, R, c6) {
    if (L === 0 && R === 0) return "No leg routine has been completed yet.";
    if (Math.abs(L - R) <= 20) {
      return `Left knee reached ${L}° and right knee reached ${R}°. Your legs moved within 20° of each other — a good symmetry range to build on.`;
    }
    if (L > R) {
      return `Left knee reached ${L}° and right knee reached ${R}°. You have more range on the left side right now — the right side is the one to work on.`;
    }
    return `Left knee reached ${L}° and right knee reached ${R}°. You have more range on the right side right now — the left side is the one to work on.`;
  }

  // --- Recovery Quality Index (Performance Meter) ---
  async function loadRQI() {
    try {
      const rqiEndpoint = targetPid ? `/api/rqi?patient_id=${encodeURIComponent(targetPid)}` : "/api/rqi";
      const res = await fetch(rqiEndpoint);
      const data = await res.json();
      if (data.status !== "success") return;

      const tierEl = document.getElementById("report-rqi-tier");
      const labelEl = document.getElementById("report-rqi-label");
      const arcEl = document.getElementById("report-rqi-arc");
      const adhFill = document.getElementById("report-rqi-adh");
      const smoothFill = document.getElementById("report-rqi-smooth");
      const rangeFill = document.getElementById("report-rqi-range");
      const adhVal = document.getElementById("report-rqi-adh-val");
      const smoothVal = document.getElementById("report-rqi-smooth-val");
      const rangeVal = document.getElementById("report-rqi-range-val");

      const tierPercent = { starting: 15, steady: 40, strong: 65, peak: 90 };
      const pct = data.rqi_score != null ? Math.round(data.rqi_score) : (tierPercent[data.tier] || 15);

      if (tierEl) {
        tierEl.className = "ds-tier " + data.tier;
        tierEl.textContent = data.tier_emoji + " " + data.tier_label;
      }
      if (labelEl) {
        labelEl.innerHTML = `<span class="gauge-pct" style="font-size:24px; font-weight:800; color:#0F2A4A; display:block;">${pct}%</span><span class="gauge-sub" style="font-size:11px; font-weight:600; color:#64748B;">${data.tier_label}</span>`;
      }
      if (arcEl) {
        const offset = 251 - (251 * pct / 100);
        arcEl.style.strokeDashoffset = offset;
        const tierColors = { starting: "#66bb6a", steady: "#42a5f5", strong: "#fdd835", peak: "#ec407a" };
        arcEl.style.stroke = tierColors[data.tier] || "#10B981";
      }

      const adhPct = Math.min(100, Math.round(((data.streak || 1) / 7.0) * 100));
      if (adhFill) adhFill.style.width = `${adhPct}%`;
      if (adhVal) adhVal.textContent = `${data.streak || 1}/7 Days`;

      if (data.components) {
        const sPct = Math.round(data.components.smoothness * 100);
        const rPct = Math.round(data.components.range * 100);
        if (smoothFill) smoothFill.style.width = `${sPct}%`;
        if (rangeFill) rangeFill.style.width = `${rPct}%`;
        if (smoothVal) smoothVal.textContent = `${sPct}%`;
        if (rangeVal) rangeVal.textContent = `${rPct}%`;
      } else {
        if (smoothFill) smoothFill.style.width = "75%";
        if (rangeFill) rangeFill.style.width = "65%";
        if (smoothVal) smoothVal.textContent = "Good";
        if (rangeVal) rangeVal.textContent = "Progressing";
      }
    } catch (e) {
      console.warn("Report RQI load failed:", e);
    }
  }

  // --- Telemetry Session Audit & Full JSON Export for Controller ---
  async function loadTelemetryAudit(pid, fullData) {
    try {
      const histEndpoint = targetPid ? `/api/telemetry/history?patient_id=${encodeURIComponent(targetPid)}&limit=20` : "/api/telemetry/history?limit=20";
      const res = await fetch(histEndpoint);
      const data = await res.json();
      const tbody = document.getElementById("dossier-telemetry-tbody");
      if (!tbody) return;

      if (data.status === "success" && data.history && data.history.length) {
        tbody.innerHTML = data.history.map(row => `
          <tr style="border-bottom:1px solid #E2E8F0;">
            <td style="padding:6px 10px;">${(row.created_at || "—").replace("T", " ").slice(0, 16)}</td>
            <td style="padding:6px 10px;"><strong>${row.session_type || "Exercise"}</strong></td>
            <td style="padding:6px 10px;">${row.duration_seconds || 0}s</td>
            <td style="padding:6px 10px;">${Math.round(row.peak_rom || 0)}°</td>
            <td style="padding:6px 10px;">${Math.round(row.smoothness_score || 0)}/100</td>
            <td style="padding:6px 10px; font-weight:700; color:#10B981;">${row.score || 0}</td>
          </tr>
        `).join("");
      } else {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:10px; text-align:center; color:#94A3B8;">No telemetry sessions logged yet.</td></tr>`;
      }

      const downloadBtn = document.getElementById("download-json-btn");
      if (downloadBtn) {
        downloadBtn.onclick = () => {
          const exportPayload = {
            patient_id: pid,
            exported_at: new Date().toISOString(),
            stats: fullData.stats,
            intake: fullData.intake,
            telemetry_history: data.history || [],
          };
          const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `patient_audit_${pid}_${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast("📥 Full patient audit JSON downloaded", "success");
        };
      }
    } catch (e) {
      console.warn("Failed to load telemetry audit:", e);
    }
  }

  await loadStats();
  await loadRQI();
});
