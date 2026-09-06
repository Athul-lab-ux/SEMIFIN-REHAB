/**
 * RehabOpt AR — Auth Portal Animated Background
 * Three undulating golden-orange neural ribbons over a deep clinical base.
 * Kept cheap on purpose: no per-frame allocations, no DOM work.
 */
(function () {
  const canvas = document.getElementById("auth-bg");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, t = 0;
  let rafId = null;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const baseColor = "#0C0A14";
  const ribbons = [
    { phase: 0, amp1: 60, amp2: 40, speed1: 0.018, speed2: 0.010, spacing: 16, width: 3.2, alpha: 0.22, r: 255, g: 95, b: 0 },
    { phase: 1.7, amp1: 90, amp2: 55, speed1: 0.014, speed2: 0.012, spacing: 18, width: 2.6, alpha: 0.16, r: 255, g: 135, b: 0 },
    { phase: 3.4, amp1: 45, amp2: 70, speed1: 0.020, speed2: 0.007, spacing: 14, width: 2.0, alpha: 0.12, r: 255, g: 170, b: 60 },
  ];

  const draw = () => {
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, w, h);

    for (let ri = 0; ri < ribbons.length; ri++) {
      const r = ribbons[ri];
      const alpha = r.alpha * ((0.85 + 0.15 * Math.sin(t * 0.010 + r.phase)));
      ctx.beginPath();
      ctx.lineWidth = r.width;
      ctx.strokeStyle = `rgba(${r.r}, ${r.g}, ${r.b}, ${alpha})`;
      ctx.shadowColor = `rgba(${r.r}, ${r.g}, ${r.b}, 0.9)`;
      ctx.shadowBlur = 16 + 4 * Math.sin(t * 0.020 + r.phase);

      const step = r.spacing;
      let first = true;
      for (let x = 0; x <= w; x += step) {
        const y =
          h * 0.5 +
          Math.sin(x * 0.0035 + t * r.speed1 + r.phase) * r.amp1 +
          Math.cos(x * 0.008 - t * r.speed2) * r.amp2;
        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // a few drifting specks for depth
    ctx.shadowBlur = 0;
    for (let i = 0; i < 26; i++) {
      const x = ((i * 137.5 + t * 0.15) % (w + 40)) - 20;
      const y = ((i * 97.3 + t * 0.08) % (h + 40)) - 20;
      const size = 1.2 + 0.8 * Math.sin(i + t * 0.02);
      ctx.fillStyle = `rgba(255, 170, 80, ${0.05 + 0.04 * Math.sin(i + t * 0.03)})`;
      ctx.fillRect(x, y, size, size);
    }

    t += 1;
    rafId = requestAnimationFrame(draw);
  };

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      // keep ribbons inside after resize
    }, 80);
  });

  resize();
  draw();

  // pause when the tab is hidden to save CPU
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!rafId) {
      draw();
    }
  });
})();
