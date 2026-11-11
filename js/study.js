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
    stats: { again: 0, hard: 0, easy: 0, correct: 0, wrong: 0, skipped: 0 },
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
  const w = cur();
  if (!ses.counted.has(w.id)) {
    ses.counted.add(w.id);
    if (rating === 'again') ses.stats.wrong++; else ses.stats.correct++;
  }
  if (isFlash(ses.mode)) ses.stats[rating]++;
  if (ses.streak0 === undefined) ses.streak0 = streak();
  const before = dayOf();
  const b = [before.newIds.length, before.reviewIds.length];
  await recordAnswer(w.id, rating, ses.source);
  const after = dayOf();
  ses.goals ??= new Set();
  if (b[0] < S.settings.newPerDay && after.newIds.length >= S.settings.newPerDay) ses.goals.add('new');
  if (b[1] < S.settings.reviewPerDay && after.reviewIds.length >= S.settings.reviewPerDay) ses.goals.add('review');
}

// Chấm điểm thẻ: thẻ bay ra theo hướng tương ứng rồi mới sang thẻ kế.
let busy = false;
async function rate(rating) {
  if (busy || !ses || ses.finished) return;
  busy = true;
  try {
    const el = document.querySelector('.flash');
    if (el && motionOK()) {
      const x = rating === 'again' ? -1 : rating === 'easy' ? 1 : 0;
      el.classList.add('still');
      el.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
      el.style.transform = x ? `translateX(${x * 120}%) rotate(${x * 14}deg)` : 'translateY(70%) scale(.94)';
      el.style.opacity = '0';
      await wait(190);
    }
    await grade(rating);
    // "Quên" → gặp lại ngay trong phiên này cho đến khi nhớ.
    await advance({ requeue: rating === 'again' });
  } finally { busy = false; }
}

