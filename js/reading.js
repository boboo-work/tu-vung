// Luyện Reading theo Linear thinking: làm câu hỏi (có hướng dẫn hoặc như thi),
// định vị câu trong bài, Simplify (gạch phần phụ), Read connection, main idea, lưu từ.
// Nội dung: content/reading/*.json, tạo bằng tools/reading_import.py từ bộ 3 file của người dùng.
import { S, rPut, rDel, readingResults, logGrammarDay, dayOf, saveWord, findByText, blankWord, recordAnswer, addDeck } from './store.js';
import { esc, toast, today, uid, addDays } from './util.js';
import { icon, on, go, back, replace, rerender, navBar, learnSwitch, confirmSheet, openSheet, closeSheet } from './ui.js';
import { lookupWord } from './lookup.js';
import { confetti } from './fx.js';

// ================= NỘI DUNG =================
export const R = { state: 'idle', error: '', tests: [], data: new Map(), loading: new Set() };

export async function loadReading() {
  if (R.state === 'loading' || R.state === 'ready') return;
  R.state = 'loading';
  try {
    const r = await fetch('content/reading/index.json');
    if (!r.ok) throw new Error(`index.json: ${r.status}`);
    R.tests = (await r.json()).tests || [];
    R.state = 'ready';
  } catch (e) {
    console.error(e);
    R.state = 'error';
    R.error = 'Chưa tải được nội dung Reading. Hãy mở app khi có mạng một lần để app lưu sẵn.';
  }
}
async function loadTest(t) {
  if (R.data.has(t.id) || R.loading.has(t.id)) return;
  R.loading.add(t.id);
  try {
    const r = await fetch(t.file);
    if (!r.ok) throw new Error(`${t.file}: ${r.status}`);
    R.data.set(t.id, await r.json());
  } catch (e) {
    console.error(e);
    toast('Chưa tải được bài đọc này. Kiểm tra kết nối mạng.');
  } finally {
    R.loading.delete(t.id);
    rerender();
  }
}
const metaOf = (pid) => {
  for (const t of R.tests) for (const p of t.passages) if (p.id === pid) return { t, p };
  return null;
};
/** Passage đầy đủ (đã tải) hoặc null — khi null thì tự tải rồi vẽ lại. */
function passageOf(pid) {
  const m = metaOf(pid);
  if (!m) return null;
  const test = R.data.get(m.t.id);
  if (!test) { loadTest(m.t); return null; }
  return { test, p: test.passages.find((x) => x.id === pid), meta: m };
}

// ================= DẠNG CÂU HỎI =================
export function qtype(g) {
  if (g.type === 'gap') return 'gap';
  if (g.items?.[0]?.multi) return 'mc2';
  if (/heading/i.test(g.instr)) return 'mhead';
  if (g.type === 'tf') return g.options?.[0]?.k === 'YES' ? 'ynng' : 'tfng';
  const i = g.instr.toLowerCase();
  if (/which (section|paragraph)/.test(i)) return 'minfo';
  if (/correct ending/.test(i)) return 'mend';
  if (/list of|match each/.test(i)) return 'mpeople';
  return 'mc';
}
export const TYPE_NAME = { tfng: 'True / False / Not Given', ynng: 'Yes / No / Not Given', gap: 'Điền từ', minfo: 'Tìm đoạn chứa thông tin', mpeople: 'Nối với người nói', mend: 'Nối đuôi câu', mc: 'Chọn đáp án', mc2: 'Chọn 2 đáp án', mhead: 'Nối tiêu đề đoạn' };
const flatItems = (p) => p.groups.flatMap((g) => g.items.map((it) => ({ g, it })));

const normAns = (s) => String(s).toLowerCase().replace(/[’']/g, "'").replace(/[.,;:!?"“”]+$/g, '').replace(/\s+/g, ' ').trim();
function check(g, it, v, answers = {}) {
  const val = normAns(v);
  if (!val) return { ok: false, note: '' };
  let ok = it.a.some((a) => normAns(a) === val);
  // "Chọn 2 đáp án": mỗi số câu nhận một đáp án đúng bất kỳ, không trùng với câu đi kèm.
  if (it.multi) ok = ok && !it.multi.filter((k) => k !== it.n).some((k) => normAns(answers[k]?.v || '') === val);
  let note = '';
  if (g.type === 'gap' && g.maxWords) {
    const ws = val.split(' ').filter((w) => !(g.number && /^\d[\d,.]*$/.test(w)));
    if (ws.length > g.maxWords) note = `Quá giới hạn ${g.limit}: bài thi sẽ tính sai.`;
  }
  // Khớp đáp án chuẩn thì tính đúng (đáp án chuẩn có thể dài hơn giới hạn, ví dụ "leaves and bark").
  return { ok, note: ok ? '' : note };
}

// ================= HIỂN THỊ VĂN BẢN =================
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/~~(.+?)~~/g, '<s>$1</s>')
  .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, '$1<em>$2</em>');
/** Markdown tối giản cho lời giải: đoạn văn, gạch đầu dòng, danh sách số, bảng. */
export function md(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (!l) { i++; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s|:-]+\|$/.test(r));
      out.push(`<div class="r-tablewrap"><table class="data r-table">${body.map((r, k) => `<tr>${cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('')}</table></div>`);
      continue;
    }
    if (/^[-*] /.test(l)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) { items.push(lines[i].trim().slice(2)); i++; }
      out.push(`<ul class="r-ul">${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\. /, '')); i++; }
      out.push(`<ol class="r-ol">${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`);
      continue;
    }
    const h = /^#{2,4}\s+(.+)$/.exec(l);
    out.push(h ? `<h4 class="r-h4">${inline(h[1])}</h4>` : `<p>${inline(l)}</p>`);
    i++;
  }
  return out.join('');
}
const words = (s) => esc(s).split(/(\s+)/).map((t) => (/\S/.test(t) ? `<span class="w">${t}</span>` : t)).join('');
/** Bài đọc. mode: 'read' (chạm từ để lưu) · 'loc' (chạm câu để định vị) · marks: { "p-s": "ok"|"no"|"hint" }. */
function passageHtml(p, { mode = 'read', marks = {} } = {}) {
  const head = `<div class="r-title">${esc(p.title)}</div>${p.subtitle ? `<p class="r-sub">${esc(p.subtitle)}</p>` : ''}`;
  const body = p.paras.map((pa, pi) => `<div class="r-para"><span class="r-label">${esc(pa.label)}</span><p>${pa.sents.map((s, si) => {
    const k = `${pi}-${si}`;
    const cls = marks[k] ? ` mark-${marks[k]}` : '';
    return mode === 'loc'
      ? `<span class="rs pick${cls}" data-act="r-loc" data-p="${pi}" data-s="${si}"><sup>${CIRC[si] || si + 1}</sup>${esc(s)}</span>`
      : `<span class="rs${cls}" data-p="${pi}" data-s="${si}"><sup>${CIRC[si] || si + 1}</sup>${words(s)}</span>`;
  }).join(' ')}</p></div>`).join('');
  const foot = p.footnote?.length ? `<p class="small muted r-foot">${p.footnote.map(esc).join('<br>')}</p>` : '';
  return `<div class="r-passage" ${mode === 'read' ? 'data-act="r-word"' : ''} data-title="${esc(p.title)}">${head}${body}${foot}</div>`;
}
const sentOf = (p, [pi, si]) => p.paras[pi]?.sents[si] || '';
const locName = (p, [pi, si]) => `đoạn ${p.paras[pi].label}${CIRC[si] || si + 1}`;
const simpFor = (p, [pi, si]) => p.paras[pi]?.simp.find((x) => x.idx.includes(si));

// ================= TRẠNG THÁI =================
export const todayReading = () => (dayOf().rPassages || []).length;
const resultsOf = (pid) => readingResults().filter((r) => r.pid === pid).sort((a, b) => (a.at < b.at ? 1 : -1));
const bestOf = (pid) => resultsOf(pid).reduce((m, r) => Math.max(m, r.score), -1);
/** Passage kế tiếp: chưa làm lần nào, theo thứ tự trong thư viện. */
export function nextPassage() {
  if (R.state !== 'ready') return null;
  for (const t of R.tests) for (const p of t.passages) if (!resultsOf(p.id).length) return p;
  return null;
}
export const readingDraft = (pid) => S.reading.get(`draft:${pid}`);

let rs = null; // phiên làm bài đang mở
let tick = null;
const EXAM_MS = 20 * 60e3;

