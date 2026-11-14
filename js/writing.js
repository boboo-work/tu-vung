// Luyện Writing: Task 2 theo đoạn và Task 1 với biểu đồ tự sinh.
// Phản hồi không dùng AI: thống kê (đếm), đối chiếu số liệu (Task 1, app biết số liệu gốc),
// dò lỗi theo mẫu (luật trong content/writing/rules.json, chỉ là gợi ý), bài mẫu và tự chấm.
import { S, wPut, wDel, essays, logGrammarDay, dayOf, saveWord, findByText, blankWord, recordAnswer } from './store.js';
import { esc, toast, today, uid, download } from './util.js';
import { icon, on, go, back, replace, rerender, navBar, learnSwitch, confirmSheet } from './ui.js';
import { G as GR, logGrammarError } from './grammar.js';
import { confetti } from './fx.js';

// ================= NỘI DUNG =================
export const W = { state: 'idle', error: '', types: {}, parts: [], prompts: new Map(), order: [], rules: [], charts: [], modes: [] };

export async function loadWriting() {
  if (W.state === 'loading' || W.state === 'ready') return;
  W.state = 'loading';
  try {
    const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
    const [d, r] = await Promise.all([get('content/writing/writing.json'), get('content/writing/rules.json')]);
    W.types = d.types; W.parts = d.parts; W.charts = d.charts; W.modes = d.chartModes;
    d.prompts.forEach((p) => { W.prompts.set(p.id, p); W.order.push(p.id); });
    // Mỗi luật: biểu thức + lý do + cách sửa + nhãn lỗi dùng chung với Sổ lỗi ngữ pháp.
    W.rules = r.rules.map((x) => ({ ...x, rx: new RegExp(x.re, (x.flags || '') + 'gm') }));
    for (const [k, v] of Object.entries(d.tags || {})) if (!GR.tags[k]) GR.tags[k] = v;
    W.state = 'ready';
  } catch (e) {
    console.error(e);
    W.state = 'error';
    W.error = 'Chưa tải được nội dung Writing. Hãy mở app khi có mạng một lần để app lưu sẵn.';
  }
}

// ================= PHÂN TÍCH VĂN BẢN =================
const WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;
export const countWords = (t) => (String(t).match(WORD_RE) || []).length;
// Dấu chấm trong số thập phân (27.5%) không phải chỗ hết câu.
const DEC = '\u2024';
const sentencesOf = (t) => (String(t).replace(/(\d)\.(\d)/g, `$1${DEC}$2`).replace(/\n+/g, ' \n ').match(/[^.!?\n]+[.!?]*/g) || []).map((s) => s.replaceAll(DEC, '.').trim()).filter((s) => countWords(s) > 0);
const paragraphsOf = (t) => String(t).split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean);
const COMPLEX = /\b(because|although|though|while|whereas|which|who|whom|whose|unless|if|when|since|so that|in order to|that|whereby)\b/i;
const LINKERS = ['however', 'moreover', 'furthermore', 'in addition', 'therefore', 'as a result', 'consequently', 'for example', 'for instance', 'such as', 'on the other hand', 'in contrast', 'by contrast', 'nevertheless', 'although', 'whereas', 'because', 'since', 'in conclusion', 'overall', 'firstly', 'secondly', 'finally', 'in other words', 'that said', 'admittedly'];
const STOP = new Set('the a an and or but of to in on at for with by from as is are was were be been being this that these those it its they them their there which who whom whose what when where why how not no can could will would should may might must have has had do does did more most less many much some any such than then also very into over about between after before because while although so if each other only own same just been'.split(' '));
const EXAMPLE = /\b(for example|for instance|such as|e\.g\.|a case in point|in countries such as)\b/i;
const CONCLUDE = /^\s*(in conclusion|to conclude|to sum up|in summary|to summarise|to summarize|overall)\b/i;

export function textStats(t) {
  const words = String(t).match(WORD_RE) || [];
  const sents = sentencesOf(t);
  const lower = String(t).toLowerCase();
  const linkers = LINKERS.filter((l) => new RegExp(`\\b${l.replace(/ /g, '\\s+')}\\b`).test(lower));
  const freq = {};
  for (const w of words) { const k = w.toLowerCase(); if (k.length >= 4 && !STOP.has(k)) freq[k] = (freq[k] || 0) + 1; }
  const limit = Math.max(3, Math.ceil(words.length / 60));
  const repeated = Object.entries(freq).filter(([, n]) => n >= limit).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w, n]) => ({ w, n }));
  return {
    words: words.length, sentences: sents.length, paragraphs: paragraphsOf(t).length,
    avgLen: sents.length ? Math.round(words.length / sents.length) : 0,
    complex: sents.filter((s) => COMPLEX.test(s)).length, linkers: linkers.length, linkerList: linkers, repeated,
  };
}

/** Chạy bộ luật dò lỗi; trả về danh sách gợi ý (mỗi luật một lần trên mỗi câu). */
export function runRules(t) {
  const sents = sentencesOf(t);
  const hits = [];
  const seen = new Set();
  for (const r of W.rules) {
    r.rx.lastIndex = 0;
    let m;
    while ((m = r.rx.exec(t))) {
      if (m[0] === '') { r.rx.lastIndex++; continue; }
      const match = m[0].replace(/^[.!?\n\s]+/, '');
      const sent = sents.find((s) => s.toLowerCase().includes(match.toLowerCase().trim())) || match;
      const key = r.id + '|' + sent;
      if (!seen.has(key)) { seen.add(key); hits.push({ rule: r.id, text: sent, match: match.trim() }); }
    }
  }
  return hits;
}
const ruleOf = (id) => W.rules.find((r) => r.id === id);

const norm = (s) => String(s).toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9']+/g) || [];
function copiedPhrases(answer, question, n = 4) {
  const q = norm(question), a = norm(answer).join(' ');
  const out = [];
  for (let i = 0; i + n <= q.length; i++) {
    const gram = q.slice(i, i + n);
    if (gram.every((w) => STOP.has(w))) continue;
    const g = gram.join(' ');
    if (` ${a} `.includes(` ${g} `) && !out.some((o) => o.includes(g) || g.includes(o))) out.push(g);
  }
  return out;
}

// ================= KIỂM TRA TASK 2 THEO ĐOẠN =================
function partChecks(prompt, part, text) {
  const c = [];
  const n = countWords(text);
  if (n < part.min) c.push({ ok: false, msg: `Ngắn hơn mức gợi ý (${n}/${part.min}–${part.max} từ).` });
  else if (n > part.max) c.push({ ok: false, msg: `Dài hơn mức gợi ý (${n}/${part.min}–${part.max} từ).` });
  else c.push({ ok: true, msg: `Độ dài phù hợp (${n} từ).` });
  if (part.id === 'para') {
    const cp = copiedPhrases(text, prompt.q);
    c.push(cp.length ? { ok: false, msg: `Còn chép nguyên cụm của đề: “${cp.slice(0, 2).join('”, “')}”. Hãy diễn đạt khác.` } : { ok: true, msg: 'Không chép nguyên cụm 4 từ nào của đề.' });
  }
  if (part.id === 'thesis') {
    const t = W.types[prompt.type];
    c.push(new RegExp(t.thesis, 'i').test(text) ? { ok: true, msg: 'Có từ thể hiện câu trả lời cho dạng đề này.' } : { ok: false, msg: `Chưa rõ câu trả lời. ${t.hint}.` });
  }
  if (part.id === 'body1' || part.id === 'body2') {
    const st = textStats(text);
    c.push(st.linkers ? { ok: true, msg: `Có từ nối (${st.linkerList.slice(0, 3).join(', ')}).` } : { ok: null, msg: 'Chưa thấy từ nối (Firstly, Moreover, However…).' });
    c.push(EXAMPLE.test(text) ? { ok: true, msg: 'Có ví dụ cụ thể.' } : { ok: null, msg: 'Chưa thấy ví dụ (for example, for instance, such as…).' });
  }
  if (part.id === 'concl') c.push(CONCLUDE.test(text) ? { ok: true, msg: 'Mở đầu bằng cụm kết luận.' } : { ok: false, msg: 'Nên mở đầu bằng In conclusion / To sum up…' });
  return c;
}

// ================= TASK 2 CẢ BÀI =================
export const ESSAY = { min: 250, max: 320, ms: 40 * 60e3, planMs: 5 * 60e3 };
// Câu hỏi tự chấm, xếp theo 4 tiêu chí chấm IELTS.
const ESSAY_SELF = [
  ['Task Response', 'Bài trả lời đủ mọi phần của đề, không bỏ sót vế nào?'],
  ['Task Response', 'Quan điểm rõ ngay mở bài và giữ nhất quán đến kết bài?'],
  ['Task Response', 'Mỗi ý chính đều có giải thích và ví dụ cụ thể?'],
  ['Coherence & Cohesion', 'Mỗi đoạn thân bài chỉ có một ý chính, nêu ở câu đầu đoạn?'],
  ['Coherence & Cohesion', 'Từ nối dùng tự nhiên, không lặp đi lặp lại một từ?'],
  ['Lexical Resource', 'Diễn đạt lại ý của đề bằng từ của mình, ít lặp từ?'],
  ['Lexical Resource', 'Dùng được vài từ hoặc cụm từ đúng chủ đề (kể cả từ trong kho)?'],
  ['Grammatical Range & Accuracy', 'Có cả câu đơn và câu phức, không câu nào quá dài khó hiểu?'],
  ['Grammatical Range & Accuracy', 'Đã đọc lại để sửa chia động từ, mạo từ, số nhiều?'],
];
const essayParas = (t) => paragraphsOf(t);

export function essayChecks(prompt, text, ms) {
  const c = [];
  const n = countWords(text);
  c.push(n < ESSAY.min ? { ok: false, msg: `Chưa đủ ${ESSAY.min} từ (${n} từ). Bài dưới 250 từ bị trừ điểm.` }
    : n > ESSAY.max ? { ok: null, msg: `${n} từ, hơi dài. Viết dài không được thêm điểm mà dễ thiếu giờ đọc lại.` }
    : { ok: true, msg: `Độ dài phù hợp (${n} từ).` });
  const ps = essayParas(text);
  c.push(ps.length >= 4 && ps.length <= 5 ? { ok: true, msg: `Chia ${ps.length} đoạn rõ ràng.` }
    : { ok: false, msg: ps.length < 4 ? `Mới có ${ps.length} đoạn. Nên có mở bài, 2 đoạn thân bài, kết bài (xuống dòng giữa các đoạn).` : `${ps.length} đoạn là nhiều. Nên gộp lại thành 4–5 đoạn.` });
  if (!ps.length) return c;
  const intro = ps[0], concl = ps.length > 1 ? ps[ps.length - 1] : '', bodies = ps.slice(1, -1);
  const t = W.types[prompt.type];
  c.push(new RegExp(t.thesis, 'i').test(intro) ? { ok: true, msg: 'Mở bài có câu trả lời cho dạng đề này.' } : { ok: false, msg: `Mở bài chưa nêu rõ câu trả lời. ${t.hint}.` });
  const cp = copiedPhrases(intro, prompt.q);
  c.push(cp.length ? { ok: false, msg: `Mở bài còn chép nguyên cụm của đề: “${cp.slice(0, 2).join('”, “')}”.` } : { ok: true, msg: 'Mở bài không chép nguyên cụm 4 từ nào của đề.' });
  if (bodies.length) {
    // Chỉ dò được ví dụ có từ báo hiệu; ví dụ ngầm thì người viết tự đánh giá ở bước tự chấm.
    const withEx = bodies.filter((b) => EXAMPLE.test(b) || /\b(in countries where|in many (?:countries|cities|places|areas)|a good example)\b/i.test(b)).length;
    c.push(withEx ? { ok: true, msg: `Có ví dụ rõ ràng ở ${withEx}/${bodies.length} đoạn thân bài.` } : { ok: null, msg: 'Chưa thấy ví dụ có từ báo hiệu (for example, such as…). Mỗi đoạn thân bài nên có một ví dụ cụ thể.' });
  }
  const st = textStats(text);
  c.push(st.linkers >= 3 ? { ok: true, msg: `Dùng ${st.linkers} từ nối khác nhau.` } : { ok: null, msg: `Mới dùng ${st.linkers} từ nối khác nhau; nên có ít nhất 3–4.` });
  c.push(CONCLUDE.test(concl) ? { ok: true, msg: 'Đoạn cuối mở đầu bằng cụm kết luận.' } : { ok: false, msg: 'Đoạn cuối nên mở đầu bằng In conclusion / To sum up…' });
  const min = Math.round(ms / 60e3);
  c.push(ms <= ESSAY.ms ? { ok: true, msg: `Xong trong ${min} phút (giới hạn 40).` } : { ok: null, msg: `Mất ${min} phút, quá giờ ${min - 40} phút. Thi thật sẽ không kịp viết hết.` });
  return c;
}

