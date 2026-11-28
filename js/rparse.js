// Đọc bộ đề Reading từ 3 file Markdown của người học (bản JS của tools/reading_import.py):
//   1. Đề + đáp án   (Practice Cam 17 Reading Test 01 _ ….md — chép từ web)
//   2. Simplify       (cam17-test1-simplify-connection-full.md)
//   3. Giải chi tiết  (cam17-test1-reading-giai-chi-tiet.md)
// buildTest(...) trả về đúng cấu trúc content/reading/<id>.json để reading.js dùng chung.
// Không phụ thuộc trình duyệt (chạy được bằng node để đối chiếu với file JSON có sẵn).

const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const CR = `[${CIRC}]`;
const FIXES = [['kā kā pō', 'kākāpō'], ['Kā kā pō', 'Kākāpō'], ['NOTGIVEN', 'NOT GIVEN'], ['NOT  GIVEN', 'NOT GIVEN']];
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
const END = '(?![\\s\\S])'; // \Z của Python

export class Skip extends Error {}

// ---------------------------------------------------------------- tiện ích regex kiểu Python
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Tìm từ vị trí pos (giống pattern.search(s, pos)). */
function search(re, s, pos = 0) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  g.lastIndex = pos;
  return g.exec(s);
}
const all = (re, s) => [...s.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))];
const uniq = (arr) => [...new Set(arr)];
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);
const isUpper = (s) => s === s.toUpperCase() && s !== s.toLowerCase();
const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const titleCase = (s) => s.toLowerCase().replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/'(\p{L})/gu, (m) => m.toLowerCase());
const stripChars = (s, chars) => { let a = 0, b = s.length; while (a < b && chars.includes(s[a])) a++; while (b > a && chars.includes(s[b - 1])) b--; return s.slice(a, b); };

