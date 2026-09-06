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

  // --- Load biomarker summary --------------------------------------------
  async function loadStats() {
    try {
      const res = await fetch("/api/report/stats");
      const data = await res.json();
      if (data.status !== "success") return;
      const s = data.stats;
      const pid = localStorage.getItem("patientId") || "SP-000000001";
      if (els.patientId) els.patientId.textContent = pid;
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
        const statsRes = await fetch("/api/report/stats");
        const statsData = await statsRes.json();
        const s = statsData.status === "success" ? statsData.stats : {};

        const res = await fetch("/api/generate-soap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
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
            },
          }),
        });

        const data = await res.json();
        if (data.status === "success") {
          els.soap.innerHTML = renderSoap(data.soap_note);
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

  await loadStats();
});
