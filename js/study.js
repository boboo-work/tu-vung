// Phiên học: flashcard (Anh→Việt, Việt→Anh) và 5 dạng bài tập.
import { S, recordAnswer, saveWord, allWords, dueWords, newWords, dayOf, streak } from './store.js';
import { confetti, countUp, motionOK, wait } from './fx.js';
import { esc, shuffle, norm, speak, toast, fmtInterval } from './util.js';
import { preview, isNew, isDue } from './srs.js';
import { icon, on, go, replace, rerender, richText } from './ui.js';
import { aiReady, askAI, AI_ACTIONS } from './ai.js';

export const MODES = [
  { id: 'en-vi', name: 'Anh → Việt', desc: 'Nhìn từ tiếng Anh, nhớ lại nghĩa', icon: 'swap', min: 1 },
  { id: 'vi-en', name: 'Việt → Anh', desc: 'Nhìn nghĩa tiếng Việt, nhớ lại từ', icon: 'swap', min: 1 },
  { id: 'mc', name: 'Trắc nghiệm', desc: 'Chọn nghĩa đúng trong 4 đáp án', icon: 'list', min: 4 },
  { id: 'fill', name: 'Điền từ', desc: 'Điền từ còn thiếu vào câu', icon: 'blank', min: 1 },
  { id: 'listen', name: 'Nghe & chọn', desc: 'Nghe phát âm và chọn đúng từ', icon: 'ear', min: 4 },
  { id: 'spell', name: 'Nghe & viết', desc: 'Nghe phát âm và viết lại từ', icon: 'speaker', min: 1 },
  { id: 'sentence', name: 'Đặt câu', desc: 'Tự viết câu có dùng từ', icon: 'pen', min: 1 },
];
const modeOf = (id) => MODES.find((m) => m.id === id);
const isFlash = (m) => m === 'en-vi' || m === 'vi-en';
const voice = () => ({ lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });

let ses = null;
export const hasSession = () => !!ses;

/** Bắt đầu phiên. source: 'learn' (từ mới) | 'review' (từ đến hạn) | 'practice' (luyện tự do). */
// Từ có đủ dữ liệu cho dạng bài này không (vd. từ import thiếu nghĩa thì không ra được câu trắc nghiệm).
function usable(mode, w) {
  const meaning = !!(w.meaning || '').trim();
  if (mode === 'mc' || mode === 'vi-en') return meaning;
  if (mode === 'fill') return meaning || !!(w.definition || '').trim() || (w.examples || []).some((ex) => findInSentence(w.word, ex));
  return true;
}

export function startSession({ mode, ids, source, backTo, deckId = '' }) {
  const m = modeOf(mode);
  ids = ids.filter((id) => S.words.has(id));
  if (!ids.length) return toast('Chưa có từ nào để học trong phần này');
  const all = ids.length;
  ids = ids.filter((id) => usable(mode, S.words.get(id)));
  if (!ids.length) return toast(`Các từ này chưa có nghĩa tiếng Việt nên chưa dùng được chế độ "${m.name}"`);
  if (ids.length < all) toast(`Bỏ qua ${all - ids.length} từ chưa có nghĩa tiếng Việt`);
  if (S.words.size < m.min) return toast(`Chế độ "${m.name}" cần ít nhất ${m.min} từ trong kho`);
  ses = {
    mode, source, backTo, deckId, queue: ids.slice(), total: ids.length, done: 0,
    stats: { again: 0, hard: 0, easy: 0, known: 0, correct: 0, wrong: 0, skipped: 0 },
    counted: new Set(), step: null, finished: false, startedAt: Date.now(),
  };
  prepareStep();
  go('#/session');
}

// Chọn từ cho luyện tập tự do: ưu tiên từ đến hạn, rồi từ đã học, cuối cùng là từ mới.
export function practicePool(deckId, size = 10) {
  const words = allWords().filter((w) => !deckId || w.deckId === deckId);
  const rank = (w) => (isDue(w) ? 0 : isNew(w) ? 2 : 1);
  return shuffle(words).sort((a, b) => rank(a) - rank(b)).slice(0, size).map((w) => w.id);
}

const cur = () => S.words.get(ses.queue[0]);

// ---- Tạo câu hỏi ----
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stem = (w) => (w.length > 4 && /[ey]$/i.test(w) ? w.slice(0, -1) : w);