function startSession(pid, mode, resume = false, { placement = false } = {}) {
  const x = passageOf(pid);
  if (!x?.p) return toast('Bài đọc chưa tải xong');
  const d = resume ? readingDraft(pid) : null;
  rs = {
    pid, mode: d?.mode || mode, title: x.p.title, items: flatItems(x.p), pos: d?.pos || 0,
    answers: d?.answers || {}, startedAt: Date.now() - (Number(d?.spent) || 0), step: 'q', tab: 'q',
    pick: null, strike: new Set(), checked: false, reveal: false, limit: EXAM_MS, placement: placement || !!d?.placement,
  };
  if (!resume) rDel(`draft:${pid}`).catch(() => {});
  go('#/rrun');
  if (rs.mode === 'exam') startTick();
}
function saveDraft() {
  if (!rs) return;
  rPut({ id: `draft:${rs.pid}`, kind: 'draft', pid: rs.pid, mode: rs.mode, pos: rs.pos, answers: rs.answers, spent: Date.now() - rs.startedAt, at: today(), placement: rs.placement, full: rs.full ? { tid: rs.full.tid, pi: rs.full.pi } : null }).catch(() => {});
}
const mmss = (ms) => { const s = Math.floor(Math.abs(ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function timerState() {
  const left = (rs.limit || EXAM_MS) - (Date.now() - rs.startedAt);
  return { text: left >= 0 ? mmss(left) : '+' + mmss(left), cls: 'w-timer' + (left < 0 ? ' over' : left < 3 * 60e3 ? ' low' : '') };
}
function paintTimer() {
  if (!rs || rs.mode !== 'exam') { clearInterval(tick); tick = null; return; }
  const el = document.getElementById('r-timer');
  if (el) { const t = timerState(); el.textContent = t.text; el.className = t.cls; }
}
function startTick() { clearInterval(tick); tick = setInterval(paintTimer, 1000); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveDraft(); else paintTimer(); });

// ---- Hành động ----
on('r-start', (el) => startSession(el.dataset.p, el.dataset.mode, el.dataset.resume === '1'));
on('r-quit', async () => {
  if (rs && Object.keys(rs.answers).length) saveDraft();
  clearInterval(tick); tick = null;
  const pid = rs?.full ? null : rs?.pid;
  rs = null;
  back(pid ? `#/rpassage/${pid}` : '#/reading');
});
on('r-tab', (el) => { if (rs) { rs.tab = el.dataset.t; rerender(true); } });
const cur = () => rs.items[rs.pos];
const WIDE = matchMedia('(min-width: 1000px)');
let scrolledFor = '';
/** Màn rộng: cuộn bài đọc bên trái tới câu chứa thông tin (mỗi bước một lần). */
function scrollToMark(key) {
  if (!WIDE.matches || scrolledFor === key) return;
  scrolledFor = key;
  setTimeout(() => document.querySelector('.split-l .mark-hint, .split-l .mark-ok')?.scrollIntoView({ block: 'center' }), 60);
}
const answeredCount = () => rs.items.filter(({ it }) => String(rs.answers[it.n]?.v || '').trim()).length;
function paintCount() {
  const n = answeredCount();
  const tab = document.querySelector('.r-tabs [data-t="q"]');
  if (tab) tab.textContent = `Câu hỏi · ${n}/${rs.items.length}`;
  const bar = document.querySelector('.ses-top .progress i');
  if (bar) bar.style.width = `${Math.round((n / rs.items.length) * 100)}%`;
}

// Có hướng dẫn: câu hỏi → định vị → Simplify → trả lời → giải thích.
on('r-step', (el) => { if (rs) { rs.step = el.dataset.to; rs.checked = false; rs.reveal = false; rs.strike = new Set(); rerender(true); } });
on('r-loc', (el) => {
  if (!rs || rs.step !== 'loc' || rs.pick) return;
  const { it } = cur();
  const at = [Number(el.dataset.p), Number(el.dataset.s)];
  const ok = it.loc.some(([a, b]) => a === at[0] && b === at[1]);
  rs.pick = { at, ok };
  rs.answers[it.n] = { ...(rs.answers[it.n] || {}), loc: ok };
  rerender();
});
on('r-strike', (el) => {
  if (!rs || rs.checked) return;
  const k = Number(el.dataset.k);
  if (rs.strike.has(k)) rs.strike.delete(k); else rs.strike.add(k);
  el.classList.toggle('struck');
});
on('r-strike-check', () => { if (rs) { rs.checked = true; rs.reveal = true; rerender(); } });
on('r-reveal', () => { if (rs) { rs.reveal = true; rerender(); } });

function answerGuided(v) {
  const { g, it } = cur();
  const r = check(g, it, v, rs.answers);
  rs.answers[it.n] = { ...(rs.answers[it.n] || {}), v, ok: r.ok, note: r.note, type: qtype(g) };
  rs.step = 'fb';
  saveDraft();
  rerender(true);
}
on('r-pick', (el) => {
  if (!rs) return;
  if (rs.mode === 'exam') {
    const n = el.dataset.n;
    rs.answers[n] = { v: el.dataset.v };
    el.parentElement.querySelectorAll('[data-act="r-pick"]').forEach((b) => b.classList.toggle('on', b === el));
    paintCount();
    saveDraft();
    return;
  }
  if (rs.step === 'ans') answerGuided(el.dataset.v);
});
on('r-gap', (el) => {
  if (!rs) return;
  if (rs.mode === 'exam') { rs.answers[el.dataset.n] = { v: el.value }; paintCount(); saveDraft(); }
});
on('r-gap-check', () => {
  const inp = document.getElementById('r-gap-in');
  const v = (inp?.value || '').trim();
  if (!v) { toast('Hãy điền câu trả lời'); inp?.focus(); return; }
  answerGuided(v);
});
on('r-next', async () => {
  if (!rs) return;
  if (rs.pos < rs.items.length - 1) {
    rs.pos++; rs.step = 'q'; rs.pick = null; rs.checked = false; rs.reveal = false; rs.strike = new Set();
    saveDraft();
    rerender(true);
  } else await finish();
});
on('r-submit', async () => {
  if (!rs) return;
  const left = rs.items.filter(({ it }) => !String(rs.answers[it.n]?.v || '').trim()).length;
  if (left && !(await confirmSheet({ title: `Còn ${left} câu chưa trả lời`, body: 'Nộp bài luôn? Câu bỏ trống tính là sai.', okLabel: 'Nộp bài' }))) return;
  for (const { g, it } of rs.items) {
    const v = rs.answers[it.n]?.v || '';
    const r = check(g, it, v, rs.answers);
    rs.answers[it.n] = { ...(rs.answers[it.n] || {}), v, ok: r.ok, note: r.note, type: qtype(g) };
  }
  await finish();
});
async function finish() {
  if (rs.full) return finishFull();
  const x = passageOf(rs.pid);
  const answers = {};
  for (const { g, it } of rs.items) {
    const a = rs.answers[it.n] || {};
    answers[it.n] = { v: String(a.v || '').slice(0, 80), ok: a.ok === true, loc: a.loc === undefined ? null : a.loc, type: qtype(g), why: a.ok ? '' : a.why || suggestWhy(g, it, a) };
  }
  const score = Object.values(answers).filter((a) => a.ok).length;
  const id = `r:${uid()}`;
  const rec = { id, kind: 'result', pid: rs.pid, mode: rs.mode, title: `${x?.meta.t.title || ''} · Passage ${x?.p.n || ''} · ${rs.title}`, score, total: rs.items.length, ms: Date.now() - rs.startedAt, at: today(), answers, placement: rs.placement };
  await rPut(rec);
  await rDel(`draft:${rs.pid}`).catch(() => {});
  await logGrammarDay('rPassages', id);
  clearInterval(tick); tick = null;
  rs = null;
  if (score / rec.total >= 0.7) confetti({ count: 70 });
  replace(`#/rresult/${id}`);
}

// ---- Lưu từ ----
let saving = null;
on('r-word', (el, e) => {
  const w = e?.target?.closest?.('.w');
  if (!w) return;
  const sent = w.closest('.rs');
  const pa = sent && sent.closest('.r-passage');
  const word = w.textContent.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').replace(/’/g, "'");
  if (!word) return;
  openWordSheet(word, sent ? sent.textContent.replace(/^[①-⑳]/, '').trim() : '', pa?.dataset.title || pa?.querySelector('.r-title')?.textContent || '');
});
function openWordSheet(word, sentence, title, extra = {}) {
  const have = findByText(word);
  saving = { sentence, title, have, extra };
  openSheet(`<h3>${have ? 'Từ đã có trong kho' : 'Lưu từ vào kho'}</h3>
    <input class="input" id="r-w-word" value="${esc(have ? have.word : extra.word || word.toLowerCase())}" ${have ? 'readonly' : ''} autocapitalize="none" spellcheck="false" style="margin-top:12px">
    ${have ? `<p class="small muted" style="margin:8px 2px 0">Nghĩa đang lưu: <b>${esc(have.meaning)}</b></p>` : ''}
    <div class="r-w-row"><input class="input" id="r-w-meaning" value="${esc(extra.meaning || '')}" placeholder="${have ? 'Thêm nghĩa trong ngữ cảnh này (tuỳ chọn)' : 'Nghĩa tiếng Việt'}" autocomplete="off">
      ${have ? '' : `<button class="btn ghost sm" data-act="r-w-lookup" type="button">Tra</button>`}</div>
    ${sentence ? `<p class="small muted" style="margin:10px 2px 0">${have ? ((have.examples || []).includes(sentence) ? 'Câu này đã có trong ví dụ' : 'Câu này sẽ được thêm làm ví dụ') : 'Câu ví dụ'}: <span class="en">${esc(sentence)}</span></p>` : ''}
    <div class="btn-row" style="margin-top:16px"><button class="btn ghost" data-act="sheet-close">Huỷ</button><button class="btn" data-act="r-w-save">Lưu</button></div>`);
  if (!have) setTimeout(() => document.getElementById('r-w-meaning')?.focus(), 250);
}
on('r-w-lookup', async (el) => {
  const word = document.getElementById('r-w-word')?.value.trim();
  if (!word) return;
  el.disabled = true; el.textContent = '…';
  try {
    const r = await lookupWord(word, { ai: S.settings.ai });
    const m = r.ai?.meaning || r.web?.meaning;
    const box = document.getElementById('r-w-meaning');
    if (m && box && !box.value.trim()) box.value = m;
    if (!m) toast('Không tra được nghĩa, bạn nhập tay nhé');
  } catch { toast('Không tra được nghĩa (cần mạng)'); }
  el.disabled = false; el.textContent = 'Tra';
});
on('r-w-save', async () => {
  if (!saving) return;
  const word = document.getElementById('r-w-word')?.value.trim().replace(/\s+/g, ' ');
  const meaning = document.getElementById('r-w-meaning')?.value.trim();
  const { sentence, title, have, extra } = saving;
  if (have) {
    have.examples = have.examples || [];
    let changed = false;
    if (sentence && !have.examples.includes(sentence)) { have.examples.push(sentence); changed = true; }
    if (meaning && !have.meaning.toLowerCase().includes(meaning.toLowerCase())) { have.meaning = `${have.meaning}; ${meaning}`; changed = true; }
    if (extra.synonym && !(have.synonyms || []).includes(extra.synonym)) { have.synonyms = [...(have.synonyms || []), extra.synonym]; changed = true; }
    if (changed) await saveWord(have);
    closeSheet();
    toast(changed ? `Đã thêm vào “${have.word}”` : 'Từ này đã có đủ câu và nghĩa này');
    return;
  }
  if (!word) return;
  if (!meaning) { toast('Hãy nhập nghĩa (hoặc bấm Tra)'); document.getElementById('r-w-meaning')?.focus(); return; }
  const w = blankWord(S.decks.some((d) => d.id === 'ielts-reading') ? 'ielts-reading' : undefined);
  Object.assign(w, { word, meaning, pos: extra.pos || '', notes: title ? `Từ bài đọc: ${title}` : 'Từ bài đọc' });
  if (sentence) w.examples = [sentence];
  if (extra.synonym) w.synonyms = [extra.synonym];
  await saveWord(w);
  closeSheet();
  toast(`Đã lưu “${word}” vào kho`);
});
// Cặp paraphrase trong lời giải: lưu cụm trong bài, nghĩa = cụm trong câu hỏi.
on('r-pair', (el) => openWordSheet(el.dataset.b, el.dataset.s || '', el.dataset.t || '', { word: el.dataset.b, meaning: `≈ ${el.dataset.a}`, synonym: el.dataset.a, pos: 'paraphrase' }));
on('r-delete', async (el) => {
  if (!(await confirmSheet({ title: 'Xoá kết quả này?', body: 'Lần làm bài này sẽ bị xoá khỏi máy.', okLabel: 'Xoá', danger: true }))) return;
  await rDel(el.dataset.id);
  toast('Đã xoá');
  back('#/reading');
});

// ================= GIAO DIỆN =================
const loadingCard = (msg = 'Đang tải bài đọc…') => (R.state === 'error'
  ? `<div class="banner">${icon('info')}<span>${esc(R.error)}</span></div>`
  : `<div class="card" style="display:flex;gap:12px;align-items:center"><div class="spin"></div><span class="muted">${esc(msg)}</span></div>`);
const ring = (value, goal) => {
  const c = 2 * Math.PI * 24, p = goal ? Math.min(1, value / goal) : 0;
  return `<svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="24"/><circle class="fg" cx="30" cy="30" r="24" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
};
const typeChips = (types) => `<div class="pill-list">${types.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>`;

export function readingView() {
  const head = `<header class="top"><div><p class="eyebrow">Linear thinking</p><h1>Reading</h1></div>
    <button class="iconbtn tonal" data-act="go" data-to="#/rstats" aria-label="Hồ sơ Reading">${icon('stats')}</button></header>${learnSwitch('reading')}`;
  if (R.state !== 'ready') return `<div class="page">${head}${loadingCard('Đang tải danh sách bài đọc…')}</div>`;
  const goal = S.settings.readingPerDay, done = todayReading(), next = nextPassage();
  const results = readingResults();
  const placed = results.filter((r) => r.placement).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const todayCard = `<div class="card"><div class="row-between"><div style="min-width:0"><p class="small muted">${goal ? `Hôm nay: ${done}/${goal} passage` : `Hôm nay: ${done} passage`}</p>
      ${next ? `<b style="font-size:18px;display:block;margin-top:2px">${esc(next.title)}</b><p class="small muted">${esc(next.topic || '')} · ${next.questions} câu</p>` : '<b>Bạn đã làm hết các bài đọc hiện có</b>'}</div>${goal ? ring(done, goal) : ''}</div>
    ${next ? `<button class="btn" style="margin-top:14px" data-act="go" data-to="#/rpassage/${next.id}">Làm bài này</button>` : ''}
    ${placed ? `<p class="small muted" style="margin-top:10px">${esc(placementShort(Math.round((placed.score / placed.total) * 100)))}</p>` : ''}</div>`;
  const placeCard = !results.length ? `<button class="listlink" data-act="r-placement" style="margin-top:12px"><span class="lead">${icon('target')}</span><span class="body"><b>Kiểm tra trình độ · 20 phút</b><small>1 passage như thi, app gợi ý nên bắt đầu thế nào</small></span>${icon('chev')}</button>` : '';
  const reasons = reasonCard(results);
  const tools = `<h2>Luyện thêm</h2>
    <button class="listlink" data-act="go" data-to="#/rpatterns"><span class="lead">${icon('link')}</span><span class="body"><b>Verb pattern</b><small>~60 khung động từ hay gặp, ví dụ lấy từ các bài đọc</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="go" data-to="#/rown"><span class="lead">${icon('pen')}</span><span class="body"><b>Bài đọc của bạn</b><small>Dán bài từ sách, tự Simplify, lưu từ, viết main idea</small></span>${icon('chev')}</button>
    ${results.length ? `<button class="listlink" data-act="r-placement"><span class="lead">${icon('target')}</span><span class="body"><b>Kiểm tra trình độ</b><small>1 passage 20 phút, gợi ý cách học</small></span>${icon('chev')}</button>` : ''}`;
  const lib = R.tests.map((t) => {
    const full = fullResults().filter((f) => f.tid === t.id).sort((a, b) => (a.at < b.at ? 1 : -1))[0];
    const fdraft = S.reading.get(`draft:full:${t.id}`);
    return `<div class="row-between r-testhead"><h2>${esc(t.title)}</h2><button class="tag r-fullbtn" data-act="r-full" data-t="${t.id}">${fdraft ? 'Làm tiếp cả đề' : full ? `Cả đề · ${full.band.toFixed(1)}` : 'Cả đề · 60′'}</button></div><div class="wlist" style="margin-top:0">${t.passages.map((p) => {
    const best = bestOf(p.id), draft = readingDraft(p.id);
    const sub = draft ? `Đang làm dở · ${Object.keys(draft.answers || {}).length}/${p.questions} câu` : best >= 0 ? `Tốt nhất ${best}/${p.questions} câu` : `${p.questions} câu · ${esc(p.topic || '')}`;
    return `<div class="wrow" data-act="go" data-to="#/rpassage/${p.id}"><span class="num ${best >= 0 ? 'done' : ''}">${best >= 0 ? icon('check', 'sm') : p.n}</span>
      <div class="body"><span style="font-weight:600">${esc(p.title)}</span><p>${sub}</p></div>${icon('chev')}</div>`;
  }).join('')}</div>`;
  }).join('');
  return `<div class="page">${head}${todayCard}${placeCard}${reasons}${tools}${lib}
    <p class="small faint" style="margin:14px 2px 0">Mỗi bài: định vị câu chứa thông tin → Simplify → trả lời → xem giải theo 4 bước. Chạm một từ trong bài để lưu vào kho.</p></div>`;
}

export function passageView(pid) {
  const nav = navBar('Bài đọc', { fallback: '#/reading' });
  if (R.state !== 'ready') return `<div class="page">${nav}${loadingCard()}</div>`;
  const m = metaOf(pid);
  if (!m) return `<div class="page">${nav}<div class="empty"><p>Không tìm thấy bài đọc này.</p></div></div>`;
  const x = passageOf(pid);
  if (!x) return `<div class="page">${nav}${loadingCard()}</div>`;
  const { p, test } = x;
  const types = [...new Set(p.groups.map((g) => TYPE_NAME[qtype(g)]))];
  const draft = readingDraft(pid), past = resultsOf(pid);
  const total = flatItems(p).length;
  return `<div class="page">${nav}
    <p class="small muted" style="margin:0 2px 6px">${esc(test.title)} · Passage ${p.n}${p.topic ? ` · ${esc(p.topic)}` : ''}</p>
    <h1 style="font-size:26px;margin:0 2px 8px">${esc(p.title)}</h1>
    ${p.subtitle ? `<p class="muted" style="margin:0 2px 12px">${esc(p.subtitle)}</p>` : ''}
    ${typeChips(types)}
    ${draft ? `<div class="card" style="margin-top:14px"><p class="small muted">Đang làm dở (${draft.mode === 'exam' ? 'như thi' : 'có hướng dẫn'}) · ${Object.keys(draft.answers || {}).length}/${total} câu</p>
      <button class="btn" style="margin-top:12px" data-act="r-start" data-p="${pid}" data-mode="${draft.mode}" data-resume="1">Làm tiếp</button></div>` : ''}
    <h2>Chọn cách làm</h2>
    <button class="listlink" data-act="r-start" data-p="${pid}" data-mode="guided"><span class="lead">${icon('learn')}</span><span class="body"><b>Học có hướng dẫn</b><small>Từng câu: định vị → Simplify → trả lời → giải 4 bước</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="r-start" data-p="${pid}" data-mode="exam"><span class="lead">${icon('clock')}</span><span class="body"><b>Làm như thi · 20 phút</b><small>Làm hết ${total} câu rồi nộp, sau đó xem giải</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="go" data-to="#/rstudy/${pid}"><span class="lead">${icon('list')}</span><span class="body"><b>Đọc hiểu từng đoạn</b><small>Câu gốc → Simplify → Read connection → Main idea</small></span>${icon('chev')}</button>
    ${past.length ? `<h2>Các lần đã làm</h2><div class="wlist" style="margin-top:0">${past.map((r) => `<div class="wrow" data-act="go" data-to="#/rresult/${r.id}"><div class="body"><span style="font-weight:600">${r.score}/${r.total} câu đúng</span><p>${r.at.split('-').reverse().join('/')} · ${r.mode === 'exam' ? 'như thi' : 'có hướng dẫn'} · ${Math.round(r.ms / 60e3)} phút</p></div>${icon('chev')}</div>`).join('')}</div>` : ''}
  </div>`;
}

// ---- Màn làm bài ----
function groupHead(g) {
  return `<p class="r-instr">${inline(g.instr)}</p>${g.options?.some((o) => o.t) && g.type === 'choice' ? `<div class="r-optlist">${g.options.map((o) => `<p><b>${o.k}</b> ${esc(o.t)}</p>`).join('')}</div>` : ''}`;
}
function answerButtons(g, it, chosen, { exam = false, disabled = false, correct = null } = {}) {
  const opts = it.options || g.options || [];
  const cls = (o) => {
    if (correct === null) return chosen === o.k ? 'on' : '';
    if (it.a.some((x) => normAns(o.k) === normAns(x))) return 'right';
    return chosen === o.k ? 'wrong' : 'dim';
  };
  if (g.type === 'tf') return `<div class="r-tf">${opts.map((o) => `<button class="opt ${cls(o)}" data-act="r-pick" data-n="${it.n}" data-v="${esc(o.k)}" ${disabled ? 'disabled' : ''}>${esc(o.k)}</button>`).join('')}</div>`;
  if (it.options) return `<div class="stack r-mc">${opts.map((o) => `<button class="opt ${cls(o)}" data-act="r-pick" data-n="${it.n}" data-v="${o.k}" ${disabled ? 'disabled' : ''}><span><b>${o.k}</b> ${esc(o.t)}</span></button>`).join('')}</div>`;
  return `<div class="r-letters">${opts.map((o) => `<button class="opt ${cls(o)}" data-act="r-pick" data-n="${it.n}" data-v="${o.k}" ${disabled ? 'disabled' : ''}>${o.k}</button>`).join('')}</div>`;
}
function simplifyHtml(p, at) {
  const sp = simpFor(p, at);
  const sent = sentOf(p, at);
  if (!sp) return `<p class="muted">Câu này chưa có phần Simplify.</p><blockquote class="r-quote en">${esc(sent)}</blockquote>`;
  const reveal = rs.reveal;
  const out = `<div class="r-simp ${reveal ? '' : 'hidden'}"><p class="small muted">Câu rút gọn</p><p class="en"><b>${esc(sp.text)}</b></p>${sp.note ? `<p class="small muted" style="margin-top:4px">${inline(sp.note)}</p>` : ''}</div>`;
  if (sp.keep && sp.idx.length === 1) {
    const toks = sent.split(/\s+/);
    const chips = toks.map((t, k) => {
      let c = rs.strike.has(k) ? 'struck' : '';
      if (rs.checked) {
        const should = sp.keep[k] === 0, did = rs.strike.has(k);
        c += should === did ? (should ? ' good' : '') : ' miss';
      }
      return `<button class="r-tok ${c}" data-act="r-strike" data-k="${k}" ${rs.checked ? 'disabled' : ''}>${esc(t)}</button>`;
    }).join('');
    let score = '';
    if (rs.checked) {
      const right = toks.filter((_, k) => (sp.keep[k] === 0) === rs.strike.has(k)).length;
      const pct = Math.round((right / toks.length) * 100);
      score = `<div class="feedback ${pct >= 85 ? 'ok' : 'no'}"><b class="t">${pct >= 85 ? icon('check', 'sm') : icon('info', 'sm')} Đúng ${right}/${toks.length} chữ</b><p class="small">Chữ viền đỏ là chỗ gạch nhầm hoặc bỏ sót.</p></div>`;
    }
    return `<p class="small muted" style="margin-bottom:8px">Chạm vào các chữ thuộc <b>phần phụ</b> để gạch đi (mệnh đề quan hệ, V-ing/V-ed rút gọn, phần trong gạch ngang/ngoặc, liệt kê…), chỉ giữ khung S–V chính.</p>
      <div class="r-toks">${chips}</div>${score}${out}`;
  }
  return `<p class="small muted" style="margin-bottom:8px">Tự tìm S–V và bỏ phần phụ trong đầu, rồi lật xem câu rút gọn.</p><blockquote class="r-quote en">${esc(sent)}</blockquote>${out}`;
}

export function runView() {
  if (!rs) { setTimeout(() => replace('#/reading')); return ''; }
  const x = passageOf(rs.full ? rs.full.pids[rs.full.pi] : rs.pid);
  if (!x) return `<div class="page">${loadingCard()}</div>`;
  const { p } = x;
  if (rs.mode === 'exam') return examView(p);
  const { g, it } = cur();
  const steps = it.loc.length ? ['q', 'loc', 'simp', 'ans', 'fb'] : ['q', 'ans', 'fb'];
  const pct = Math.round(((rs.pos + steps.indexOf(rs.step) / steps.length) / rs.items.length) * 100);
  const top = `<div class="ses-top"><button class="iconbtn" data-act="r-quit" aria-label="Thoát">${icon('x')}</button><div class="progress"><i style="width:${pct}%"></i></div><span class="count">${rs.pos + 1}/${rs.items.length}</span></div>
    <p class="mode-label">${esc(TYPE_NAME[qtype(g)])}</p>`;
  const qcard = `<div class="card r-qcard"><p class="small muted">Câu ${it.n}${it.multi ? ` · chọn 2 đáp án cho câu ${it.multi.join(' và ')}` : ''}</p><p class="r-q">${inline(it.q)}</p>${g.type === 'gap' ? `<p class="small muted" style="margin-top:6px">${esc(g.limit)}</p>` : ''}</div>`;
  let body = '', actions = '', side = '';
  const a = rs.answers[it.n] || {};
  if (rs.step === 'q') {
    body = `${groupHead(g)}${qcard}${g.guide ? `<details class="card r-guide"><summary>Gợi ý cho nhóm câu này</summary>${md(g.guide)}</details>` : ''}
      <div class="banner info" style="margin-top:12px">${icon('info')}<span>Bước 1: xác định <b>mắt thông tin</b> của câu hỏi (ai, cái gì, so sánh, mức độ…) và từ loại cần điền.</span></div>`;
    actions = it.loc.length ? `<button class="btn" data-act="r-step" data-to="loc">Tìm câu trong bài</button>` : `<button class="btn" data-act="r-step" data-to="ans">Trả lời</button>`;
  } else if (rs.step === 'loc') {
    const marks = {};
    if (rs.pick) {
      marks[rs.pick.at.join('-')] = rs.pick.ok ? 'ok' : 'no';
      if (!rs.pick.ok) for (const l of it.loc) marks[l.join('-')] = 'hint';
    }
    body = `${qcard}<p class="small muted" style="margin:10px 2px"><span class="m-only">Bước 2: chạm vào câu trong bài (bên dưới) chứa thông tin cho câu hỏi.</span><span class="w-only">Bước 2: chạm vào câu trong bài (bên trái) chứa thông tin cho câu hỏi.</span></p>
      ${rs.pick ? `<div class="feedback ${rs.pick.ok ? 'ok' : 'no'}"><b class="t">${rs.pick.ok ? `${icon('check', 'sm')} Đúng chỗ` : 'Chưa đúng chỗ'}</b><p class="small">Thông tin nằm ở ${it.loc.map((l) => locName(p, l)).join(', ')} (tô vàng).</p></div>` : ''}`;
    side = passageHtml(p, { mode: 'loc', marks });
    actions = rs.pick ? `<button class="btn" data-act="r-step" data-to="simp">Simplify câu này</button>` : `<button class="btn ghost" data-act="r-step" data-to="simp">Bỏ qua, xem luôn</button>`;
  } else if (rs.step === 'simp') {
    const at = it.loc[0];
    body = `${qcard}<h3 class="w-h">Bước 3 · Simplify ${esc(locName(p, at))}</h3>${simplifyHtml(p, at)}
      ${it.loc.length > 1 ? `<p class="small muted" style="margin-top:10px">Thông tin còn ở: ${it.loc.slice(1).map((l) => esc(locName(p, l))).join(', ')}</p>${it.loc.slice(1).map((l) => `<blockquote class="r-quote en">${esc(sentOf(p, l))}</blockquote>`).join('')}` : ''}`;
    const sp = simpFor(p, at);
    actions = sp?.keep && !rs.checked ? `<div class="btn-row"><button class="btn ghost" data-act="r-step" data-to="ans" style="flex:.7">Bỏ qua</button><button class="btn" data-act="r-strike-check">Kiểm tra</button></div>`
      : !rs.reveal && sp ? `<div class="btn-row"><button class="btn ghost" data-act="r-step" data-to="ans" style="flex:.7">Bỏ qua</button><button class="btn" data-act="r-reveal">Xem câu rút gọn</button></div>`
      : `<button class="btn" data-act="r-step" data-to="ans">Bước 4 · Trả lời</button>`;
  } else if (rs.step === 'ans') {
    const sents = it.loc.map((l) => `<blockquote class="r-quote en">${esc(sentOf(p, l))}</blockquote>`).join('');
    body = `${groupHead(g)}${qcard}${sents ? `<p class="small muted" style="margin:10px 2px 6px">Câu trong bài:</p>${sents}` : ''}
      <div style="margin-top:14px">${g.type === 'gap' ? `<form data-submit="r-gap-check"><input id="r-gap-in" class="answer-input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Điền từ"></form>` : answerButtons(g, it, a.v)}</div>`;
    actions = g.type === 'gap' ? `<button class="btn" data-act="r-gap-check">Kiểm tra</button>` : '';
  } else {
    const right = a.ok;
    const pairs = (it.pairs || []).map(([qa, pb]) => `<button class="tag r-pairbtn" data-act="r-pair" data-a="${esc(qa)}" data-b="${esc(pb)}" data-s="${esc(it.loc[0] ? sentOf(p, it.loc[0]) : '')}" data-t="${esc(p.title)}">${esc(qa)} ↔ ${esc(pb)} <b>+</b></button>`).join('');
    body = `${qcard}
      ${g.type === 'gap' ? `<div class="feedback ${right ? 'ok' : 'no'}"><b class="t">${right ? `${icon('check', 'sm')} Đúng` : 'Chưa đúng'}</b><p>Bạn điền: <b>${esc(a.v || '')}</b> · Đáp án: <b>${esc(it.a.join(' / '))}</b></p>${a.note ? `<p class="small">${esc(a.note)}</p>` : ''}</div>`
        : `${answerButtons(g, it, a.v, { disabled: true, correct: true })}<div class="feedback ${right ? 'ok' : 'no'}"><b class="t">${right ? `${icon('check', 'sm')} Đúng` : `Chưa đúng · đáp án ${esc(it.a.join(it.multi ? ' và ' : ' / '))}`}</b>${it.multi ? `<p class="small">Câu ${it.multi.join(' và ')} cùng một câu hỏi: mỗi câu chọn một đáp án đúng, không trùng nhau.</p>` : ''}</div>`}
      ${right ? '' : whyChips(it.n, a.why || suggestWhy(g, it, a))}
      ${it.exp ? `<h3 class="w-h">Giải theo 4 bước</h3><div class="card r-exp">${md(it.exp)}</div>` : ''}
      ${pairs ? `<h3 class="w-h">Cặp paraphrase · chạm để lưu</h3><div class="pill-list">${pairs}</div>` : ''}`;
    actions = `<button class="btn" data-act="r-next">${rs.pos < rs.items.length - 1 ? 'Câu tiếp theo' : 'Xem kết quả'}</button>`;
  }
  const focus = rs.step === 'ans' && g.type === 'gap' ? '#r-gap-in' : null;
  // Màn rộng: bài đọc luôn nằm bên trái; sau bước định vị thì tô các câu chứa thông tin.
  if (!side) {
    const marks = {};
    if (rs.step !== 'q') for (const l of it.loc) marks[l.join('-')] = 'hint';
    side = passageHtml(p, { marks });
  }
  scrollToMark(`${rs.pos}-${rs.step}`);
  return { html: `<div class="page session split-page">${top}<div class="ses-body split"><div class="split-l r-side ${rs.step === 'loc' ? '' : 'only-wide'}">${side}</div><div class="split-r">${body}</div></div><div class="ses-actions">${actions}</div></div>`, focus };
}

function examView(p) {
  const t = timerState();
  const answered = answeredCount();
  const top = `<div class="ses-top"><button class="iconbtn" data-act="r-quit" aria-label="Thoát">${icon('x')}</button><div class="progress"><i style="width:${Math.round((answered / rs.items.length) * 100)}%"></i></div><span id="r-timer" class="${t.cls}" role="timer">${t.text}</span></div>
    ${rs.full ? `<div class="seg r-pp">${rs.full.pids.map((_, i) => `<button class="${i === rs.full.pi ? 'on' : ''}" data-act="r-pp" data-i="${i}">Passage ${i + 1}</button>`).join('')}</div>` : ''}
    <div class="seg r-tabs"><button class="${rs.tab === 'p' ? 'on' : ''}" data-act="r-tab" data-t="p">Bài đọc</button><button class="${rs.tab === 'q' ? 'on' : ''}" data-act="r-tab" data-t="q">Câu hỏi · ${answered}/${rs.items.length}</button></div>`;
  let body;
  {
    body = p.groups.map((g) => `<div class="r-group"><h3 class="w-h">Câu ${g.from}–${g.to}</h3>${groupHead(g)}
      ${g.type === 'gap' && g.context ? `<details class="card r-guide"><summary>Xem toàn bộ phần ${/summary/i.test(g.instr) ? 'tóm tắt' : 'ghi chú'}</summary>${md(g.context)}</details>` : ''}
      ${g.items.map((it) => {
        const v = rs.answers[it.n]?.v || '';
        return `<div class="card r-item"><p class="r-q"><b>${it.n}.</b> ${inline(it.q)}</p>
          ${g.type === 'gap' ? `<input class="input r-gapin" data-in="r-gap" data-n="${it.n}" value="${esc(v)}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(g.limit)}">` : answerButtons(g, it, v, { exam: true })}</div>`;
      }).join('')}</div>`).join('');
  }
  return `<div class="page session split-page">${top}<div class="ses-body split"><div class="split-l ${rs.tab === 'p' ? '' : 'm-hide'}">${passageHtml(p)}</div><div class="split-r ${rs.tab === 'q' ? '' : 'm-hide'}">${body}</div></div><div class="ses-actions"><button class="btn" data-act="r-submit">Nộp bài</button></div></div>`;
}

// ---- Kết quả ----
export function resultView(id) {
  const r = S.reading.get(id);
  const nav = navBar('Kết quả', { fallback: '#/reading' });
  if (!r || r.kind !== 'result') return `<div class="page">${nav}<div class="empty"><p>Không tìm thấy kết quả này.</p></div></div>`;
  if (R.state !== 'ready') return `<div class="page">${nav}${loadingCard()}</div>`;
  const x = passageOf(r.pid);
  if (!x) return `<div class="page">${nav}${loadingCard()}</div>`;
  const { p, test } = x;
  const pct = Math.round((r.score / r.total) * 100);
  const locs = Object.values(r.answers).filter((a) => a.loc !== null && a.loc !== undefined);
  const locOk = locs.filter((a) => a.loc).length;
  const rows = flatItems(p).map(({ g, it }) => {
    const a = r.answers[it.n] || {};
    return `<details class="card r-res ${a.ok ? 'ok' : 'no'}"><summary><span class="r-res-n">${a.ok ? icon('check', 'sm') : icon('x', 'sm')} ${it.n}</span><span class="r-res-q">${inline(it.q)}</span></summary>
      <p class="small" style="margin-top:8px">Bạn: <b>${esc(a.v || '(bỏ trống)')}</b> · Đáp án: <b>${esc(it.a.join(' / '))}</b> · ${esc(TYPE_NAME[qtype(g)])}</p>
      ${a.ok ? '' : whyChips(it.n, a.why, r.id)}
      ${it.loc.map((l) => `<blockquote class="r-quote en"><span class="small muted">${esc(locName(p, l))}</span> ${esc(sentOf(p, l))}</blockquote>`).join('')}
      ${it.exp ? `<div class="r-exp">${md(it.exp)}</div>` : ''}
      ${(it.pairs || []).length ? `<div class="pill-list" style="margin-top:8px">${it.pairs.map(([qa, pb]) => `<button class="tag r-pairbtn" data-act="r-pair" data-a="${esc(qa)}" data-b="${esc(pb)}" data-s="${esc(it.loc[0] ? sentOf(p, it.loc[0]) : '')}" data-t="${esc(p.title)}">${esc(qa)} ↔ ${esc(pb)} <b>+</b></button>`).join('')}</div>` : ''}
    </details>`;
  }).join('');
  return `<div class="page">${nav}
    <p class="small muted" style="margin:0 2px 6px">${esc(test.title)} · Passage ${p.n} · ${r.at.split('-').reverse().join('/')}</p>
    <h1 style="font-size:24px;margin:0 2px 10px">${esc(p.title)}</h1>
    <div class="tiles w-tiles"><div class="tile"><b>${r.score}/${r.total}</b><span>câu đúng</span></div><div class="tile"><b>${pct}%</b><span>tỉ lệ</span></div><div class="tile"><b>${Math.round(r.ms / 60e3)}′</b><span>thời gian</span></div>${locs.length ? `<div class="tile"><b>${locOk}/${locs.length}</b><span>định vị</span></div>` : ''}</div>
    ${r.placement ? placementAdvice(pct) : ''}
    <div class="stack" style="margin-top:14px"><button class="btn" data-act="go" data-to="#/rstudy/${p.id}">Đọc hiểu từng đoạn</button>
      <button class="btn soft" data-act="go" data-to="#/rvocab/${p.id}">Ôn từ của bài</button></div>
    <h2>Từng câu</h2>${rows}
    <button class="btn ghost" style="margin-top:16px" data-act="r-start" data-p="${p.id}" data-mode="${r.mode}">Làm lại bài này</button>
    <button class="btn danger" style="margin-top:10px" data-act="r-delete" data-id="${r.id}">${icon('trash', 'sm')} Xoá kết quả</button></div>`;
}

// ---- Đọc hiểu từng đoạn ----
export function studyView(pid) {
  const nav = navBar('Đọc hiểu từng đoạn', { fallback: `#/rpassage/${pid}` });
  if (R.state !== 'ready') return `<div class="page">${nav}${loadingCard()}</div>`;
  const x = passageOf(pid);
  if (!x) return `<div class="page">${nav}${metaOf(pid) ? loadingCard() : '<div class="empty"><p>Không tìm thấy bài đọc này.</p></div>'}</div>`;
  const { p, test } = x;
  const qsOf = (pa) => [...new Set(pa.simp.flatMap((s) => s.q || []))];
  const paras = p.paras.map((pa, pi) => {
    const qs = qsOf(pa);
    return `<div class="card r-study">
      <div class="row-between"><b>Đoạn ${esc(pa.label)}</b>${qs.length ? `<span class="tag">→ Câu ${qs.join(', ')}</span>` : ''}</div>
      <div class="r-passage r-mini" data-act="r-word" data-title="${esc(p.title)}"><p>${pa.sents.map((s, si) => `<span class="rs" data-p="${pi}" data-s="${si}"><sup>${CIRC[si] || si + 1}</sup>${words(s)}</span>`).join(' ')}</p></div>
      <div class="r-study-side"><details class="r-det"><summary>Simplify</summary>${pa.simp.map((s) => `<p class="en"><span class="small muted">${s.idx.map((i) => CIRC[i]).join('')}</span> <b>${esc(s.text)}</b>${s.note ? ` <span class="small muted">(${inline(s.note)})</span>` : ''}</p>`).join('')}</details>
      ${pa.conn ? `<details class="r-det"><summary>Read connection</summary><p>${inline(pa.conn)}</p></details>` : ''}
      ${pa.main ? mainQuiz(p, pi) : ''}
      ${pa.main ? `<details class="r-det"><summary>Main idea · tự nghĩ trước rồi mở</summary><p><b>${inline(pa.main)}</b></p></details>` : ''}
      ${pa.warn.length ? pa.warn.map((w) => `<p class="small r-warn">${inline(w)}</p>`).join('') : ''}</div>
    </div>`;
  }).join('');
  const ex = test.exercises?.q ? `<h2>Bài tập cả đề</h2><div class="card r-exp">${md(test.exercises.q)}<details class="r-det"><summary>Đáp án gợi ý</summary>${md(test.exercises.a)}</details></div>` : '';
  const traps = test.traps ? `<details class="card r-guide" style="margin-top:12px"><summary>Bẫy hay gặp ở đề này</summary>${md(test.traps)}</details>` : '';
  const extras = (test.extras || []).map((x) => `<details class="card r-guide" style="margin-top:12px"><summary>${esc(x.title)}</summary>${md(x.md)}</details>`).join('');
  const method = test.method ? `<details class="card r-guide" style="margin-top:12px"><summary>Quy trình chung theo dạng câu hỏi</summary>${md(test.method)}</details>` : '';
  return `<div class="page">${nav}
    <p class="small muted" style="margin:0 2px 6px">${esc(test.title)} · Passage ${p.n}</p>
    <h1 style="font-size:24px;margin:0 2px 6px">${esc(p.title)}</h1>
    <p class="small muted" style="margin:0 2px 12px">Đọc câu gốc, tự rút gọn trong đầu rồi mở Simplify. Chạm một từ để lưu vào kho.</p>
    ${paras}${ex}${traps}${extras}${method}
    <button class="btn soft" style="margin-top:16px" data-act="r-start" data-p="${pid}" data-mode="guided">Làm câu hỏi có hướng dẫn</button>
    <button class="btn ghost" style="margin-top:10px" data-act="go" data-to="#/rvocab/${pid}">Ôn từ của bài</button></div>`;
}

// Dùng cho kiểm thử tự động.
export const _check = { check, qtype, md, flatItems, passageOf, nextPassage };

// ---- Phím tắt (bàn phím Mac/iPad) ----
// T/F/Y/N (N hoặc G = NOT GIVEN ở True/False), A–G chọn phương án, Enter = nút chính ở dưới.
document.addEventListener('keydown', (e) => {
  if (location.hash !== '#/rrun' || !rs || e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.body.classList.contains('sheet-open')) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.key === 'Enter') {
    const btns = [...document.querySelectorAll('#view .ses-actions .btn:not([disabled])')];
    const main = btns.filter((b) => !b.classList.contains('ghost')).pop() || btns.pop();
    if (main) { e.preventDefault(); main.click(); }
    return;
  }
  if (rs.mode !== 'guided' || rs.step !== 'ans' || !/^[a-z]$/i.test(e.key)) return;
  const k = e.key.toUpperCase();
  const opts = [...document.querySelectorAll('#view [data-act="r-pick"]:not([disabled])')];
  let b = opts.find((o) => o.dataset.v === k) || opts.find((o) => o.dataset.v.length > 1 && o.dataset.v[0] === k && !(k === 'N' && o.dataset.v === 'NOT GIVEN' && opts.some((x) => x.dataset.v === 'NO')));
  if (!b && k === 'G') b = opts.find((o) => o.dataset.v === 'NOT GIVEN');
  if (b) { e.preventDefault(); b.click(); }
});


// ================= LÝ DO SAI (Sổ lỗi Reading) =================
export const REASONS = {
  loc: ['Tìm sai chỗ trong bài', 'Định vị bằng từ khó paraphrase (tên riêng, số, năm) rồi đọc cả câu trước và sau.'],
  trap: ['Bẫy mặt chữ (từ giống, ý khác)', 'Đừng chọn vì có từ giống bài. Simplify câu trong bài rồi so ý.'],
  ng: ['Nhầm False/No với Not Given', 'False/No cần câu trong bài nói NGƯỢC; nếu bài không nhắc tới mắt thông tin đó thì là Not Given.'],
  simp: ['Không hiểu câu (cần Simplify)', 'Tìm S–V chính, gạch mệnh đề quan hệ, phần trong gạch ngang/ngoặc, liệt kê.'],
  vocab: ['Không nhận ra từ / paraphrase', 'Lưu cặp paraphrase sau mỗi bài và ôn ở mục Ôn từ của bài.'],
  form: ['Sai từ loại hoặc giới hạn số từ', 'Xác định từ loại cần điền trước, đếm số từ theo đề (ONE WORD, NO MORE THAN TWO WORDS).'],
  time: ['Đoán vì hết giờ', 'Làm bài như thi đều đặn; câu khó đánh dấu rồi quay lại sau.'],
};
/** Đoán lý do sai từ dữ liệu có sẵn; người học sửa lại được. */
function suggestWhy(g, it, a) {
  if (a.loc === false) return 'loc';
  const v = String(a.v || '').toUpperCase(), ans = String(it.a[0] || '').toUpperCase();
  if (g.type === 'tf' && ((v === 'NOT GIVEN') !== (ans === 'NOT GIVEN')) && v) return 'ng';
  if (g.type === 'gap' && a.note) return 'form';
  return '';
}
function whyChips(n, cur, rid = '') {
  return `<div class="r-why"><p class="small muted">Vì sao sai? <span class="faint">(ghi vào Sổ lỗi Reading)</span></p><div class="pill-list">${Object.entries(REASONS).map(([k, [name]]) =>
    `<button class="tag ${cur === k ? 'on' : ''}" data-act="r-why" data-n="${n}" data-why="${k}" ${rid ? `data-id="${rid}"` : ''}>${esc(name)}</button>`).join('')}</div></div>`;
}
on('r-why', async (el) => {
  const n = el.dataset.n, k = el.dataset.why;
  if (el.dataset.id) {
    const r = S.reading.get(el.dataset.id);
    if (!r?.answers?.[n]) return;
    r.answers[n].why = r.answers[n].why === k ? '' : k;
    await rPut(r);
  } else if (rs) {
    rs.answers[n] = { ...(rs.answers[n] || {}), why: rs.answers[n]?.why === k ? '' : k };
    saveDraft();
  }
  el.parentElement.querySelectorAll('.tag').forEach((b) => b.classList.toggle('on', b === el && !b.classList.contains('on')));
});
function reasonCard(results) {
  const since = addDays(today(), -6);
  const cnt = {};
  for (const r of results) if (r.at >= since) for (const a of Object.values(r.answers)) if (!a.ok && a.why) cnt[a.why] = (cnt[a.why] || 0) + 1;
  const rows = Object.entries(cnt).filter(([k]) => REASONS[k]).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  return `<h2>Sổ lỗi Reading · 7 ngày</h2><div class="card">${rows.map(([k, n]) => `<div class="r-reason"><div class="row-between"><b>${esc(REASONS[k][0])}</b><span>${n >= 3 ? '<span class="tag warn">Cần ôn</span> ' : ''}${n} lần</span></div>${n >= 3 ? `<p class="small muted">${esc(REASONS[k][1])}</p>` : ''}</div>`).join('')}</div>`;
}

// ================= KIỂM TRA TRÌNH ĐỘ =================
function placementShort(pct) {
  return pct < 40 ? 'Gợi ý từ bài kiểm tra: học có hướng dẫn, tập trung Simplify từng câu.'
    : pct < 70 ? 'Gợi ý từ bài kiểm tra: xen kẽ học có hướng dẫn và làm như thi.'
    : 'Gợi ý từ bài kiểm tra: làm như thi và luyện đề trọn 60 phút.';
}
function placementAdvice(pct) {
  const [title, body] = pct < 40
    ? ['Bắt đầu từ nền câu', 'Dùng “Học có hướng dẫn” cho mọi bài: định vị → Simplify → trả lời. Mỗi ngày 1 passage, làm kỹ phần gạch phần phụ và Đọc hiểu từng đoạn. Ôn verb pattern 10 mẫu/tuần.']
    : pct < 70
      ? ['Luyện theo dạng câu hỏi', 'Xen kẽ: 2 bài có hướng dẫn, 1 bài như thi 20 phút. Xem Sổ lỗi Reading để biết lý do sai nhiều nhất và tập trung vào đó.']
      : ['Tăng tốc độ', 'Làm như thi 20 phút/passage và đề trọn 60 phút mỗi tuần. Chỉ dùng hướng dẫn cho dạng câu hỏi còn sai nhiều.'];
  return `<div class="banner info" style="margin-top:14px">${icon('target')}<span><b>${title}.</b> ${body}</span></div>`;
}
on('r-placement', async () => {
  const t = R.tests[R.tests.length - 1];
  if (!t) return;
  await ensureTest(t);
  startSession(t.passages[0].id, 'exam', false, { placement: true });
  startTick();
});
async function ensureTest(t) {
  if (!R.data.has(t.id)) await loadTest(t);
  return R.data.get(t.id);
}

// ================= ĐỀ TRỌN 60 PHÚT =================
export const fullResults = () => [...S.reading.values()].filter((r) => r.kind === 'full');
/** Quy đổi điểm Academic Reading (bảng tham khảo phổ biến của IELTS). */
export function bandOf(score) {
  const T = [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
  for (const [min, b] of T) if (score >= min) return b;
  return score > 0 ? 2 : 0;
}
on('r-full', async (el) => {
  const t = R.tests.find((x) => x.id === el.dataset.t);
  const test = t && await ensureTest(t);
  if (!test) return;
  const d = S.reading.get(`draft:full:${t.id}`);
  const items = test.passages.flatMap((p) => flatItems(p));
  rs = {
    pid: `full:${t.id}`, mode: 'exam', title: test.title, items, pos: 0, answers: d?.answers || {}, startedAt: Date.now() - (Number(d?.spent) || 0),
    step: 'q', tab: 'p', pick: null, strike: new Set(), checked: false, reveal: false, limit: 60 * 60e3,
    full: { tid: t.id, pids: test.passages.map((p) => p.id), pi: d?.full?.pi || 0 },
  };
  if (d) toast('Làm tiếp đề đang dở');
  go('#/rrun');
  startTick();
});
on('r-pp', (el) => { if (rs?.full) { rs.full.pi = Number(el.dataset.i); rs.tab = 'p'; saveDraft(); rerender(true); } });
async function finishFull() {
  const test = R.data.get(rs.full.tid);
  const ms = Date.now() - rs.startedAt, at = today(), parts = [];
  let total = 0, score = 0;
  for (const p of test.passages) {
    const answers = {};
    for (const { g, it } of flatItems(p)) {
      const a = rs.answers[it.n] || {};
      answers[it.n] = { v: String(a.v || '').slice(0, 80), ok: a.ok === true, loc: null, type: qtype(g), why: a.ok ? '' : suggestWhy(g, it, a) };
    }
    const sc = Object.values(answers).filter((a) => a.ok).length;
    const id = `r:${uid()}`;
    await rPut({ id, kind: 'result', pid: p.id, mode: 'full', title: `${test.title} · Passage ${p.n} · ${p.title}`, score: sc, total: Object.keys(answers).length, ms: Math.round(ms / 3), at, answers });
    await logGrammarDay('rPassages', id);
    parts.push(id); score += sc; total += Object.keys(answers).length;
  }
  const fid = `rf:${uid()}`;
  await rPut({ id: fid, kind: 'full', tid: test.id, title: test.title, score, total, band: bandOf(score), ms, at, parts });
  await rDel(`draft:full:${test.id}`).catch(() => {});
  clearInterval(tick); tick = null;
  rs = null;
  if (score >= 27) confetti({ count: 90 });
  replace(`#/rfull/${fid}`);
}
export function fullView(id) {
  const f = S.reading.get(id);
  const nav = navBar('Kết quả cả đề', { fallback: '#/reading' });
  if (!f || f.kind !== 'full') return `<div class="page">${nav}<div class="empty"><p>Không tìm thấy kết quả này.</p></div></div>`;
  const parts = f.parts.map((pid) => S.reading.get(pid)).filter(Boolean);
  return `<div class="page">${nav}<p class="small muted" style="margin:0 2px 6px">${f.at.split('-').reverse().join('/')}</p>
    <h1 style="font-size:24px;margin:0 2px 10px">${esc(f.title)}</h1>
    <div class="tiles w-tiles"><div class="tile"><b>${f.score}/${f.total}</b><span>câu đúng</span></div><div class="tile"><b>${f.band.toFixed(1)}</b><span>band tham khảo</span></div><div class="tile"><b>${Math.round(f.ms / 60e3)}′</b><span>/ 60 phút</span></div></div>
    <p class="small faint" style="margin:8px 2px 0">Band quy đổi theo bảng điểm Academic Reading phổ biến, chỉ để tham khảo.</p>
    <h2>Từng passage</h2><div class="wlist" style="margin-top:0">${parts.map((r, i) => `<div class="wrow" data-act="go" data-to="#/rresult/${r.id}"><span class="num">${i + 1}</span><div class="body"><span style="font-weight:600">${r.score}/${r.total} câu đúng</span><p>${esc(r.title.split(' · ').slice(2).join(' · '))}</p></div>${icon('chev')}</div>`).join('')}</div></div>`;
}

// ================= MAIN IDEA (Read connection) =================
function mainQuiz(p, pi) {
  const others = p.paras.map((x, k) => (k !== pi && x.main ? x.main : null)).filter(Boolean);
  if (others.length < 2) return '';
  const pick = [others[(pi * 7 + 3) % others.length], others[(pi * 5 + 1) % others.length]].filter((x, k, a) => a.indexOf(x) === k);
  const opts = [p.paras[pi].main, ...pick].map((t, k) => ({ t, ok: k === 0 }));
  const order = opts.map((o, k) => ({ o, s: (k * 37 + pi * 11) % 7 })).sort((a, b) => a.s - b.s).map((x) => x.o);
  return `<div class="r-mi"><p class="small muted" style="margin:10px 0 6px">Đọc xong đoạn này, ý chính là gì?</p>${order.map((o) => `<button class="opt r-miopt" data-act="r-mi" data-ok="${o.ok ? 1 : 0}">${inline(o.t)}</button>`).join('')}</div>`;
}
on('r-mi', (el) => {
  const box = el.parentElement;
  if (box.classList.contains('done')) return;
  box.classList.add('done');
  box.querySelectorAll('.r-miopt').forEach((b) => { b.disabled = true; if (b.dataset.ok === '1') b.classList.add('right'); else if (b === el) b.classList.add('wrong'); else b.classList.add('dim'); });
  toast(el.dataset.ok === '1' ? 'Đúng ý chính' : 'Chưa đúng: ý chính tô xanh');
});

// ================= ÔN TỪ SAU BÀI =================
let rv = null;
function buildReview(p) {
  const items = [];
  const note = `Từ bài đọc: ${p.title}`;
  const sentSet = new Set(p.paras.flatMap((pa) => pa.sents));
  const saved = [...S.words.values()].filter((w) => w.notes === note || (w.examples || []).some((e) => sentSet.has(e)));
  const pool = [...new Set(p.paras.flatMap((pa) => pa.sents.join(' ').match(/\b[a-z]{7,}\b/g) || []))];
  for (const w of saved) {
    const ex = (w.examples || []).find((e) => new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(e));
    if (!ex) continue;
    const blank = ex.replace(new RegExp(`\\b${w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i'), '_____');
    const wrong = [...saved.filter((x) => x !== w).map((x) => x.word), ...pool].filter((x) => x.toLowerCase() !== w.word.toLowerCase()).slice(0, 3);
    items.push({ kind: 'cloze', q: blank, a: w.word, opts: [w.word, ...wrong], wid: w.id, hint: w.meaning });
  }
  const pairs = flatItems(p).flatMap(({ it }) => it.pairs || []);
  pairs.forEach(([qa, pb], k) => {
    const wrong = pairs.filter((_, j) => j !== k).map((x) => x[1]).slice(0, 3);
    if (wrong.length >= 2) items.push({ kind: 'pair', q: qa, a: pb, opts: [pb, ...wrong] });
  });
  const mix = (arr, seed) => arr.map((x, i) => ({ x, s: (i * 9301 + seed * 49297) % 233280 })).sort((a, b) => a.s - b.s).map((y) => y.x);
  return mix(items, p.n).slice(0, 10).map((it, i) => ({ ...it, opts: mix(it.opts, i + 1) }));
}
export function reviewView(pid) {
  const nav = navBar('Ôn từ của bài', { fallback: `#/rpassage/${pid}` });
  if (R.state !== 'ready') return `<div class="page">${nav}${loadingCard()}</div>`;
  const x = passageOf(pid);
  if (!x) return `<div class="page">${nav}${loadingCard()}</div>`;
  if (!rv || rv.pid !== pid) rv = { pid, items: buildReview(x.p), done: {} };
  if (!rv.items.length) return `<div class="page">${nav}<div class="card empty"><div class="art">${icon('learn')}</div><h3>Chưa có gì để ôn</h3><p>Chạm từ trong bài để lưu, hoặc làm câu hỏi có cặp paraphrase, rồi quay lại đây.</p></div></div>`;
  const ok = Object.values(rv.done).filter(Boolean).length, n = Object.keys(rv.done).length;
  return `<div class="page">${nav}<p class="small muted" style="margin:0 2px 10px">${esc(x.p.title)} · ${rv.items.length} câu · ${n ? `đúng ${ok}/${n}` : 'từ bạn đã lưu và cặp paraphrase của bài'}</p>
    ${rv.items.map((it, i) => `<div class="card r-rv">${it.kind === 'cloze' ? `<p class="small muted">Điền từ đã lưu vào câu gốc</p><p class="en" style="margin-top:4px">${esc(it.q)}</p>` : `<p class="small muted">Trong câu hỏi viết</p><p style="margin-top:4px"><b>${esc(it.q)}</b> — trong bài viết là?</p>`}
      <div class="stack" style="margin-top:10px">${it.opts.map((o) => {
        const st = rv.done[i] === undefined ? '' : o === it.a ? 'right' : rv.pick?.[i] === o ? 'wrong' : 'dim';
        return `<button class="opt ${st}" data-act="r-rv" data-i="${i}" data-v="${esc(o)}" ${rv.done[i] === undefined ? '' : 'disabled'}>${esc(o)}</button>`;
      }).join('')}</div>${rv.done[i] !== undefined && it.hint ? `<p class="small muted" style="margin-top:8px">${esc(it.a)}: ${esc(it.hint)}</p>` : ''}</div>`).join('')}
    ${n === rv.items.length ? `<button class="btn soft" style="margin-top:14px" data-act="r-rv-again">Làm lại</button>` : ''}</div>`;
}
on('r-rv', async (el) => {
  if (!rv) return;
  const i = Number(el.dataset.i), it = rv.items[i];
  if (rv.done[i] !== undefined) return;
  const ok = el.dataset.v === it.a;
  rv.done[i] = ok;
  rv.pick = { ...(rv.pick || {}), [i]: el.dataset.v };
  if (it.wid) await recordAnswer(it.wid, ok ? 'good' : 'again', 'practice').catch(() => {});
  rerender();
});
on('r-rv-again', () => { if (rv) { rv.done = {}; rv.pick = {}; rerender(true); } });

// ================= VERB PATTERN =================
R.patterns = null;
async function loadPatterns() {
  try { R.patterns = (await (await fetch('content/reading/patterns.json')).json()).patterns; } catch { R.patterns = []; }
  rerender();
}
const PAT_DECK = 'Verb pattern (Reading)';
export function patternsView() {
  const nav = navBar('Verb pattern', { fallback: '#/reading' });
  if (!R.patterns) { loadPatterns(); return `<div class="page">${nav}${loadingCard('Đang tải…')}</div>`; }
  const have = (p) => !!findByText(p.p);
  const left = R.patterns.filter((p) => !have(p)).length;
  return `<div class="page">${nav}<p class="muted small" style="margin:0 2px 12px">Thấy động từ là nhớ khung của nó: chỉ cần tìm A, B hoặc vế sau <i>that</i>. Thêm vào kho để ôn theo lịch như từ vựng (chủ đề “${PAT_DECK}”).</p>
    ${left ? `<button class="btn soft" data-act="r-pat-all">Thêm ${left} mẫu còn lại vào kho</button>` : `<div class="banner info">${icon('check')}<span>Đã có cả ${R.patterns.length} mẫu trong kho.</span></div>`}
    ${R.patterns.map((p, i) => `<div class="card r-pat"><div class="row-between"><b class="en">${esc(p.p)}</b>${have(p) ? `<span class="tag">Đã có</span>` : `<button class="tag" data-act="r-pat-add" data-i="${i}">+ Lưu</button>`}</div>
      <p class="small muted">${esc(p.vi)}</p><p class="en" style="margin-top:6px">${esc(p.ex)}</p><p class="small faint">${esc(p.src)}</p></div>`).join('')}</div>`;
}
async function patDeck() {
  const d = S.decks.find((x) => x.name === PAT_DECK);
  return d ? d.id : (await addDeck(PAT_DECK)).id;
}
async function addPattern(p, deckId) {
  if (findByText(p.p)) return false;
  const w = blankWord(deckId);
  Object.assign(w, { word: p.p, meaning: p.vi, pos: 'verb pattern', examples: [p.ex], notes: `Verb pattern · ${p.src}` });
  await saveWord(w);
  return true;
}
on('r-pat-add', async (el) => { const p = R.patterns?.[Number(el.dataset.i)]; if (!p) return; await addPattern(p, await patDeck()); toast(`Đã lưu “${p.p}”`); rerender(); });
on('r-pat-all', async () => {
  const deck = await patDeck();
  let n = 0;
  for (const p of R.patterns || []) if (await addPattern(p, deck)) n++;
  toast(`Đã thêm ${n} mẫu vào kho`);
  rerender();
});

// ================= BÀI ĐỌC CỦA BẠN =================
const ownList = () => [...S.reading.values()].filter((r) => r.kind === 'own').sort((a, b) => (a.at < b.at ? 1 : -1));
const splitSents = (t) => (String(t).replace(/(\d)\.(\d)/g, '$1․$2').match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || []).map((x) => x.replaceAll('․', '.').trim()).filter(Boolean);
function ownPassage(r) {
  const paras = String(r.text).split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean).map((t, i) => ({ label: String(i + 1), sents: splitSents(t), simp: [] }));
  return { title: r.title, subtitle: '', paras, footnote: [] };
}
export function ownListView() {
  const nav = navBar('Bài đọc của bạn', { fallback: '#/reading' });
  const list = ownList();
  return `<div class="page">${nav}<p class="muted small" style="margin:0 2px 12px">Dán bài từ sách của bạn. Bài chỉ lưu trên máy này (và trong file sao lưu), không gửi đi đâu.</p>
    <form class="card" data-submit="r-own-save"><input class="input" name="title" placeholder="Tiêu đề (ví dụ: Cam 13 Test 1 Passage 2)" maxlength="200" autocomplete="off">
      <textarea class="input" name="text" rows="8" placeholder="Dán bài đọc vào đây. Mỗi đoạn một dòng hoặc cách nhau một dòng trống." style="margin-top:10px;width:100%;resize:vertical" spellcheck="false"></textarea>
      <button class="btn" style="margin-top:12px">Lưu bài</button></form>
    ${list.length ? `<h2>Đã lưu</h2><div class="wlist" style="margin-top:0">${list.map((r) => `<div class="wrow" data-act="go" data-to="#/rownv/${encodeURIComponent(r.id)}"><div class="body"><span style="font-weight:600">${esc(r.title || 'Không tên')}</span><p>${r.at.split('-').reverse().join('/')} · ${ownPassage(r).paras.length} đoạn</p></div>${icon('chev')}</div>`).join('')}</div>` : ''}</div>`;
}
on('r-own-save', async (form) => {
  const fd = new FormData(form);
  const text = String(fd.get('text') || '').trim(), title = String(fd.get('title') || '').trim() || 'Bài đọc của tôi';
  if (text.split(/\s+/).length < 30) { toast('Bài quá ngắn (cần ít nhất 30 từ)'); return; }
  const id = `own:${uid()}`;
  await rPut({ id, kind: 'own', title, text: text.slice(0, 30000), at: today(), mains: {}, strike: {} });
  go(`#/rownv/${encodeURIComponent(id)}`);
});
let ownSaveT = null;
export function ownView(id) {
  const r = S.reading.get(id);
  const nav = navBar('Bài đọc của bạn', { fallback: '#/rown' });
  if (!r || r.kind !== 'own') return `<div class="page">${nav}<div class="empty"><p>Không tìm thấy bài này.</p></div></div>`;
  const p = ownPassage(r);
  return `<div class="page">${nav}<h1 style="font-size:24px;margin:0 2px 6px">${esc(r.title)}</h1>
    <p class="small muted" style="margin:0 2px 12px">Chạm từ để lưu vào kho. Mở “Simplify” để gạch phần phụ từng câu, rồi tự viết ý chính mỗi đoạn.</p>
    ${p.paras.map((pa, pi) => `<div class="card r-study">
      <div class="row-between"><b>Đoạn ${pa.label}</b></div>
      <div class="r-passage r-mini" data-act="r-word"><p>${pa.sents.map((s, si) => `<span class="rs" data-p="${pi}" data-s="${si}"><sup>${CIRC[si] || si + 1}</sup>${words(s)}</span>`).join(' ')}</p></div>
      <div class="r-study-side"><details class="r-det"><summary>Simplify (tự gạch)</summary>${pa.sents.map((s, si) => {
        const st = new Set(r.strike[`${pi}-${si}`] || []);
        return `<div class="r-toks" style="margin-top:8px">${s.split(/\s+/).map((t, k) => `<button class="r-tok ${st.has(k) ? 'struck' : ''}" data-act="r-own-strike" data-id="${esc(id)}" data-key="${pi}-${si}" data-k="${k}">${esc(t)}</button>`).join('')}</div>`;
      }).join('')}</details>
      <p class="small muted" style="margin:10px 0 6px">Ý chính của bạn</p><textarea class="input" rows="2" data-in="r-own-main" data-id="${esc(id)}" data-pi="${pi}" style="width:100%" placeholder="Một câu, tiếng Việt cũng được">${esc(r.mains[pi] || '')}</textarea></div>
    </div>`).join('')}
    <button class="btn danger" style="margin-top:16px" data-act="r-own-del" data-id="${esc(id)}">${icon('trash', 'sm')} Xoá bài</button></div>`;
}
on('r-own-strike', (el) => {
  const r = S.reading.get(el.dataset.id);
  if (!r) return;
  const k = Number(el.dataset.k), key = el.dataset.key;
  const st = new Set(r.strike[key] || []);
  if (st.has(k)) st.delete(k); else st.add(k);
  r.strike[key] = [...st];
  el.classList.toggle('struck');
  clearTimeout(ownSaveT); ownSaveT = setTimeout(() => rPut(r).catch(() => {}), 500);
});
on('r-own-main', (el) => {
  const r = S.reading.get(el.dataset.id);
  if (!r) return;
  r.mains[el.dataset.pi] = el.value;
  clearTimeout(ownSaveT); ownSaveT = setTimeout(() => rPut(r).catch(() => {}), 600);
});
on('r-own-del', async (el) => {
  if (!(await confirmSheet({ title: 'Xoá bài đọc này?', body: 'Bài và phần bạn đã gạch, ý chính sẽ bị xoá khỏi máy.', okLabel: 'Xoá', danger: true }))) return;
  await rDel(el.dataset.id);
  back('#/rown');
});

// ================= HỒ SƠ READING =================
export function statsView() {
  const nav = navBar('Hồ sơ Reading', { fallback: '#/reading' });
  const res = readingResults();
  if (!res.length) return `<div class="page">${nav}<div class="card empty"><div class="art">${icon('stats')}</div><h3>Chưa có bài nào</h3><p>Làm một passage, hồ sơ sẽ hiện ở đây.</p></div></div>`;
  const all = res.flatMap((r) => Object.values(r.answers));
  const ok = all.filter((a) => a.ok).length;
  const exam = res.filter((r) => r.mode !== 'guided');
  const avgMin = exam.length ? Math.round(exam.reduce((a, r) => a + r.ms, 0) / exam.length / 60e3) : null;
  // 8 tuần gần nhất: tỉ lệ đúng.
  // Ngày theo giờ địa phương (toISOString là giờ UTC, ở Việt Nam sẽ lệch một ngày).
  const loc = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mon = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return loc(d); };
  const start = new Date(mon(today()) + 'T00:00:00');
  const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() - 7 * (7 - i)); return { from: loc(d), ok: 0, n: 0, p: 0 }; });
  for (const r of res) { const w = weeks.find((x) => x.from === mon(r.at)); if (w) { w.p++; for (const a of Object.values(r.answers)) { w.n++; if (a.ok) w.ok++; } } }
  const lbl = (w) => w.from.slice(8, 10) + '/' + w.from.slice(5, 7);
  const chart = `<div class="card"><p class="small muted">Tỉ lệ đúng theo tuần (%)</p><div class="chart"><div class="bars w-bars" style="height:110px">${weeks.map((w) => {
    const pct = w.n ? Math.round((w.ok / w.n) * 100) : null;
    return `<div class="bar" style="cursor:default" title="Tuần ${lbl(w)}: ${w.p} passage"><span class="small" style="font-size:11.5px;color:var(--text-2);font-weight:600">${pct === null ? '' : pct}</span>${pct === null ? '<i class="none"></i>' : `<i style="height:${Math.max(3, pct * 0.76)}px;background:var(--series-1, var(--accent))"></i>`}<em>${lbl(w)}</em></div>`;
  }).join('')}</div></div></div>`;
  const byType = {};
  for (const a of all) { const t = a.type || 'mc'; byType[t] = byType[t] || { ok: 0, n: 0 }; byType[t].n++; if (a.ok) byType[t].ok++; }
  const types = Object.entries(byType).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n).map(([t, v]) => `<div class="row-between r-type"><span>${esc(TYPE_NAME[t] || t)}</span><b>${Math.round((v.ok / v.n) * 100)}% <span class="small muted">(${v.ok}/${v.n})</span></b></div>`).join('');
  const why = {};
  for (const a of all) if (!a.ok && a.why && REASONS[a.why]) why[a.why] = (why[a.why] || 0) + 1;
  const whys = Object.entries(why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="row-between r-type"><span>${esc(REASONS[k][0])}</span><b>${n}</b></div>`).join('');
  const locs = all.filter((a) => a.loc !== null && a.loc !== undefined);
  const fulls = fullResults().sort((a, b) => (a.at < b.at ? 1 : -1));
  return `<div class="page">${nav}
    <div class="tiles w-tiles"><div class="tile"><b>${res.length}</b><span>passage</span></div><div class="tile"><b>${Math.round((ok / all.length) * 100)}%</b><span>đúng (${ok}/${all.length})</span></div><div class="tile"><b>${avgMin === null ? '–' : avgMin + '′'}</b><span>/ passage khi làm như thi</span></div>${locs.length ? `<div class="tile"><b>${Math.round((locs.filter((a) => a.loc).length / locs.length) * 100)}%</b><span>định vị đúng</span></div>` : ''}</div>
    <h2>Theo tuần</h2>${chart}
    <h2>Theo dạng câu hỏi</h2><div class="card">${types}</div>
    ${whys ? `<h2>Lý do sai (mọi lúc)</h2><div class="card">${whys}</div>` : ''}
    ${fulls.length ? `<h2>Đề trọn 60 phút</h2><div class="wlist" style="margin-top:0">${fulls.map((f) => `<div class="wrow" data-act="go" data-to="#/rfull/${f.id}"><div class="body"><span style="font-weight:600">${esc(f.title)} · band ${f.band.toFixed(1)}</span><p>${f.at.split('-').reverse().join('/')} · ${f.score}/${f.total} câu · ${Math.round(f.ms / 60e3)} phút</p></div>${icon('chev')}</div>`).join('')}</div>` : ''}</div>`;
}
