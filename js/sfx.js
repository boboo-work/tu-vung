// Âm thanh trong game: tổng hợp bằng Web Audio (không cần file âm thanh, chạy offline).
//  sfx('ok')   : hai nốt "ting" đi lên khi trả lời đúng (chuỗi đúng càng dài, nốt càng cao một chút).
//  sfx('bad')  : tiếng "bụp" trầm đi xuống khi sai hoặc hết giờ.
//  sfx('win')  : hợp âm rải ngắn khi xong một lượt.
// Tắt/bật ở Cài đặt → "Âm thanh trong game". Trên iPhone, gạt nút im lặng (bên hông máy) thì sẽ không nghe.
import { S } from './store.js';

let ctx = null;
function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// iOS chỉ cho phát âm thanh sau một lần chạm: mở khoá ở lần chạm đầu tiên.
addEventListener('pointerdown', function unlock() {
  const c = ac();
  if (c) { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); }
  removeEventListener('pointerdown', unlock, true);
}, true);

function tone(c, { f, f2 = f, t = 0, dur = 0.14, type = 'sine', vol = 0.18 }) {
  const o = c.createOscillator(), g = c.createGain();
  const at = c.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export const sfxOn = () => S.settings?.sfx !== 'off';

export function sfx(kind, combo = 1) {
  if (!sfxOn()) return;
  const c = ac();
  if (!c) return;
  try {
    if (kind === 'ok') {
      const up = Math.pow(2, Math.min(Math.max(combo - 1, 0), 5) / 12); // mỗi lần đúng liên tiếp cao thêm nửa cung
      tone(c, { f: 880 * up, dur: 0.12, vol: 0.16 });
      tone(c, { f: 1318.5 * up, t: 0.09, dur: 0.22, vol: 0.16 });
    } else if (kind === 'bad') {
      tone(c, { f: 220, f2: 120, dur: 0.28, type: 'triangle', vol: 0.28 });
      tone(c, { f: 160, f2: 90, t: 0.04, dur: 0.26, type: 'square', vol: 0.05 });
    } else if (kind === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, { f, t: i * 0.09, dur: 0.3, vol: 0.13 }));
    }
  } catch { /* trình duyệt không hỗ trợ: bỏ qua */ }
}
