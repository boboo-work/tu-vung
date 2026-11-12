// Hai mini game không cần bàn phím:
//  - "Nối Cụm" (#/match): cụm từ (collocation) bị khuyết một chỗ, chọn từ đúng trong 4 lựa chọn.
//      Đúng → Mochi chạy sang ôm Bolt. Sai → Mochi chạy sang gõ búa lên đầu Bolt.
//  - "Nghe & Chạm" (#/pop): nghe phát âm, 4 bong bóng nghĩa bay lên, chạm đúng bong bóng trước khi bay mất.
//      Đúng → bóng nổ, Mochi và Bolt nhảy lên đập tay. Sai → bóng xẹp rơi trúng đầu Mochi, Bolt lắc đầu.
// Cả hai dùng chung quy tắc game: chỉ từ đã học, lấy theo vòng, không ảnh hưởng tiến độ học, từ sai gặp lại sau vài lượt.
import { S, recordGame, saveGame } from './store.js';
import { esc, shuffle, speak, canSpeak } from './util.js';
import { icon, on, back, rerender, navBar } from './ui.js';
import { confetti } from './fx.js';
import { HEROES, GAME_MIN, gamePool, pickWords, roundLine } from './game.js';
import { HAMMER } from './drop.js';
import { findInSentence } from './study.js';

export const ROUND2 = 15;
const voice = () => ({ lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });
const $ = (sel) => document.querySelector(sel);
const fmtTime = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Khung chung cho một ván (không có mạng, xong khi trả lời đúng hết) ----
const R = { match: null, pop: null };
const HASH = { match: '#/match', pop: '#/pop' };
export const bestOf = (kind) => S.game.best[kind] || null;

function startRound(kind, ids) {
  saveGame({ plays: { ...S.game.plays, [kind]: (S.game.plays[kind] || 0) + 1 } }).catch(console.error);
  R[kind] = { kind, phase: 'play', queue: ids, total: ids.length, missed: [], t0: Date.now(), streak: 0, step: 0, busy: false, q: null };
  return R[kind];
}
const alive = (r, step) => R[r.kind] === r && r.phase === 'play' && r.step === step && location.hash === HASH[r.kind];
function settle(r, w, ok) {
  recordGame(w.id, ok).catch(console.error);
  if (ok) { r.streak++; r.queue.shift(); return; }
  r.streak = 0;
  if (!r.missed.includes(w.id)) r.missed.push(w.id);
  // Từ sai quay lại sau vài lượt.
  const id = r.queue.shift();
  r.queue.splice(Math.min(r.queue.length, 3), 0, id);
}
function finishRound(r) {
  const first = r.total - r.missed.length;
  r.ms = Date.now() - r.t0;
  const old = bestOf(r.kind);
  r.newBest = r.total >= ROUND2 && (!old || first > old.first || (first === old.first && r.ms < old.ms));
  if (r.newBest) saveGame({ best: { ...S.game.best, [r.kind]: { first, ms: r.ms } } }).catch(console.error);
  r.phase = 'over';
  rerender(true);
  confetti({ count: r.newBest || !r.missed.length ? 150 : 70 });
}
function quit(kind) { R[kind] = null; speechSynthesis?.cancel?.(); back('#/learn'); }

const topBar = (r, quitAct) => `<div class="g-top"><button class="iconbtn" data-act="${quitAct}" aria-label="Thoát">${icon('x')}</button>
  <div class="d-time"><i style="transform:scaleX(${(r.total - r.queue.length) / r.total})"></i></div>
  <div class="g-score"><b>${r.total - r.queue.length}/${r.total}</b><small>${r.streak > 1 ? `chuỗi ${r.streak}` : 'đã đúng'}</small></div></div>`;
const duo = () => `<div class="g-hero x-mochi">${HEROES.mochi.svg}<span class="x-hammer">${HAMMER}</span></div>
  <div class="g-hero x-bolt">${HEROES.bolt.svg}</div>
  <div class="x-fx" aria-hidden="true"></div><div class="g-ground"></div>`;
