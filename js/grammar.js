// Ngữ pháp: khoá → unit → bài. Bài học 6 bước, thẻ mẫu câu ôn bằng SRS, sổ lỗi, kiểm tra đầu vào.
// Nội dung nằm ở content/grammar/*.json (dữ liệu, không phải code) — thêm bài mới không cần sửa file này.
import { S, gPut, logGrammarDay, dayOf, saveSettings } from './store.js';
import { esc, toast, speak, norm, today, addDays, fmtInterval } from './util.js';
import { schedule, newSrs, preview } from './srs.js';
import { icon, on, go, replace, rerender, navBar, learnSwitch } from './ui.js';
import { confetti, countUp, motionOK, wait } from './fx.js';

const voice = () => ({ lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });

export const COURSES = [
  { id: 'c1', title: 'Nền tảng', level: 'A1–A2', file: 'content/grammar/course1.json' },
  { id: 'c2', title: 'IELTS Core', level: 'Band 4.5–6.0', file: 'content/grammar/course2.json' },
  { id: 'c3', title: 'IELTS 6.5 Booster', level: 'Band 6.0–6.5', file: 'content/grammar/course3.json' },
  { id: 'c4', title: 'IELTS 7.0 Advanced', level: 'Band 6.5 → 7.0', soon: true },
];
const BANDS = ['Nền tảng', 'IELTS Core', 'IELTS 6.5', 'IELTS 7.0'];

// ================= NỘI DUNG =================
export const G = { state: 'idle', error: '', courses: new Map(), units: new Map(), lessons: new Map(), order: [], cards: new Map(), tags: {}, placement: null };

export async function loadGrammar() {
  if (G.state === 'loading' || G.state === 'ready') return;
  G.state = 'loading';
  try {
    const get = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    };
    const files = COURSES.filter((c) => c.file);
    const [pt, ...loaded] = await Promise.all([get('content/grammar/placement.json'), ...files.map((c) => get(c.file))]);
    loaded.forEach(indexCourse);
    G.placement = pt;
    G.state = 'ready';
  } catch (e) {
    console.error(e);
    G.state = 'error';
    G.error = 'Chưa tải được nội dung ngữ pháp. Hãy mở app khi có mạng một lần để app lưu sẵn nội dung.';
  }
}

function indexCourse(c) {
  G.courses.set(c.id, c);
  Object.assign(G.tags, c.tags || {});
  for (const u of c.units) {
    G.units.set(u.id, { ...u, courseId: c.id });
    for (const l of u.lessons) {
      G.lessons.set(l.id, { ...l, unitId: u.id, courseId: c.id });
      G.order.push(l.id);
      for (const card of l.cards || []) G.cards.set(card.id, { ...card, lessonId: l.id });
    }
  }
}

// ================= TRẠNG THÁI =================
const rec = (id) => S.grammar.get(id);
const blankLesson = (id) => ({ id: 'L:' + id, lessonId: id, step: 0, pos: 0, right: 0, wrong: 0, done: false, doneAt: null, best: 0, sentences: [] });
const lessonRec = (id) => ({ ...blankLesson(id), ...(rec('L:' + id) || {}) });
const isDone = (id) => !!rec('L:' + id)?.done;
const inProgress = (id) => { const r = rec('L:' + id); return !!r && !r.done && (r.step > 0 || r.pos > 0); };

const courseLessons = (cid) => G.order.filter((id) => G.lessons.get(id).courseId === cid);
const loadedCourses = () => COURSES.filter((c) => G.courses.has(c.id));
/** Khoá đang học: do người dùng chọn; chưa chọn thì theo kết quả kiểm tra đầu vào; không có thì khoá đầu tiên còn bài chưa học. */
export function activeCourse() {
  const list = loadedCourses();
  const has = (id) => list.some((c) => c.id === id);
  if (has(S.settings.grammarCourse)) return S.settings.grammarCourse;
  const placed = S.grammar.get('placement')?.course;
  if (has(placed)) return placed;
  return (list.find((c) => courseLessons(c.id).some((id) => !isDone(id))) || list[list.length - 1])?.id || '';
}
/** Bài kế tiếp: trong khoá đang học; học hết khoá đó thì sang khoá sau còn bài. */
export function nextLesson() {
  const list = loadedCourses();
  const start = Math.max(0, list.findIndex((c) => c.id === activeCourse()));
  for (const c of [...list.slice(start), ...list.slice(0, start)]) {
    const id = courseLessons(c.id).find((x) => !isDone(x));
    if (id) return G.lessons.get(id);
  }
  return null;
}
export const todayLessons = () => (dayOf().gLessons || []).length;
export function gDueCards() {
  const t = today();
  return [...S.grammar.values()]
    .filter((r) => r.id.startsWith('C:') && G.cards.has(r.cardId) && r.srs?.due && r.srs.due <= t)
    .sort((a, b) => (a.srs.due < b.srs.due ? -1 : a.srs.due > b.srs.due ? 1 : 0));
}
export const gDueCount = () => (G.state === 'ready' ? gDueCards().length : 0);
const progressOf = (ids) => ({ done: ids.filter(isDone).length, total: ids.length });

