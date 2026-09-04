/**
 * RehabOpt AR — Session 1: Therapy Drills Engine (Gym-App Quality)
 * Warm-up → Sets × Reps → Rest → Complete → Summary
 */
document.addEventListener("DOMContentLoaded", async () => {
  // === DOM Elements ===
  const screens = {
    pre: document.getElementById("pre-workout"),
    warmup: document.getElementById("warmup-screen"),
    workout: document.getElementById("workout-screen"),
    rest: document.getElementById("rest-screen"),
    complete: document.getElementById("complete-screen"),
  };

  const video = document.getElementById("video");
  const overlayCanvas = document.getElementById("overlay-canvas");
  const overlayCtx = overlayCanvas.getContext("2d");
  const ghostCanvas = document.getElementById("ghost-guide-canvas");
  const ghostCtx = ghostCanvas.getContext("2d");

  // HUD elements
  const angleDisplay = document.getElementById("angle-display");
  const angleArc = document.getElementById("angle-arc");
  const repDisplay = document.getElementById("rep-display");
  const repArc = document.getElementById("rep-arc");
  const timerDisplay = document.getElementById("timer-display");
  const setInfo = document.getElementById("set-info");
  const cheatAlert = document.getElementById("cheat-alert");
  const hintBanner = document.getElementById("hint-banner");
  const cueStep = document.getElementById("cue-step");
  const warmupCounter = document.getElementById("warmup-counter");
  const warmupFill = document.getElementById("warmup-fill");
  const restCounter = document.getElementById("rest-counter");
  const restFill = document.getElementById("rest-fill");
  const setDots = document.getElementById("set-dots");
  const setRepsFill = document.getElementById("set-reps-fill");
  const toast = document.getElementById("toast");

  // === Configuration ===
  const CONFIG = {
    WARMUP_SECONDS: 5,
    REST_SECONDS: 30,
    SETS: 3,
    REPS_PER_SET: 10,
    EXTENSION_THRESHOLD: 135,
    FLEXION_THRESHOLD: 60,
    TRUNK_CHEAT_THRESHOLD: 10,
    INACTIVITY_TIMEOUT: 3000,
    HINT_DURATION: 5000,
  };

  // === Workout State ===
  let state = {
    phase: "pre", // pre | warmup | active | rest | paused | complete
    currentSet: 1,
    currentRep: 0,
    armState: "FLEXED", // FLEXED | EXTENDED
    currentAngle: 0,
    peakRom: 0,
    cheatsBlocked: 0,
    totalReps: 0,
    sessionStartTime: 0,
    lastMovementTime: 0,
    isInactive: false,
    isPaused: false,
    pauseStartTime: 0,
    totalPausedTime: 0,
    positionBuffer: [],
    timestampBuffer: [],
  };

  // Audio context for sound effects
  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playBeep(freq, duration, volume) {
    try {
      const ctx = getAudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = volume || 0.15;
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* silent */ }
  }

  function playRepSound() { playBeep(880, 0.1, 0.12); }
  function playSetComplete() { playBeep(1200, 0.15, 0.15); setTimeout(() => playBeep(1600, 0.15, 0.15), 150); }
  function playWorkoutComplete() {
    playBeep(880, 0.1, 0.15);
    setTimeout(() => playBeep(1100, 0.1, 0.15), 100);
    setTimeout(() => playBeep(1400, 0.2, 0.15), 200);
  }

  // === Screen Management ===
  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
    state.phase = name;
  }

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = `toast show ${type || "info"}`;
    setTimeout(() => (toast.className = "toast"), 3000);
  }

  // === Pre-Workout ===
  document.getElementById("pre-condition").textContent =
    localStorage.getItem("selectedCondition") || "Hemiparesis";

  document.getElementById("start-workout-btn").addEventListener("click", () => {
    startWarmup();
  });

  document.getElementById("replay-btn").addEventListener("click", () => {
    resetWorkout();
    startWarmup();
  });

  // === Warm-Up Countdown ===
  async function startWarmup() {
    showScreen("warmup");
    // Initialize camera during warmup
    const cam = new RehabCamera("video", onFrame);
    const ok = await cam.initialize();
    if (!ok) {
      showToast("Camera access required", "error");
      showScreen("pre");
      return;
    }

    let count = CONFIG.WARMUP_SECONDS;
    warmupCounter.textContent = count;
    warmupFill.style.width = "0%";

    const interval = setInterval(() => {
      count--;
      warmupCounter.textContent = count;
      warmupFill.style.width = `${((CONFIG.WARMUP_SECONDS - count) / CONFIG.WARMUP_SECONDS) * 100}%`;
      playBeep(440, 0.05, 0.1);

      if (count <= 0) {
        clearInterval(interval);
        warmupFill.style.width = "100%";
        startActiveWorkout();
      }
    }, 1000);

    // Start Pose detection
    initPose();
  }

  // === Active Workout ===
  function startActiveWorkout() {
    showScreen("workout");
    state.sessionStartTime = Date.now();
    state.lastMovementTime = Date.now();
    updateSetDisplay();
    updateRepDisplay();
    startTimer();
  }

  function updateSetDisplay() {
    setInfo.textContent = `Set ${state.currentSet}/${CONFIG.SETS}`;

    // Update set dots
    const dots = setDots.querySelectorAll(".set-dot");
    dots.forEach((dot, i) => {
      dot.classList.remove("active", "done");
      if (i + 1 < state.currentSet) dot.classList.add("done");
      if (i + 1 === state.currentSet) dot.classList.add("active");
    });
  }

  function updateRepDisplay() {
    repDisplay.textContent = state.currentRep;
    const pct = (state.currentRep / CONFIG.REPS_PER_SET) * 100;
    setRepsFill.style.width = `${pct}%`;

    // Update rep arc
    const circumference = 2 * Math.PI * 42;
    const offset = circumference - (pct / 100) * circumference;
    repArc.setAttribute("stroke-dashoffset", offset);

    // Color change on completion
    if (state.currentRep >= CONFIG.REPS_PER_SET) {
      repArc.setAttribute("stroke", "#00ff88");
    } else {
      repArc.setAttribute("stroke", "#ff6a00");
    }
  }

  function updateAngleDisplay(angle) {
    state.currentAngle = angle;
    angleDisplay.textContent = `${Math.round(angle)}°`;

    // Update arc
    const circumference = 2 * Math.PI * 52;
    const pct = Math.min(1, angle / CONFIG.EXTENSION_THRESHOLD);
    const offset = circumference - pct * circumference;
    angleArc.setAttribute("stroke-dashoffset", offset);

    // Color based on progress
    if (angle >= CONFIG.EXTENSION_THRESHOLD) {
      angleArc.setAttribute("stroke", "#00ff88");
    } else if (angle >= 100) {
      angleArc.setAttribute("stroke", "#ffd000");
    } else {
      angleArc.setAttribute("stroke", "#ff6a00");
    }
  }

  // === Timer ===
  let timerInterval = null;
  function startTimer() {
    timerInterval = setInterval(() => {
      if (state.isPaused) return;
      const elapsed = Math.floor((Date.now() - state.sessionStartTime - state.totalPausedTime) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      timerDisplay.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }, 500);
  }

  // === Pause ===
  document.getElementById("pause-btn").addEventListener("click", () => {
    if (state.isPaused) {
      resumeWorkout();
    } else {
      pauseWorkout();
    }
  });

  function pauseWorkout() {
    state.isPaused = true;
    state.pauseStartTime = Date.now();
    document.getElementById("pause-btn").textContent = "▶ Resume";

    // Show pause overlay
    const overlay = document.createElement("div");
    overlay.className = "pause-overlay";
    overlay.id = "pause-overlay";
    overlay.innerHTML = `
      <h2>⏸ Paused</h2>
      <p style="color:#8a7a6a;margin-bottom:20px;">Take a break — you're doing great!</p>
      <button onclick="document.getElementById('pause-overlay').remove(); window._therapyResume();">▶ Resume</button>
    `;
    screens.workout.appendChild(overlay);
  }

  function resumeWorkout() {
    state.isPaused = false;
    state.totalPausedTime += Date.now() - state.pauseStartTime;
    document.getElementById("pause-btn").textContent = "⏸ Pause";
    const overlay = document.getElementById("pause-overlay");
    if (overlay) overlay.remove();
  }

  window._therapyResume = resumeWorkout;

  // === Pose Detection ===
  let pose = null;
  function initPose() {
    pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    pose.onResults(onPoseResults);
  }

  async function onFrame(videoEl) {
    if (pose && state.phase === "workout") {
      await pose.send({ image: videoEl });
    }
  }

  function onPoseResults(results) {
    if (state.isPaused || !results.poseLandmarks) return;

    const lm = results.poseLandmarks;
    const shoulder = lm[12];
    const elbow = lm[14];
    const wrist = lm[16];
    const leftShoulder = lm[11];

    if (!shoulder || !elbow || !wrist) return;

    // C1: Joint Goniometry
    const angle = Kinematics.calculateJointAngle(shoulder, elbow, wrist);
    updateAngleDisplay(angle);

    if (angle > state.peakRom) state.peakRom = angle;

    // E1: Anti-Cheat Trunk Tilt
    if (leftShoulder) {
      const tilt = Kinematics.calculateTrunkTilt(leftShoulder, shoulder);
      if (tilt.isCompensating) {
        cheatAlert.classList.add("visible");
        state.cheatsBlocked++;
        cueStep.textContent = "Keep shoulders level!";
        cueStep.style.color = "#ff4444";
        setTimeout(() => {
          cheatAlert.classList.remove("visible");
          cueStep.style.color = "";
        }, 2000);
      }
    }

    // Rep Latch State Machine
    processRepLatch(angle);

    // Movement tracking
    const now = Date.now();
    if (angle !== state.currentAngle || Math.abs(angle - state.currentAngle) > 1) {
      state.lastMovementTime = now;
      if (state.isInactive) {
        hintBanner.classList.remove("visible");
        state.isInactive = false;
      }
    }

    // Inactivity watchdog
    if (now - state.lastMovementTime > CONFIG.INACTIVITY_TIMEOUT && !state.isInactive) {
      state.isInactive = true;
      hintBanner.classList.add("visible");
      cueStep.textContent = "Move your arm!";
      cueStep.style.color = "#ff9a3c";
      setTimeout(() => {
        hintBanner.classList.remove("visible");
        state.isInactive = false;
        cueStep.style.color = "";
      }, CONFIG.HINT_DURATION);
    }

    // Smoothness tracking
    state.positionBuffer.push(angle);
    state.timestampBuffer.push(now);
    if (state.positionBuffer.length > 60) state.positionBuffer.shift();
    if (state.timestampBuffer.length > 60) state.timestampBuffer.shift();

    // Draw overlay
    drawOverlay(lm);
  }

  // === Rep Latch State Machine ===
  function processRepLatch(angle) {
    if (state.cheatsBlocked > 0 && cheatAlert.classList.contains("visible")) return;

    if (state.armState === "FLEXED" && angle >= CONFIG.EXTENSION_THRESHOLD) {
      // Rep completed!
      state.armState = "EXTENDED";
      state.currentRep++;
      state.totalReps++;
      updateRepDisplay();
      playRepSound();

      // Update form cue
      cueStep.textContent = "Return to start position";
      cueStep.style.color = "#00ff88";
      setTimeout(() => { cueStep.style.color = ""; }, 1000);

      // Check set completion
      if (state.currentRep >= CONFIG.REPS_PER_SET) {
        playSetComplete();
        showToast(`Set ${state.currentSet} complete!`, "success");

        if (state.currentSet >= CONFIG.SETS) {
          // Workout complete!
          setTimeout(() => completeWorkout(), 1500);
        } else {
          // Start rest period
          setTimeout(() => startRest(), 1000);
        }
      }
    } else if (state.armState === "EXTENDED" && angle < CONFIG.FLEXION_THRESHOLD) {
      state.armState = "FLEXED";
      cueStep.textContent = "Extend arm to 135°";
      cueStep.style.color = "";
    } else {
      // Intermediate angles
      if (angle < CONFIG.FLEXION_THRESHOLD) {
        cueStep.textContent = "Bend elbow to start position";
      } else if (angle >= CONFIG.FLEXION_THRESHOLD && angle < CONFIG.EXTENSION_THRESHOLD) {
        const remaining = Math.round(CONFIG.EXTENSION_THRESHOLD - angle);
        cueStep.textContent = `Extend ${remaining}° more to target`;
      }
    }
  }

  // === Rest Between Sets ===
  function startRest() {
    showScreen("rest");
    let count = CONFIG.REST_SECONDS;
    restCounter.textContent = count;
    restFill.style.width = "100%";

    const interval = setInterval(() => {
      count--;
      restCounter.textContent = count;
      restFill.style.width = `${(count / CONFIG.REST_SECONDS) * 100}%`;

      if (count <= 0) {
        clearInterval(interval);
        nextSet();
      }
    }, 1000);

    document.getElementById("skip-rest-btn").onclick = () => {
      clearInterval(interval);
      nextSet();
    };
  }

  function nextSet() {
    state.currentSet++;
    state.currentRep = 0;
    state.armState = "FLEXED";
    updateSetDisplay();
    updateRepDisplay();
    showScreen("workout");
    cueStep.textContent = "Bend elbow to start position";
  }

  // === Workout Complete ===
  function completeWorkout() {
    showScreen("complete");
    playWorkoutComplete();
    if (timerInterval) clearInterval(timerInterval);

    // Calculate stats
    const duration = Math.floor((Date.now() - state.sessionStartTime - state.totalPausedTime) / 1000);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;

    document.getElementById("cs-reps").textContent = state.totalReps;
    document.getElementById("cs-sets").textContent = CONFIG.SETS;
    document.getElementById("cs-rom").textContent = `${Math.round(state.peakRom)}°`;
    document.getElementById("cs-cheats").textContent = state.cheatsBlocked;
    document.getElementById("cs-time").textContent = `${mins}:${String(secs).padStart(2, "0")}`;

    // Streak
    const streak = StreakManager.updateStreak();
    document.getElementById("cs-streak").textContent = streak;

    // Grade
    const gradeEl = document.getElementById("complete-grade");
    let grade, desc;
    if (state.cheatsBlocked === 0 && state.peakRom >= CONFIG.EXTENSION_THRESHOLD) {
      grade = "A+"; desc = "Perfect Form!";
    } else if (state.cheatsBlocked <= 2) {
      grade = "A"; desc = "Excellent Form";
    } else if (state.cheatsBlocked <= 5) {
      grade = "B"; desc = "Good — Watch Posture";
    } else {
      grade = "C"; desc = "Keep Practicing";
    }
    gradeEl.querySelector(".grade-letter").textContent = grade;
    gradeEl.querySelector(".grade-desc").textContent = desc;

    // Log telemetry
    logSession(duration);
  }

  function resetWorkout() {
    state = {
      phase: "pre",
      currentSet: 1,
      currentRep: 0,
      armState: "FLEXED",
      currentAngle: 0,
      peakRom: 0,
      cheatsBlocked: 0,
      totalReps: 0,
      sessionStartTime: 0,
      lastMovementTime: 0,
      isInactive: false,
      isPaused: false,
      pauseStartTime: 0,
      totalPausedTime: 0,
      positionBuffer: [],
      timestampBuffer: [],
    };
    updateSetDisplay();
    updateRepDisplay();
  }

  // === Ghost Guide Animation ===
  let ghostT = 0;
  function animateGhostGuide() {
    ghostCtx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
    const cx = ghostCanvas.width / 2;
    const cy = 20;
    const armLen = 55;

    const phase = Math.sin(ghostT * 0.03) * 0.5 + 0.5;
    const ghostAngle = 50 + phase * 95;
    const rad = (ghostAngle * Math.PI) / 180;

    const elbowX = cx;
    const elbowY = cy + 35;
    const wristX = elbowX + armLen * Math.sin(rad);
    const wristY = elbowY + armLen * Math.cos(rad);

    ghostCtx.strokeStyle = "rgba(0, 200, 255, 0.35)";
    ghostCtx.lineWidth = 2.5;
    ghostCtx.shadowColor = "rgba(0, 200, 255, 0.2)";
    ghostCtx.shadowBlur = 4;

    ghostCtx.beginPath();
    ghostCtx.moveTo(cx, cy);
    ghostCtx.lineTo(elbowX, elbowY);
    ghostCtx.lineTo(wristX, wristY);
    ghostCtx.stroke();
    ghostCtx.shadowBlur = 0;

    // Joints
    ghostCtx.fillStyle = "rgba(0, 200, 255, 0.4)";
    [cx, cy, elbowX, elbowY, wristX, wristY].forEach((v, i) => {
      if (i % 2 === 0) {
        ghostCtx.beginPath();
        ghostCtx.arc(v, [cy, elbowY, wristY][i / 2], 4, 0, Math.PI * 2);
        ghostCtx.fill();
      }
    });

    // Labels
    ghostCtx.font = "8px sans-serif";
    ghostCtx.fillStyle = "rgba(0, 200, 255, 0.4)";
    ghostCtx.fillText("1.Flex", cx - 25, cy + 25);
    ghostCtx.fillText("2.Reach", elbowX + 10, elbowY + 5);
    ghostCtx.fillText("3.Hold", wristX + 5, wristY - 5);

    ghostT += 1;
    requestAnimationFrame(animateGhostGuide);
  }

  // === Skeleton Overlay ===
  function drawOverlay(lm) {
    overlayCanvas.width = video.videoWidth || 640;
    overlayCanvas.height = video.videoHeight || 480;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;

    const rs = lm[12], re = lm[14], rw = lm[16], ls = lm[11];
    if (!rs || !re || !rw) return;

    // Dynamic bone color
    let boneColor;
    if (state.currentAngle < 90) boneColor = "#ffaa00";
    else if (state.currentAngle < 120) boneColor = "#ffd000";
    else boneColor = "#00ff88";

    // Trunk line
    if (ls) {
      const cheating = cheatAlert.classList.contains("visible");
      overlayCtx.beginPath();
      overlayCtx.strokeStyle = cheating ? "#ff2200" : "rgba(255,170,0,0.4)";
      overlayCtx.lineWidth = cheating ? 5 : 3;
      if (cheating) overlayCtx.setLineDash([6, 4]);
      overlayCtx.moveTo(ls.x * w, ls.y * h);
      overlayCtx.lineTo(rs.x * w, rs.y * h);
      overlayCtx.stroke();
      overlayCtx.setLineDash([]);
    }

    // Arm bones
    overlayCtx.strokeStyle = boneColor;
    overlayCtx.lineWidth = 4;
    overlayCtx.shadowColor = boneColor;
    overlayCtx.shadowBlur = 6;

    overlayCtx.beginPath();
    overlayCtx.moveTo(rs.x * w, rs.y * h);
    overlayCtx.lineTo(re.x * w, re.y * h);
    overlayCtx.stroke();

    overlayCtx.beginPath();
    overlayCtx.moveTo(re.x * w, re.y * h);
    overlayCtx.lineTo(rw.x * w, rw.y * h);
    overlayCtx.stroke();
    overlayCtx.shadowBlur = 0;

    // Joints
    [rs, re, rw].forEach((pt) => {
      overlayCtx.beginPath();
      overlayCtx.arc(pt.x * w, pt.y * h, 7, 0, Math.PI * 2);
      overlayCtx.fillStyle = boneColor;
      overlayCtx.fill();
      overlayCtx.strokeStyle = "rgba(255,255,255,0.6)";
      overlayCtx.lineWidth = 2;
      overlayCtx.stroke();
    });

    // Goniometric arc
    const ex = re.x * w, ey = re.y * h;
    const a1 = Math.atan2((rs.y - re.y) * h, (rs.x - re.x) * w);
    const a2 = Math.atan2((rw.y - re.y) * h, (rw.x - re.x) * w);
    overlayCtx.beginPath();
    overlayCtx.arc(ex, ey, 40, Math.min(a1, a2), Math.max(a1, a2));
    overlayCtx.strokeStyle = "rgba(255,154,60,0.6)";
    overlayCtx.lineWidth = 2;
    overlayCtx.stroke();
  }

  // === Telemetry Logging ===
  async function logSession(duration) {
    try {
      await fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: "THERAPY",
          condition: localStorage.getItem("selectedCondition") || "Hemiparesis",
          duration_seconds: duration,
          peak_rom: state.peakRom,
          smoothness_score: state.positionBuffer.length > 10
            ? Kinematics.calculateSmoothness(1, duration / 1000, 1) : 75,
          cheats_blocked: state.cheatsBlocked,
          score: state.totalReps,
          metrics_json: JSON.stringify({
            peakRom: state.peakRom,
            cheatsBlocked: state.cheatsBlocked,
            totalReps: state.totalReps,
            sets: CONFIG.SETS,
          }),
        }),
      });
    } catch (err) {
      console.error("Telemetry error:", err);
    }
  }

  // === Start Ghost Guide ===
  animateGhostGuide();
});
