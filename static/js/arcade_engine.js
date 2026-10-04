/**
 * RehabOpt AR — Session 2: Arcade Arena Engine (11 therapeutic games)
 * ------------------------------------------------------------------
 * Featuring an independent 60 FPS requestAnimationFrame physics & render loop,
 * real-time MediaPipe Hand + Pose tracking with optical centroid fallback,
 * and mouse / touch pointer support for hybrid interaction.
 *
 * 11 Active Therapeutic Games (mapped to 13 clinical formulas):
 *  1. 🐦 Flappy Kinetic   (E3 · C5) — Wrist extension & dorsiflexion
 *  2. 🍉 Fruit Ballistic  (C3 · S2) — Open-palm ballistic reach
 *  3. ⭐ Star Catch        (C2)      — Horizontal planar sweep
 *  4. 🫧 Bubble Pop        (C2)      — Precision index finger pointing
 *  5. ⚖️ Balance Beam      (S1 · E6) — Steady isometric hold / tremor control
 *  6. 🎯 Track the Dot     (C2 · E4) — Smooth pursuit tracking & path error
 *  7. ✊ Fist Pop          (C3)      — Spasticity release (fist → open palm)
 *  8. 🔨 Wrist Hammer      (S2 · S3) — Fast downward wrist snap & acceleration
 *  9. 💪 Elbow Crusher     (C1)      — Elbow flexion ROM (<100°)
 * 10. 🐤 Flappy Reach      (C4)      — Vertical shoulder & arm elevation
 * 11. 🤏 Pinch Pop         (E2)      — Fine-motor thumb–index pincer precision
 */
