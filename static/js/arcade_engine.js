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

  // ---------------- 11 Game Definitions --------------------------------
  const GAMES = {
    // 1. Flappy Kinetic (E3 · C5)
    flappy: {
      name: "Flappy Kinetic", emoji: "🐦", trains: "Wrist extension / dorsiflexion", formula: "E3 · C5",
      guide: "Raise your wrist upward (dorsiflex) or tap to make the bird flap. Fly through the pipe gaps!",
      lives: true,
      init() {
        this.bird = { x: 120, y: 250, vy: 0, r: 18, frame: 0 };
        this.pipes = [];
        this.pipeTimer = 0;
        this.wasFlapped = false;
      },
      update(res, W, H) {
        const b = this.bird;
        b.frame++;
        const flapGesture = this.$dev > 12 || (engine.tip && engine.tip.y < 0.38) || (this.$vy < -1.2);
        if (flapGesture && !this.wasFlapped) {
          b.vy = -6.2;
          spawnParticles(b.x - 10, b.y + 10, "#F59E0B", 4);
          if (window.RehabBio) window.RehabBio.playBeep(520, 0.04, 0.15);
        }
        this.wasFlapped = flapGesture;

        b.vy += 0.32;
        b.y += b.vy;

        if (++this.pipeTimer > Math.max(70, 110 / this.$speed)) {
          this.pipeTimer = 0;
          this.pipes.push({ x: W + 20, gapY: rand(80, H - 240), gapH: 155, scored: false });
        }

        for (const p of this.pipes) {
          p.x -= 2.8 * this.$speed;
          if (!p.scored && p.x + 55 < b.x) {
            p.scored = true;
            this.$engine.addScore(10);
            addScorePopup(b.x + 20, b.y - 20, "+10", "#10B981");
          }
          if (Math.abs(b.x - (p.x + 27)) < 18 + 27 && (b.y < p.gapY || b.y > p.gapY + p.gapH)) {
            p.scored = true;
            this.$engine.loseLife();
            spawnParticles(b.x, b.y, "#EF4444", 16);
            b.y = H / 2; b.vy = 0;
          }
        }
        this.pipes = this.pipes.filter((p) => p.x > -90);
        if (b.y > H || b.y < 0) {
          this.$engine.loseLife();
          spawnParticles(b.x, b.y, "#EF4444", 14);
          b.y = H / 2; b.vy = 0;
        }
      },
      draw(ctx, W, H) {
        // Pipes with 3D gradient finish
        for (const p of this.pipes) {
          const grad = ctx.createLinearGradient(p.x, 0, p.x + 55, 0);
          grad.addColorStop(0, "#22C55E");
          grad.addColorStop(0.5, "#4ADE80");
          grad.addColorStop(1, "#16A34A");
          ctx.fillStyle = grad;
          ctx.fillRect(p.x, 0, 55, p.gapY);
          ctx.fillRect(p.x, p.gapY + p.gapH, 55, H - (p.gapY + p.gapH));

          // Pipe collars
          ctx.fillStyle = "#15803D";
          ctx.fillRect(p.x - 4, p.gapY - 20, 63, 20);
          ctx.fillRect(p.x - 4, p.gapY + p.gapH, 63, 20);
        }
        // Animated Bird
        const b = this.bird;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(clamp(b.vy * 0.06, -0.6, 0.7));
        ctx.fillStyle = "#F59E0B";
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
        // Wing
        ctx.fillStyle = "#FBBF24";
        const wingY = Math.sin(b.frame * 0.3) * 5;
        ctx.beginPath(); ctx.ellipse(-6, wingY, 9, 6, 0.2, 0, Math.PI * 2); ctx.fill();
        // Eye & Beak
        ctx.fillStyle = "#FFF"; ctx.beginPath(); ctx.arc(7, -4, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(8, -4, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#DC2626"; ctx.beginPath(); ctx.moveTo(14, -2); ctx.lineTo(24, 2); ctx.lineTo(14, 6); ctx.closePath(); ctx.fill();
        ctx.restore();
      },
    },

    // 2. Fruit Ballistic (C3 · S2)
    fruit: {
      name: "Fruit Ballistic", emoji: "🍉", trains: "Open-palm reach (flexor spasticity)", formula: "C3 · S2",
      guide: "Slice fruit by swiping fast with an OPEN palm (fingers spread). Avoid the 💣!",
      lives: true,
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
          { emoji: "🍑", color: "#FB923C" },
          { emoji: "🍎", color: "#DC2626" },
        ];
        if (++this.timer > Math.max(16, 42 - 8 * this.$speed)) {
          this.timer = 0;
          const isBomb = Math.random() < 0.15;
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
          if (this.trail.length > 12) this.trail.pop();
        }
        this.trail.forEach((t) => { t.life -= 0.08; });
        this.trail = this.trail.filter((t) => t.life > 0);

        for (const f of this.fruits) {
          f.x += f.vx;
          f.y -= f.vy;
          f.vy -= 0.16; // gravity arc
          f.rot += f.vrot;

          if (tip && distN(tip, f) < 68 && (this.$vel > 0.45 || !engine.tipFromCamera) && (this.$open || !engine.tipFromCamera)) {
            f.gone = true;
            if (f.bomb) {
              this.$engine.loseLife();
              spawnParticles(f.x, f.y, "#EF4444", 20);
              showToast("💣 Hazard! −1 ❤️", "error");
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
          ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
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
      },
    },

    // 3. Star Catch (C2)
    starcatch: {
      name: "Star Catch", emoji: "⭐", trains: "Horizontal reach / shoulder sweep", formula: "C2",
      guide: "Slide your hand left-right along the bottom to catch falling stars.",
      lives: false,
      init() {
        this.stars = [];
        this.timer = 0;
        this.handX = 0.5;
      },
      update(res, W, H) {
        if (engine.tip) this.handX = engine.tip.x;
        if (++this.timer > Math.max(12, 36 / this.$speed)) {
          this.timer = 0;
          this.stars.push({
            x: rand(0.08, 0.92), y: -0.05,
            s: rand(0.005, 0.010) * this.$speed,
            r: rand(16, 24),
            rot: 0,
          });
        }
        this.stars = this.stars.filter((s) => {
          s.y += s.s;
          s.rot += 0.04;
          if (s.y > 1.05) return false;
          if (Math.abs(s.x - this.handX) < 0.08 && s.y > 0.78 && s.y < 0.92) {
            this.$engine.addScore(10);
            spawnParticles(s.x * W, s.y * H, "#FACC15", 14);
            addScorePopup(s.x * W, s.y * H - 15, "+10", "#FACC15");
            return false;
          }
          return true;
        });
      },
      draw(ctx, W, H) {
        // Stars
        for (const s of this.stars) {
          ctx.save();
          ctx.translate(s.x * W, s.y * H);
          ctx.rotate(s.rot);
          ctx.font = "30px Segoe UI Emoji, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("⭐", 0, 0);
          ctx.restore();
        }

        // Catcher paddle
        const bx = this.handX * W;
        const by = H * 0.85;
        const grad = ctx.createLinearGradient(bx - 45, by, bx + 45, by);
        grad.addColorStop(0, "#38BDF8");
        grad.addColorStop(0.5, "#818CF8");
        grad.addColorStop(1, "#38BDF8");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx - 45, by - 12, 90, 24, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      },
    },

    // 4. Bubble Pop (C2)
    bubblepop: {
      name: "Bubble Pop", emoji: "🫧", trains: "Precise index-finger pointing", formula: "C2",
      guide: "Touch the rising bubbles with your index fingertip to pop them.",
      lives: false,
      init() {
        this.bubbles = [];
        this.timer = 0;
      },
      update(res, W, H) {
        const tip = engine.tip;
        if (++this.timer > Math.max(12, 32 / this.$speed)) {
          this.timer = 0;
          this.bubbles.push({
            x: rand(0.1, 0.9), y: 1.08,
            v: rand(0.0035, 0.0075) * this.$speed,
            r: rand(18, 30),
            hue: rand(180, 240),
          });
        }
        this.bubbles = this.bubbles.filter((b) => {
          b.y -= b.v;
          if (b.y < -0.1) return false;
          if (tip && Math.hypot(b.x - tip.x, (b.y * H - tip.y * H) / H) < (b.r + 14) / W) {
            this.$engine.addScore(5);
            spawnParticles(b.x * W, b.y * H, `hsl(${b.hue}, 90%, 65%)`, 10);
            addScorePopup(b.x * W, b.y * H, "+5", "#38BDF8");
            return false;
          }
          return true;
        });
      },
      draw(ctx, W, H) {
        for (const b of this.bubbles) {
          const bx = b.x * W, by = b.y * H;
          ctx.save();
          ctx.beginPath();
          ctx.arc(bx, by, b.r, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${b.hue}, 80%, 65%, 0.35)`;
          ctx.fill();
          ctx.strokeStyle = `hsla(${b.hue}, 95%, 75%, 0.85)`;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          // Bubble sheen
          ctx.beginPath();
          ctx.arc(bx - b.r * 0.35, by - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fill();
          ctx.restore();
        }
      },
    },

    // 5. Balance Beam (S1 · E6)
    balance: {
      name: "Balance Beam", emoji: "⚖️", trains: "Steady isometric hold / tremor control", formula: "S1 · E6",
      guide: "Keep your hand hovering steadily over the green target as it slides along the beam.",
      lives: false,
      init() {
        this.t = 0;
        this.held = 0;
        this.tx = 0.5;
      },
      update(res, W, H) {
        this.t += 0.012 * this.$speed;
        this.tx = 0.5 + 0.34 * Math.sin(this.t);
        const tipX = engine.tip ? engine.tip.x : -1;
        if (Math.abs(tipX - this.tx) < 0.055) {
          this.held++;
          if (this.held % 15 === 0) {
            this.$engine.addScore(2);
            spawnParticles(this.tx * W, H * 0.72, "#10B981", 4);
          }
        } else {
          this.held = Math.max(0, this.held - 2);
        }
      },
      draw(ctx, W, H) {
        // Balance beam
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.72); ctx.lineTo(W * 0.9, H * 0.72); ctx.stroke();

        // Target slider
        const tx = this.tx * W, ty = H * 0.72;
        const isAligned = this.held > 5;
        ctx.fillStyle = isAligned ? "#10B981" : "#F59E0B";
        ctx.beginPath(); ctx.arc(tx, ty, 20, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#FFF"; ctx.lineWidth = 3; ctx.stroke();

        // Target alignment aura
        if (isAligned) {
          ctx.beginPath();
          ctx.arc(tx, ty, 30 + Math.sin(Date.now() * 0.01) * 6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(16, 185, 129, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      },
    },

    // 6. Track the Dot (C2 · E4)
    trackdot: {
      name: "Track the Dot", emoji: "🎯", trains: "Smooth pursuit tracking (ataxia)", formula: "C2 · E4",
      guide: "Follow the moving orange target closely with your index finger and stay on it.",
      lives: false,
      init() {
        this.t = 0;
        this.dx = 0.5;
        this.dy = 0.5;
      },
      update(res, W, H) {
        this.t += 0.018 * this.$speed;
        this.dx = 0.5 + 0.32 * Math.cos(this.t);
        this.dy = 0.5 + 0.24 * Math.sin(this.t * 0.75);
        if (engine.tip) {
          const d = Math.hypot(engine.tip.x - this.dx, engine.tip.y - this.dy);
          if (d < 0.075) {
            this.$engine.addScore(1);
            if (Math.random() < 0.3) spawnParticles(this.dx * W, this.dy * H, "#F97316", 2);
          }
        }
      },
      draw(ctx, W, H) {
        const x = this.dx * W, y = this.dy * H;
        // Tracking beam to finger
        if (engine.tip) {
          const fx = engine.tip.x * W, fy = engine.tip.y * H;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(x, y);
          ctx.strokeStyle = "rgba(249, 115, 22, 0.4)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Concentric target rings
        ctx.fillStyle = "#F97316";
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(249, 115, 22, 0.45)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, y, 32, 0, Math.PI * 2); ctx.stroke();
      },
    },

    // 7. Fist Pop (C3)
    fistpop: {
      name: "Fist Pop", emoji: "✊", trains: "Fist → open palm (spasticity release)", formula: "C3",
      guide: "CLOSE a fist to pop a red target orb, then OPEN your hand again — repeat.",
      lives: false,
      init() {
        this.balls = [];
        this.timer = 0;
        this.wasFist = false;
      },
      update(res, W, H) {
        const v = handVariance(res.hand);
        const isFist = v < 0.055 || !this.$open;
        if (isFist && !this.wasFist && this.balls.length) {
          const popped = this.balls.pop();
          this.$engine.addScore(10);
          spawnParticles(popped.x * W, popped.y * H, "#EF4444", 16);
          addScorePopup(popped.x * W, popped.y * H, "+10 ✊", "#EF4444");
        }
        this.wasFist = isFist;
        if (++this.timer > Math.max(18, 50 / this.$speed) && this.balls.length < 5) {
          this.balls.push({ x: rand(0.2, 0.8), y: 1.08, v: rand(0.0035, 0.0065) * this.$speed });
        }
        this.balls = this.balls.filter((b) => (b.y -= b.v) > -0.1);
      },
      draw(ctx, W, H) {
        for (const b of this.balls) {
          ctx.fillStyle = "#EF4444";
          ctx.beginPath(); ctx.arc(b.x * W, b.y * H, 20, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#FCA5A5"; ctx.lineWidth = 2.5; ctx.stroke();
        }
      },
    },

    // 8. Wrist Hammer (S2 · S3)
    hammer: {
      name: "Wrist Hammer", emoji: "🔨", trains: "Fast wrist snap / reaction speed", formula: "S2 · S3",
      guide: "When the target glows, snap your wrist DOWN quickly onto it. Hit it!",
      lives: false,
      init() {
        this.target = { x: rand(0.25, 0.75), y: rand(0.3, 0.65) };
        this.wasDown = false;
        this.swing = 0;
      },
      update(res, W, H) {
        const snapDown = this.$vy > 1.0 || this.$dy > 0.03;
        if (engine.tip) {
          const d = Math.hypot(engine.tip.x - this.target.x, engine.tip.y - this.target.y);
          if (snapDown && !this.wasDown && d < 0.18) {
            this.$engine.addScore(15);
            spawnParticles(this.target.x * W, this.target.y * H, "#F59E0B", 18);
            addScorePopup(this.target.x * W, this.target.y * H, "+15 🔨", "#F59E0B");
            this.target = { x: rand(0.2, 0.8), y: rand(0.25, 0.65) };
          }
        }
        this.wasDown = snapDown;
      },
      draw(ctx, W, H) {
        const tx = this.target.x * W, ty = this.target.y * H;
        // Target anvil
        ctx.fillStyle = "#F59E0B";
        ctx.beginPath(); ctx.arc(tx, ty, 26, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#FFF"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#FFF"; ctx.font = "bold 14px Segoe UI, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("HIT!", tx, ty + 5);
      },
    },

    // 9. Elbow Crusher (C1)
    elbowcrush: {
      name: "Elbow Crusher", emoji: "💪", trains: "Elbow flexion ROM (C1)", formula: "C1",
      guide: "Bend your elbow below 100° to crush each falling block. Straighten to reset.",
      lives: false,
      init() {
        this.blocks = [];
        this.timer = 0;
        this.wasBent = false;
      },
      update(res, W, H) {
        const bent = this.$elbow < 105 && this.$elbow > 10;
        if (bent && !this.wasBent && this.blocks.length) {
          const crushed = this.blocks.pop();
          this.$engine.addScore(10);
          spawnParticles(crushed.x * W, crushed.y * H, "#E5484D", 18);
          addScorePopup(crushed.x * W, crushed.y * H, "+10 💥", "#E5484D");
        }
        this.wasBent = bent;
        if (++this.timer > Math.max(16, 44 / this.$speed) && this.blocks.length < 4) {
          this.blocks.push({ x: rand(0.2, 0.8), y: -0.06, v: rand(0.004, 0.007) * this.$speed });
        }
        this.blocks = this.blocks.filter((b) => (b.y += b.v) < 1.15);
      },
      draw(ctx, W, H) {
        for (const b of this.blocks) {
          ctx.fillStyle = "#E5484D";
          ctx.fillRect(b.x * W - 22, b.y * H - 16, 44, 32);
          ctx.strokeStyle = "#FFF"; ctx.lineWidth = 2; ctx.strokeRect(b.x * W - 22, b.y * H - 16, 44, 32);
        }
      },
    },

    // 10. Flappy Reach (C4)
    flappyreach: {
      name: "Flappy Reach", emoji: "🐤", trains: "Full arm vertical reach (C4)", formula: "C4",
      guide: "Move your whole hand UP and DOWN to steer the chick through the pillar gates.",
      lives: true,
      init() {
        this.pillars = [];
        this.timer = 0;
        this.birdY = 0.5;
      },
      update(res, W, H) {
        if (engine.tip) this.birdY = engine.tip.y;
        if (++this.timer > Math.max(40, 80 / this.$speed)) {
          this.timer = 0;
          this.pillars.push({ x: 1.15, gapY: rand(0.22, 0.78), gap: 0.22, done: false });
        }
        for (const p of this.pillars) {
          p.x -= 0.008 * this.$speed;
          if (Math.abs(p.x - 0.16) < 0.05 && !p.done) {
            p.done = true;
            if (this.birdY < p.gapY - p.gap / 2 || this.birdY > p.gapY + p.gap / 2) {
              this.$engine.loseLife();
            } else {
              this.$engine.addScore(10);
              addScorePopup(0.16 * W, this.birdY * H - 20, "+10", "#22C55E");
            }
          }
        }
        this.pillars = this.pillars.filter((p) => p.x > -0.1);
      },
      draw(ctx, W, H) {
        for (const p of this.pillars) {
          ctx.fillStyle = "#22C55E";
          ctx.fillRect(p.x * W - 18, 0, 36, (p.gapY - p.gap / 2) * H);
          ctx.fillRect(p.x * W - 18, (p.gapY + p.gap / 2) * H, 36, H - (p.gapY + p.gap / 2) * H);
        }
        // Flying Chick
        ctx.fillStyle = "#FACC15";
        ctx.beginPath(); ctx.arc(0.16 * W, this.birdY * H, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(0.16 * W + 6, this.birdY * H - 4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#EA580C"; ctx.beginPath(); ctx.moveTo(0.16 * W + 12, this.birdY * H - 2); ctx.lineTo(0.16 * W + 22, this.birdY * H + 2); ctx.lineTo(0.16 * W + 12, this.birdY * H + 6); ctx.fill();
      },
    },

    // 11. Pinch Pop (E2)
    pinchpop: {
      name: "Pinch Pop", emoji: "🤏", trains: "Thumb–index pinch precision (E2)", formula: "E2",
      guide: "Pinch your thumb and index finger together to pop the purple gem. Release and repeat.",
      lives: false,
      init() {
        this.balls = [];
        this.timer = 0;
        this.wasPinch = false;
      },
      update(res, W, H) {
        let pinch = false;
        if (res.hand && res.hand[4] && res.hand[8]) {
          pinch = distN(res.hand[4], res.hand[8]) < 0.052;
        }
        if (pinch && !this.wasPinch && this.balls.length) {
          const popped = this.balls.pop();
          this.$engine.addScore(10);
          spawnParticles(popped.x * W, popped.y * H, "#8B5CF6", 16);
          addScorePopup(popped.x * W, popped.y * H, "+10 🤏", "#8B5CF6");
        }
        this.wasPinch = pinch;
        if (++this.timer > Math.max(16, 44 / this.$speed) && this.balls.length < 5) {
          this.balls.push({ x: rand(0.15, 0.85), y: 1.08, v: rand(0.0035, 0.006) * this.$speed });
        }
        this.balls = this.balls.filter((b) => (b.y -= b.v) > -0.1);
      },
      draw(ctx, W, H) {
        for (const b of this.balls) {
          ctx.fillStyle = "#8B5CF6";
          ctx.beginPath(); ctx.arc(b.x * W, b.y * H, 18, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#DDD6FE"; ctx.lineWidth = 2.5; ctx.stroke();
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

  updateHUD();
});