// ================= GỢI Ý TỪ TRONG KHO =================
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Biểu thức bắt cả dạng biến đổi của từ (economy → economic, reduce → reducing). */
export function wordRe(word) {
  const toks = String(word).toLowerCase().match(/[a-z]+(?:['’-][a-z]+)*/g) || [];
  if (!toks.length || toks.length > 4 || !toks.some((x) => x.length >= 4 && !STOP.has(x))) return null;
  const parts = toks.map((x) => (STOP.has(x) || x.length < 4 ? reEsc(x) : reEsc(x.length > 5 ? x.replace(/(ing|ed|es|e|y|s)$/, '') : x.replace(/e$/, '')) + '[a-z]*'));
  return new RegExp(`\\b${parts.join('[\\s-]+')}\\b`, 'i');
}
/** Từ trong kho hợp với đề: xuất hiện trong bài mẫu (đúng chủ đề) hoặc trong đề; ưu tiên từ đã học. */
export function suggestWords(prompt, limit = 6) {
  const model = Object.values(prompt.model).join(' ');
  const out = [];
  for (const w of S.words.values()) {
    const word = String(w.word || '').trim();
    const re = word && wordRe(word);
    if (!re) continue;
    let sc = (re.test(model) ? 3 : 0) + (re.test(prompt.q) ? 1 : 0);
    if (!sc) continue;
    if (w.srs && w.srs.state !== 'new') sc += 1;
    out.push({ id: w.id, word, meaning: String(w.meaning || '').slice(0, 60), re: re.source, sc });
  }
  return out.sort((a, b) => b.sc - a.sc || a.word.length - b.word.length).slice(0, limit);
}
const usedWords = (list, text) => (list || []).filter((x) => new RegExp(x.re, 'i').test(text));
function vocabHtml(list, text) {
  if (!list?.length) return '';
  return `<div class="w-vocab"><p class="small muted">Từ trong kho hợp với đề, thử dùng (chạm để xem nghĩa):</p><div class="w-chips">${list.map((x) => `<button type="button" class="w-chip ${new RegExp(x.re, 'i').test(text) ? 'used' : ''}" data-re="${esc(x.re)}" data-act="w-chip" data-m="${esc(x.meaning)}">${esc(x.word)}</button>`).join('')}</div></div>`;
}
on('w-chip', (el) => toast(el.dataset.m ? `${el.textContent}: ${el.dataset.m}` : el.textContent));

// ================= VIẾT LẠI & SO SÁNH =================
/** So từng từ giữa hai bản (LCS), trả về các đoạn giữ / bỏ / thêm. */
export function wordDiff(a, b) {
  const A = String(a).split(/(\s+)/).filter((x) => x !== ''), B = String(b).split(/(\s+)/).filter((x) => x !== '');
  const n = A.length, m = B.length;
  if (n * m > 1.2e6) return [{ t: 'del', s: a }, { t: 'ins', s: b }];
  const k = (x) => (/^\s+$/.test(x) ? ' ' : x);
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = k(A[i]) === k(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (t, x) => { const last = out[out.length - 1]; if (last && last.t === t) last.s += x; else out.push({ t, s: x }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (k(A[i]) === k(B[j])) { push('eq', B[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) push('del', A[i++]);
    else push('ins', B[j++]);
  }
  while (i < n) push('del', A[i++]);
  while (j < m) push('ins', B[j++]);
  return out;
}
const liveHits = (rec) => rec.report.hits.filter((h) => !rec.report.dismissed.includes(h.rule + '|' + h.text));
const okCount = (rec) => rec.report.checks.filter((c) => c.ok === true).length;
/** So bản mới với bản trước: thống kê, số gợi ý lỗi, lỗi đã sửa / lỗi mới theo loại. */
export function compareVersions(prev, cur) {
  const count = (rec) => { const m = {}; for (const h of liveHits(rec)) m[h.rule] = (m[h.rule] || 0) + 1; return m; };
  const a = count(prev), b = count(cur);
  const fixed = Object.keys(a).filter((r) => (b[r] || 0) < a[r]);
  const added = Object.keys(b).filter((r) => (a[r] || 0) < b[r]);
  const row = (label, x, y, better) => ({ label, x, y, good: y === x ? null : better === 'up' ? y > x : better === 'down' ? y < x : null });
  return {
    rows: [
      row('Gợi ý lỗi', liveHits(prev).length, liveHits(cur).length, 'down'),
      row('Kiểm tra đạt', `${okCount(prev)}/${prev.report.checks.length}`, `${okCount(cur)}/${cur.report.checks.length}`, null),
      row('Số từ', prev.report.stats.words || prev.words, cur.report.stats.words || cur.words, null),
      row('Câu phức', prev.report.stats.complex || 0, cur.report.stats.complex || 0, 'up'),
      row('Từ nối', prev.report.stats.linkers || 0, cur.report.stats.linkers || 0, 'up'),
    ].map((r) => (r.label === 'Kiểm tra đạt' ? { ...r, good: okCount(cur) === okCount(prev) ? null : okCount(cur) > okCount(prev) } : r)),
    fixed, added,
  };
}
function compareHtml(prev, cur) {
  const c = compareVersions(prev, cur);
  const arrow = (r) => (r.good === true ? `<span class="up">${icon('check', 'sm')}</span>` : r.good === false ? '<span class="down">!</span>' : '');
  const name = (id) => esc(GR.tags[ruleOf(id)?.tag]?.name || ruleOf(id)?.why?.replace(/\*+/g, '').slice(0, 50) || id);
  const diff = wordDiff(prev.text, cur.text).map((d) => (d.t === 'eq' ? esc(d.s) : d.t === 'del' ? `<del>${esc(d.s)}</del>` : `<ins>${esc(d.s)}</ins>`)).join('');
  return `<h3 class="w-h">So với bản ${prev.version || 1}</h3><div class="card"><table class="data w-cmp"><tr><th></th><th>Bản ${prev.version || 1}</th><th>Bản ${cur.version || 2}</th><th></th></tr>
    ${c.rows.map((r) => `<tr><td>${r.label}</td><td>${r.x}</td><td><b>${r.y}</b></td><td>${arrow(r)}</td></tr>`).join('')}</table>
    ${c.fixed.length ? `<p class="small" style="margin-top:10px"><b class="ok-t">Đã sửa:</b> ${[...new Set(c.fixed.map(name))].join(' · ')}</p>` : ''}
    ${c.added.length ? `<p class="small" style="margin-top:6px"><b class="no-t">Lỗi mới:</b> ${[...new Set(c.added.map(name))].join(' · ')}</p>` : ''}
    <details class="w-diff"><summary>Xem chỗ đã sửa</summary><div class="w-text en">${diff}</div></details></div>`;
}

// ================= TASK 1: SINH BIỂU ĐỒ =================
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function genChart(tplId, seed, target) {
  const tpl = W.charts.find((c) => c.id === tplId) || W.charts[0];
  const r = rng(seed);
  const n = tpl.xs.length, half = tpl.step / 2, lo = tpl.min, hi = tpl.max, span = hi - lo;
  const snap = (v) => Math.min(hi, Math.max(lo, Math.round(v / half) * half));
  const between = (a, b) => a + (b - a) * r();
  // Luôn có ít nhất một đối tượng tăng và một đối tượng giảm, để bài có điều để so sánh.
  const shapes = shuffle(['rise', 'fall', ...shuffle(['peak', 'stable', 'dip', 'rise', 'fall'], r)].slice(0, tpl.series.length), r);
  const series = tpl.series.map((s, k) => {
    const shape = shapes[k];
    let vals;
    const ramp = (a, b) => {
      const w = Array.from({ length: n - 1 }, () => 0.4 + r());
      const sum = w.reduce((x, y) => x + y, 0);
      let acc = a; const out = [a];
      for (const x of w) { acc += ((b - a) * x) / sum; out.push(acc); }
      return out;
    };
    if (shape === 'rise') { const a = between(lo + span * 0.05, lo + span * 0.35); vals = ramp(a, a + between(span * 0.35, span * 0.55)); }
    else if (shape === 'fall') { const a = between(hi - span * 0.35, hi - span * 0.05); vals = ramp(a, a - between(span * 0.35, span * 0.55)); }
    else if (shape === 'stable') { const a = between(lo + span * 0.3, lo + span * 0.6); vals = Array.from({ length: n }, () => a + (r() - 0.5) * tpl.step); }
    else {
      const p = 1 + Math.floor(r() * (n - 2));
      const a = between(lo + span * 0.25, lo + span * 0.5);
      const peak = shape === 'peak' ? a + between(span * 0.3, span * 0.45) : a - between(span * 0.15, span * 0.22);
      const end = shape === 'peak' ? a + between(span * 0.0, span * 0.15) : a + between(-span * 0.05, span * 0.1);
      vals = [...ramp(a, peak).slice(0, p + 1).map((_, i, arr) => a + ((peak - a) * i) / p), ...Array.from({ length: n - p - 1 }, (_, i) => peak + ((end - peak) * (i + 1)) / (n - p - 1))];
    }
    return { ...s, values: vals.map(snap) };
  });
  const t = Number.isInteger(target) && target < series.length ? target : Math.floor(r() * series.length);
  return { tpl, seed, series, target: t, xs: tpl.xs };
}

const fmtNum = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtV = (tpl, v) => (tpl.unit === '%' ? `${fmtNum(v)}%` : `${fmtNum(v)} ${tpl.short}`);
const chartWord = (tpl) => (tpl.kind === 'line' ? 'line graph' : 'bar chart');
const chartPrompt = (ch) => `The ${chartWord(ch.tpl)} below shows ${ch.tpl.title} from ${ch.xs[0]} to ${ch.xs[ch.xs.length - 1]}. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.`;

function describe(ch, s) {
  const { tpl, xs } = ch, v = s.values, n = v.length, tol = tpl.step;
  const f = (x) => fmtV(tpl, x);
  const iMax = v.indexOf(Math.max(...v)), iMin = v.indexOf(Math.min(...v));
  if (iMax > 0 && iMax < n - 1 && v[iMax] - v[0] > tol && v[iMax] - v[n - 1] > tol) return `${s.name} rose from ${f(v[0])} in ${xs[0]} to a peak of ${f(v[iMax])} in ${xs[iMax]}, before falling to ${f(v[n - 1])} in ${xs[n - 1]}.`;
  if (iMin > 0 && iMin < n - 1 && v[0] - v[iMin] > tol && v[n - 1] - v[iMin] > tol) return `${s.name} fell from ${f(v[0])} in ${xs[0]} to a low of ${f(v[iMin])} in ${xs[iMin]}, before recovering to ${f(v[n - 1])} in ${xs[n - 1]}.`;
  const d = v[n - 1] - v[0];
  if (d > tol) return `${s.name} increased from ${f(v[0])} in ${xs[0]} to ${f(v[n - 1])} in ${xs[n - 1]}.`;
  if (d < -tol) return `${s.name} decreased from ${f(v[0])} in ${xs[0]} to ${f(v[n - 1])} in ${xs[n - 1]}.`;
  const avg = Math.round(v.reduce((a, b) => a + b, 0) / n / (tpl.step / 2)) * (tpl.step / 2);
  return `${s.name} remained relatively stable at around ${f(avg)} throughout the period.`;
}
function moves(ch) {
  const d = ch.series.map((s) => s.values[s.values.length - 1] - s.values[0]);
  const up = d.indexOf(Math.max(...d)), down = d.indexOf(Math.min(...d));
  const last = ch.series.map((s) => s.values[s.values.length - 1]);
  const big = d.map(Math.abs).indexOf(Math.max(...d.map(Math.abs)));
  return { d, up: d[up] > ch.tpl.step ? up : -1, down: d[down] < -ch.tpl.step ? down : -1, top: last.indexOf(Math.max(...last)), big };
}
function overviewModel(ch) {
  const m = moves(ch), S_ = ch.series, end = ch.xs[ch.xs.length - 1];
  const parts = [];
  if (m.up >= 0) parts.push(`${S_[m.up].name} saw the most significant increase`);
  if (m.down >= 0) parts.push(`${S_[m.down].name} declined over the period`);
  let s = parts.length ? `Overall, ${parts.join(', while ')}.` : 'Overall, the figures remained relatively stable over the period.';
  s += ` By ${end}, ${S_[m.top].name} had the highest figure.`;
  return s;
}
function chartModel(ch, mode) {
  if (mode === 'detail') return describe(ch, ch.series[ch.target]);
  if (mode === 'overview') return overviewModel(ch);
  const intro = `The ${chartWord(ch.tpl)} illustrates changes in ${ch.tpl.title} over the period between ${ch.xs[0]} and ${ch.xs[ch.xs.length - 1]}.`;
  const lines = ch.series.map((s) => describe(ch, s));
  const half = Math.ceil(lines.length / 2);
  return `${intro} ${overviewModel(ch)}\n\n${lines.slice(0, half).join(' ')}\n\n${lines.slice(half).map((l, i) => (i === 0 ? `By contrast, ${l[0].toLowerCase()}${l.slice(1)}` : l)).join(' ')}`;
}

// ---- Đối chiếu câu với số liệu ----
const UP = /\b(ris(e|es|ing)|rose|risen|increas\w*|gr(ew|ow|ows|owing|own|owth)|climb\w*|went up|go(es)? up|doubl\w*|tripl\w*|surg\w*|soar\w*|jump\w*|peak\w*|recover\w*|rebound\w*|bounced back)\b/i;
const DOWN = /\b(fall|falls|fell|fallen|falling|decreas\w*|declin\w*|drop\w*|went down|plummet\w*|plung\w*|halv\w*|shr[ai]nk\w*)\b/i;
const FLAT = /\b(stable|steady|remain\w*|unchanged|level\w* off|plateau\w*|constant)\b/i;
const APPROX = /\b(about|around|approximately|roughly|nearly|almost|just over|just under|over|under|some)\b/i;
const OVERVIEW = /\b(overall|in general|generally|it is clear|it is evident|it can be seen|on the whole)\b/i;

// Năm: 19xx/20xx, hoặc số 4 chữ số đứng sau "in" ("in 1850") dù không có trên biểu đồ.
const yearsIn = (t) => [...String(t).matchAll(/\b(in\s+)?(\d{4})\b/gi)].filter((m) => m[1] || /^(19|20)/.test(m[2])).map((m) => Number(m[2]));
const stripYears = (t) => String(t).replace(/\b(in\s+)?(\d{4})\b/gi, (m, pre, y) => (pre || /^(19|20)/.test(y) ? (pre || '') + ' ' : m));
function readNumbers(sentence, tpl) {
  const noYears = stripYears(sentence);
  const out = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(noYears))) {
    let v = Number(m[1].replace(/,/g, ''));
    if (tpl.scale && v >= tpl.scale) v /= tpl.scale;
    out.push({ v, at: m.index, raw: m[1] });
  }
  return { nums: out, text: noYears };
}
const prepNum = (text, word) => {
  const m = new RegExp(`\\b${word}\\s+(?:about|around|approximately|roughly|nearly|almost|just over|just under|over|under|some)?\\s*(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)`, 'i').exec(text);
  return m ? m[1] : null;
};

function detailChecks(ch, sentence, t, { skipName = false } = {}) {
  const { tpl, xs } = ch, s = ch.series[t], v = s.values, name = s.name;
  const c = [];
  const lower = sentence.toLowerCase();
  const tol = tpl.step / 2 + (APPROX.test(sentence) ? tpl.step / 2 : 0) + 1e-9;
  const near = (a, b) => Math.abs(a - b) <= tol;
  const sc = (x) => (tpl.scale && x >= tpl.scale ? x / tpl.scale : x);
  const f = (x) => fmtV(tpl, x);
  if (!skipName) {
    const mentioned = ch.series.map((x, i) => (new RegExp(`\\b${x.key}\\b`, 'i').test(lower) ? i : -1)).filter((i) => i >= 0);
    if (mentioned.includes(t)) c.push({ ok: true, msg: `Có nêu đúng đối tượng (${name}).` });
    else if (mentioned.length) c.push({ ok: false, msg: `Câu đang nói về ${ch.series[mentioned[0]].name}, bài yêu cầu ${name}.` });
    else c.push({ ok: false, msg: `Câu chưa nêu tên đối tượng (${name}).` });
  }
  const years = yearsIn(sentence);
  const bad = years.filter((y) => !xs.includes(y));
  bad.forEach((y) => c.push({ ok: false, msg: `Năm ${y} không có trong biểu đồ (${xs[0]}–${xs[xs.length - 1]}).` }));
  const ys = [...new Set(years.filter((y) => xs.includes(y)))].sort();
  const i0 = ys.length >= 2 ? xs.indexOf(ys[0]) : ys.length ? null : 0;
  const i1 = ys.length >= 2 ? xs.indexOf(ys[ys.length - 1]) : ys.length ? null : xs.length - 1;
  if (!skipName && !bad.length) c.push(ys.length ? { ok: true, msg: 'Có mốc thời gian.' } : { ok: null, msg: 'Nên nêu năm cho số liệu.' });
  // Xu hướng
  const up = UP.test(sentence), down = DOWN.test(sentence), flat = FLAT.test(sentence);
  if (i0 !== null && i1 !== null && (up || down || flat)) {
    if (up && down) c.push({ ok: null, msg: 'Câu có cả tăng lẫn giảm; app chỉ kiểm tra số liệu.' });
    else {
      const d = v[i1] - v[i0];
      const actual = d > tpl.step ? 'up' : d < -tpl.step ? 'down' : 'flat';
      const said = up ? 'up' : down ? 'down' : 'flat';
      const vi = { up: 'tăng', down: 'giảm', flat: 'gần như không đổi' };
      c.push(actual === said || (said === 'up' && /\bpeak/i.test(sentence))
        ? { ok: true, msg: `Xu hướng đúng: ${xs[i0]}–${xs[i1]} ${name} ${vi[actual]}.` }
        : { ok: false, msg: `Từ ${xs[i0]} đến ${xs[i1]}, ${name} thực tế ${vi[actual]} (${f(v[i0])} → ${f(v[i1])}).` });
    }
  }
  // Số liệu theo giới từ
  const { nums, text } = readNumbers(sentence, tpl);
  const used = new Set();
  const take = (raw) => { const n = nums.find((x) => x.raw === raw && !used.has(x)); if (n) used.add(n); return n; };
  const from = prepNum(text, 'from'), to = prepNum(text, 'to'), by = prepNum(text, 'by');
  const at = prepNum(text, 'at') || prepNum(text, 'of');
  if (from && i0 !== null) { const n = take(from); if (n) c.push(near(n.v, v[i0]) ? { ok: true, msg: `“from ${from}” khớp số liệu năm ${xs[i0]}.` } : { ok: false, msg: `“from ${from}”: năm ${xs[i0]}, ${name} là ${f(v[i0])}.` }); }
  if (to && i1 !== null) { const n = take(to); if (n) c.push(near(n.v, v[i1]) ? { ok: true, msg: `“to ${to}” khớp số liệu năm ${xs[i1]}.` } : { ok: false, msg: `“to ${to}”: năm ${xs[i1]}, ${name} là ${f(v[i1])}.` }); }
  if (by && i0 !== null && i1 !== null) { const n = take(by); const d = Math.abs(v[i1] - v[i0]); if (n) c.push(near(n.v, d) ? { ok: true, msg: `“by ${by}” khớp mức thay đổi.` } : { ok: false, msg: `“by ${by}”: mức thay đổi ${xs[i0]}–${xs[i1]} là ${f(d)} (by = thay đổi bao nhiêu; to = thay đổi đến mức nào).` }); }
  if (at) { const n = take(at); if (n) c.push(v.some((x) => near(n.v, x)) ? { ok: true, msg: `Số ${at} khớp một mốc của ${name}.` } : { ok: false, msg: `Số ${at} không khớp mốc nào của ${name}.` }); }
  // Câu chỉ có một mốc năm ("… to 40% in 2010") → số phải khớp số liệu của đúng năm đó.
  const iy = ys.length === 1 ? xs.indexOf(ys[0]) : -1;
  for (const n of nums) {
    if (used.has(n)) continue;
    let ok;
    if (iy >= 0) ok = near(n.v, v[iy]) || v.some((x) => near(n.v, Math.abs(v[iy] - x)));
    else {
      const diffs = [];
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) diffs.push(Math.abs(v[j] - v[i]));
      ok = v.some((x) => near(n.v, x)) || diffs.some((x) => near(n.v, x));
    }
    c.push(ok ? { ok: true, msg: `Số ${n.raw} khớp số liệu.` }
      : { ok: false, msg: iy >= 0 ? `Số ${n.raw}: năm ${xs[iy]}, ${name} là ${f(v[iy])}.` : `Số ${n.raw} không khớp số liệu của ${name} (${v.map(f).join(', ')}).` });
  }
  if (c.filter((x) => !/đối tượng|mốc thời gian|Nên nêu năm/.test(x.msg)).length === 0) c.push({ ok: null, msg: 'Chưa có số liệu hay xu hướng để kiểm tra.' });
  return c;
}
function overviewChecks(ch, text) {
  const c = [];
  const m = moves(ch);
  c.push(OVERVIEW.test(text) ? { ok: true, msg: 'Có cụm mở đầu tổng quan (Overall…).' } : { ok: false, msg: 'Nên mở đầu bằng Overall / In general / It is clear that…' });
  const { nums } = readNumbers(text, ch.tpl);
  c.push(nums.length ? { ok: false, msg: 'Câu tổng quan không nên có số liệu cụ thể; để số cho đoạn chi tiết.' } : { ok: true, msg: 'Không có số liệu cụ thể.' });
  const big = ch.series[m.big];
  c.push(new RegExp(`\\b${big.key}\\b`, 'i').test(text) ? { ok: true, msg: `Có nhắc tới ${big.name}, đối tượng thay đổi nhiều nhất.` } : { ok: false, msg: `Nên nhắc tới ${big.name}, đối tượng thay đổi nhiều nhất.` });
  c.push(/\b(increas|decreas|ris|rose|fell|fall|declin|grew|grow|highest|lowest|most|least|stable|popular|dominant)\w*/i.test(text) ? { ok: true, msg: 'Có từ chỉ xu hướng hoặc so sánh.' } : { ok: null, msg: 'Chưa thấy từ chỉ xu hướng hoặc so sánh.' });
  return c;
}
function fullChecks(ch, text) {
  const c = [];
  const sents = sentencesOf(text);
  c.push(/\b(shows?|illustrates?|compares?|depicts?|presents?|gives information|provides information)\b/i.test(sents[0] || '') ? { ok: true, msg: 'Câu đầu giới thiệu biểu đồ.' } : { ok: false, msg: 'Câu đầu nên giới thiệu biểu đồ (The line graph illustrates…).' });
  const ov = sents.find((s) => OVERVIEW.test(s));
  if (!ov) c.push({ ok: false, msg: 'Chưa có câu tổng quan (Overall, …).' });
  else c.push(...overviewChecks(ch, ov).filter((x) => !/mở đầu tổng quan/.test(x.msg)).map((x) => ({ ...x, msg: 'Tổng quan: ' + x.msg })));
  let total = 0, good = 0;
  const problems = [];
  for (const s of sents) {
    if (s === ov) continue;
    const idx = ch.series.map((x, i) => (new RegExp(`\\b${x.key}\\b`, 'i').test(s) ? i : -1)).filter((i) => i >= 0);
    if (idx.length !== 1 || !(/\d/.test(stripYears(s)) || UP.test(s) || DOWN.test(s) || FLAT.test(s))) continue;
    total++;
    const res = detailChecks(ch, s, idx[0], { skipName: true });
    const errs = res.filter((x) => x.ok === false);
    if (errs.length) problems.push(...errs.map((x) => ({ ok: false, msg: `«${s.slice(0, 50)}${s.length > 50 ? '…' : ''}» ${x.msg}` })));
    else good++;
  }
  c.push(total ? { ok: good === total ? true : false, msg: `${good}/${total} câu số liệu khớp biểu đồ.` } : { ok: null, msg: 'Chưa tìm thấy câu số liệu nào để đối chiếu (mỗi câu nên nêu tên một đối tượng).' });
  return [...c, ...problems.slice(0, 8)];
}

// ================= VẼ BIỂU ĐỒ =================
const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
export function chartSvg(ch, highlight = -1) {
  const { tpl, xs, series } = ch;
  const Wd = 340, Hd = 210, L = 34, R = tpl.kind === 'line' ? 78 : 8, T = 10, B = 24;
  const pw = Wd - L - R, ph = Hd - T - B;
  const maxV = Math.max(...series.flatMap((s) => s.values));
  let tick = tpl.step; const top = Math.ceil(maxV / tpl.step) * tpl.step;
  if (top / tick > 8) tick *= 2;
  const yTop = Math.ceil(top / tick) * tick;
  const Y = (v) => T + ph - (v / yTop) * ph;
  const grid = [];
  for (let v = 0; v <= yTop + 1e-9; v += tick) grid.push(`<line x1="${L}" x2="${L + pw}" y1="${Y(v)}" y2="${Y(v)}" class="cg"/><text x="${L - 5}" y="${Y(v) + 3.5}" text-anchor="end" class="ct">${fmtNum(v)}</text>`);
  const op = (i) => (highlight >= 0 && i !== highlight ? 0.28 : 1);
  let marks = '';
  if (tpl.kind === 'line') {
    const X = (i) => L + (pw * i) / (xs.length - 1);
    series.forEach((s, i) => {
      const d = s.values.map((v, k) => `${k ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
      marks += `<g opacity="${op(i)}"><path d="${d}" fill="none" stroke="${COLORS[i]}" stroke-width="${i === highlight ? 2.6 : 2}" stroke-linejoin="round"/>${s.values.map((v, k) => `<circle cx="${X(k)}" cy="${Y(v)}" r="3" fill="${COLORS[i]}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}</g>`;
    });
    // Nhãn trực tiếp ở cuối mỗi đường, đẩy ra nếu chồng nhau.
    const ends = series.map((s, i) => ({ i, y: Y(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 12) ends[k].y = ends[k - 1].y + 12;
    marks += ends.map((e) => `<text x="${L + pw + 6}" y="${e.y + 3.5}" class="cl" opacity="${op(e.i)}">${esc(series[e.i].name)}</text>`).join('');
    marks += xs.map((x, k) => `<text x="${X(k)}" y="${Hd - 6}" text-anchor="middle" class="ct">${x}</text>`).join('');
  } else {
    const gw = pw / xs.length, inner = gw * 0.78, bw = inner / series.length;
    xs.forEach((x, k) => {
      const gx = L + gw * k + (gw - inner) / 2;
      series.forEach((s, i) => {
        const v = s.values[k], h = (v / yTop) * ph;
        marks += `<rect x="${(gx + bw * i + 1).toFixed(1)}" y="${Y(v).toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="${COLORS[i]}" opacity="${op(i)}"/>`;
      });
      marks += `<text x="${L + gw * k + gw / 2}" y="${Hd - 6}" text-anchor="middle" class="ct">${x}</text>`;
    });
  }
  const legend = `<div class="legend chart-legend">${series.map((s, i) => `<span style="opacity:${op(i)}"><i style="background:${COLORS[i]}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  const table = `<details class="chart-table"><summary>Xem bảng số liệu</summary><table class="data"><tr><th></th>${xs.map((x) => `<th>${x}</th>`).join('')}</tr>${series.map((s) => `<tr><td>${esc(s.name)}</td>${s.values.map((v) => `<td>${fmtNum(v)}</td>`).join('')}</tr>`).join('')}</table></details>`;
  return `<div class="card wchart"><p class="small muted">${esc(tpl.unit === '%' ? 'Đơn vị: %' : `Đơn vị: ${tpl.unit}`)}</p>${legend}
    <svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="${esc(tpl.title)}">${grid.join('')}<line x1="${L}" x2="${L + pw}" y1="${Y(0)}" y2="${Y(0)}" class="ca"/>${marks}</svg>${table}</div>`;
}

// ================= TRẠNG THÁI =================
const partDone = (pid, part) => essays().find((e) => e.kind === 'part' && e.promptId === pid && e.part === part);
export const todayWriting = () => (dayOf().wEssays || []).length;
const essayDone = (pid) => essays().filter((e) => e.kind === 'essay' && e.promptId === pid);
function interleaved() {
  const byType = Object.keys(W.types).map((t) => W.order.filter((id) => W.prompts.get(id).type === t));
  const out = [];
  for (let i = 0; i < 6; i++) byType.forEach((list) => list[i] && out.push(list[i]));
  return out;
}
/** Gợi ý bài kế tiếp: lần lượt từng đề, từng phần; các dạng đề xen kẽ nhau. */
export function nextPart() {
  if (W.state !== 'ready') return null;
  for (const id of interleaved()) for (const p of W.parts) if (!partDone(id, p.id)) return { prompt: W.prompts.get(id), part: p };
  return null;
}
/** Đề kế tiếp để viết cả bài: ưu tiên đề đã luyện đủ 5 phần, rồi tới đề chưa viết cả bài. */
export function nextEssay() {
  if (W.state !== 'ready') return null;
  const ids = interleaved().filter((id) => !essayDone(id).length);
  const id = ids.find((x) => W.parts.every((p) => partDone(x, p.id))) || ids[0];
  return id ? W.prompts.get(id) : null;
}

let ws = null;
let saveTimer = null;

let saveSnap = null;
let tick = null;

function startPart(promptId, partId) {
  const prompt = W.prompts.get(promptId), part = W.parts.find((p) => p.id === partId);
  if (!prompt || !part) return toast('Không tìm thấy đề này');
  const key = `draft:${promptId}:${partId}`;
  ws = { kind: 'part', prompt, part, key, text: S.writing.get(key)?.text || '', stage: 'write', startedAt: Date.now(), self: {}, vocab: suggestWords(prompt, 5) };
  go('#/wwrite');
}
function startEssay(promptId) {
  const prompt = W.prompts.get(promptId);
  if (!prompt) return toast('Không tìm thấy đề này');
  const key = `draft:${promptId}:essay`;
  const d = S.writing.get(key);
  ws = {
    kind: 'essay', prompt, key, text: d?.text || '', plan: { view: '', p1: '', p2: '', ex: '', ...(d?.plan || {}) },
    stage: d && ['plan', 'write'].includes(d.stage) ? d.stage : 'plan',
    // Đồng hồ tính theo mốc thời gian, nên khoá màn hình hay chuyển app vẫn chạy đúng; bản nháp nhớ thời gian đã dùng.
    startedAt: Date.now() - (Number(d?.spent) || 0), self: {}, vocab: suggestWords(prompt, 8),
  };
  if (d) toast(`Viết tiếp bản nháp (đã dùng ${Math.round((Number(d.spent) || 0) / 60e3)} phút)`);
  go('#/wwrite');
  startTick();
}

/** Viết lại một bài đã nộp: mở sẵn bài cũ để sửa, không tính giờ; nộp xong so với bản trước. */
function startRewrite(id) {
  const e = S.writing.get(id);
  if (!e || e.kind === 'draft') return toast('Không tìm thấy bài này');
  const key = `draft:rw:${id}`;
  const d = S.writing.get(key);
  const base = { key, text: d?.text ?? e.text, stage: 'write', startedAt: Date.now(), self: {}, prev: id, version: (e.version || 1) + 1, rewrite: true };
  if (e.kind === 'task1') {
    if (!e.chart) return toast('Không mở lại được biểu đồ của bài này');
    const m = W.modes.find((x) => x.id === e.chart.mode) || W.modes[0];
    ws = { ...base, kind: 'task1', chart: genChart(e.chart.tpl, e.chart.seed, e.chart.target), mode: m };
  } else {
    const prompt = W.prompts.get(e.promptId);
    if (!prompt) return toast('Không tìm thấy đề của bài này');
    if (e.kind === 'part') { const part = W.parts.find((x) => x.id === e.part); if (!part) return toast('Không tìm thấy phần này'); ws = { ...base, kind: 'part', prompt, part, vocab: suggestWords(prompt, 5) }; }
    else ws = { ...base, kind: 'essay', prompt, plan: { view: '', p1: '', p2: '', ex: '', ...(e.plan || {}) }, vocab: suggestWords(prompt, 8) };
  }
  go('#/wwrite');
}
on('w-rewrite', (el) => startRewrite(el.dataset.id));
on('w-open', (el) => replace('#/wessay/' + el.dataset.id));

/** Bài 40 phút đang viết dở gần nhất (nếu có): đề, thời gian còn lại. */
export function essayDraft() {
  if (W.state !== 'ready') return null;
  const ds = [...S.writing.values()].filter((d) => d.kind === 'draft' && /^draft:[^:]+:essay$/.test(d.id) && (d.text?.trim() || Object.values(d.plan || {}).some(Boolean)));
  if (!ds.length) return null;
  const d = ds.sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const prompt = W.prompts.get(d.id.split(':')[1]);
  if (!prompt) return null;
  const left = ESSAY.ms - (Number(d.spent) || 0);
  return { prompt, left, words: countWords(d.text || ''), label: left > 0 ? `còn ${Math.ceil(left / 60e3)} phút` : 'đã hết giờ' };
}
export const essayDraftCta = (d, cls = '') => `<button class="btn ${cls}" data-act="w-essay" data-p="${d.prompt.id}">${icon('pen', 'sm')} Viết tiếp bài 40 phút · ${d.label}</button>`;

// ---- Đồng hồ 40 phút ----
const mmss = (ms) => { const sec = Math.floor(Math.abs(ms) / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
function timerState() {
  const spent = Date.now() - ws.startedAt, left = ESSAY.ms - spent;
  return { spent, left, text: left >= 0 ? mmss(left) : '+' + mmss(left), cls: 'w-timer' + (left < 0 ? ' over' : left < 5 * 60e3 ? ' low' : '') };
}
const timing = () => ws?.kind === 'essay' && !ws.rewrite && ['plan', 'write'].includes(ws.stage);
function paintTimer() {
  if (!timing()) { clearInterval(tick); tick = null; return; }
  const t = timerState();
  const el = document.getElementById('w-timer');
  if (el) { el.textContent = t.text; el.className = t.cls; }
  const pl = document.getElementById('w-plan-time');
  if (pl) { pl.textContent = `Dàn ý ${mmss(t.spent)} / 5:00`; pl.classList.toggle('over', t.spent > ESSAY.planMs); }
  if (t.left < 0 && !ws.timeUp) { ws.timeUp = true; toast('Hết 40 phút. Bạn có thể nộp bài hoặc viết nốt.'); }
}
function startTick() { clearInterval(tick); tick = setInterval(paintTimer, 1000); setTimeout(paintTimer); }

// ---- Bản nháp ----
function draftRec(s) {
  const rec = { id: s.key, kind: 'draft', text: s.text, at: today() };
  if (s.kind === 'task1') rec.chart = { tpl: s.chart.tpl.id, seed: s.chart.seed, target: s.chart.target, mode: s.mode.id };
  if (s.kind === 'essay') Object.assign(rec, { plan: { ...s.plan }, stage: s.stage, spent: Date.now() - s.startedAt, ts: Date.now() });
  return rec;
}
function queueSave() {
  clearTimeout(saveTimer);
  saveSnap = { ...ws, plan: ws.plan && { ...ws.plan } };
  saveTimer = setTimeout(flushSave, 700);
}
function flushSave() {
  clearTimeout(saveTimer);
  const snap = saveSnap;
  saveSnap = null;
  if (snap) return wPut(draftRec(snap)).catch(() => {});
}
// Khoá màn hình/chuyển app: lưu ngay; mở lại: vẽ lại đồng hồ theo giờ thật.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { if (timing()) saveSnap = { ...ws, plan: { ...ws.plan } }; flushSave(); }
  else paintTimer();
});
function startChart(mode, tplId, seed, nav = true) {
  if (!W.charts.length) return toast('Nội dung chưa tải xong');
  const tpl = tplId || W.charts[Math.floor(Math.random() * W.charts.length)].id;
  const sd = seed ?? Math.floor(Math.random() * 2 ** 31);
  const ch = genChart(tpl, sd);
  const m = W.modes.find((x) => x.id === mode) || W.modes[0];
  ws = { kind: 'task1', chart: ch, mode: m, key: `draft:task1:${m.id}`, text: '', stage: 'write', startedAt: Date.now(), self: {} };
  const d = S.writing.get(ws.key);
  // Bản nháp chỉ dùng lại khi đúng biểu đồ đó.
  if (d && d.chart?.tpl === tpl && d.chart?.seed === sd) ws.text = d.text;
  if (nav) go('#/wwrite'); else rerender(true);
}

on('w-part', (el) => startPart(el.dataset.p, el.dataset.part));
on('w-today', () => { const n = nextPart(); if (n) startPart(n.prompt.id, n.part.id); else toast('Bạn đã viết hết các phần của 30 đề'); });
on('w-chart', (el) => startChart(el.dataset.mode));
on('w-essay', (el) => startEssay(el.dataset.p));
// Đề khác: thay biểu đồ ngay tại chỗ, không thêm trang vào lịch sử.
on('w-newchart', () => { if (ws?.kind === 'task1' && !ws.rewrite) startChart(ws.mode.id, undefined, undefined, false); });
on('w-input', (el) => {
  if (!ws) return;
  ws.text = el.value;
  const n = countWords(ws.text), p = limitsOf(ws);
  const out = document.getElementById('w-count');
  if (out) { out.textContent = countLabel(n, p); out.className = 'w-count ' + (n < p.min ? '' : n > p.max ? 'over' : 'ok'); }
  document.querySelectorAll('.w-chip[data-re]').forEach((c) => c.classList.toggle('used', new RegExp(c.dataset.re, 'i').test(ws.text)));
  queueSave();
});
on('w-plan', (el) => { if (ws?.kind === 'essay') { ws.plan[el.dataset.k] = el.value; queueSave(); } });
on('w-quit', async () => {
  if (ws && ['plan', 'write'].includes(ws.stage) && (saveSnap || (ws.kind === 'essay' && !ws.rewrite && (ws.text || Object.values(ws.plan).some(Boolean))))) {
    saveSnap = { ...ws, plan: ws.plan && { ...ws.plan } };
    await flushSave();
  }
  clearInterval(tick); tick = null; ws = null; back('#/writing');
});
const limitsOf = (s) => (s.kind === 'part' ? s.part : s.kind === 'essay' ? ESSAY : s.mode);
const countLabel = (n, p) => (p === ESSAY ? `${n} từ · tối thiểu ${p.min}` : `${n} từ · nên ${p.min}–${p.max}`);

on('w-submit', async () => {
  if (!ws || ws.stage !== 'write') return;
  const text = (document.getElementById('w-text')?.value ?? ws.text).trim();
  if (countWords(text) < 3) { toast('Hãy viết ít nhất một câu trước khi nộp'); return; }
  clearTimeout(saveTimer); saveSnap = null;
  clearInterval(tick); tick = null;
  ws.text = text;
  const ms = Date.now() - ws.startedAt;
  const stats = textStats(text);
  const hits = runRules(text);
  let checks, title;
  if (ws.kind === 'part') { checks = partChecks(ws.prompt, ws.part, text); title = `${ws.part.name} · ${ws.prompt.q.slice(0, 80)}`; }
  else if (ws.kind === 'essay') { checks = essayChecks(ws.prompt, text, ms); if (ws.rewrite) checks = checks.filter((c) => !/phút/.test(c.msg)); title = `Cả bài · ${ws.prompt.q.slice(0, 80)}`; }
  else {
    const ch = ws.chart;
    checks = ws.mode.id === 'detail' ? [lengthCheck(text, ws.mode), ...detailChecks(ch, text, ch.target)] : ws.mode.id === 'overview' ? [lengthCheck(text, ws.mode), ...overviewChecks(ch, text)] : [lengthCheck(text, ws.mode), ...fullChecks(ch, text)];
    title = `Task 1 · ${ws.mode.name} · ${ch.tpl.title}`;
  }
  const id = 'e:' + uid();
  const rec = {
    id, kind: ws.kind, promptId: ws.prompt ? ws.prompt.id : '', part: ws.kind === 'part' ? ws.part.id : ws.kind === 'essay' ? 'essay' : ws.mode.id, title,
    text, words: stats.words, ms, at: today(),
    chart: ws.kind === 'task1' ? { tpl: ws.chart.tpl.id, seed: ws.chart.seed, mode: ws.mode.id, target: ws.chart.target } : null,
    report: { stats: { words: stats.words, sentences: stats.sentences, paragraphs: stats.paragraphs, avgLen: stats.avgLen, complex: stats.complex, linkers: stats.linkers }, hits: hits.map((h) => ({ rule: h.rule, text: h.text })), dismissed: [], checks },
    self: {},
  };
  if (ws.kind === 'essay') rec.plan = { ...ws.plan };
  if (ws.rewrite) { rec.prev = ws.prev; rec.version = ws.version; rec.title = `Bản ${ws.version} · ${rec.title}`; }
  // Từ trong kho đã dùng trong bài: ghi là một lần ôn (đúng hạn thì lịch ôn được cập nhật).
  const used = usedWords(ws.vocab, text);
  if (used.length) rec.used = used.map((x) => x.word);
  await wPut(rec);
  for (const x of used) await recordAnswer(x.id, 'good', 'practice').catch(() => {});
  await wDel(ws.key).catch(() => {});
  await logGrammarDay('wEssays', id);
  // Lỗi bắt được → Sổ lỗi (mỗi nhãn một lần cho mỗi bài).
  const tags = new Set(hits.map((h) => ruleOf(h.rule)?.tag).filter(Boolean));
  for (const tag of tags) await logGrammarError(tag, false);
  // Bản viết lại: loại lỗi có ở bản trước mà nay hết → ghi là đã làm đúng.
  const before = ws.rewrite && S.writing.get(ws.prev);
  if (before) for (const tag of new Set(liveHits(before).map((h) => ruleOf(h.rule)?.tag).filter(Boolean))) if (!tags.has(tag)) await logGrammarError(tag, true);
  Object.assign(ws, { stage: 'report', essayId: id, stats, hits, checks, used });
  rerender(true);
});
const lengthCheck = (text, p) => {
  const n = countWords(text);
  return n < p.min ? { ok: false, msg: `Ngắn hơn mức gợi ý (${n}/${p.min}–${p.max} từ).` } : n > p.max ? { ok: false, msg: `Dài hơn mức gợi ý (${n}/${p.min}–${p.max} từ).` } : { ok: true, msg: `Độ dài phù hợp (${n} từ).` };
};
on('w-dismiss', async (el) => {
  const rec = S.writing.get(el.dataset.id || ws?.essayId);
  if (!rec) return;
  const key = el.dataset.k;
  if (!rec.report.dismissed.includes(key)) rec.report.dismissed.push(key);
  await wPut(rec);
  toast('Đã bỏ gợi ý này');
  rerender();
});
on('w-stage', (el) => {
  if (!ws) return;
  ws.stage = el.dataset.to;
  if (timing()) { queueSave(); startTick(); }
  rerender(true);
});
on('w-self', async (el) => {
  if (!ws) return;
  ws.self[el.dataset.q] = el.dataset.v === '1';
  rerender();
});
on('w-finish', async () => {
  if (!ws) return;
  const rec = S.writing.get(ws.essayId);
  if (rec) { rec.self = { ...ws.self }; await wPut(rec); }
  confetti({ count: 70 });
  toast('Đã lưu bài vào hồ sơ');
  ws = null;
  back('#/writing');
});
on('w-save-phrase', async (el) => {
  const en = el.dataset.en, vi = el.dataset.vi;
  if (findByText(en)) { toast('Cụm này đã có trong kho từ'); return; }
  const w = blankWord(S.decks.some((d) => d.id === 'ielts-writing') ? 'ielts-writing' : undefined);
  Object.assign(w, { word: en, meaning: vi, pos: 'phrase', notes: 'Lưu từ bài mẫu Writing' });
  if (el.dataset.ex) w.examples = [el.dataset.ex];
  await saveWord(w);
  toast(`Đã thêm “${en}” vào kho từ`);
  el.disabled = true;
  el.textContent = 'Đã lưu';
});
on('w-delete', async (el) => {
  if (!(await confirmSheet({ title: 'Xoá bài viết này?', body: 'Bài và báo cáo của nó sẽ bị xoá khỏi máy.', okLabel: 'Xoá', danger: true }))) return;
  await wDel(el.dataset.id);
  toast('Đã xoá bài');
  back('#/wessays');
});

// ================= GIAO DIỆN =================
const loadingCard = () => (W.state === 'error'
  ? `<div class="banner">${icon('info')}<span>${esc(W.error)}</span></div>`
  : `<div class="card" style="display:flex;gap:12px;align-items:center"><div class="spin"></div><span class="muted">Đang tải nội dung Writing…</span></div>`);
const ring = (value, goal) => {
  const c = 2 * Math.PI * 24, p = goal ? Math.min(1, value / goal) : 0;
  return `<svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="24"/><circle class="fg" cx="30" cy="30" r="24" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
};
const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<em class="en">$1</em>');

export function writingView() {
  const head = `<header class="top"><div><p class="eyebrow">Luyện viết IELTS</p><h1>Writing</h1></div>
    <button class="iconbtn tonal" data-act="go" data-to="#/wessays" aria-label="Bài đã viết">${icon('list')}</button></header>${learnSwitch('writing')}`;
  if (W.state !== 'ready') return `<div class="page">${head}${loadingCard()}</div>`;
  const goal = S.settings.writingPerDay, done = todayWriting(), next = nextPart();
  const all = essays();
  const dr = essayDraft();
  const draftCard = dr ? `<div class="card w-draft"><p class="small muted">Bài 40 phút đang viết dở · ${dr.words} từ · ${dr.label}</p><p class="w-clip2" style="margin-top:4px">${esc(dr.prompt.q)}</p>${essayDraftCta(dr, '').replace('class="btn ', 'style="margin-top:12px" class="btn ')}</div>` : '';
  const today_ = `${draftCard}<div class="card">
    <div class="row-between"><div style="min-width:0"><p class="small muted">${goal ? `Hôm nay: ${done}/${goal} bài` : `Hôm nay: ${done} bài`}</p>
      ${next ? `<b style="font-size:18px;display:block;margin-top:2px">${esc(next.part.name)}</b><p class="small muted w-clip">${esc(next.prompt.q)}</p>` : '<b>Bạn đã viết hết các phần của 30 đề</b>'}</div>${goal ? ring(done, goal) : ''}</div>
    ${next ? `<button class="btn" style="margin-top:14px" data-act="w-today">Viết phần này · ${next.part.min}–${next.part.max} từ</button>` : ''}
  </div>`;
  const ne = nextEssay(), fullN = all.filter((e) => e.kind === 'essay').length;
  const full = `<h2>Task 2 cả bài · 40 phút</h2><div class="card">
    <p class="small muted">${ne ? 'Đề gợi ý' : 'Bạn đã viết cả bài cho mọi đề; chọn đề bất kỳ để viết lại.'}${fullN ? ` · đã viết ${fullN} bài` : ''}</p>
    ${ne ? `<p class="w-clip2" style="margin-top:4px">${esc(ne.q)}</p><button class="btn soft" style="margin-top:12px" data-act="w-essay" data-p="${ne.id}">${S.writing.get(`draft:${ne.id}:essay`) ? 'Viết tiếp bản nháp' : 'Lập dàn ý 5 phút rồi viết'}</button>` : ''}</div>`;
  const t1 = `<h2>Task 1 · biểu đồ tự sinh</h2><div class="card">
    <p class="small muted" style="margin-bottom:12px">Mỗi lần là một bộ số liệu mới. App biết số liệu gốc nên kiểm tra được con số, năm, xu hướng và giới từ trong câu bạn viết.</p>
    <div class="stack">${W.modes.map((m, i) => `<button class="btn ${i ? 'ghost' : 'soft'}" data-act="w-chart" data-mode="${m.id}">${esc(m.name)} <span class="small" style="opacity:.75">· ${m.min}–${m.max} từ</span></button>`).join('')}</div></div>`;
  const types = Object.entries(W.types).map(([t, info]) => {
    const ids = W.order.filter((id) => W.prompts.get(id).type === t);
    const n = ids.reduce((a, id) => a + W.parts.filter((p) => partDone(id, p.id)).length, 0);
    return `<button class="listlink" data-act="go" data-to="#/wtype/${t}"><span class="lead">${icon('pen')}</span><span class="body"><b>${esc(info.name)}</b><small>${ids.length} đề · đã viết ${n}/${ids.length * W.parts.length} phần</small></span>${icon('chev')}</button>`;
  }).join('');
  return `<div class="page">${head}${today_}${full}${t1}<h2>Task 2 theo dạng đề</h2>${types}
    <button class="listlink" data-act="go" data-to="#/wessays" style="margin-top:14px"><span class="lead">${icon('list')}</span><span class="body"><b>Bài đã viết</b><small>${all.length} bài</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="go" data-to="#/wstats"><span class="lead">${icon('stats')}</span><span class="body"><b>Hồ sơ Writing</b><small>Lỗi theo tuần, lỗi hay gặp, xuất bài</small></span>${icon('chev')}</button>
    <p class="small faint" style="margin:14px 2px 0">App kiểm tra độ dài, số liệu và các lỗi hay gặp theo mẫu; không chấm band và không nhận xét lập luận.</p></div>`;
}

export function typeView(t) {
  const info = W.types[t];
  if (W.state !== 'ready') return `<div class="page">${navBar('Task 2', { fallback: '#/writing' })}${loadingCard()}</div>`;
  if (!info) return `<div class="page">${navBar('Task 2', { fallback: '#/writing' })}<div class="empty"><p>Không tìm thấy dạng đề này.</p></div></div>`;
  const rows = W.order.filter((id) => W.prompts.get(id).type === t).map((id) => {
    const p = W.prompts.get(id), n = W.parts.filter((x) => partDone(id, x.id)).length;
    return `<div class="wrow" data-act="go" data-to="#/wprompt/${id}"><span class="num ${n === W.parts.length ? 'done' : ''}">${n === W.parts.length ? icon('check', 'sm') : n}</span>
      <div class="body"><span class="tag">${esc(p.topic)}</span><p class="w-clip2" style="white-space:normal">${esc(p.q)}</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<div class="page">${navBar(info.short, { fallback: '#/writing' })}<h1 style="font-size:24px;margin:0 2px 6px">${esc(info.name)}</h1>
    <p class="muted small" style="margin:0 2px 12px">Câu nêu quan điểm: ${esc(info.hint)}.</p><div class="wlist" style="margin-top:0">${rows}</div></div>`;
}

export function promptView(id) {
  const p = W.prompts.get(id);
  if (W.state !== 'ready') return `<div class="page">${navBar('Đề Task 2', { fallback: '#/writing' })}${loadingCard()}</div>`;
  if (!p) return `<div class="page">${navBar('Đề Task 2', { fallback: '#/writing' })}<div class="empty"><p>Không tìm thấy đề này.</p></div></div>`;
  const done = essayDone(id);
  const fullInfo = done.length ? `Đã viết ${done.length} lần · lần gần nhất ${done.map((e) => e.words).pop()} từ` : '5 phút lập dàn ý, 35 phút viết, tối thiểu 250 từ. Đồng hồ vẫn chạy khi khoá màn hình.';
  const rows = W.parts.map((part, i) => {
    const e = partDone(id, part.id), draft = S.writing.get(`draft:${id}:${part.id}`);
    const sub = e ? `Đã viết · ${e.words} từ` : draft ? 'Có bản nháp' : `${part.min}–${part.max} từ`;
    return `<div class="wrow" data-act="w-part" data-p="${id}" data-part="${part.id}"><span class="num ${e ? 'done' : ''}">${e ? icon('check', 'sm') : i + 1}</span>
      <div class="body"><span style="font-weight:600">${esc(part.name)}</span><p>${sub}</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<div class="page">${navBar('Đề Task 2', { fallback: `#/wtype/${p.type}` })}
    <div class="card"><div class="pill-list" style="margin-bottom:10px"><span class="tag">${esc(W.types[p.type].short)}</span><span class="tag">${esc(p.topic)}</span></div><p class="w-prompt">${esc(p.q)}</p></div>
    <h2>5 phần của bài</h2><div class="wlist" style="margin-top:0">${rows}</div>
    <h2>Cả bài</h2><div class="card"><p class="small muted">${fullInfo}</p>
      <button class="btn" style="margin-top:12px" data-act="w-essay" data-p="${id}">${S.writing.get(`draft:${id}:essay`) ? 'Viết tiếp bản nháp' : 'Viết cả bài · 40 phút'}</button></div></div>`;
}

function usedHtml(vocab, used) {
  if (!vocab?.length) return '';
  return `<h3 class="w-h">Từ trong kho</h3>${used?.length
    ? `<div class="feedback ok"><b class="t">${icon('check', 'sm')} Đã dùng ${used.length}/${vocab.length} từ gợi ý</b><p class="small">${used.map((x) => `<b class="en">${esc(x.word || x)}</b>`).join(', ')} được tính là một lần ôn.</p></div>`
    : `<p class="small muted" style="margin:0 2px">Chưa dùng từ gợi ý nào (${vocab.map((x) => esc(x.word)).join(', ')}). Lần sau thử lồng một hai từ vào bài.</p>`}`;
}
function checksHtml(checks) {
  return `<ul class="w-checks">${checks.map((c) => `<li class="${c.ok === true ? 'ok' : c.ok === false ? 'no' : 'na'}">${icon(c.ok === true ? 'check' : c.ok === false ? 'x' : 'info', 'sm')}<span>${fmt(c.msg)}</span></li>`).join('')}</ul>`;
}
function hitsHtml(rec, hits) {
  const live = hits.filter((h) => !rec.report.dismissed.includes(h.rule + '|' + h.text));
  if (!live.length) return `<div class="feedback ok"><b class="t">${icon('check', 'sm')} Không thấy lỗi nào trong danh sách app theo dõi</b><p class="small">App chỉ dò ${W.rules.length} mẫu lỗi hay gặp; bài vẫn có thể còn lỗi khác.</p></div>`;
  return live.map((h) => {
    const r = ruleOf(h.rule);
    const tag = r && GR.tags[r.tag];
    const lesson = tag?.lesson && GR.lessons?.get(tag.lesson);
    const mark = h.match ? esc(h.text).replace(esc(h.match), `<mark>${esc(h.match)}</mark>`) : esc(h.text);
    return `<div class="card w-hit"><p class="en">${mark}</p><p style="margin-top:6px">${fmt(r?.why || '')}</p><p class="small muted" style="margin-top:4px">Sửa: ${fmt(r?.fix || '')}</p>
      ${lesson ? `<p class="small faint" style="margin-top:4px">Bài ngữ pháp liên quan: ${esc(lesson.title)}</p>` : ''}
      <button class="btn ghost sm" style="margin-top:10px" data-act="w-dismiss" data-id="${rec.id}" data-k="${esc(h.rule + '|' + h.text)}">Câu này đúng</button></div>`;
  }).join('');
}
function statsHtml(st) {
  return `<div class="tiles w-tiles"><div class="tile"><b>${st.words}</b><span>từ</span></div><div class="tile"><b>${st.sentences}</b><span>câu</span></div><div class="tile"><b>${st.complex}</b><span>câu phức</span></div><div class="tile"><b>${st.linkers}</b><span>từ nối</span></div></div>
    ${st.repeated?.length ? `<p class="small muted" style="margin:10px 2px 0">Từ lặp nhiều: ${st.repeated.map((r) => `<b>${esc(r.w)}</b> ×${r.n}`).join(' · ')}. Thử thay bằng từ đồng nghĩa.</p>` : ''}`;
}

const fullModel = (p) => [`${p.model.para} ${p.model.thesis}`, p.model.body1, p.model.body2, p.model.concl].join('\n\n');
function modelText() {
  if (ws.kind === 'part') return ws.prompt.model[ws.part.id];
  if (ws.kind === 'essay') return fullModel(ws.prompt);
  return chartModel(ws.chart, ws.mode.id);
}

export function writeView() {
  if (!ws) { setTimeout(() => replace('#/writing')); return ''; }
  const label = (ws.kind === 'part' ? `Task 2 · ${ws.part.name}` : ws.kind === 'essay' ? 'Task 2 · Cả bài' : `Task 1 · ${ws.mode.name}`) + (ws.rewrite ? ` · Bản ${ws.version}` : '');
  const steps = ws.kind === 'essay' && !ws.rewrite ? ['plan', 'write', 'report', 'model', 'self'] : ['write', 'report', 'model', 'self'];
  const pct = Math.round((steps.indexOf(ws.stage) / steps.length) * 100);
  const t = timing() ? timerState() : null;
  const top = `<div class="ses-top"><button class="iconbtn" data-act="w-quit" aria-label="Thoát">${icon('x')}</button><div class="progress"><i style="width:${pct}%"></i></div>${t ? `<span id="w-timer" class="${t.cls}" role="timer" aria-label="Thời gian còn lại">${t.text}</span>` : `<span class="count">${steps.indexOf(ws.stage) + 1}/${steps.length}</span>`}</div>
    <p class="mode-label">${esc(label)}</p>`;
  const p = limitsOf(ws);
  const promptCard = ws.kind !== 'task1'
    ? `<div class="card"><p class="w-prompt small">${esc(ws.prompt.q)}</p></div>`
    : `${chartSvg(ws.chart, ws.mode.id === 'detail' ? ws.chart.target : -1)}<p class="small muted w-prompt" style="margin:8px 2px 0">${esc(chartPrompt(ws.chart))}</p>`;
  let body, actions, focus = null, left = '';
  if (ws.stage === 'plan') {
    const box = (k, lab, ph) => `<label class="w-plan"><span>${lab}</span><textarea class="input" rows="2" data-in="w-plan" data-k="${k}" placeholder="${ph}" autocapitalize="sentences" spellcheck="false">${esc(ws.plan[k])}</textarea></label>`;
    left = promptCard;
    body = `<div class="row-between" style="margin:14px 2px 0;gap:10px"><span class="small muted">Ghi ý ngắn, tiếng Anh hay tiếng Việt đều được.</span><span id="w-plan-time" class="w-plantime ${t.spent > ESSAY.planMs ? 'over' : ''}">Dàn ý ${mmss(t.spent)} / 5:00</span></div>
      ${box('view', 'Câu trả lời / quan điểm', W.types[ws.prompt.type].hint)}${box('p1', 'Ý chính đoạn thân bài 1', 'Lý do hoặc khía cạnh thứ nhất')}${box('p2', 'Ý chính đoạn thân bài 2', 'Lý do hoặc khía cạnh thứ hai')}${box('ex', 'Ví dụ sẽ dùng', 'Một ví dụ cụ thể cho mỗi đoạn')}
      ${vocabHtml(ws.vocab, '')}`;
    actions = `<button class="btn" data-act="w-stage" data-to="write">Bắt đầu viết</button>`;
    if (!Object.values(ws.plan).some(Boolean)) focus = '.w-plan textarea';
  } else if (ws.stage === 'write') {
    const n = countWords(ws.text);
    const task = ws.rewrite ? 'Sửa bài cũ theo các gợi ý và bài mẫu, không giới hạn thời gian. Nộp xong app so với bản trước.' : ws.kind === 'task1' && ws.mode.id === 'detail' ? `${p.task} Đối tượng: <b>${esc(ws.chart.series[ws.chart.target].name)}</b>.` : ws.kind === 'essay' ? 'Viết 4–5 đoạn, xuống dòng giữa các đoạn.' : esc(p.task);
    const pl = ws.kind === 'essay' && Object.values(ws.plan).some(Boolean)
      ? `<details class="card w-plansum"><summary>Dàn ý của bạn</summary><dl>${[['view', 'Quan điểm'], ['p1', 'Thân bài 1'], ['p2', 'Thân bài 2'], ['ex', 'Ví dụ']].filter(([k]) => ws.plan[k]).map(([k, lab]) => `<dt>${lab}</dt><dd>${esc(ws.plan[k])}</dd>`).join('')}</dl></details>` : '';
    left = `${promptCard}${pl}`;
    body = `<p class="w-task">${task}</p>
      <textarea id="w-text" class="input w-editor" rows="${ws.kind === 'essay' ? 16 : p.max > 100 ? 12 : 5}" data-in="w-input" placeholder="Viết bằng tiếng Anh…" autocapitalize="sentences" spellcheck="false">${esc(ws.text)}</textarea>
      <p id="w-count" class="w-count ${n < p.min ? '' : n > p.max ? 'over' : 'ok'}">${countLabel(n, p)}</p>${vocabHtml(ws.vocab, ws.text)}`;
    if (!ws.text) focus = '#w-text';
    actions = `<div class="btn-row">${ws.kind === 'task1' && !ws.rewrite ? `<button class="btn ghost" data-act="w-newchart" style="flex:.7">Đề khác</button>` : ws.kind === 'essay' && !ws.rewrite ? `<button class="btn ghost" data-act="w-stage" data-to="plan" style="flex:.7">Dàn ý</button>` : ''}<button class="btn" data-act="w-submit">Nộp bài</button></div>`;
  } else if (ws.stage === 'report') {
    const rec = S.writing.get(ws.essayId);
    const prevRec = ws.rewrite && S.writing.get(ws.prev);
    body = `${prevRec ? compareHtml(prevRec, rec) : ''}<h3 class="w-h">Kiểm tra tự động</h3>${checksHtml(ws.checks)}<h3 class="w-h">Thống kê</h3>${statsHtml(ws.stats)}
      <h3 class="w-h">Gợi ý sửa lỗi</h3>${hitsHtml(rec, ws.hits)}${usedHtml(ws.vocab, ws.used)}`;
    actions = `<button class="btn" data-act="w-stage" data-to="model">Xem bài mẫu</button>`;
  } else if (ws.stage === 'model') {
    const model = modelText();
    const phrases = ws.kind !== 'task1' ? ws.prompt.phrases : [];
    body = `<h3 class="w-h">Bài của bạn</h3><div class="card w-text">${esc(ws.text)}</div>
      <h3 class="w-h">Bài mẫu${ws.kind !== 'task1' ? ' band 7' : ' (app tạo từ số liệu)'}</h3><div class="card w-text w-model">${esc(model)}</div>
      ${phrases.length ? `<h3 class="w-h">Cụm hay nên lưu</h3>${phrases.map((ph) => {
        const ex = Object.values(ws.prompt.model).join(' ').match(new RegExp(`[^.]*${ph.en.split(' ').slice(0, 2).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*\\.`, 'i'))?.[0]?.trim() || '';
        const has = !!findByText(ph.en);
        return `<div class="card w-phrase"><div style="min-width:0"><b class="en">${esc(ph.en)}</b><p class="small muted">${esc(ph.vi)}</p></div><button class="btn ${has ? 'ghost' : 'soft'} sm" data-act="w-save-phrase" data-en="${esc(ph.en)}" data-vi="${esc(ph.vi)}" data-ex="${esc(ex)}" ${has ? 'disabled' : ''}>${has ? 'Đã có' : '+ Lưu'}</button></div>`;
      }).join('')}` : ''}`;
    actions = `<button class="btn" data-act="w-stage" data-to="self">Tự chấm</button>`;
  } else {
    const qs = ws.kind === 'essay' ? ESSAY_SELF.map((x) => x[1]) : p.self || [];
    const head_ = (i) => (ws.kind === 'essay' && (i === 0 || ESSAY_SELF[i - 1][0] !== ESSAY_SELF[i][0]) ? `<h3 class="w-h">${ESSAY_SELF[i][0]}</h3>` : '');
    body = `<p class="muted" style="margin-bottom:10px">So bài của bạn với bài mẫu và trả lời thật lòng. App không quy đổi thành điểm band.</p>
      ${qs.map((q, i) => `${head_(i)}<div class="card w-self"><p>${esc(q)}</p><div class="tf" style="margin-top:10px">
        <button class="opt ${ws.self[i] === true ? 'right' : ''}" data-act="w-self" data-q="${i}" data-v="1">Có</button>
        <button class="opt ${ws.self[i] === false ? 'wrong' : ''}" data-act="w-self" data-q="${i}" data-v="0">Chưa</button></div></div>`).join('')}
      ${Object.values(ws.self).some((v) => v === false) ? `<div class="banner info" style="margin-top:12px">${icon('info')}<span>Mục nào còn “Chưa”, hãy sửa ở lần viết sau cho đề này.</span></div>` : ''}`;
    actions = `<button class="btn" data-act="w-finish">Hoàn thành</button>`;
  }
  // Lúc lập dàn ý và viết: màn rộng chia đôi (đề/biểu đồ bên trái, khung viết bên phải).
  if (left) return { html: `<div class="page session split-page w-split">${top}<div class="ses-body split"><div class="split-l">${left}</div><div class="split-r">${body}</div></div><div class="ses-actions">${actions}</div></div>`, focus };
  return { html: `<div class="page session">${top}<div class="ses-body">${body}</div><div class="ses-actions">${actions}</div></div>`, focus };
}

export function essaysView() {
  const list = essays().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const rows = list.map((e) => {
    const errs = e.report.hits.filter((h) => !e.report.dismissed.includes(h.rule + '|' + h.text)).length;
    return `<div class="wrow" data-act="go" data-to="#/wessay/${e.id}"><div class="body"><span style="font-weight:600" class="w-clip">${esc(e.title)}</span><p>${e.at.split('-').reverse().join('/')} · ${e.words} từ · ${errs} gợi ý sửa</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<div class="page">${navBar('Bài đã viết', { fallback: '#/writing' })}
    ${list.length ? `<button class="listlink" data-act="go" data-to="#/wstats" style="margin-bottom:12px"><span class="lead">${icon('stats')}</span><span class="body"><b>Hồ sơ & xuất bài</b><small>Lỗi theo tuần, lỗi hay gặp</small></span>${icon('chev')}</button>` : ''}
    ${list.length ? `<div class="wlist" style="margin-top:0">${rows}</div>` : `<div class="card empty"><div class="art">${icon('pen')}</div><h3>Chưa có bài nào</h3><p>Bài bạn nộp sẽ được lưu ở đây cùng báo cáo.</p></div>`}</div>`;
}

export function essayView(id) {
  const e = S.writing.get(id);
  if (!e || e.kind === 'draft') return `<div class="page">${navBar('Bài viết', { fallback: '#/wessays' })}<div class="empty"><p>Không tìm thấy bài này.</p></div></div>`;
  let chart = '';
  if (e.kind === 'task1' && e.chart && W.state === 'ready') { const ch = genChart(e.chart.tpl, e.chart.seed, e.chart.target); chart = chartSvg(ch, e.chart.mode === 'detail' ? ch.target : -1); }
  const prompt = (e.kind === 'part' || e.kind === 'essay') && W.prompts.get(e.promptId);
  const hits = e.report.hits.map((h) => ({ ...h, match: (() => { const r = ruleOf(h.rule); if (!r) return ''; r.rx.lastIndex = 0; const m = r.rx.exec(h.text); return m ? m[0].replace(/^[.!?\n\s]+/, '').trim() : ''; })() }));
  const self = Object.entries(e.self || {});
  const prevE = e.prev && S.writing.get(e.prev);
  // Chuỗi các bản: lần ngược về bản 1 rồi xuôi theo các bản viết lại.
  let root = e; const seen = new Set([e.id]);
  while (root.prev && S.writing.get(root.prev) && !seen.has(root.prev)) { seen.add(root.prev); root = S.writing.get(root.prev); }
  const chain = [root];
  for (let cur = root; ;) { const nx = essays().filter((x) => x.prev === cur.id).sort((a, b) => (a.version || 1) - (b.version || 1))[0]; if (!nx || chain.includes(nx)) break; chain.push(nx); cur = nx; }
  const chainHtml = chain.length > 1 ? `<div class="pill-list" style="margin:0 2px 10px">${chain.map((x) => (x.id === e.id ? `<span class="tag on">Bản ${x.version || 1}</span>` : `<button class="tag" data-act="w-open" data-id="${x.id}">Bản ${x.version || 1}</button>`)).join('')}</div>` : '';
  return `<div class="page">${navBar('Bài viết', { fallback: '#/wessays' })}
    <p class="small muted" style="margin:0 2px 8px">${esc(e.title)} · ${e.at.split('-').reverse().join('/')}</p>${chainHtml}
    ${prompt ? `<div class="card"><p class="w-prompt small">${esc(prompt.q)}</p></div>` : ''}${chart}
    ${e.plan && Object.values(e.plan).some(Boolean) ? `<details class="card w-plansum"><summary>Dàn ý</summary><dl>${[['view', 'Quan điểm'], ['p1', 'Thân bài 1'], ['p2', 'Thân bài 2'], ['ex', 'Ví dụ']].filter(([k]) => e.plan[k]).map(([k, lab]) => `<dt>${lab}</dt><dd>${esc(e.plan[k])}</dd>`).join('')}</dl></details>` : ''}
    <h3 class="w-h">Bài của bạn</h3><div class="card w-text">${esc(e.text)}</div>
    ${e.kind === 'essay' && e.ms ? `<p class="small muted" style="margin:6px 2px 0">Thời gian: ${Math.round(e.ms / 60e3)} phút</p>` : ''}
    ${prevE && W.state === 'ready' ? compareHtml(prevE, e) : ''}
    <h3 class="w-h">Kiểm tra tự động</h3>${checksHtml(e.report.checks)}
    <h3 class="w-h">Thống kê</h3>${statsHtml({ ...e.report.stats, repeated: textStats(e.text).repeated })}
    <h3 class="w-h">Gợi ý sửa lỗi</h3>${W.state === 'ready' ? hitsHtml(e, hits) : ''}
    ${e.used?.length ? `<h3 class="w-h">Từ trong kho đã dùng</h3><p class="small">${e.used.map((x) => `<b class="en">${esc(x)}</b>`).join(', ')}</p>` : ''}
    ${self.length ? `<h3 class="w-h">Tự chấm</h3><p class="small muted">${self.filter(([, v]) => v).length}/${self.length} mục “Có”</p>` : ''}
    ${W.state === 'ready' ? `<button class="btn soft" style="margin-top:16px" data-act="w-rewrite" data-id="${e.id}">${S.writing.get(`draft:rw:${e.id}`) ? 'Sửa tiếp bản nháp' : `Sửa thành bản ${(e.version || 1) + 1}`}</button>` : ''}
    ${prompt && e.kind === 'essay' ? `<button class="btn ghost" style="margin-top:10px" data-act="w-essay" data-p="${e.promptId}">Viết cả bài mới (40 phút)</button>` : ''}
    <button class="btn danger" style="margin-top:10px" data-act="w-delete" data-id="${e.id}">${icon('trash', 'sm')} Xoá bài</button></div>`;
}

// ================= HỒ SƠ WRITING =================
const mondayOf = (iso) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Số liệu cho trang hồ sơ: tổng, 8 tuần gần nhất (gợi ý lỗi / 100 từ), loại lỗi hay gặp. */
export function portfolio(list = essays(), now = today()) {
  const words = list.reduce((a, e) => a + (e.words || 0), 0), ms = list.reduce((a, e) => a + (e.ms || 0), 0);
  const start = mondayOf(now);
  const weeks = Array.from({ length: 8 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() - 7 * (7 - i)); return { from: isoOf(d), n: 0, words: 0, errs: 0 }; });
  for (const e of list) {
    const wk = isoOf(mondayOf(e.at)), w = weeks.find((x) => x.from === wk);
    if (w) { w.n++; w.words += e.words || 0; w.errs += liveHits(e).length; }
  }
  weeks.forEach((w) => { w.rate = w.words ? Math.round((w.errs / w.words) * 1000) / 10 : null; });
  const tags = {};
  for (const e of list) for (const h of liveHits(e)) { const t = ruleOf(h.rule)?.tag || h.rule; tags[t] = (tags[t] || 0) + 1; }
  const top = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, n]) => ({ tag, n }));
  const full = list.filter((e) => e.kind === 'essay' && !e.prev);
  return {
    count: list.length, words, ms, weeks, top,
    kinds: { part: list.filter((e) => e.kind === 'part').length, essay: list.filter((e) => e.kind === 'essay').length, task1: list.filter((e) => e.kind === 'task1').length, rewrite: list.filter((e) => e.prev).length },
    full: full.length ? { n: full.length, words: Math.round(full.reduce((a, e) => a + e.words, 0) / full.length), min: Math.round(full.reduce((a, e) => a + e.ms, 0) / full.length / 60e3), onTime: full.filter((e) => e.ms <= ESSAY.ms && e.words >= ESSAY.min).length } : null,
  };
}
/** Toàn bộ bài viết thành một file văn bản để lưu hoặc gửi thầy cô. */
export function exportText(list = essays()) {
  const sorted = list.slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const blocks = sorted.map((e) => {
    const p = W.prompts.get(e.promptId);
    const ch = e.kind === 'task1' && e.chart && W.charts.length ? genChart(e.chart.tpl, e.chart.seed, e.chart.target) : null;
    const head = [`${e.title}`, `Ngày ${e.at.split('-').reverse().join('/')} · ${e.words} từ${e.ms ? ` · ${Math.round(e.ms / 60e3)} phút` : ''}`];
    if (p) head.push(`Đề: ${p.q}`);
    if (ch) head.push(`Đề: ${chartPrompt(ch)}`);
    const checks = e.report.checks.map((c) => `${c.ok === true ? '[x]' : c.ok === false ? '[ ]' : '[-]'} ${c.msg.replace(/\*+/g, '')}`).join('\n');
    const hits = liveHits(e).map((h) => `- ${h.text} → ${(ruleOf(h.rule)?.fix || '').replace(/\*+/g, '')}`).join('\n');
    return `${head.join('\n')}\n\n${e.text}\n\nKiểm tra tự động:\n${checks}${hits ? `\n\nGợi ý sửa lỗi:\n${hits}` : ''}`;
  });
  return `BÀI VIẾT IELTS · xuất ngày ${today().split('-').reverse().join('/')} · ${sorted.length} bài\n\n` + blocks.join('\n\n' + '='.repeat(40) + '\n\n') + '\n';
}
on('w-export', async () => {
  const list = essays();
  if (!list.length) return toast('Chưa có bài nào để xuất');
  const ok = await download(`writing-${today()}.txt`, exportText(list), 'text/plain;charset=utf-8');
  if (ok !== false) toast(`Đã xuất ${list.length} bài`);
});

export function statsView() {
  const nav = navBar('Hồ sơ Writing', { fallback: '#/writing' });
  if (W.state !== 'ready') return `<div class="page">${nav}${loadingCard()}</div>`;
  const P = portfolio();
  if (!P.count) return `<div class="page">${nav}<div class="card empty"><div class="art">${icon('stats')}</div><h3>Chưa có bài nào</h3><p>Nộp bài đầu tiên, hồ sơ sẽ hiện số liệu ở đây.</p></div></div>`;
  const hrs = P.ms >= 3600e3 ? `${Math.floor(P.ms / 3600e3)}g${String(Math.round((P.ms % 3600e3) / 60e3)).padStart(2, '0')}` : Math.round(P.ms / 60e3), hrsL = P.ms >= 3600e3 ? 'thời gian' : 'phút';
  const tiles = `<div class="tiles w-tiles"><div class="tile"><b>${P.count}</b><span>bài</span></div><div class="tile"><b>${P.words.toLocaleString('vi-VN')}</b><span>từ</span></div><div class="tile"><b>${hrs}</b><span>${hrsL}</span></div><div class="tile"><b>${P.kinds.rewrite}</b><span>bản sửa</span></div></div>
    <p class="small muted" style="margin:8px 2px 0">${P.kinds.part} phần Task 2 · ${P.kinds.essay} cả bài · ${P.kinds.task1} bài Task 1</p>`;
  const rated = P.weeks.filter((w) => w.rate !== null), max = Math.max(1, ...rated.map((w) => w.rate));
  const lbl = (w) => w.from.slice(8, 10) + '/' + w.from.slice(5, 7);
  const chart = `<div class="card"><p class="small muted">Gợi ý lỗi trên mỗi 100 từ, theo tuần (thấp hơn là tốt hơn)</p>
    <div class="chart"><div class="bars w-bars" style="height:110px">${P.weeks.map((w) => `<div class="bar" style="cursor:default" title="Tuần ${lbl(w)}: ${w.n} bài, ${w.errs} gợi ý lỗi"><span class="small" style="font-size:11.5px;color:var(--text-2);font-weight:600">${w.rate === null ? '' : w.rate.toLocaleString('vi-VN')}</span>${w.rate === null ? '<i class="none"></i>' : `<i style="height:${Math.max(3, (w.rate / max) * 76)}px"></i>`}<em>${lbl(w)}</em></div>`).join('')}</div></div>
    <p class="small faint" style="margin-top:6px">Tuần trống là tuần chưa nộp bài. Chạm “Câu này đúng” ở bài cũ để bỏ gợi ý sai khỏi số liệu.</p></div>`;
  const top = P.top.length ? P.top.map((x) => {
    const tag = GR.tags[x.tag] || { name: ruleOf(x.tag)?.why?.replace(/\*+/g, '') || x.tag };
    const lesson = tag.lesson && GR.lessons?.get(tag.lesson);
    return `<div class="card w-top"><div class="row-between"><b style="min-width:0">${esc(tag.name)}</b><span class="tag">${x.n} lần</span></div>
      ${lesson ? `<button class="btn ghost sm" style="margin-top:10px" data-act="g-start" data-id="${lesson.id}" data-fresh="1">Học lại: ${esc(lesson.title)}</button>` : ''}</div>`;
  }).join('') : `<div class="feedback ok"><b class="t">${icon('check', 'sm')} Chưa có lỗi nào trong danh sách app theo dõi</b></div>`;
  const full = P.full ? `<h2>Cả bài 40 phút</h2><div class="card"><p>${P.full.n} bài · trung bình <b>${P.full.words}</b> từ trong <b>${P.full.min}</b> phút</p><p class="small muted" style="margin-top:4px">${P.full.onTime}/${P.full.n} bài đủ 250 từ và xong trong 40 phút</p></div>` : '';
  return `<div class="page">${nav}${tiles}<h2>Lỗi theo tuần</h2>${chart}<h2>Lỗi hay gặp</h2>${top}${full}
    <h2>Xuất bài</h2><div class="card"><p class="small muted">Tất cả bài kèm đề, kết quả kiểm tra và gợi ý sửa, trong một file văn bản (.txt). Trên iPhone sẽ mở bảng Chia sẻ để lưu vào Tệp hoặc gửi đi.</p>
      <button class="btn soft" style="margin-top:12px" data-act="w-export">${icon('download', 'sm')} Xuất ${P.count} bài</button></div>
    <p class="small faint" style="margin:14px 2px 0">Bài viết cũng nằm trong file sao lưu (Cài đặt → Sao lưu).</p></div>`;
}

// Dùng cho kiểm thử tự động (không dùng trong giao diện).
export const _check = { detailChecks, overviewChecks, fullChecks, chartModel, essayChecks, suggestWords, wordRe, fullModel, wordDiff, compareVersions, portfolio, exportText };