// Khoảng cách Mochi phải chạy để tới sát Bolt (đặt vào --run để CSS dùng).
function setRun(stage) {
  const m = stage.querySelector('.x-mochi'), b = stage.querySelector('.x-bolt');
  if (m && b) stage.style.setProperty('--run', `${Math.max(0, b.offsetLeft - m.offsetLeft - m.offsetWidth + 14)}px`);
}
function act(stage, cls, fx = '') {
  if (!stage) return;
  setRun(stage);
  stage.classList.remove('hug', 'bonk', 'five', 'oops', 'sad');
  void stage.offsetWidth;
  stage.classList.add(cls);
  const box = stage.querySelector('.x-fx');
  if (box) box.innerHTML = fx;
}
const HEARTS = '<i class="hrt" style="--x:-14px;--d:0s">♥</i><i class="hrt" style="--x:8px;--d:.12s">♥</i><i class="hrt" style="--x:-2px;--d:.26s">♥</i>';
const STARS = '<i class="str" style="--a:0deg">✦</i><i class="str" style="--a:120deg">✦</i><i class="str" style="--a:240deg">✦</i>';

function overView(r, title, startAct, quitAct) {
  const missed = r.missed.map((id) => S.words.get(id)).filter(Boolean);
  return `<div class="page game">${navBar(title, { fallback: '#/learn' })}
    <div class="card g-over">
      <div class="d-duo" style="margin-bottom:6px"><span class="g-hero big">${HEROES.mochi.svg}</span><span class="g-hero big">${HEROES.bolt.svg}</span></div>
      <p class="eyebrow">${r.newBest ? 'Kỷ lục mới!' : 'Hoàn thành'}</p>
      <b class="g-final">${r.total - r.missed.length}/${r.total}</b>
      <p class="muted small">từ đúng ngay lần đầu · ${fmtTime(r.ms)}</p>
    </div>
    ${missed.length ? `<h2>Từ cần ôn lại</h2><div class="card g-missed">${missed.map((w) => `<p><b class="en">${esc(w.word)}</b> ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''}<br><span class="muted small">${esc(w.meaning)}</span></p>`).join('')}</div>` : ''}
    <button class="btn" style="margin-top:18px" data-act="${startAct}">Chơi ván mới</button>
    <button class="btn ghost" style="margin-top:10px" data-act="${quitAct}">Thoát</button>
  </div>`;
}
function introView(kind, title, rules, n, startAct, extra = '') {
  const best = bestOf(kind);
  return `<div class="page game">${navBar(title, { fallback: '#/learn' })}
    <div class="card">
      <div class="d-duo"><span class="g-hero big">${HEROES.mochi.svg}</span><span class="g-hero big">${HEROES.bolt.svg}</span></div>
      <b>Cách chơi</b>
      <ul class="g-rules">${rules.map((x) => `<li>${x}</li>`).join('')}</ul>
      <p class="muted small" style="margin-top:10px">${best ? `Kỷ lục: <b>${best.first}/${ROUND2}</b> đúng ngay lần đầu · ${fmtTime(best.ms)}` : 'Chưa có kỷ lục'}</p>
      <p class="muted small" style="margin-top:4px">${roundLine()}</p>${extra}
    </div>
    ${n >= GAME_MIN ? `<button class="btn" style="margin-top:18px" data-act="${startAct}">Bắt đầu</button>`
      : `<p class="small center" style="margin-top:18px;color:var(--amber);font-weight:600">Cần ít nhất ${GAME_MIN} từ phù hợp để chơi (hiện có ${n}).</p>
         <button class="btn soft" style="margin-top:10px" data-act="go" data-to="#/learn">Sang tab Học</button>`}
  </div>`;
}

