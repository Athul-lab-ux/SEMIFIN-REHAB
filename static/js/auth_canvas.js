/**
 * Auth Portal — Neural Re-Wiring Background (Optimized)
 * 3 undulating golden-orange ribbons (#ff6a00) — 30fps capped
 */
const canvas = document.getElementById("bg-canvas");
const ctx = canvas.getContext("2d");
let w, h, t = 0;
let lastFrame = 0;
const FRAME_INTERVAL = 33; // ~30fps

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

function animate(timestamp) {
  requestAnimationFrame(animate);
  if (timestamp - lastFrame < FRAME_INTERVAL) return;
  lastFrame = timestamp;

  ctx.fillStyle = "#0c0804";
  ctx.fillRect(0, 0, w, h);

  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.lineWidth = i * 2.2;
    ctx.strokeStyle = `rgba(255, ${90 + i * 35}, 0, ${0.12 * i})`;
    ctx.shadowColor = "#ff6a00";
    ctx.shadowBlur = 14;

    for (let x = 0; x < w; x += 20) {
      const y =
        h * 0.5 +
        Math.sin(x * 0.003 + t * 0.015 + i) * 110 +
        Math.cos(x * 0.007 - t * 0.008) * 55;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  t += 1;
}
requestAnimationFrame(animate);
