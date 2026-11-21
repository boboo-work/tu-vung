// Trò "Bẫy hay Thật" (Listening).
//  Lấy câu chứa đáp án trong lời thoại của các đề thật bạn đã nhập (Listening → Đề thật), giọng máy đọc lại câu đó.
//  Câu điền từ: Dễ = nhìn chữ, chạm đúng từ là đáp án, né từ bẫy; Vừa/Khó = chỉ nghe rồi gõ đáp án, xong mới hiện chữ.
//  Câu chọn chữ cái (A/B/C, nối, chọn 2): chọn đáp án khi nghe, rồi chạm cụm trong lời thoại làm bằng chứng.
//  Sau mỗi câu: vì sao chọn, bẫy, cặp paraphrase (lấy từ phần giải thích của đề nếu có).
//  Câu sai quay lại các lượt sau cho tới khi đúng 2 lần liên tiếp (dùng chung sổ câu sai với Săn từ).
import { S, saveHunt, logGrammarDay, ltPut } from './store.js';
import { esc, toast, uid, shuffle } from './util.js';
import { icon, on, go, back, replace, rerender, confirmSheet } from './ui.js';
import { qInfo, noteOf, alternatives, mdLite } from './ltest.js';
import { say, hush, pickVoice, numWords } from './listening.js';
import { mochi, bolt, kit } from './hunt.js';
import { chalReport } from './challenge.js';

// ---------------------------------------------------------------- Dữ liệu: câu hỏi từ đề thật đã nhập
const nt = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").replace(/[£$€]/g, '')
  .replace(/^[^a-z0-9]+|[^a-z0-9%]+$/g, '').replace(/[-–—]/g, ' ');
const NUMW = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'half', 'quarter']);
const isNum = (n) => /^\d/.test(n) || NUMW.has(n);
const letter = (s) => (String(s).toUpperCase().match(/\b[A-L]\b/) || [''])[0];
/** Lời thoại một Part → dãy từ: từ gạch chân (u), tên người nói (sp), đầu đoạn (br), phần (sec, tách bởi dòng ngắt), vị trí ký tự trong phần (c);
 *  mốc câu hỏi (Qn) ghi lại là vị trí từ ngay sau mốc. */