// Vuốt thẻ (cả mặt trước lẫn mặt đáp án): trái = Quên, phải = Dễ, xuống = Khó.
// Vuốt xuống chỉ nhận khi nội dung đang ở đầu trang, nên thẻ dài vẫn cuộn đọc được bình thường.
let drag = null;
let suppressClick = false;
const SLOP = 10;
// Hướng của cử chỉ: 'x' (chấm Quên/Dễ), 'down' (chấm Khó), 'scroll' (để trình duyệt cuộn), null = chưa rõ.
function gestureOf(dx, dy, atTop) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < SLOP) return null;
  if (ax >= ay) return 'x';
  return dy > 0 && atTop ? 'down' : 'scroll';
}
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest?.('.flash');
  if (!el || busy || e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const sc = el.closest('.ses-body');
  drag = { el, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, dx: 0, dy: 0, axis: null, atTop: !sc || sc.scrollTop <= 0 };
});
document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.on) {
    const g = gestureOf(dx, dy, drag.atTop);
    if (!g) return;
    if (g === 'scroll') { drag = null; return; }
    drag.on = true;
    drag.axis = g === 'down' ? 'y' : 'x';
    if (ses?.step) ses.step.still = true;
    drag.el.classList.add('still', 'dragging');
    try { drag.el.setPointerCapture(e.pointerId); } catch {}
  }
  const el = drag.el;
  el.style.transition = 'none';
  if (drag.axis === 'y') {
    drag.dy = Math.max(0, dy);
    el.style.transform = `translateY(${drag.dy}px) scale(${1 - Math.min(0.06, drag.dy / 2500)})`;
    el.style.setProperty('--u', Math.max(0, Math.min(1, drag.dy / 80)));
    return;
  }
  drag.dx = dx;
  el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
  el.style.setProperty('--l', Math.max(0, Math.min(1, -dx / 90)));
  el.style.setProperty('--r', Math.max(0, Math.min(1, dx / 90)));
});
// Chặn trình duyệt cuộn / nảy trang (rubber-band trên iOS) trong lúc đang vuốt thẻ — đây là nguyên nhân màn hình bị rung.
document.addEventListener('touchmove', (e) => {
  if (!drag || !e.cancelable || e.touches.length !== 1) return;
  if (drag.on) return e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - drag.x, dy = t.clientY - drag.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  // Chưa đủ xa để biết hướng: tạm giữ trang đứng yên, trừ khi rõ ràng là đang cuộn lên/xuống trong thẻ dài.
  const scrolling = ay > ax && !(dy > 0 && drag.atTop);
  if (!scrolling) e.preventDefault();
}, { passive: false });
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.on) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 350);
  d.el.classList.remove('dragging');
  if (e.type === 'pointerup' && d.el.isConnected) {
    if (d.axis === 'y' && d.dy > 80) return rate('hard');
    if (d.axis === 'x' && Math.abs(d.dx) > 90) return rate(d.dx < 0 ? 'again' : 'easy');
  }
  d.el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)';
  d.el.style.transform = '';
  d.el.style.setProperty('--l', 0);
  d.el.style.setProperty('--r', 0);
  d.el.style.setProperty('--u', 0);
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
  const el = document.querySelector('.flash');
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
on('ses-check', async () => {
  if (ses.step.answered) return;
  const w = cur();
  const input = document.querySelector('.answer-input');
  const value = input?.value ?? '';
  if (!value.trim()) { toast('Hãy nhập câu trả lời trước'); input?.focus(); return; }
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
  if (text.split(/\s+/).filter(Boolean).length < 3) { toast('Câu quá ngắn — hãy viết ít nhất 3 từ'); ta?.focus(); return; }
  if (!findInSentence(w.word, text)) { toast(`Câu chưa chứa "${w.word}"`); ta?.focus(); return; }
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
        <span class="stamp l" aria-hidden="true">Quên</span><span class="stamp r" aria-hidden="true">Dễ</span><span class="stamp u" aria-hidden="true">Khó</span>
        ${ses.mode === 'en-vi' ? `<div class="speak">${speakBtn(w.word)}</div>` : ''}
        <div class="front">${front}</div><p class="hint">Chạm để xem đáp án<br>Đã thuộc? Vuốt ← Quên · ↓ Khó · → Dễ</p></div>`,
      actions: `<button class="btn ghost" data-act="ses-flip">${st.seen ? 'Xem lại đáp án' : 'Xem đáp án'}</button>`,
    };
  }
  const affects = ses.source === 'learn' ? true : isDue(w);
  const hint = (r) => (affects ? fmtInterval(preview(w.srs, r)) : r === 'again' && !isNew(w) ? 'hôm nay' : 'giữ lịch');
  return {
    body: `<div class="flash back ${st.more || st.still ? 'still' : ''}" data-act="ses-flip" role="button" aria-label="Lật lại mặt trước">
      <span class="stamp l" aria-hidden="true">Quên</span><span class="stamp r" aria-hidden="true">Dễ</span><span class="stamp u" aria-hidden="true">Khó</span>
      ${backFace(w, st.more)}<p class="hint">Chạm để lật lại · vuốt ← Quên · ↓ Khó · → Dễ</p></div>`,
    actions: `<div class="rate">
      <button class="again" data-act="ses-rate" data-rating="again">Quên<small>${affects ? 'ôn lại ngay' : hint('again')}</small></button>
      <button class="hard" data-act="ses-rate" data-rating="hard">Khó<small>${hint('hard')}</small></button>
      <button class="easy" data-act="ses-rate" data-rating="easy">Dễ<small>${hint('easy')}</small></button>
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
    : `<form data-submit="ses-check"><input class="answer-input" placeholder="Nhập câu trả lời" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"></form>`;
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
      body: `${head}<textarea id="sentence-input" class="input" rows="4" placeholder="Viết một câu tiếng Anh có dùng từ này…" autocapitalize="sentences"></textarea>`,
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
    html: `<div class="page session">
      <div class="ses-top"><button class="iconbtn" data-act="ses-quit" aria-label="Thoát">${icon('x')}</button>
        <div class="progress"><i style="width:${pct}%;--from:${from}%"></i></div>
        <span class="count">${Math.min(ses.done + 1, ses.total)}/${ses.total}</span></div>
      <p class="mode-label">${esc(label)}</p>
      <div class="ses-body">${v.body}</div>
      <div class="ses-actions">${v.actions}</div></div>`,
    focus: v.focus,
  };
}
