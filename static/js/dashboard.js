/**
 * Dashboard — Patient Command Center
 */
document.addEventListener("DOMContentLoaded", async () => {
  const patientIdEl = document.getElementById("patient-id-display");
  const streakEl = document.getElementById("streak-badge");
  const conditionSelect = document.getElementById("condition-select");
  const logoutBtn = document.getElementById("logout-btn");
  const toast = document.getElementById("toast");

  function showToast(message, type = "info") {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => (toast.className = "toast"), 3000);
  }

  // --- Load Profile ---
  async function loadProfile() {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.status === "success") {
        const p = data.profile;
        patientIdEl.textContent = `🪪 ${p.patient_id}`;
        streakEl.textContent = `🔥 ${p.current_streak || 1} Days Active`;
        conditionSelect.value = p.selected_condition || "Hemiparesis";
        localStorage.setItem("selectedCondition", p.selected_condition || "Hemiparesis");
      }
    } catch (err) {
      console.error("Profile load error:", err);
    }
  }

  // --- Load Streak ---
  async function loadStreak() {
    try {
      const res = await fetch("/api/streak");
      const data = await res.json();
      if (data.status === "success") {
        streakEl.textContent = `🔥 ${data.streak} Days Active`;
        localStorage.setItem("currentStreak", data.streak);
      }
    } catch (err) {
      console.error("Streak error:", err);
    }
  }

  // --- Condition Change ---
  conditionSelect.addEventListener("change", async () => {
    const condition = conditionSelect.value;
    try {
      const res = await fetch("/api/profile/condition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition }),
      });
      const data = await res.json();
      if (data.status === "success") {
        localStorage.setItem("selectedCondition", condition);
        showToast(`✅ Condition set to ${condition}`, "success");
      } else {
        showToast(`❌ ${data.message}`, "error");
      }
    } catch (err) {
      showToast("❌ Failed to update condition", "error");
    }
  });

  // --- Logout ---
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/auth";
    } catch (err) {
      window.location.href = "/auth";
    }
  });

  // --- Animate Background (Biometric Pulse Lattice) ---
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  let w, h, particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  resize();

  class Particle {
    constructor() {
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.r = Math.random() * 2 + 0.5;
      this.alpha = Math.random() * 0.4 + 0.1;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > w) this.vx *= -1;
      if (this.y < 0 || this.y > h) this.vy *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 106, 0, ${this.alpha})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 25; i++) particles.push(new Particle());

  let t = 0;
  let lastFrame = 0;
  const FRAME_INTERVAL = 33; // ~30fps cap
  function animateBg(timestamp) {
    requestAnimationFrame(animateBg);
    if (timestamp - lastFrame < FRAME_INTERVAL) return;
    lastFrame = timestamp;

    ctx.fillStyle = "#08090c";
    ctx.fillRect(0, 0, w, h);

    // Draw grid (simplified)
    ctx.strokeStyle = "rgba(255, 106, 0, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    particles.forEach((p) => {
      p.update();
      p.draw();
    });

    t += 0.01;
  }
  requestAnimationFrame(animateBg);

  // Init
  await loadProfile();
  await loadStreak();
});