function stream(paras) {
  const T = [], marks = {}, secLen = [0];
  let sec = 0;
  for (const para of paras || []) {
    if (para.sep) { if (T.length) { sec++; secLen[sec] = 0; } continue; }
    const d = document.createElement('div');
    d.innerHTML = para.html || '';
    let cur = null, first = true;
    const push = (x) => { T.push({ ...x, sec, c: secLen[sec], br: first }); first = false; };
    const walk = (node, u) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1 && ch.classList.contains('lt-qb')) { cur = null; for (const q of ch.textContent.match(/\d+/g) || []) if (!(q in marks)) marks[q] = T.length; continue; }
        if (ch.nodeType === 1 && ch.tagName === 'B' && first && /^[A-Z][A-Za-z .'-]{0,24}:$/.test(ch.textContent.trim())) { cur = null; push({ t: ch.textContent.trim().replace(/:$/, ''), n: '', u: false, sp: true }); continue; }
        if (ch.nodeType === 1) { walk(ch, u || ch.tagName === 'U'); continue; }
        if (ch.nodeType !== 3) continue;
        for (const c of ch.nodeValue.replace(/\u00a0/g, ' ')) {
          if (/\s/.test(c)) { if (cur) { secLen[sec] += cur.t.length + 1; cur.n = nt(cur.t); } cur = null; continue; }
          if (!cur) { cur = { t: '', u: false }; push(cur); cur = T[T.length - 1]; }
          cur.t += c;
          if (u && /[\p{L}\p{N}]/u.test(c)) cur.u = true;
        }
      }
    };
    walk(d, false);
    if (cur) { secLen[sec] += cur.t.length + 1; cur.n = nt(cur.t); }
    for (const x of T) if (x.n === undefined) x.n = nt(x.t);
  }
  return { T, marks, secLen };
}
/** Vị trí cụm `alt` trong T[from..to); ưu tiên chỗ gạch chân, rồi chỗ gần mốc câu hỏi nhất. */
function findAlt(T, alt, from = 0, to = T.length) {
  const want = alt.split(' ').filter(Boolean).length;
  const hits = [];
  for (let i = Math.max(0, from); i < to; i++) {
    if (T[i].sp) continue;
    for (let len = 1; len <= Math.min(6, to - i); len++) {
      if (T[i + len - 1].sp) break;
      const w = T.slice(i, i + len).map((x) => x.n).filter(Boolean).join(' ');
      if (w === alt) { hits.push(Array.from({ length: len }, (_, j) => i + j)); break; }
      if (w.split(' ').length > want) break;
    }
  }
  return hits.filter((h) => h.some((i) => T[i].u)).pop() || hits.pop() || null;
}
/** Mọi chỗ khớp cụm `alt` trong T[from..to). */
function allAlt(T, alt, from, to) {
  const len = alt.split(' ').filter(Boolean).length, out = [];
  for (let i = Math.max(0, from); i + len <= Math.min(to, T.length); i++) {
    if (T[i].sp) continue;
    if (T.slice(i, i + len).map((x) => x.n).join(' ') === alt) out.push(Array.from({ length: len }, (_, j) => i + j));
  }
  return out;
}
/** Chỗ khớp đáp án gần mốc nhất trong khoảng [m - back, m + fwd); chỗ gạch chân được ưu tiên. */
function nearestAlt(T, alts, m, back, fwd) {
  let best = null, bestScore = Infinity;
  for (const a of alts) for (const h of allAlt(T, a, m - back, m + fwd)) {
    const dist = h[0] >= m ? h[0] - m : m - h[h.length - 1] - 1;
    const score = dist - (h.some((i) => T[i].u) ? 1000 : 0);
    if (score < bestScore) { best = h; bestScore = score; }
  }
  return best;
}
/** Phần gạch chân ngay sau mốc (bỏ qua tối đa 3 từ không gạch chân). */
function forwardRun(T, m) {
  let s = m;
  while (s < Math.min(T.length, m + 4) && !T[s].u) s++;
  if (s >= T.length || !T[s]?.u) return [];
  const out = [];
  for (let k = s, gap = 0; k < Math.min(T.length, s + 40); k++) {
    if (T[k].u) { out.push(k); gap = 0; } else if (++gap > 2) break;
  }
  return out;
}
/** Phần gạch chân gần nhất trước mốc (gộp các mẩu cách nhau ≤ 2 từ). */
function underRun(T, m, back = 35) {
  let e = m - 1;
  while (e >= Math.max(0, m - back) && !T[e].u) e--;
  if (e < 0 || !T[e]?.u || m - e > back) return [];
  let s = e;
  for (let k = e - 1; k >= Math.max(0, e - 40); k--) { if (T[k].u) s = k; else if (s - k > 2) break; }
  const out = [];
  for (let k = s; k <= e; k++) if (T[k].u) out.push(k);
  return out;
}
const endsSent = (x) => x && !x.sp && /[.?!…]["')\]]*$/.test(x.t);
/** Đoạn nghe quanh đáp án: từ đầu câu cách câu chứa đáp án 2 câu (tối đa ~55 từ) tới hết câu chứa mốc (+1 câu nếu ngắn). */
function windowOf(S0, a, m) {
  const T = S0.T, sec = T[Math.min(a, T.length - 1)].sec;
  let s = a, sents = 0;
  for (let k = a - 1; k >= 0 && T[k].sec === sec && a - k <= 55; k--) {
    if (endsSent(T[k]) && ++sents > 2) break;
    s = k;
  }
  if (a - s > 45) { let k = s; while (k < a - 20 && !endsSent(T[k])) k++; if (k < a - 20) s = k + 1; }
  let e = Math.max(a, m - 1), extra = 0;
  for (let k = e; k < T.length && T[k].sec === sec && k - m < 35; k++) {
    e = k;
    if (endsSent(T[k]) && k >= m - 1) { if (k - m >= 10 || extra++) break; }
  }
  while (s < e && T[s].sp && T[s + 1]?.sp) s++;
  return [s, e];
}
/** Các cách viết đáp án được chấp nhận, kèm cách đọc của số ("10" → "ten"). */
function altsOf(text) {
  const a = alternatives(text);
  for (const x of [...a]) if (/^\d{1,4}$/.test(x)) a.push(numWords(Number(x)).replace(/-/g, ' '));
  return [...new Set(a)];
}
/** Cụm trong ngoặc kép ở phần "Bẫy" của giải thích: "eight", "lots of pictures". */
const quoted = (s) => [...String(s || '').matchAll(/["“]([^"”]{1,50})["”]/g)].map((m) => nt(m[1].replace(/\s+/g, ' ')).replace(/[^a-z0-9' %]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Lời thoại không có mốc câu hỏi (Cam 20): dò lần lượt đáp án các câu điền từ theo thứ tự trong lời thoại,
 *  đặt mốc ngay sau đáp án và đánh dấu đáp án như chữ gạch chân. Câu chọn/nối không dò được vị trí nên bỏ qua. */
function inferMarks(S0, t, p) {
  let pos = 0;
  for (const g of p.groups) {
    if (g.t !== 'fill') continue;
    for (const n of g.gaps) {
      const k = t.key[n];
      if (!k?.text) continue;
      let hit = null;
      // Lấy lần xuất hiện ĐẦU TIÊN sau câu trước (findAlt lấy lần cuối, hợp với mốc có sẵn chứ không hợp ở đây).
      let best = null;
      for (const a of altsOf(k.text)) {
        const len = a.split(' ').length;
        for (let i = pos; i + len <= Math.min(S0.T.length, pos + 900); i++) {
          if (best && i >= best[0]) break;
          if (S0.T.slice(i, i + len).map((x) => x.n).join(' ') === a && !S0.T[i].sp) { best = Array.from({ length: len }, (_, j) => i + j); break; }
        }
      }
      hit = best;
      if (!hit) continue;
      hit.forEach((i) => { S0.T[i].u = true; });
      S0.marks[n] = hit[hit.length - 1] + 1;
      pos = hit[hit.length - 1] + 1;
    }
  }
}
function buildCards(t) {
  const out = [];
  if (!t.tx?.parts) return out;
  const tid = String(t.id).replace(/^X:/, '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const short = t.title.replace(/Cambridge(\s+IELTS)?\s*/i, 'Cam ').replace(/Listening\s*/i, '').replace(/\s+/g, ' ').trim();
  const seen = new Set();
  for (const p of t.parts) {
    const S0 = stream(t.tx.parts[p.n]);
    if (!S0.T.length) continue;
    if (!Object.keys(S0.marks).length) inferMarks(S0, t, p);
    for (const g of p.groups) {
      const nums = g.t === 'fill' ? g.gaps : g.t === 'mcq' ? g.qs.map((q) => q.n) : g.t === 'match' ? g.items.map((x) => x.n) : [g.nums[0]];
      for (const n of nums) {
        const k = t.key[n], info = qInfo(t, n), m = S0.marks[n];
        if (!k || !info || m == null || seen.has(n)) continue;
        const note = noteOf(t, n);
        let ansAbs = null, goodAbs = [];
        if (g.t === 'fill') {
          const alts = altsOf(k.text);
          // Mốc có thể đứng sau đáp án ("… <u>69</u> (Q1)") hoặc trước đáp án ("(Q32) <u>constant</u>", Cam 14):
          // xét cả hai phía, ưu tiên chỗ gạch chân rồi chỗ gần mốc nhất.
          ansAbs = nearestAlt(S0.T, alts, m, 45, 30) || nearestAlt(S0.T, alts, m, 110, 30);
          if (!ansAbs) { const u = underRun(S0.T, m, 30); if (u.length && u.length <= 4) ansAbs = u; }
          if (!ansAbs) { const f = forwardRun(S0.T, m); if (f.length && f.length <= 4) ansAbs = f; }
          if (!ansAbs) continue;
        } else if (g.t === 'multi') {
          // Chọn 2: mỗi đáp án có mốc riêng; phát trọn từ đáp án đầu tới đáp án sau.
          goodAbs = [...new Set(g.nums.flatMap((x) => (S0.marks[x] != null ? underRun(S0.T, S0.marks[x]) : [])))].sort((x, y) => x - y);
        } else {
          // Bằng chứng gạch chân thường ngay trước mốc; nếu ngay sau mốc có gạch chân mà phía trước thì xa, lấy phía sau.
          const bk = underRun(S0.T, m), fw = forwardRun(S0.T, m);
          goodAbs = fw.length && (!bk.length || m - bk[bk.length - 1] > 12) ? fw : bk;
        }
        const mEnd = g.t === 'multi' ? Math.max(...g.nums.map((x) => S0.marks[x] ?? m)) : m;
        const hit = ansAbs || goodAbs;
        const a = hit[0] ?? Math.max(0, m - 1);
        const lastHit = hit.length ? hit[hit.length - 1] : a;
        const [s, e] = windowOf(S0, a, mEnd - lastHit > 30 ? lastHit + 1 : mEnd);
        const T = S0.T.slice(s, e + 1).map((x) => ({ t: x.t, n: x.n, u: x.u, sp: !!x.sp, br: x.br }));
        const rel = (arr) => arr.map((i) => i - s).filter((i) => i >= 0 && i < T.length);
        const last = S0.T[e];
        const base = {
          key: `lt-${tid}|p${p.n}|${n}`, tid: t.id, test: short, pn: p.n, n, q: info.text, instr: info.instr, T, note,
          say: T.filter((x) => !x.sp).map((x) => x.t).join(' ').replace(/\s*…\s*/g, ' ').trim(),
          span: { sec: S0.T[s].sec, c0: S0.T[s].c, c1: last.c + last.t.length, secLen: S0.secLen },
        };
        if (g.t === 'fill') {
          const idx = rel(ansAbs);
          const ansSet = new Set(idx), trapIdx = new Set();
          for (const ph of quoted(note?.trap).filter((x) => x.length > 2 && !/^(a|an|the|of|to|and|or|in|on)$/.test(x))) { const h = findAlt(T, ph); if (h) h.forEach((i) => { if (!ansSet.has(i)) trapIdx.add(i); }); }
          if (idx.some((i) => isNum(T[i].n))) T.forEach((x, i) => { if (!ansSet.has(i) && !x.sp && isNum(x.n) && x.n !== 'one') trapIdx.add(i); });
          for (const i of [...trapIdx]) if (!T[i].n) trapIdx.delete(i);
          out.push({ ...base, kind: 'fill', ans: k.text, alts: altsOf(k.text), idx, trapIdx: [...trapIdx], limit: g.limit?.words ? `Tối đa ${g.limit.words} từ${g.limit.num ? ' và/hoặc một số' : ''}` : '' });
        } else {
          const right = g.t === 'multi' ? (k.set || []) : [letter(k.text)];
          if (!right.length || !right[0] || !info.opts?.length) continue;
          if (g.t === 'multi') g.nums.forEach((x) => seen.add(x));
          out.push({ ...base, kind: 'pick', nums: g.t === 'multi' ? g.nums : [n], opts: info.opts, right, need: right.length, good: rel(goodAbs) });
        }
        seen.add(n);
      }
    }
  }
  return out;
}
// Đề có lời thoại là đủ: lời thoại không có mốc (Qn) thì buildCards tự dò vị trí đáp án (xem inferMarks).
const tests = () => [...S.ltest.values()].filter((r) => r.kind === 'test' && r.tx?.parts && Object.values(r.tx.parts).some((x) => x?.length)).sort((a, b) => b.at - a.at);
const CACHE = new Map();
function cardsOf(t) {
  const sig = `${t.at}|${Object.keys(t.notes || {}).length}|${t.tx?.n}|2`;
  const c = CACHE.get(t.id);
  if (c?.sig === sig) return c.cards;
  const cards = buildCards(t);
  CACHE.set(t.id, { sig, cards });
  return cards;
}

// ---------------------------------------------------------------- Giọng gốc: dò vị trí đoạn nghe trong file mp3
// File nghe không có mốc thời gian. Cách dò: tìm các khoảng lặng; khoảng lặng dài (≥ 12 giây) là lúc thí sinh đọc câu hỏi.
// Đoạn nói giữa hai khoảng lặng dài, bỏ câu hướng dẫn ở đầu ("Now listen carefully…") và ở cuối ("Before you hear the rest…"),
// là phần hội thoại; mỗi phần lời thoại (tách bởi dòng ngắt) ứng với một đoạn nói, rồi chia theo tỉ lệ số ký tự.
// Đo với Cam 21 Test 1 (so với nhận dạng giọng nói): lệch trung bình 1,9 giây, lớn nhất 8 giây. Người chơi chỉnh được ±3 giây, app nhớ lại.
async function analyse(blob) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC) throw new Error('no audio context');
  const ctx = new AC(1, 8000, 8000);
  const buf = await new Promise((ok, bad) => { blob.arrayBuffer().then((ab) => { const r = ctx.decodeAudioData(ab, ok, bad); if (r?.then) r.then(ok, bad); }, bad); });
  const x = buf.getChannelData(0), rate = buf.sampleRate, fr = Math.round(rate * 0.05);
  const rms = [];
  for (let i = 0; i + fr <= x.length; i += fr) { let s = 0; for (let j = i; j < i + fr; j++) s += x[j] * x[j]; rms.push(Math.sqrt(s / fr)); }
  const thr = [...rms].sort((a, b) => a - b)[Math.floor(rms.length * 0.5)] * 0.15;
  const sil = [];
  let run = 0;
  rms.concat([Infinity]).forEach((r, i) => { if (r < thr) run++; else { if (run * 0.05 >= 1.5) sil.push([+((i - run) * 0.05).toFixed(2), +(run * 0.05).toFixed(2)]); run = 0; } });
  return { v: 1, dur: +(rms.length * 0.05).toFixed(2), sil };
}
function spansOf(al) {
  const LONG = 12, MID = 2.5;
  const longs = al.sil.filter((s) => s[1] >= LONG);
  const edges = [0, ...longs.flatMap((s) => [s[0], s[0] + s[1]]), al.dur];
  const blocks = [];
  for (let i = 0; i + 1 < edges.length; i += 2) blocks.push([edges[i], edges[i + 1]]);
  const out = [];
  blocks.forEach(([a, b], k) => {
    if ((k === 0 && blocks.length > 1) || b - a < 20) return; // phần giới thiệu trước lúc đọc câu hỏi
    const mids = al.sil.filter((s) => s[1] >= MID && s[1] < LONG && s[0] > a && s[0] < b);
    const st = mids.find((s) => s[0] - a < 12);
    const en = mids.find((s) => b - (s[0] + s[1]) < 25);
    out.push([st ? st[0] + st[1] : a, en && en[0] > (st ? st[0] + st[1] : a) + 20 ? en[0] : b]);
  });
  return out.length ? out : [[0, al.dur]];
}
/** Vị trí ký tự (phần sec, ký tự c) → giây trong file nghe. */
function timeAt(al, secLen, sec, c) {
  const sp = spansOf(al);
  if (sp.length === secLen.length) { const [a, b] = sp[sec]; return a + (b - a) * Math.min(1, c / (secLen[sec] || 1)); }
  const C = secLen.slice(0, sec).reduce((x, y) => x + y, 0) + c, total = secLen.reduce((x, y) => x + y, 0) || 1;
  let t = sp.reduce((x, [a, b]) => x + b - a, 0) * Math.min(1, C / total);
  for (const [a, b] of sp) { if (t <= b - a) return a + t; t -= b - a; }
  return sp[sp.length - 1][1];
}
/** Phân tích file nghe của các Part cần dùng (làm một lần, lưu vào đề). */
async function ensureAlign(cards) {
  const need = new Map();
  for (const c of cards) { const t = S.ltest.get(c.tid); if (t?.audio?.[c.pn] && !t.sil?.[c.pn]) need.set(`${c.tid}|${c.pn}`, [t.id, c.pn]); }
  for (const [id, pn] of need.values()) {
    try {
      const al = await analyse(S.ltest.get(id).audio[pn].blob);
      const t = S.ltest.get(id);
      await ltPut({ ...t, sil: { ...(t.sil || {}), [pn]: al } });
    } catch (e) { console.warn('Không phân tích được file nghe', e); }
  }
}
/** Đoạn cần phát (giây) của một câu; null khi không có file nghe. */
function clipOf(c) {
  const t = S.ltest.get(c.tid), al = t?.sil?.[c.pn];
  if (!t?.audio?.[c.pn] || !al) return null;
  const adj = Number(t.tadj?.[c.n]) || 0;
  const a = timeAt(al, c.span.secLen, c.span.sec, c.span.c0), b = timeAt(al, c.span.secLen, c.span.sec, c.span.c1);
  return { from: Math.max(0, a - 1.5 + adj), to: Math.min(al.dur, b + 1.5 + adj), adj };
}
/** Dùng cho kiểm thử. */
export const _tp = { buildCards, stream, cardsOf, analyse, spansOf, timeAt, clipOf, ensureAlign, get AU() { return AU; }, get H() { return H; } };

// ---------------------------------------------------------------- Thống kê (nằm chung S.hunt)
const hunt = () => S.hunt || (S.hunt = { plays: 0, best: 0, wrong: {}, pos: {}, seen: {} });
const lt = () => hunt().lt || (hunt().lt = { plays: 0, best: 0, n: 0, ok: 0, trap: 0 });
const wrongKeys = () => Object.keys(hunt().wrong).filter((k) => k.startsWith('lt-'));
export function trapStats() { const s = lt(); return { ...s, acc: s.n ? Math.round((s.ok / s.n) * 100) : null, ready: tests().length > 0 }; }

// ---------------------------------------------------------------- Chọn câu cho một lượt
const SIZE = 10;
const ui = { src: 'all', part: 'all', level: 'easy', onlyWrong: false };
function pickCards({ src, part, onlyWrong, keys }) {
  const ts = tests().filter((t) => src === 'all' || t.id === src);
  let pool = ts.flatMap(cardsOf).filter((c) => part === 'all' || String(c.pn) === part);
  const want = keys || (onlyWrong ? wrongKeys() : null);
  if (want) { const set = new Set(want); return shuffle(pool.filter((c) => set.has(c.key))).slice(0, SIZE); }
  const seen = hunt().seen, wr = hunt().wrong;
  const wrongFirst = shuffle(pool.filter((c) => c.key in wr)).slice(0, 4);
  pool = shuffle(pool.filter((c) => !(c.key in wr))).sort((a, b) => (seen[a.key] || 0) - (seen[b.key] || 0));
  return shuffle([...wrongFirst, ...pool.slice(0, SIZE - wrongFirst.length)]);
}

// ---------------------------------------------------------------- Lượt chơi
// H.phase: fill → listen/find/type → done → fb ; pick → pick → ev → done
let H = null;
let LAST = null;
let timer = 0;
const LV = {
  easy: { name: 'Dễ', rate: 1, plays: 9, sec: 25, hint: 'Nhìn chữ · chạm đáp án' },
  mid: { name: 'Vừa', rate: 1, plays: 2, sec: 40, hint: 'Chỉ nghe · nghe 2 lần' },
  hard: { name: 'Khó', rate: 1.1, plays: 1, sec: 25, hint: 'Nghe 1 lần · nhanh 1,1×' },
};
const lv = () => LV[H?.level || ui.level];
const hidden = () => H.level !== 'easy';
function startTimer(sec) {
  clearInterval(timer);
  H.dur = sec * 1000;
  H.deadline = Date.now() + H.dur;
  timer = setInterval(tick, 200);
}
function stopTimer() { clearInterval(timer); timer = 0; H && (H.deadline = 0); }
function tick() {
  if (!H || !location.hash.startsWith('#/tplay')) { stopTimer(); return; }
  const left = Math.max(0, H.deadline - Date.now());
  const bar = document.querySelector('#hn-timer i'), s = document.getElementById('hn-secs');
  if (bar) bar.style.width = `${(left / H.dur) * 100}%`;
  if (s) s.textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
  if (!left) { stopTimer(); onTimeout(); }
}
function onTimeout() {
  if (!H) return;
  if (H.phase === 'find') tapWord(-1);
  else if (H.phase === 'type') checkTyped(document.getElementById('tp-in')?.value || '', true);
  else if (H.phase === 'pick') submitPick(true);
  else if (H.phase === 'ev') tapEv(-1);
}
// Phát đoạn trong file nghe gốc (một thẻ <audio> dùng chung; mở khoá trong cú chạm "Bắt đầu" để iOS cho phát tự động sau đó).
const AU = { el: null, url: '', key: '', stopAt: 0, onend: null };
function au() {
  if (AU.el) return AU.el;
  const el = new Audio();
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  el.addEventListener('timeupdate', () => { if (AU.stopAt && el.currentTime >= AU.stopAt) endClip(); });
  el.addEventListener('ended', endClip);
  AU.el = el;
  return el;
}
function endClip() { const f = AU.onend; AU.onend = null; AU.stopAt = 0; AU.el?.pause(); f?.(); }
function srcFor(c) {
  const t = S.ltest.get(c.tid), a = t?.audio?.[c.pn];
  const key = `${c.tid}|${c.pn}`;
  if (!a || AU.key === key) return !!a;
  if (AU.url) URL.revokeObjectURL(AU.url);
  AU.url = URL.createObjectURL(a.blob);
  AU.key = key;
  const el = au();
  el.src = AU.url;
  el.load();
  return true;
}
/** Mở khoá phát âm thanh trên iOS: phải gọi ngay trong cú chạm của người dùng. */
function unlockAudio(c) {
  try {
    if (!c || !srcFor(c)) return;
    const el = au();
    el.muted = true;
    const p = el.play();
    const done = () => { el.pause(); el.muted = false; };
    if (p?.then) p.then(done, done); else done();
  } catch { /* bỏ qua */ }
}
/** Phát đoạn quanh đáp án; trả về false khi không có file nghe (dùng giọng máy). */
function playClip(c, rate, onend, onfail) {
  const clip = clipOf(c);
  if (!clip || !srcFor(c)) return false;
  const el = au();
  const go2 = () => {
    try { el.currentTime = clip.from; } catch { /* bỏ qua */ }
    el.muted = false;
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
    AU.stopAt = clip.to;
    AU.onend = onend;
    const p = el.play();
    if (p?.catch) p.catch(() => { AU.onend = null; AU.stopAt = 0; onfail?.(); });
  };
  if (el.readyState >= 1) go2(); else el.addEventListener('loadedmetadata', go2, { once: true });
  return true;
}
function stopAll() { hush(); AU.onend = null; AU.stopAt = 0; AU.el?.pause(); }
// Rời màn chơi (bấm tab khác, quay lại) thì dừng tiếng.
addEventListener('hashchange', () => { if (!location.hash.startsWith('#/tplay') && AU.el && !AU.el.paused) stopAll(); });
/** Nghe đoạn quanh đáp án; lần đầu nghe xong mới bắt đầu tính giờ (Vừa/Khó). */
function play() {
  if (!H) return;
  const c = H.cards[H.i];
  if (H.heard >= lv().plays) { toast(H.level === 'hard' ? 'Mức Khó chỉ nghe 1 lần' : 'Đã nghe đủ 2 lần'); return; }
  const id = H.cardId;
  H.heard++;
  syncPlay(true);
  const after = () => { if (H?.cardId === id) { syncPlay(false); if (!H.deadline && ['find', 'type', 'pick'].includes(H.phase)) startTimer(lv().sec); } };
  const fail = () => { if (H?.cardId === id) { H.heard--; H.blocked = true; syncPlay(false); } };
  if (playClip(c, lv().rate, after, fail)) return;
  const ok = say(c.say, { voice: H.voice, rate: (S.settings.listenRate || 0.95) * lv().rate, onend: after });
  if (!ok) { // máy không đọc được: hiện chữ luôn
    H.noVoice = true; H.heard = lv().plays;
    if (!H.deadline) startTimer(lv().sec);
    rerender();
  }
}
const srcLabel = (c) => (clipOf(c) ? 'Giọng gốc trong file nghe' : 'Giọng máy đọc lời thoại');
/** Cập nhật nút nghe ngay trên trang (không vẽ lại để không mất chữ đang gõ). */
function syncPlay(on) {
  const b = document.getElementById('tp-play');
  if (!b || !H) return;
  b.classList.toggle('playing', on);
  const left = lv().plays - H.heard;
  b.querySelector('b').textContent = on ? 'Đang phát…' : H.blocked && !H.heard ? 'Chạm để nghe' : 'Đoạn trong bài nghe';
  b.querySelector('small').textContent = on ? srcLabel(H.cards[H.i]) : left > 0 && lv().plays < 9 ? `Nghe lại · còn ${left} lần` : lv().plays < 9 ? 'Đã hết lượt nghe' : 'Nghe lại';
  b.disabled = !on && left <= 0;
}
function beginCard() {
  const c = H.cards[H.i];
  stopAll();
  stopTimer();
  Object.assign(H, { cardId: uid(), heard: 0, tap: undefined, why: '', typed: '', picks: [], ev: undefined, voice: pickVoice(), noVoice: false, blocked: false });
  H.phase = c.kind === 'fill' ? (hidden() ? 'type' : 'find') : 'pick';
  // Đồng hồ chạy khi nghe xong lần đầu (mức Dễ vẫn chạm được ngay trong lúc nghe).
  setTimeout(() => { if (H && H.cardId && H.heard === 0) play(); }, 450);
}
function result(ok, extra = {}) {
  const c = H.cards[H.i];
  H.res[H.i] = { key: c.key, ok, kind: c.kind, n: c.n, ans: c.kind === 'fill' ? c.ans : c.right.join(', '), test: c.test, ...extra };
  if (ok) { H.combo++; H.maxCombo = Math.max(H.maxCombo, H.combo); H.score += 20 + Math.min(4, H.combo - 1) * 5; } else H.combo = 0;
}
function tapWord(i) {
  if (!H || H.phase !== 'find') return;
  stopTimer();
  const c = H.cards[H.i];
  H.tap = i;
  H.why = i < 0 ? 'timeout' : c.idx.includes(i) ? 'right' : c.trapIdx.includes(i) ? 'trap' : 'miss';
  result(H.why === 'right', { why: H.why, picked: i >= 0 ? c.T[i].t : '' });
  H.phase = 'done';
  rerender();
}
function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}
function checkTyped(v, timeout = false) {
  if (!H || H.phase !== 'type') return;
  const c = H.cards[H.i];
  const a = String(v).trim().split(/\s+/).map(nt).filter(Boolean).join(' ');
  if (!a && !timeout) { toast('Gõ điều bạn nghe được nhé'); return; }
  stopTimer();
  stopAll();
  H.typed = String(v).trim();
  const trapWords = c.trapIdx.map((i) => c.T[i].n);
  if (!a) H.why = 'timeout';
  else if (c.alts.includes(a)) H.why = 'right';
  else if (trapWords.includes(a) || quoted(c.note?.trap).includes(a)) H.why = 'trap';
  else if (c.alts.some((k) => a + 's' === k || k + 's' === a)) H.why = 'plural';
  else if (c.alts.some((k) => k.length > 3 && lev(a, k) <= (k.length > 7 ? 2 : 1))) H.why = 'spell';
  else H.why = 'miss';
  result(H.why === 'right', { why: H.why, picked: H.typed });
  H.phase = 'done';
  rerender();
}
function togglePick(k) {
  if (!H || H.phase !== 'pick') return;
  const c = H.cards[H.i];
  if (c.need === 1) { H.picks = [k]; submitPick(); return; }
  H.picks = H.picks.includes(k) ? H.picks.filter((x) => x !== k) : [...H.picks, k].slice(-c.need);
  if (H.picks.length === c.need) submitPick(); else rerender();
}
function submitPick(timeout = false) {
  if (!H || H.phase !== 'pick') return;
  const c = H.cards[H.i];
  stopTimer();
  const hits = H.picks.filter((k) => c.right.includes(k)).length;
  H.pickOk = hits === c.need;
  H.why = timeout && !H.picks.length ? 'timeout' : H.pickOk ? 'right' : 'miss';
  // Có phần gạch chân trong lời thoại → chạm cụm làm bằng chứng; không có thì xong luôn.
  if (c.good.length) { stopAll(); H.phase = 'ev'; startTimer(LV.easy.sec); } else { result(H.pickOk, { why: H.why, picked: H.picks.join(', ') }); H.phase = 'done'; }
  rerender();
}
function tapEv(i) {
  if (!H || H.phase !== 'ev') return;
  stopTimer();
  const c = H.cards[H.i];
  H.ev = i;
  H.evHit = i >= 0 && c.good.includes(i);
  result(H.pickOk, { why: H.why, picked: H.picks.join(', '), ev: H.evHit });
  if (H.pickOk && H.evHit) H.score += 10;
  H.phase = 'done';
  rerender();
}
async function finish() {
  stopTimer();
  stopAll();
  const P = H;
  H = null;
  const done = P.res.filter(Boolean);
  const h = hunt(), s = lt();
  if (done.length) {
    const now = Math.round(Date.now() / 1000);
    for (const r of done) {
      h.seen[r.key] = now;
      if (!r.ok) h.wrong[r.key] = 0;
      else if (r.key in h.wrong) { h.wrong[r.key]++; if (h.wrong[r.key] >= 2) delete h.wrong[r.key]; }
    }
    s.plays++; s.best = Math.max(s.best, P.score); s.n += done.length; s.ok += done.filter((r) => r.ok).length; s.trap += done.filter((r) => r.why === 'trap').length;
    await saveHunt();
    await logGrammarDay('hSets', P.id); // tính vào chuỗi ngày học, không tính vào mục tiêu Listening
  }
  if (P.chal) { await chalReport('trap', { score: P.score, ok: done.filter((r) => r.ok).length, n: done.length }); return; }
  LAST = { score: P.score, ok: done.filter((r) => r.ok).length, n: done.length, maxCombo: P.maxCombo, ms: Date.now() - P.t0, traps: done.filter((r) => r.why === 'trap').length, dodged: done.filter((r) => r.ok && P.cards.find((c) => c.key === r.key)?.trapIdx?.length).length, wrong: done.filter((r) => !r.ok), counted: done.length > 0, level: P.level };
  replace('#/tres');
}

let starting = false;
on('tp-start', async (el) => {
  if (starting) return;
  const keys = el.dataset.keys ? el.dataset.keys.split(',') : null;
  const chal = el.dataset.chal === '1', size = Number(el.dataset.size) || 0;
  const opts = { src: ui.src, part: ui.part, onlyWrong: ui.onlyWrong, keys };
  if (!tests().length) { go('#/trap'); return; }
  // Thử thách hôm nay: lấy từ mọi đề, mọi Part, không chỉ câu sai (mức khó giữ như bạn đã chọn).
  const saved = { ...ui };
  if (chal) Object.assign(ui, { src: 'all', part: 'all', onlyWrong: false });
  const cards = pickCards(chal ? { ...opts, src: 'all', part: 'all', onlyWrong: false, keys: null } : opts).slice(0, size || SIZE);
  Object.assign(ui, saved);
  if (!cards.length) { toast(opts.onlyWrong ? 'Không còn câu sai nào để phục thù' : 'Chưa có câu phù hợp: đề cần có lời thoại'); return; }
  unlockAudio(cards.find((c) => S.ltest.get(c.tid)?.audio?.[c.pn]));
  if (cards.some((c) => { const t = S.ltest.get(c.tid); return t?.audio?.[c.pn] && !t.sil?.[c.pn]; })) {
    starting = true;
    toast('Đang dò đoạn nghe trong file gốc (chỉ lần đầu)…');
    try { await ensureAlign(cards); } finally { starting = false; }
  }
  H = { id: 'T:' + uid(), cards, i: 0, level: ui.level, score: 0, combo: 0, maxCombo: 0, t0: Date.now(), res: [], chal };
  beginCard();
  go('#/tplay');
});
on('tp-play', () => play());
on('tp-word', (el) => tapWord(Number(el.dataset.i)));
on('tp-opt', (el) => togglePick(el.dataset.k));
on('tp-ev', (el) => tapEv(Number(el.dataset.i)));
on('tp-check', () => checkTyped(document.getElementById('tp-in')?.value || ''));
on('tp-explain', () => { if (H?.phase === 'done') { H.phase = 'fb'; rerender(true); } });
on('tp-next', async () => {
  if (!H) return;
  if (H.i + 1 < H.cards.length) { H.i++; beginCard(); rerender(true); } else await finish();
});
on('tp-quit', async () => {
  if (!H) { back('#/games'); return; }
  const done = H.res.filter(Boolean).length;
  stopAll();
  if (!(await confirmSheet({ title: 'Dừng lượt chơi?', body: done ? `Đã làm ${done} câu: kết quả được lưu và tính vào chuỗi ngày học.` : 'Chưa làm câu nào nên lượt này không được lưu.', okLabel: 'Dừng' }))) return;
  if (done) await finish(); else { const chal = H.chal; stopTimer(); H = null; if (chal) replace('#/chal'); else back('#/games'); }
});
on('tp-replay', () => { const c = H?.cards[H.i]; if (!c) return; stopAll(); if (!playClip(c, 1)) say(c.say, { voice: H.voice, rate: S.settings.listenRate || 0.95 }); });
/** Đoạn nghe bị lệch: dời sớm/muộn 3 giây, nhớ cho câu này. */
on('tp-shift', async (el) => {
  const c = H?.cards[H.i];
  const t = c && S.ltest.get(c.tid);
  if (!t) return;
  const v = Math.max(-45, Math.min(45, (Number(t.tadj?.[c.n]) || 0) + Number(el.dataset.d)));
  await ltPut({ ...t, tadj: { ...(t.tadj || {}), [c.n]: v } });
  stopAll();
  playClip(c, 1);
  const lab = document.getElementById('tp-adj');
  if (lab) lab.textContent = adjText(v);
});
on('tp-set', (el) => { ui[el.dataset.k] = el.dataset.v; rerender(); });
on('tp-src', (el) => { ui.src = el.value; rerender(); });
on('tp-wrong', () => { ui.onlyWrong = !ui.onlyWrong; rerender(); });

// ---------------------------------------------------------------- Màn hình
const STAR = () => kit.STAR(), FLAME = () => kit.FLAME();
const bigBtn = (act, label, extra = '') => `<button class="hn-btn" data-act="${act}" ${extra}>${label}</button>`;
const panel = (bg, svg, title, body, btn) => `<div class="hn-panel" style="background:${bg}"><div class="hn-ptitle">${svg || ''}<b>${title}</b></div>${body ? `<p>${body}</p>` : ''}${btn}</div>`;
const clean = (w) => String(w).replace(/[^\p{L}\p{N}'£$%.-]/gu, '').replace(/\.$/, '');
function hud(c) {
  const dots = H.cards.map((_, i) => `<span class="hn-dot ${i < H.i ? (H.res[i]?.ok ? 'ok' : 'no') : i === H.i ? 'cur' : ''}"></span>`).join('');
  const timed = H.deadline > 0 && ['find', 'type', 'pick', 'ev'].includes(H.phase);
  const left = Math.max(0, H.deadline - Date.now());
  return `<div class="hn-top"><button class="hn-x" data-act="tp-quit" aria-label="Thoát">${icon('x')}</button>
    ${timed ? `<div class="hn-timer" id="hn-timer"><i style="width:${(left / H.dur) * 100}%"></i></div><span class="hn-pill sm" id="hn-secs">0:${String(Math.ceil(left / 1000)).padStart(2, '0')}</span>` : `<div class="hn-dots">${dots}</div>`}</div>
    <div class="hn-hud"><span class="hn-pill">${STAR()}${H.score}</span><span class="hn-meta">${esc(c.test)} · P${c.pn} · câu ${c.nums?.length > 1 ? c.nums.join('–') : c.n}</span><span class="hn-pill peach">${FLAME()}×${Math.max(1, H.combo)}</span></div>`;
}
function playBtn() {
  const left = lv().plays - H.heard;
  const sub = lv().plays >= 9 ? 'Nghe lại' : left > 0 ? `Nghe lại · còn ${left} lần` : 'Đã hết lượt nghe';
  return `<button class="tp-play" id="tp-play" data-act="tp-play" ${left <= 0 ? 'disabled' : ''}>${icon('speaker')}<span><b>${H.heard ? 'Đoạn trong bài nghe' : H.blocked ? 'Chạm để nghe' : 'Sắp phát…'}</b><small>${H.heard ? sub : srcLabel(H.cards[H.i])}</small></span></button>`;
}
const adjText = (v) => (v ? `đã dời ${v > 0 ? 'muộn' : 'sớm'} ${Math.abs(v)} giây` : 'đoạn tự dò');
/** Nghe lại sau khi trả lời + chỉnh đoạn nghe nếu bị lệch. */
function replayRow(c) {
  const clip = clipOf(c);
  if (!clip) return `<button class="tp-replay" data-act="tp-replay">${icon('speaker', 'sm')} Nghe lại (giọng máy)</button>`;
  return `<div class="tp-replayrow"><button class="tp-replay" data-act="tp-replay">${icon('speaker', 'sm')} Nghe lại đoạn này</button>
    <span class="tp-shift"><button data-act="tp-shift" data-d="-3" aria-label="Phát sớm hơn 3 giây">−3s</button><button data-act="tp-shift" data-d="3" aria-label="Phát muộn hơn 3 giây">+3s</button></span></div>
    <p class="tp-adjnote">Nghe lệch chỗ? Dời sớm/muộn, app nhớ cho câu này · <span id="tp-adj">${adjText(clip.adj)}</span></p>`;
}
/** Lời thoại: mỗi từ chạm được (data-act), hoặc che mờ khi chưa được nhìn. */
function words(c, act, mark, blur) {
  const br = (x, i) => (x.br && i ? '<br>' : '');
  if (blur) return `<p class="hn-para tp-blur" aria-label="Lời thoại đang che">${c.T.map((x, i) => (x.sp ? `${br(x, i)}<b class="tp-sp">${esc(x.t)}</b>` : `${br(x, i)}<span>${'•'.repeat(Math.min(9, x.t.length))}</span>`)).join(' ')}</p>`;
  return `<p class="hn-para tp-para">${c.T.map((x, i) => (x.sp ? `${br(x, i)}<b class="tp-sp">${esc(x.t)}</b>` : `${br(x, i)}<span class="hn-w ${mark ? mark(i) : ''}${act ? '' : ' off'}" ${act ? `data-act="${act}" data-i="${i}" role="button"` : ''}>${esc(x.t)}</span>`)).join(' ')}</p>`;
}
const qCard = (c, tagBg, tag) => `<div class="hn-card"><span class="hn-tag" style="background:${tagBg}">${tag}</span><p class="hn-q">${esc(c.q).replace(/\[ ___ \]/, '<span class="hn-gap">?</span>')}</p>${c.limit ? `<span class="hn-lim">${esc(c.limit)}</span>` : ''}</div>`;

function fillView(c) {
  const done = H.phase === 'done';
  const mark = (i) => (!done ? '' : c.idx.includes(i) ? 'right' : i === H.tap ? (H.why === 'trap' ? 'trap' : 'miss') : c.trapIdx.includes(i) ? 'trapmark' : '');
  let mid;
  if (H.phase === 'type') {
    mid = `<form data-submit="tp-check" class="tp-form"><input id="tp-in" class="answer-input tp-in" placeholder="Gõ đáp án bạn nghe được" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="Đáp án"></form>
      <div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">Lời thoại · hiện sau khi trả lời</span>${words(c, '', null, true)}</div>`;
  } else mid = `<div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">${done ? 'Lời thoại' : 'Chạm đúng từ là đáp án'}</span>${words(c, done ? '' : 'tp-word', mark, false)}</div>`;
  const picked = H.typed || (H.tap >= 0 ? clean(c.T[H.tap]?.t || '') : '');
  const V = {
    right: ['#D9F7EC', mochi('happy', 48), 'Nghe trúng rồi!', `Chuỗi ×${H.combo}`],
    trap: ['#FFE1EC', bolt('dizzy', 48), `Bẫy! “${esc(picked)}” không phải đáp án`, `Đáp án là “${esc(c.ans)}”.`],
    plural: ['#FFF0B8', bolt('calm', 48), 'Suýt đúng: thiếu hoặc thừa “s”', `Đáp án là “${esc(c.ans)}”.`],
    spell: ['#FFF0B8', bolt('calm', 48), 'Suýt đúng: sai chính tả', `Đáp án là “${esc(c.ans)}”.`],
    miss: ['#FFE1EC', bolt('dizzy', 48), 'Trượt mất rồi', `Đáp án là “${esc(c.ans)}”.`],
    timeout: ['#FFF0B8', bolt('calm', 48), 'Hết giờ!', `Đáp án là “${esc(c.ans)}”.`],
  }[H.why] || [];
  return `${hud(c)}${qCard(c, '#FFC9A8', `Câu ${c.n} · ${hidden() ? 'nghe rồi gõ' : 'bẫy hay thật?'}`)}
    ${done ? '' : playBtn()}${mid}
    ${done ? panel(V[0], V[1], V[2], V[3], bigBtn('tp-explain', 'Xem vì sao')) : ''}`;
}
function pickView(c) {
  const st = H.phase;
  const showText = st !== 'pick' || !hidden() || H.noVoice;
  const opts = c.opts.map((o) => {
    const on = H.picks.includes(o.k);
    const cls = st === 'pick' ? (on ? 'on' : '') : c.right.includes(o.k) ? 'right' : on ? 'wrong' : 'dim';
    return `<button class="tp-opt ${cls}" data-act="tp-opt" data-k="${o.k}" ${st === 'pick' ? '' : 'disabled'}><b>${o.k}</b><span>${esc(o.t)}</span></button>`;
  }).join('');
  const mark = (i) => (st !== 'done' ? '' : c.good.includes(i) ? 'right' : i === H.ev ? 'miss' : '');
  const ok = H.pickOk;
  const title = H.why === 'timeout' ? `Hết giờ · đáp án ${c.right.join(', ')}` : ok && (H.evHit || !c.good.length) ? `Đúng${c.good.length ? ' cả bằng chứng' : ''}!` : ok ? 'Đáp án đúng, bằng chứng chưa trúng' : `Bẫy rồi! Đáp án là ${c.right.join(', ')}`;
  return `${hud(c)}
    <p class="hn-step">${st === 'pick' ? (c.need > 1 ? `Chọn ${c.need} đáp án` : 'Nghe và chọn đáp án') : st === 'ev' ? 'Chạm cụm làm bằng chứng' : ''}</p>
    ${qCard(c, '#C7B8FF', `Câu ${c.nums.length > 1 ? c.nums.join('–') : c.n} · chọn chữ cái`)}
    ${st === 'pick' ? playBtn() : ''}
    <div class="tp-opts">${opts}</div>
    <div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">${st === 'ev' ? 'Chạm bằng chứng' : 'Lời thoại'}</span>${words(c, st === 'ev' ? 'tp-ev' : '', mark, !showText)}${st === 'done' ? replayRow(c) : ''}</div>
    ${st === 'done' ? panel(ok ? '#D9F7EC' : '#FFE1EC', ok ? mochi('happy', 48) : bolt('dizzy', 48), title, '', `${noteHtml(c.note)}${bigBtn('tp-next', H.i + 1 < H.cards.length ? 'Câu tiếp →' : 'Xem kết quả')}`) : ''}`;
}
function noteHtml(note) {
  if (!note) return '<p class="small faint">Đề này chưa có phần giải thích. Thêm file giải thích ở trang đề để xem vì sao chọn và bẫy nằm ở đâu.</p>';
  return `<div class="tp-note">
    ${note.bang ? `<p><b>Băng:</b> ${mdLite(note.bang)}</p>` : ''}
    ${note.why ? `<p><b>Vì sao:</b> ${mdLite(note.why)}</p>` : ''}
    ${note.para?.length ? `<div class="hn-pairs">${note.para.map(([a, b]) => `<div><span>Đề: ${esc(a)}</span>${icon('chev')}<span>Nghe: ${esc(b)}</span></div>`).join('')}</div>` : ''}
    ${note.trap ? `<p><b>Bẫy:</b> ${mdLite(note.trap)}</p>` : ''}
    ${note.elim ? `<p><b>Loại:</b> ${mdLite(note.elim)}</p>` : ''}
    ${note.tip ? `<p class="tp-tip">${icon('info', 'sm')} <span>${mdLite(note.tip)}</span></p>` : ''}</div>`;
}
function fbView(c) {
  const ok = H.why === 'right';
  const sent = c.T.map((x, i) => {
    const br = x.br && i ? '<br>' : '';
    if (x.sp) return `${br}<b class="tp-sp">${esc(x.t)}</b>`;
    const cls = c.idx.includes(i) ? 'ans' : c.trapIdx.includes(i) || i === H.tap ? 'trap' : '';
    return br + (cls ? `<b class="hn-hl ${cls}">${esc(x.t)}</b>` : esc(x.t));
  }).join(' ');
  const picked = H.typed || (H.tap >= 0 ? clean(c.T[H.tap]?.t || '') : '');
  return `<div class="hn-hero">${ok ? mochi('happy', 84) : bolt('dizzy', 84)}<div><p class="hn-big">${ok ? 'Nghe trúng!' : H.why === 'trap' ? 'Sập bẫy rồi!' : H.why === 'timeout' ? 'Hết giờ rồi!' : 'Trượt mất rồi'}</p>
      <p>${ok ? `<span class="hn-pill">${STAR()}+${20 + Math.min(4, H.combo - 1) * 5}</span> <span class="hn-pill peach">${FLAME()}×${H.combo}</span>` : `<span class="hn-pill pink">${picked ? `Bạn ${H.typed ? 'gõ' : 'chạm'} “${esc(picked)}”` : 'Chưa trả lời'}</span>`}</p></div></div>
    <div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">Đoạn trong bài nghe</span><p class="hn-sent tp-para">${sent}</p>${replayRow(c)}</div>
    <div class="hn-card"><span class="hn-tag" style="background:#FFD84D">Đáp án</span><p class="hn-word">${esc(c.ans)}</p>${c.alts.length > 1 ? `<p class="faint">Chấp nhận: ${esc(alternatives(c.ans).join(' / '))}</p>` : ''}</div>
    <div class="hn-card hn-note" style="background:#FFF0B8"><span class="hn-tag" style="background:#FFFFFF">${ok ? 'Bẫy bạn đã né' : 'Vì sao?'}</span>${noteHtml(c.note)}</div>`;
}
export function playView() {
  if (!H) return { html: `<div class="page hn-scr"><div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Bẫy hay Thật</h1></div><div class="hn-card" style="margin-top:20px"><p>Lượt chơi đã kết thúc.</p>${bigBtn('go', 'Về tab Game', 'data-to="#/games"')}</div></div>` };
  const c = H.cards[H.i];
  let body, actions = '', focus = null;
  if (c.kind === 'fill') {
    if (H.phase === 'fb') { body = fbView(c); actions = bigBtn('tp-next', H.i + 1 < H.cards.length ? 'Câu tiếp →' : 'Xem kết quả'); }
    else { body = fillView(c); if (H.phase === 'type') { actions = bigBtn('tp-check', 'Kiểm tra'); focus = '#tp-in'; } }
  } else body = pickView(c);
  return { html: `<div class="page session hn-scr hn-play tp-play-scr ${H.phase === 'fb' ? (H.why === 'right' ? 'win' : 'lose') : ''}"><div class="ses-body">${body}</div>${actions ? `<div class="ses-actions">${actions}</div>` : ''}</div>`, focus };
}

export function resultView() {
  if (!LAST) return `<div class="page hn-scr"><div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Bẫy hay Thật</h1></div><div class="hn-card" style="margin-top:20px"><p>Chưa có lượt nào vừa chơi.</p></div></div>`;
  const L = LAST;
  const mm = `${Math.floor(L.ms / 60000)}:${String(Math.floor(L.ms / 1000) % 60).padStart(2, '0')}`;
  const streak = kit.streakDays();
  const WHY = { trap: 'dính bẫy', timeout: 'hết giờ', plural: 'thiếu/thừa “s”', spell: 'sai chính tả' };
  const wrong = L.wrong.slice(0, 6).map((r) => `<p><b>Câu ${r.n}</b> · đáp án <b>${esc(r.ans)}</b>${WHY[r.why] ? ` · ${WHY[r.why]}` : ''}${r.picked && r.why !== 'timeout' ? ` “${esc(r.picked)}”` : ''}</p>`).join('');
  return `<div class="page hn-scr hn-res">
    <div class="hn-trophy">${mochi('happy', 70)}<svg width="92" height="92" viewBox="0 0 64 64" aria-hidden="true"><path d="M18 30a14 14 0 0 1 28 0v12" fill="none" stroke="#2B2240" stroke-width="3"/><rect x="10" y="30" width="12" height="20" rx="5" fill="#FFC9A8" stroke="#2B2240" stroke-width="2.4"/><rect x="42" y="30" width="12" height="20" rx="5" fill="#FFC9A8" stroke="#2B2240" stroke-width="2.4"/></svg>${bolt('happy', 70)}</div>
    <p class="hn-big center">Nghe trúng ${L.ok}/${L.n}!</p>
    ${L.counted ? `<p class="center hn-sub">+1 ngày vào chuỗi học${streak ? ` · giờ là <span class="hn-pill sm peach">${streak} ngày</span>` : ''}</p>` : ''}
    <div class="hn-tiles3"><div style="background:#FFD84D"><b>${L.score}</b><span>điểm</span></div><div style="background:#FFB3CB"><b>${L.traps}</b><span>lần dính bẫy</span></div><div style="background:#BFE3FF"><b>${mm}</b><span>thời gian</span></div></div>
    ${L.wrong.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFB3CB">${L.wrong.length} câu cần phục thù</span>${wrong}</div>` : ''}
    <div class="hn-row2">${bigBtn('go', 'Xong', 'data-to="#/games" style="flex:.75;background:#fff"')}${L.wrong.length ? bigBtn('tp-start', `Phục thù ${L.wrong.length} câu!`, `data-keys="${esc(L.wrong.map((r) => r.key).join(','))}" style="flex:1.25"`) : bigBtn('tp-start', 'Chơi lượt mới!', 'style="flex:1.25"')}</div>
  </div>`;
}

// ---------------------------------------------------------------- Chọn lượt chơi
export function setupView() {
  const ts = tests();
  const head = `<div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Bẫy hay Thật</h1><span class="hn-pill sm peach">Listening</span></div>`;
  const how = `<div class="hn-card" style="background:#FFF0B8">
      <div class="hn-stp"><span>1</span><p><b>Nghe câu chứa đáp án</b> · lấy từ lời thoại đề thật</p></div>
      <div class="hn-stp"><span>2</span><p><b>Chọn đáp án thật</b> · né số, từ “gần giống” bị gài</p></div>
      <div class="hn-stp"><span>3</span><p><b>Xem bẫy &amp; paraphrase</b> · vì sao chọn câu đó</p></div></div>`;
  if (!ts.length) {
    return `<div class="page hn-scr hn-setup">${head}${how}
      <div class="hn-card"><div class="hn-say">${bolt('calm', 58)}<div class="hn-bub">Chưa có đề nào để chơi. Hãy nhập một đề Listening thật <b>có lời thoại</b> (Học → Listening → Đề thật), kèm file giải thích nếu có.</div></div></div>
      <div class="hn-bottom">${bigBtn('go', 'Nhập đề Listening', 'data-to="#/limport"')}</div></div>`;
  }
  if (ui.src !== 'all' && !ts.some((t) => t.id === ui.src)) ui.src = 'all';
  const seg = (k, opts) => `<div class="hn-seg">${opts.map(([v, l]) => `<button class="${ui[k] === v ? 'on' : ''}" data-act="tp-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const n = ts.filter((t) => ui.src === 'all' || t.id === ui.src).flatMap(cardsOf).filter((c) => ui.part === 'all' || String(c.pn) === ui.part).length;
  const nw = wrongKeys().length;
  return `<div class="page hn-scr hn-setup">${head}${how}
    <p class="hn-lab">Đề</p>
    <div class="hn-card hn-src"><select class="hn-select" data-change="tp-src" aria-label="Đề"><option value="all">Tất cả đề đã nhập (${ts.length})</option>${ts.map((t) => `<option value="${esc(t.id)}" ${ui.src === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select></div>
    <p class="hn-lab">Part</p>${seg('part', [['all', 'Tất cả'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']])}
    <p class="hn-lab">Mức khó</p>${seg('level', [['easy', 'Dễ'], ['mid', 'Vừa'], ['hard', 'Khó']])}
    <p class="hn-sub" style="margin:6px 4px 0">${LV[ui.level].hint}</p>
    <div class="hn-card hn-toggle"><span><b>Chỉ câu đã sai</b><br><span class="faint">${nw ? `${nw} câu đang chờ phục thù` : 'Chưa có câu nào'}</span></span>
      <button class="hn-sw ${ui.onlyWrong ? 'on' : ''}" data-act="tp-wrong" aria-label="Chỉ câu đã sai" aria-pressed="${ui.onlyWrong}" ${nw ? '' : 'disabled'}><i></i></button></div>
    <p class="hn-sub" style="margin:10px 4px 0">${n} câu chơi được${n ? '' : ' · đề cần có lời thoại'}</p>
    <div class="hn-bottom">${bigBtn('tp-start', 'Bắt đầu nghe!', n ? '' : 'disabled')}</div>
  </div>`;
}
