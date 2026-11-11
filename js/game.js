// Mini game "Chạy & Gõ": nhân vật chạy, gõ đúng từ tiếng Anh để nhảy qua chướng ngại vật.
// Chỉ dùng từ đã học. 3 mạng; hết mạng thì chơi tiếp từ đúng từ vừa trượt (điểm tính lại từ 0).
import { S, allWords, recordAnswer } from './store.js';
import { esc, norm, shuffle, speak } from './util.js';
import { isNew, isDue } from './srs.js';
import { icon, on, back, rerender, navBar } from './ui.js';
import { confetti } from './fx.js';

export const GAME_MIN = 5; // cần ít nhất ngần này từ đã học
const LIVES = 3;
const KEY = 'tu-vung-game';

// ---- Nhân vật & chướng ngại vật (tự vẽ) ----
export const HEROES = {
  mochi: {
    name: 'Mochi',
    svg: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 12c-1-6 3-9 8-9-1 5-3 8-8 9z" fill="#3E9B6B"/>
      <rect class="leg a" x="21" y="52" width="8" height="10" rx="4" fill="#C9603A"/>
      <rect class="leg b" x="35" y="52" width="8" height="10" rx="4" fill="#C9603A"/>
      <ellipse cx="32" cy="34" rx="23" ry="22" fill="#F08A5D"/>
      <ellipse cx="34" cy="42" rx="13" ry="10" fill="#FBD3B8"/>
      <circle cx="27" cy="29" r="6" fill="#fff"/><circle cx="43" cy="29" r="6" fill="#fff"/>
      <circle cx="29" cy="30" r="2.8" fill="#1B1B1F"/><circle cx="45" cy="30" r="2.8" fill="#1B1B1F"/>
      <path d="M31 40q5 4 10 0" fill="none" stroke="#7A2E14" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`,
  },
  bolt: {
    name: 'Bolt',
    svg: `<svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 12V5" stroke="#5A6B8C" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="4" r="3.5" fill="#F2B632"/>
      <rect class="leg a" x="20" y="52" width="9" height="10" rx="3" fill="#2B3F6B"/>
      <rect class="leg b" x="35" y="52" width="9" height="10" rx="3" fill="#2B3F6B"/>
      <rect x="10" y="12" width="44" height="42" rx="12" fill="#4A6FB5"/>
      <rect x="16" y="20" width="34" height="17" rx="8.5" fill="#12203D"/>
      <circle cx="28" cy="28.5" r="4" fill="#7FE3C4"/><circle cx="42" cy="28.5" r="4" fill="#7FE3C4"/>
      <rect x="24" y="43" width="18" height="4" rx="2" fill="#C9D6F2"/>
    </svg>`,
  },
};
const OBSTACLES = [
  `<svg viewBox="0 0 48 40" aria-hidden="true"><rect x="2" y="27" width="44" height="12" rx="2.5" fill="#2A78D6"/><rect x="6" y="15" width="38" height="12" rx="2.5" fill="#EB6834"/><rect x="4" y="3" width="36" height="12" rx="2.5" fill="#1BAF7A"/><path d="M8 33h14M12 21h12M9 9h10" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".75"/></svg>`,
  `<svg viewBox="0 0 48 40" aria-hidden="true"><path d="M3 39 10 18l9-9 12-3 11 12 4 21z" fill="#8C8A80"/><path d="M19 9l4 12-7 8M31 6l-2 14 8 9" fill="none" stroke="#6C6A62" stroke-width="2" stroke-linecap="round"/></svg>`,
  `<svg viewBox="0 0 48 40" aria-hidden="true"><rect x="5" y="14" width="38" height="25" rx="3" fill="#B7793A"/><path d="M5 22h38M24 14v25" stroke="#8A5622" stroke-width="2.5"/><rect x="18" y="5" width="12" height="9" rx="2" fill="none" stroke="#8A5622" stroke-width="2.5"/></svg>`,
];

// ---- Lưu kỷ lục & nhân vật đã chọn (theo máy) ----
export function loadPrefs() {
  try { return { best: 0, hero: 'mochi', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { best: 0, hero: 'mochi' }; }
}
export function savePrefs(patch) {
  const p = { ...loadPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  return p;
}

// ---- Trạng thái ----
let G = null;
const voice = () => ({ lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });
export const gamePool = () => allWords().filter((w) => !isNew(w) && (w.meaning || '').trim() && w.word.length <= 28);

function buildQueue(avoidId) {
  const ids = shuffle(gamePool()).sort((a, b) => (isDue(b) ? 1 : 0) - (isDue(a) ? 1 : 0)).map((w) => w.id);
  if (ids.length > 1 && ids[0] === avoidId) ids.push(ids.shift());
  return ids;
}
function cur() {
  // Bỏ qua từ đã bị xoá/sửa trong lúc chơi; hết hàng thì xáo lại.
  for (let guard = 0; guard < 500; guard++) {
    if (G.i >= G.queue.length) { G.queue = buildQueue(G.queue[G.queue.length - 1]); G.i = 0; if (!G.queue.length) return null; }
    const w = S.words.get(G.queue[G.i]);
    if (w && !isNew(w) && (w.meaning || '').trim()) return w;
    G.i++;
  }
  return null;
}
// Thời gian cho mỗi từ: từ dài được nhiều thời gian hơn; càng nhiều điểm càng nhanh.
const timeFor = (w) => (3.5 + 0.6 * w.word.length) * Math.max(0.55, 1 - 0.025 * G.score) * 1000;

const $ = (sel) => document.querySelector(sel);
const prefixLen = (word, value) => {
  const a = word.toLowerCase(), b = value.toLowerCase();
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};
function slots(word, typed, reveal) {
  return [...word].map((ch, i) => (ch === ' ' ? '<i class="sp"></i>'
    : `<i class="${i < typed ? 'ok' : reveal ? 'show' : ''}">${i < typed || reveal ? esc(ch) : ''}</i>`)).join('');
}
function hearts() {
  return Array.from({ length: LIVES }, (_, i) => `<span class="${i < G.lives ? 'on' : ''}">♥</span>`).join('');
}

// ---- Vòng lặp ----
function placeObstacle(p) {
  const stage = $('.g-stage'), obs = $('.g-obs'), hero = $('.g-hero');
  if (!stage || !obs || !hero) return;
  const start = stage.clientWidth + 8;
  const end = hero.offsetLeft + hero.offsetWidth - 16;
  obs.style.transform = `translateX(${start - (start - end) * Math.min(1, p)}px)`;
}
function frame(ts) {
  if (!G || G.phase !== 'play' || location.hash !== '#/game') { if (G) G.raf = 0; return; }
  const dt = Math.min(100, ts - (G.last || ts));
  G.last = ts;
  if (G.mode === 'run' && !document.hidden) {
    G.t += dt;
    placeObstacle(G.t / G.T);
    if (G.t >= G.T) miss();
  }
  G.raf = requestAnimationFrame(frame);
}
function startLoop() {
  if (G.raf) cancelAnimationFrame(G.raf);
  G.last = 0;
  G.raf = requestAnimationFrame(frame);
}

function showWord() {
  const w = cur();
  if (!w) { G.phase = 'intro'; rerender(true); return; }
  G.mode = 'run'; G.t = 0; G.T = timeFor(w);
  const obs = $('.g-obs');
  if (obs) { obs.style.transition = 'none'; obs.innerHTML = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)]; obs.style.opacity = '1'; }
  placeObstacle(0);
  $('.g-hero')?.classList.remove('jump', 'hurt');
  $('.g-stage')?.classList.remove('stop');
  $('.g-meaning').textContent = w.meaning;
  $('.g-pos').textContent = w.pos || '';
  $('.g-pos').hidden = !w.pos;
  $('.g-slots').innerHTML = slots(w.word, 0, false);
  $('.g-note').innerHTML = 'Gõ từ tiếng Anh để nhảy qua';
  $('.g-note').className = 'g-note';
  const input = $('.g-input');
  if (input) { input.value = ''; input.classList.remove('bad'); }
}
function refreshHud() {
  const h = $('.g-hearts'); if (h) h.innerHTML = hearts();
  const s = $('.g-score b'); if (s) s.textContent = G.score;
}

function correct() {
  const w = cur();
  G.mode = 'jumping';
  G.score++;
  recordAnswer(w.id, 'good', 'practice').catch(console.error);
  refreshHud();
  $('.g-slots').innerHTML = slots(w.word, w.word.length, false);
  $('.g-hero')?.classList.add('jump');
  const obs = $('.g-obs');
  if (obs) { obs.style.transition = 'transform .5s linear'; obs.style.transform = 'translateX(-90px)'; }
  G.i++;
  setTimeout(() => { if (G?.phase === 'play' && G.mode === 'jumping') showWord(); }, 560);
}

function miss() {
  const w = cur();
  G.mode = 'retype';
  G.lives--;
  if (!G.missed.includes(w.id)) G.missed.push(w.id);
  recordAnswer(w.id, 'again', 'practice').catch(console.error);
  refreshHud();
  $('.g-hero')?.classList.add('hurt');
  $('.g-stage')?.classList.add('stop');
  speak(w.word, voice());
  if (G.lives <= 0) {
    // Hết mạng: giữ nguyên vị trí để "Chơi tiếp" bắt đầu lại từ chính từ này.
    G.mode = 'dead';
    $('.g-slots').innerHTML = slots(w.word, 0, true);
    setTimeout(() => {
      if (!G || G.mode !== 'dead') return;
      const prefs = loadPrefs();
      G.newBest = G.score > prefs.best;
      if (G.newBest) savePrefs({ best: G.score });
      G.phase = 'over';
      rerender(true);
      if (G.newBest) confetti({ count: 120 });
    }, 1100);
    return;
  }
  const input = $('.g-input');
  if (input) { input.value = ''; input.classList.remove('bad'); }
  $('.g-slots').innerHTML = slots(w.word, 0, true);
  $('.g-note').innerHTML = `Trượt! ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span> · ` : ''}gõ lại để chạy tiếp`;
  $('.g-note').className = 'g-note bad';
}

function resumeAfterMiss() {
  // Từ vừa trượt sẽ quay lại sau vài từ nữa.
  const id = G.queue[G.i];
  G.i++;
  G.queue.splice(Math.min(G.queue.length, G.i + 3), 0, id);
  showWord();
}

on('game-type', (el) => {
  if (!G || G.phase !== 'play') return;
  if (G.mode !== 'run' && G.mode !== 'retype') { el.value = ''; return; }
  const w = cur();
  const target = norm(w.word), v = norm(el.value);
  el.classList.toggle('bad', !!v && !target.startsWith(v));
  $('.g-slots').innerHTML = slots(w.word, prefixLen(w.word, el.value), G.mode === 'retype');
  if (v !== target) return;
  el.value = '';
  if (G.mode === 'run') correct(); else resumeAfterMiss();
});

function begin({ keepPlace = false } = {}) {
  const prefs = loadPrefs();
  if (!keepPlace || !G) G = { queue: buildQueue(), i: 0 };
  Object.assign(G, { phase: 'play', lives: LIVES, score: 0, missed: [], best: prefs.best, hero: prefs.hero, newBest: false, mode: 'run', t: 0, T: 1 });
  rerender(true);
  // Focus ngay trong lượt chạm để iOS bật bàn phím.
  $('.g-input')?.focus({ preventScroll: true });
  showWord();
  startLoop();
}
on('game-start', () => begin());
on('game-continue', () => begin({ keepPlace: true }));
on('game-hero', (el) => { savePrefs({ hero: el.dataset.hero }); rerender(); });
on('game-focus', () => $('.g-input')?.focus({ preventScroll: true }));
on('game-quit', () => { if (G?.raf) cancelAnimationFrame(G.raf); G = null; back('#/learn'); });

// ---- Màn hình ----
export function gameView() {
  const prefs = loadPrefs();
  if (G && G.phase === 'play') {
    return `<div class="page game">
      <div class="g-top"><button class="iconbtn" data-act="game-quit" aria-label="Thoát">${icon('x')}</button>
        <div class="g-hearts" aria-label="Số mạng">${hearts()}</div>
        <div class="g-score"><b>${G.score}</b><small>Kỷ lục ${G.best}</small></div></div>
      <div class="g-stage" data-act="game-focus">
        <i class="g-cloud c1"></i><i class="g-cloud c2"></i>
        <div class="g-hero">${HEROES[G.hero]?.svg || HEROES.mochi.svg}</div>
        <div class="g-obs"></div>
        <div class="g-ground"></div>
      </div>
      <div class="g-prompt" data-act="game-focus">
        <p class="g-meaning"></p><span class="tag g-pos" hidden></span>
        <div class="g-slots"></div>
        <p class="g-note"></p>
      </div>
      <input class="answer-input g-input" data-in="game-type" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Gõ từ tiếng Anh">
    </div>`;
  }
  if (G && G.phase === 'over') {
    const missed = G.missed.map((id) => S.words.get(id)).filter(Boolean);
    return `<div class="page game">${navBar('Chạy & Gõ', { fallback: '#/learn' })}
      <div class="card g-over">
        <div class="g-hero big hurt-still">${HEROES[G.hero]?.svg || HEROES.mochi.svg}</div>
        <p class="eyebrow">${G.newBest ? 'Kỷ lục mới!' : 'Hết mạng'}</p>
        <b class="g-final">${G.score}</b>
        <p class="muted small">từ gõ đúng · kỷ lục ${Math.max(G.best, G.score)}</p>
      </div>
      ${missed.length ? `<h2>Từ cần ôn lại</h2><div class="card g-missed">${missed.map((w) => `<p><b class="en">${esc(w.word)}</b> ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}<br><span class="muted small">${esc(w.meaning)}</span></p>`).join('')}</div>` : ''}
      <button class="btn" style="margin-top:18px" data-act="game-continue">Chơi tiếp từ từ vừa trượt</button>
      <button class="btn ghost" style="margin-top:10px" data-act="game-quit">Thoát</button>
    </div>`;
  }
  const n = gamePool().length;
  const ready = n >= GAME_MIN;
  return `<div class="page game">${navBar('Chạy & Gõ', { fallback: '#/learn' })}
    <div class="card">
      <p class="muted small" style="margin-bottom:10px">Chọn nhân vật</p>
      <div class="g-pick">${Object.entries(HEROES).map(([id, h]) => `<button class="${prefs.hero === id ? 'on' : ''}" data-act="game-hero" data-hero="${id}" aria-pressed="${prefs.hero === id}"><span class="g-hero big">${h.svg}</span><b>${h.name}</b></button>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:12px">
      <b>Cách chơi</b>
      <ul class="g-rules">
        <li>Màn hình hiện nghĩa tiếng Việt — gõ đúng từ tiếng Anh để nhảy qua chướng ngại vật.</li>
        <li>Gõ nhầm cứ xoá và sửa. Chỉ mất mạng khi chướng ngại vật chạm tới mà chưa gõ xong.</li>
        <li>Có ${LIVES} mạng. Hết mạng, bạn chơi tiếp từ đúng từ vừa trượt.</li>
        <li>Chỉ dùng từ đã học. Từ gõ trượt được đưa vào danh sách cần ôn.</li>
      </ul>
      <p class="muted small" style="margin-top:10px">Kỷ lục: <b>${prefs.best}</b> từ · ${n} từ đã học</p>
    </div>
    ${ready ? `<button class="btn" style="margin-top:18px" data-act="game-start">Bắt đầu</button>`
      : `<p class="small center" style="margin-top:18px;color:var(--amber);font-weight:600">Cần học ít nhất ${GAME_MIN} từ để chơi (hiện có ${n}).</p>
         <button class="btn soft" style="margin-top:10px" data-act="go" data-to="#/learn">Sang tab Học</button>`}
  </div>`;
}
