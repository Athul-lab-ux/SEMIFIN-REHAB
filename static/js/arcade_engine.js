/**
 * RehabOpt AR — Session 2: Arcade Arena Engine
 * Flappy Kinetic + Fruit Ballistic, combo multiplier, 3-heart life system
 */
document.addEventListener("DOMContentLoaded", async () => {
  // Game Elements
  const video = document.getElementById("video");
  const gameCanvas = document.getElementById("game-canvas");
  const gCtx = gameCanvas.getContext("2d");
  const handCanvas = document.getElementById("hand-canvas");
  const handCtx = handCanvas.getContext("2d");

  // HUD
  const scoreEl = document.getElementById("score-display");
  const timerEl = document.getElementById("timer-display");
  const comboEl = document.getElementById("combo-display");
  const heartsEl = document.getElementById("hearts-display");
  const toast = document.getElementById("toast");

  // Game State
  let currentMode = "menu"; // menu | flappy | fruit
  let score = 0;
  let combo = 0;
  let lives = 3;
  let gameActive = false;
  let gameStartTime = Date.now();
  let cheatsBlocked = 0;
  let peakRom = 0;
  let smoothnessScore = 75;

  // Flappy State
  let bird = { x: 120, y: 250, vy: 0, radius: 20 };
  let pipes = [];
  let pipeTimer = 0;
  const PIPE_SPEED = 2.5;
  const PIPE_GAP = 160;
  const GRAVITY = 0.35;
  const FLAP_FORCE = -6;

  // Fruit State
  let fruits = [];
  let fruitTimer = 0;
  let handPos = { x: 0.5, y: 0.5 };
  let handOpen = false;
  let velocity = 0;
  let lastHandPos = { x: 0.5, y: 0.5 };
  let lastFrameTime = Date.now();

  const FRUIT_EMOJIS = ["🍉", "🍊", "🍓", "🍑", "🍎"];
  const HAZARD_EMOJI = "💣";

  function showToast(msg, type = "info") {
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    setTimeout(() => (toast.className = "toast"), 3000);
  }

  // --- Resize Canvas ---
  function resizeCanvas() {
    gameCanvas.width = gameCanvas.parentElement.clientWidth;
    gameCanvas.height = gameCanvas.parentElement.clientHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // --- Camera & MediaPipe Hands ---
  const hands = new Hands({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });
  hands.onResults(onHandResults);

  async function initCamera() {
    const cameraObj = new RehabCamera("video", async (videoEl) => {
      await hands.send({ image: videoEl });
    });
    const ok = await cameraObj.initialize();
    if (ok) showToast("✅ Camera active — choose a game mode!", "success");
    else showToast("❌ Camera required for arcade", "error");
  }

  function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0)
      return;

    const lm = results.multiHandLandmarks[0];
    const wrist = lm[0];
    const indexTip = lm[8];
    const thumbTip = lm[4];
    const middleTip = lm[12];

    // Hand position (normalized)
    handPos = { x: indexTip.x, y: indexTip.y };

    // Hand open/close (C3)
    const dispersion = Kinematics.calculateHandDispersion(lm);
    handOpen = dispersion > 0.25;

    // Velocity (S2)
    const now = Date.now();
    const dt = (now - lastFrameTime) / 1000;
    velocity = Kinematics.calculateVelocity(lastHandPos, handPos, dt);
    lastHandPos = { ...handPos };
    lastFrameTime = now;

    // Wrist deviation (E3) for Flappy mode
    const elbow = lm[5] || lm[0];
    const wristDev = Kinematics.calculateWristDeviation(
      { x: elbow.x, y: elbow.y },
      { x: wrist.x, y: wrist.y },
      { x: middleTip.x, y: middleTip.y }
    );

    // Store for game logic
    window._arcadeData = {
      handPos,
      handOpen,
      velocity,
      wristDev,
      dispersion,
    };

    // Draw hand skeleton
    drawHandSkeleton(lm);
  }

  function drawHandSkeleton(lm) {
    handCanvas.width = handCanvas.parentElement.clientWidth;
    handCanvas.height = handCanvas.parentElement.clientHeight;
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    const w = handCanvas.width;
    const h = handCanvas.height;

    // Draw connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];

    handCtx.strokeStyle = handOpen ? "rgba(0, 255, 136, 0.6)" : "rgba(255, 106, 0, 0.4)";
    handCtx.lineWidth = 2;

    connections.forEach(([a, b]) => {
      handCtx.beginPath();
      handCtx.moveTo(lm[a].x * w, lm[a].y * h);
      handCtx.lineTo(lm[b].x * w, lm[b].y * h);
      handCtx.stroke();
    });

    // Draw finger tips
    [4, 8, 12, 16, 20].forEach((idx) => {
      handCtx.beginPath();
      handCtx.arc(lm[idx].x * w, lm[idx].y * h, 4, 0, Math.PI * 2);
      handCtx.fillStyle = "#ff9a3c";
      handCtx.fill();
    });
  }

  // --- Mode Selection ---
  document.getElementById("btn-flappy").addEventListener("click", () => {
    currentMode = "flappy";
    resetFlappy();
    startGame();
    document.getElementById("mode-menu").classList.add("hidden");
    showToast("🐦 Flappy Kinetic — flap with wrist extension!", "info");
  });

  document.getElementById("btn-fruit").addEventListener("click", () => {
    currentMode = "fruit";
    resetFruit();
    startGame();
    document.getElementById("mode-menu").classList.add("hidden");
    showToast("🍉 Fruit Ballistic — open palm to slice!", "info");
  });

  function startGame() {
    gameActive = true;
    gameStartTime = Date.now();
    score = 0;
    combo = 0;
    lives = 3;
    updateHUD();
  }

  // --- Flappy Kinetic ---
  function resetFlappy() {
    bird = { x: 120, y: 250, vy: 0, radius: 20 };
    pipes = [];
    pipeTimer = 0;
  }

  function updateFlappy() {
    const data = window._arcadeData;
    if (!data) return;

    // Flap on wrist extension (E3 > 0) or vertical reaching
    if (data.wristDev > 0 || data.handPos.y < 0.35) {
      bird.vy = FLAP_FORCE;
    }

    bird.vy += GRAVITY;
    bird.y += bird.vy;

    // Pipes
    pipeTimer++;
    if (pipeTimer > 120) {
      pipeTimer = 0;
      const gapY = 100 + Math.random() * (gameCanvas.height - 300);
      pipes.push({
        x: gameCanvas.width,
        gapY,
        scored: false,
      });
    }

    pipes.forEach((p) => {
      p.x -= PIPE_SPEED;

      // Score
      if (!p.scored && p.x + 60 < bird.x) {
        p.scored = true;
        score += 10;
        combo++;
        updateHUD();
      }

      // Collision
      if (
        bird.x + bird.radius > p.x &&
        bird.x - bird.radius < p.x + 60
      ) {
        if (
          bird.y - bird.radius < p.gapY ||
          bird.y + bird.radius > p.gapY + PIPE_GAP
        ) {
          loseLife();
          bird.y = gameCanvas.height / 2;
          bird.vy = 0;
        }
      }
    });

    // Off-screen
    if (bird.y > gameCanvas.height || bird.y < 0) {
      loseLife();
      bird.y = gameCanvas.height / 2;
      bird.vy = 0;
    }

    // Remove off-screen pipes
    pipes = pipes.filter((p) => p.x > -80);
  }

  function drawFlappy() {
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // Pipes
    pipes.forEach((p) => {
      gCtx.fillStyle = "#ff6a00";
      gCtx.fillRect(p.x, 0, 60, p.gapY);
      gCtx.fillRect(p.x, p.gapY + PIPE_GAP, 60, gameCanvas.height);

      // Pipe highlights
      gCtx.strokeStyle = "#ff9a3c";
      gCtx.lineWidth = 2;
      gCtx.strokeRect(p.x, 0, 60, p.gapY);
      gCtx.strokeRect(p.x, p.gapY + PIPE_GAP, 60, gameCanvas.height);
    });

    // Bird
    gCtx.beginPath();
    gCtx.arc(bird.x, bird.y, bird.radius, 0, Math.PI * 2);
    gCtx.fillStyle = "#ffd000";
    gCtx.fill();
    gCtx.strokeStyle = "#ff6a00";
    gCtx.lineWidth = 3;
    gCtx.stroke();

    // Bird eye
    gCtx.beginPath();
    gCtx.arc(bird.x + 6, bird.y - 4, 4, 0, Math.PI * 2);
    gCtx.fillStyle = "#000";
    gCtx.fill();
  }

  // --- Fruit Ballistic ---
  function resetFruit() {
    fruits = [];
    fruitTimer = 0;
  }

  function updateFruit() {
    const data = window._arcadeData;
    if (!data) return;

    // Spawn fruits
    fruitTimer++;
    if (fruitTimer > 50) {
      fruitTimer = 0;
      const isHazard = Math.random() < 0.15;
      fruits.push({
        x: Math.random() * (gameCanvas.width - 60) + 30,
        y: -40,
        vy: 1.5 + Math.random() * 2,
        emoji: isHazard ? HAZARD_EMOJI : FRUIT_EMOJIS[Math.floor(Math.random() * FRUIT_EMOJIS.length)],
        isHazard,
        sliced: false,
      });
    }

    // Update fruits
    fruits.forEach((f) => {
      f.y += f.vy;

      if (f.sliced) return;

      // Slice detection: velocity > 0.8 m/s AND open palm (C3 > 0.25)
      const dx = data.handPos.x * gameCanvas.width - f.x;
      const dy = data.handPos.y * gameCanvas.height - f.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 60 && data.velocity > 0.8 && data.handOpen) {
        f.sliced = true;
        if (f.isHazard) {
          loseLife();
          combo = 0;
          showToast("💣 Hazard hit! -1 ❤️", "error");
        } else {
          score += 10 * Math.max(1, Math.floor(combo / 3));
          combo++;
          showToast(`+${10 * Math.max(1, Math.floor(combo / 3))} points!`, "success");
        }
        updateHUD();
      }
    });

    // Remove off-screen or sliced
    fruits = fruits.filter((f) => f.y < gameCanvas.height + 40 && !f.sliced);
  }

  function drawFruit() {
    gCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    fruits.forEach((f) => {
      gCtx.font = "36px serif";
      gCtx.fillText(f.emoji, f.x - 18, f.y + 12);
    });

    // Draw hand cursor
    if (window._arcadeData) {
      const hp = window._arcadeData.handPos;
      gCtx.beginPath();
      gCtx.arc(hp.x * gameCanvas.width, hp.y * gameCanvas.height, 25, 0, Math.PI * 2);
      gCtx.strokeStyle = window._arcadeData.handOpen
        ? "rgba(0, 255, 136, 0.5)"
        : "rgba(255, 106, 0, 0.3)";
      gCtx.lineWidth = 2;
      gCtx.stroke();
    }
  }

  // --- Lives ---
  function loseLife() {
    lives = Math.max(0, lives - 1);
    combo = 0;
    updateHUD();
    if (lives <= 0) {
      gameActive = false;
      showToast("💔 Game Over! Logging session...", "error");
      logSession();
      setTimeout(() => {
        document.getElementById("mode-menu").classList.remove("hidden");
      }, 2000);
    }
  }

  // --- HUD ---
  function updateHUD() {
    scoreEl.textContent = score;
    timerEl.textContent = formatTime(Date.now() - gameStartTime);
    comboEl.textContent = combo >= 3 ? `⚡ ${Math.floor(combo / 3)}x` : "—";
    heartsEl.textContent = "❤️".repeat(lives) + "🖤".repeat(3 - lives);
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  // --- Game Loop ---
  function gameLoop() {
    if (gameActive) {
      if (currentMode === "flappy") {
        updateFlappy();
        drawFlappy();
      } else if (currentMode === "fruit") {
        updateFruit();
        drawFruit();
      }
      updateHUD();
    }
    requestAnimationFrame(gameLoop);
  }

  // --- Log Session ---
  async function logSession() {
    const duration = Math.floor((Date.now() - gameStartTime) / 1000);
    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "ARCADE",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: duration,
          peak_rom: peakRom,
          smoothness_score: smoothnessScore,
          cheats_blocked: cheatsBlocked,
          score: score,
          metrics_json: JSON.stringify({ score, combo, lives, mode: currentMode }),
        }),
      });
    } catch (err) {
      console.error("Telemetry error:", err);
    }
  }

  // --- Start ---
  await initCamera();
  gameLoop();
});