document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- DOM Elements --------------------------------------
  const video = document.getElementById("video");
  const gameCanvas = document.getElementById("game-canvas");
  const gCtx = gameCanvas.getContext("2d");
  const overlayCanvas = document.getElementById("overlay-canvas");
  const oCtx = overlayCanvas.getContext("2d");
  const placeholder = document.getElementById("stage-placeholder");
  const gameListEl = document.getElementById("game-list");
  const scoreEl = document.getElementById("score-display");
  const timerEl = document.getElementById("timer-display");
  const comboEl = document.getElementById("combo-display");
  const heartsEl = document.getElementById("hearts-display");
  const metricEl = document.getElementById("metric-display");
  const guideLine = document.getElementById("guide-line");
  const kpiGame = document.getElementById("kpi-game");
  const kpiTrains = document.getElementById("kpi-trains");
  const kpiFormula = document.getElementById("kpi-formula");
  const kpiHand = document.getElementById("kpi-hand");
  const speedDisp = document.getElementById("speed-display");
  const toast = document.getElementById("toast");

  // ---------------- Math & Utility Helpers ----------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const distN = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function showToast(msg, type = "info") {
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 2600);
  }

  function handArray(res) {
    if (!res || !res.hand) return null;
    const arr = new Array(21);
    for (let i = 0; i < 21; i++) arr[i] = res.hand[i] || { x: 0, y: 0, z: 0 };
    return arr;
  }

  function handVariance(hm) {
    if (!hm) return 1;
    let cx = 0, cy = 0, n = 0;
    for (const k in hm) { if (hm[k]) { cx += hm[k].x; cy += hm[k].y; n++; } }
    if (n < 5) return 1;
    cx /= n; cy /= n;
    let s = 0;
    for (const k in hm) { if (hm[k]) s += (hm[k].x - cx) ** 2 + (hm[k].y - cy) ** 2; }
    return Math.sqrt(s / n);
  }

  // Floating score and particle effects system
  const particles = [];
  const popups = [];

  function addScorePopup(x, y, text, color = "#10B981") {
    if (popups.length > 15) popups.shift();
    popups.push({ x, y, text, color, alpha: 1.0, vy: -1.6 });
  }

  function spawnParticles(x, y, color, count = 12) {
    if (particles.length > 80) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = rand(1.5, 4.5);
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        r: rand(3, 6),
        color,
        life: 1.0,
        decay: rand(0.02, 0.05),
      });
    }
  }

  // ---------------- 7 Core Therapeutic Games ----------------
  const GAMES = {
    // 1. Fruit Slash
    fruit: {
      name: "Fruit Slash", emoji: "🍎", trains: "Index finger slicing & reaction speed",
      guide: "Slice rising fruits with your index fingertip! Avoid bombs 💣 (-15 pts)!",
      lives: false,
      init() {
        this.fruits = [];
        this.timer = 0;
        this.trail = [];
      },
      update(res, W, H) {
        const F = [
          { emoji: "🍉", color: "#EF4444" },
          { emoji: "🍊", color: "#F97316" },
          { emoji: "🍓", color: "#F43F5E" },
          { emoji: "🍍", color: "#FBBF24" },
          { emoji: "🍎", color: "#DC2626" },
        ];
        if (++this.timer > Math.max(16, 38 / this.$speed)) {
          this.timer = 0;
          const isBomb = Math.random() < 0.18;
          const sel = isBomb ? { emoji: "💣", color: "#475569" } : F[(Math.random() * F.length) | 0];
          this.fruits.push({
            x: rand(80, W - 80), y: H + 25,
            vx: rand(-1.6, 1.6), vy: rand(12.5, 16.5) * Math.min(1.2, this.$speed),
            emoji: sel.emoji, color: sel.color,
            bomb: isBomb, rot: 0, vrot: rand(-0.06, 0.06), gone: false,
          });
        }

        const tip = engine.tip ? { x: engine.tip.x * W, y: engine.tip.y * H } : null;
        if (tip) {
          this.trail.unshift({ ...tip, life: 1.0 });
          if (this.trail.length > 14) this.trail.pop();
        }
        this.trail.forEach((t) => { t.life -= 0.08; });
        this.trail = this.trail.filter((t) => t.life > 0);

        for (const f of this.fruits) {
          f.x += f.vx;
          f.y -= f.vy;
          f.vy -= 0.22; // higher gravity arc into middle/upper screen
          f.rot += f.vrot;

          if (tip && Math.hypot(tip.x - f.x, tip.y - f.y) < 55) {
            f.gone = true;
            if (f.bomb) {
              spawnParticles(f.x, f.y, "#EF4444", 32);
              if (window.RehabBio) window.RehabBio.playCheatBuzz();
              showToast("💣 BOMB HIT! −15 POINTS", "error");
              addScorePopup(f.x, f.y, "−15 💣 BOMB!", "#EF4444");
              this.$engine.deductScore(15);
            } else {
              this.$engine.addScore(10);
              spawnParticles(f.x, f.y, f.color, 16);
              addScorePopup(f.x, f.y, "+10 🍎 SLICE!", f.color);
              if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
                window.RehabBio.playBeep(980, 0.06, 0.25);
              }
            }
          }
        }
        this.fruits = this.fruits.filter((f) => !f.gone && f.y < H + 60);
      },
      draw(ctx, W, H) {
        if (this.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(this.trail[0].x, this.trail[0].y);
          for (let i = 1; i < this.trail.length; i++) {
            ctx.lineTo(this.trail[i].x, this.trail[i].y);
          }
          ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        for (const f of this.fruits) {
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.font = "42px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(f.emoji, 0, 0);
          ctx.restore();
        }
      },
    },

    // 2. Bubble Pop 2.0 (Wrist / Palm Grasp & Release Spasticity Game)
    bubblepop2: {
      name: "Bubble Pop 2.0", emoji: "🫧", trains: "Wrist & palm grasp-to-pop spasticity release",
      guide: "Align your open hand over a bubble, then CLENCH FIST ✊ to pop! Open hand 🖐️ to reload.",
      lives: false,
      init() {
        this.bubbles = [];
        this.timer = 0;
        this.readyToGrasp = true;
        this.palmCenter = { x: 0.5, y: 0.5 };
        this.openness = 1.0;
        this.isClosed = false;
        this.isOpen = true;
      },
      update(res, W, H) {
        // Calculate palm center and openness
        const hand = (res && res.hand) || (engine.lastRes && engine.lastRes.hand);
        if (hand && hand[0]) {
          const pIndices = [0, 5, 9, 13, 17];
          let cx = 0, cy = 0, count = 0;
          pIndices.forEach((idx) => {
            if (hand[idx]) { cx += hand[idx].x; cy += hand[idx].y; count++; }
          });
          this.palmCenter = {
            x: (cx / (count || 1)) * W,
            y: (cy / (count || 1)) * H,
          };

          const handSize = Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y) || 0.1;
          const tipDists = [8, 12, 16, 20].map((tip) =>
            hand[tip] ? Math.hypot(hand[tip].x - hand[0].x, hand[tip].y - hand[0].y) : handSize * 1.3
          );
          const avgDist = tipDists.reduce((a, b) => a + b, 0) / tipDists.length;
          this.openness = avgDist / handSize;
          this.isClosed = this.openness < 1.18;
          this.isOpen = this.openness > 1.42;
        } else if (engine.tip) {
          this.palmCenter = { x: engine.tip.x * W, y: engine.tip.y * H };
          this.isClosed = false;
          this.isOpen = true;
        }

        // Grasp state machine: if popped, must open hand to reload
        if (!this.readyToGrasp && this.isOpen) {
          this.readyToGrasp = true;
          if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
            window.RehabBio.playBeep(640, 0.04, 0.15);
          }
        }

        // Spawn bubbles slowly
        if (++this.timer > Math.max(35, 75 / this.$speed) && this.bubbles.length < 6) {
          this.timer = 0;
          const colors = ["#38BDF8", "#34D399", "#F472B6", "#FBBF24", "#A78BFA"];
          this.bubbles.push({
            x: rand(0.15, 0.85) * W,
            y: H + 30,
            vx: rand(-0.7, 0.7),
            vy: rand(1.4, 2.4) * this.$speed,
            r: rand(38, 48),
            color: colors[(Math.random() * colors.length) | 0],
            wobble: rand(0, Math.PI * 2),
            popped: false,
          });
        }

        // Update bubbles
        for (const b of this.bubbles) {
          b.x += b.vx + Math.sin(b.wobble) * 0.5;
          b.y -= b.vy;
          b.wobble += 0.05;

          const dist = Math.hypot(b.x - this.palmCenter.x, b.y - this.palmCenter.y);
          const inZone = dist < b.r + 40;

          // When in center and user clenches fist (Image 2)
          if (inZone && this.readyToGrasp && this.isClosed && !b.popped) {
            b.popped = true;
            this.readyToGrasp = false; // Must open to re-arm (Image 3)
            this.$engine.addScore(10);
            spawnParticles(b.x, b.y, b.color, 24);
            addScorePopup(this.palmCenter.x, this.palmCenter.y - 30, "+10 🫧 GRASP POP!", b.color);
            if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
              window.RehabBio.playBeep(1120, 0.08, 0.35);
            }
          }
        }
        this.bubbles = this.bubbles.filter((b) => !b.popped && b.y > -60);
      },
      draw(ctx, W, H) {
        // Draw bubbles with glossy shading
        for (const b of this.bubbles) {
          ctx.save();
          const dist = Math.hypot(b.x - this.palmCenter.x, b.y - this.palmCenter.y);
          const inZone = dist < b.r + 40;

          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fillStyle = inZone ? "rgba(251, 191, 36, 0.35)" : "rgba(56, 189, 248, 0.25)";
          ctx.fill();
          ctx.lineWidth = inZone ? 3.5 : 2;
          ctx.strokeStyle = inZone ? "#FBBF24" : b.color;
          ctx.stroke();

          // Bubble highlight sheen
          ctx.beginPath();
          ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
          ctx.fill();

          ctx.font = "24px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🫧", b.x, b.y);
          ctx.restore();
        }

        // Draw Player Palm Target Zone (The Wrist / Palm Center)
        ctx.save();
        const px = this.palmCenter.x;
        const py = this.palmCenter.y;

        // Outer Aura
        ctx.beginPath();
        ctx.arc(px, py, 48, 0, Math.PI * 2);
        if (!this.readyToGrasp) {
          ctx.strokeStyle = "rgba(249, 115, 22, 0.7)"; // Orange: waiting to open hand
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else if (this.isClosed) {
          ctx.strokeStyle = "rgba(16, 185, 129, 0.95)"; // Green: Fist clenched!
          ctx.lineWidth = 4;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(56, 189, 248, 0.85)"; // Cyan: Open & Ready!
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Center hand status icon
        ctx.font = "26px Segoe UI Emoji, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.isClosed ? "✊" : "🖐️", px, py);

        // Feedback prompt below hand
        ctx.font = "bold 13px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        if (!this.readyToGrasp) {
          ctx.fillStyle = "#F97316";
          ctx.fillText("🖐️ Open hand to reload!", px, py + 48);
        } else {
          ctx.fillStyle = "#10B981";
          ctx.fillText("Catch bubble & Squeeze ✊", px, py + 48);
        }
        ctx.restore();
      },
    },

    // 3. Sky Pop
    starcatch: {
      name: "Sky Pop", emoji: "⭐", trains: "Target interception & pointing",
      guide: "Things fall from top to bottom! Pop falling stars ⭐ and gems 💎 with your index finger!",
      lives: false,
      init() {
        this.items = [];
        this.timer = 0;
      },
      update(res, W, H) {
        if (++this.timer > Math.max(16, 38 / this.$speed) && this.items.length < 8) {
          this.timer = 0;
          const isGem = Math.random() < 0.4;
          this.items.push({
            x: rand(0.1, 0.9) * W,
            y: -25,
            vy: rand(2.2, 4.2) * this.$speed,
            emoji: isGem ? "💎" : "⭐",
            color: isGem ? "#38BDF8" : "#FBBF24",
            r: 26,
            popped: false,
          });
        }

        const tip = engine.tip ? { x: engine.tip.x * W, y: engine.tip.y * H } : null;

        for (const it of this.items) {
          it.y += it.vy;
          if (tip && Math.hypot(tip.x - it.x, tip.y - it.y) < it.r + 28) {
            it.popped = true;
            this.$engine.addScore(10);
            spawnParticles(it.x, it.y, it.color, 16);
            addScorePopup(it.x, it.y - 15, `+10 ${it.emoji} POP!`, it.color);
            if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
              window.RehabBio.playBeep(1050, 0.06, 0.25);
            }
          }
          if (it.y > H + 30) {
            it.popped = true;
          }
        }
        this.items = this.items.filter((it) => !it.popped);
      },
      draw(ctx, W, H) {
        for (const it of this.items) {
          ctx.save();
          ctx.font = "34px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(it.emoji, it.x, it.y);
          ctx.restore();
        }
      },
    },

    // 4. Bubble Burst
    bubblepop: {
      name: "Bubble Burst", emoji: "🫧", trains: "Precision fingertip coordination",
      guide: "Floating bubbles appear across the screen! Pop them quickly with your index fingertip!",
      lives: false,
      init() {
        this.bubbles = [];
        this.timer = 0;
      },
      update(res, W, H) {
        if (++this.timer > Math.max(16, 36 / this.$speed) && this.bubbles.length < 9) {
          this.timer = 0;
          const colors = ["#38BDF8", "#F43F5E", "#10B981", "#FBBF24", "#A855F7"];
          this.bubbles.push({
            x: rand(0.12, 0.88) * W,
            y: rand(0.15, 0.85) * H,
            vx: rand(-0.6, 0.6),
            vy: rand(-0.6, 0.6),
            r: rand(24, 36),
            color: colors[(Math.random() * colors.length) | 0],
            life: 240,
            popped: false,
          });
        }

        const tip = engine.tip ? { x: engine.tip.x * W, y: engine.tip.y * H } : null;

        for (const b of this.bubbles) {
          b.x += b.vx;
          b.y += b.vy;
          b.life--;

          if (tip && Math.hypot(tip.x - b.x, tip.y - b.y) < b.r + 20) {
            b.popped = true;
            this.$engine.addScore(10);
            spawnParticles(b.x, b.y, b.color, 16);
            addScorePopup(b.x, b.y - 15, "+10 🫧 POP!", b.color);
            if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
              window.RehabBio.playBeep(900, 0.05, 0.2);
            }
          }
        }
        this.bubbles = this.bubbles.filter((b) => !b.popped && b.life > 0);
      },
      draw(ctx, W, H) {
        for (const b of this.bubbles) {
          ctx.save();
          ctx.fillStyle = b.color;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.fillStyle = "#FFFFFF";
          ctx.beginPath();
          ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      },
    },

    // 5. Aero Flappy Bird
    flappy: {
      name: "Flappy Bird", emoji: "🐦", trains: "Index finger elevation & vertical flight control",
      guide: "Move your index finger UP to fly the bird UP, move finger DOWN to glide DOWN! Glide past pillars!",
      lives: true,
      init() {
        this.bird = { x: 130, y: 250, r: 18, frame: 0, hit: 0 };
        this.pillars = [];
        this.pillarTimer = 0;
      },
      update(res, W, H) {
        const b = this.bird;
        b.frame++;
        if (b.hit > 0) b.hit--;

        if (engine.tip) {
          const targetY = clamp(engine.tip.y * H, 35, H - 35);
          b.y += (targetY - b.y) * 0.22;
          const targetX = clamp(engine.tip.x * W, 80, W * 0.45);
          b.x += (targetX - b.x) * 0.18;
        } else {
          b.y += Math.sin(b.frame * 0.05) * 1.5;
        }

        if (++this.pillarTimer > Math.max(75, 115 / this.$speed)) {
          this.pillarTimer = 0;
          this.pillars.push({
            x: W + 20,
            gapY: rand(80, H - 240),
            gapH: 165,
            scored: false,
          });
        }

        for (const p of this.pillars) {
          p.x -= 2.6 * this.$speed;
          if (!p.scored && p.x + 55 < b.x) {
            p.scored = true;
            this.$engine.addScore(2);
            addScorePopup(b.x + 20, b.y - 20, "+2", "#10B981");
          }
          if (!p.scored && b.hit === 0 && Math.abs(b.x - (p.x + 27)) < 18 + 27 && (b.y < p.gapY || b.y > p.gapY + p.gapH)) {
            b.hit = 45;
            this.$engine.loseLife();
            spawnParticles(b.x, b.y, "#EF4444", 16);
          }
        }
        this.pillars = this.pillars.filter((p) => p.x > -90);

        if (b.hit === 0 && (b.y > H - 15 || b.y < 15)) {
          b.hit = 45;
          this.$engine.loseLife();
          spawnParticles(b.x, b.y, "#EF4444", 14);
        }
      },
      draw(ctx, W, H) {
        for (const p of this.pillars) {
          const grad = ctx.createLinearGradient(p.x, 0, p.x + 55, 0);
          grad.addColorStop(0, "#15803D");
          grad.addColorStop(0.5, "#22C55E");
          grad.addColorStop(1, "#166534");
          ctx.fillStyle = grad;
          ctx.fillRect(p.x, 0, 55, p.gapY);
          ctx.fillRect(p.x, p.gapY + p.gapH, 55, H - (p.gapY + p.gapH));
          ctx.fillStyle = "#14532D";
          ctx.fillRect(p.x - 4, p.gapY - 18, 63, 18);
          ctx.fillRect(p.x - 4, p.gapY + p.gapH, 63, 18);
        }
        const b = this.bird;
        ctx.save();
        ctx.translate(b.x, b.y);
        if (b.hit > 0 && Math.floor(b.hit / 4) % 2 === 0) ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#F59E0B";
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#FBBF24";
        const wingY = Math.sin(b.frame * 0.3) * 5;
        ctx.beginPath(); ctx.ellipse(-6, wingY, 9, 6, 0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#FFF"; ctx.beginPath(); ctx.arc(7, -4, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(8, -4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#DC2626"; ctx.beginPath(); ctx.moveTo(14, -2); ctx.lineTo(24, 2); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
      },
    },

    // 6. Cosmic Laser Blast
    laserblast: {
      name: "Laser Blast", emoji: "⚡", trains: "Target pointing & rapid reactions",
      guide: "Cosmic targets light up! Point your index finger to shoot precision laser beams!",
      lives: false,
      init() {
        this.targets = [];
        this.timer = 0;
      },
      update(res, W, H) {
        if (++this.timer > Math.max(22, 45 / this.$speed) && this.targets.length < 5) {
          this.timer = 0;
          this.targets.push({
            x: rand(0.15, 0.85) * W,
            y: rand(0.15, 0.8) * H,
            r: 30,
            pulse: 0,
            timeOut: 200,
            destroyed: false,
          });
        }

        const tip = engine.tip ? { x: engine.tip.x * W, y: engine.tip.y * H } : null;

        for (const t of this.targets) {
          t.pulse += 0.08;
          t.timeOut--;

          if (tip && Math.hypot(tip.x - t.x, tip.y - t.y) < t.r + 25) {
            t.destroyed = true;
            this.$engine.addScore(15);
            spawnParticles(t.x, t.y, "#38BDF8", 22);
            addScorePopup(t.x, t.y - 15, "+15 ⚡ BLAST!", "#38BDF8");
            if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
              window.RehabBio.playBeep(1200, 0.08, 0.35);
            }
          }
          if (t.timeOut <= 0) {
            t.destroyed = true;
          }
        }
        this.targets = this.targets.filter((t) => !t.destroyed);
      },
      draw(ctx, W, H) {
        const tip = engine.tip ? { x: engine.tip.x * W, y: engine.tip.y * H } : null;

        if (tip) {
          ctx.save();
          ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 22, 0, Math.PI * 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(tip.x - 30, tip.y); ctx.lineTo(tip.x + 30, tip.y);
          ctx.moveTo(tip.x, tip.y - 30); ctx.lineTo(tip.x, tip.y + 30);
          ctx.stroke();
          ctx.restore();
        }

        for (const t of this.targets) {
          ctx.save();
          ctx.strokeStyle = "#EF4444";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r + Math.sin(t.pulse) * 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(239, 68, 68, 0.3)";
          ctx.fill();
          ctx.font = "24px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("🎯", t.x, t.y);
          ctx.restore();
        }
      },
    },

    // 7. Finger Count (Open & Close Finger Isolation Game)
    fingercount: {
      name: "Finger Count", emoji: "🖐️", trains: "Individual finger extension & count coordination",
      guide: "Look at the screen: show the exact number of fingers prompted (1 to 5) and hold steady!",
      lives: false,
      init() {
        this.target = Math.floor(rand(1, 6)); // 1 to 5
        this.detected = 0;
        this.matchTime = 0;
        this.dwellNeeded = 0.45 / this.$speed; // seconds
        this.lastT = performance.now();
        this.fingerEmojis = { 1: "☝️", 2: "✌️", 3: "🤟", 4: "🖖", 5: "🖐️" };
      },
      update(res, W, H) {
        const now = performance.now();
        const dt = Math.max(0.001, (now - this.lastT) / 1000);
        this.lastT = now;

        const hand = (res && res.hand) || (engine.lastRes && engine.lastRes.hand);
        if (hand && hand[0]) {
          const handSize = Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y) || 0.1;

          // Thumb tip (4) vs pinky MCP (17) and thumb MCP (2)
          const thumbExt = Math.hypot(hand[4].x - hand[17].x, hand[4].y - hand[17].y) >
                           Math.hypot(hand[3].x - hand[17].x, hand[3].y - hand[17].y) * 1.15 &&
                           Math.hypot(hand[4].x - hand[2].x, hand[4].y - hand[2].y) > handSize * 0.42;

          // 4 Fingers: Tip dist to wrist > PIP dist to wrist * 1.18
          const indexExt = hand[8] && hand[6] && Math.hypot(hand[8].x - hand[0].x, hand[8].y - hand[0].y) > Math.hypot(hand[6].x - hand[0].x, hand[6].y - hand[0].y) * 1.18;
          const middleExt = hand[12] && hand[10] && Math.hypot(hand[12].x - hand[0].x, hand[12].y - hand[0].y) > Math.hypot(hand[10].x - hand[0].x, hand[10].y - hand[0].y) * 1.18;
          const ringExt = hand[16] && hand[14] && Math.hypot(hand[16].x - hand[0].x, hand[16].y - hand[0].y) > Math.hypot(hand[14].x - hand[0].x, hand[14].y - hand[0].y) * 1.18;
          const pinkyExt = hand[20] && hand[18] && Math.hypot(hand[20].x - hand[0].x, hand[20].y - hand[0].y) > Math.hypot(hand[18].x - hand[0].x, hand[18].y - hand[0].y) * 1.18;

          this.detected = (thumbExt ? 1 : 0) + (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);
        } else {
          this.detected = 0;
        }

        // Match validation with dwell timer
        if (this.detected === this.target) {
          this.matchTime += dt;
          if (this.matchTime >= this.dwellNeeded) {
            this.matchTime = 0;
            this.$engine.addScore(15);
            spawnParticles(W / 2, H * 0.35, "#10B981", 24);
            addScorePopup(W / 2, H * 0.35, `+15 🎯 ${this.target} FINGERS!`, "#10B981");
            if (window.RehabBio && typeof window.RehabBio.playBeep === "function") {
              window.RehabBio.playBeep(880, 0.08, 0.3);
            }
            // Pick new target different from current
            let nextTarget = Math.floor(rand(1, 6));
            while (nextTarget === this.target) {
              nextTarget = Math.floor(rand(1, 6));
            }
            this.target = nextTarget;
          }
        } else {
          this.matchTime = Math.max(0, this.matchTime - dt * 1.5);
        }
      },
      draw(ctx, W, H) {
        ctx.save();
        // Central Challenge Display Card
        const cardW = 340;
        const cardH = 210;
        const cardX = (W - cardW) / 2;
        const cardY = H * 0.16;

        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 16);
        ctx.fill();
        ctx.strokeStyle = this.detected === this.target ? "#10B981" : "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 3;
        ctx.stroke();

        // Target Prompt
        ctx.fillStyle = "#94A3B8";
        ctx.font = "bold 13px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("TARGET CHALLENGE", W / 2, cardY + 28);

        // Big Target Number & Emoji
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 36px Segoe UI, sans-serif";
        const emoji = this.fingerEmojis[this.target] || "🖐️";
        ctx.fillText(`SHOW ${this.target} ${emoji}`, W / 2, cardY + 74);

        // Dwell Progress Ring if matching
        if (this.detected === this.target) {
          const progress = Math.min(1.0, this.matchTime / this.dwellNeeded);
          ctx.beginPath();
          ctx.arc(W / 2, cardY + 130, 28, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
          ctx.strokeStyle = "#10B981";
          ctx.lineWidth = 5;
          ctx.stroke();
        }

        // Detected Feedback
        ctx.font = "bold 17px Segoe UI, sans-serif";
        ctx.fillStyle = this.detected === this.target ? "#10B981" : "#FBBF24";
        const statusText = this.detected === this.target
          ? `Holding: ${this.detected} ✅`
          : `Detected: ${this.detected} (Need ${this.target})`;
        ctx.fillText(statusText, W / 2, cardY + 135);

        ctx.fillStyle = "#CBD5E1";
        ctx.font = "12px Segoe UI, sans-serif";
        ctx.fillText("Hold hand facing camera", W / 2, cardY + 184);
        ctx.restore();
      },
    },
  };

  const GAME_KEYS = Object.keys(GAMES);

  // ---------------- Engine State ---------------------------------------
  const engine = {
    game: null,
    key: null,
    playing: false,
    paused: false,
    startedAt: 0,
    score: 0,
    combo: 0,
    lives: 3,
    duration: 60,
    speed: 1,
    tip: null,
    tipFromCamera: false,
    dev: 0,
    wristPitch: 0,
    elbow: 180,
    open: false,
    disp: 0,
    vel: 0,
    vy: 0,
    dy: 0,
    last: null,
    lastT: 0,
    arm: null,
    lastRes: null,
    visionStarted: false,
  };

  function setKPI(game) {
    if (kpiGame) kpiGame.textContent = `${game.emoji} ${game.name}`;
    if (kpiTrains) kpiTrains.textContent = game.trains;
    if (guideLine) guideLine.textContent = `💬 ${game.guide}`;
    document.querySelectorAll(".game-btn").forEach((b) => b.classList.toggle("selected", b.dataset.game === engine.key));
    if (heartsEl && heartsEl.parentElement) {
      heartsEl.parentElement.style.display = game.lives ? "" : "none";
    }
  }

  // Populate horizontal shelf buttons (Clean emoji + name chips, zero formula clutter)
  GAME_KEYS.forEach((id) => {
    const g = GAMES[id];
    const btn = document.createElement("button");
    btn.className = "game-btn";
    btn.dataset.game = id;
    btn.setAttribute("aria-label", `Play ${g.name}`);
    btn.innerHTML = `<span class="g-icon">${g.emoji}</span><span class="g-name">${g.name}</span>`;
    btn.addEventListener("click", () => selectGame(id));
    gameListEl.appendChild(btn);
  });

  // Countdown Overlay
  let arcadeCountdownTimer = null;
  function runArcadeCountdown(label, seconds, onComplete) {
    const overlay = document.getElementById("arcade-countdown-overlay");
    const numEl = document.getElementById("aco-num");
    const labEl = document.getElementById("aco-label");
    if (!overlay || !numEl) {
      if (onComplete) onComplete();
      return;
    }
    if (arcadeCountdownTimer) clearInterval(arcadeCountdownTimer);
    let remaining = seconds;
    labEl.textContent = label;
    numEl.textContent = remaining;
    overlay.classList.add("show");
    if (window.RehabBio) window.RehabBio.speak(`${label}. ${remaining}`);

    arcadeCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining > 0) {
        numEl.textContent = remaining;
        if (window.RehabBio) window.RehabBio.speak(`${remaining}`);
      } else {
        clearInterval(arcadeCountdownTimer);
        arcadeCountdownTimer = null;
        numEl.textContent = "GO!";
        if (window.RehabBio) window.RehabBio.speak("Go!");
        setTimeout(() => {
          overlay.classList.remove("show");
          if (onComplete) onComplete();
        }, 500);
      }
    }, 1000);
  }

  function pauseGame() {
    if (!engine.playing || engine.paused) return;
    engine.paused = true;
    document.getElementById("btn-pause").style.display = "none";
    document.getElementById("btn-resume").style.display = "inline-flex";
    document.getElementById("arcade-paused-overlay").classList.add("show");
    if (window.RehabBio) window.RehabBio.speak("Game paused");
  }

  function resumeGame() {
    document.getElementById("arcade-paused-overlay").classList.remove("show");
    runArcadeCountdown("RESUMING IN", 4, () => {
      engine.paused = false;
      document.getElementById("btn-resume").style.display = "none";
      document.getElementById("btn-pause").style.display = "inline-flex";
    });
  }

  async function selectGame(id) {
    engine.key = id;
    engine.game = { ...GAMES[id] };
    engine.game.$engine = { addScore, deductScore, loseLife, state: engine };
    engine.game.$speed = engine.speed;
    setKPI(engine.game);
    placeholder.style.display = "none";
    document.querySelectorAll(".game-btn").forEach((b) => b.classList.toggle("selected", b.dataset.game === id));

    // Connect camera in parallel without blocking countdown
    if (!engine.visionStarted) {
      startVision();
    }

    runArcadeCountdown("GET READY", 4, () => {
      engine.game.init.call(engine.game);
      engine.score = 0;
      engine.combo = 0;
      engine.lives = 3;
      engine.paused = false;
      engine.playing = true;
      engine.startedAt = Date.now();
      document.getElementById("btn-start").style.display = "none";
      document.getElementById("btn-pause").style.display = "inline-flex";
      document.getElementById("btn-resume").style.display = "none";
      document.getElementById("btn-stop").style.display = "inline-flex";
      showToast(`${GAMES[id].emoji} ${GAMES[id].name} — GO!`, "success");
      if (window.RehabBio) window.RehabBio.playSetChime();
      updateHUD();
    });
  }

  function stopGame(message) {
    engine.playing = false;
    engine.paused = false;
    if (engine.game) logSession();
    engine.game = null;
    engine.key = null;
    placeholder.style.display = "";
    if (kpiGame) kpiGame.textContent = "—";
    if (kpiTrains) kpiTrains.textContent = "—";
    if (kpiFormula) kpiFormula.textContent = "—";
    if (guideLine) guideLine.textContent = "💬 Select a game from the top bar to begin.";
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    document.querySelectorAll(".game-btn").forEach((b) => b.classList.remove("selected"));
    document.getElementById("arcade-paused-overlay").classList.remove("show");
    document.getElementById("arcade-countdown-overlay").classList.remove("show");
    document.getElementById("btn-start").style.display = "inline-flex";
    document.getElementById("btn-pause").style.display = "none";
    document.getElementById("btn-resume").style.display = "none";
    document.getElementById("btn-stop").style.display = "none";

    // Turn off camera hardware LED when session stops
    if (engine.visionStarted) {
      VisionLoader.stop();
      engine.visionStarted = false;
      const btnCamToggle = document.getElementById("btn-cam-toggle");
      if (btnCamToggle) {
        btnCamToggle.textContent = "📷 Camera: OFF";
        btnCamToggle.classList.add("danger");
      }
    }

    updateHUD();
    if (message) showToast(message, "error");
  }

  function addScore(pts) {
    engine.score += pts;
    engine.combo += 1;
    if (window.RehabBio) window.RehabBio.playBeep(700 + Math.min(400, engine.combo * 15), 0.06, 0.25);
  }

  function deductScore(pts) {
    engine.score = Math.max(0, engine.score - pts);
    engine.combo = 0;
  }

  function loseLife() {
    engine.lives -= 1;
    engine.combo = 0;
    if (window.RehabBio) window.RehabBio.playCheatBuzz();
    if (engine.lives <= 0) {
      showToast("💔 Game Over — logging session…", "error");
      setTimeout(() => stopGame("Game Over: Out of lives"), 1400);
    }
  }

  function updateHUD() {
    scoreEl.textContent = engine.score;
    if (engine.key === "flappy") {
      timerEl.textContent = engine.playing ? fmt(Date.now() - engine.startedAt) : "00:00";
    } else {
      const elapsedSec = (Date.now() - engine.startedAt) / 1000;
      const remainingSec = Math.max(0, Math.ceil((engine.duration || 60) - elapsedSec));
      timerEl.textContent = engine.playing ? fmt(remainingSec * 1000) : fmt((engine.duration || 60) * 1000);
      if (engine.playing && remainingSec <= 0) {
        showToast(`⏰ Time's Up! Final Score: ${engine.score}`, "success");
        stopGame(`Time's Up! Final Score: ${engine.score}`);
        return;
      }
    }
    comboEl.textContent = engine.combo >= 3 ? `⚡${(engine.combo / 3) | 0}x` : "—";
    heartsEl.textContent = "❤️".repeat(Math.max(0, engine.lives)) + "🖤".repeat(Math.max(0, 3 - engine.lives));
  }

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  // ---------------- Camera Vision Boot --------------------------------
  async function startVision() {
    if (engine.visionStarted) return;
    if (window.RehabQA) {
      window.RehabQA.runStressTest(window.RehabQA.STRESS_TARGET);
    }
    const ok = await VisionLoader.start(video, onFrame);
    if (ok) {
      engine.visionStarted = true;
      VisionLoader.watch();
      const btnCamToggle = document.getElementById("btn-cam-toggle");
      if (btnCamToggle) {
        btnCamToggle.textContent = "📷 Camera: ON";
        btnCamToggle.classList.remove("danger");
      }
      showToast("✅ Camera active — enjoy your session!", "success");
    } else {
      showToast("ℹ️ Camera stream initializing — you can also use touch/mouse!", "info");
    }
  }

  // Auto-boot camera on page load for immediate readiness
  startVision();

  // ---------------- Vision Callback -----------------------------------
  function computeFrame(res) {
    // Landmark tracking (Prioritizes index fingertip Landmark 8, with Wrist Landmark 0 support)
    if (res.hand && res.hand[8]) {
      engine.tip = { x: res.hand[8].x, y: res.hand[8].y };
      engine.tipFromCamera = true;
    } else if (res.hand && res.hand[0]) {
      engine.tip = { x: res.hand[0].x, y: res.hand[0].y };
      engine.tipFromCamera = true;
    }

    const now = Date.now();
    const dt = Math.max(0.001, (now - engine.lastT) / 1000);
    if (engine.tip && engine.last) {
      engine.vel = Math.hypot(engine.tip.x - engine.last.x, engine.tip.y - engine.last.y) / dt;
      engine.dy = engine.tip.y - engine.last.y;
      engine.vy = engine.dy / dt;
    } else {
      engine.vel = 0; engine.dy = 0; engine.vy = 0;
    }
    engine.last = engine.tip ? { ...engine.tip } : null;
    engine.lastT = now;

    // Hand dispersion (C3)
    const hm = handArray(res);
    if (hm && window.Kinematics) {
      engine.disp = Kinematics.calculateHandDispersion(hm);
      engine.open = engine.disp > 0.22;
    }

    // Wrist deviation (E3)
    if (res.hand && res.hand[0] && res.hand[5] && res.hand[12] && window.Kinematics) {
      engine.dev = Kinematics.calculateWristDeviation(
        { x: res.hand[5].x, y: res.hand[5].y },
        { x: res.hand[0].x, y: res.hand[0].y },
        { x: res.hand[12].x, y: res.hand[12].y }
      );
    }

    // Horizontal Wrist Pitch (Exact 7M Posture: forearm horizontal across body, closed fist)
    if (res.hand && res.hand[0] && (res.hand[9] || res.hand[12])) {
      const wr = res.hand[0];
      const kn = res.hand[9] || res.hand[12];
      const dy = wr.y - kn.y;
      const dx = Math.abs(kn.x - wr.x);
      engine.wristPitch = (Math.atan2(dy, Math.max(0.03, dx)) * 180) / Math.PI;
    } else {
      engine.wristPitch = 0;
    }

    // Elbow angle (C1)
    let a = null;
    if (res.chain && res.chain.sh && res.chain.el && res.chain.wr) {
      a = res.chain;
    } else if (res.pose) {
      const cands = [
        { sh: res.pose[12], el: res.pose[14], wr: res.pose[16] },
        { sh: res.pose[11], el: res.pose[13], wr: res.pose[15] },
      ];
      for (const c of cands) {
        if (c.sh && c.el && c.wr && (c.sh.x !== 0 || c.sh.y !== 0)) { a = c; break; }
      }
    }
    engine.elbow = (a && window.Kinematics) ? Kinematics.calculateJointAngle(a.sh, a.el, a.wr) : 180;
    engine.arm = a;
  }

  function onFrame(res) {
    computeFrame(res);
  }

  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17],            // Knuckle base
  ];

  function drawHammerGraphic(ctx, wrist, knuckle, W, H) {
    const wx = wrist.x * W, wy = wrist.y * H;
    const kx = knuckle.x * W, ky = knuckle.y * H;
    const angle = Math.atan2(ky - wy, kx - wx);
    const handleLen = 80;

    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(angle);

    // Hammer handle (sturdy wood and bronze)
    ctx.fillStyle = "#8B4513";
    ctx.strokeStyle = "#D97706";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(0, -6, handleLen, 12, 5);
    ctx.fill();
    ctx.stroke();

    // Grip wrapping ribs
    ctx.strokeStyle = "#FDE68A";
    ctx.lineWidth = 2;
    for (let i = 12; i < handleLen - 15; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, -6);
      ctx.lineTo(i + 4, 6);
      ctx.stroke();
    }

    // Impact aura when curling wrist or snapping
    const headX = handleLen;
    const isSwinging = Math.abs(engine.vy) > 0.6 || Math.abs(engine.dy) > 0.02;
    if (isSwinging) {
      ctx.save();
      ctx.shadowColor = "#F59E0B";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "rgba(245, 158, 11, 0.45)";
      ctx.beginPath();
      ctx.arc(headX + 12, 0, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Metallic hammer head
    const grad = ctx.createLinearGradient(headX - 8, -24, headX + 32, 24);
    grad.addColorStop(0, "#94A3B8");
    grad.addColorStop(0.5, "#F1F5F9");
    grad.addColorStop(1, "#475569");

    ctx.fillStyle = grad;
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(headX - 6, -24, 32, 48, 5);
    ctx.fill();
    ctx.stroke();

    // Striking face bevel
    ctx.fillStyle = "#E2E8F0";
    ctx.fillRect(headX + 26, -22, 6, 44);

    // Claw / back bevel
    ctx.fillStyle = "#64748B";
    ctx.fillRect(headX - 10, -18, 5, 36);

    // Hammer icon
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡", headX + 10, 0);

    ctx.restore();
  }

  // ---------------- Canvas Skeleton Overlay ----------------------------
  function drawOverlay(res) {
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const W = overlayCanvas.width, H = overlayCanvas.height;

    // Draw arm skeleton (OpenCV Spec: Green bones #00C853, Yellow joints #FFEB3B)
    if (engine.arm && engine.arm.sh && engine.arm.el && engine.arm.wr) {
      const { sh, el, wr } = engine.arm;
      oCtx.strokeStyle = "rgba(0, 200, 83, 0.9)";
      oCtx.lineWidth = 4;
      oCtx.lineCap = "round";
      oCtx.beginPath();
      oCtx.moveTo(sh.x * W, sh.y * H);
      oCtx.lineTo(el.x * W, el.y * H);
      oCtx.lineTo(wr.x * W, wr.y * H);
      oCtx.stroke();
      [sh, el, wr].forEach((p) => {
        oCtx.fillStyle = "#FFEB3B";
        oCtx.beginPath();
        oCtx.arc(p.x * W, p.y * H, 6.5, 0, Math.PI * 2);
        oCtx.fill();
        oCtx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        oCtx.lineWidth = 1.5;
        oCtx.stroke();
      });
    }

    // Draw full 21 hand landmarks & connecting skeleton bones! (Exact 6M Reference: Bright Green bones #00FF00, Red dots #FF0000)
    const hand = (res && res.hand) || (engine.lastRes && engine.lastRes.hand);
    if (hand && hand[0]) {
      // 1. Hand skeleton bones: Bright Green (#00FF00)
      oCtx.strokeStyle = "#00FF00";
      oCtx.lineWidth = 2.5;
      oCtx.lineCap = "round";
      oCtx.lineJoin = "round";
      for (const [i, j] of HAND_CONNECTIONS) {
        const p1 = hand[i], p2 = hand[j];
        if (p1 && p2) {
          oCtx.beginPath();
          oCtx.moveTo(p1.x * W, p1.y * H);
          oCtx.lineTo(p2.x * W, p2.y * H);
          oCtx.stroke();
        }
      }

      // 2. Hand joint nodes: ALL 21 RED DOTS (#FF0000)
      for (let i = 0; i < 21; i++) {
        const p = hand[i];
        if (!p) continue;
        const px = p.x * W, py = p.y * H;
        oCtx.beginPath();
        oCtx.arc(px, py, 4.5, 0, Math.PI * 2);
        oCtx.fillStyle = "#FF0000";
        oCtx.fill();
        oCtx.strokeStyle = "#FFFFFF";
        oCtx.lineWidth = 1;
        oCtx.stroke();
      }

      // Index tip reticle indicator
      if (hand[8]) {
        oCtx.beginPath();
        oCtx.arc(hand[8].x * W, hand[8].y * H, 10, 0, Math.PI * 2);
        oCtx.strokeStyle = "rgba(0, 255, 0, 0.85)";
        oCtx.lineWidth = 1.5;
        oCtx.stroke();
      }

      // 3. Dynamic hammer attached to wrist & knuckle in Wrist Hammer game
      if (engine.key === "hammer" && hand[0] && (hand[9] || hand[5])) {
        const wrist = hand[0];
        const knuckle = hand[9] || hand[5];
        drawHammerGraphic(oCtx, wrist, knuckle, W, H);
      }
    }

    // Draw hand tip reticle
    if (engine.tip) {
      oCtx.beginPath();
      oCtx.arc(engine.tip.x * W, engine.tip.y * H, 14, 0, Math.PI * 2);
      oCtx.strokeStyle = engine.open ? "rgba(16, 185, 129, 0.95)" : "rgba(56, 189, 248, 0.95)";
      oCtx.lineWidth = 3;
      oCtx.stroke();

      oCtx.beginPath();
      oCtx.arc(engine.tip.x * W, engine.tip.y * H, 4, 0, Math.PI * 2);
      oCtx.fillStyle = "#FFFFFF";
      oCtx.fill();
    }
  }

  function ctxFill(ctx) { ctx.fill(); }

  // ---------------- Independent 60 FPS Game Loop -----------------------
  function mainGameLoop() {
    requestAnimationFrame(mainGameLoop);

    const W = gameCanvas.width, H = gameCanvas.height;
    if (W === 0 || H === 0) return;

    if (engine.playing && !engine.paused) {
      const g = engine.game;
      if (g) {
        g.$elbow = engine.elbow;
        g.$dev = engine.dev;
        g.$vel = engine.vel;
        g.$vy = engine.vy;
        g.$dy = engine.dy;
        g.$open = engine.open;
        g.$disp = engine.disp;
        g.$speed = engine.speed;
        if (typeof g.update === "function") g.update(engine.lastRes || {}, W, H);
      }

      // Step & draw floating text & particles
      for (let i = popups.length - 1; i >= 0; i--) {
        const p = popups[i];
        p.y += p.vy;
        p.alpha -= 0.025;
        if (p.alpha <= 0) popups.splice(i, 1);
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) particles.splice(i, 1);
      }

      // Clear & render game
      gCtx.clearRect(0, 0, W, H);
      if (g && typeof g.draw === "function") g.draw(gCtx, W, H);

      // Render floating score popups
      for (const p of popups) {
        gCtx.save();
        gCtx.globalAlpha = Math.max(0, p.alpha);
        gCtx.font = "bold 20px Segoe UI, sans-serif";
        gCtx.fillStyle = p.color;
        gCtx.fillText(p.text, p.x, p.y);
        gCtx.restore();
      }

      // Render particle bursts
      for (const p of particles) {
        gCtx.save();
        gCtx.globalAlpha = Math.max(0, p.life);
        gCtx.fillStyle = p.color;
        gCtx.beginPath();
        gCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        gCtx.fill();
        gCtx.restore();
      }

      // Live metrics readout
      metricEl.textContent =
        engine.key === "fruit" ? `Fingertip Blade · v=${engine.vel.toFixed(1)}` :
        engine.key === "hammer" ? `Wrist ${Math.round(engine.wristPitch)}° ${engine.wristPitch >= 13 ? "UP ⬆️" : engine.wristPitch <= -8 ? "DOWN ⬇️" : "LEVEL ↔️"}` :
        engine.key === "flappy" ? `Index Finger Flight` :
        engine.key === "starcatch" ? `Sky Pop Tracking` :
        engine.key === "bubblepop" ? `Bubble Target Pop` :
        engine.key === "laserblast" ? `Laser Reticle Aim` :
        engine.key === "paddlepong" ? `Paddle Reflex` :
        `Motion Active`;
    }

    // Render hand and arm skeleton unconditionally on every frame whenever camera data is present
    drawOverlay(engine.lastRes || {});
    if (engine.lastRes && engine.lastRes.hand && kpiHand) {
      kpiHand.textContent = engine.open ? "🖐️ Open palm" : "✊ Fist / closed";
    }
  }

  // Launch the 60 FPS animation loop
  mainGameLoop();

  // ---------------- Pointer & Touch Interaction Fallback -----------------
  gameCanvas.addEventListener("pointermove", (e) => {
    const rect = gameCanvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (!engine.tipFromCamera) {
      const now = Date.now();
      const dt = Math.max(0.001, (now - engine.lastT) / 1000);
      if (engine.tip) {
        engine.vel = Math.hypot(nx - engine.tip.x, ny - engine.tip.y) / dt;
        engine.dy = ny - engine.tip.y;
        engine.vy = engine.dy / dt;
      }
      engine.tip = { x: nx, y: ny };
      engine.open = true;
      engine.lastT = now;
    }
  });

  gameCanvas.addEventListener("pointerdown", () => {
    if (engine.game && engine.playing && !engine.paused) {
      if (engine.key === "flappy" && engine.game.bird) {
        engine.game.bird.y -= 35;
      }
      if (engine.key === "hammer") {
        engine.wristPitch = 25;
        setTimeout(() => { engine.wristPitch = -15; }, 200);
        setTimeout(() => { engine.wristPitch = 0; }, 400);
      }
    }
  });

  // ---------------- Canvas Sizing --------------------------------------
  function resize() {
    const parent = gameCanvas.parentElement;
    if (!parent) return;
    gameCanvas.width = parent.clientWidth;
    gameCanvas.height = parent.clientHeight;
    overlayCanvas.width = parent.clientWidth;
    overlayCanvas.height = parent.clientHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  setInterval(updateHUD, 500);

  // ---------------- Controls Binding -----------------------------------
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnResume = document.getElementById("btn-resume");
  const btnStop = document.getElementById("btn-stop");
  const modalResume = document.getElementById("modal-game-resume");
  const modalStop = document.getElementById("modal-game-stop");

  if (btnStart) {
    btnStart.addEventListener("click", () => {
      selectGame(engine.key || "flappy");
    });
  }
  if (btnPause) btnPause.addEventListener("click", pauseGame);
  if (btnResume) btnResume.addEventListener("click", resumeGame);
  if (modalResume) modalResume.addEventListener("click", resumeGame);
  if (btnStop) btnStop.addEventListener("click", () => stopGame("Session stopped"));
  if (modalStop) modalStop.addEventListener("click", () => stopGame("Session stopped"));

  function setSpeedPreset(speedVal, activeBtnId) {
    engine.speed = speedVal;
    if (engine.game) engine.game.$speed = engine.speed;
    document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
    const btn = document.getElementById(activeBtnId);
    if (btn) btn.classList.add("active");
    const speedLabels = {
      "btn-speed-s1": "S1 (0.7x Gentle)",
      "btn-speed-s2": "S2 (1.0x Normal)",
      "btn-speed-s3": "S3 (1.4x Fast)",
    };
    showToast(`⚡ Speed set to ${speedLabels[activeBtnId] || speedVal + "x"}`, "info");
  }

  const btnS1 = document.getElementById("btn-speed-s1");
  const btnS2 = document.getElementById("btn-speed-s2");
  const btnS3 = document.getElementById("btn-speed-s3");
  if (btnS1) btnS1.addEventListener("click", () => setSpeedPreset(0.7, "btn-speed-s1"));
  if (btnS2) btnS2.addEventListener("click", () => setSpeedPreset(1.0, "btn-speed-s2"));
  if (btnS3) btnS3.addEventListener("click", () => setSpeedPreset(1.4, "btn-speed-s3"));

  document.addEventListener("keydown", (e) => {
    if (!engine.playing) return;
    if (e.key === "q" || e.key === "Q") stopGame("Session stopped");
    else if (e.key === "p" || e.key === "P") pauseGame();
    else if (e.key === "r" || e.key === "R") resumeGame();
    else if (e.code === "Space") {
      if (engine.key === "flappy" && engine.game && engine.game.bird) {
        engine.game.bird.vy = -6.2;
      }
    }
  });

  async function logSession() {
    const duration = Math.floor((Date.now() - engine.startedAt) / 1000);
    const name = engine.game ? engine.game.name : "Unknown";
    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "ARCADE",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: Math.max(1, duration),
          peak_rom: Math.max(0, Math.round(180 - engine.elbow)),
          smoothness_score: 70,
          cheats_blocked: 0,
          score: engine.score,
          metrics_json: JSON.stringify({ game: name, score: engine.score, lives: engine.lives, speed: engine.speed }),
        }),
      });
      showToast(`📊 Session logged (${name}, ${engine.score} pts)`, "success");
    } catch (err) {
      console.error("Telemetry error:", err);
    }
  }

  // Dedicated Camera ON / OFF Toggle Button
  const btnCamToggle = document.getElementById("btn-cam-toggle");
  if (btnCamToggle) {
    btnCamToggle.addEventListener("click", async () => {
      if (engine.visionStarted) {
        VisionLoader.stop();
        engine.visionStarted = false;
        btnCamToggle.textContent = "📷 Camera: OFF";
        btnCamToggle.classList.add("danger");
        showToast("📷 Camera paused to save CPU/battery", "info");
      } else {
        const ok = await VisionLoader.start(video, onFrame);
        if (ok) {
          engine.visionStarted = true;
          VisionLoader.watch();
          btnCamToggle.textContent = "📷 Camera: ON";
          btnCamToggle.classList.remove("danger");
          showToast("📷 Camera resumed", "success");
        }
      }
    });
  }

  // Dynamic Mirror Mode Toggle (P7: Natural Left = Left)
  const btnMirrorToggle = document.getElementById("btn-mirror-toggle");
  if (btnMirrorToggle) {
    const isM = VisionLoader.isMirrored();
    btnMirrorToggle.textContent = isM ? "🪞 Mirror: Natural" : "🪞 Mirror: Inverted";
    btnMirrorToggle.addEventListener("click", () => {
      const next = !VisionLoader.isMirrored();
      VisionLoader.setMirrored(next);
      if (video) video.style.transform = next ? "scaleX(-1)" : "scaleX(1)";
      btnMirrorToggle.textContent = next ? "🪞 Mirror: Natural" : "🪞 Mirror: Inverted";
      showToast(next ? "🪞 Mirror: Natural (Left = Left)" : "🪞 Mirror: Inverted", "info");
    });
  }

  updateHUD();
  // Auto-activate camera immediately so live mirror preview is active
  startVision();
});