/** Tìm vị trí từ (kể cả dạng biến đổi như -s, -ed, -ing) trong câu ví dụ. */
export function findInSentence(word, sentence) {
  const parts = word.trim().replace(/[’‘]/g, "'").split(/\s+/);
  const s = sentence.replace(/[’‘]/g, "'");
  const tries = [];
  if (parts.length === 1) tries.push(`\\b${reEsc(stem(parts[0]))}[a-z]*\\b`);
  else {
    tries.push(parts.map(reEsc).join('\\s+'));
    tries.push(`\\b${reEsc(stem(parts[0]))}[a-z]*\\s+${parts.slice(1).map(reEsc).join('\\s+')}`);
  }
  for (const t of tries) {
    const m = new RegExp(t, 'i').exec(s);
    if (m) return { index: m.index, text: sentence.slice(m.index, m.index + m[0].length) };
  }
  return null;
}

function distractors(w, n) {
  const listen = ses.mode === 'listen';
  const others = allWords().filter((x) => x.id !== w.id && norm(x.word) !== norm(w.word)
    && (listen || ((x.meaning || '').trim() && norm(x.meaning) !== norm(w.meaning))));
  const same = shuffle(others.filter((x) => x.pos && x.pos === w.pos));
  const rest = shuffle(others.filter((x) => !(x.pos && x.pos === w.pos)));
  return [...same, ...rest].slice(0, n);
}

function prepareStep() {
  const w = cur();
  const st = { flipped: false, seen: false, more: false, answered: false, correct: null, choice: null, input: '', ai: null };
  if (ses.mode === 'mc' || ses.mode === 'listen') st.options = shuffle([w, ...distractors(w, 3)]).map((x) => x.id);
  if (ses.mode === 'fill') {
    for (const ex of shuffle(w.examples || [])) {
      const hit = findInSentence(w.word, ex);
      if (hit) { st.blank = { before: ex.slice(0, hit.index), after: ex.slice(hit.index + hit.text.length), answer: hit.text }; break; }
    }
  }
  ses.step = st;
  if (ses.mode === 'listen' || ses.mode === 'spell') setTimeout(() => speak(w.word, voice()), 250);
}

async function advance({ requeue = false } = {}) {
  const id = ses.queue.shift();
  if (requeue) ses.queue.push(id); else ses.done++;
  if (!ses.queue.length) {
    ses.finished = true;
    ses.streakUp = ses.streak0 !== undefined && streak() > ses.streak0;
  } else prepareStep();
  rerender(true);
  if (ses.finished) {
    countUp(document.getElementById('view'));
    confetti({ count: ses.goals?.size || ses.streakUp ? 150 : 70 });
  }
}

async function grade(rating) {
  const s = ses; // giữ lại phiên hiện tại: việc ghi dữ liệu chạy song song với hiệu ứng chuyển thẻ
  const w = cur();
  if (!s.counted.has(w.id)) {
    s.counted.add(w.id);
    if (rating === 'again') s.stats.wrong++; else s.stats.correct++;
  }
  if (isFlash(s.mode)) s.stats[rating]++;
  if (s.streak0 === undefined) s.streak0 = streak();
  const before = dayOf();
  const b = [before.newIds.length, before.reviewIds.length];
  await recordAnswer(w.id, rating, s.source);
  const after = dayOf();
  s.goals ??= new Set();
  if (b[0] < S.settings.newPerDay && after.newIds.length >= S.settings.newPerDay) s.goals.add('new');
  if (b[1] < S.settings.reviewPerDay && after.reviewIds.length >= S.settings.reviewPerDay) s.goals.add('review');
}

