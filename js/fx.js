// Hiệu ứng: pháo giấy, số đếm tăng dần. Tất cả tự tắt khi máy bật "Giảm chuyển động".
export const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#f2b632', '#8e6bd8'];

/** Bắn pháo giấy toàn màn hình trong ~1,8 giây rồi tự dọn. */
export function confetti({ count = 90 } = {}) {
  if (!motionOK()) return;
  document.querySelector('canvas.confetti')?.remove();
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const v = 7 + Math.random() * 9;
    return {
      x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.42,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 4,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[i % COLORS.length],
    };
  });
  const DUR = 1800;
  const t0 = performance.now();
  let last = t0;
  const frame = (now) => {
    const t = now - t0;
    const k = Math.min(3, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = t > DUR - 400 ? Math.max(0, (DUR - t) / 400) : 1;
    for (const p of parts) {
      p.vy += 0.32 * k; p.vx *= 0.99;
      p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < DUR && cv.isConnected) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

/** Cho các phần tử [data-count="N"] chạy số từ 0 lên N. */
export function countUp(root = document) {
  if (!motionOK()) return;
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = Number(el.dataset.count);
    if (!Number.isFinite(to) || to <= 0) continue;
    const suffix = el.dataset.suffix || '';
    const dur = 650;
    const t0 = performance.now();
    const step = (now) => {
      if (!el.isConnected) return;
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0' + suffix;
    requestAnimationFrame(step);
    // Phòng khi trình duyệt tạm dừng khung hình (tab nền): luôn chốt về số thật.
    setTimeout(() => { if (el.isConnected) el.textContent = to + suffix; }, dur + 150);
  }
}