async function logError(tag, ok) {
  if (!tag) return;
  const r = rec('E:' + tag) || { id: 'E:' + tag, tag, log: [] };
  await gPut({ ...r, log: [...r.log, { d: today(), ok }].slice(-100) });
}
function errorStats() {
  const from = addDays(today(), -6);
  return [...S.grammar.values()]
    .filter((r) => r.id.startsWith('E:'))
    .map((r) => {
      const recent = r.log.filter((x) => x.d >= from);
      return { tag: r.tag, wrong: recent.filter((x) => !x.ok).length, right: recent.filter((x) => x.ok).length, total: r.log.filter((x) => !x.ok).length };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.wrong - a.wrong || b.total - a.total);
}

// ================= ĐỊNH DẠNG =================
// **đậm**, *tiếng Anh nghiêng*, ___ = chỗ trống. Escape trước để nội dung không chạy HTML.
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<em class="en">$1</em>');
const withBlank = (q, fill) => fmt(q).replace(/_{3,}/, `<span class="blank">${fill ? esc(fill) : '&nbsp;'}</span>`);
function ruleHtml(lines) {
  let out = '', list = false;
  for (const line of lines) {
    if (line.startsWith('- ')) { if (!list) { out += '<ul>'; list = true; } out += `<li>${fmt(line.slice(2))}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    out += `<p>${fmt(line)}</p>`;
  }
  return out + (list ? '</ul>' : '');
}
// So sánh có tính dấu câu: chỉ bỏ qua hoa/thường, khoảng trắng thừa, kiểu dấu nháy và dấu chấm cuối câu.
const strictNorm = (s) => String(s ?? '').toLowerCase().normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim().replace(/[.!?]+$/, '');
const speakBtn = (text, cls = '') => `<button class="speakbtn ${cls}" data-act="g-speak" data-text="${esc(text)}" aria-label="Nghe">${icon('speaker')}</button>`;
on('g-speak', (el) => speak(el.dataset.text, voice()));

const loadingCard = () => G.state === 'error'
  ? `<div class="banner">${icon('info')}<span>${esc(G.error)}</span></div>`
  : `<div class="card" style="display:flex;gap:12px;align-items:center"><div class="spin"></div><span class="muted">Đang tải nội dung ngữ pháp…</span></div>`;

const ring = (value, goal) => {
  const c = 2 * Math.PI * 24;
  const p = goal ? Math.min(1, value / goal) : 0;
  return `<svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="24"/><circle class="fg" cx="30" cy="30" r="24" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
};

// ================= TRANG NGỮ PHÁP =================
export function grammarView() {
  const head = `<header class="top"><div><p class="eyebrow">Khoá học</p><h1>Ngữ pháp</h1></div>
    <button class="iconbtn tonal" data-act="go" data-to="#/gerrors" aria-label="Sổ lỗi">${icon('list')}</button></header>${learnSwitch('grammar')}`;
  if (G.state !== 'ready') return `<div class="page">${head}${loadingCard()}</div>`;

  const goal = S.settings.grammarPerDay;
  const doneToday = todayLessons();
  const next = nextLesson();
  const due = gDueCount();
  const placed = rec('placement');
  const nextUnit = next && G.units.get(next.unitId);
  const resume = next && inProgress(next.id) ? lessonRec(next.id) : null;
  const active = activeCourse();

  const todayCard = `<div class="card">
    <div class="row-between"><div style="min-width:0"><p class="small muted">${goal ? `Hôm nay: ${doneToday}/${goal} bài` : `Hôm nay: ${doneToday} bài`}</p>
      ${next ? `<b style="font-size:19px;display:block;margin-top:2px">${esc(next.title)}</b><p class="small muted">${esc(G.courses.get(next.courseId).title)} · Unit ${esc(nextUnit.no)}: ${esc(nextUnit.title)}</p>` : '<b style="font-size:19px">Bạn đã học hết các khoá hiện có</b>'}</div>
      ${goal ? ring(doneToday, goal) : ''}</div>
    ${next ? `<button class="btn" style="margin-top:16px" data-act="g-start" data-id="${next.id}">${resume ? `Tiếp tục · bước ${resume.step + 1}/6` : 'Học bài tiếp theo'}</button>` : ''}
    ${due ? `<button class="btn soft" style="margin-top:10px" data-act="g-cards">${icon('review', 'sm')} Ôn ${due} thẻ mẫu câu</button>` : ''}
  </div>`;

  const placement = placed
    ? ''
    : `<button class="listlink" data-act="g-test" style="margin-top:12px"><span class="lead">${icon('check')}</span><span class="body"><b>Kiểm tra đầu vào</b><small>30 câu, khoảng 10 phút, để biết nên bắt đầu từ đâu</small></span>${icon('chev')}</button>`;

  const courses = COURSES.map((c) => {
    if (c.soon) return `<div class="listlink soon" aria-disabled="true"><span class="lead">${icon('learn')}</span><span class="body"><b>${esc(c.title)}</b><small>${esc(c.level)} · sắp có</small></span></div>`;
    const course = G.courses.get(c.id);
    const p = progressOf(courseLessons(c.id));
    // Chỉ khoá đang học mở danh sách unit; khoá khác thu gọn để trang không quá dài.
    if (c.id !== active) {
      return `<div class="card"><div class="row-between"><div style="min-width:0"><b style="font-size:18px">${esc(c.title)}</b><p class="small muted">${esc(c.level)} · ${course.units.length} unit · ${p.done}/${p.total} bài</p></div>
        <button class="btn ghost sm" data-act="g-course" data-id="${c.id}">${p.done ? 'Học tiếp' : 'Học khoá này'}</button></div>
        <div class="mini-bar"><i style="width:${(p.done / p.total) * 100}%"></i></div></div>`;
    }
    const units = course.units.map((u) => {
      const p = progressOf(u.lessons.map((l) => l.id));
      return `<div class="wrow" data-act="go" data-to="#/gunit/${u.id}">
        <span class="num ${p.done === p.total ? 'done' : ''}">${p.done === p.total ? icon('check', 'sm') : esc(u.no)}</span>
        <div class="body"><span style="font-weight:600">${esc(u.title)}</span><p>${p.done}/${p.total} bài</p></div>${icon('chev')}</div>`;
    }).join('');
    return `<div class="card" style="padding-bottom:6px"><div class="row-between"><div><b style="font-size:18px">${esc(c.title)}</b><p class="small muted">${esc(c.level)} · ${p.done}/${p.total} bài</p></div><span class="tag">Đang học</span></div>
      <div class="mini-bar"><i style="width:${(p.done / p.total) * 100}%"></i></div>
      <div class="wlist flat" style="margin:12px -18px 0">${units}</div></div>`;
  }).join('');

  return `<div class="page">${head}${todayCard}${placement}
    <h2>Khoá học</h2>${courses}
    ${placed ? `<button class="btn ghost" style="margin-top:14px" data-act="g-test">Làm lại bài kiểm tra đầu vào</button>` : ''}
  </div>`;
}

on('g-course', async (el) => {
  await saveSettings({ grammarCourse: el.dataset.id });
  toast(`Đang học khoá ${G.courses.get(el.dataset.id).title}`);
  rerender(true);
});

export function unitView(id) {
  const u = G.units.get(id);
  if (G.state !== 'ready') return `<div class="page">${navBar('Unit', { fallback: '#/grammar' })}${loadingCard()}</div>`;
  if (!u) return `<div class="page">${navBar('Unit', { fallback: '#/grammar' })}<div class="empty"><p>Không tìm thấy unit này.</p></div></div>`;
  const firstOpen = u.lessons.find((l) => !isDone(l.id));
  const rows = u.lessons.map((l, i) => {
    const r = rec('L:' + l.id);
    const state = r?.done ? 'done' : l === firstOpen ? 'cur' : '';
    const sub = r?.done ? `Đã học · đúng ${r.best}%` : inProgress(l.id) ? `Đang học · bước ${r.step + 1}/6` : `${l.items.length} câu luyện`;
    return `<div class="wrow" data-act="g-start" data-id="${l.id}">
      <span class="num ${state}">${r?.done ? icon('check', 'sm') : i + 1}</span>
      <div class="body"><span style="font-weight:600">${esc(l.title)}</span><p>${sub}</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<div class="page">${navBar(`Unit ${u.no}`, { fallback: '#/grammar' })}
    <h1 style="font-size:26px;margin:0 2px 6px">${esc(u.title)}</h1>
    ${u.goal ? `<p class="muted" style="margin:0 2px 14px">Mục tiêu: ${esc(u.goal)}</p>` : ''}
    <div class="wlist" style="margin-top:0">${rows}</div></div>`;
}

// ================= BÀI HỌC 6 BƯỚC =================
const STEPS = ['Khởi động', 'Quy tắc', 'Ví dụ', 'Luyện tập', 'Sửa lỗi', 'Tự đặt câu'];
const W = 0, RULE = 1, EX = 2, PRAC = 3, FIX = 4, WRITE = 5, DONE = 6;
let ls = null;

function startLesson(id, fromStart = false) {
  const lesson = G.lessons.get(id);
  if (!lesson) return toast('Không tìm thấy bài này');
  const r = lessonRec(id);
  const practice = lesson.items.filter((i) => i.t !== 'fix');
  const fixes = lesson.items.filter((i) => i.t === 'fix');
  const warm = lesson.items.filter((i) => i.t === 'mc').slice(0, 2);
  ls = { lesson, practice, fixes, warm, step: W, pos: 0, right: 0, wrong: 0, warmRight: 0, redo: r.done, item: null, sentences: [], result: null };
  // Thoát giữa chừng rồi vào lại → tiếp tục đúng bước đang làm.
  if (!fromStart && !r.done && (r.step > 0 || r.pos > 0)) Object.assign(ls, { step: r.step, pos: r.pos, right: r.right, wrong: r.wrong });
  skipEmpty();
  prepare();
  go('#/glesson/' + id);
}

const stepItems = () => (ls.step === W ? ls.warm : ls.step === PRAC ? ls.practice : ls.step === FIX ? ls.fixes : null);
function skipEmpty() {
  while (ls.step < DONE) {
    const items = stepItems();
    if (items && ls.pos >= items.length) { ls.step++; ls.pos = 0; continue; }
    if (ls.step === WRITE && !ls.lesson.write) { ls.step++; continue; }
    break;
  }
}
function prepare() {
  const items = stepItems();
  const it = items?.[ls.pos];
  ls.item = it ? { it, answered: false, correct: null, choice: null, input: '', order: it.t === 'mc' ? shuffledIdx(it.opts.length) : null } : null;
}
const shuffledIdx = (n) => {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const save = () => gPut({ ...lessonRec(ls.lesson.id), step: ls.step, pos: ls.pos, right: ls.right, wrong: ls.wrong });

async function grade(correct) {
  const st = ls.item;
  if (!st || st.answered) return;
  st.answered = true;
  st.correct = correct;
  if (ls.step === W) { if (correct) ls.warmRight++; }
  else {
    if (correct) ls.right++; else ls.wrong++;
    await logError(st.it.tag, correct);
  }
  await save();
  rerender();
}

async function nextItem() {
  ls.pos++;
  skipEmpty();
  if (ls.step === DONE) return finish();
  prepare();
  await save();
  rerender(true);
}
async function nextStep(to = ls.step + 1) {
  ls.step = to;
  ls.pos = 0;
  skipEmpty();
  if (ls.step === DONE) return finish();
  prepare();
  await save();
  rerender(true);
}

async function finish() {
  const { lesson } = ls;
  const r = lessonRec(lesson.id);
  const t = today();
  const total = ls.right + ls.wrong;
  const pct = total ? Math.round((ls.right / total) * 100) : 100;
  const recs = [];
  let created = 0;
  for (const c of lesson.cards || []) {
    const cur = rec('C:' + c.id);
    if (!cur) { recs.push({ id: 'C:' + c.id, cardId: c.id, srs: schedule(newSrs(), 'good', t) }); created++; }
    // Học lại mà vẫn sai → thẻ mẫu câu của bài quay về "đến hạn hôm nay".
    else if (ls.wrong && cur.srs.due > t) recs.push({ ...cur, srs: { ...cur.srs, due: t } });
  }
  await gPut({ ...r, step: 0, pos: 0, right: 0, wrong: 0, done: true, doneAt: r.doneAt || t, best: Math.max(r.best || 0, pct), sentences: [...(r.sentences || []), ...ls.sentences].slice(-20) }, ...recs);
  await logGrammarDay('gLessons', lesson.id);
  ls.step = DONE;
  ls.result = { pct, total, created, first: !r.done };
  rerender(true);
  countUp(document.getElementById('view'));
  confetti({ count: pct >= 80 ? 110 : 60 });
}

on('g-start', (el) => startLesson(el.dataset.id, el.dataset.fresh === '1'));
on('gl-quit', () => { const to = ls ? `#/gunit/${ls.lesson.unitId}` : '#/grammar'; ls = null; go(to); });
on('gl-next', () => nextItem());
on('gl-step', (el) => nextStep(el.dataset.to ? Number(el.dataset.to) : undefined));
on('gl-mc', (el) => { if (!ls.item.answered) { ls.item.choice = Number(el.dataset.i); grade(ls.item.choice === ls.item.it.a); } });
on('gl-tf', (el) => { if (!ls.item.answered) { ls.item.choice = el.dataset.v === 'true'; grade(ls.item.choice === ls.item.it.a); } });
on('gl-check', () => {
  const st = ls?.item;
  if (!st || st.answered) return;
  const input = document.querySelector('.answer-input');
  const value = (input?.value || '').trim();
  if (!value) { toast('Hãy nhập câu trả lời trước'); input?.focus(); return; }
  st.input = value;
  // Câu sửa dấu câu ("strict") được so cả dấu câu; các câu khác bỏ qua hoa/thường, dấu câu, khoảng trắng.
  const nz = st.it.strict ? strictNorm : norm;
  // Bài sửa lỗi: để nguyên câu gốc thì luôn tính là chưa sửa.
  const untouched = st.it.t === 'fix' && strictNorm(value) === strictNorm(st.it.q);
  grade(!untouched && st.it.a.some((a) => nz(a) === nz(value)));
});
on('gl-write', () => {
  const ta = document.querySelector('#gl-write');
  const text = (ta?.value || '').trim();
  const w = ls.lesson.write;
  if (text.split(/\s+/).filter(Boolean).length < 3) { toast('Câu quá ngắn — hãy viết ít nhất 3 từ'); ta?.focus(); return; }
  if (w.must?.length && !w.must.some((re) => new RegExp(re, 'i').test(text))) { toast(w.hint || 'Câu chưa dùng mẫu của bài'); ta?.focus(); return; }
  ls.sentences.push(text);
  ls.written = text;
  rerender();
});
on('gl-write-skip', () => nextStep(DONE));
on('gl-finish', () => nextStep(DONE));
on('gl-next-lesson', () => {
  const n = nextLesson();
  ls = null;
  if (n) startLesson(n.id); else go('#/grammar');
});

function itemView(st) {
  const { it } = st;
  const label = { mc: 'Chọn đáp án đúng', fill: 'Điền vào chỗ trống', tf: 'Câu này đúng hay sai?', fix: 'Câu này có lỗi — sửa lại cho đúng' }[it.t];
  let q, input = '';
  if (it.t === 'mc') {
    q = `<p class="sentence">${withBlank(it.q, st.answered ? it.opts[it.a] : '')}</p>`;
    input = `<div class="options">${st.order.map((i) => {
      let cls = '';
      if (st.answered) cls = i === it.a ? 'right' : i === st.choice ? 'wrong' : 'dim';
      return `<button class="opt ${cls}" data-act="gl-mc" data-i="${i}" ${st.answered ? 'disabled' : ''}><span class="en">${fmt(it.opts[i])}</span>${cls === 'right' ? icon('check') : cls === 'wrong' ? icon('x') : ''}</button>`;
    }).join('')}</div>`;
  } else if (it.t === 'tf') {
    q = `<p class="sentence">${fmt(it.q)}</p>`;
    const b = (v, text) => {
      let cls = '';
      if (st.answered) cls = v === it.a ? 'right' : v === st.choice ? 'wrong' : 'dim';
      return `<button class="opt ${cls}" data-act="gl-tf" data-v="${v}" ${st.answered ? 'disabled' : ''}>${text}</button>`;
    };
    input = `<div class="tf">${b(true, 'Đúng')}${b(false, 'Sai')}</div>`;
  } else if (it.t === 'fill') {
    q = `<p class="sentence">${withBlank(it.q, st.answered ? it.a[0] : '')}</p>${it.hint ? `<p class="muted small" style="margin-top:10px;text-align:left">Gợi ý: ${fmt(it.hint)}</p>` : ''}`;
    input = st.answered
      ? `<input class="answer-input" value="${esc(st.input)}" disabled>`
      : `<form data-submit="gl-check"><input class="answer-input" placeholder="Từ cần điền" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"></form>`;
  } else {
    q = `<p class="sentence">${fmt(it.q)}</p>`;
    input = st.answered
      ? `<textarea class="answer-input fix" rows="3" disabled>${esc(st.input)}</textarea>`
      : `<textarea class="answer-input fix" rows="3" autocapitalize="sentences" autocorrect="off" spellcheck="false">${esc(it.q)}</textarea><p class="small faint" style="margin-top:6px">Sửa trực tiếp trong ô, rồi bấm Kiểm tra.</p>`;
  }
  let fb = '';
  if (st.answered) {
    const answer = it.t === 'mc' ? it.q.includes('___') ? it.q.replace(/_{3,}/, it.opts[it.a]) : it.opts[it.a]
      : it.t === 'fill' ? it.q.replace(/_{3,}/, it.a[0]).replace(/\s*\([^)]*\)/, '')
      : it.t === 'tf' ? it.a ? it.q : it.fix : it.a[0];
    fb = `<div class="feedback ${st.correct ? 'ok' : 'no'}"><b class="t">${icon(st.correct ? 'check' : 'x', 'sm')} ${st.correct ? 'Chính xác' : 'Chưa đúng'}</b>
      ${!st.correct || it.t === 'tf' ? `<p class="en">${fmt(answer)}</p>` : ''}<p>${fmt(it.why)}</p></div>`;
  }
  return {
    body: `<p class="qlabel">${label}</p><div class="question" style="text-align:left;padding-top:4px">${q}</div>${input}${fb}`,
    actions: st.answered ? `<button class="btn" data-act="gl-next">Tiếp tục</button>`
      : it.t === 'fill' || it.t === 'fix' ? `<button class="btn" data-act="gl-check">Kiểm tra</button>` : '',
    focus: !st.answered && it.t === 'fill' ? '.answer-input' : null,
  };
}

function stepView() {
  const { lesson, step } = ls;
  if (step === RULE) {
    const skip = ls.warm.length && ls.warmRight === ls.warm.length && !ls.redo && ls.pos === 0;
    return {
      body: `<h2 class="lesson-title">${esc(lesson.title)}</h2><div class="card rule">${ruleHtml(lesson.rule)}</div>
        ${skip ? `<div class="banner info" style="margin-top:12px">${icon('check')}<span>Bạn trả lời đúng cả ${ls.warm.length} câu khởi động. Có thể đọc lướt quy tắc rồi vào luyện tập luôn.</span></div>` : ''}`,
      actions: skip ? `<div class="btn-row"><button class="btn ghost" data-act="gl-step" data-to="${PRAC}">Vào luyện tập</button><button class="btn" data-act="gl-step">Xem ví dụ</button></div>`
        : `<button class="btn" data-act="gl-step">Xem ví dụ</button>`,
    };
  }
  if (step === EX) {
    return {
      body: `<div class="card">${lesson.examples.map((e) => `<div class="ex-row"><div style="flex:1;min-width:0"><p class="en">${fmt(e.en)}</p><small>${fmt(e.vi)}</small></div>${speakBtn(e.en.replace(/\*/g, ''), 'sm')}</div>`).join('')}</div>`,
      actions: `<button class="btn" data-act="gl-step">Bắt đầu luyện tập</button>`,
    };
  }
  if (step === WRITE) {
    const w = lesson.write;
    if (!ls.written) {
      return {
        body: `<div class="card"><p style="font-weight:600">${fmt(w.prompt)}</p></div>
          <textarea id="gl-write" class="input" rows="4" style="margin-top:12px" placeholder="Viết câu tiếng Anh của bạn…" autocapitalize="sentences"></textarea>`,
        actions: `<div class="btn-row"><button class="btn ghost" data-act="gl-write-skip" style="flex:.6">Bỏ qua</button><button class="btn" data-act="gl-write">Lưu câu</button></div>`,
        focus: '#gl-write',
      };
    }
    return {
      body: `<p class="qlabel">Tự so với câu mẫu</p>
        <div class="feedback ok"><b class="t">${icon('check', 'sm')} Câu của bạn</b><p class="en">${esc(ls.written)}</p></div>
        <div class="card" style="margin-top:12px"><p class="small muted" style="margin-bottom:6px">Câu mẫu</p>${w.samples.map((s) => `<div class="ex-row"><p class="en" style="flex:1">${fmt(s)}</p>${speakBtn(s.replace(/\*/g, ''), 'sm')}</div>`).join('')}</div>
        ${w.check?.length ? `<div class="card" style="margin-top:12px"><p class="small muted" style="margin-bottom:6px">Tự kiểm tra câu của bạn</p><ul class="checks">${w.check.map((c) => `<li>${fmt(c)}</li>`).join('')}</ul></div>` : ''}`,
      actions: `<button class="btn" data-act="gl-finish">Hoàn thành bài</button>`,
    };
  }
  return null;
}

function doneView() {
  const { lesson, result } = ls;
  const n = nextLesson();
  return `<div class="page session"><div class="ses-body" style="justify-content:center">
    <div class="empty"><div class="art pop">${icon('check')}</div><h3>Xong bài “${esc(lesson.title)}”</h3>
      ${result.total ? `<div class="result-big" data-count="${result.pct}" data-suffix="%">${result.pct}%</div><p class="muted" style="margin-top:6px">câu luyện trả lời đúng</p>` : ''}
      ${result.created ? `<div class="cheer">${icon('review', 'sm')} Thêm ${result.created} thẻ mẫu câu vào lịch ôn</div>` : ''}
      ${result.pct < 60 && result.total ? `<p class="small muted" style="margin-top:12px">Nên học lại bài này vào ngày mai.</p>` : ''}
    </div></div>
    <div class="ses-actions stack">
      ${n ? `<button class="btn" data-act="gl-next-lesson">Bài tiếp theo: ${esc(n.title)}</button>` : ''}
      <button class="btn ${n ? 'ghost' : ''}" data-act="gl-quit">Xong</button>
    </div></div>`;
}

export function lessonView(id) {
  if (!ls || ls.lesson.id !== id) { setTimeout(() => replace(id && G.lessons.has(id) ? `#/gunit/${G.lessons.get(id).unitId}` : '#/grammar')); return ''; }
  if (ls.step === DONE) return doneView();
  const v = ls.item ? itemView(ls.item) : stepView();
  const items = stepItems();
  const frac = (ls.step + (items?.length ? ls.pos / items.length : 0)) / 6;
  const pct = Math.round(frac * 100);
  const from = ls.shownPct ?? pct;
  ls.shownPct = pct;
  return {
    html: `<div class="page session">
      <div class="ses-top"><button class="iconbtn" data-act="gl-quit" aria-label="Thoát">${icon('x')}</button>
        <div class="progress"><i style="width:${pct}%;--from:${from}%"></i></div>
        <span class="count">${ls.step + 1}/6</span></div>
      <p class="mode-label">${esc(STEPS[ls.step])}${items?.length ? ` · ${ls.pos + 1}/${items.length}` : ''}</p>
      <div class="ses-body">${v.body}</div>
      <div class="ses-actions">${v.actions}</div></div>`,
    focus: v.focus,
  };
}

// ================= THẺ MẪU CÂU =================
let cs = null;
export function startCards() {
  const ids = gDueCards().slice(0, S.settings.grammarReviewPerDay).map((r) => r.cardId);
  if (!ids.length) return toast('Chưa có thẻ mẫu câu nào đến hạn');
  cs = { queue: ids, total: ids.length, done: 0, flipped: false, finished: false, startedAt: Date.now() };
  go('#/gcards');
}
on('g-cards', () => startCards());
on('gc-flip', async () => {
  if (!cs) return;
  const el = document.querySelector('.flash');
  if (el && motionOK()) { el.classList.add(cs.flipped ? 'out-b' : 'out-f'); await wait(150); }
  cs.flipped = !cs.flipped;
  cs.seen = true;
  rerender();
});
on('gc-rate', async (el) => {
  if (!cs || cs.busy) return;
  cs.busy = true;
  try {
    const rating = el.dataset.rating;
    const id = cs.queue[0];
    const r = rec('C:' + id);
    const card = document.querySelector('.flash');
    if (card && motionOK()) {
      const x = rating === 'again' ? -1 : rating === 'easy' ? 1 : 0;
      card.classList.add('still');
      card.style.transition = 'transform .2s ease-in, opacity .2s ease-in';
      card.style.transform = x ? `translateX(${x * 120}%) rotate(${x * 14}deg)` : 'translateY(-70%) scale(.94)';
      card.style.opacity = '0';
      await wait(190);
    }
    await gPut({ ...r, srs: schedule(r.srs, rating, today()) });
    await logGrammarDay('gReviews', id);
    cs.queue.shift();
    if (rating === 'again') cs.queue.push(id); else cs.done++;
    cs.flipped = false;
    cs.seen = false;
    if (!cs.queue.length) cs.finished = true;
    rerender(true);
    if (cs.finished) confetti({ count: 70 });
  } finally { if (cs) cs.busy = false; }
});
on('gc-quit', () => { cs = null; go('#/grammar'); });

export function cardsView() {
  if (!cs) { setTimeout(() => replace('#/grammar')); return ''; }
  if (cs.finished) {
    return `<div class="page session"><div class="ses-body" style="justify-content:center"><div class="empty"><div class="art pop">${icon('check')}</div>
      <h3>Đã ôn ${cs.total} thẻ mẫu câu</h3><p>Hệ thống sẽ đưa thẻ trở lại đúng lúc bạn sắp quên.</p></div></div>
      <div class="ses-actions"><button class="btn" data-act="gc-quit">Xong</button></div></div>`;
  }
  const card = G.cards.get(cs.queue[0]);
  const r = rec('C:' + card.id);
  const lesson = G.lessons.get(card.lessonId);
  const pct = Math.round((cs.done / cs.total) * 100);
  const body = !cs.flipped
    ? `<div class="flash ${cs.seen ? 'turn' : ''}" data-act="gc-flip" role="button" aria-label="Lật thẻ"><div class="front">
        <span class="tag">Mẫu câu · ${esc(lesson.title)}</span><div class="vi" style="margin-top:6px">${fmt(card.front)}</div></div>
        <p class="hint">Tự nói một câu, rồi chạm để xem mẫu</p></div>`
    : `<div class="flash back" data-act="gc-flip" role="button" aria-label="Lật lại">
        <span class="tag">${esc(lesson.title)}</span>
        <p class="meaning" style="margin-top:12px">${fmt(card.pattern)}</p>
        <div class="ex-row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:14px"><div style="flex:1;min-width:0"><p class="en">${fmt(card.example)}</p>${card.vi ? `<small>${fmt(card.vi)}</small>` : ''}</div>${speakBtn(card.example.replace(/\*/g, ''), 'sm')}</div>
        <p class="hint" style="margin-top:auto;padding-top:18px">Chạm để lật lại</p></div>`;
  const hint = (x) => fmtInterval(preview(r.srs, x));
  return `<div class="page session">
    <div class="ses-top"><button class="iconbtn" data-act="gc-quit" aria-label="Thoát">${icon('x')}</button>
      <div class="progress"><i style="width:${pct}%"></i></div><span class="count">${Math.min(cs.done + 1, cs.total)}/${cs.total}</span></div>
    <p class="mode-label">Ôn thẻ mẫu câu</p>
    <div class="ses-body">${body}</div>
    <div class="ses-actions">${cs.flipped ? `<div class="rate">
      <button class="again" data-act="gc-rate" data-rating="again">Quên<small>ôn lại ngay</small></button>
      <button class="hard" data-act="gc-rate" data-rating="hard">Khó<small>${hint('hard')}</small></button>
      <button class="easy" data-act="gc-rate" data-rating="easy">Dễ<small>${hint('easy')}</small></button></div>`
      : `<button class="btn ghost" data-act="gc-flip">Xem mẫu câu</button>`}</div></div>`;
}

// ================= SỔ LỖI =================
export function errorsView() {
  if (G.state !== 'ready') return `<div class="page">${navBar('Sổ lỗi', { fallback: '#/grammar' })}${loadingCard()}</div>`;
  const list = errorStats();
  const rows = list.map((x) => {
    const tag = G.tags[x.tag] || { name: x.tag };
    const lesson = tag.lesson && G.lessons.get(tag.lesson);
    const hot = x.wrong >= 3;
    return `<div class="card">
      <div class="row-between" style="align-items:flex-start"><div style="min-width:0"><b>${esc(tag.name)}</b>
        <p class="small muted">7 ngày qua: ${x.wrong} lần sai · ${x.right} lần đúng · tổng ${x.total} lần sai</p></div>
        ${hot ? '<span class="tag warn">Cần ôn</span>' : ''}</div>
      ${lesson ? `<button class="btn ${hot ? '' : 'ghost'} sm" style="margin-top:12px" data-act="g-start" data-id="${lesson.id}" data-fresh="1">Học lại: ${esc(lesson.title)}</button>` : ''}
    </div>`;
  }).join('');
  return `<div class="page">${navBar('Sổ lỗi', { fallback: '#/grammar' })}
    <p class="muted small" style="margin:0 2px 12px">Mỗi câu sai trong bài học được ghi theo loại lỗi. Loại nào sai từ 3 lần trong 7 ngày sẽ được đánh dấu cần ôn.</p>
    ${rows || `<div class="card empty"><div class="art">${icon('check')}</div><h3>Chưa có lỗi nào</h3><p>Làm bài ngữ pháp, các câu sai sẽ được ghi lại ở đây.</p></div>`}</div>`;
}

// ================= KIỂM TRA ĐẦU VÀO =================
let pt = null;
on('g-test', () => {
  if (G.state !== 'ready') return toast('Nội dung chưa tải xong');
  pt = { items: G.placement.items, pos: 0, answers: [], order: shuffledIdx(G.placement.items[0].opts.length), result: null };
  go('#/gtest');
});
on('gt-answer', async (el) => {
  if (!pt || pt.result) return;
  const it = pt.items[pt.pos];
  pt.answers.push(el.dataset.i === 'x' ? false : Number(el.dataset.i) === it.a);
  pt.pos++;
  if (pt.pos < pt.items.length) { pt.order = shuffledIdx(pt.items[pt.pos].opts.length); rerender(true); return; }
  const bands = [1, 2, 3, 4].map((lvl) => {
    const idx = pt.items.map((x, i) => (x.lvl === lvl ? i : -1)).filter((i) => i >= 0);
    return idx.length ? Math.round((idx.filter((i) => pt.answers[i]).length / idx.length) * 100) : 0;
  });
  const pct = Math.round((pt.answers.filter(Boolean).length / pt.items.length) * 100);
  // Xếp lớp theo từng tầng: chưa vững tầng nào thì bắt đầu từ tầng đó.
  const course = bands[0] < 80 ? 'c1' : bands[1] < 70 ? 'c2' : bands[2] < 70 ? 'c3' : 'c4';
  // Unit gợi ý = unit của câu sai đầu tiên ở tầng đó (nếu khoá đã có trong app).
  const lvl = Number(course[1]);
  const wrong = pt.items.findIndex((x, i) => x.lvl === lvl && !pt.answers[i]);
  const unitId = G.courses.has(course) ? (pt.items[wrong]?.unit || G.courses.get(course).units[0].id) : '';
  pt.result = { pct, bands, course, unitId };
  await gPut({ id: 'placement', date: today(), pct, bands, course, unitId });
  // Đặt khoá đang học theo kết quả; khoá chưa có thì lấy khoá cao nhất đang có.
  const avail = loadedCourses().map((c) => c.id).filter((id) => id <= course);
  await saveSettings({ grammarCourse: avail[avail.length - 1] || '' });
  rerender(true);
});
on('gt-quit', () => { pt = null; go('#/grammar'); });

export function testView() {
  if (!pt) { setTimeout(() => replace('#/grammar')); return ''; }
  if (pt.result) {
    const { pct, bands, course, unitId } = pt.result;
    const c = COURSES.find((x) => x.id === course);
    const unit = unitId && G.units.get(unitId);
    return `<div class="page session"><div class="ses-body">
      <div class="empty" style="padding-bottom:16px"><div class="art pop">${icon('check')}</div><h3>Kết quả kiểm tra</h3>
        <div class="result-big">${pct}%</div><p class="muted" style="margin-top:6px">${pt.answers.filter(Boolean).length}/${pt.items.length} câu đúng</p></div>
      <div class="card">${bands.map((b, i) => `<div class="field"><div class="row-between"><span style="font-weight:600">${BANDS[i]}</span><span class="small muted">${b}%</span></div><div class="mini-bar"><i style="width:${b}%"></i></div></div>`).join('')}</div>
      <div class="card" style="margin-top:12px"><p class="small muted">Nên bắt đầu từ</p><b style="font-size:19px">Khoá ${esc(c.title)}${unit ? ` · Unit ${esc(unit.no)}` : ''}</b>
        <p class="small muted" style="margin-top:4px">${unit ? esc(unit.title) : c.soon ? `Khoá này sẽ có ở bản sau. Trong lúc chờ, app đặt bạn vào khoá ${esc(G.courses.get(activeCourse())?.title || '')}.` : ''}</p></div>
    </div>
    <div class="ses-actions stack">
      ${unit ? `<button class="btn" data-act="gt-go-unit" data-id="${unit.id}">Mở Unit ${esc(unit.no)}</button>` : ''}
      <button class="btn ${unit ? 'ghost' : ''}" data-act="gt-quit">Về trang Ngữ pháp</button></div></div>`;
  }
  const it = pt.items[pt.pos];
  const pctDone = Math.round((pt.pos / pt.items.length) * 100);
  return `<div class="page session">
    <div class="ses-top"><button class="iconbtn" data-act="gt-quit" aria-label="Thoát">${icon('x')}</button>
      <div class="progress"><i style="width:${pctDone}%"></i></div><span class="count">${pt.pos + 1}/${pt.items.length}</span></div>
    <p class="mode-label">Kiểm tra đầu vào</p>
    <div class="ses-body"><p class="qlabel">Chọn đáp án đúng</p><div class="question" style="text-align:left;padding-top:4px"><p class="sentence">${withBlank(it.q, '')}</p></div>
      <div class="options">${pt.order.map((i) => `<button class="opt" data-act="gt-answer" data-i="${i}"><span class="en">${fmt(it.opts[i])}</span></button>`).join('')}</div></div>
    <div class="ses-actions"><button class="btn ghost" data-act="gt-answer" data-i="x">Không biết, bỏ qua</button></div></div>`;
}
on('gt-go-unit', (el) => { pt = null; go('#/gunit/' + el.dataset.id); });

// ================= KHỐI DÙNG Ở TRANG KHÁC =================
/** Thẻ nhỏ ở tab Ôn tập. */
export function grammarReviewCard() {
  if (G.state !== 'ready') return '';
  const due = gDueCount();
  const total = [...S.grammar.keys()].filter((k) => k.startsWith('C:')).length;
  if (!total) return '';
  return `<button class="listlink" data-act="${due ? 'g-cards' : 'go'}" data-to="#/grammar" style="margin-top:12px"><span class="lead">${icon('learn')}</span>
    <span class="body"><b>${due ? `Ôn ${due} thẻ mẫu câu` : 'Thẻ mẫu câu ngữ pháp'}</b><small>${due ? 'Ngữ pháp · đến hạn hôm nay' : `${total} thẻ · chưa có thẻ đến hạn`}</small></span>${icon('chev')}</button>`;
}
