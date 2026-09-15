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
    popups.push({ x, y, text, color, alpha: 1.0, vy: -1.6 });
  }

  function spawnParticles(x, y, color, count = 12) {
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

  // ---------------- 9 Game Definitions (7 Core + 2 Bubble) ----------------
  const GAMES = {
    // 1. Flappy Reach
    flappy: {
      name: "Flappy Reach", emoji: "🐦", trains: "Upper-limb reach & elevation", formula: "Active Reach",
      guide: "Show your index fingertip to fly the bird continuously! Glide past pillars to score +2 pts. 3 lives.",
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

        // Continuous flight directly tracking index fingertip position
        const targetY = engine.tip ? clamp(engine.tip.y * H, 30, H - 30) : H / 2;
        const targetX = engine.tip ? clamp(engine.tip.x * W, 80, W * 0.45) : 130;
        b.y += (targetY - b.y) * 0.16;
        b.x += (targetX - b.x) * 0.16;

        // Pillar obstacles moving right to left at medium speed
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
          // Passing obstacle gives +2 points
          if (!p.scored && p.x + 55 < b.x) {
            p.scored = true;
            this.$engine.addScore(2);
            addScorePopup(b.x + 20, b.y - 20, "+2", "#10B981");
          }
          // Collision with pillars (1 life lost per crash)
          if (!p.scored && b.hit === 0 && Math.abs(b.x - (p.x + 27)) < 18 + 27 && (b.y < p.gapY || b.y > p.gapY + p.gapH)) {
            b.hit = 45;
            this.$engine.loseLife();
            spawnParticles(b.x, b.y, "#EF4444", 16);
          }
        }
        this.pillars = this.pillars.filter((p) => p.x > -90);

        // Boundary crash
        if (b.hit === 0 && (b.y > H - 15 || b.y < 15)) {
          b.hit = 45;
          this.$engine.loseLife();
          spawnParticles(b.x, b.y, "#EF4444", 14);
        }
      },
      draw(ctx, W, H) {
        // Render pillars
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
        // Animated Bird
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

    // 2. Fruit Ballistic
    fruit: {
      name: "Fruit Ballistic", emoji: "🍉", trains: "Ballistic reach & open-palm speed", formula: "Blade Velocity",
      guide: "Slice rising fruits with your fingertip blade! 1-min timer. Avoid bombs 💣!",
      lives: true,
      init() {
        this.fruits = [];
        this.timer = 0;
        this.trail = [];
        this.timeLeft = 60;
        this.lastSecond = Date.now();
      },
      update(res, W, H) {
        // 1-min timer decrement
        const now = Date.now();
        if (now - this.lastSecond >= 1000) {
          this.lastSecond = now;
          this.timeLeft = Math.max(0, this.timeLeft - 1);
          if (this.timeLeft <= 0) {
            showToast("⏱️ 1-Minute Session Complete!", "success");
            setTimeout(() => stopGame("Time's Up!"), 1200);
            return;
          }
        }

        const F = [
          { emoji: "🍉", color: "#EF4444" },
          { emoji: "🍊", color: "#F97316" },
          { emoji: "🍓", color: "#F43F5E" },
          { emoji: "🍍", color: "#FBBF24" },
          { emoji: "🍎", color: "#DC2626" },
        ];
        if (++this.timer > Math.max(16, 42 - 8 * this.$speed)) {
          this.timer = 0;
          const isBomb = Math.random() < 0.16;
          const sel = isBomb ? { emoji: "💣", color: "#475569" } : F[(Math.random() * F.length) | 0];
          this.fruits.push({
            x: rand(60, W - 60), y: H + 30,
            vx: rand(-1.2, 1.2), vy: rand(5.5, 8.5) * this.$speed,
            emoji: sel.emoji, color: sel.color,
            bomb: isBomb, rot: 0, vrot: rand(-0.05, 0.05), gone: false,
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
          f.vy -= 0.16; // gravity arc
          f.rot += f.vrot;

          if (tip && distN(tip, f) < 64 && (engine.vel > 0.4 || !engine.tipFromCamera)) {
            f.gone = true;
            if (f.bomb) {
              this.$engine.loseLife();
              spawnParticles(f.x, f.y, "#EF4444", 24);
              showToast("💣 Bomb Detonated! −1 ❤️", "error");
            } else {
              this.$engine.addScore(10);
              spawnParticles(f.x, f.y, f.color, 14);
              addScorePopup(f.x, f.y, "+10", f.color);
            }
          }
        }
        this.fruits = this.fruits.filter((f) => !f.gone && f.y < H + 60);
      },
      draw(ctx, W, H) {
        // Blade slash trail
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

        // Flying fruits
        for (const f of this.fruits) {
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.rot);
          ctx.font = "38px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(f.emoji, 0, 0);
          ctx.restore();
        }

        // 1-min timer HUD badge
        ctx.fillStyle = "rgba(11, 18, 32, 0.75)";
        ctx.fillRect(W - 130, 16, 114, 34);
        ctx.strokeStyle = "#38BDF8";
        ctx.strokeRect(W - 130, 16, 114, 34);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`⏱️ ${this.timeLeft}s left`, W - 73, 38);
      },
    },

    // 3. Star Catch
    starcatch: {
      name: "Star Catch", emoji: "⭐", trains: "Lateral planar sweep & reach", formula: "Lateral Range",
      guide: "Slide collector basket with your fingertip to catch falling stars ⭐ and avoid bombs 💣!",
      lives: true,
      init() {
        this.items = [];
        this.timer = 0;
        this.basketX = 0.5;
      },
      update(res, W, H) {
        const targetX = engine.tip ? engine.tip.x : 0.5;
        this.basketX += (targetX - this.basketX) * 0.22;

        if (++this.timer > Math.max(18, 44 / this.$speed)) {
          this.timer = 0;
          const isBomb = Math.random() < 0.2;
          this.items.push({
            x: rand(0.1, 0.9), y: -0.05,
            v: rand(0.005, 0.008) * this.$speed,
            isBomb,
          });
        }

        const bW = 0.18;
        const bL = this.basketX - bW / 2;
        const bR = this.basketX + bW / 2;

        for (const it of this.items) {
          it.y += it.v;
          if (it.y >= 0.88 && it.y <= 0.94 && it.x >= bL && it.x <= bR) {
            it.caught = true;
            if (it.isBomb) {
              this.$engine.loseLife();
              spawnParticles(it.x * W, it.y * H, "#EF4444", 20);
              showToast("💣 Caught a bomb! −1 ❤️", "error");
            } else {
              this.$engine.addScore(5);
              spawnParticles(it.x * W, it.y * H, "#FBBF24", 14);
              addScorePopup(it.x * W, it.y * H - 15, "+5 ⭐", "#FBBF24");
            }
          }
        }
        this.items = this.items.filter((it) => !it.caught && it.y < 1.05);
      },
      draw(ctx, W, H) {
        // Collector Basket
        const bx = this.basketX * W;
        const by = 0.91 * H;
        const bw = W * 0.18;
        ctx.save();
        ctx.fillStyle = "#38BDF8";
        ctx.fillRect(bx - bw / 2, by, bw, 22);
        ctx.fillStyle = "#0284C7";
        ctx.fillRect(bx - bw / 2, by + 18, bw, 6);
        ctx.strokeStyle = "#BAE6FD";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx - bw / 2, by, bw, 22);
        ctx.restore();

        // Falling items
        for (const it of this.items) {
          ctx.font = "32px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(it.isBomb ? "💣" : "⭐", it.x * W, it.y * H);
        }
      },
    },

    // 4. Fist Pop
    fistpop: {
      name: "Fist Pop", emoji: "✊", trains: "Spasticity release (fist to open palm)", formula: "Spasticity Release",
      guide: "Clench a tight fist to charge energy, then spread your palm wide to burst all descending bubbles!",
      lives: true,
      init() {
        this.bubbles = [];
        this.timer = 0;
        this.charge = 0;
        this.shockwave = null;
      },
      update(res, W, H) {
        const isFist = (engine.disp < 0.12) || (!engine.open && engine.tipFromCamera);
        const isOpen = (engine.disp > 0.20) || (engine.open);

        if (isFist) {
          this.charge = Math.min(1.0, this.charge + 0.05);
        } else if (isOpen && this.charge >= 0.7) {
          // Detonate shockwave!
          const cx = engine.tip ? engine.tip.x * W : W / 2;
          const cy = engine.tip ? engine.tip.y * H : H / 2;
          this.shockwave = { x: cx, y: cy, r: 20, maxR: W * 0.75, alpha: 1.0 };
          this.charge = 0;

          let poppedCount = 0;
          for (const b of this.bubbles) {
            b.popped = true;
            poppedCount++;
            this.$engine.addScore(10);
            spawnParticles(b.x * W, b.y * H, "#38BDF8", 12);
          }
          if (poppedCount > 0) {
            addScorePopup(cx, cy - 25, `+${poppedCount * 10} 💥`, "#38BDF8");
          }
        }

        if (this.shockwave) {
          this.shockwave.r += 24;
          this.shockwave.alpha -= 0.04;
          if (this.shockwave.alpha <= 0) this.shockwave = null;
        }

        // Descending bubbles
        if (++this.timer > Math.max(25, 55 / this.$speed) && this.bubbles.length < 8) {
          this.timer = 0;
          this.bubbles.push({
            x: rand(0.15, 0.85),
            y: -0.05,
            v: rand(0.002, 0.004) * this.$speed,
            r: rand(22, 34),
            popped: false,
          });
        }
        for (const b of this.bubbles) {
          b.y += b.v;
          if (b.y > 1.05) {
            b.popped = true;
            this.$engine.loseLife();
            showToast("Bubble reached the bottom! −1 ❤️", "error");
          }
        }
        this.bubbles = this.bubbles.filter((b) => !b.popped);
      },
      draw(ctx, W, H) {
        // Shockwave ring
        if (this.shockwave) {
          ctx.save();
          ctx.strokeStyle = `rgba(56, 189, 248, ${Math.max(0, this.shockwave.alpha)})`;
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(this.shockwave.x, this.shockwave.y, this.shockwave.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Hand charge indicator
        if (engine.tip) {
          const cx = engine.tip.x * W, cy = engine.tip.y * H;
          ctx.save();
          ctx.fillStyle = `rgba(245, 158, 11, ${0.2 + this.charge * 0.6})`;
          ctx.beginPath();
          ctx.arc(cx, cy, 25 + this.charge * 25, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#F59E0B";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }

        // Descending bubbles
        for (const b of this.bubbles) {
          ctx.save();
          ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
          ctx.beginPath();
          ctx.arc(b.x * W, b.y * H, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#BAE6FD";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
      },
    },

    // 5. Wrist Hammer
    hammer: {
      name: "Wrist Hammer", emoji: "🔨", trains: "Fast downward wrist snap & acceleration", formula: "Wrist Acceleration",
      guide: "Bubbles rise from below! Snap your wrist downward quickly to smash bubbles at the strike line.",
      lives: true,
      init() {
        this.bubbles = [];
        this.timer = 0;
        this.wasDown = false;
        this.strikeY = 0.45;
      },
      update(res, W, H) {
        const snapDown = this.$vy > 1.1 || engine.dy > 0.04;
        const lineY = this.strikeY * H;

        // Rising bubbles from bottom
        if (++this.timer > Math.max(22, 50 / this.$speed) && this.bubbles.length < 7) {
          this.timer = 0;
          this.bubbles.push({
            x: rand(0.18, 0.82),
            y: 1.05,
            v: rand(0.003, 0.006) * this.$speed,
            r: 24,
            hit: false,
          });
        }

        for (const b of this.bubbles) {
          b.y -= b.v;
          const by = b.y * H;
          const bx = b.x * W;
          // When bubble reaches strike line
          if (Math.abs(by - lineY) < 32 && snapDown && !this.wasDown) {
            b.hit = true;
            this.$engine.addScore(10);
            spawnParticles(bx, by, "#F59E0B", 18);
            addScorePopup(bx, by - 15, "+10 🔨", "#F59E0B");
          }
          if (b.y < -0.05) {
            b.hit = true;
            this.$engine.loseLife();
            showToast("Missed bubble! −1 ❤️", "error");
          }
        }
        this.bubbles = this.bubbles.filter((b) => !b.hit);
        this.wasDown = snapDown;
      },
      draw(ctx, W, H) {
        // Strike line
        const lineY = this.strikeY * H;
        ctx.save();
        ctx.strokeStyle = "rgba(245, 158, 11, 0.7)";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(0, lineY);
        ctx.lineTo(W, lineY);
        ctx.stroke();
        ctx.fillStyle = "#F59E0B";
        ctx.font = "bold 12px Segoe UI, sans-serif";
        ctx.fillText("⚡ HAMMER STRIKE LINE", 16, lineY - 8);
        ctx.restore();

        // Rising bubbles
        for (const b of this.bubbles) {
          ctx.save();
          ctx.fillStyle = "rgba(245, 158, 11, 0.4)";
          ctx.beginPath();
          ctx.arc(b.x * W, b.y * H, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FDE68A";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
      },
    },

    // 6. Elbow Crusher
    crusher: {
      name: "Elbow Crusher", emoji: "💪", trains: "Elbow flexion past 95° active ROM", formula: "Elbow ROM",
      guide: "Flex elbow past 95° to smash hydraulic crusher plates on crystals! Extend past 120° to reload.",
      lives: true,
      init() {
        this.targets = [];
        this.timer = 0;
        this.platePos = 0; // 0 = open, 1 = crushed
        this.wasFlexed = false;
      },
      update(res, W, H) {
        const isFlexed = engine.elbow <= 95 && engine.elbow > 15;
        const isExtended = engine.elbow >= 120;

        if (isFlexed && !this.wasFlexed) {
          this.platePos = 1;
          // Crush target in the bay
          const inBay = this.targets.find((t) => Math.abs(t.x - 0.5) < 0.16);
          if (inBay) {
            inBay.crushed = true;
            this.$engine.addScore(15);
            spawnParticles(0.5 * W, inBay.y * H, "#E5484D", 22);
            addScorePopup(0.5 * W, inBay.y * H - 20, "+15 💥 CRUSHED", "#E5484D");
          }
        }
        if (isExtended) {
          this.platePos = 0;
        }
        this.wasFlexed = isFlexed;

        // Targets sliding horizontally into the crusher bay
        if (++this.timer > Math.max(30, 65 / this.$speed) && this.targets.length < 4) {
          this.timer = 0;
          this.targets.push({
            x: -0.05,
            y: 0.5,
            vx: 0.005 * this.$speed,
            crushed: false,
          });
        }

        for (const t of this.targets) {
          t.x += t.vx;
          if (t.x > 1.05) {
            t.crushed = true;
            this.$engine.loseLife();
            showToast("Crystal slipped through! −1 ❤️", "error");
          }
        }
        this.targets = this.targets.filter((t) => !t.crushed);
      },
      draw(ctx, W, H) {
        // Hydraulic Plates
        const gap = this.platePos === 1 ? 25 : W * 0.22;
        ctx.save();
        // Left plate
        ctx.fillStyle = "#334155";
        ctx.fillRect(0, 0.35 * H, 0.5 * W - gap, 0.3 * H);
        ctx.fillStyle = "#E5484D";
        ctx.fillRect(0.5 * W - gap - 12, 0.35 * H, 12, 0.3 * H);

        // Right plate
        ctx.fillStyle = "#334155";
        ctx.fillRect(0.5 * W + gap, 0.35 * H, W - (0.5 * W + gap), 0.3 * H);
        ctx.fillStyle = "#E5484D";
        ctx.fillRect(0.5 * W + gap, 0.35 * H, 12, 0.3 * H);
        ctx.restore();

        // Target crystals
        for (const t of this.targets) {
          ctx.save();
          ctx.fillStyle = "#F59E0B";
          ctx.beginPath();
          ctx.arc(t.x * W, t.y * H, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFF";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.font = "24px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("💎", t.x * W, t.y * H + 8);
          ctx.restore();
        }
      },
    },

    // 7. Pinch Pop
    pinch: {
      name: "Pinch Pop", emoji: "🤏", trains: "Thumb–index pincer precision", formula: "Pincer Precision",
      guide: "Hover over floating bubbles and pinch your thumb and index finger together to pop them!",
      lives: true,
      init() {
        this.bubbles = [];
        this.timer = 0;
        this.wasPinch = false;
      },
      update(res, W, H) {
        let pinch = false;
        if (res.hand && res.hand[4] && res.hand[8]) {
          pinch = distN(res.hand[4], res.hand[8]) < 0.052;
        }

        const tip = engine.tip ? { x: engine.tip.x * W, y: engine.tip.y * H } : null;

        if (pinch && !this.wasPinch && tip) {
          for (const b of this.bubbles) {
            const bx = b.x * W, by = b.y * H;
            if (Math.hypot(tip.x - bx, tip.y - by) < b.r + 20) {
              b.popped = true;
              this.$engine.addScore(10);
              spawnParticles(bx, by, "#8B5CF6", 18);
              addScorePopup(bx, by - 15, "+10 🤏", "#8B5CF6");
            }
          }
        }
        this.wasPinch = pinch;

        // Spawn floating bubbles
        if (++this.timer > Math.max(20, 48 / this.$speed) && this.bubbles.length < 6) {
          this.timer = 0;
          this.bubbles.push({
            x: rand(0.15, 0.85),
            y: 1.05,
            v: rand(0.003, 0.005) * this.$speed,
            r: 26,
            popped: false,
          });
        }
        for (const b of this.bubbles) {
          b.y -= b.v;
          if (b.y < -0.05) {
            b.popped = true;
            this.$engine.loseLife();
            showToast("Bubble escaped! −1 ❤️", "error");
          }
        }
        this.bubbles = this.bubbles.filter((b) => !b.popped);
      },
      draw(ctx, W, H) {
        for (const b of this.bubbles) {
          ctx.save();
          ctx.fillStyle = "rgba(139, 92, 246, 0.4)";
          ctx.beginPath();
          ctx.arc(b.x * W, b.y * H, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#C4B5FD";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        }
      },
    },

    // 8. Bubble Deflector
    deflector: {
      name: "Bubble Deflector", emoji: "🛡️", trains: "Hand tilt & deflector stability", formula: "Shield Angle",
      guide: "Tilt your hand to angle the energy shield. Deflect falling bubbles into left/right goal buckets!",
      lives: true,
      init() {
        this.bubbles = [];
        this.timer = 0;
      },
      update(res, W, H) {
        const cx = engine.tip ? engine.tip.x * W : W / 2;
        const cy = engine.tip ? engine.tip.y * H : H * 0.65;
        const angle = (engine.dev || 0) * (Math.PI / 180);

        // Falling bubbles
        if (++this.timer > Math.max(22, 50 / this.$speed) && this.bubbles.length < 6) {
          this.timer = 0;
          this.bubbles.push({
            x: rand(0.3, 0.7) * W,
            y: -20,
            vx: 0,
            vy: rand(2.0, 3.5) * this.$speed,
            r: 18,
            scored: false,
          });
        }

        const shieldLen = 140;
        const sx1 = cx - Math.cos(angle) * (shieldLen / 2);
        const sy1 = cy - Math.sin(angle) * (shieldLen / 2);
        const sx2 = cx + Math.cos(angle) * (shieldLen / 2);
        const sy2 = cy + Math.sin(angle) * (shieldLen / 2);

        for (const b of this.bubbles) {
          b.x += b.vx;
          b.y += b.vy;

          // Check deflection off shield
          if (Math.hypot(b.x - cx, b.y - cy) < shieldLen / 2 && Math.abs(b.y - cy) < 26) {
            b.vy = -Math.abs(b.vy) * 0.8;
            b.vx = Math.sin(angle) * 4.5;
            spawnParticles(b.x, b.y, "#38BDF8", 8);
          }

          // Left goal bucket (0 .. 120, H-80 .. H)
          if (!b.scored && b.x < 130 && b.y > H - 90) {
            b.scored = true;
            this.$engine.addScore(15);
            spawnParticles(b.x, b.y, "#10B981", 16);
            addScorePopup(80, H - 110, "+15 GOAL! 🎯", "#10B981");
          }
          // Right goal bucket (W-130 .. W, H-80 .. H)
          if (!b.scored && b.x > W - 130 && b.y > H - 90) {
            b.scored = true;
            this.$engine.addScore(15);
            spawnParticles(b.x, b.y, "#10B981", 16);
            addScorePopup(W - 80, H - 110, "+15 GOAL! 🎯", "#10B981");
          }
          if (b.y > H + 20 && !b.scored) {
            b.scored = true;
            this.$engine.loseLife();
            showToast("Missed goal bucket! −1 ❤️", "error");
          }
        }
        this.bubbles = this.bubbles.filter((b) => !b.scored);
      },
      draw(ctx, W, H) {
        // Goal buckets
        ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
        ctx.fillRect(10, H - 80, 110, 70);
        ctx.strokeStyle = "#10B981";
        ctx.lineWidth = 3;
        ctx.strokeRect(10, H - 80, 110, 70);
        ctx.fillStyle = "#10B981";
        ctx.font = "bold 13px Segoe UI, sans-serif";
        ctx.fillText("GOAL LEFT 🎯", 20, H - 40);

        ctx.fillStyle = "rgba(16, 185, 129, 0.25)";
        ctx.fillRect(W - 120, H - 80, 110, 70);
        ctx.strokeRect(W - 120, H - 80, 110, 70);
        ctx.fillText("GOAL RIGHT 🎯", W - 110, H - 40);

        // Hand deflector shield
        const cx = engine.tip ? engine.tip.x * W : W / 2;
        const cy = engine.tip ? engine.tip.y * H : H * 0.65;
        const angle = (engine.dev || 0) * (Math.PI / 180);
        const shieldLen = 140;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = "rgba(56, 189, 248, 0.45)";
        ctx.fillRect(-shieldLen / 2, -7, shieldLen, 14);
        ctx.strokeStyle = "#38BDF8";
        ctx.lineWidth = 3;
        ctx.strokeRect(-shieldLen / 2, -7, shieldLen, 14);
        ctx.restore();

        // Falling bubbles
        for (const b of this.bubbles) {
          ctx.save();
          ctx.fillStyle = "rgba(56, 189, 248, 0.4)";
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#FFF";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      },
    },

    // 9. Color Bubble Match
    colormatch: {
      name: "Color Bubble Match", emoji: "🔵", trains: "Cognitive-motor sequence targeting", formula: "Color Sequence",
      guide: "Pop the announced target color bubble in sequence! Popping the wrong color drops a life.",
      lives: true,
      init() {
        this.colors = [
          { name: "BLUE", code: "#38BDF8", emoji: "🔵" },
          { name: "RED", code: "#EF4444", emoji: "🔴" },
          { name: "GREEN", code: "#10B981", emoji: "🟢" },
          { name: "YELLOW", code: "#FBBF24", emoji: "🟡" },
        ];
        this.colorIdx = 0;
        this.bubbles = [];
        this.timer = 0;
      },
      update(res, W, H) {
        const targetColor = this.colors[this.colorIdx];
        const tip = engine.tip ? { x: engine.tip.x * W, y: engine.tip.y * H } : null;

        // Spawn bubbles of 4 colors
        if (++this.timer > Math.max(18, 45 / this.$speed) && this.bubbles.length < 8) {
          this.timer = 0;
          const col = this.colors[(Math.random() * this.colors.length) | 0];
          this.bubbles.push({
            x: rand(0.12, 0.88) * W,
            y: H + 25,
            vy: rand(2.0, 3.8) * this.$speed,
            r: 26,
            color: col,
            popped: false,
          });
        }

        for (const b of this.bubbles) {
          b.y -= b.vy;
          if (tip && Math.hypot(tip.x - b.x, tip.y - b.y) < b.r + 20) {
            b.popped = true;
            if (b.color.name === targetColor.name) {
              this.$engine.addScore(15);
              spawnParticles(b.x, b.y, b.color.code, 18);
              addScorePopup(b.x, b.y - 15, `+15 ${b.color.emoji}`, b.color.code);
              // Advance to next target color
              this.colorIdx = (this.colorIdx + 1) % this.colors.length;
            } else {
              this.$engine.loseLife();
              spawnParticles(b.x, b.y, "#EF4444", 14);
              showToast(`Wrong color! Wanted ${targetColor.name} −1 ❤️`, "error");
            }
          }
        }
        this.bubbles = this.bubbles.filter((b) => !b.popped && b.y > -40);
      },
      draw(ctx, W, H) {
        const targetColor = this.colors[this.colorIdx];
        // Target banner at top
        ctx.save();
        ctx.fillStyle = "rgba(11, 18, 32, 0.85)";
        ctx.fillRect(W / 2 - 140, 16, 280, 42);
        ctx.strokeStyle = targetColor.code;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(W / 2 - 140, 16, 280, 42);
        ctx.fillStyle = targetColor.code;
        ctx.font = "bold 16px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`TARGET: POP ${targetColor.name} ${targetColor.emoji}`, W / 2, 43);
        ctx.restore();

        // Bubbles
        for (const b of this.bubbles) {
          ctx.save();
          ctx.fillStyle = b.color.code;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
          ctx.strokeStyle = "#FFF";
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
        }
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
    speed: 1,
    tip: null,
    tipFromCamera: false,
    dev: 0,
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
    kpiGame.textContent = `${game.emoji} ${game.name}`;
    kpiTrains.textContent = game.trains;
    kpiFormula.textContent = game.formula;
    guideLine.textContent = `💬 ${game.guide}`;
    document.querySelectorAll(".game-btn").forEach((b) => b.classList.toggle("selected", b.dataset.game === engine.key));
    heartsEl.parentElement.style.display = game.lives ? "" : "none";
  }

  // Populate shelf buttons
  GAME_KEYS.forEach((id) => {
    const g = GAMES[id];
    const btn = document.createElement("button");
    btn.className = "game-btn";
    btn.dataset.game = id;
    btn.setAttribute("aria-label", `Play ${g.name}`);
    btn.innerHTML = `<span class="g-icon">${g.emoji}</span><span class="g-name">${g.name}</span><span class="g-tag">${g.formula}</span>`;
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
    engine.game.$engine = { addScore, loseLife, state: engine };
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
    kpiGame.textContent = "—";
    kpiTrains.textContent = "—";
    kpiFormula.textContent = "—";
    guideLine.textContent = "💬 Select a game to see how to play it.";
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    document.querySelectorAll(".game-btn").forEach((b) => b.classList.remove("selected"));
    document.getElementById("arcade-paused-overlay").classList.remove("show");
    document.getElementById("arcade-countdown-overlay").classList.remove("show");
    document.getElementById("btn-start").style.display = "inline-flex";
    document.getElementById("btn-pause").style.display = "none";
    document.getElementById("btn-resume").style.display = "none";
    document.getElementById("btn-stop").style.display = "none";
    updateHUD();
    if (message) showToast(message, "error");
  }

  function addScore(pts) {
    engine.score += pts;
    engine.combo += 1;
    if (window.RehabBio) window.RehabBio.playBeep(700 + Math.min(400, engine.combo * 15), 0.06, 0.25);
  }

  function loseLife() {
    engine.lives -= 1;
    engine.combo = 0;
    if (window.RehabBio) window.RehabBio.playCheatBuzz();
    if (engine.lives <= 0) {
      showToast("💔 Game Over — logging session…", "error");
      setTimeout(() => stopGame(), 1400);
    }
  }

  function updateHUD() {
    scoreEl.textContent = engine.score;
    timerEl.textContent = engine.playing ? fmt(Date.now() - engine.startedAt) : "00:00";
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
      showToast("✅ Camera active — enjoy your session!", "success");
    } else {
      showToast("ℹ️ Camera stream initializing — you can also use touch/mouse!", "info");
    }
  }

  // Auto-boot camera on page load for immediate readiness
  startVision();

  // ---------------- Vision Callback -----------------------------------
  function computeFrame(res) {
    engine.lastRes = res;
    // Landmark tracking
    if (res.hand && res.hand[8]) {
      engine.tip = { x: res.hand[8].x, y: res.hand[8].y };
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

  // ---------------- Canvas Skeleton Overlay ----------------------------
  function drawOverlay(res) {
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const W = overlayCanvas.width, H = overlayCanvas.height;

    // Draw arm skeleton
    if (engine.arm && engine.arm.sh && engine.arm.el && engine.arm.wr) {
      const { sh, el, wr } = engine.arm;
      oCtx.strokeStyle = "rgba(56, 189, 248, 0.85)";
      oCtx.lineWidth = 4;
      oCtx.lineCap = "round";
      oCtx.beginPath();
      oCtx.moveTo(sh.x * W, sh.y * H);
      oCtx.lineTo(el.x * W, el.y * H);
      oCtx.lineTo(wr.x * W, wr.y * H);
      oCtx.stroke();
      [[sh, "#F97316"], [el, "#10B981"], [wr, "#38BDF8"]].forEach(([p, c]) => {
        oCtx.fillStyle = c;
        oCtx.beginPath(); oCtx.arc(p.x * W, p.y * H, 6, 0, Math.PI * 2); ctxFill(oCtx);
      });
    }

    // Draw hand tip reticle
    if (engine.tip) {
      oCtx.beginPath();
      oCtx.arc(engine.tip.x * W, engine.tip.y * H, 16, 0, Math.PI * 2);
      oCtx.strokeStyle = engine.open ? "rgba(16,185,129,0.9)" : "rgba(249,115,22,0.85)";
      oCtx.lineWidth = 3;
      oCtx.stroke();
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

      drawOverlay(engine.lastRes || {});

      // Live metrics readout
      metricEl.textContent =
        engine.key === "fruit" ? `Palm ${engine.open ? "OPEN 🌱" : "Fist ✊"} · v=${engine.vel.toFixed(1)}` :
        engine.key === "flappy" || engine.key === "flappyreach" ? `Wrist dev ${Math.round(engine.dev)}°` :
        engine.key === "elbowcrush" ? `Elbow ${Math.round(engine.elbow)}°` :
        engine.key === "pinchpop" || engine.key === "fistpop" ? `Dispersion ${engine.disp.toFixed(2)}` :
        engine.key === "hammer" ? `Speed ${engine.vy.toFixed(1)}/s` :
        `Disp ${engine.disp.toFixed(2)} · v ${engine.vel.toFixed(1)}`;
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
        engine.game.bird.vy = -6.2;
      }
      if (engine.key === "hammer") {
        engine.vy = 2.5; engine.dy = 0.2;
      }
      if (engine.key === "fistpop") {
        engine.open = false;
        setTimeout(() => { engine.open = true; }, 300);
      }
      if (engine.key === "pinchpop" && engine.game.balls && engine.game.balls.length) {
        const popped = engine.game.balls.pop();
        addScore(10);
        spawnParticles(popped.x * gameCanvas.width, popped.y * gameCanvas.height, "#8B5CF6", 16);
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

  document.getElementById("btn-slower").addEventListener("click", () => setSpeed(-0.5));
  document.getElementById("btn-faster").addEventListener("click", () => setSpeed(0.5));

  function setSpeed(d) {
    engine.speed = Math.max(0.5, Math.min(3.0, engine.speed + d));
    speedDisp.textContent = `${engine.speed.toFixed(1)}x`;
    if (engine.game) engine.game.$speed = engine.speed;
  }

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