// Chấm điểm thẻ: một bản sao của thẻ bay ra theo hướng vuốt, còn thẻ kế tiếp hiện ra ngay bên dưới
// (không chờ hiệu ứng hay ghi dữ liệu xong) để vuốt liên tục không bị khựng.
const DIRS = { again: [-1, 0], easy: [1, 0], hard: [0, 1], known: [0, -1] };
let busy = false;
function flyOut(el, rating, swipe) {
  const [ux, uy] = DIRS[rating];
  const cur = el.style.transform;
  el.classList.add('still');
  el.style.transition = 'none';
  el.style.transform = 'none';
  const r = el.getBoundingClientRect();
  const g = el.cloneNode(true);
  g.classList.add('ghost');
  g.removeAttribute('data-act');
  Object.assign(g.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, transform: cur || 'none' });
  g.style.setProperty(`--${rating === 'again' ? 'l' : rating === 'easy' ? 'r' : rating === 'hard' ? 'd' : 'u'}`, 1);
  document.body.appendChild(g);
  el.style.visibility = 'hidden';
  const dx = swipe?.dx || 0, dy = swipe?.dy || 0;
  const tx = ux ? ux * (innerWidth + r.width * 0.3) : dx * 1.4;
  const ty = uy ? uy * innerHeight * 0.95 : dy * 1.6;
  const dist = Math.hypot(tx - dx, ty - dy);
  // Vuốt nhanh thì thẻ bay nhanh, tiếp nối đà của ngón tay; bấm nút thì tăng tốc dần.
  const speed = swipe ? Math.max(1.6, Math.hypot(swipe.vx, swipe.vy)) : 0;
  const duration = swipe ? Math.max(150, Math.min(320, dist / speed)) : 300;
  const anim = g.animate(
    [{ transform: cur || 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${ux ? ux * 22 : dx / 14}deg)`, opacity: 0.35 }],
    { duration, easing: swipe ? 'cubic-bezier(.25,.6,.5,1)' : 'cubic-bezier(.4,0,.9,.6)', fill: 'forwards' });
  const done = () => g.remove();
  anim.finished.then(done, done);
  return duration;
}
async function rate(rating, swipe) {
  if (busy || !ses || ses.finished) return;
  busy = true;
  try {
    const el = document.querySelector('.ses-body .flash');
    const last = ses.queue.length === 1 && rating !== 'again';
    const ms = el && motionOK() ? flyOut(el, rating, swipe) : 0;
    const saved = grade(rating);
    // Thẻ cuối: chờ ghi xong (màn tổng kết cần số liệu) và chờ thẻ bay ra. Các thẻ khác: sang thẻ kế ngay.
    if (last) { await saved; if (ms) await wait(Math.min(ms, 200)); }
    else saved.catch((err) => { console.error(err); toast('Chưa lưu được kết quả: ' + (err?.message || err), 'bad'); });
    // "Quên" → gặp lại ngay trong phiên này cho đến khi nhớ.
    await advance({ requeue: rating === 'again' });
  } finally { busy = false; }
}

// Vuốt thẻ (cả mặt trước lẫn mặt đáp án): trái = Quên, xuống = Khó, phải = Dễ, lên = Đã nhớ.
// Thẻ đi theo ngón tay theo cả hai chiều; thả tay thì chấm theo hướng lệch nhiều hơn.
// Thẻ dài vẫn cuộn đọc được: vuốt xuống chỉ nhận khi đang ở đầu thẻ, vuốt lên chỉ nhận khi đã ở cuối thẻ.
let drag = null;
let suppressClick = false;
const SLOP = 8;
// Vừa cuộn nội dung thẻ xong mà vuốt tiếp cùng chiều thì coi là vẫn đang cuộn, không chấm điểm nhầm.
let lastScroll = 0;
document.addEventListener('scroll', (e) => { if (e.target.classList?.contains('ses-body')) lastScroll = performance.now(); }, true);
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const canGrab = (d, dx, dy) => Math.abs(dx) >= Math.abs(dy) || (dy > 0 ? d.atTop : d.atBottom);
function paintDrag() {
  const d = drag;
  if (!d) return;
  d.raf = 0;
  const { el, dx, dy } = d;
  el.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${dx / 20}deg)`;
  const horiz = Math.abs(dx) >= Math.abs(dy);
  el.style.setProperty('--l', horiz ? clamp01(-dx / 80) : 0);
  el.style.setProperty('--r', horiz ? clamp01(dx / 80) : 0);
  el.style.setProperty('--d', horiz ? 0 : clamp01(dy / 80));
  el.style.setProperty('--u', horiz ? 0 : clamp01(-dy / 80));
  el.style.setProperty('--sy', `${Math.max(0, -dy)}px`);
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.('.ses-body .flash');
  // Cho phép bắt đầu vuốt cả khi ngón tay đặt trên một nút trong thẻ (nút loa, "Xem thêm"): nếu đã kéo thì cú chạm đó không tính là bấm nút.
  if (!el || busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const sc = el.closest('.ses-body');
  // Thẻ chỉ dài hơn khung nhìn một chút thì coi như nằm gọn: vuốt lên/xuống là chấm điểm chứ không phải cuộn.
  const snug = sc.scrollHeight - sc.clientHeight <= 24;
  drag = {
    el, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0, dy: 0, ox: 0, oy: 0, raf: 0, track: [{ t: e.timeStamp, x: 0, y: 0 }],
    atTop: snug || sc.scrollTop <= 0, atBottom: snug || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1,
  };
  if (!snug && performance.now() - lastScroll < 600) drag.atTop = drag.atBottom = false;
});
document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.on) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SLOP) return;
    if (!canGrab(drag, dx, dy)) { drag = null; return; } // để trình duyệt cuộn nội dung thẻ
    drag.on = true;
    // Bắt đầu kéo từ đúng vị trí hiện tại của ngón tay để thẻ không bị giật một nhịp.
    drag.ox = dx; drag.oy = dy;
    if (ses?.step) ses.step.still = true;
    drag.el.classList.add('still', 'dragging');
    drag.el.style.transition = 'none';
    try { drag.el.setPointerCapture(e.pointerId); } catch {}
  }
  drag.dx = dx - drag.ox;
  drag.dy = dy - drag.oy;
  drag.track.push({ t: e.timeStamp, x: dx, y: dy });
  if (drag.track.length > 6) drag.track.shift();
  if (!drag.raf) drag.raf = requestAnimationFrame(paintDrag);
});
// Chặn trình duyệt cuộn / nảy trang (rubber-band trên iOS) trong lúc đang vuốt thẻ.
document.addEventListener('touchmove', (e) => {
  if (!drag || !e.cancelable || e.touches.length !== 1) return;
  if (drag.on) return e.preventDefault();
  const t = e.touches[0];
  if (canGrab(drag, t.clientX - drag.x, t.clientY - drag.y)) e.preventDefault();
}, { passive: false });
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (d.raf) cancelAnimationFrame(d.raf);
  if (!d.on) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 350);
  d.el.classList.remove('dragging');
  if (e.type === 'pointerup' && d.el.isConnected && !busy) {
    // Vận tốc (px/ms) trong ~100ms cuối: hất nhanh một đoạn ngắn cũng được tính.
    const lastP = d.track[d.track.length - 1];
    const first = d.track.find((p) => lastP.t - p.t <= 100) || lastP;
    const dt = Math.max(1, lastP.t - first.t);
    const vx = (lastP.x - first.x) / dt, vy = (lastP.y - first.y) / dt;
    // Quãng đường tính từ điểm chạm đầu tiên (kể cả đoạn đầu trước khi thẻ bắt đầu đi theo tay).
    const horiz = Math.abs(lastP.x) >= Math.abs(lastP.y);
    const dist = horiz ? lastP.x : lastP.y, vel = horiz ? vx : vy;
    const flick = Math.abs(dist) > 24 && Math.abs(vel) > 0.35 && Math.sign(vel) === Math.sign(dist);
    if (Math.abs(dist) > 80 || flick) {
      d.el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0) rotate(${d.dx / 20}deg)`;
      return rate(horiz ? (dist < 0 ? 'again' : 'easy') : (dist > 0 ? 'hard' : 'known'), { dx: d.dx, dy: d.dy, vx, vy });
    }
  }
  d.el.style.transition = 'transform .3s cubic-bezier(.2,.9,.3,1.15)';
  d.el.style.transform = '';
  for (const k of ['--l', '--r', '--d', '--u']) d.el.style.setProperty(k, 0);
  d.el.style.setProperty('--sy', '0px');
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('click', (e) => {
  if (!suppressClick) return;
  suppressClick = false;
  e.stopPropagation(); e.preventDefault();
}, true);

// ---- Hành động ----
on('ses-flip', async () => {
  if (busy) return;
  const st = ses.step;
  // Tự phát âm khi lật sang mặt đáp án (gọi ngay trong lượt chạm để iOS cho phép phát tiếng).
  if (!st.flipped && S.settings.autoSpeak !== false) speak(cur().word, voice());
  const el = document.querySelector('.ses-body .flash');
  if (el && motionOK()) {
    busy = true;
    el.classList.add(st.flipped ? 'out-b' : 'out-f');
    await wait(150);
    busy = false;
    if (!ses || ses.step !== st) return;
  }
  st.flipped = !st.flipped; st.seen = true; st.more = false; st.still = false;
  rerender();
});
on('ses-more', () => { ses.step.more = true; rerender(); });
on('ses-speak', (el) => speak(el.dataset.text || cur().word, voice()));
on('ses-rate', (el) => rate(el.dataset.rating));
on('ses-choose', async (el) => {
  if (ses.step.answered) return;
  const w = cur();
  ses.step.choice = el.dataset.id;
  ses.step.answered = true;
  ses.step.correct = el.dataset.id === w.id;
  await grade(ses.step.correct ? 'good' : 'again');
  rerender();
});
// Lỗi nhập liệu hiện ngay dưới ô nhập (không dùng thông báo nổi: dễ đè lên nút và khuất sau bàn phím).
function sesError(msg) {
  const el = document.querySelector('.ses-error');
  if (!el) return toast(msg);
  el.textContent = msg;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  el.scrollIntoView({ block: 'nearest' });
}
on('ses-clear-error', () => { const el = document.querySelector('.ses-error'); if (el) el.textContent = ''; });
on('ses-check', async () => {
  if (ses.step.answered) return;
  const w = cur();
  const input = document.querySelector('.answer-input');
  const value = input?.value ?? '';
  if (!value.trim()) { sesError('Hãy nhập câu trả lời trước'); input?.focus(); return; }
  const accepted = [w.word];
  if (ses.mode === 'fill' && ses.step.blank) accepted.push(ses.step.blank.answer);
  ses.step.input = value;
  ses.step.answered = true;
  ses.step.correct = accepted.some((a) => norm(a) === norm(value));
  await grade(ses.step.correct ? 'good' : 'again');
  rerender();
});
on('ses-save-sentence', async () => {
  const w = cur();
  const ta = document.querySelector('#sentence-input');
  const text = (ta?.value || '').trim();
  if (text.split(/\s+/).filter(Boolean).length < 3) { sesError('Câu quá ngắn — hãy viết ít nhất 3 từ'); ta?.focus(); return; }
  if (!findInSentence(w.word, text)) { sesError(`Câu chưa chứa “${w.word}”`); ta?.focus(); return; }
  w.sentences = [...(w.sentences || []), { text, at: Date.now() }];
  await saveWord(w);
  ses.step.input = text;
  ses.step.answered = true;
  ses.step.correct = true;
  await grade('good');
  rerender();
});
on('ses-ai-grade', async () => {
  const w = cur();
  const st = ses.step;
  st.ai = { loading: true };
  rerender();
  try {
    const text = await askAI(S.settings.ai, AI_ACTIONS.find((a) => a.id === 'grade').build(w, st.input));
    st.ai = { text };
  } catch (e) { st.ai = { error: e.message }; }
  if (ses?.step === st) rerender();
});
on('ses-skip', () => { ses.stats.skipped++; advance(); });
on('ses-next', () => advance());
on('ses-quit', () => { const to = ses?.backTo || '#/learn'; ses = null; go(to); });
on('ses-continue', () => {
  const { source, mode, backTo, deckId } = ses;
  const ids = nextBatch(source, deckId);
  ses = null;
  if (!ids.length) return go(backTo);
  startSession({ mode, ids, source, backTo, deckId });
});

function nextBatch(source, deckId = ses?.deckId || '') {
  if (source === 'review') return dueWords().slice(0, S.settings.reviewPerDay).map((w) => w.id);
  if (source === 'learn') return newWords(deckId).slice(0, 5).map((w) => w.id);
  return [];
}

// ---- Giao diện ----
const speakBtn = (text, cls = '') => `<button class="speakbtn ${cls}" data-act="ses-speak" data-text="${esc(text)}" aria-label="Nghe phát âm">${icon('speaker')}</button>`;

function backFace(w, more) {
  const ex = w.examples || [];
  const extra = ex.length > 1 || w.collocations?.length || w.mistakes || w.synonyms?.length;
  return `
    <div class="row-between" style="align-items:flex-start">
      <div><div class="headword">${esc(w.word)}</div>
      <div class="ipa">${esc(w.ipa || '')} ${w.pos ? `<span class="tag">${esc(w.pos)}</span>` : ''}</div></div>
      ${speakBtn(w.word)}
    </div>
    <p class="meaning">${esc(w.meaning || '(chưa có nghĩa)')}</p>
    ${w.definition ? `<p class="muted en" style="margin-top:6px">${esc(w.definition)}</p>` : ''}
    ${ex[0] ? `<div class="field" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px"><h4>Ví dụ</h4><p class="en">${esc(ex[0])}</p></div>` : ''}
    ${more ? `
      ${ex.length > 1 ? `<div class="field"><h4>Ví dụ khác</h4><ul>${ex.slice(1).map((e) => `<li class="en">${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${w.collocations?.length ? `<div class="field"><h4>Collocations</h4><div class="pill-list">${w.collocations.map((c) => `<span>${esc(c)}</span>`).join('')}</div></div>` : ''}
      ${w.synonyms?.length ? `<div class="field"><h4>Đồng nghĩa</h4><p>${esc(w.synonyms.join(', '))}</p></div>` : ''}
      ${w.mistakes ? `<div class="field"><h4>Lỗi thường gặp</h4><p>${esc(w.mistakes)}</p></div>` : ''}
      ${w.notes ? `<div class="field"><h4>Ghi chú</h4><p>${esc(w.notes)}</p></div>` : ''}`
    : extra ? `<button class="link" data-act="ses-more" style="margin-top:8px">Xem thêm ví dụ & giải thích ${icon('chev', 'sm')}</button>` : ''}`;
}

function flashView(w) {
  const st = ses.step;
  if (!st.flipped) {
    const front = ses.mode === 'en-vi'
      ? `<div class="headword">${esc(w.word)}</div>${w.pos ? `<span class="tag">${esc(w.pos)}</span>` : ''}`
      : `<div class="vi">${esc(w.meaning || '(chưa có nghĩa)')}</div>${w.pos ? `<span class="tag">${esc(w.pos)}</span>` : ''}`;
    return {
      body: `<div class="flash ${st.still ? 'still' : st.seen ? 'turn' : ''}" data-act="ses-flip" role="button" aria-label="Lật thẻ">
        <span class="stamp l" aria-hidden="true">Quên</span><span class="stamp r" aria-hidden="true">Dễ</span><span class="stamp d" aria-hidden="true">Khó</span><span class="stamp u" aria-hidden="true">Đã nhớ</span>
        ${ses.mode === 'en-vi' ? `<div class="speak">${speakBtn(w.word)}</div>` : ''}
        <div class="front">${front}</div><p class="hint">Chạm để xem đáp án<br>Vuốt ← Quên · ↓ Khó · → Dễ · ↑ Đã nhớ</p></div>`,
      actions: `<button class="btn ghost" data-act="ses-flip">${st.seen ? 'Xem lại đáp án' : 'Xem đáp án'}</button>`,
    };
  }
  const affects = ses.source === 'learn' ? true : isDue(w);
  const hint = (r) => (affects ? fmtInterval(preview(w.srs, r)) : r === 'again' && !isNew(w) ? 'hôm nay' : 'giữ lịch');
  return {
    body: `<div class="flash back ${st.more || st.still ? 'still' : ''}" data-act="ses-flip" role="button" aria-label="Lật lại mặt trước">
      <span class="stamp l" aria-hidden="true">Quên</span><span class="stamp r" aria-hidden="true">Dễ</span><span class="stamp d" aria-hidden="true">Khó</span><span class="stamp u" aria-hidden="true">Đã nhớ</span>
      ${backFace(w, st.more)}<p class="hint">Chạm để lật lại · vuốt thẻ theo mũi tên để chấm</p></div>`,
    actions: `<div class="rate">
      <button class="again" data-act="ses-rate" data-rating="again"><i aria-hidden="true">←</i>Quên<small>${affects ? 'ôn lại ngay' : hint('again')}</small></button>
      <button class="hard" data-act="ses-rate" data-rating="hard"><i aria-hidden="true">↓</i>Khó<small>${hint('hard')}</small></button>
      <button class="easy" data-act="ses-rate" data-rating="easy"><i aria-hidden="true">→</i>Dễ<small>${hint('easy')}</small></button>
      <button class="known" data-act="ses-rate" data-rating="known"><i aria-hidden="true">↑</i>Đã nhớ<small>${hint('known')}</small></button>
    </div>`,
  };
}

function feedback(w, st, extra = '') {
  if (!st.answered) return '';
  return `<div class="feedback ${st.correct ? 'ok' : 'no'}">
    <b class="t">${icon(st.correct ? 'check' : 'x', 'sm')} ${st.correct ? 'Chính xác' : 'Chưa đúng'}</b>
    <p><b class="en">${esc(w.word)}</b> ${w.ipa ? `<span class="ipa">${esc(w.ipa)}</span>` : ''} — ${esc(w.meaning)}</p>${extra}
    ${!st.correct && !isNew(w) ? '<p class="small muted">Từ này đã được đưa vào danh sách cần ôn lại.</p>' : ''}</div>`;
}
const nextBtn = () => `<button class="btn" data-act="ses-next">Tiếp tục</button>`;

function choiceView(w) {
  const st = ses.step;
  const listen = ses.mode === 'listen';
  const opts = st.options.map((id) => {
    const o = S.words.get(id);
    let cls = '';
    if (st.answered) cls = id === w.id ? 'right' : id === st.choice ? 'wrong' : 'dim';
    return `<button class="opt ${cls}" data-act="ses-choose" data-id="${id}" ${st.answered ? 'disabled' : ''}>
      <span class="${listen ? 'en' : ''}">${esc(listen ? o.word : o.meaning || '(chưa có nghĩa)')}</span>${cls === 'right' ? icon('check') : cls === 'wrong' ? icon('x') : ''}</button>`;
  }).join('');
  const q = listen
    ? `<div class="question">${speakBtn(w.word, 'big')}<p class="hint faint" style="margin-top:12px">Chạm để nghe lại</p></div>`
    : `<div class="question"><div class="headword">${esc(w.word)}</div>${w.pos ? `<span class="tag">${esc(w.pos)}</span>` : ''}</div>`;
  return { body: `${q}<div class="options">${opts}</div>${feedback(w, st)}`, actions: st.answered ? nextBtn() : '' };
}

function typeView(w) {
  const st = ses.step;
  let q;
  if (ses.mode === 'spell') {
    q = `<div class="question">${speakBtn(w.word, 'big')}<p class="hint faint" style="margin-top:12px">Nghe và viết lại từ · chạm để nghe lại</p></div>`;
  } else if (st.blank) {
    q = `<div class="question"><p class="sentence">${esc(st.blank.before)}<span class="blank">${st.answered ? esc(st.blank.answer) : '&nbsp;'}</span>${esc(st.blank.after)}</p>
      <p class="muted" style="margin-top:14px;text-align:left">Gợi ý: ${esc(w.meaning)}</p></div>`;
  } else {
    q = `<div class="question"><p class="sentence">${esc(w.definition || w.meaning)}</p>
      <p class="muted" style="margin-top:14px;text-align:left">Điền từ tiếng Anh phù hợp${w.definition ? ` · ${esc(w.meaning)}` : ''}</p></div>`;
  }
  const form = st.answered
    ? `<input class="answer-input" value="${esc(st.input)}" disabled>`
    : `<form data-submit="ses-check"><input class="answer-input" data-in="ses-clear-error" placeholder="Nhập câu trả lời" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"></form><p class="ses-error" role="alert"></p>`;
  return {
    body: q + form + feedback(w, st),
    actions: st.answered ? nextBtn() : `<button class="btn" data-act="ses-check">Kiểm tra</button>`,
    focus: !st.answered && '.answer-input',
  };
}

function sentenceView(w) {
  const st = ses.step;
  const head = `<div class="question" style="padding-bottom:14px"><div class="headword">${esc(w.word)}</div>
    <p class="muted" style="margin-top:6px">${esc(w.meaning)}</p></div>
    ${w.collocations?.length ? `<div class="pill-list" style="margin-bottom:14px;justify-content:center">${w.collocations.slice(0, 3).map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}`;
  if (!st.answered) {
    return {
      body: `${head}<textarea id="sentence-input" class="input" rows="4" data-in="ses-clear-error" placeholder="Viết một câu tiếng Anh có dùng từ này…" autocapitalize="sentences"></textarea><p class="ses-error" role="alert"></p>`,
      actions: `<div class="btn-row"><button class="btn ghost" data-act="ses-skip" style="flex:.6">Bỏ qua</button><button class="btn" data-act="ses-save-sentence">Lưu câu</button></div>`,
      focus: '#sentence-input',
    };
  }
  let ai = '';
  if (st.ai?.loading) ai = `<div class="card" style="margin-top:12px;display:flex;gap:12px;align-items:center"><div class="spin"></div><span class="muted">AI đang chấm câu…</span></div>`;
  else if (st.ai?.error) ai = `<div class="banner" style="margin-top:12px">${icon('info')}<span>${esc(st.ai.error)}</span></div>`;
  else if (st.ai?.text) ai = `<div class="card ai-out" style="margin-top:12px">${richText(st.ai.text)}</div>`;
  else if (aiReady(S.settings.ai)) ai = `<button class="btn soft" data-act="ses-ai-grade" style="margin-top:12px">${icon('sparkle', 'sm')} Nhờ AI chấm & sửa câu này</button>`;
  else ai = `<p class="small faint center" style="margin-top:12px">Kết nối AI trong Cài đặt để được chấm và sửa câu tự động.</p>`;
  return {
    body: `${head}<div class="feedback ok"><b class="t">${icon('check', 'sm')} Đã lưu vào từ này</b><p class="en">${esc(st.input)}</p></div>${ai}`,
    actions: nextBtn(),
  };
}

function finishView() {
  const s = ses.stats;
  const answered = s.correct + s.wrong;
  const pct = answered ? Math.round((s.correct / answered) * 100) : 0;
  const mins = Math.max(1, Math.round((Date.now() - ses.startedAt) / 60000));
  const more = nextBatch(ses.source).length;
  const day = dayOf();
  const cheers = [];
  if (ses.streakUp) cheers.push(`${icon('flame', 'sm')} Chuỗi ${streak()} ngày liên tiếp`);
  if (ses.goals?.has('new')) cheers.push(`${icon('check', 'sm')} Đạt mục tiêu từ mới hôm nay`);
  if (ses.goals?.has('review')) cheers.push(`${icon('check', 'sm')} Đạt mục tiêu ôn tập hôm nay`);
  return `<div class="page session"><div class="ses-body" style="justify-content:center">
    <div class="empty"><div class="art pop">${icon('check')}</div>
      <h3>Hoàn thành phiên học</h3>
      <p>${ses.done} từ · khoảng ${mins} phút</p>
      ${cheers.map((c) => `<div class="cheer">${c}</div>`).join('')}
      ${answered ? `<div class="result-big" data-count="${pct}" data-suffix="%">${pct}%</div><p class="muted" style="margin-top:6px">nhớ ngay từ lần đầu (${s.correct}/${answered})</p>` : ''}
    </div>
    <div class="tiles two">
      <div class="tile"><b>${day.newIds.length}/${S.settings.newPerDay}</b><span>Từ mới hôm nay</span></div>
      <div class="tile"><b>${day.reviewIds.length}/${S.settings.reviewPerDay}</b><span>Từ ôn hôm nay</span></div>
    </div></div>
    <div class="ses-actions stack">
      ${more ? `<button class="btn" data-act="ses-continue">${ses.source === 'review' ? `Ôn tiếp ${more} từ đến hạn` : `Học thêm ${more} từ mới`}</button>` : ''}
      <button class="btn ${more ? 'ghost' : ''}" data-act="ses-quit">Xong</button>
    </div></div>`;
}

export function sessionView() {
  if (!ses) { setTimeout(() => replace('#/learn')); return ''; }
  if (ses.finished) return finishView();
  const w = cur();
  const v = isFlash(ses.mode) ? flashView(w) : ses.mode === 'sentence' ? sentenceView(w) : ses.mode === 'mc' || ses.mode === 'listen' ? choiceView(w) : typeView(w);
  const label = { learn: 'Từ mới', review: 'Ôn tập', practice: 'Luyện tập' }[ses.source] + ' · ' + modeOf(ses.mode).name;
  const pct = Math.round((ses.done / ses.total) * 100);
  const from = ses.shownPct ?? 0;
  ses.shownPct = pct;
  return {
    html: `<div class="page session ${isFlash(ses.mode) ? '' : 'compact'}">
      <div class="ses-top"><button class="iconbtn" data-act="ses-quit" aria-label="Thoát">${icon('x')}</button>
        <div class="progress"><i style="width:${pct}%;--from:${from}%"></i></div>
        <span class="count">${Math.min(ses.done + 1, ses.total)}/${ses.total}</span></div>
      <p class="mode-label">${esc(label)}</p>
      <div class="ses-body">${v.body}</div>
      <div class="ses-actions">${v.actions}</div></div>`,
    focus: v.focus,
  };
}
