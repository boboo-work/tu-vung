// Luyện Writing: Task 2 theo đoạn và Task 1 với biểu đồ tự sinh.
// Phản hồi không dùng AI: thống kê (đếm), đối chiếu số liệu (Task 1, app biết số liệu gốc),
// dò lỗi theo mẫu (luật trong content/writing/rules.json, chỉ là gợi ý), bài mẫu và tự chấm.
import { S, wPut, wDel, essays, logGrammarDay, dayOf, saveWord, findByText, blankWord } from './store.js';
import { esc, toast, today, uid } from './util.js';
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

function readNumbers(sentence, tpl) {
  const noYears = sentence.replace(/\b(19|20)\d{2}\b/g, ' ');
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
  const years = [...sentence.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const bad = years.filter((y) => !xs.includes(y));
  bad.forEach((y) => c.push({ ok: false, msg: `Năm ${y} không có trong biểu đồ (${xs[0]}–${xs[xs.length - 1]}).` }));
  const ys = [...new Set(years.filter((y) => xs.includes(y)))].sort();
  const i0 = ys.length >= 2 ? xs.indexOf(ys[0]) : ys.length ? null : 0;
  const i1 = ys.length >= 2 ? xs.indexOf(ys[ys.length - 1]) : ys.length ? null : xs.length - 1;
  if (!skipName) c.push(ys.length ? { ok: true, msg: 'Có mốc thời gian.' } : { ok: null, msg: 'Nên nêu năm cho số liệu.' });
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
    if (idx.length !== 1 || !(/\d/.test(s.replace(/\b(19|20)\d{2}\b/g, '')) || UP.test(s) || DOWN.test(s) || FLAT.test(s))) continue;
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
/** Gợi ý bài kế tiếp: lần lượt từng đề, từng phần; các dạng đề xen kẽ nhau. */
export function nextPart() {
  if (W.state !== 'ready') return null;
  const byType = Object.keys(W.types).map((t) => W.order.filter((id) => W.prompts.get(id).type === t));
  const interleaved = [];
  for (let i = 0; i < 6; i++) byType.forEach((list) => list[i] && interleaved.push(list[i]));
  for (const id of interleaved) for (const p of W.parts) if (!partDone(id, p.id)) return { prompt: W.prompts.get(id), part: p };
  return null;
}

let ws = null;
let saveTimer = null;

function startPart(promptId, partId) {
  const prompt = W.prompts.get(promptId), part = W.parts.find((p) => p.id === partId);
  if (!prompt || !part) return toast('Không tìm thấy đề này');
  const key = `draft:${promptId}:${partId}`;
  ws = { kind: 'part', prompt, part, key, text: S.writing.get(key)?.text || '', stage: 'write', startedAt: Date.now(), self: {} };
  go('#/wwrite');
}
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
// Đề khác: thay biểu đồ ngay tại chỗ, không thêm trang vào lịch sử.
on('w-newchart', () => { if (ws?.kind === 'task1') startChart(ws.mode.id, undefined, undefined, false); });
on('w-input', (el) => {
  if (!ws) return;
  ws.text = el.value;
  const n = countWords(ws.text), p = ws.kind === 'part' ? ws.part : ws.mode;
  const out = document.getElementById('w-count');
  if (out) { out.textContent = `${n} từ · nên ${p.min}–${p.max}`; out.className = 'w-count ' + (n < p.min ? '' : n > p.max ? 'over' : 'ok'); }
  clearTimeout(saveTimer);
  const snap = { ...ws };
  saveTimer = setTimeout(() => {
    const rec = { id: snap.key, kind: 'draft', text: snap.text, at: today() };
    if (snap.kind === 'task1') rec.chart = { tpl: snap.chart.tpl.id, seed: snap.chart.seed, target: snap.chart.target, mode: snap.mode.id };
    wPut(rec).catch(() => {});
  }, 700);
});
on('w-quit', () => { clearTimeout(saveTimer); ws = null; back('#/writing'); });

on('w-submit', async () => {
  if (!ws || ws.stage !== 'write') return;
  const text = (document.getElementById('w-text')?.value ?? ws.text).trim();
  if (countWords(text) < 3) { toast('Hãy viết ít nhất một câu trước khi nộp'); return; }
  clearTimeout(saveTimer);
  ws.text = text;
  const stats = textStats(text);
  const hits = runRules(text);
  let checks, title;
  if (ws.kind === 'part') { checks = partChecks(ws.prompt, ws.part, text); title = `${ws.part.name} · ${ws.prompt.q.slice(0, 80)}`; }
  else {
    const ch = ws.chart;
    checks = ws.mode.id === 'detail' ? [lengthCheck(text, ws.mode), ...detailChecks(ch, text, ch.target)] : ws.mode.id === 'overview' ? [lengthCheck(text, ws.mode), ...overviewChecks(ch, text)] : [lengthCheck(text, ws.mode), ...fullChecks(ch, text)];
    title = `Task 1 · ${ws.mode.name} · ${ch.tpl.title}`;
  }
  const id = 'e:' + uid();
  const rec = {
    id, kind: ws.kind, promptId: ws.kind === 'part' ? ws.prompt.id : '', part: ws.kind === 'part' ? ws.part.id : ws.mode.id, title,
    text, words: stats.words, ms: Date.now() - ws.startedAt, at: today(),
    chart: ws.kind === 'task1' ? { tpl: ws.chart.tpl.id, seed: ws.chart.seed, mode: ws.mode.id, target: ws.chart.target } : null,
    report: { stats: { words: stats.words, sentences: stats.sentences, paragraphs: stats.paragraphs, avgLen: stats.avgLen, complex: stats.complex, linkers: stats.linkers }, hits: hits.map((h) => ({ rule: h.rule, text: h.text })), dismissed: [], checks },
    self: {},
  };
  await wPut(rec);
  await wDel(ws.key).catch(() => {});
  await logGrammarDay('wEssays', id);
  // Lỗi bắt được → Sổ lỗi (mỗi nhãn một lần cho mỗi bài).
  for (const tag of new Set(hits.map((h) => ruleOf(h.rule)?.tag).filter(Boolean))) await logGrammarError(tag, false);
  Object.assign(ws, { stage: 'report', essayId: id, stats, hits, checks });
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
on('w-stage', (el) => { if (ws) { ws.stage = el.dataset.to; rerender(true); } });
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
  const today_ = `<div class="card">
    <div class="row-between"><div style="min-width:0"><p class="small muted">${goal ? `Hôm nay: ${done}/${goal} bài` : `Hôm nay: ${done} bài`}</p>
      ${next ? `<b style="font-size:18px;display:block;margin-top:2px">${esc(next.part.name)}</b><p class="small muted w-clip">${esc(next.prompt.q)}</p>` : '<b>Bạn đã viết hết các phần của 30 đề</b>'}</div>${goal ? ring(done, goal) : ''}</div>
    ${next ? `<button class="btn" style="margin-top:14px" data-act="w-today">Viết phần này · ${next.part.min}–${next.part.max} từ</button>` : ''}
  </div>`;
  const t1 = `<h2>Task 1 · biểu đồ tự sinh</h2><div class="card">
    <p class="small muted" style="margin-bottom:12px">Mỗi lần là một bộ số liệu mới. App biết số liệu gốc nên kiểm tra được con số, năm, xu hướng và giới từ trong câu bạn viết.</p>
    <div class="stack">${W.modes.map((m, i) => `<button class="btn ${i ? 'ghost' : 'soft'}" data-act="w-chart" data-mode="${m.id}">${esc(m.name)} <span class="small" style="opacity:.75">· ${m.min}–${m.max} từ</span></button>`).join('')}</div></div>`;
  const types = Object.entries(W.types).map(([t, info]) => {
    const ids = W.order.filter((id) => W.prompts.get(id).type === t);
    const n = ids.reduce((a, id) => a + W.parts.filter((p) => partDone(id, p.id)).length, 0);
    return `<button class="listlink" data-act="go" data-to="#/wtype/${t}"><span class="lead">${icon('pen')}</span><span class="body"><b>${esc(info.name)}</b><small>${ids.length} đề · đã viết ${n}/${ids.length * W.parts.length} phần</small></span>${icon('chev')}</button>`;
  }).join('');
  return `<div class="page">${head}${today_}${t1}<h2>Task 2 theo dạng đề</h2>${types}
    <button class="listlink" data-act="go" data-to="#/wessays" style="margin-top:14px"><span class="lead">${icon('list')}</span><span class="body"><b>Bài đã viết</b><small>${all.length} bài</small></span>${icon('chev')}</button>
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
  const rows = W.parts.map((part, i) => {
    const e = partDone(id, part.id), draft = S.writing.get(`draft:${id}:${part.id}`);
    const sub = e ? `Đã viết · ${e.words} từ` : draft ? 'Có bản nháp' : `${part.min}–${part.max} từ`;
    return `<div class="wrow" data-act="w-part" data-p="${id}" data-part="${part.id}"><span class="num ${e ? 'done' : ''}">${e ? icon('check', 'sm') : i + 1}</span>
      <div class="body"><span style="font-weight:600">${esc(part.name)}</span><p>${sub}</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<div class="page">${navBar('Đề Task 2', { fallback: `#/wtype/${p.type}` })}
    <div class="card"><div class="pill-list" style="margin-bottom:10px"><span class="tag">${esc(W.types[p.type].short)}</span><span class="tag">${esc(p.topic)}</span></div><p class="w-prompt">${esc(p.q)}</p></div>
    <h2>5 phần của bài</h2><div class="wlist" style="margin-top:0">${rows}</div></div>`;
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

function modelText() {
  if (ws.kind === 'part') return ws.prompt.model[ws.part.id];
  return chartModel(ws.chart, ws.mode.id);
}

export function writeView() {
  if (!ws) { setTimeout(() => replace('#/writing')); return ''; }
  const label = ws.kind === 'part' ? `Task 2 · ${ws.part.name}` : `Task 1 · ${ws.mode.name}`;
  const steps = ['write', 'report', 'model', 'self'];
  const pct = Math.round((steps.indexOf(ws.stage) / steps.length) * 100);
  const top = `<div class="ses-top"><button class="iconbtn" data-act="w-quit" aria-label="Thoát">${icon('x')}</button><div class="progress"><i style="width:${pct}%"></i></div><span class="count">${steps.indexOf(ws.stage) + 1}/4</span></div>
    <p class="mode-label">${esc(label)}</p>`;
  const p = ws.kind === 'part' ? ws.part : ws.mode;
  const promptCard = ws.kind === 'part'
    ? `<div class="card"><p class="w-prompt small">${esc(ws.prompt.q)}</p></div>`
    : `${chartSvg(ws.chart, ws.mode.id === 'detail' ? ws.chart.target : -1)}<p class="small muted w-prompt" style="margin:8px 2px 0">${esc(chartPrompt(ws.chart))}</p>`;
  let body, actions;
  if (ws.stage === 'write') {
    const n = countWords(ws.text);
    const task = ws.kind === 'task1' && ws.mode.id === 'detail' ? `${p.task} Đối tượng: <b>${esc(ws.chart.series[ws.chart.target].name)}</b>.` : esc(p.task);
    body = `${promptCard}<p class="w-task">${task}</p>
      <textarea id="w-text" class="input w-editor" rows="${p.max > 100 ? 12 : 5}" data-in="w-input" placeholder="Viết bằng tiếng Anh…" autocapitalize="sentences" spellcheck="false">${esc(ws.text)}</textarea>
      <p id="w-count" class="w-count ${n < p.min ? '' : n > p.max ? 'over' : 'ok'}">${n} từ · nên ${p.min}–${p.max}</p>`;
    actions = `<div class="btn-row">${ws.kind === 'task1' ? `<button class="btn ghost" data-act="w-newchart" style="flex:.7">Đề khác</button>` : ''}<button class="btn" data-act="w-submit">Nộp bài</button></div>`;
  } else if (ws.stage === 'report') {
    const rec = S.writing.get(ws.essayId);
    body = `<h3 class="w-h">Kiểm tra tự động</h3>${checksHtml(ws.checks)}<h3 class="w-h">Thống kê</h3>${statsHtml(ws.stats)}
      <h3 class="w-h">Gợi ý sửa lỗi</h3>${hitsHtml(rec, ws.hits)}`;
    actions = `<button class="btn" data-act="w-stage" data-to="model">Xem bài mẫu</button>`;
  } else if (ws.stage === 'model') {
    const model = modelText();
    const phrases = ws.kind === 'part' ? ws.prompt.phrases : [];
    body = `<h3 class="w-h">Bài của bạn</h3><div class="card w-text">${esc(ws.text)}</div>
      <h3 class="w-h">Bài mẫu${ws.kind === 'part' ? ' band 7' : ' (app tạo từ số liệu)'}</h3><div class="card w-text w-model">${esc(model)}</div>
      ${phrases.length ? `<h3 class="w-h">Cụm hay nên lưu</h3>${phrases.map((ph) => {
        const ex = Object.values(ws.prompt.model).join(' ').match(new RegExp(`[^.]*${ph.en.split(' ').slice(0, 2).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]*\\.`, 'i'))?.[0]?.trim() || '';
        const has = !!findByText(ph.en);
        return `<div class="card w-phrase"><div style="min-width:0"><b class="en">${esc(ph.en)}</b><p class="small muted">${esc(ph.vi)}</p></div><button class="btn ${has ? 'ghost' : 'soft'} sm" data-act="w-save-phrase" data-en="${esc(ph.en)}" data-vi="${esc(ph.vi)}" data-ex="${esc(ex)}" ${has ? 'disabled' : ''}>${has ? 'Đã có' : '+ Lưu'}</button></div>`;
      }).join('')}` : ''}`;
    actions = `<button class="btn" data-act="w-stage" data-to="self">Tự chấm</button>`;
  } else {
    const qs = p.self || [];
    body = `<p class="muted" style="margin-bottom:10px">So bài của bạn với bài mẫu và trả lời thật lòng. App không quy đổi thành điểm band.</p>
      ${qs.map((q, i) => `<div class="card w-self"><p>${esc(q)}</p><div class="tf" style="margin-top:10px">
        <button class="opt ${ws.self[i] === true ? 'right' : ''}" data-act="w-self" data-q="${i}" data-v="1">Có</button>
        <button class="opt ${ws.self[i] === false ? 'wrong' : ''}" data-act="w-self" data-q="${i}" data-v="0">Chưa</button></div></div>`).join('')}
      ${Object.values(ws.self).some((v) => v === false) ? `<div class="banner info" style="margin-top:12px">${icon('info')}<span>Mục nào còn “Chưa”, hãy sửa ở lần viết sau cho đề này.</span></div>` : ''}`;
    actions = `<button class="btn" data-act="w-finish">Hoàn thành</button>`;
  }
  return { html: `<div class="page session">${top}<div class="ses-body">${body}</div><div class="ses-actions">${actions}</div></div>`, focus: ws.stage === 'write' && !ws.text ? '#w-text' : null };
}

export function essaysView() {
  const list = essays().sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const rows = list.map((e) => {
    const errs = e.report.hits.filter((h) => !e.report.dismissed.includes(h.rule + '|' + h.text)).length;
    return `<div class="wrow" data-act="go" data-to="#/wessay/${e.id}"><div class="body"><span style="font-weight:600" class="w-clip">${esc(e.title)}</span><p>${e.at.split('-').reverse().join('/')} · ${e.words} từ · ${errs} gợi ý sửa</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<div class="page">${navBar('Bài đã viết', { fallback: '#/writing' })}
    ${list.length ? `<div class="wlist" style="margin-top:0">${rows}</div>` : `<div class="card empty"><div class="art">${icon('pen')}</div><h3>Chưa có bài nào</h3><p>Bài bạn nộp sẽ được lưu ở đây cùng báo cáo.</p></div>`}</div>`;
}

export function essayView(id) {
  const e = S.writing.get(id);
  if (!e || e.kind === 'draft') return `<div class="page">${navBar('Bài viết', { fallback: '#/wessays' })}<div class="empty"><p>Không tìm thấy bài này.</p></div></div>`;
  let chart = '';
  if (e.kind === 'task1' && e.chart && W.state === 'ready') { const ch = genChart(e.chart.tpl, e.chart.seed, e.chart.target); chart = chartSvg(ch, e.chart.mode === 'detail' ? ch.target : -1); }
  const prompt = e.kind === 'part' && W.prompts.get(e.promptId);
  const hits = e.report.hits.map((h) => ({ ...h, match: (() => { const r = ruleOf(h.rule); if (!r) return ''; r.rx.lastIndex = 0; const m = r.rx.exec(h.text); return m ? m[0].replace(/^[.!?\n\s]+/, '').trim() : ''; })() }));
  const self = Object.entries(e.self || {});
  return `<div class="page">${navBar('Bài viết', { fallback: '#/wessays' })}
    <p class="small muted" style="margin:0 2px 8px">${esc(e.title)} · ${e.at.split('-').reverse().join('/')}</p>
    ${prompt ? `<div class="card"><p class="w-prompt small">${esc(prompt.q)}</p></div>` : ''}${chart}
    <h3 class="w-h">Bài của bạn</h3><div class="card w-text">${esc(e.text)}</div>
    <h3 class="w-h">Kiểm tra tự động</h3>${checksHtml(e.report.checks)}
    <h3 class="w-h">Thống kê</h3>${statsHtml({ ...e.report.stats, repeated: textStats(e.text).repeated })}
    <h3 class="w-h">Gợi ý sửa lỗi</h3>${W.state === 'ready' ? hitsHtml(e, hits) : ''}
    ${self.length ? `<h3 class="w-h">Tự chấm</h3><p class="small muted">${self.filter(([, v]) => v).length}/${self.length} mục “Có”</p>` : ''}
    ${prompt ? `<button class="btn soft" style="margin-top:16px" data-act="w-part" data-p="${e.promptId}" data-part="${e.part}">Viết lại phần này</button>` : ''}
    <button class="btn danger" style="margin-top:10px" data-act="w-delete" data-id="${e.id}">${icon('trash', 'sm')} Xoá bài</button></div>`;
}

// Dùng cho kiểm thử tự động (không dùng trong giao diện).
export const _check = { detailChecks, overviewChecks, fullChecks, chartModel };