// =====================================================================
// NỐI CỤM
// =====================================================================
// Câu hỏi cho một từ: ưu tiên một collocation có chứa từ đó; không có thì dùng câu ví dụ.
function blankOf(w) {
  const tryList = (list, type) => {
    for (const text of shuffle(list || [])) {
      const hit = findInSentence(w.word, text);
      if (!hit) continue;
      const before = text.slice(0, hit.index), after = text.slice(hit.index + hit.text.length);
      if (!/[A-Za-z]{2,}/.test(before + after)) continue; // cụm chỉ gồm đúng từ đó thì không có gì để nối
      return { type, before, after, answer: hit.text, full: text };
    }
    return null;
  };
  return tryList(w.collocations, 'colloc') || tryList(w.examples, 'example');
}
const matchable = (w) => !!blankOf(w);
export const matchPool = () => gamePool().filter(matchable);
// Số từ đã học có collocation dùng được (phần còn lại phải dùng câu ví dụ).
const withColloc = () => gamePool().filter((w) => (w.collocations || []).some((c) => { const h = findInSentence(w.word, c); return h && /[A-Za-z]{2,}/.test(c.replace(h.text, '')); })).length;

function matchQuestion(r) {
  while (r.queue.length) {
    const w = S.words.get(r.queue[0]);
    const b = w && blankOf(w);
    if (b) {
      const others = gamePool().filter((x) => x.id !== w.id && x.word.toLowerCase() !== w.word.toLowerCase());
      // Từ nhiễu ưu tiên cùng từ loại và cùng dạng (từ đơn / cụm nhiều chữ) để không lộ đáp án;
      // và không được chính là một đáp án đúng khác của cùng cụm.
      const multi = (x) => /\s/.test(x.word.trim());
      const score = (x) => (x.pos && x.pos === w.pos ? 2 : 0) + (multi(x) === multi(w) ? 1 : 0);
      const picks = shuffle(others).sort((x, y) => score(y) - score(x)).filter((x) => !findInSentence(x.word, b.full)).slice(0, 3);
      return { w, ...b, options: shuffle([w, ...picks]).map((x) => x.id) };
    }
    r.queue.shift();
  }
  return null;
}
function matchNext(r) {
  r.step++;
  r.busy = false;
  r.q = matchQuestion(r);
  if (!r.q) return finishRound(r);
  rerender(true);
}
on('match-start', () => {
  const r = startRound('match', pickWords(ROUND2, matchable));
  matchNext(r);
});
on('match-quit', () => quit('match'));
on('match-pick', async (el) => {
  const r = R.match;
  if (!r || r.phase !== 'play' || r.busy || !r.q) return;
  r.busy = true;
  const { w } = r.q;
  const step = r.step;
  const ok = el.dataset.id === w.id;
  settle(r, w, ok);
  // Hiện đáp án: điền vào chỗ trống, tô màu lựa chọn, kèm nghĩa.
  document.querySelectorAll('.m-opt').forEach((b) => {
    b.disabled = true;
    if (b.dataset.id === w.id) b.classList.add('ok'); else if (b === el) b.classList.add('no');
  });
  const blank = $('.m-blank');
  if (blank) { blank.textContent = r.q.answer; blank.classList.add(ok ? 'ok' : 'no'); }
  const note = $('.m-note');
  if (note) note.innerHTML = `<b class="en">${esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${esc(w.ipa)}</span>` : ''} — ${esc(w.meaning)}`;
  speak(r.q.type === 'colloc' ? r.q.full : w.word, voice());
  act($('.x-stage'), ok ? 'hug' : 'bonk', ok ? HEARTS : STARS);
  await wait(ok ? 1500 : 2600);
  if (alive(r, step)) matchNext(r);
});

export function matchView() {
  const r = R.match;
  if (r?.phase === 'over') return overView(r, 'Nối Cụm', 'match-start', 'match-quit');
  if (r?.phase === 'play' && r.q) {
    const q = r.q;
    return `<div class="page game">${topBar(r, 'match-quit')}
      <div class="g-stage x-stage">${duo()}</div>
      <div class="m-card">
        <p class="eyebrow">${q.type === 'colloc' ? 'Hoàn thành cụm từ' : 'Hoàn thành câu'}</p>
        <p class="m-text ${q.type}">${esc(q.before)}<span class="m-blank">&nbsp;</span>${esc(q.after)}</p>
        <p class="m-note"></p>
      </div>
      <div class="m-opts">${q.options.map((id) => `<button class="m-opt" data-act="match-pick" data-id="${id}">${esc(S.words.get(id)?.word || '')}</button>`).join('')}</div>
    </div>`;
  }
  const n = matchPool().length;
  const c = withColloc();
  return introView('match', 'Nối Cụm', [
    'Một cụm từ (collocation) bị khuyết một chỗ — chọn từ đúng trong 4 lựa chọn.',
    'Chọn đúng: Mochi chạy sang ôm Bolt. Chọn sai: Bolt lãnh một búa, đáp án hiện ra và từ đó quay lại sau vài lượt.',
    `Không có mạng. Mỗi ván ${ROUND2} từ đã học, xong khi chọn đúng hết. Game không ảnh hưởng tới tiến độ học.`,
  ], n, 'match-start',
  n ? `<p class="muted small" style="margin-top:4px">${c}/${n} từ có collocation; các từ còn lại dùng câu ví dụ thay thế.</p>` : '');
}

// =====================================================================
// NGHE & CHẠM
// =====================================================================
const RISE_MS = 9000;
const STEP_S = 0.95; // độ lệch nhịp giữa các bóng (giây)
const BAND = 104; // dải đất phía dưới nơi Mochi và Bolt đứng; bóng chui ra từ sau dải này
function popQuestion(r) {
  while (r.queue.length) {
    const w = S.words.get(r.queue[0]);
    if (w && (w.meaning || '').trim()) {
      const seen = new Set([w.meaning.trim().toLowerCase()]);
      const picks = [];
      for (const x of shuffle(gamePool().filter((x) => x.id !== w.id))) {
        const m = x.meaning.trim().toLowerCase();
        if (seen.has(m)) continue;
        seen.add(m); picks.push(x);
        if (picks.length === 3) break;
      }
      // Mỗi cột hai bóng, bay lên lệch nhịp; hai bóng cùng cột cách nhau đủ xa để không chồng lên nhau.
      const flip = Math.random() < 0.5 ? 1 : 0;
      return { w, options: shuffle([w, ...picks]).map((x, i) => ({ id: x.id, col: i % 2, delay: (Math.floor(i / 2) * 2 + ((i % 2) ^ flip)) * STEP_S })) };
    }
    r.queue.shift();
  }
  return null;
}
function popNext(r, { speakNow = true } = {}) {
  r.step++;
  r.busy = false;
  r.q = popQuestion(r);
  if (!r.q) return finishRound(r);
  rerender(true);
  const stage = $('.p-stage');
  if (stage) stage.style.setProperty('--rise', `${stage.clientHeight - BAND + 100}px`);
  const step = r.step;
  if (speakNow) speak(r.q.w.word, voice());
  // Hết giờ: mọi bóng đã bay khỏi màn hình.
  setTimeout(() => { if (alive(r, step) && !r.busy) popResolve(r, null); }, RISE_MS + 3 * STEP_S * 1000 + 200);
}
async function popResolve(r, el) {
  if (r.busy || !r.q) return;
  r.busy = true;
  const { w } = r.q;
  const step = r.step;
  const ok = !!el && el.dataset.id === w.id;
  settle(r, w, ok);
  const stage = $('.p-stage');
  const bubs = [...document.querySelectorAll('.p-bub')];
  bubs.forEach((b) => { b.disabled = true; b.style.animationPlayState = 'paused'; });
  stage.classList.add('done');
  const right = bubs.find((b) => b.dataset.id === w.id);
  const chip = $('.p-answer');
  if (chip) {
    chip.innerHTML = `<small>${ok ? 'Chính xác' : el ? 'Chưa đúng · đáp án' : 'Hết giờ · đáp án'}</small><b class="en">${esc(w.word)}</b>${w.ipa ? ` <span class="ipa">${esc(w.ipa)}</span>` : ''}<span>${esc(w.meaning)}</span>`;
    const hint = $('.p-hint');
    if (hint) hint.hidden = true;
    chip.className = `p-answer ${ok ? 'ok' : 'no'}`;
    chip.hidden = false;
  }
  if (ok) {
    // Bóng nổ tung thành mảnh màu; hai bạn nhảy lên đập tay.
    const rect = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'p-burst';
    burst.style.left = `${rect.left - s.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - s.top + rect.height / 2}px`;
    burst.innerHTML = Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36}deg;--c:var(--series-${(i % 3) + 1})"></i>`).join('');
    stage.appendChild(burst);
    // Phóng to rồi tan biến tại chỗ (giữ nguyên vị trí đang bay của bóng).
    el.animate([{ scale: 1, opacity: 1 }, { scale: 1.35, opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
    bubs.filter((b) => b !== el).forEach((b) => b.classList.add('fade'));
    act(stage, 'five', '<i class="spark">✦</i>');
  } else {
    right?.classList.add('right');
    bubs.filter((b) => b !== right && b !== el).forEach((b) => b.classList.add('fade'));
    speak(w.word, voice());
    if (el) {
      // Bóng chọn sai xẹp xuống, rơi trúng đầu Mochi.
      const m = stage.querySelector('.x-mochi').getBoundingClientRect(), b = el.getBoundingClientRect();
      el.classList.add('wrong');
      const dx = m.left + m.width / 2 - (b.left + b.width / 2), dy = m.top - (b.top + b.height / 2);
      const fall = el.animate([{ transform: getComputedStyle(el).transform }, { transform: `${getComputedStyle(el).transform === 'none' ? '' : getComputedStyle(el).transform} translate(${dx}px, ${dy}px) scale(.25) rotate(40deg)`, opacity: 0.2 }], { duration: 520, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
      await fall.finished.catch(() => {});
      if (!alive(r, step)) return;
      act(stage, 'oops', STARS);
    } else act(stage, 'sad');
  }
  await wait(ok ? 1500 : 2600);
  if (alive(r, step)) popNext(r);
}
on('pop-start', () => {
  const r = startRound('pop', pickWords(ROUND2));
  popNext(r); // gọi speak ngay trong cú chạm để iOS cho phép phát tiếng
});
on('pop-quit', () => quit('pop'));
on('pop-speak', () => { const r = R.pop; if (r?.q) speak(r.q.w.word, voice()); });
on('pop-pick', (el) => { const r = R.pop; if (r?.phase === 'play') popResolve(r, el); });

export function popView() {
  const r = R.pop;
  if (r?.phase === 'over') return overView(r, 'Nghe & Chạm', 'pop-start', 'pop-quit');
  if (r?.phase === 'play' && r.q) {
    return `<div class="page game p-page">${topBar(r, 'pop-quit')}
      <div class="g-stage x-stage p-stage">
        ${r.q.options.map((o) => `<button class="p-bub c${o.col}" style="animation-delay:${o.delay}s;animation-duration:${RISE_MS}ms" data-act="pop-pick" data-id="${o.id}">${esc(S.words.get(o.id)?.meaning || '')}</button>`).join('')}
        <div class="p-band"></div>
        <button class="speakbtn p-speak" data-act="pop-speak" aria-label="Nghe lại">${icon('speaker')}</button>
        ${duo()}
      </div>
      <div class="p-foot"><p class="g-note p-hint">Nghe từ rồi chạm vào bong bóng có nghĩa đúng · chạm loa để nghe lại</p><div class="p-answer" hidden></div></div>
    </div>`;
  }
  const n = gamePool().length;
  return introView('pop', 'Nghe & Chạm', [
    'App đọc một từ tiếng Anh; 4 bong bóng nghĩa tiếng Việt bay lên.',
    'Chạm đúng bong bóng trước khi chúng bay mất: bóng nổ, Mochi và Bolt đập tay ăn mừng.',
    'Chạm sai hoặc để bóng bay hết: đáp án hiện ra, từ đó quay lại sau vài lượt.',
    `Không có mạng. Mỗi ván ${ROUND2} từ đã học. Game không ảnh hưởng tới tiến độ học.`,
  ], canSpeak() ? n : 0, 'pop-start',
  canSpeak() ? '<p class="muted small" style="margin-top:4px">Nhớ bật tiếng (tắt chế độ im lặng) để nghe được phát âm.</p>' : '<p class="small" style="margin-top:6px;color:var(--amber);font-weight:600">Thiết bị này không hỗ trợ phát âm nên chưa chơi được game này.</p>');
}
