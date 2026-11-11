// Mini game "Bắn Từ": khung chữ của từ rơi từ trên trời xuống, nghĩa tiếng Việt đứng yên phía trên.
// Gõ đúng → Mochi bắn trúng, hiện "Correct!". Gõ sai một phím hoặc để rơi chạm đất → Bolt đập búa vỡ,
// hiện đáp án và từ đó quay lại sau vài lượt. Không có mạng; mỗi ván tối đa 15 từ, xong khi bắn trúng hết.
import { S, recordAnswer } from './store.js';
import { esc, norm, shuffle, speak } from './util.js';
import { isDue } from './srs.js';
import { icon, on, back, rerender, navBar } from './ui.js';
import { confetti } from './fx.js';
import { HEROES, GAME_MIN, gamePool, loadPrefs, savePrefs } from './game.js';

const ROUND = 15;
const HAMMER = `<svg viewBox="0 0 40 56" aria-hidden="true"><rect x="17" y="14" width="6" height="40" rx="3" fill="#B7793A"/><rect x="3" y="2" width="34" height="18" rx="5" fill="#6C7280"/><rect x="3" y="2" width="9" height="18" rx="4" fill="#8E95A3"/></svg>`;

let D = null;
const voice = () => ({ lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });
const $ = (sel) => document.querySelector(sel);
const cur = () => S.words.get(D.queue[0]);
// Thời gian rơi: khoảng 10–15 giây, từ dài được lâu hơn.
const timeFor = (w) => (8 + 0.6 * w.word.length) * 1000;
const fmtTime = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function slots(word, typed, reveal) {
  return [...word].map((ch, i) => (ch === ' ' ? '<i class="sp"></i>' : `<i>${i < typed || reveal ? esc(ch) : ''}</i>`)).join('');
}
const prefixLen = (word, value) => {
  const a = word.toLowerCase(), b = value.toLowerCase();
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

// ---- Vòng lặp ----
function fallRange() {
  const stage = $('.d-stage'), tile = $('.d-tile');
  const top = $('.d-meaning').offsetHeight + 14;
  return { top, bottom: Math.max(top, stage.clientHeight - 30 - tile.offsetHeight) };
}
function placeTile(p) {
  const tile = $('.d-tile');
  if (!tile) return;
  const { top, bottom } = fallRange();
  tile.style.transform = `translate(-50%, ${top + (bottom - top) * Math.min(1, p)}px)`;
}
function frame(ts) {
  if (!D || D.phase !== 'play' || location.hash !== '#/drop') { if (D) D.raf = 0; return; }
  const dt = Math.min(100, ts - (D.last || ts));
  D.last = ts;
  if (!document.hidden) {
    D.elapsed += dt;
    if (D.mode === 'fall') {
      D.t += dt;
      placeTile(D.t / D.T);
      const bar = $('.d-time i');
      if (bar) bar.style.transform = `scaleX(${Math.max(0, 1 - D.t / D.T)})`;
      if (D.t >= D.T) wrong('time');
    }
  }
  D.raf = requestAnimationFrame(frame);
}

function showWord() {
  // Bỏ qua từ bị xoá trong lúc chơi.
  while (D.queue.length && !cur()) D.queue.shift();
  if (!D.queue.length) return finish();
  const w = cur();
  D.mode = 'fall'; D.t = 0; D.T = timeFor(w); D.step++;
  $('.d-meaning').innerHTML = `${esc(w.meaning)}${w.pos ? ` <span class="tag">${esc(w.pos)}</span>` : ''}`;
  const tile = $('.d-tile');
  tile.className = 'd-tile';
  tile.style.transition = 'none';
  tile.innerHTML = `<div class="g-slots">${slots(w.word, 0, false)}</div>`;
  $('.d-badge').className = 'd-badge';
  $('.d-answer').hidden = true;
  $('.d-count').textContent = `${D.total - D.queue.length}/${D.total}`;
  $('.d-bolt').classList.remove('swing');
  placeTile(0);
  const input = $('.d-input');
  if (input) input.value = '';
}

function after(ms, fn) {
  const step = D.step;
  setTimeout(() => { if (D && D.phase === 'play' && D.step === step) fn(); }, ms);
}

function correct() {
  const w = cur();
  D.mode = 'hit';
  recordAnswer(w.id, 'good', 'practice').catch(console.error);
  const tile = $('.d-tile'), stage = $('.d-stage'), gun = $('.d-mochi');
  tile.querySelector('.g-slots').innerHTML = slots(w.word, w.word.length, true);
  // Viên đạn bay từ Mochi tới khung chữ.
  const s = stage.getBoundingClientRect(), a = gun.getBoundingClientRect(), b = tile.getBoundingClientRect();
  const shot = document.createElement('i');
  shot.className = 'd-shot';
  stage.appendChild(shot);
  const from = [a.left - s.left + a.width * 0.7, a.top - s.top + 6];
  const to = [b.left - s.left + b.width / 2, b.top - s.top + b.height / 2];
  const anim = shot.animate([{ transform: `translate(${from[0]}px, ${from[1]}px)` }, { transform: `translate(${to[0]}px, ${to[1]}px)` }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
  gun.classList.remove('fire'); void gun.offsetWidth; gun.classList.add('fire');
  const land = () => {
    shot.remove();
    if (!D || D.mode !== 'hit') return;
    tile.classList.add('hit');
    // Nhãn "Correct!" nằm ngay trên khung chữ (hoặc ngay dưới nếu khung còn sát mép trên).
    const r = tile.getBoundingClientRect(), badge = $('.d-badge');
    const above = r.top - s.top - 44;
    badge.style.top = `${above > $('.d-meaning').offsetHeight ? above : r.bottom - s.top + 8}px`;
    badge.className = 'd-badge show';
  };
  anim.finished.then(land, land);
  D.queue.shift();
  after(950, showWord);
}

function wrong(reason) {
  const w = cur();
  D.mode = 'smash';
  if (!D.missed.includes(w.id)) D.missed.push(w.id);
  recordAnswer(w.id, 'again', 'practice').catch(console.error);
  const tile = $('.d-tile');
  // Gõ sai giữa chừng: khung chữ rơi thẳng xuống đất rồi mới bị đập.
  const drop = reason === 'time' ? 0 : 220;
  if (drop) { tile.style.transition = `transform ${drop}ms ease-in`; placeTile(1); }
  const input = $('.d-input');
  if (input) input.value = '';
  after(drop, () => {
    $('.d-bolt').classList.add('swing');
    after(170, () => {
      tile.classList.add('smash');
      tile.insertAdjacentHTML('beforeend', Array.from({ length: 7 }, (_, i) => `<b class="shard" style="--x:${(i - 3) * 22}px;--y:${-18 - (i % 3) * 16}px;--r:${(i - 3) * 50}deg"></b>`).join(''));
      const ans = $('.d-answer');
      ans.innerHTML = `<small>${reason === 'time' ? 'Hết giờ' : 'Gõ sai'} · đáp án</small><b class="en">${esc(w.word)}</b>${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}`;
      ans.hidden = false;
      speak(w.word, voice());
    });
  });
  // Từ sai quay lại sau vài lượt.
  const id = D.queue.shift();
  D.queue.splice(Math.min(D.queue.length, 3), 0, id);
  after(drop + 2600, showWord);
}

function finish() {
  const first = D.total - D.missed.length;
  const prefs = loadPrefs();
  const old = prefs.drop;
  D.newBest = D.total >= ROUND && (!old || first > old.first || (first === old.first && D.elapsed < old.ms));
  if (D.newBest) savePrefs({ drop: { first, ms: Math.round(D.elapsed) } });
  D.phase = 'over';
  if (D.raf) cancelAnimationFrame(D.raf);
  rerender(true);
  confetti({ count: D.newBest || !D.missed.length ? 150 : 70 });
}

on('drop-type', (el, e) => {
  if (!D || D.phase !== 'play') return;
  if (D.mode !== 'fall') { el.value = ''; return; }
  if (e?.isComposing) return;
  const w = cur();
  const target = norm(w.word), v = norm(el.value);
  if (v && !target.startsWith(v)) return wrong('typo'); // sai một phím là sai luôn
  $('.d-tile .g-slots').innerHTML = slots(w.word, prefixLen(w.word, el.value), false);
  if (v === target) { el.value = ''; correct(); }
});

on('drop-start', () => {
  const pool = shuffle(gamePool()).sort((a, b) => (isDue(b) ? 1 : 0) - (isDue(a) ? 1 : 0)).slice(0, ROUND);
  D = { phase: 'play', queue: shuffle(pool.map((w) => w.id)), total: pool.length, missed: [], elapsed: 0, step: 0, mode: 'fall', t: 0, T: 1, last: 0 };
  rerender(true);
  $('.d-input')?.focus({ preventScroll: true }); // focus ngay trong lượt chạm để iOS bật bàn phím
  showWord();
  D.raf = requestAnimationFrame(frame);
});
on('drop-focus', () => $('.d-input')?.focus({ preventScroll: true }));
on('drop-quit', () => { if (D?.raf) cancelAnimationFrame(D.raf); D = null; back('#/learn'); });

// ---- Màn hình ----
export function dropView() {
  if (D && D.phase === 'play') {
    return `<div class="page game">
      <div class="g-top"><button class="iconbtn" data-act="drop-quit" aria-label="Thoát">${icon('x')}</button>
        <div class="d-time"><i></i></div>
        <div class="g-score"><b class="d-count">0/${D.total}</b><small>đã bắn trúng</small></div></div>
      <div class="d-stage" data-act="drop-focus">
        <p class="d-meaning"></p>
        <div class="d-tile"></div>
        <div class="d-badge">Correct!</div>
        <div class="d-answer" hidden></div>
        <div class="g-hero d-mochi">${HEROES.mochi.svg}</div>
        <div class="g-hero d-bolt">${HEROES.bolt.svg}<span class="d-hammer">${HAMMER}</span></div>
        <div class="g-ground"></div>
      </div>
      <input class="answer-input g-input d-input" data-in="drop-type" type="text" inputmode="text" lang="en" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-label="Gõ từ tiếng Anh">
      <p class="g-note" style="text-align:center">Gõ sai một phím là từ bị đập vỡ</p>
    </div>`;
  }
  if (D && D.phase === 'over') {
    const missed = D.missed.map((id) => S.words.get(id)).filter(Boolean);
    return `<div class="page game">${navBar('Bắn Từ', { fallback: '#/learn' })}
      <div class="card g-over">
        <p class="eyebrow">${D.newBest ? 'Kỷ lục mới!' : 'Hoàn thành'}</p>
        <b class="g-final">${D.total - D.missed.length}/${D.total}</b>
        <p class="muted small">từ đúng ngay lần đầu · ${fmtTime(D.elapsed)}</p>
      </div>
      ${missed.length ? `<h2>Từ cần ôn lại</h2><div class="card g-missed">${missed.map((w) => `<p><b class="en">${esc(w.word)}</b> ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}<br><span class="muted small">${esc(w.meaning)}</span></p>`).join('')}</div>` : ''}
      <button class="btn" style="margin-top:18px" data-act="drop-start">Chơi ván mới</button>
      <button class="btn ghost" style="margin-top:10px" data-act="drop-quit">Thoát</button>
    </div>`;
  }
  const n = gamePool().length;
  const best = loadPrefs().drop;
  return `<div class="page game">${navBar('Bắn Từ', { fallback: '#/learn' })}
    <div class="card">
      <div class="d-duo"><span class="g-hero big">${HEROES.mochi.svg}</span><span class="g-hero big">${HEROES.bolt.svg}</span></div>
      <b>Cách chơi</b>
      <ul class="g-rules">
        <li>Nghĩa tiếng Việt hiện ở trên; khung chữ của từ rơi dần xuống trong khoảng 10–15 giây.</li>
        <li>Gõ đúng từ tiếng Anh: Mochi bắn trúng, hiện “Correct!”.</li>
        <li>Gõ sai một phím (không được sửa) hoặc để rơi chạm đất: Bolt đập vỡ, hiện đáp án, từ đó quay lại sau vài lượt.</li>
        <li>Không có mạng. Mỗi ván ${ROUND} từ đã học, xong khi bắn trúng hết.</li>
      </ul>
      <p class="muted small" style="margin-top:10px">${best ? `Kỷ lục: <b>${best.first}/${ROUND}</b> đúng ngay lần đầu · ${fmtTime(best.ms)}` : 'Chưa có kỷ lục'} · ${n} từ đã học</p>
      <p class="muted small" style="margin-top:6px">Mẹo: chuyển sang bàn phím tiếng Anh, vì bộ gõ tiếng Việt có thể tự đổi chữ và bị tính là sai.</p>
    </div>
    ${n >= GAME_MIN ? `<button class="btn" style="margin-top:18px" data-act="drop-start">Bắt đầu</button>`
      : `<p class="small center" style="margin-top:18px;color:var(--amber);font-weight:600">Cần học ít nhất ${GAME_MIN} từ để chơi (hiện có ${n}).</p>
         <button class="btn soft" style="margin-top:10px" data-act="go" data-to="#/learn">Sang tab Học</button>`}
  </div>`;
}