export function fix(s) {
  s = String(s).normalize('NFC').replace(/\u00a0/g, ' ').replace(/’/g, "'").replace(/‘/g, "'");
  for (const [a, b] of FIXES) s = s.split(a).join(b);
  return s;
}
function circList(s) {
  const out = [];
  s = s.replace(/-/g, '–');
  for (const m of all(new RegExp(`${CR}(?:–${CR})?`), s)) {
    const p = m[0];
    if (p.includes('–')) out.push(...range(CIRC.indexOf(p[0]), CIRC.indexOf(p[p.length - 1]) + 1));
    else out.push(CIRC.indexOf(p));
  }
  return out;
}
export const words = (s) => fix(s).toLowerCase().match(/[a-zāēīōū0-9]+(?:'[a-z]+)?/g) || [];
const stripMd = (s) => s.replace(/\[(?:S|V|O|C)\]\s*/g, '').replace(/\*\*/g, '').replace(/~~/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const dropStruck = (s) => stripChars(stripMd(s.replace(/~~.*?~~/g, ' ')).replace(/\s+/g, ' ').trim(), ' ,;');
const qNums = (s) => all(/Q(\d+)/, s).map((m) => Number(m[1]));

// ================================================================ Simplify
export function parseSimplify(text) {
  text = fix(text);
  const passages = [];
  let cur = null, para = null, mode = null, ex = null;
  const exercises = { q: '', a: '' };
  for (const line of text.split('\n')) {
    if (line.startsWith('# BÀI TẬP')) { ex = 'q'; continue; }
    if (ex) {
      if (/^##\s+Đáp án/.test(line)) { ex = 'a'; continue; }
      if (/^# /.test(line)) ex = null;
      else { exercises[ex] += `${line}\n`; continue; }
    }
    let m = /^# PASSAGE (\d+)/.exec(line);
    if (m) {
      cur = { n: Number(m[1]), title: line.replace(/^# PASSAGE \d+\s*[–-]\s*/, '').trim(), paras: [] };
      passages.push(cur); para = null; mode = null; continue;
    }
    // "## Đoạn A – …", "## Phần A", "## Section B → Q13", "## Paragraph C" hoặc chỉ "## A".
    m = /^## (?:(?:Đoạn|Phần|Section|Paragraph|Para)\s+)?([0-9]+|[A-Z])(?=$|[\s–\-·(:→])(.*)$/i.exec(line);
    if (m && cur) {
      para = { label: m[1], sents: [], simp: [], conn: '', main: '', warn: [], q: qNums(m[2]) };
      cur.paras.push(para); mode = null; continue;
    }
    if (/^#{1,3} /.test(line)) {
      if (!line.startsWith('## Đoạn')) para = null;
      if (/^# /.test(line)) cur = null; // hết phần bài đọc (bài tập, đáp án, cách dùng…)
      mode = null; continue;
    }
    if (!para) continue;
    m = new RegExp(`^>\\s*(${CR})\\s*(.+)$`).exec(line);
    if (m) { para.sents.push(stripMd(m[2])); mode = null; continue; }
    m = new RegExp(`^\\|\\s*(${CR}+)\\s*\\|(.*)\\|\\s*$`).exec(line);
    if (m) {
      const cells = m[2].split('|').map((c) => c.trim());
      const idx = circList(m[1]);
      const qs = qNums(cells.join(' '));
      if (idx.length && idx[0] >= para.sents.length && cells.length >= 2) {
        // Bảng có câu gốc (đánh dấu ~~phần phụ~~): cột 1 là câu gốc.
        const orig = stripMd(cells[0]);
        para.sents.push(orig);
        let simp = dropStruck(cells[0]);
        let note = cells.length > 1 ? stripMd(cells[1]) : '';
        // Bảng "Câu gốc | Simplify | Bỏ gì | → Q": câu rút gọn nằm ở cột 2.
        if (simp === orig && cells.length >= 3 && /[A-Za-z]{3}/.test(cells[1])) { simp = dropStruck(cells[1]); note = stripMd(cells[2]); }
        para.simp.push({ idx, text: simp && simp !== orig ? simp : '', note, q: qs });
      } else {
        para.simp.push({ idx, text: dropStruck(cells[0]), note: cells.length > 1 ? stripMd(cells[1]) : '', q: qs });
      }
      continue;
    }
    if (line.startsWith('**Simplify:**')) {
      const body = line.slice('**Simplify:**'.length).trim();
      for (const mm of all(new RegExp(`((?:${CR})*)\\s*\\*\\*(.+?)\\*\\*(?:\\s*\\(([^()]*)\\))?`), body)) {
        const nums = mm[1] || '', t = mm[2], note = mm[3] || '';
        if (t.startsWith('→')) continue;
        const q = qNums(note);
        const noteClean = note.replace(/\*\*→\s*Q\d+(?:\s*[A-Z ]+)?\*\*:?\s*/g, '').trim();
        const idx = nums ? circList(nums) : range(0, para.sents.length);
        para.simp.push({ idx, text: stripMd(t), note: noteClean, q });
      }
      mode = null; continue;
    }
    if (line.startsWith('**Read connection:**')) { para.conn = line.slice('**Read connection:**'.length).trim(); mode = 'conn'; continue; }
    m = /^→\s*\*\*Main idea:\s*(.+?)\*\*\s*$/.exec(line) || /^\*\*Main idea:?\*\*:?\s*(.+)$/.exec(line);
    if (m) { para.main = m[1].trim(); mode = null; continue; }
    if (mode === 'conn' && /^\s*[-*] /.test(line)) { para.conn += (para.conn ? '\n' : '') + line.trim(); continue; }
    if (line.startsWith('⚠️')) { para.warn.push(line.trim()); continue; }
    if (!line.trim()) continue;
    if (mode === 'conn') mode = null;
  }
  return { passages, exercises: { q: exercises.q.trim(), a: exercises.a.trim() } };
}

// ================================================================ Đề (chép từ web)
const NUMTOK = '(?<![\\d.,/])';

function cleanTest(text) {
  return fix(text).split('\n').filter((l) => !/^#+\s*\d{1,2}$/.test(l.trim())).map((l) => l.replace(/\*\*/g, '')).join('\n');
}

function parseAnswerKey(text) {
  const m = /^#*\s*Answers?\b.*$/im.exec(text);
  if (!m) return {};
  let part = text.slice(m.index + m[0].length);
  part = part.split(/(?:Search Cam|ABOUT US|Copyright ©)/)[0];
  part = part.replace(/^\s*Passage\s+\d\s*$/gim, ' ').replace(/^\s*(Cam \d+ Reading Test \d+)\s*$/gim, ' ');
  // ¶ đánh dấu xuống dòng: một đáp án không bao giờ kéo sang dòng sau.
  const flat = ` ${part.replace(/\s*\n\s*/g, ' ¶ ').replace(/[ \t]+/g, ' ')} `;
  const key = {};
  let pos = 0, n = 1;
  while (n <= 40) {
    const mm = search(new RegExp(`\\s${n}(?:\\s*(?:&|and|-)\\s*(\\d+))?\\.?\\s+(?=\\S)`), flat, pos);
    if (!mm) { n++; continue; }
    const start = mm.index + mm[0].length;
    const last = mm[1] ? Number(mm[1]) : n;
    const nxt = search(new RegExp(`\\s${last + 1}(?:\\s*(?:&|and|-)\\s*\\d+)?\\.?\\s+(?=\\S)`), flat, start);
    const end = nxt ? nxt.index : flat.length;
    const ans = flat.slice(start, end).split('¶')[0].split(/\s(?:Search|ABOUT US|Copyright)\b/)[0].trim();
    for (let k = n; k <= last; k++) key[k] = ans;
    pos = nxt ? end : start;
    n = last + 1;
  }
  return key;
}

/** Đọc lần lượt 'A text B text …' (mỗi chữ trên dòng riêng hoặc chung một dòng). */
function letterSeq(t, letters, start = 0, lineStart = true, limit = 600) {
  const out = [];
  let pos = start;
  letters.forEach((L, k) => {
    if (out.done) return;
    const pat = k === 0 && lineStart ? new RegExp(`^\\s*${reEsc(L)}\\s+(?=\\S)`, 'm') : new RegExp(`(?:^|\\s)${reEsc(L)}[.)]?\\s+(?=\\S)`, 'm');
    const m = search(pat, t, pos);
    if (!m || (k > 0 && m.index - pos > limit)) { out.done = true; return; }
    if (out.length) out[out.length - 1][1] = t.slice(out[out.length - 1][2], m.index).trim();
    out.push([L, '', m.index + m[0].length]);
    pos = m.index + m[0].length;
  });
  if (out.length) out[out.length - 1][1] = t.slice(out[out.length - 1][2]).split('\n')[0].trim();
  return out.map(([L, x]) => [L, x.replace(/\s+/g, ' ')]);
}

/** Phương án không theo thứ tự (chép từ bảng 2 cột): lấy lần xuất hiện đầu của từng chữ, xếp theo vị trí. */
function letterAny(t, letters) {
  const first = new RegExp(`(?:^|\\s)${reEsc(letters[0])}[.)]?\\s+(?=\\S)`, 'm').exec(t);
  if (!first) return [];
  const hits = [];
  for (const L of letters) {
    const m = search(new RegExp(`(?:^|\\s)${reEsc(L)}[.)]?\\s+(?=\\S)`, 'm'), t, first.index);
    if (!m) return [];
    hits.push([L, m.index, m.index + m[0].length]);
  }
  hits.sort((x, y) => x[1] - y[1]);
  return hits.map(([L, , e], k) => [L, (k + 1 < hits.length ? t.slice(e, hits[k + 1][1]) : t.slice(e).split('\n')[0]).replace(/\s+/g, ' ').trim()])
    .sort((x, y) => (x[0] < y[0] ? -1 : 1));
}

export function parseTest(text) {
  text = cleanTest(text);
  const key = parseAnswerKey(text);
  const body = text.split(/^#*\s*Answers?\s+Cam\b/im)[0];
  const secs = body.split(/^#*\s*READING PASSAGE\s+(\d)\s*$/im);
  const passages = [];
  for (let j = 1; j < secs.length; j += 2) {
    const n = Number(secs[j]), sec = secs[j + 1];
    const qh = /^#*\s*Questions\s+\d+/im.exec(sec);
    const ptext = qh ? sec.slice(0, qh.index) : sec;
    const heads = all(/^#+\s+(.+)$/m, ptext).map((m) => m[1]);
    let title = heads.length ? heads.slice(0, 2).filter((h) => !/READING PASSAGE|Questions/i.test(h) && h.length < 90).map((h) => h.trim()).join(' ') : '';
    if (heads.length >= 2 && !ptext.slice(ptext.indexOf(heads[0]) + heads[0].length).trim().startsWith('#')) title = heads[0].trim();
    const foot = ptext.split('\n').map((l) => l.trim()).filter((l) => /^\*+\s*[\p{L}\p{N}_ -]+:/u.test(l));
    const starts = all(/^#*\s*Questions?\s+(\d+)(?:\s*(?:[-–]|and)\s*(\d+))?\s*$/im, sec).map((g) => [g.index, g.index + g[0].length, Number(g[1]), Number(g[2] || g[1])]);
    // Tiêu đề nhóm bị mất khi chép từ web: dựa vào dòng "… in boxes 8-13 …".
    for (const bm of all(/^.*\bboxes?\s+(\d+)(?:\s*(?:[-–]|and)\s*(\d+))?.*$/im, sec)) {
      const ba = Number(bm[1]), bb = Number(bm[2] || bm[1]);
      if (starts.some(([, , a0, b0]) => a0 <= ba && ba <= b0)) continue;
      const back = sec.slice(Math.max(0, bm.index - 500), bm.index);
      const ims = all(/^(?:Do the following|Choose|Complete|Look at|Which|Reading Passage|Match|Classify|Label)\b.*$/im, back);
      const im = ims[ims.length - 1];
      const st = bm.index - back.length + (im ? im.index : back.length);
      starts.push([st, st, ba, bb]);
    }
    starts.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3]);
    const groups = [];
    let last = null;
    starts.forEach(([, g1, ga0, gb0], k) => {
      let ga = ga0, gb = gb0;
      const end = k + 1 < starts.length ? starts[k + 1][0] : sec.length;
      // Tiêu đề chép sai ("Questions 18-22" nhưng "boxes 20-26") → tin dòng "boxes" ngay trong nhóm.
      const bx = /\bboxes?\s+(\d+)(?:\s*(?:[-–]|and)\s*(\d+))?/i.exec(sec.slice(g1, end).slice(0, 600));
      if (bx) {
        const ba = Number(bx[1]), bb = Number(bx[2] || bx[1]);
        const nxtA = k + 1 < starts.length ? starts[k + 1][2] : 99;
        if ((ba !== ga || bb !== gb) && (last === null || ba === last + 1) && bb < nxtA) { ga = ba; gb = bb; }
      }
      // Đề chép sai tiêu đề ("Questions 6-13" sau "Questions 5-8") → bắt đầu sau nhóm trước.
      if (last !== null && ga <= last) ga = last + 1;
      if (ga > gb) return;
      groups.push(parseGroup(ga, gb, sec.slice(g1, end)));
      last = gb;
    });
    passages.push({ n, title, footnote: foot, groups, text: ptext });
  }
  return { passages, key };
}

const INSTR_RE = /^(Do the following|Choose|Complete|Which|Reading Passage|Look at|Match|Classify|Label|NB|Answer the questions|List of)/i;

function parseGroup(a, b, block) {
  const g = { from: a, to: b, options: [], context: '', limit: '', maxWords: 0, number: false };
  const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  g.instr = lines.filter((l) => INSTR_RE.test(l) && !l.toLowerCase().startsWith('list of')).join(' ');
  const up = block.toUpperCase();
  const rng = /\b([A-J])\s*[-–]\s*([A-Jl])\b/.exec(g.instr);
  // "A-G" hoặc "A, B or C".
  const lst = rng ? null : /\b(A)(?:,\s*[B-J])+,?\s+or\s+([B-J])\b/.exec(g.instr);
  const lr = rng || lst;
  const letters = lr ? range(lr[1].charCodeAt(0), lr[2].replace('l', 'I').charCodeAt(0) + 1).map((c) => String.fromCharCode(c)) : [];
  const ti = up.indexOf('TRUE'), yi = up.indexOf('YES');
  if (up.includes('NOT GIVEN') && ti >= 0 && (yi < 0 || ti < yi)) { g.type = 'tf'; g.options = [['TRUE', ''], ['FALSE', ''], ['NOT GIVEN', '']]; }
  else if (up.includes('NOT GIVEN') && /\bYES\b/.test(up)) { g.type = 'tf'; g.options = [['YES', ''], ['NO', ''], ['NOT GIVEN', '']]; }
  else if (/COMPLETE|LABEL THE|ANSWER THE QUESTIONS/.test(up) && /ONE WORD|TWO WORDS|THREE WORDS|NO MORE THAN|WORDS? AND\/OR/.test(up) && !/LIST OF/.test(up)) {
    g.type = 'gap';
    const lim = /((?:ONE|TWO|THREE|NO MORE THAN \w+) WORDS?(?: AND\/OR A NUMBER| ONLY)?)/.exec(up);
    g.limit = lim ? lim[1].trim() : '';
    const mw = /(ONE|TWO|THREE|FOUR) WORD/.exec(g.limit);
    g.maxWords = mw ? { ONE: 1, TWO: 2, THREE: 3, FOUR: 4 }[mw[1]] : 0;
    g.number = g.limit.includes('NUMBER');
  } else g.type = 'choice';
  const two = /Choose (TWO|THREE) letters/i.exec(block);
  let items = [];
  if (/list of headings|correct heading/i.test(block)) {
    // Matching Headings: danh sách i, ii, iii… ; câu hỏi "14 Paragraph A".
    const lh = /list of headings/i.exec(block);
    const lhEnd = lh ? lh.index + lh[0].length : 0;
    const rm = /\bi\s*[-–]\s*(x{0,1}v?i{0,3}|i?x|i?v)\b/.exec(g.instr);
    const nOpt = rm && ROMAN.includes(rm[1].toLowerCase()) ? ROMAN.indexOf(rm[1].toLowerCase()) + 1 : 10;
    g.options = letterSeq(lh ? block.slice(lhEnd) : block, ROMAN.slice(0, nOpt), 0, false);
    g.type = 'choice'; g.roman = true;
    let pos = lhEnd;
    for (let n = a; n <= b; n++) {
      const m = search(new RegExp(`(?:^|(?<=\\s))${n}\\.?\\s+(?=[^\\s\\d])`, 'm'), block, pos);
      const q = m ? block.slice(m.index + m[0].length).split('\n')[0].replace(/\s+/g, ' ').trim() : '';
      if (m) pos = m.index + m[0].length;
      items.push({ n, q: q ? q.split(/\s(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\s/)[0] : '' });
    }
    g.items = items;
    if (g.options.length < 3) throw new Skip(`câu ${a}–${b}: không đọc được danh sách heading`);
    return g;
  }
  const gapstyle = g.type === 'gap' || (g.type === 'choice' && /COMPLETE (THE|EACH)/.test(up) && !/CORRECT ENDING/.test(up));
  items = [];
  if (two) {
    // Một câu hỏi chung cho 2–3 số câu; phương án A–E.
    const qline = lines.find((l) => l.includes('?') && !l.startsWith('Do the following')) || lines.find((l) => /\b(TWO|THREE)\b/.test(l) && !INSTR_RE.test(l)) || '';
    const opts = letterSeq(block, letters.length ? letters : [...'ABCDE']);
    for (let n = a; n <= b; n++) items.push({ n, q: qline, options: opts, multi: range(a, b + 1) });
    g.type = 'choice';
  } else if (gapstyle) {
    const ctx = lines.filter((l) => !INSTR_RE.test(l) && !/^(Write|In boxes)/i.test(l));
    g.context = ctx.join('\n');
    const joined = ctx.join('\n');
    for (let n = a; n <= b; n++) {
      const m = new RegExp(`${NUMTOK}${n}\\s*(?:[.…_]{2,}|(?=\\s*(?:[●•]|$)))`, 'm').exec(joined) || new RegExp(`${NUMTOK}${n}(?=\\s*[.…_])`).exec(joined) || new RegExp(`${NUMTOK}${n}\\s+[A-Z][a-z]+\\s*[.…_]{2,}`).exec(joined);
      if (!m) {
        // Hoàn thành câu: "23 One advantage … stays ……… even when …" (số ở đầu câu).
        const sm = new RegExp(`^\\s*${n}\\s+(.+)$`, 'm').exec(joined);
        if (sm) { items.push({ n, q: sm[1].replace(/[.…_]{2,}/g, ' ______ ').replace(/\s+/g, ' ').trim() }); continue; }
        items.push({ n, q: '' }); // lấy câu hỏi từ file giải
        continue;
      }
      const mEnd = m.index + m[0].length;
      const ls = joined.lastIndexOf('\n', m.index - 1) + 1;
      let le = joined.indexOf('\n', mEnd); if (le < 0) le = joined.length;
      const line = joined.slice(ls, le);
      // Đoạn tóm tắt dài: cắt đúng câu chứa ô trống.
      const off = m.index - ls;
      const sents = all(/[^.!?]*?(?:[.!?](?=\s|$)|$)/, line);
      const hit = sents.find((s) => s.index <= off && off <= s.index + s[0].length && s[0].trim());
      const seg = hit ? hit[0] : line;
      let q = seg.replace(new RegExp(`${NUMTOK}${n}\\s*[.…_]*`), ' ______ ');
      q = q.replace(new RegExp(`${NUMTOK}\\d{1,2}\\s*[.…_]{2,}`, 'g'), ' … ');
      q = q.trim().replace(/^[•●\-–*]\s*/, '');
      if (q.replace(/[_…. ]/g, '').length < 10) {
        // Ô trống đứng đầu dòng (sơ đồ, bảng): lấy thêm chữ xung quanh.
        const win = joined.slice(Math.max(0, m.index - 110), mEnd + 110).replace(/\n/g, ' ');
        q = win.replace(new RegExp(`${NUMTOK}${n}\\s*[.…_]*`), ' ______ ');
        q = `… ${q.replace(new RegExp(`${NUMTOK}\\d{1,2}\\s*[.…_]{2,}`, 'g'), ' … ').trim()} …`;
      }
      items.push({ n, q: q.replace(/\s+/g, ' ').trim() });
    }
    if (g.type === 'choice') {
      g.options = letters.length ? letterSeq(block, letters) : [];
      if (letters.length && g.options.length < letters.length) { const alt = letterAny(block, letters); if (alt.length === letters.length) { g.options = alt; g.loose = true; } }
    }
  } else {
    let pos = 0;
    const starts = [];
    for (let n = a; n <= b; n++) {
      // "…more than once.7 It is…": số câu dính vào dấu chấm của câu trước.
      const m = search(new RegExp(`(?:^|(?<=\\s)|(?<=[a-z]\\.))(?<!(?:[Pp]assage|[Qq]uestions?|[Bb]oxes?)\\s)${n}\\.?\\s+(?=[^\\s\\d])`, 'm'), block, pos);
      if (!m) throw new Skip(`câu ${n}: không tìm thấy trong đề`);
      starts.push([n, m.index, m.index + m[0].length]);
      pos = m.index + m[0].length;
    }
    const perItem = /correct letter,?\s*A,?\s*B,?\s*C/i.test(g.instr);
    starts.forEach(([n, , s1], k) => {
      const end = k + 1 < starts.length ? starts[k + 1][1] : block.length;
      const seg = block.slice(s1, end);
      const it = { n };
      if (perItem) {
        const opts = letterSeq(seg, [...'ABCDE']);
        const cut = /^\s*A\s+(?=\S)/m.exec(seg);
        it.q = (cut ? seg.slice(0, cut.index) : seg).replace(/\s+/g, ' ').trim();
        if (opts.length < 3) throw new Skip(`câu ${n}: không đọc được phương án A–D`);
        it.options = !/\bE\b/.test(seg) ? opts.slice(0, 4) : opts;
      } else {
        it.q = seg.trim().split('\n')[0].replace(/\s+/g, ' ').trim();
      }
      items.push(it);
    });
    if (!perItem && g.type === 'choice') {
      if (letters.length && /paragraph|section/i.test(g.instr) && !/list of|heading/i.test(g.instr)) {
        g.options = letters.map((L) => [L, '']);
      } else {
        const after = block.slice(starts[starts.length - 1][2]);
        const nl = after.indexOf('\n');
        const tail = nl >= 0 ? after.slice(nl) : '';
        const ls = letters.length ? letters : [...'ABCDEFGHIJ'];
        let opts = letterSeq(tail, ls);
        if (opts.length < Math.max(2, letters.length - 1)) opts = letterSeq(block, ls);
        // "List of Ideas A The way …" (chữ A không đứng đầu dòng) hoặc phương án xếp 2 cột ("A 1836 E 1971").
        if (letters.length && opts.length < letters.length) {
          const alt = [letterSeq(tail, ls, 0, false), letterAny(tail, ls)].find((o) => o.length === letters.length);
          if (alt) { opts = alt; g.loose = true; }
        }
        g.options = opts;
        // Phần cuối câu cuối có thể dính danh sách phương án.
        if (opts.length) items[items.length - 1].q = items[items.length - 1].q.split(new RegExp(`\\s(?:A\\s+${reEsc(opts[0][1].slice(0, 12))})`))[0].trim();
      }
      if (!g.options.length) throw new Skip(`câu ${a}–${b}: không đọc được danh sách phương án`);
    }
  }
  g.items = items;
  return g;
}

// ================================================================ Giải chi tiết
const pairsOf = (s) => all(/`([^`]+)`\s*(?:↔|=)\s*`([^`]+)`/, s).map((m) => [m[1].trim(), m[2].trim()]);
export function parseGiai(text) {
  text = fix(text);
  const lines = text.split('\n');
  const heads = [];
  lines.forEach((l, i) => {
    const m = /^(?:[-*]\s+)?\*\*Q(\d+)(?:\s*[–&-]\s*(\d+))?\s*([.:–-])\s*(.*?)\*\*:?\s*(.*)$/.exec(l);
    if (m) heads.push([i, m]);
  });
  const out = {};
  heads.forEach(([i, m], k) => {
    const j = k + 1 < heads.length ? heads[k + 1][0] : lines.length;
    const blk = [];
    for (const l of lines.slice(i + 1, j)) {
      if (/^#{1,3} /.test(l) || l.trim() === '---') break;
      blk.push(l);
    }
    const n = Number(m[1]), sep = m[3], head = m[4].trim(), rest = m[5].trim();
    let qtext, ans = null;
    if (sep === '.') {
      qtext = head;
      const am = /→\s*\*\*([^*]+)\*\*/.exec(rest);
      if (am) ans = am[1];
    } else { qtext = ''; ans = head; }
    const exp = `${rest}\n${blk.join('\n')}`.trim();
    if (ans === null) {
      const am = /→\s*\*\*Đáp án:\s*([^*]+)\*\*/.exec(exp) || /→\s*\*\*([A-Z]+(?: [A-Z]+)*)\*\*/.exec(exp);
      if (am) ans = am[1];
    }
    const loc = [];
    const b2 = /Bước 2[^:]*:\*?\s*([\s\S]*?)(?=\*Bước 3|$(?![\s\S]))/.exec(exp);
    const src = b2 ? b2[1] : exp;
    for (const mm of all(new RegExp(`(?:[Đđ]oạn\\s+|và\\s+|\\()([0-9]+|[A-Z])\\s*,?\\s*(?:câu\\s*)?((?:${CR}|[–-])+)`), src)) {
      for (const c of circList(mm[2])) if (!loc.some(([x, y]) => x === mm[1] && y === c)) loc.push([mm[1], c]);
    }
    out[n] = { q: stripMd(qtext), ans, loc: loc.slice(0, 6), exp, pairs: pairsOf(exp) };
    if (m[2]) for (let n2 = n + 1; n2 <= Number(m[2]); n2++) if (!(n2 in out)) out[n2] = { ...out[n] };
  });
  // Lời giải dạng bảng: | 14 | A | heading | lập luận |
  for (const l of lines) {
    const tm = /^\|\s*(\d{1,2})\s*\|(.*)\|\s*$/.exec(l);
    const n = tm ? Number(tm[1]) : 0;
    if (tm && !(n in out) && n >= 1 && n <= 40) {
      const cells = tm[2].split('|').map((c) => c.trim());
      const loc = [];
      for (const mm of all(new RegExp(`(?:^|[\\s(])([0-9]+|[A-Z])\\s*((?:${CR}|[–-])+)`), cells.join(' '))) {
        for (const c of circList(mm[2])) if (!loc.some(([x, y]) => x === mm[1] && y === c)) loc.push([mm[1], c]);
      }
      out[n] = { q: '', ans: null, loc: loc.slice(0, 4), exp: cells.filter(Boolean).join(' · '), pairs: pairsOf(l) };
    }
  }
  const guides = {};
  for (const gm of all(new RegExp(`^#{2,3} Q(\\d+)\\s*[–-]\\s*(\\d+)[^\\n]*\\n([\\s\\S]*?)(?=^\\*\\*Q\\d+|^#{1,3} |${END})`, 'm'), text)) {
    const body = gm[3].trim();
    const a = Number(gm[1]), b = Number(gm[2]);
    if (body) guides[`${a}-${b}`] = body;
    // Nhóm "chọn 2" không có tiêu đề từng câu: đáp án ở tiêu đề nhóm.
    const hdr = gm[0].split('\n')[0];
    const am = /Đáp án:\s*\*\*([^*]+)\*\*/.exec(hdr) || /Đáp án:\s*\*?\*?\s*([A-J](?:\s*(?:,|và|and|&)\s*[A-J])+)/.exec(body);
    for (let n = a; n <= b; n++) {
      if (am && (!(n in out) || !out[n].ans)) {
        const prev = out[n] || {};
        out[n] = { q: prev.q || '', ans: am[1], loc: prev.loc || [], exp: body, pairs: prev.pairs || [] };
      }
    }
  }
  const extras = [];
  for (const sm of all(new RegExp(`^## (?!PASSAGE|Q\\d|PHẦN 0|Bẫy)([^\\n]+)\\n([\\s\\S]*?)(?=^## |^# |${END})`, 'm'), text)) {
    const title = sm[1].trim(), body = sm[2].trim();
    if (body && !/^(Bảng đáp án|Tổng hợp 40)/i.test(title)) extras.push({ title, md: body });
  }
  const method = /^## PHẦN 0[^\n]*\n([\s\S]*?)(?=^---|^# |^## PASSAGE)/m.exec(text);
  const traps = new RegExp(`^## Bẫy hay gặp[^\\n]*\\n([\\s\\S]*?)(?=^## |^# |${END})`, 'm').exec(text);
  const band = /^\*\*Quy đổi band[^\n]*$/m.exec(text);
  return { out, guides, extra: { method: method ? method[1].trim() : '', traps: traps ? traps[1].trim() : '', band: band ? band[0].trim() : '', extras: extras.slice(0, 6) } };
}

// ================================================================ Ghép + kiểm tra
/** '(Sumatran) orangutan / orang-utan' → ['sumatran orangutan', 'orangutan', 'orang-utan']. */
function ansVariants(raw) {
  const out = [];
  raw = raw.replace(/\b(IN EITHER ORDER|BOTH REQUIRED FOR ONE MARK|IN ANY ORDER)\b[,;:]?/gi, ' ').trim();
  raw = raw.trim().replace(/(?<=[a-z])\s+I\s+(?=[a-z])/g, ' / ');
  if (raw.includes(' and ') && !raw.includes('/') && raw.split(/\s+/).length <= 5) {
    const k = raw.indexOf(' and ');
    const x = raw.slice(0, k), y = raw.slice(k + 5);
    raw = `${raw} / ${y} and ${x}`;
  }
  for (let part of raw.split(/\s*\/\s*|\s+OR\s+/)) {
    part = stripChars(part.trim(), '.');
    if (!part) continue;
    if (part.includes('(')) { out.push(part.replace(/[()]/g, '').trim()); out.push(part.replace(/\([^)]*\)/g, '').trim()); }
    else out.push(part);
  }
  return uniq(out).filter(Boolean).map((x) => x.replace(/\s+/g, ' '));
}
const norm = (s) => String(s).trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ');

function keepMask(sentence, simplified) {
  const toks = sentence.split(/\s+/).filter(Boolean);
  const want = words(simplified);
  const mask = [];
  let j = 0;
  for (const t of toks) {
    const ws = words(t);
    if (ws.length && j < want.length && want.slice(j, j + ws.length).join('\u0001') === ws.join('\u0001') && j + ws.length <= want.length) { mask.push(1); j += ws.length; }
    else mask.push(0);
  }
  const kept = mask.reduce((x, y) => x + y, 0);
  if (j !== want.length || kept === toks.length || kept < 2) return null;
  return mask;
}

const TOPICS = [
  ['Động vật', 'animal species bird birds fish insects insect bees parrot wildlife mammal mammals predators prey whale whales marine tiger thylacine creatures'],
  ['Thực vật · nông nghiệp', 'plant plants tree trees forest forests crop crops farming farm farmers agriculture seeds soil palm elm'],
  ['Môi trường · khí hậu', 'climate environment environmental pollution carbon emissions energy renewable sustainable conservation ocean water ice'],
  ['Tâm lý học', 'psychology psychologists behaviour behavior mind emotions emotional stress memory brain cognitive personality happiness'],
  ['Lịch sử · khảo cổ', 'history historical century ancient archaeologists archaeological civilisation empire medieval scrolls king roman'],
  ['Khoa học · công nghệ', 'technology scientists scientific research robots computer digital engineering innovation invention discovery'],
  ['Y học · sức khoẻ', 'health medical disease patients doctors medicine diet sleep exercise hospital'],
  ['Kinh tế · xã hội', 'economic economy business companies company workers employees money market society social cities urban city'],
  ['Nghệ thuật · văn hoá', 'art artists painting paintings music museum culture cultural language literature collectors'],
  ['Thể thao', 'sport sports athletes tennis football olympic players stadium stadiums racket'],
];
function topicOf(title, text) {
  const ws = words(`${title} ${title} ${text}`);
  let best = '', score = 0;
  for (const [name, kw] of TOPICS) {
    const ks = new Set(kw.split(' '));
    const sc = ws.filter((w) => ks.has(w)).length;
    if (sc > score) { best = name; score = sc; }
  }
  return best;
}

/** Ghép 3 file thành một đề. Trả về { data, notes }; ném Skip nếu đề không dùng được. */
export function buildTest(testText, simpText, giaiText, tid, ttitle) {
  const { passages: tps, key } = parseTest(testText);
  const { passages: sps, exercises } = parseSimplify(simpText);
  const { out: gi, guides, extra } = parseGiai(giaiText);
  if (tps.length !== 3 || sps.length !== 3) throw new Skip(`số passage: file đề có ${tps.length}, file Simplify có ${sps.length} (cần 3)`);
  const notes = [], out = [];
  tps.forEach((tp, pi) => {
    const sp = sps[pi];
    const paras = [];
    for (const p of sp.paras) {
      if (!p.sents.length) { notes.push(`P${tp.n} đoạn ${p.label}: không có câu gốc, bỏ đoạn này`); continue; }
      const simp = [];
      for (const s of p.simp) {
        const idx = s.idx.filter((i) => i < p.sents.length);
        if (!idx.length) continue;
        const it = { idx, text: s.text };
        if (s.note) it.note = s.note;
        if (s.q?.length) it.q = s.q;
        if (idx.length === 1 && s.text) { const m = keepMask(p.sents[idx[0]], s.text); if (m) it.keep = m; }
        simp.push(it);
      }
      paras.push({ label: p.label, sents: p.sents, simp, conn: p.conn, main: p.main, warn: p.warn });
    }
    const labels = paras.map((p) => p.label);
    const groups = [];
    for (const g of tp.groups) {
      const items = [];
      for (const it of g.items) {
        const n = it.n;
        const info = gi[n] || { q: '', ans: null, loc: [], exp: '', pairs: [] };
        const raw = key[n] || info.ans || '';
        if (!raw) throw new Skip(`câu ${n}: không có đáp án`);
        let ans;
        if (it.multi) ans = uniq(all(/\b([A-J])\b/, raw).map((m) => m[1]));
        else {
          ans = ansVariants(raw);
          if (g.roman) ans = ans.map((x) => x.split(' ')[0].toLowerCase());
          else if (g.type !== 'gap') {
            ans = ans.map((x) => (x.split(' ')[0].length <= 2 || /^(TRUE|FALSE|YES|NO)/.test(x.toUpperCase()) ? x.split(' ')[0].toUpperCase() : x));
            if (g.type === 'tf') {
              const ABBR = { T: 'TRUE', F: 'FALSE', Y: 'YES', N: 'NO', NG: 'NOT GIVEN' };
              ans = ans.map((x) => (x.toUpperCase().startsWith('NOT') ? 'NOT GIVEN' : ABBR[x.toUpperCase()] || x.toUpperCase().replace(/^N0$/, 'NO')));
              // Hướng dẫn ghi TRUE/FALSE nhưng bảng đáp án ghi YES/NO (hoặc ngược lại).
              const okeys = g.options.map((o) => o[0]);
              const swap = { YES: 'TRUE', NO: 'FALSE', TRUE: 'YES', FALSE: 'NO' };
              ans = ans.map((x) => (!okeys.includes(x) ? swap[x] || x : x));
            }
          }
        }
        if (info.ans && !it.multi) {
          const ga = norm(info.ans.replace(/\s*\(.*\)$/, ''));
          if (ga && norm(info.ans) !== norm(raw) && !ans.some((x) => norm(x) === ga || norm(x).startsWith(ga) || ga.startsWith(norm(x)))) notes.push(`câu ${n}: file giải ghi "${info.ans}", bảng đáp án ghi "${raw}" (dùng bảng đáp án)`);
        }
        let loc = [];
        for (const [lab, si] of info.loc) {
          const li = labels.indexOf(lab);
          if (li >= 0 && si < paras[li].sents.length) loc.push([li, si]);
        }
        if (!loc.length) {
          // Dò câu khớp nhất với phần trích trong lời giải (> Simplify, `trích`, "đoạn 2, câu \"…\"").
          const quotes = [...all(/^>\s*(.+)$/m, info.exp).map((m) => m[1]), ...all(/`([^`]{20,})`/, info.exp).map((m) => m[1]), ...all(/câu\s*["“]([^"”]{8,})/, info.exp).map((m) => m[1])];
          let best = [0, null];
          for (const qt of quotes) {
            const qw = words(dropStruck(qt).replace(/…/g, ' ')).filter((w) => w.length > 2);
            if (qw.length < 3) continue;
            paras.forEach((p, pI) => p.sents.forEach((sent, sI) => {
              const sw = new Set(words(sent));
              const sc = qw.filter((w) => sw.has(w)).length / qw.length;
              if (sc > best[0]) best = [sc, [pI, sI]];
            }));
          }
          if (best[0] >= 0.6) loc = [best[1]];
        }
        if (!loc.length) {
          paras.forEach((p, pI) => { for (const s of p.simp) if ((s.q || []).includes(n)) loc.push([pI, s.idx[0]]); });
          loc = loc.slice(0, 3);
        }
        let qt = info.q && g.type === 'gap' ? info.q : it.q || info.q;
        if (qt.replace(/[_…. ]/g, '').length < 6 && info.q) qt = info.q;
        if (qt.length > 220 && qt.includes('______')) {
          const k0 = qt.indexOf('______');
          qt = (k0 > 110 ? '… ' : '') + qt.slice(Math.max(0, k0 - 110), k0 + 110).trim() + (k0 + 110 < qt.length ? ' …' : '');
        }
        const q = { n, q: qt, a: ans, loc, exp: info.exp, pairs: info.pairs };
        if (it.options) q.options = it.options.map(([k, t]) => ({ k, t }));
        if (it.multi) q.multi = it.multi;
        if (!q.q && g.type === 'gap') { q.q = `Ô số ${n} trên sơ đồ/bảng của đề gốc (bản chép không có hình) ______`; notes.push(`câu ${n}: không có chữ trong đề (sơ đồ), dùng câu thay thế`); }
        if (!q.q) throw new Skip(`câu ${n}: không có nội dung câu hỏi`);
        if (!loc.length) notes.push(`câu ${n}: chưa có vị trí`);
        items.push(q);
      }
      const gg = { from: g.from, to: g.to, type: g.type, instr: g.instr, items };
      if (g.options.length) gg.options = g.options.map(([k, t]) => ({ k, t }));
      if (g.type === 'gap') Object.assign(gg, { limit: g.limit, maxWords: g.maxWords, number: g.number, context: g.context });
      const guide = guides[`${g.from}-${g.to}`];
      if (guide) gg.guide = guide;
      // Danh sách phương án trong đề bị lẫn cột → lấy danh sách đã ghép lại trong file giải.
      const ks0 = (gg.options || []).map((o) => o.k);
      if (g.type === 'choice' && guide && !items.some((q) => q.options) && (g.loose || ks0.length < 3 || !items.every((q) => q.a.every((x) => ks0.includes(x))))) {
        const gtext = guide.split('\n\n**Q')[0];
        let gl = all(/\*{0,2}\b([A-J])\*{0,2}\s+([^·\n*|]{2,60}?)\s*(?=·|$|\n)/m, gtext);
        // "**A trees** (cây) · **B endangered species** (…)"
        if (gl.length < 3) gl = all(/\*\*([A-J])\s+([^*\n]{1,60}?)\*\*/, gtext);
        if (g.loose && gl.length !== ks0.length) gl = [];
        if (gl.length >= 3) { gg.options = gl.map((m) => ({ k: m[1], t: stripMd(m[2]) })); notes.push(`câu ${g.from}–${g.to}: danh sách phương án lấy từ file giải`); }
      }
      // Đáp án dạng chữ cái phải nằm trong danh sách phương án.
      for (const q of items) {
        const ks = (q.options || gg.options || []).map((o) => o.k);
        if (g.type !== 'gap' && ks.length && !q.a.every((x) => ks.includes(x))) throw new Skip(`câu ${q.n}: đáp án ${q.a.join(', ')} không có trong phương án ${ks.join(', ')}`);
      }
      groups.push(gg);
    }
    const nums = groups.flatMap((g) => g.items.map((q) => q.n));
    let title = tp.title || titleCase(sp.title);
    title = title.replace(/\s+[A-H]$/, '');
    if (isUpper(title)) title = capitalize(title);
    const st = sp.title.toLowerCase();
    if (title.length > 60 && st && title.toLowerCase().startsWith(st.slice(0, 12))) title = title.slice(0, sp.title.length);
    out.push({ id: `${tid}-p${tp.n}`, n: tp.n, title, subtitle: '', footnote: tp.footnote, topic: topicOf(title, tp.text), paras, groups, _nums: nums });
  });
  const empty = out.find((p) => !p.paras.length);
  if (empty) throw new Skip(`passage ${empty.n}: file Simplify không có đoạn nào đọc được (cần dòng "## Đoạn A" và các câu "> ① …")`);
  const allNums = out.flatMap((p) => p._nums).sort((x, y) => x - y);
  out.forEach((p) => delete p._nums);
  if (allNums.join(',') !== range(1, 41).join(',')) {
    const miss = range(1, 41).filter((n) => !allNums.includes(n));
    throw new Skip(`đọc được ${allNums.length} câu${miss.length ? `, thiếu câu ${miss.join(', ')}` : ''}`);
  }
  return { data: { id: tid, title: ttitle, version: 1, passages: out, exercises, ...extra }, notes };
}

/** Mục danh sách (giống index.json) cho một đề. */
export const indexEntry = (data, file = '') => ({ id: data.id, title: data.title, file, passages: data.passages.map((p) => ({ id: p.id, n: p.n, title: p.title, topic: p.topic, questions: p.groups.reduce((s, g) => s + g.items.length, 0) })) });

// ---------------------------------------------------------------- Nhận diện + ghép file
/** Loại file theo nội dung: 'simp' (Simplify), 'giai' (giải chi tiết), 'test' (đề + đáp án) hoặc ''. */
export function kindOf(name, text) {
  const n = name.toLowerCase();
  if (/simplify|connection/.test(n)) return 'simp';
  if (/giai|giải|chi-tiet|chi tiet/.test(n)) return 'giai';
  if (/^#\s*PASSAGE\s+\d/m.test(text) && /^##\s+Đoạn\s/m.test(text)) return 'simp';
  if (/^\s*(?:[-*]\s+)?\*\*Q\d+/m.test(text) && !/READING PASSAGE\s+\d/i.test(text)) return 'giai';
  if (/READING PASSAGE\s+\d/i.test(text)) return 'test';
  return '';
}
/** "cam17-test1-…" / "Practice Cam 17 Reading Test 01" → { cam: 17, test: 1 } */
export function numsOf(name) {
  const m = /cam(?:bridge)?\s*[-_ ]?(\d{1,2})\D{0,20}?test\s*[-_ ]?0?(\d)/i.exec(name);
  return m ? { cam: Number(m[1]), test: Number(m[2]) } : null;
}
/**
 * files: [{ name, text }]. Ghép Simplify ↔ giải theo số Cam/Test trong tên (hoặc theo thứ tự nếu chỉ có một bộ),
 * file đề ghép theo tên bài đọc (tên file đề có thể đặt nhầm). Trả về { sets: [{ id, title, test, simp, giai }], unused: [tên file] }.
 */
export function pairFiles(files) {
  const by = { simp: [], giai: [], test: [] }, unused = [];
  for (const f of files) { const k = kindOf(f.name, f.text); if (k) by[k].push(f); else unused.push(f.name); }
  const sets = [];
  const usedG = new Set();
  for (const sp of by.simp) {
    const nm = numsOf(sp.name);
    let gp = nm ? by.giai.find((g) => !usedG.has(g) && numsOf(g.name)?.cam === nm.cam && numsOf(g.name)?.test === nm.test) : null;
    if (!gp && by.simp.length === 1 && by.giai.length === 1) gp = by.giai[0];
    if (gp) usedG.add(gp);
    const titles = all(/^# PASSAGE \d+\s*[–-]\s*(.+)$/m, fix(sp.text)).map((m) => m[1]).join(' ');
    sets.push({ nm, sp, gp, titles });
  }
  // File đề: chọn file trùng nhiều từ trong tên các bài đọc nhất (không dùng một file đề cho hai bộ).
  const usedT = new Set();
  const scores = [];
  sets.forEach((s, i) => {
    const tw = new Set(words(s.titles).filter((w) => w.length > 3));
    for (const t of by.test) {
      const tws = new Set(words(fix(t.text).slice(0, 20000)));
      scores.push([[...tw].filter((w) => tws.has(w)).length, i, t]);
    }
  });
  scores.sort((x, y) => y[0] - x[0]);
  for (const [sc, i, t] of scores) {
    if (sets[i].tp || usedT.has(t) || sc === 0) continue;
    sets[i].tp = t; usedT.add(t);
  }
  for (const t of by.test) if (!usedT.has(t)) unused.push(t.name);
  for (const g of by.giai) if (!usedG.has(g)) unused.push(g.name);
  return {
    sets: sets.map((s, i) => {
      const nm = s.nm || (s.tp && numsOf(s.tp.name));
      return { id: nm ? `cam${nm.cam}-t${nm.test}` : `imp${i + 1}`, title: nm ? `Cambridge ${nm.cam} · Test ${nm.test}` : '', test: s.tp || null, simp: s.sp, giai: s.gp || null };
    }),
    unused,
  };
}
