/**
 * RehabOpt AR — Clinical Report Card & AI SOAP
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const patientIdEl = document.getElementById("report-patient-id");
  const conditionEl = document.getElementById("report-condition");
  const streakEl = document.getElementById("report-streak");
  const sessionsEl = document.getElementById("report-sessions");
  const romEl = document.getElementById("report-rom");
  const smoothnessEl = document.getElementById("report-smoothness");
  const cheatsEl = document.getElementById("report-cheats");
  const durationEl = document.getElementById("report-duration");
  const soapNoteEl = document.getElementById("soap-note");
  const generateBtn = document.getElementById("generate-soap-btn");
  const printBtn = document.getElementById("print-btn");
  const toast = document.getElementById("toast");

  function showToast(msg, type = "info") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => (toast.className = "toast"), 3000);
  }

  // --- Load Stats ---
  async function loadStats() {
    try {
      const res = await fetch("/api/report/stats");
      const data = await res.json();
      if (data.status === "success") {
        const s = data.stats;
        patientIdEl.textContent = `🪪 SP-${localStorage.getItem("patientId") || "000000001"}`;
        conditionEl.textContent = s.condition;
        streakEl.textContent = `🔥 ${s.streak} Days`;
        sessionsEl.textContent = s.total_sessions;
        romEl.textContent = `${s.peak_rom}°`;
        smoothnessEl.textContent = `${s.avg_smoothness}/100`;
        cheatsEl.textContent = s.total_cheats;
        durationEl.textContent = `${Math.round(s.avg_duration)}s`;
      }
    } catch (err) {
      console.error("Stats error:", err);
    }
  }

  // --- Generate SOAP Note (Server-Side Gemini Proxy) ---
  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = "⏳ Generating...";
    soapNoteEl.textContent = "🤖 AI is analyzing your telemetry data...";

    try {
      const statsRes = await fetch("/api/report/stats");
      const statsData = await statsRes.json();
      const s = statsData.stats;

      const res = await fetch("/api/generate-soap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          condition: s.condition,
          peak_rom: s.peak_rom,
          smoothness: s.avg_smoothness,
          cheats_blocked: s.total_cheats,
          streak: s.streak,
        }),
      });

      const data = await res.json();
      if (data.status === "success") {
        soapNoteEl.textContent = data.soap_note;
        showToast("✅ SOAP note generated!", "success");
      } else {
        soapNoteEl.textContent = `⚠️ ${data.message}`;
        showToast(`❌ ${data.message}`, "error");
      }
    } catch (err) {
      soapNoteEl.textContent = "⚠️ Failed to generate SOAP note. Check server configuration.";
      showToast("❌ Network error", "error");
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = "🤖 Generate AI SOAP Note";
    }
  });

  // --- Print / PDF Export ---
  printBtn.addEventListener("click", () => {
    window.print();
  });

  // --- Animate Background ---
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  let w, h;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function animate() {
    ctx.fillStyle = "#0a0808";
    ctx.fillRect(0, 0, w, h);

    // Subtle amber grid
    ctx.strokeStyle = "rgba(255, 106, 0, 0.02)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    requestAnimationFrame(animate);
  }
  animate();

  // Init
  await loadStats();
});
