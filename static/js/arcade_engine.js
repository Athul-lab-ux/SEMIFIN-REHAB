/**
 * RehabOpt AR — Session 2: Arcade Arena Engine (11 therapeutic games)
 * ------------------------------------------------------------------
 * Kept from the original app : 🐦 Flappy Kinetic, 🍉 Fruit Ballistic
 * Ported from the reference repo: ⭐ Star Catch, 🫧 Bubble Pop,
 * ⚖️ Balance Beam, 🎯 Track the Dot, 🐤 Flappy Reach, ✊ Fist Pop,
 * 🔨 Wrist Hammer, 💪 Elbow Crusher, 🤏 Pinch Pop
 *
 * Dual pose+hand pipeline (VisionLoader). Symbols are used throughout
 * the game shelf so patients can recognise each activity at a glance.
 */
document.addEventListener("DOMContentLoaded", async () => {
  // ---------------- Elements ------------------------------------------
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

  // ---------------- Shared helpers ------------------------------------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const distN = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

  function showToast(msg, type = "info") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = "toast"; }, 2600);
  }

  function handArray(res) {
    if (!res.hand) return null;
    const arr = new Array(21);
    for (let i = 0; i < 21; i++) arr[i] = res.hand[i] || { x: 0, y: 0, z: 0 };
    return arr;
  }

  // Hand spread variance (small = fist, large = open) — reference C3 style
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

  // ---------------- Game registry -------------------------------------
  const GAMES = {
    flappy: {
      name: "Flappy Kinetic", emoji: "🐦", trains: "Wrist extension / dorsiflexion", formula: "E3 · C5",
      guide: "Raise your wrist upward (dorsiflex) to make the bird flap. Navigate through the pipe gaps!",
      lives: true,
      init() { this.bird = { x: 120, y: 250, vy: 0, r: 18 }; this.pipes = []; this.pipeTimer = 0; },
      update(res, W, H) {
        const b = this.bird;
        const dev = this.$dev;
        if (dev > 0 || (res.hand && res.hand[8] && res.hand[8].y < 0.35)) b.vy = -6;
        b.vy += 0.34; b.y += b.vy;
        if (++this.pipeTimer > 115) {
          this.pipeTimer = 0;
          this.pipes.push({ x: W, gapY: rand(90, H - 250), scored: false });
        }
        for (const p of this.pipes) {
          p.x -= 2.6 * this.$speed;
          if (!p.scored && p.x + 55 < b.x) { p.scored = true; this.$engine.addScore(10); }
          if (Math.abs(b.x - p.x) < 18 + 27 && (b.y < p.gapY || b.y > p.gapY + 155)) {
            p.scored = true; this.$engine.loseLife();
            b.y = H / 2; b.vy = 0;
          }
        }
        this.pipes = this.pipes.filter((p) => p.x > -90);
        if (b.y > H || b.y < 0) { this.$engine.loseLife(); b.y = H / 2; b.vy = 0; }
      },
      draw(ctx, W, H) {
        for (const p of this.pipes) {
          ctx.fillStyle = "#FB923C";
          ctx.fillRect(p.x, 0, 55, p.gapY);
          ctx.fillRect(p.x, p.gapY + 155, 55, H - p.gapY - 155);
        }
        ctx.fillStyle = "#F59E0B";
        ctx.beginPath(); ctx.arc(this.bird.x, this.bird.y, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath(); ctx.arc(this.bird.x + 6, this.bird.y - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      },
    },

    fruit: {
      name: "Fruit Ballistic", emoji: "🍉", trains: "Open-palm reach (flexor spasticity)", formula: "C3 · S2",
      guide: "Slice fruit by swiping fast with an OPEN palm (fingers spread). Avoid the 💣!",
      lives: true,
      init() { this.fruits = []; this.timer = 0; },
      update(res, W, H) {
        const F = ["🍉", "🍊", "🍓", "🍑", "🍎"];
        if (++this.timer > Math.max(18, 46 - 10 * this.$speed)) {
          this.timer = 0;
          this.fruits.push({
            x: rand(40, W - 40), y: H + 30, vy: rand(2.2, 4.2) * this.$speed,
            emoji: Math.random() < 0.14 ? "💣" : F[(Math.random() * F.length) | 0],
            bomb: false, gone: false,
          });
          const last = this.fruits[this.fruits.length - 1];
          last.bomb = last.emoji === "💣";
        }
        const tip = res.hand && res.hand[8] ? { x: res.hand[8].x * W, y: res.hand[8].y * H } : null;
        for (const f of this.fruits) {
          f.y -= f.vy;
          if (tip && distN(tip, f) < 62 && this.$vel > 0.6 && this.$open) {
            f.gone = true;
            if (f.bomb) { this.$engine.loseLife(); showToast("💣 Hazard! −1 ❤️", "error"); }
            else this.$engine.addScore(10);
          }
        }
        this.fruits = this.fruits.filter((f) => !f.gone && f.y > -50);
      },
      draw(ctx, W, H) {
        ctx.font = "34px Segoe UI Emoji, sans-serif";
        for (const f of this.fruits) ctx.fillText(f.emoji, f.x - 17, f.y + 11);
      },
    },

    starcatch: {
      name: "Star Catch", emoji: "⭐", trains: "Horizontal reach / shoulder sweep", formula: "C2",
      guide: "Slide your hand left-right along the bottom to catch falling stars.",
      lives: false,
      init() { this.stars = []; this.timer = 0; },
      update(res, W, H) {
        const tip = res.hand && res.hand[8];
        this.handX = tip ? tip.x : 0.5;
        if (++this.timer > Math.max(14, 40 / this.$speed)) { this.timer = 0; this.stars.push({ x: Math.random(), y: -0.05, s: rand(0.006, 0.011) * this.$speed }); }
        this.stars = this.stars.filter((s) => {
          s.y += s.s;
          if (s.y > 1.05) return false;
          if (Math.abs(s.x - this.handX) < 0.055 && s.y > 0.78) { this.$engine.addScore(10); return false; }
          return true;
        });
      },
      draw(ctx, W, H) {
        ctx.font = "24px Segoe UI Emoji, sans-serif";
        for (const s of this.stars) ctx.fillText("⭐", s.x * W - 12, s.y * H);
      },
    },

    bubblepop: {
      name: "Bubble Pop", emoji: "🫧", trains: "Precise index-finger pointing", formula: "C2",
      guide: "Touch the rising bubbles with your index fingertip to pop them.",
      lives: false,
      init() { this.bubbles = []; this.timer = 0; },
      update(res, W, H) {
        const tip = res.hand && res.hand[8];
        if (++this.timer > Math.max(14, 38 / this.$speed)) { this.timer = 0; this.bubbles.push({ x: rand(0.12, 0.88), y: 1.1, v: rand(0.004, 0.008) * this.$speed, r: rand(14, 26) }); }
        this.bubbles = this.bubbles.filter((b) => {
          b.y -= b.v;
          if (b.y < -0.08) return false;
          if (tip && Math.sqrt((b.x - tip.x) ** 2 + (b.y - tip.y) ** 2) < 0.07) { this.$engine.addScore(5); return false; }
          return true;
        });
      },
      draw(ctx, W, H) {
        ctx.strokeStyle = "#38BDF8"; ctx.lineWidth = 2;
        for (const b of this.bubbles) { ctx.beginPath(); ctx.arc(b.x * W, b.y * H, b.r, 0, Math.PI * 2); ctx.stroke(); }
      },
    },

    balance: {
      name: "Balance Beam", emoji: "⚖️", trains: "Steady isometric hold / tremor control", formula: "S1 · E6",
      guide: "Keep your hand hovering over the green target while it slides along the beam.",
      lives: false,
      init() { this.t = 0; this.held = 0; },
      update(res, W, H) {
        this.t += 0.012 * this.$speed;
        const tx = 0.5 + 0.36 * Math.sin(this.t);
        const tip = res.hand && res.hand[8] ? res.hand[8].x : -1;
        if (Math.abs(tip - tx) < 0.045) { this.held += 1; if (this.held % 20 === 0) this.$engine.addScore(2); }
        else this.held = 0;
        this.tx = tx;
      },
      draw(ctx, W, H) {
        ctx.strokeStyle = "#94A3B8"; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, H * 0.72); ctx.lineTo(W, H * 0.72); ctx.stroke();
        ctx.fillStyle = "#10B981";
        ctx.beginPath(); ctx.arc(this.tx * W, H * 0.72, 15, 0, Math.PI * 2); ctx.fill();
      },
    },

    trackdot: {
      name: "Track the Dot", emoji: "🎯", trains: "Smooth pursuit tracking (ataxia)", formula: "C2 · E4",
      guide: "Follow the moving orange dot closely with your index finger and stay on it.",
      lives: false,
      init() { this.t = 0; },
      update(res, W, H) {
        this.t += 0.02 * this.$speed;
        this.dx = 0.5 + 0.3 * Math.cos(this.t);
        this.dy = 0.5 + 0.26 * Math.sin(this.t * 0.8);
        const tip = res.hand && res.hand[8];
        if (tip && Math.sqrt((tip.x - this.dx) ** 2 + (tip.y - this.dy) ** 2) < 0.06) this.$engine.addScore(1);
      },
      draw(ctx, W, H) {
        ctx.fillStyle = "#F97316";
        ctx.beginPath(); ctx.arc(this.dx * W, this.dy * H, 15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(249,115,22,0.4)";
        ctx.beginPath(); ctx.arc(this.dx * W, this.dy * H, 30, 0, Math.PI * 2); ctx.stroke();
      },
    },

    fistpop: {
      name: "Fist Pop", emoji: "✊", trains: "Fist → open palm (spasticity release)", formula: "C3",
      guide: "CLOSE a fist to pop one red ball, then OPEN your hand again — repeat.",
      lives: false,
      init() { this.balls = []; this.timer = 0; this.wasFist = false; },
      update(res, W, H) {
        const v = handVariance(res.hand);
        const isFist = v < 0.045;
        if (isFist && !this.wasFist && this.balls.length) {
          this.balls.pop();
          this.$engine.addScore(10);
        }
        this.wasFist = isFist;
        if (++this.timer > Math.max(20, 55 / this.$speed) && this.balls.length < 5) {
          this.balls.push({ x: rand(0.2, 0.8), y: 1.08, v: rand(0.0035, 0.006) * this.$speed });
        }
        this.balls = this.balls.filter((b) => (b.y -= b.v) > -0.1);
      },
      draw(ctx, W, H) {
        ctx.fillStyle = "#EF4444";
        for (const b of this.balls) { ctx.beginPath(); ctx.arc(b.x * W, b.y * H, 17, 0, Math.PI * 2); ctx.fill(); }
      },
    },

    hammer: {
      name: "Wrist Hammer", emoji: "🔨", trains: "Fast wrist snap / reaction speed", formula: "S2 · S3",
      guide: "When the target glows, snap your wrist DOWN quickly onto it. Hit it!",
      lives: false,
      init() { this.target = { x: rand(0.3, 0.7), y: rand(0.3, 0.6) }; this.wasDown = false; },
      update(res, W, H) {
        const tip = res.hand && res.hand[8];
        const down = tip ? this.$vy > 1.2 && this.$dy > 0 : false;
        if (down && !this.wasDown && tip && Math.sqrt((tip.x - this.target.x) ** 2 + (tip.y - this.target.y) ** 2) < 0.14) {
          this.$engine.addScore(15);
          showToast("🔨 Hit! +15", "success");
          this.target = { x: rand(0.2, 0.8), y: rand(0.25, 0.65) };
        }
        this.wasDown = down;
      },
      draw(ctx, W, H) {
        ctx.fillStyle = "#F59E0B";
        ctx.beginPath(); ctx.arc(this.target.x * W, this.target.y * H, 21, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 15px Segoe UI, sans-serif"; ctx.textAlign = "center";
        ctx.fillText("HIT", this.target.x * W, this.target.y * H + 5); ctx.textAlign = "start";
      },
    },

    elbowcrush: {
      name: "Elbow Crusher", emoji: "💪", trains: "Elbow flexion ROM (C1)", formula: "C1",
      guide: "Bend your elbow below 100° to crush each falling block. Straighten to reset.",
      lives: false,
      init() { this.blocks = []; this.timer = 0; this.wasBent = false; },
      update(res, W, H) {
        const bent = this.$elbow < 100 && this.$elbow > 0;
        if (bent && !this.wasBent && this.blocks.length) { this.blocks.pop(); this.$engine.addScore(10); }
        this.wasBent = bent;
        if (++this.timer > Math.max(18, 46 / this.$speed) && this.blocks.length < 4) {
          this.blocks.push({ x: rand(0.2, 0.8), y: -0.06, v: rand(0.004, 0.007) * this.$speed });
        }
        this.blocks = this.blocks.filter((b) => (b.y += b.v) < 1.15);
      },
      draw(ctx, W, H) {
        ctx.fillStyle = "#E5484D";
        for (const b of this.blocks) ctx.fillRect(b.x * W - 19, b.y * H - 14, 38, 28);
      },
    },

    flappyreach: {
      name: "Flappy Reach", emoji: "🐤", trains: "Full arm vertical reach (C4)", formula: "C4",
      guide: "Move your whole hand UP and DOWN to steer the chick through the pillar gaps.",
      lives: true,
      init() { this.pillars = []; this.timer = 0; this.birdY = 0.5; },
      update(res, W, H) {
        const tip = res.hand && res.hand[8];
        if (tip) this.birdY = tip.y;
        if (++this.timer > Math.max(40, 80 / this.$speed)) {
          this.timer = 0;
          const gapY = rand(0.22, 0.78);
          this.pillars.push({ x: 1.15, gapY, gap: 0.2, done: false });
        }
        for (const p of this.pillars) {
          p.x -= 0.0075 * this.$speed;
          if (Math.abs(p.x - 0.16) < 0.06 && !p.done) {
            p.done = true;
            if (this.birdY < p.gapY - p.gap / 2 || this.birdY > p.gapY + p.gap / 2) {
              this.$engine.loseLife();
              if (this.$engine.state.lives <= 0) return;
            } else {
              this.$engine.addScore(10);
            }
          }
        }
        this.pillars = this.pillars.filter((p) => p.x > -0.1);
      },
      draw(ctx, W, H) {
        for (const p of this.pillars) {
          ctx.fillStyle = "#22C55E";
          ctx.fillRect(p.x * W - 16, 0, 32, (p.gapY - p.gap / 2) * H);
          ctx.fillRect(p.x * W - 16, (p.gapY + p.gap / 2) * H, 32, H - (p.gapY + p.gap / 2) * H);
        }
        ctx.fillStyle = "#FACC15";
        ctx.beginPath(); ctx.arc(0.16 * W, this.birdY * H, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#7C3AED"; ctx.beginPath(); ctx.arc(0.16 * W, this.birdY * H, 4, 0, Math.PI * 2); ctx.fill();
      },
    },

    pinchpop: {
      name: "Pinch Pop", emoji: "🤏", trains: "Thumb–index pinch precision (E2)", formula: "E2",
      guide: "Pinch your thumb and index finger together to pop the purple ball. Release and repeat.",
      lives: false,
      init() { this.balls = []; this.timer = 0; this.wasPinch = false; },
      update(res, W, H) {
        let pinch = false;
        if (res.hand && res.hand[4] && res.hand[8]) {
          pinch = distN(res.hand[4], res.hand[8]) < 0.045;
        }
        if (pinch && !this.wasPinch && this.balls.length) { this.balls.pop(); this.$engine.addScore(10); }
        this.wasPinch = pinch;
        if (++this.timer > Math.max(18, 48 / this.$speed) && this.balls.length < 5) {
          this.balls.push({ x: rand(0.15, 0.85), y: 1.08, v: rand(0.0035, 0.006) * this.$speed });
        }
        this.balls = this.balls.filter((b) => (b.y -= b.v) > -0.1);
      },
      draw(ctx, W, H) {
        ctx.fillStyle = "#8B5CF6";
        for (const b of this.balls) { ctx.beginPath(); ctx.arc(b.x * W, b.y * H, 16, 0, Math.PI * 2); ctx.fill(); }
      },
    },
  };

  const GAME_KEYS = Object.keys(GAMES);

  // ---------------- Engine state ---------------------------------------
  const engine = {
    game: null,
    key: null,
    playing: false,
    paused: false,
    startedAt: 0,
    score: 0,
    combo: 0,
    comboReset: 0,
    lives: 3,
    speed: 1,
    // live metrics for this frame
    tip: null, dev: 0, elbow: 180, open: false, disp: 0, vel: 0, vy: 0, dy: 0,
    last: null, lastT: 0,
    arm: null,
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

  // Build shelf buttons with emoji symbols
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
    guideLine.textContent = `💬 ${GAMES[id].guide}`;
    document.querySelectorAll(".game-btn").forEach((b) => b.classList.toggle("selected", b.dataset.game === id));
    if (!engine.visionStarted) await startVision();

    runArcadeCountdown("GET READY", 4, () => {
      engine.game.init.call(engine.game);
      engine.score = 0; engine.combo = 0; engine.lives = 3;
      engine.paused = false; engine.playing = true;
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
    engine.game = null; engine.key = null;
    placeholder.style.display = "";
    kpiGame.textContent = "—"; kpiTrains.textContent = "—"; kpiFormula.textContent = "—";
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
    timerEl.textContent = engine.playing
      ? fmt(Date.now() - engine.startedAt)
      : "00:00";
    comboEl.textContent = engine.combo >= 3 ? `⚡${(engine.combo / 3) | 0}x` : "—";
    heartsEl.textContent = "❤️".repeat(Math.max(0, engine.lives)) + "🖤".repeat(Math.max(0, 3 - engine.lives));
  }

  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  // ---------------- Vision boot -----------------------------------------
  async function startVision() {
    if (engine.visionStarted) return;
    // Pre-flight: 10,000-frame QA stress test before camera init
    if (window.RehabQA) {
      const report = window.RehabQA.runStressTest(window.RehabQA.STRESS_TARGET);
      if (!report.passed) {
        console.warn("[QA] Kinematic stress test failures:", report.failures.slice(0, 3));
      }
    }
    const ok = await VisionLoader.start(video, onFrame);
    if (ok) {
      engine.visionStarted = true;
      VisionLoader.watch(() => { /* watchdog restarts pipeline itself */ });
      showToast("✅ Camera active — enjoy your session!", "success");
    } else {
      showToast("❌ Camera unavailable — games need webcam access", "error");
    }
  }

  // ---------------- Per-frame update ------------------------------------
  function computeFrame(res) {
    // Position + velocity of index fingertip
    const tip = res.hand && res.hand[8];
    engine.tip = tip ? { x: tip.x, y: tip.y } : null;
    const now = Date.now();
    const dt = (now - engine.lastT) / 1000;
    if (engine.tip && engine.last) {
      engine.vel = Math.sqrt((engine.tip.x - engine.last.x) ** 2 + (engine.tip.y - engine.last.y) ** 2) / Math.max(0.001, dt);
      engine.dy = engine.tip.y - engine.last.y;
      engine.vy = engine.dy / Math.max(0.001, dt);
    } else { engine.vel = 0; engine.dy = 0; engine.vy = 0; }
    engine.last = engine.tip ? { ...engine.tip } : engine.last;
    engine.lastT = now;

    // Dispersion (C3) + open palm
    const hm = handArray(res);
    if (hm) {
      engine.disp = Kinematics.calculateHandDispersion(hm);
      engine.open = engine.disp > 0.25;
    }

    // Wrist deviation (E3) using hand landmarks (elbow proxy = index MCP)
    if (res.hand && res.hand[0] && res.hand[5] && res.hand[12]) {
      engine.dev = Kinematics.calculateWristDeviation(
        { x: res.hand[5].x, y: res.hand[5].y },
        { x: res.hand[0].x, y: res.hand[0].y },
        { x: res.hand[12].x, y: res.hand[12].y }
      );
    } else engine.dev = 0;

    // Elbow flexion angle (C1) from pose.
    // Prefer the loader's single tracking chain (the arm whose hand is
    // visible) so only ONE arm + ONE hand ever drive the games.
    let a = null;
    if (res.chain && res.chain.sh && res.chain.el && res.chain.wr &&
        (res.chain.sh.x !== 0 || res.chain.sh.y !== 0)) {
      a = { sh: res.chain.sh, el: res.chain.el, wr: res.chain.wr };
    } else if (res.pose) {
      const cands = [
        { sh: res.pose[12], el: res.pose[14], wr: res.pose[16] },
        { sh: res.pose[11], el: res.pose[13], wr: res.pose[15] },
      ];
      for (const c of cands) {
        if (c.sh && c.el && c.wr && (c.sh.x !== 0 || c.sh.y !== 0)) { a = c; break; }
      }
    }
    engine.elbow = a ? Kinematics.calculateJointAngle(a.sh, a.el, a.wr) : 180;
    engine.arm = a;
  }

  function drawOverlay(res) {
    oCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const W = overlayCanvas.width, H = overlayCanvas.height;
    // Arm skeleton (pose) — raw (unmirrored) coords on the Games stage
    if (engine.arm) {
      const { sh, el, wr } = engine.arm;
      oCtx.strokeStyle = "#38BDF8"; oCtx.lineWidth = 5; oCtx.lineCap = "round";
      oCtx.beginPath();
      oCtx.moveTo(sh.x * W, sh.y * H);
      oCtx.lineTo(el.x * W, el.y * H);
      oCtx.lineTo(wr.x * W, wr.y * H);
      oCtx.stroke();
      [[sh, "#F97316"], [el, "#10B981"], [wr, "#10B981"]].forEach(([p, c]) => {
        oCtx.fillStyle = c;
        oCtx.beginPath(); oCtx.arc(p.x * W, p.y * H, 7, 0, Math.PI * 2); oCtx.fill();
      });
    }
    // Hand tip cursor — raw (unmirrored) coords on the Games stage
    if (engine.tip) {
      oCtx.beginPath();
      oCtx.arc(engine.tip.x * W, engine.tip.y * H, 18, 0, Math.PI * 2);
      oCtx.strokeStyle = engine.open ? "rgba(16,185,129,0.85)" : "rgba(255,106,0,0.7)";
      oCtx.lineWidth = 3;
      oCtx.stroke();
    }
  }

  function onFrame(res) {
    if (!engine.playing) { return; }
    if (engine.paused) return;
    const w = gameCanvas.width, h = gameCanvas.height;

    computeFrame(res);

    // Per-game metric visibility
    metricEl.textContent =
      engine.key === "fruit" ? `Palm ${engine.open ? "OPEN 🌱" : "fist ✊"} · v=${engine.vel.toFixed(1)}` :
      engine.key === "flappy" || engine.key === "flappyreach" ? `Wrist dev ${Math.round(engine.dev)}°` :
      engine.key === "elbowcrush" ? `Elbow ${Math.round(engine.elbow)}°` :
      engine.key === "pinchpop" || engine.key === "fistpop" ? `Dispersion ${engine.disp.toFixed(2)}` :
      engine.key === "hammer" ? `Speed ${engine.vy.toFixed(1)}/s` :
      `Disp ${engine.disp.toFixed(2)} · v ${engine.vel.toFixed(1)}`;
    kpiHand.textContent = engine.open ? "🖐️ Open palm" : "✊ Fist / closed";

    // Inject per-frame values into the game and step it
    const g = engine.game;
    if (g) {
      g.$elbow = engine.elbow;
      g.$dev = engine.dev;
      g.$vel = engine.vel;
      g.$vy = engine.vy;
      g.$dy = engine.dy;
      g.$open = engine.open;
      g.$disp = engine.disp;
      if (typeof g.update === "function") g.update(res, w, h);
    }

    // Draw
    gCtx.clearRect(0, 0, w, h);
    if (g && typeof g.draw === "function") g.draw(gCtx, w, h);
    drawOverlay(res);
    updateHUD();
  }

  // ---------------- Sizing / loop ---------------------------------------
  function resize() {
    const parent = gameCanvas.parentElement;
    gameCanvas.width = parent.clientWidth;
    gameCanvas.height = parent.clientHeight;
    overlayCanvas.width = parent.clientWidth;
    overlayCanvas.height = parent.clientHeight;
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });
  resize();

  setInterval(updateHUD, 500);

  // ---------------- Controls ---------------------------------------------
  const btnStart = document.getElementById("btn-start");
  const btnPause = document.getElementById("btn-pause");
  const btnResume = document.getElementById("btn-resume");
  const btnStop = document.getElementById("btn-stop");
  const modalResume = document.getElementById("modal-game-resume");
  const modalStop = document.getElementById("modal-game-stop");

  if (btnStart) {
    btnStart.addEventListener("click", () => {
      const targetKey = engine.key || "flappy";
      selectGame(targetKey);
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
