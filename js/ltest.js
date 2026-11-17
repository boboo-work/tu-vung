// Listening — đề thật người học tự nhập (L3–L5 trong bản nghiệp vụ).
//  Nhập: 1 file đề HTML (câu hỏi + đáp án) và các file nghe theo Part. Đề và file nghe chỉ lưu trên máy (IndexedDB),
//        không đưa lên mạng, không có trong file sao lưu (đề sách thường có bản quyền).
//  Làm bài: cả đề như thi (mỗi Part nghe 1 lần, không tua) hoặc luyện từng Part (tua, đổi tốc độ).
//  Chấm: theo luật thi (sai chính tả là sai, đúng số từ cho phép), band ước lượng khi làm đủ 40 câu,
//        lý do sai từng câu, tỉ lệ đúng theo dạng câu hỏi; nghe lại từng Part khi chữa.
import { S, ltPut, ltDel, logGrammarDay, saveSettings } from './store.js';
import { esc, toast, uid, today, fmtDate, dateStr, unzip, download } from './util.js';
import { icon, on, go, back, rerender, navBar, confirmSheet } from './ui.js';
import { aiReady, askAI } from './ai.js';

// ---------------------------------------------------------------- Đọc đề HTML
const BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'UL', 'OL']);
const txt = (el) => (el.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const RE_PART = /^PART\s*(\d)\b/i;
const RE_GROUP = /^Questions?\s+(\d{1,2})\s*(?:[-–—]|and|to|&)\s*(\d{1,2})\b/i;
const RE_INSTR = /^(Complete|Choose|Write|Label|Answer|Match|Look|List|Which|What|Where|Who|How|Why|When)\b/i;
const RE_OPT = /^([A-I])\s+(\S.*)$/;
const RE_NUM = /^(\d{1,2})\s+(\S.*)$/;
const DOTS = /\s*[.…]{2,}\s*$/;

/** Chép nội dung một khối thành HTML gọn và an toàn: chỉ giữ thẻ định dạng cơ bản, mọi chữ đều được escape. */
function cleanHtml(node) {
  if (node.nodeType === 3) return esc(node.nodeValue.replace(/ /g, ' '));
  if (node.nodeType !== 1) return '';
  const tag = node.tagName;
  if (['SCRIPT', 'STYLE', 'INS', 'IFRAME', 'AUDIO', 'VIDEO', 'NOSCRIPT', 'BUTTON', 'FORM', 'INPUT', 'SVG', 'IMG'].includes(tag)) return tag === 'IMG' ? '<i>[hình]</i>' : '';
  const inner = [...node.childNodes].map(cleanHtml).join('');
  const map = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', P: 'p', LI: 'li', UL: 'ul', OL: 'ol', TD: 'td', TH: 'td', TR: 'tr', H1: 'h4', H2: 'h4', H3: 'h4', H4: 'h4', H5: 'h4', H6: 'h4' };
  if (tag === 'BR') return '<br>';
  if (tag === 'TABLE') return tableHtml(node);
  if (tag === 'SPAN' && /underline/.test(node.getAttribute('style') || '')) return `<u>${inner}</u>`;
  const t = map[tag];
  return t ? `<${t}>${inner}</${t}>` : inner;
}
/** Bảng nhiều cột → mỗi hàng thành một thẻ, mỗi ô kèm tên cột (dễ đọc và dễ gõ trên điện thoại). */
function tableHtml(table) {
  const rows = [...table.querySelectorAll('tr')].filter((r) => r.closest('table') === table);
  const cells = (r) => [...r.children].filter((c) => /^T[DH]$/.test(c.tagName));
  if (!rows.length) return '';
  const first = cells(rows[0]);
  const isHead = first.length > 1 && first.every((c) => c.tagName === 'TH' || (txt(c) && c.querySelector('b, strong') && txt(c.querySelector('b, strong')) === txt(c)));
  if (!isHead || first.length < 2) {
    return rows.map((r) => `<div class="lt-trow">${cells(r).map((c) => `<div>${[...c.childNodes].map(cleanHtml).join('')}</div>`).join('')}</div>`).join('');
  }
  const heads = first.map(txt);
  return rows.slice(1).map((r) => `<div class="lt-card">${cells(r).map((c, i) => `<div class="lt-cell"><small>${esc(heads[i] || '')}</small>${[...c.childNodes].map(cleanHtml).join('')}</div>`).join('')}</div>`).join('');
}
/** Đổi chỗ trống "<b>7</b> ……" thành ô nhập cho câu 7. */
function markGaps(html, from, to) {
  const used = new Set();
  let out = html.replace(/<b>\s*(\d{1,2})\s*<\/b>\s*[.…_]{2,}/g, (m, n) => {
    const k = Number(n);
    if (k < from || k > to) return m;
    used.add(k);
    return `<span data-gap="${k}"></span>`;
  });
  // Đề không in đậm số câu: "7 ………"
  out = out.replace(/(^|[\s>(])(\d{1,2})\s*[.…_]{4,}/g, (m, pre, n) => {
    const k = Number(n);
    if (k < from || k > to || used.has(k)) return m;
    used.add(k);
    return `${pre}<span data-gap="${k}"></span>`;
  });
  return { html: out.replace(/<p>\s*<\/p>/g, '').replace(/<h4>\s*<\/h4>/g, ''), gaps: [...used].sort((a, b) => a - b) };
}
function wordLimit(instr) {
  const t = instr.join(' ');
  const W = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4 };
  const m = t.match(/(?:NO MORE THAN\s+)?(ONE|TWO|THREE|FOUR)\s+WORDS?/i);
  return { words: m ? W[m[1].toUpperCase()] : 0, num: /A NUMBER/i.test(t) };
}
/** Đọc đáp án: "1 10/ten", "21&22 B, D", "31 metal(s)". Chữ "I" in nghiêng giữa hai đáp án là dấu "/" bị lỗi font. */
function readKey(doc) {
  const key = {};
  const lines = [];
  for (const h of doc.querySelectorAll('h5, h4, h3, p, div')) {
    if (h.tagName !== 'H5' && h.tagName !== 'H4') continue;
    if (!/^Part\s*\d\b/i.test(txt(h))) continue;
    const box = h.nextElementSibling;
    if (!box) continue;
    box.querySelectorAll('i, em').forEach((i) => { if (txt(i) === 'I') i.textContent = ' / '; });
    box.querySelectorAll('p, li').forEach((p) => lines.push(txt(p)));
    h.parentElement?.remove();
  }
  for (const l of lines) {
    const m = l.match(/^(\d{1,2})\s*(?:(?:&|and|,)\s*(\d{1,2}))?\s*[.):]?\s+(\S.*)$/i);
    if (!m) continue;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : 0;
    const val = m[3].trim();
    if (b) { const set = val.toUpperCase().match(/\b[A-I]\b/g) || []; key[a] = { set, nums: [a, b] }; key[b] = { set, nums: [a, b] }; }
    else key[a] = { text: val };
  }
  return key;
}
export function parseTestHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, ins, iframe, noscript, .ielts-manual-ads, .ielts-adlabel').forEach((e) => e.remove());
  const key = readKey(doc);
  const title = (doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || 'Đề Listening').replace(/\s*[-–]\s*(De bai|Đề bài).*$/i, '').trim();
  // Các khối theo thứ tự trong trang (bảng, danh sách tính là một khối).
  const blocks = [];
  const walk = (el) => {
    for (const c of el.children) {
      if (BLOCK.has(c.tagName)) { if (c.tagName !== 'H1') blocks.push(c); } else walk(c);
    }
  };
  walk(doc.body);
  const parts = [];
  let part = null, group = null;
  const close = () => { if (group && part) part.groups.push(buildGroup(group)); group = null; };
  for (const el of blocks) {
    const t = txt(el);
    if (!t && el.tagName !== 'TABLE') continue;
    if (/^(Answer|Audioscript|Transcript)\b/i.test(t) || el.querySelector('a[href]') && /Test\s*\d/i.test(t)) { close(); continue; }
    const pm = t.match(RE_PART);
    if (pm && el.tagName !== 'TABLE' && t.length < 30) { close(); part = { n: Number(pm[1]), groups: [] }; parts.push(part); continue; }
    const gm = t.match(RE_GROUP);
    if (gm && t.length < 40) { close(); if (!part) { part = { n: 1, groups: [] }; parts.push(part); } group = { from: Number(gm[1]), to: Number(gm[2]), blocks: [] }; continue; }
    if (group) group.blocks.push(el);
  }
  close();
  return { title, parts: parts.filter((p) => p.groups.length), key };
}
function buildGroup({ from, to, blocks }) {
  const instr = [];
  let i = 0;
  while (i < blocks.length && RE_INSTR.test(txt(blocks[i])) && !RE_NUM.test(txt(blocks[i]))) instr.push(txt(blocks[i++]));
  const rest = blocks.slice(i);
  const it = instr.join(' ');
  const base = { from, to, instr };
  if (/Choose\s+(TWO|THREE|FOUR)\s+(letters|answers)/i.test(it) && !/next to/i.test(it)) {
    const pick = { TWO: 2, THREE: 3, FOUR: 4 }[it.match(/Choose\s+(TWO|THREE|FOUR)/i)[1].toUpperCase()];
    const opts = [], heads = [];
    for (const el of rest) { const t = txt(el), m = t.match(RE_OPT); if (m) opts.push({ k: m[1], t: m[2] }); else if (t) heads.push(t); }
    return { ...base, t: 'multi', pick, nums: Array.from({ length: to - from + 1 }, (_, j) => from + j), q: heads.join(' '), opts };
  }
  if (/next to|from the box|write the correct letter/i.test(it) || (/Label|Match/i.test(it) && !/Complete/i.test(it))) {
    const opts = [], items = [], heads = [];
    for (const el of rest) {
      const t = txt(el);
      let m = t.match(RE_NUM);
      if (m && Number(m[1]) >= from && Number(m[1]) <= to) { items.push({ n: Number(m[1]), t: m[2].replace(DOTS, '').replace(/[.…]{3,}/g, '').trim() }); continue; }
      m = t.match(RE_OPT);
      if (m && !items.length) { opts.push({ k: m[1], t: m[2] }); continue; }
      if (t) (items.length ? heads : heads).push({ t, at: items.length ? 'items' : opts.length ? 'mid' : 'top' });
    }
    return { ...base, t: 'match', opts, items, heads };
  }
  if (/Choose the correct letter/i.test(it)) {
    const qs = [];
    let title = '';
    for (const el of rest) {
      const t = txt(el);
      let m = t.match(RE_NUM);
      if (m && Number(m[1]) >= from && Number(m[1]) <= to) { qs.push({ n: Number(m[1]), q: m[2], opts: [] }); continue; }
      m = t.match(RE_OPT);
      if (m && qs.length) { qs[qs.length - 1].opts.push({ k: m[1], t: m[2] }); continue; }
      if (t && !qs.length) title = title ? `${title} · ${t}` : t;
    }
    return { ...base, t: 'mcq', title, qs };
  }
  const { html, gaps } = markGaps(rest.map(cleanHtml).join(''), from, to);
  return { ...base, t: 'fill', limit: wordLimit(instr), html, gaps };
}
/** Số câu của đề (theo nhóm) và số câu có đáp án. */
function countQs(parts, key) {
  const nums = [];
  for (const p of parts) for (const g of p.groups) nums.push(...groupNums(g));
  return { n: nums.length, keyed: nums.filter((n) => key[n]).length, nums };
}
function groupNums(g) {
  if (g.t === 'fill') return g.gaps;
  if (g.t === 'mcq') return g.qs.map((q) => q.n);
  if (g.t === 'match') return g.items.map((x) => x.n);
  return g.nums;
}

// ---------------------------------------------------------------- Lời thoại (transcript)
// File lời thoại: chia theo "PART n"; mỗi đoạn giữ chữ in đậm/gạch chân (chỗ chứa đáp án) và mốc "(Q1)", "(Q21/Q22)".
const RE_QMARK = /\((Q\d{1,2}(?:\s*[/,&]\s*Q?\d{1,2})*)\)/g;
const isTranscriptDoc = (html) => /<title>[^<]*(transcript|audioscript|tapescript)/i.test(html) || ((html.match(/\(Q\d{1,2}/g) || []).length >= 8 && !/Questions?\s+\d{1,2}\s*[-–]/i.test(html));
function underlined(node) {
  for (let x = node.parentElement; x && x.tagName !== 'P'; x = x.parentElement) if (x.tagName === 'U' || /underline/.test(x.getAttribute?.('style') || '')) return true;
  return false;
}
/** Câu chứa đáp án cho mốc (Qn): phần gạch chân ngay trước mốc, kèm phần đầu câu; không có gạch chân thì lấy câu đứng trước mốc. */
function evidence(segs, k) {
  // Tìm phần gạch chân gần nhất trước mốc (bỏ qua phần đuôi câu sau đáp án, tối đa ~220 ký tự).
  let i = k - 1, gap = 0;
  while (i >= 0 && !segs[i].q && !segs[i].u) { gap += segs[i].t.length; if (gap > 450) break; i--; }
  let html = '';
  if (i >= 0 && segs[i].u) {
    let j = i;
    while (j - 1 >= 0 && (segs[j - 1].u || !segs[j - 1].t.trim())) j--;
    const ans = segs.slice(j, i + 1).map((x) => x.t).join('');
    let after = segs.slice(i + 1, k).map((x) => x.t).join('');
    if (after.length > 170) after = after.slice(0, 170).replace(/\s+\S*$/, '') + ' …';
    let before = '';
    for (let b = j - 1; b >= 0 && !segs[b].q; b--) { before = segs[b].t + before; if (before.length > 260) break; }
    const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '), before.lastIndexOf('– '));
    before = (cut >= 0 ? before.slice(cut + 2) : before).replace(/^\s*[A-Z][A-Z ]{1,20}:\s*/, '').slice(-240);
    html = `${esc(before)}<u>${esc(ans)}</u>${esc(after)}`;
  } else {
    let before = '';
    for (let b = k - 1; b >= 0 && !segs[b].q; b--) { before = segs[b].t + before; if (before.length > 400) break; }
    const ss = before.trim().split(/(?<=[.?!])\s+/);
    html = esc(ss.slice(-2).join(' ').replace(/^\s*[A-Z][A-Z ]{1,20}:\s*/, ''));
  }
  return html.replace(/\s+/g, ' ').trim();
}
export function parseTranscriptHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, ins, iframe, noscript, .ielts-manual-ads, .ielts-adlabel').forEach((e) => e.remove());
  readKey(doc); // file lời thoại có thể kèm khối đáp án: bỏ đi
  const blocks = [];
  const walk = (el) => { for (const c of el.children) { if (BLOCK.has(c.tagName)) { if (c.tagName !== 'H1') blocks.push(c); } else walk(c); } };
  walk(doc.body);
  const parts = {}, ev = {};
  let cur = null, pn = 0;
  for (const el of blocks) {
    const t = txt(el);
    if (!t) continue;
    const pm = t.match(RE_PART);
    if (pm && t.length < 30) { pn = Number(pm[1]); cur = parts[pn] = []; continue; }
    if (!cur) continue;
    if (/^(Answer|Audioscript|Transcript)\b/i.test(t) || (el.querySelector('a[href]') && /Test\s*\d/i.test(t))) { cur = null; continue; }
    if (/^[—–\-_.\s]{5,}$/.test(t)) { cur.push({ sep: true }); continue; }
    // Các mảnh chữ theo thứ tự: chữ thường / chữ gạch chân / mốc câu hỏi.
    const segs = [];
    const tw = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const v = n.nodeValue.replace(/\u00a0/g, ' ');
      const u = underlined(n);
      let last = 0;
      for (const m of v.matchAll(RE_QMARK)) {
        if (m.index > last) segs.push({ t: v.slice(last, m.index), u });
        segs.push({ q: [...m[1].matchAll(/\d{1,2}/g)].map((x) => Number(x[0])), t: '' });
        last = m.index + m[0].length;
      }
      if (last < v.length) segs.push({ t: v.slice(last), u });
    }
    const qs = [];
    segs.forEach((sg, k) => { if (sg.q) for (const q of sg.q) { qs.push(q); (ev[q] = ev[q] || []).push({ part: pn, i: cur.length, html: evidence(segs, k) }); } });
    const h = [...el.childNodes].map(cleanHtml).join('').replace(/(<i>\s*)?\((Q\d{1,2}(?:\s*[/,&]\s*Q?\d{1,2})*)\)(\s*<\/i>)?/g, (m, a, q) => `<span class="lt-qb">${q.replace(/\s+/g, '')}</span>`);
    cur.push({ html: h, qs });
  }
  return { parts, ev, n: Object.keys(ev).length };
}

// ---------------------------------------------------------------- Giải thích (vì sao chọn, bẫy, paraphrase)
// File .json: { "type": "ltest-notes", "title": "…", "notes": { "1": { "why", "trap", "para": [["đề", "bài nghe"]], "tip" }, "21-22": {…} } }
const clip = (v, n) => String(v ?? '').slice(0, n);
function cleanNote(x) {
  if (!x || typeof x !== 'object') return null;
  const para = Array.isArray(x.para) ? x.para.filter((p) => Array.isArray(p) && p.length >= 2).slice(0, 8).map((p) => [clip(p[0], 200), clip(p[1], 300)]) : [];
  const o = { why: clip(x.why, 1500), trap: clip(x.trap, 1500), tip: clip(x.tip, 800), para, ai: !!x.ai };
  return o.why || o.trap || para.length ? o : null;
}
export function parseNotes(text) {
  const d = JSON.parse(text);
  if (!d || d.type !== 'ltest-notes' || typeof d.notes !== 'object') throw new Error('Không phải file giải thích');
  const notes = {};
  for (const [k, v] of Object.entries(d.notes)) if (/^\d{1,2}(-\d{1,2})?$/.test(k)) { const c = cleanNote(v); if (c) notes[k] = c; }
  return { title: clip(d.title, 120), notes };
}
/** Số câu được giải thích ("21-22" tính 2 câu). */
export const noteCount = (notes) => Object.keys(notes || {}).reduce((a, k) => { const m = k.match(/^(\d+)-(\d+)$/); return a + (m ? Number(m[2]) - Number(m[1]) + 1 : 1); }, 0);
export function noteOf(t, n) {
  if (!t.notes) return null;
  if (t.notes[n]) return t.notes[n];
  for (const [k, v] of Object.entries(t.notes)) { const m = k.match(/^(\d+)-(\d+)$/); if (m && n >= Number(m[1]) && n <= Number(m[2])) return v; }
  return null;
}

// ---------------------------------------------------------------- Gói đề (.zip một file)
// ltest.json: { type: 'ltest-pack', v: 1, title, parts, key, tx, notes, audio: { "1": "audio/part1.mp3", … } } + các file nghe.
// Gói có thể do người khác gửi tới: mọi HTML trong gói được lọc lại (chỉ giữ thẻ định dạng cơ bản) trước khi dùng.
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** Tạo file .zip không nén (file nghe vốn đã nén sẵn). */
function zipStore(entries) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let off = 0, csize = 0;
  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true); h.setUint16(26, name.length, true);
    parts.push(h.buffer, name, e.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, name);
    csize += 46 + name.length;
    off += 30 + name.length + size;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
async function exportPack(t) {
  const enc = new TextEncoder();
  const audio = {}, files = [];
  for (const [n, a] of Object.entries(t.audio || {})) {
    const ext = (a.name.match(/\.(mp3|m4a|aac|wav|ogg)$/i) || ['', 'mp3'])[1].toLowerCase();
    audio[n] = `audio/part${n}.${ext}`;
    files.push({ name: audio[n], data: new Uint8Array(await a.blob.arrayBuffer()) });
  }
  const meta = { type: 'ltest-pack', v: 1, title: t.title, parts: t.parts, key: t.key, tx: t.tx || null, notes: t.notes || {}, audio };
  return zipStore([{ name: 'ltest.json', data: enc.encode(JSON.stringify(meta)) }, ...files]);
}
on('lt-export', async (el) => {
  const t = S.ltest.get(el.dataset.id);
  if (!t) return;
  ui.exporting = true;
  rerender();
  try {
    const blob = await exportPack(t);
    const name = `${t.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'De Listening'}.zip`;
    await download(name, blob, 'application/zip');
  } catch (e) { console.error(e); toast('Không tạo được gói đề: ' + (e?.message || e), 'bad'); }
  finally { ui.exporting = false; rerender(); }
});
/** Lọc HTML từ gói: chỉ giữ thẻ định dạng, lớp và mốc chỗ trống của app; mọi chữ được escape lại. */
const SAFE_CLASS = /^(lt-card|lt-cell|lt-trow|lt-qb)$/;
function safeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
  const walk = (node) => {
    if (node.nodeType === 3) return esc(node.nodeValue);
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const inner = [...node.childNodes].map(walk).join('');
    if (tag === 'span' && /^\d{1,2}$/.test(node.getAttribute('data-gap') || '')) return `<span data-gap="${node.getAttribute('data-gap')}"></span>`;
    const cls = (node.getAttribute('class') || '').split(/\s+/).filter((c) => SAFE_CLASS.test(c)).join(' ');
    if (['b', 'i', 'u', 'p', 'li', 'ul', 'ol', 'h4', 'small'].includes(tag)) return `<${tag}>${inner}</${tag}>`;
    if (tag === 'br') return '<br>';
    if ((tag === 'div' || tag === 'span') && cls) return `<${tag} class="${cls}">${inner}</${tag}>`;
    if (['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template'].includes(tag)) return '';
    return inner;
  };
  return [...doc.body.childNodes].map(walk).join('');
}
const sStr = (v, n = 400) => String(v ?? '').slice(0, n);
const sNum = (v) => Math.max(0, Math.min(99, Math.round(Number(v)) || 0));
const sOpts = (a) => (Array.isArray(a) ? a : []).slice(0, 12).map((o) => ({ k: sStr(o?.k, 1).toUpperCase().replace(/[^A-L]/, ''), t: sStr(o?.t, 400) })).filter((o) => o.k);
function cleanGroup(g) {
  const base = { from: sNum(g?.from), to: sNum(g?.to), instr: (Array.isArray(g?.instr) ? g.instr : []).slice(0, 6).map((x) => sStr(x, 400)) };
  if (g?.t === 'fill') return { ...base, t: 'fill', limit: { words: sNum(g.limit?.words), num: !!g.limit?.num }, html: safeHtml(g.html), gaps: (g.gaps || []).map(sNum).filter(Boolean) };
  if (g?.t === 'mcq') return { ...base, t: 'mcq', title: sStr(g.title, 300), qs: (g.qs || []).slice(0, 20).map((q) => ({ n: sNum(q.n), q: sStr(q.q, 600), opts: sOpts(q.opts) })) };
  if (g?.t === 'multi') return { ...base, t: 'multi', pick: Math.min(5, sNum(g.pick)) || 2, nums: (g.nums || []).map(sNum).filter(Boolean), q: sStr(g.q, 600), opts: sOpts(g.opts) };
  if (g?.t === 'match') return { ...base, t: 'match', opts: sOpts(g.opts), items: (g.items || []).slice(0, 20).map((x) => ({ n: sNum(x.n), t: sStr(x.t, 400) })), heads: (g.heads || []).slice(0, 10).map((h) => ({ t: sStr(h.t, 300), at: ['top', 'mid', 'items'].includes(h.at) ? h.at : 'top' })) };
  return null;
}
async function readPack(z) {
  const meta = JSON.parse(new TextDecoder().decode(await z.bytes('ltest.json')));
  if (meta?.type !== 'ltest-pack') throw new Error('Không phải gói đề');
  const parts = (Array.isArray(meta.parts) ? meta.parts : []).slice(0, 4).map((p) => ({ n: sNum(p.n), groups: (p.groups || []).slice(0, 12).map(cleanGroup).filter(Boolean) })).filter((p) => p.n && p.groups.length);
  const key = {};
  for (const [k, v] of Object.entries(meta.key || {})) {
    if (!/^\d{1,2}$/.test(k) || !v) continue;
    key[k] = Array.isArray(v.set) ? { set: v.set.map((x) => sStr(x, 1).toUpperCase()).slice(0, 5), nums: (v.nums || []).map(sNum) } : { text: sStr(v.text, 200) };
  }
  let tx = null;
  if (meta.tx?.parts) {
    const tp = {}, ev = {};
    for (const [pn, paras] of Object.entries(meta.tx.parts)) if (/^[1-4]$/.test(pn) && Array.isArray(paras)) tp[pn] = paras.slice(0, 200).map((x) => (x?.sep ? { sep: true } : { html: safeHtml(x?.html), qs: (x?.qs || []).map(sNum) }));
    for (const [q, list] of Object.entries(meta.tx.ev || {})) if (/^\d{1,2}$/.test(q) && Array.isArray(list)) ev[q] = list.slice(0, 6).map((e) => ({ part: sNum(e.part), i: sNum(e.i), html: safeHtml(e.html) }));
    tx = { parts: tp, ev, n: Object.keys(ev).length };
  }
  const notes = {};
  for (const [k, v] of Object.entries(meta.notes || {})) if (/^\d{1,2}(-\d{1,2})?$/.test(k)) { const c = cleanNote(v); if (c) notes[k] = c; }
  const audio = {};
  for (const [n, path] of Object.entries(meta.audio || {})) {
    if (!/^[1-4]$/.test(n) || !z.names.includes(path)) continue;
    const ext = path.split('.').pop().toLowerCase();
    audio[n] = new File([await z.bytes(path)], `Part${n}.${ext}`, { type: ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg' });
  }
  return { title: sStr(meta.title, 120) || 'Đề Listening', parts, key, tx, notes: Object.keys(notes).length ? notes : null, audio };
}

// ---------------------------------------------------------------- Chấm
const normA = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").replace(/[£$€]/g, '')
  .replace(/[-–—]/g, ' ').replace(/[.,;:!?"]+$/g, '').replace(/^[.,;:!?"]+/g, '').replace(/\s+/g, ' ').trim();
/** Các cách viết được chấp nhận: "10/ten" → [10, ten]; "metal(s)" → [metal, metals]; "(the) museum" → [museum, the museum]. */
export function alternatives(text) {
  const out = new Set();
  for (const part of String(text).split(/\s*\/\s*|\s+OR\s+/)) {
    if (!part.trim()) continue;
    let forms = [''];
    const re = /\(([^)]*)\)|([^()]+)/g;
    let m;
    while ((m = re.exec(part))) {
      if (m[1] != null) forms = forms.flatMap((f) => [f, f + m[1]]);
      else forms = forms.map((f) => f + m[2]);
    }
    forms.forEach((f) => { const v = normA(f); if (v) out.add(v); });
  }
  return [...out];
}
function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const WHY = {
  blank: 'Bỏ trống',
  spell: 'Sai chính tả',
  plural: 'Thiếu hoặc thừa "s"',
  limit: 'Quá số từ cho phép',
  wrong: 'Sai đáp án',
  partial: 'Đúng một phần',
};
const TYPE_NAME = { fill: 'Điền từ', mcq: 'Chọn 1 đáp án', multi: 'Chọn nhiều đáp án', match: 'Nối / chọn chữ cái' };
function gradeFill(g, n, ans, key) {
  const alts = alternatives(key.text);
  const a = normA(ans);
  if (!a) return { ok: false, why: 'blank' };
  if (alts.includes(a)) return { ok: true };
  const words = a.split(' ').filter((w) => !/^\d[\d.,:/]*$/.test(w));
  if (g.limit.words && words.length > g.limit.words) return { ok: false, why: 'limit' };
  for (const k of alts) {
    if (a + 's' === k || k + 's' === a || a + 'es' === k || k + 'es' === a) return { ok: false, why: 'plural' };
  }
  if (alts.some((k) => k.length > 3 && lev(a, k) <= (k.length > 7 ? 2 : 1))) return { ok: false, why: 'spell' };
  return { ok: false, why: 'wrong' };
}
/** Chấm cả lượt: trả về từng câu { ok, why, your, right, type } và tổng. */
function gradeAll(test, parts, ans) {
  const res = {};
  for (const p of test.parts.filter((x) => parts.includes(x.n))) {
    for (const g of p.groups) {
      if (g.t === 'fill') for (const n of g.gaps) { const k = test.key[n]; if (k) res[n] = { ...gradeFill(g, n, ans[n], k), your: ans[n] || '', right: k.text, type: 'fill', part: p.n }; }
      if (g.t === 'mcq') for (const q of g.qs) { const k = test.key[q.n]; if (k) { const y = ans[q.n] || ''; res[q.n] = { ok: !!y && y === normLetter(k.text), why: y ? 'wrong' : 'blank', your: y, right: normLetter(k.text), type: 'mcq', part: p.n }; } }
      if (g.t === 'match') for (const x of g.items) { const k = test.key[x.n]; if (k) { const y = ans[x.n] || ''; res[x.n] = { ok: !!y && y === normLetter(k.text), why: y ? 'wrong' : 'blank', your: y, right: normLetter(k.text), type: 'match', part: p.n }; } }
      if (g.t === 'multi') {
        const k = test.key[g.nums[0]];
        if (!k) continue;
        const sel = ans[g.nums[0]] || [];
        const hits = sel.filter((x) => k.set.includes(x)).length;
        g.nums.forEach((n, i) => { res[n] = { ok: i < hits, why: sel.length ? (hits ? 'partial' : 'wrong') : 'blank', your: sel.join(', '), right: k.set.join(', '), type: 'multi', part: p.n }; });
      }
    }
  }
  for (const r of Object.values(res)) if (r.ok) r.why = '';
  const list = Object.values(res);
  return { res, score: list.filter((r) => r.ok).length, total: list.length };
}
const normLetter = (s) => (String(s).toUpperCase().match(/\b[A-I]\b/) || [''])[0];
/** Bảng quy đổi điểm Listening (thang 40 câu) sang band. */
export function bandOf(score) {
  const T = [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5]];
  for (const [min, b] of T) if (score >= min) return b;
  return score > 0 ? 2 : 0;
}

// ---------------------------------------------------------------- Nhập đề
const imp = { previews: [], skipped: [], error: '', busy: false };
const tests = () => [...S.ltest.values()].filter((r) => r.kind === 'test').sort((a, b) => b.at - a.at);
const attempts = (id) => [...S.ltest.values()].filter((r) => r.kind === 'attempt' && (!id || r.test === id)).sort((a, b) => b.at - a.at);
export const ltestCount = () => tests().length;

// Nhập nhiều đề một lần (ví dụ cả cuốn Cam 21 gồm Test 1–4): mỗi file được ghép vào đúng đề theo
// (1) mã sách + số Test trong tên file / thư mục / tiêu đề ("Cam21_Test02_Part3.mp3", "Cam 21 Listening Test 02 - Transcripts"),
// (2) tên file trùng nhau sau khi bỏ phần đuôi (…_DeBai, …_Transcript, …_Part1), (3) nếu chỉ có một đề thì ghép hết vào đề đó.
/** "21-2" từ "Cam21_Test02…" / "Cambridge IELTS 21 … Test 2"; chỉ có số Test thì "-2"; không có thì "". */
export function sigOf(s) {
  const t = String(s || '').replace(/_/g, ' ');
  const test = t.match(/test\s*[-#]?\s*0*(\d{1,2})(?!\d)/i);
  if (!test) return '';
  const book = t.match(/cam(?:bridge)?\s*(?:ielts)?\s*[-]?\s*0*(\d{1,2})(?!\d)/i);
  return `${book ? book[1] : ''}-${test[1]}`;
}
const SUFFIX = /[\s_-]*(de[\s_-]?bai|đề[\s_-]?bài|questions?|transcripts?|audio[\s_-]?scripts?|tape[\s_-]?scripts?|giai[\s_-]?thich|giải[\s_-]?thích|notes?|answers?|part[\s_-]?\d)$/i;
/** Khoá nhóm: thư mục trong file nén + tên file bỏ phần đuôi loại file và số Part. */
export function keyOf(path) {
  const segs = String(path).split('/');
  let base = segs.pop().replace(/\.[a-z0-9]+$/i, '').replace(/^[0-9a-f]{8}-/i, '');
  for (let i = 0; i < 4 && SUFFIX.test(base); i++) base = base.replace(SUFFIX, '');
  return `${segs.join('/')}|${base}`.toLowerCase().replace(/[^a-z0-9|/]/g, '');
}
const sameSig = (a, b) => a && b && (a === b || (a.startsWith('-') || b.startsWith('-')) && a.split('-')[1] === b.split('-')[1]);
const titleOf = (html) => (html.match(/<title>([^<]*)<\/title>/i) || ['', ''])[1];

/** Mở file nén (nếu có) và phân loại từng file: đề, lời thoại, giải thích, file nghe, gói đề của app. */
async function readFiles(input) {
  const items = [], errors = [], packs = [];
  const list = [];
  for (const f of input) {
    if (!/\.zip$/i.test(f.name) && !/zip/.test(f.type)) { list.push({ f, path: f.name }); continue; }
    try {
      const z = await unzip(await f.arrayBuffer());
      if (z.names.includes('ltest.json')) { packs.push(await readPack(z)); continue; }
      for (const name of z.names) {
        if (name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(name)) continue;
        const base = name.split('/').pop();
        const type = /\.mp3$/i.test(base) ? 'audio/mpeg' : /\.m4a$/i.test(base) ? 'audio/mp4' : /\.html?$/i.test(base) ? 'text/html' : /\.json$/i.test(base) ? 'application/json' : /\.zip$/i.test(base) ? 'application/zip' : '';
        if (!type) continue;
        const file = new File([await z.bytes(name)], base, { type });
        // Gói đề nằm trong file nén lớn: đọc tiếp.
        if (type === 'application/zip') { const inner = await readFiles([file]); items.push(...inner.items); errors.push(...inner.errors); packs.push(...inner.packs); continue; }
        list.push({ f: file, path: `${f.name.replace(/\.zip$/i, '')}/${name}` });
      }
    } catch (e) { console.error(e); errors.push(`${f.name}: không mở được file nén`); }
  }
  for (const { f, path } of list) {
    const key = keyOf(path);
    if (/^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name)) { items.push({ kind: 'audio', f, path, key, sig: sigOf(path) }); continue; }
    if (/\.json$/i.test(f.name) || f.type === 'application/json') {
      try { const notes = parseNotes(await f.text()); items.push({ kind: 'notes', notes, path, key, sig: sigOf(path) || sigOf(notes.title) }); } catch { errors.push(`${f.name}: không phải file giải thích`); }
      continue;
    }
    if (/\.html?$/i.test(f.name) || f.type === 'text/html') {
      const text = await f.text();
      const sig = sigOf(path) || sigOf(titleOf(text));
      if (isTranscriptDoc(text)) {
        try { items.push({ kind: 'tx', tx: parseTranscriptHtml(text), path, key, sig }); } catch (e) { console.error(e); errors.push(`${f.name}: không đọc được lời thoại`); }
      } else {
        try {
          const parsed = parseTestHtml(text);
          if (parsed.parts.length) items.push({ kind: 'test', parsed, path, key, sig: sigOf(path) || sigOf(parsed.title) });
          else errors.push(`${f.name}: không thấy câu hỏi (cần "PART 1" và "Questions 1-10")`);
        } catch (e) { console.error(e); errors.push(`${f.name}: không đọc được file đề`); }
      }
    }
  }
  return { items, errors, packs };
}
/** Chọn đề cho một file: cùng mã sách + số Test → cùng tên file → chỉ có một đề. */
function pickTarget(item, targets) {
  if (item.sig) { const m = targets.filter((t) => sameSig(item.sig, t.sig)); if (m.length === 1) return m[0]; if (m.length > 1) { const k = m.find((t) => t.key === item.key); if (k) return k; } }
  const byKey = targets.filter((t) => t.key === item.key);
  if (byKey.length === 1) return byKey[0];
  if (targets.length === 1 && !(item.sig && targets[0].sig && !sameSig(item.sig, targets[0].sig))) return targets[0];
  return null;
}
async function readImport(files) {
  imp.error = '';
  imp.previews = [];
  imp.skipped = [];
  const { items, errors, packs } = await readFiles(files);
  const previews = packs.map((pk) => ({ title: pk.title, parts: pk.parts, key: pk.key, audio: pk.audio, cnt: countQs(pk.parts, pk.key), tx: pk.tx, notes: pk.notes ? { notes: pk.notes } : null, from: 'gói đề', warn: [] }));
  const targets = items.filter((x) => x.kind === 'test').map((x) => ({ ...x, audios: [], txs: [], notesList: [] }));
  // Nhiều file đề trùng nhau (cùng đề) → giữ một.
  for (const it of items.filter((x) => x.kind !== 'test')) {
    const t = pickTarget(it, targets);
    if (!t) { imp.skipped.push(it.path.split('/').pop()); continue; }
    if (it.kind === 'audio') t.audios.push(it.f);
    if (it.kind === 'tx') t.txs.push(it);
    if (it.kind === 'notes') t.notesList.push(it);
  }
  for (const t of targets) {
    const p = t.parsed;
    const warn = [];
    if (t.txs.length > 1) warn.push(`Có ${t.txs.length} file lời thoại cho đề này, dùng file ${t.txs[0].path.split('/').pop()}`);
    const notes = t.notesList.length ? { notes: Object.assign({}, ...t.notesList.map((x) => x.notes.notes)) } : null;
    previews.push({ title: p.title, parts: p.parts, key: p.key, audio: matchAudio(t.audios, p.parts.map((x) => x.n)), cnt: countQs(p.parts, p.key), tx: t.txs[0]?.tx || null, notes, from: t.path.split('/').pop(), warn });
  }
  // Sắp theo số Test để dễ xem (Test 1, 2, 3, 4).
  previews.sort((a, b) => (sigOf(a.title) || a.title).localeCompare(sigOf(b.title) || b.title, undefined, { numeric: true }));
  imp.previews = previews;
  if (!previews.length) imp.error = errors[0] || 'Chưa có file đề (.html có câu hỏi và đáp án) hoặc gói đề (.zip). Chọn cùng lúc file đề và các file nghe.';
  else if (errors.length) imp.error = errors.join(' · ');
}
const matchAudio = (audios, partNums, have = {}) => {
  const byPart = {}, rest = [];
  for (const a of audios) { const m = a.name.match(/part\s*[_-]?\s*(\d)/i) || a.name.match(/(?:^|[^\d])([1-4])\.(?:mp3|m4a|aac|wav|ogg)$/i); if (m && !byPart[m[1]]) byPart[m[1]] = a; else rest.push(a); }
  rest.sort((a, b) => a.name.localeCompare(b.name));
  for (const n of partNums) if (!byPart[n] && !have[n] && rest.length) byPart[n] = rest.shift();
  return byPart;
};
const toAudio = async (f) => ({ blob: new Blob([await f.arrayBuffer()], { type: f.type || 'audio/mpeg' }), name: f.name, size: f.size });
/** Bổ sung lời thoại, giải thích hoặc file nghe cho đề đã nhập (chỉ nhận file đúng của đề này). */
async function attachFiles(id, files) {
  const t = S.ltest.get(id);
  if (!t) return;
  const { items, errors } = await readFiles(files);
  const me = { sig: sigOf(t.title), key: '' };
  const mine = items.filter((it) => it.kind !== 'test' && (!it.sig || !me.sig || sameSig(it.sig, me.sig)));
  const other = items.filter((it) => it.kind !== 'test' && !mine.includes(it));
  const upd = { ...t };
  const done = [];
  const tx = mine.find((x) => x.kind === 'tx' && x.sig) || mine.find((x) => x.kind === 'tx');
  if (tx?.tx?.n) { upd.tx = tx.tx; done.push(`lời thoại (${tx.tx.n} câu có mốc)`); }
  const notes = mine.filter((x) => x.kind === 'notes');
  if (notes.length) { const n = Object.assign({}, ...notes.map((x) => x.notes.notes)); upd.notes = { ...(t.notes || {}), ...n }; done.push(`giải thích ${noteCount(n)} câu`); }
  const auds = mine.filter((x) => x.kind === 'audio').map((x) => x.f);
  if (auds.length) {
    const m = matchAudio(auds, t.parts.map((p) => p.n));
    upd.audio = { ...(t.audio || {}) };
    for (const [n, f] of Object.entries(m)) upd.audio[n] = await toAudio(f);
    if (Object.keys(m).length) done.push(`file nghe Part ${Object.keys(m).join(', ')}`);
  }
  const skipNote = other.length ? ` · bỏ qua ${other.length} file của đề khác` : '';
  if (!done.length) { toast(other.length ? `Các file đã chọn là của đề khác, không phải ${t.title}` : errors[0] || 'Không thấy lời thoại, giải thích hay file nghe trong các file đã chọn', 'bad'); return; }
  await ltPut(upd);
  toast('Đã thêm ' + done.join(', ') + skipNote);
  rerender();
}
on('lt-attach', (el) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.zip,application/zip,.html,.htm,.json,text/html,application/json,audio/*,.mp3,.m4a';
  input.onchange = () => attachFiles(el.dataset.id, [...input.files]);
  input.click();
});
on('lt-attach-files', (el) => attachFiles(el.dataset.id, [...el.files])); // dùng cho kiểm thử
const previewOk = (pv) => pv.cnt.n && pv.cnt.keyed >= Math.ceil(pv.cnt.n * 0.8);
async function saveImport() {
  const list = imp.previews.filter(previewOk);
  if (!list.length) return;
  imp.busy = true;
  rerender();
  const savedIds = [];
  try {
    for (const pv of list) {
      // Đề cùng tên đã có trên máy (ví dụ lần nhập trước bị ghép sai) → thay bằng bản mới, giữ kết quả các lần làm.
      const old = tests().find((t) => t.title === pv.title);
      const id = old?.id || 'X:' + uid();
      const audio = {};
      for (const [n, f] of Object.entries(pv.audio)) audio[n] = await toAudio(f);
      await ltPut({ id, kind: 'test', title: pv.title, at: old?.at || Date.now(), parts: pv.parts, key: pv.key, audio, n: pv.cnt.n, tx: pv.tx || null, notes: pv.notes?.notes || {} });
      savedIds.push(id);
    }
    imp.previews = [];
    imp.skipped = [];
    toast(savedIds.length > 1 ? `Đã lưu ${savedIds.length} đề trên máy` : 'Đã lưu đề trên máy');
    go(savedIds.length > 1 ? '#/listening' : `#/ltest/${encodeURIComponent(savedIds[0])}`);
  } catch (e) {
    console.error(e);
    toast('Không lưu được: ' + (e?.message || e), 'bad');
  } finally { imp.busy = false; }
}
on('lt-pick-files', async () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.zip,application/zip,.html,.htm,.json,text/html,application/json,audio/*,.mp3,.m4a';
  input.onchange = async () => { imp.previews = []; imp.error = 'Đang đọc file…'; rerender(); await readImport([...input.files]); rerender(); };
  input.click();
});
on('lt-files', async (el) => { await readImport([...el.files]); rerender(); }); // dùng cho kiểm thử
on('lt-save', saveImport);
on('lt-del', async (el) => {
  const t = S.ltest.get(el.dataset.id);
  if (!t || !(await confirmSheet({ title: 'Xoá đề này?', body: `${t.title}: xoá đề và file nghe trên máy. Kết quả các lần làm vẫn giữ.`, okLabel: 'Xoá', danger: true }))) return;
  await ltDel(t.id);
  toast('Đã xoá đề');
  go('#/listening');
});

function previewCard(pv) {
  const rows = pv.parts.map((p) => {
    const nums = p.groups.flatMap(groupNums);
    const a = pv.audio[p.n];
    return `<div class="row-between ls-catline"><span><b>Part ${p.n}</b> · ${nums.length} câu · ${p.groups.map((g) => TYPE_NAME[g.t]).filter((v, i, x) => x.indexOf(v) === i).join(', ')}</span><span class="small ${a ? 'muted' : 'lt-bad'}">${a ? esc(a.name.replace(/^[0-9a-f]{8}-/, '')) : 'thiếu file nghe'}</span></div>`;
  }).join('');
  const miss = pv.cnt.nums.filter((n) => !pv.key[n]);
  const ok = previewOk(pv);
  const exists = tests().some((t) => t.title === pv.title);
  return `<div class="card lt-pv"><b>${esc(pv.title)}</b><p class="small muted" style="margin-top:2px">${pv.cnt.n} câu · đáp án ${pv.cnt.keyed}/${pv.cnt.n}${exists ? ' · <span class="lt-bad">đã có trên máy, sẽ thay bằng bản này (giữ kết quả các lần làm)</span>' : ''}</p>${rows}
    <div class="row-between ls-catline"><span>Lời thoại</span><span class="small ${pv.tx ? 'muted' : 'faint'}">${pv.tx ? `${Object.keys(pv.tx.parts).length} Part · ${pv.tx.n} câu có mốc` : 'không có (thêm sau được)'}</span></div>
    <div class="row-between ls-catline"><span>Giải thích</span><span class="small ${pv.notes ? 'muted' : 'faint'}">${pv.notes ? `${noteCount(pv.notes.notes)} câu` : 'không có (thêm sau được)'}</span></div>
    ${miss.length ? `<p class="small lt-bad" style="margin-top:8px">Thiếu đáp án câu ${miss.slice(0, 12).join(', ')}${miss.length > 12 ? '…' : ''}${ok ? ' (các câu này sẽ không được chấm)' : ''}.</p>` : ''}
    ${pv.parts.some((p) => !pv.audio[p.n]) ? '<p class="small lt-bad" style="margin-top:8px">Part thiếu file nghe vẫn làm được nhưng không có âm thanh.</p>' : ''}
    ${pv.warn.map((w) => `<p class="small lt-bad" style="margin-top:6px">${esc(w)}</p>`).join('')}
    ${ok ? '' : '<p class="small muted" style="margin-top:6px">Không tìm thấy đủ đáp án trong file nên đề này sẽ không được lưu.</p>'}</div>`;
}
export function importView() {
  const nav = navBar('Nhập đề Listening', { fallback: '#/listening' });
  let body = `<div class="card"><p>Chọn <b>gói đề</b> (.zip) bạn được gửi, hoặc chọn <b>cùng lúc</b> file đề (.html, có câu hỏi và đáp án) và các file nghe của từng Part (.mp3). Có thể chọn thêm file lời thoại (.html) và file giải thích (.json). Nhập được nhiều đề một lần (ví dụ cả 4 Test của một cuốn).</p>
    <p class="small muted" style="margin-top:6px">Tên file nên có số Test và số Part (ví dụ Cam21_Test02_Part3.mp3, Cam21_Test02_Transcript.html) hoặc mỗi đề một thư mục, để app ghép đúng. Đề và file nghe chỉ lưu trên máy này, không gửi đi đâu và không có trong file sao lưu.</p>
    <button class="btn" style="margin-top:14px" data-act="lt-pick-files">${icon('folder', 'sm')} Chọn file</button>
    <input type="file" id="lt-files" data-change="lt-files" multiple hidden accept=".zip,.html,.htm,.json,audio/*"></div>`;
  if (imp.error) body += `<div class="banner" style="margin-top:12px">${icon('info')}<span>${esc(imp.error)}</span></div>`;
  const pvs = imp.previews;
  if (pvs.length) {
    const okN = pvs.filter(previewOk).length;
    body += `<h2>Xem trước · ${pvs.length} đề</h2>${pvs.map(previewCard).join('')}
      ${imp.skipped.length ? `<p class="small lt-bad" style="margin:10px 2px 0">Không ghép được vào đề nào: ${esc(imp.skipped.slice(0, 8).join(', '))}${imp.skipped.length > 8 ? '…' : ''}. Đổi tên file cho có số Test (ví dụ Test02) rồi chọn lại.</p>` : ''}
      <button class="btn" style="margin-top:14px" data-act="lt-save" ${okN && !imp.busy ? '' : 'disabled'}>${imp.busy ? 'Đang lưu…' : okN > 1 ? `Lưu ${okN} đề` : 'Lưu đề'}</button>`;
  }
  return `<div class="page">${nav}${body}</div>`;
}

// ---------------------------------------------------------------- Trang một đề
const ui = { mode: 'exam' };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function testView(id) {
  const t = S.ltest.get(id);
  const nav = navBar(t?.title || 'Đề Listening', { fallback: '#/listening' });
  if (!t) return `<div class="page">${nav}<div class="card empty"><h3>Không tìm thấy đề</h3><p>Đề có thể đã bị xoá.</p></div></div>`;
  const att = attempts(id);
  const best = att.filter((a) => a.total === 40).reduce((m, a) => Math.max(m, a.band), 0);
  const parts = t.parts.map((p) => {
    const nums = p.groups.flatMap(groupNums);
    const last = att.find((a) => a.parts.length === 1 && a.parts[0] === p.n);
    return `<div class="wrow" data-act="lt-start" data-id="${esc(id)}" data-parts="${p.n}" role="button"><span class="num">${p.n}</span><div class="body"><span style="font-weight:600">Part ${p.n} · câu ${nums[0]}–${nums[nums.length - 1]}</span><p>${p.groups.map((g) => TYPE_NAME[g.t]).filter((v, i, x) => x.indexOf(v) === i).join(', ')}${last ? ` · lần trước ${last.score}/${last.total}` : ''}</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<div class="page">${nav}
    <div class="card"><div class="row-between"><div><b>${t.n} câu · 4 Part</b><p class="small muted">${best ? `Band cao nhất: ${best}` : 'Chưa làm cả đề'} · nhập ${fmtDate(dateStr(new Date(t.at)))}</p></div></div>
      <div class="seg" style="margin-top:12px"><button class="${ui.mode === 'exam' ? 'on' : ''}" data-act="lt-mode" data-v="exam">Như thi</button><button class="${ui.mode === 'practice' ? 'on' : ''}" data-act="lt-mode" data-v="practice">Luyện</button></div>
      <p class="small muted" style="margin-top:8px">${ui.mode === 'exam' ? 'Mỗi Part chỉ nghe 1 lần, không tua lại. Nộp bài mới xem đáp án.' : 'Được tạm dừng, tua lại 5 giây, nghe chậm. Nộp bài để xem đáp án.'}</p>
      <button class="btn" style="margin-top:12px" data-act="lt-start" data-id="${esc(id)}" data-parts="1,2,3,4">Làm cả đề · khoảng 30 phút</button></div>
    <h2>Từng Part</h2><div class="wlist">${parts}</div>
    ${att.length ? `<h2>Các lần làm</h2><div class="card">${att.slice(0, 8).map((a) => `<div class="row-between ls-catline" data-act="lt-open-att" data-id="${a.id}" role="button"><span>${a.parts.length === 4 ? 'Cả đề' : `Part ${a.parts.join(', ')}`} · ${a.mode === 'exam' ? 'như thi' : 'luyện'}${a.rate && a.rate !== 1 ? ` · ${String(a.rate).replace('.', ',')}×` : ''} <span class="small muted">· ${fmtDate(a.date)}</span></span><b>${a.score}/${a.total}${a.total === 40 ? ` · ${a.band}` : ''}</b></div>`).join('')}</div>` : ''}
    <h2>Lời thoại &amp; giải thích</h2><div class="card"><div class="row-between ls-catline"><span>Lời thoại</span><span class="small muted">${t.tx ? `${Object.keys(t.tx.parts).length} Part · ${t.tx.n} câu có mốc` : 'chưa có'}</span></div>
      <div class="row-between ls-catline"><span>Giải thích từng câu</span><span class="small muted">${noteCount(t.notes) ? `${noteCount(t.notes)} câu` : 'chưa có'}</span></div>
      <p class="small muted" style="margin-top:6px">Hiện sau khi nộp bài: câu chứa đáp án trong lời thoại, vì sao chọn, bẫy, paraphrase.</p>
      <button class="btn soft" style="margin-top:10px" data-act="lt-attach" data-id="${esc(id)}">${icon('plus', 'sm')} Thêm lời thoại / giải thích / file nghe</button>
      <input type="file" id="lt-attach-files" data-change="lt-attach-files" data-id="${esc(id)}" multiple hidden></div>
    <h2>Chia sẻ</h2><div class="card"><p class="small muted">Gộp đề, file nghe, lời thoại và giải thích thành một file .zip để gửi riêng cho bạn học (Zalo, Drive…). Người nhận bấm Nhập đề và chọn file đó.</p>
      <button class="btn soft" style="margin-top:10px" data-act="lt-export" data-id="${esc(id)}" ${ui.exporting ? 'disabled' : ''}>${icon('upload', 'sm')} ${ui.exporting ? 'Đang tạo gói…' : 'Xuất gói đề (1 file)'}</button></div>
    <button class="btn ghost danger-text" style="margin-top:18px" data-act="lt-del" data-id="${esc(id)}">${icon('trash', 'sm')} Xoá đề khỏi máy</button>
  </div>`;
}
on('lt-mode', (el) => { ui.mode = el.dataset.v; rerender(); });

// ---------------------------------------------------------------- Làm bài
let R = null; // { test, parts: [1..4], pi, mode, ans, played: {}, ended: {}, stage: 'do' | 'done', result }
const A = { el: null, url: '', n: 0, lock: null };
function audio() {
  if (A.el) return A.el;
  const el = new Audio();
  el.preload = 'auto';
  el.addEventListener('timeupdate', syncBar);
  el.addEventListener('loadedmetadata', syncBar);
  el.addEventListener('play', syncBtn);
  el.addEventListener('pause', syncBtn);
  el.addEventListener('ended', () => { if (R) { R.ended[A.n] = true; releaseLock(); rerender(); } });
  A.el = el;
  return el;
}
function loadPart(n) {
  const t = R.test, a = t.audio?.[n];
  const el = audio();
  el.pause();
  if (A.url) URL.revokeObjectURL(A.url);
  A.url = a ? URL.createObjectURL(a.blob) : '';
  A.n = n;
  if (A.url) { el.src = A.url; el.load(); } else el.removeAttribute('src');
  el.defaultPlaybackRate = rate();
  el.playbackRate = rate();
}
async function holdLock() { try { A.lock = await navigator.wakeLock?.request('screen'); } catch { A.lock = null; } }
function releaseLock() { try { A.lock?.release?.(); } catch { /* bỏ qua */ } A.lock = null; }
function stopAudio() { A.el?.pause(); releaseLock(); }
function syncBar() {
  const el = A.el;
  if (!el) return;
  const bar = document.querySelector('#lt-bar i'), tm = document.getElementById('lt-time');
  const d = el.duration || 0;
  if (bar) bar.style.width = d ? `${(el.currentTime / d) * 100}%` : '0%';
  if (tm) tm.textContent = `${mmss(el.currentTime || 0)} / ${d ? mmss(d) : '–:––'}`;
}
function playLabel() {
  if (A.el && !A.el.paused) return 'Tạm dừng';
  return `${icon('speaker', 'sm')} ${R?.played[A.n] ? 'Nghe tiếp' : R?.review ? 'Nghe lại' : 'Nghe'}`;
}
function syncBtn() {
  const b = document.getElementById('lt-play');
  if (b && A.el) b.innerHTML = playLabel();
}
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/lrun')) stopAudio(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) syncBtn(); });

on('lt-start', (el) => {
  const t = S.ltest.get(el.dataset.id);
  if (!t) return;
  const parts = el.dataset.parts.split(',').map(Number).filter((n) => t.parts.some((p) => p.n === n));
  R = { test: t, parts, pi: 0, mode: ui.mode, ans: {}, played: {}, ended: {}, stage: 'do', result: null, review: false };
  loadPart(parts[0]);
  go('#/lrun');
});
on('lt-play', async () => {
  const el = audio();
  if (!A.url) { toast('Part này không có file nghe'); return; }
  if (!el.paused) { el.pause(); releaseLock(); return; }
  if (R.mode === 'exam' && R.ended[A.n] && !R.review) { toast('Chế độ thi: mỗi Part chỉ nghe 1 lần'); return; }
  try { await el.play(); R.played[A.n] = true; holdLock(); } catch (e) { console.error(e); toast('Không phát được file nghe'); }
});
on('lt-seek', (el) => {
  if (!A.el || (R.mode === 'exam' && !R.review)) return;
  A.el.currentTime = Math.max(0, Math.min((A.el.duration || 0), A.el.currentTime + Number(el.dataset.d)));
  syncBar();
});
// Tốc độ nghe: 0.85× / 1× / 1.1× / 1.25× (nhớ cho các lần sau). Nghe nhanh hơn thi thật giúp tốc độ thật thấy dễ hơn.
const RATES = [1, 1.1, 1.25, 0.85];
const rate = () => (RATES.includes(S.settings.ltRate) ? S.settings.ltRate : 1);
const rateLabel = () => `${String(rate()).replace('.', ',')}×`;
on('lt-rate', async () => {
  const next = RATES[(RATES.indexOf(rate()) + 1) % RATES.length];
  await saveSettings({ ltRate: next });
  if (A.el) { A.el.playbackRate = next; A.el.defaultPlaybackRate = next; }
  toast(`Tốc độ nghe ${rateLabel()}`);
  rerender();
});
on('lt-in', (el) => { if (R && R.stage === 'do') R.ans[el.dataset.n] = el.value; });
on('lt-choose', (el) => {
  if (!R || R.stage !== 'do') return;
  const n = el.dataset.n, k = el.dataset.k;
  R.ans[n] = R.ans[n] === k ? '' : k;
  rerender();
});
on('lt-multi', (el) => {
  if (!R || R.stage !== 'do') return;
  const n = el.dataset.n, k = el.dataset.k, pick = Number(el.dataset.pick);
  const cur = R.ans[n] || [];
  R.ans[n] = cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= pick ? [...cur.slice(1), k] : [...cur, k];
  rerender();
});
on('lt-next-part', async () => {
  if (R.mode === 'exam' && A.url && !R.ended[A.n] && !(await confirmSheet({ title: 'Sang Part tiếp?', body: 'Part này chưa nghe hết. Khi đã sang Part sau thì không quay lại nghe được.', okLabel: 'Sang Part tiếp' }))) return;
  stopAudio();
  R.pi++;
  loadPart(R.parts[R.pi]);
  rerender(true);
});
on('lt-prev-part', () => { if (R.mode === 'exam' && !R.review) return; stopAudio(); R.pi--; loadPart(R.parts[R.pi]); rerender(true); });
on('lt-submit', async () => {
  // Chưa trả lời câu nào (bấm nhầm): không nộp, không lưu vào lịch sử.
  const any = Object.values(R.ans).some((v) => (Array.isArray(v) ? v.length : String(v || '').trim()));
  if (!any) { toast('Bạn chưa trả lời câu nào. Bài chỉ được nộp và lưu khi có ít nhất 1 câu trả lời.'); return; }
  // Câu chọn nhiều đáp án lưu ở số đầu nhóm: thiếu bao nhiêu chữ cái thì tính bấy nhiêu câu trống.
  let blank = 0;
  for (const pn of R.parts) for (const g of R.test.parts.find((p) => p.n === pn).groups) {
    if (g.t === 'multi') blank += Math.max(0, g.pick - (R.ans[g.nums[0]] || []).length);
    else blank += groupNums(g).filter((n) => !String(R.ans[n] || '').trim()).length;
  }
  if (!(await confirmSheet({ title: 'Nộp bài?', body: blank ? `Còn ${blank} câu bỏ trống. Trong bài thi không bị trừ điểm khi đoán, nên điền hết.` : 'Nộp để xem điểm và chữa bài.', okLabel: 'Nộp bài' }))) return;
  stopAudio();
  const g = gradeAll(R.test, R.parts, R.ans);
  const byType = {}, whys = {};
  for (const r of Object.values(g.res)) {
    const b = byType[r.type] || (byType[r.type] = { n: 0, ok: 0 });
    b.n++; if (r.ok) b.ok++; else whys[r.why] = (whys[r.why] || 0) + 1;
  }
  const full = g.total >= 38 && R.parts.length === 4;
  R.result = { ...g, byType, whys, band: full ? bandOf(g.score) : 0 };
  R.stage = 'done';
  R.review = true;
  R.played = {};
  R.pi = 0;
  loadPart(R.parts[0]);
  const id = 'R:' + uid();
  await ltPut({ id, kind: 'attempt', test: R.test.id, title: R.test.title, date: today(), at: Date.now(), mode: R.mode, rate: rate(), parts: R.parts, score: g.score, total: g.total, band: R.result.band, ans: R.ans, byType, whys });
  await logGrammarDay('lSets', id);
  rerender(true);
});
on('lt-review-part', (el) => { stopAudio(); R.played = {}; R.pi = Number(el.dataset.i); loadPart(R.parts[R.pi]); rerender(true); });
on('lt-quit', async () => {
  if (R && R.stage === 'do' && Object.keys(R.ans).length && !(await confirmSheet({ title: 'Thoát bài đang làm?', body: 'Các câu đã trả lời sẽ không được lưu.', okLabel: 'Thoát', danger: true }))) return;
  stopAudio();
  const id = R?.test.id;
  R = null;
  back(id ? `#/ltest/${encodeURIComponent(id)}` : '#/listening');
});
on('lt-open-att', (el) => {
  const a = S.ltest.get(el.dataset.id), t = a && S.ltest.get(a.test);
  if (!t) { toast('Đề của lần làm này không còn trên máy'); return; }
  R = { test: t, parts: a.parts, pi: 0, mode: a.mode, ans: a.ans || {}, played: {}, ended: {}, stage: 'done', review: true, result: null };
  const g = gradeAll(t, a.parts, R.ans);
  R.result = { ...g, byType: a.byType, whys: a.whys, band: a.band };
  loadPart(a.parts[0]);
  go('#/lrun');
});

function audioBox() {
  const free = R.mode === 'practice' || R.review;
  const done = R.mode === 'exam' && !R.review && R.ended[A.n];
  if (!A.url) return '<div class="card lt-audio"><p class="small muted">Part này không có file nghe.</p></div>';
  // Khung nghe gọn một hàng, kích thước cố định (không đổi khi bàn phím mở để câu hỏi bên dưới không bị xô lệch).
  return `<div class="card lt-audio"><div class="lt-arow">${done ? '<b class="small lt-done">Đã nghe xong Part này</b>' : `<button class="btn soft lt-playbtn" id="lt-play" data-act="lt-play">${playLabel()}</button>`}
      ${free ? `<button class="btn ghost lt-sm" data-act="lt-seek" data-d="-5" aria-label="Lùi 5 giây">−5″</button><button class="btn ghost lt-sm" data-act="lt-seek" data-d="5" aria-label="Tới 5 giây">+5″</button>` : ''}
      <button class="btn ghost lt-sm lt-rate ${rate() !== 1 ? 'on' : ''}" data-act="lt-rate" aria-label="Tốc độ nghe">${rateLabel()}</button></div>
    <div class="lt-brow"><div class="progress lt-bar" id="lt-bar"><i style="width:0%"></i></div><span class="small muted" id="lt-time">0:00 / –:––</span></div></div>
    ${R.mode === 'exam' && !R.review ? `<p class="small faint lt-anote">Như thi: nghe 1 lần, không tua. Đọc trước câu hỏi trong lúc chờ.${rate() !== 1 ? ` Đang nghe ở tốc độ ${rateLabel()}.` : ''}</p>` : ''}`;
}
function gapInput(n) {
  const r = R.result?.res[n];
  const v = R.ans[n] || '';
  if (!r) return `<input class="lt-gap" data-in="lt-in" data-n="${n}" value="${esc(v)}" placeholder="${n}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" ${R.stage === 'done' ? 'readonly' : ''}>`;
  return `<span class="lt-ans ${r.ok ? 'ok' : 'no'}"><b class="lt-n">${n}</b>${v ? esc(v) : '<i>trống</i>'}${r.ok ? '' : ` <span class="lt-right">→ ${esc(r.right)}</span>`}</span>`;
}
function markOf(n) {
  const r = R.result?.res[n];
  if (!r) return '';
  return r.ok ? `<span class="lt-mark ok">${icon('check', 'sm')}</span>` : `<span class="lt-mark no">${esc(WHY[r.why] || '')}${r.right ? ` · đáp án ${esc(r.right)}` : ''}</span>`;
}
function groupHtml(g) {
  const head = `<p class="lt-qhead">Câu ${g.from}–${g.to}</p>${g.instr.length ? `<div class="lt-instr">${g.instr.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}`;
  const done = R.stage === 'done';
  if (g.t === 'fill') {
    const html = g.html.replace(/<span data-gap="(\d+)"><\/span>/g, (_, n) => gapInput(Number(n)));
    const whyList = done ? g.gaps.map((n) => R.result.res[n]).filter((r) => r && !r.ok && ['spell', 'plural', 'limit'].includes(r.why)) : [];
    return `<div class="lt-group">${head}<div class="lt-fill">${html}</div>${whyList.length ? `<p class="small lt-bad" style="margin-top:6px">${g.gaps.filter((n) => { const r = R.result.res[n]; return r && !r.ok && ['spell', 'plural', 'limit'].includes(r.why); }).map((n) => `Câu ${n}: ${WHY[R.result.res[n].why]}`).join(' · ')}</p>` : ''}</div>`;
  }
  const chip = (n, k, on, act, extra = '') => {
    const r = R.result?.res[n];
    let cls = on ? 'on' : '';
    if (done && r) { const right = String(r.right).split(', ').includes(k); cls = right ? 'right' : on ? 'wrong' : 'dim'; }
    return `<button class="lt-chip ${cls}" data-act="${act}" data-n="${n}" data-k="${k}" ${extra} ${done ? 'disabled' : ''}>${k}</button>`;
  };
  if (g.t === 'mcq') {
    return `<div class="lt-group">${head}${g.title ? `<h4 class="lt-title">${esc(g.title)}</h4>` : ''}${g.qs.map((q) => `<div class="lt-q"><p><b>${q.n}</b> ${esc(q.q)} ${markOf(q.n)}</p>
      ${q.opts.map((o) => `<div class="lt-opt">${chip(q.n, o.k, R.ans[q.n] === o.k, 'lt-choose')}<span>${esc(o.t)}</span></div>`).join('')}</div>`).join('')}</div>`;
  }
  if (g.t === 'multi') {
    const n = g.nums[0], sel = R.ans[n] || [];
    const r = R.result?.res[n];
    return `<div class="lt-group">${head}<div class="lt-q">${g.opts.map((o) => `<div class="lt-opt">${chip(n, o.k, sel.includes(o.k), 'lt-multi', `data-pick="${g.pick}"`)}<span>${esc(o.t)}</span></div>`).join('')}
      <p class="small muted" style="margin-top:6px">Chọn ${g.pick} chữ cái · đã chọn ${sel.length}${done && r ? ` · đúng ${g.nums.filter((x) => R.result.res[x]?.ok).length}/${g.pick} (đáp án ${esc(r.right)})` : ''}</p></div></div>`;
  }
  // nối: chọn chữ cái cho từng mục
  const hs = (at) => g.heads.filter((h) => h.at === at).map((h) => `<p class="lt-sub">${esc(h.t)}</p>`).join('');
  return `<div class="lt-group">${head}${hs('top')}<div class="lt-optbox">${g.opts.map((o) => `<p><b>${o.k}</b> ${esc(o.t)}</p>`).join('')}</div>${hs('mid')}
    ${g.items.map((x) => `<div class="lt-q"><p><b>${x.n}</b> ${esc(x.t)} ${markOf(x.n)}</p><div class="lt-chips">${g.opts.map((o) => chip(x.n, o.k, R.ans[x.n] === o.k, 'lt-choose')).join('')}</div></div>`).join('')}</div>`;
}
export function runView() {
  if (!R) return `<div class="page">${navBar('Listening', { fallback: '#/listening' })}<div class="card empty"><h3>Bài đã kết thúc</h3><p>Mở lại đề từ trang Listening.</p></div></div>`;
  const n = R.parts[R.pi], part = R.test.parts.find((p) => p.n === n);
  const top = `<div class="ses-top"><button class="iconbtn" data-act="lt-quit" aria-label="Thoát">${icon('x')}</button><b class="sp-title">${esc(R.test.title)} · Part ${n}</b>${R.parts.length > 1 ? `<span class="count">${R.pi + 1}/${R.parts.length}</span>` : ''}</div>`;
  let summary = '';
  if (R.stage === 'done') {
    const res = R.result;
    const types = Object.entries(res.byType || {}).map(([k, v]) => `<div class="row-between ls-catline"><span>${TYPE_NAME[k] || k}</span><b>${v.ok}/${v.n}</b></div>`).join('');
    const whys = Object.entries(res.whys || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${WHY[k] || k} ${v}`).join(' · ');
    const perPart = R.parts.map((pn, i) => { const l = Object.values(res.res).filter((r) => r.part === pn); return `<button class="lt-pchip ${i === R.pi ? 'on' : ''}" data-act="lt-review-part" data-i="${i}">Part ${pn}<b>${l.filter((r) => r.ok).length}/${l.length}</b></button>`; }).join('');
    summary = `<div class="tiles sp-tiles"><div class="tile"><b>${res.score}/${res.total}</b><span>câu đúng</span></div>${res.band ? `<div class="tile"><b>${res.band}</b><span>band ước lượng</span></div>` : `<div class="tile"><b>${Math.round((res.score / Math.max(1, res.total)) * 100)}%</b><span>đúng</span></div>`}</div>
      ${res.band ? '' : '<p class="small faint" style="margin-top:6px">Band chỉ tính khi làm cả đề 40 câu.</p>'}
      ${whys ? `<p class="small muted" style="margin-top:8px">Câu sai: ${esc(whys)}</p>` : ''}
      ${types ? `<div class="card" style="margin-top:10px">${types}</div>` : ''}
      ${R.parts.length > 1 ? `<div class="lt-pchips">${perPart}</div>` : ''}
      <p class="small muted" style="margin-top:10px">Nghe lại Part ${n} (tua được) và xem đáp án từng câu bên dưới.</p>`;
  }
  const body = `${summary}${audioBox()}${part.groups.map(groupHtml).join('')}${R.stage === 'done' ? reviewHtml(part) + transcriptHtml(n) : ''}`;
  let actions;
  if (R.stage === 'done') actions = `<div class="btn-row"><button class="btn ghost" data-act="lt-quit">Xong</button>${R.pi + 1 < R.parts.length ? `<button class="btn" data-act="lt-review-part" data-i="${R.pi + 1}">Xem Part ${R.parts[R.pi + 1]}</button>` : ''}</div>`;
  else if (R.pi + 1 < R.parts.length) actions = `<div class="btn-row">${R.mode === 'practice' && R.pi ? '<button class="btn ghost" data-act="lt-prev-part" style="flex:.6">Part trước</button>' : ''}<button class="btn" data-act="lt-next-part">Sang Part ${R.parts[R.pi + 1]}</button></div>`;
  else actions = `<div class="btn-row">${R.mode === 'practice' && R.pi ? '<button class="btn ghost" data-act="lt-prev-part" style="flex:.6">Part trước</button>' : ''}<button class="btn" data-act="lt-submit">Nộp bài</button></div>`;
  setTimeout(syncBar, 0);
  return { html: `<div class="page session lt-page">${top}<div class="ses-body">${body}</div><div class="ses-actions">${actions}</div></div>` };
}

// ---------------------------------------------------------------- Chữa bài: lời thoại, vì sao chọn, bẫy, paraphrase
const plain = (h) => { const d = document.createElement('div'); d.innerHTML = h; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
/** Nội dung câu hỏi số n (để hiện khi chữa và để gửi AI). */
export function qInfo(t, n) {
  for (const p of t.parts) for (const g of p.groups) {
    if (g.t === 'fill' && g.gaps.includes(n)) {
      const chunks = g.html.split(/<\/(?:p|li|div|h4)>/);
      const c = chunks.find((x) => x.includes(`data-gap="${n}"`)) || '';
      return { part: p.n, g, text: plain(c.replace(/<\/small>/g, ': ').replace(new RegExp(`<span data-gap="${n}"></span>`), ' [ ___ ] ').replace(/<span data-gap="\d+"><\/span>/g, ' … ')), instr: g.instr.join(' ') };
    }
    if (g.t === 'mcq') { const q = g.qs.find((x) => x.n === n); if (q) return { part: p.n, g, text: q.q, opts: q.opts, instr: g.instr.join(' ') }; }
    if (g.t === 'match') { const x = g.items.find((y) => y.n === n); if (x) return { part: p.n, g, text: x.t, opts: g.opts, instr: g.instr.join(' ') }; }
    if (g.t === 'multi' && g.nums.includes(n)) return { part: p.n, g, text: g.q || g.instr.join(' '), opts: g.opts, instr: g.instr.join(' '), multi: g.nums };
  }
  return null;
}
const optText = (info, k) => info?.opts?.find((o) => o.k === k)?.t || '';
function noteHtml(note) {
  if (!note) return '';
  return `<div class="lt-note">${note.ai ? '<p class="small faint">AI giải thích · nên đối chiếu với lời thoại</p>' : ''}
    ${note.why ? `<p><b>Vì sao:</b> ${esc(note.why)}</p>` : ''}
    ${note.para?.length ? `<div class="lt-para"><b>Paraphrase</b>${note.para.map(([a, b]) => `<div><span>Đề: <i>${esc(a)}</i></span><span>Nghe: <i>${esc(b)}</i></span></div>`).join('')}</div>` : ''}
    ${note.trap ? `<p><b>Bẫy:</b> ${esc(note.trap)}</p>` : ''}
    ${note.tip ? `<p class="lt-tip">${icon('info', 'sm')} ${esc(note.tip)}</p>` : ''}</div>`;
}
function reviewHtml(part) {
  const t = R.test;
  const items = [];
  for (const g of part.groups) {
    const nums = groupNums(g);
    if (g.t === 'multi') items.push(nums); else nums.forEach((n) => items.push([n]));
  }
  const busy = R.aiBusy || {};
  const rows = items.map((nums) => {
    const n = nums[0];
    const rs = nums.map((x) => R.result.res[x]).filter(Boolean);
    if (!rs.length) return '';
    const okN = rs.filter((r) => r.ok).length;
    const info = qInfo(t, n);
    const r = rs[0];
    const label = nums.length > 1 ? `Câu ${nums[0]}–${nums[nums.length - 1]}` : `Câu ${n}`;
    const state = okN === rs.length ? `<span class="lt-mark ok">${icon('check', 'sm')} Đúng</span>` : `<span class="lt-mark no">${okN ? `Đúng ${okN}/${rs.length}` : esc(WHY[r.why] || 'Sai')}</span>`;
    const yours = r.your ? esc(r.your) + (info?.opts && r.your.length === 1 ? ` <span class="faint">(${esc(optText(info, r.your))})</span>` : '') : '<i>trống</i>';
    const right = esc(r.right) + (info?.opts && String(r.right).length === 1 ? ` <span class="faint">(${esc(optText(info, r.right))})</span>` : '');
    const ev = (t.tx?.ev?.[n] || []).filter((e) => e.part === part.n);
    const note = noteOf(t, n);
    const canAI = !note && aiReady(S.settings.ai);
    return `<div class="lt-rv ${okN === rs.length ? 'ok' : 'no'}" id="lt-rv-${n}"><div class="row-between"><b>${label}</b>${state}</div>
      ${info ? `<p class="small muted lt-rvq">${esc(info.text)}</p>` : ''}
      <p class="small">Bạn: <b>${yours}</b>${okN === rs.length ? '' : ` · Đáp án: <b class="lt-right">${right}</b>`}</p>
      ${ev.map((e) => `<blockquote class="lt-ev" data-act="lt-goto-tx" data-p="${e.part}" data-i="${e.i}" role="button">${e.html}</blockquote>`).join('')}
      ${noteHtml(note)}
      ${canAI ? `<button class="tag lt-aibtn" data-act="lt-ai" data-n="${n}" ${busy[n] ? 'disabled' : ''}>${busy[n] ? 'AI đang giải thích…' : `${icon('sparkle', 'sm')} Nhờ AI giải thích`}</button>` : ''}</div>`;
  }).join('');
  const hasTx = !!t.tx?.parts?.[part.n];
  return `<h4 class="sp-h">Chữa từng câu · Part ${part.n}</h4>
    ${!hasTx && !Object.keys(t.notes || {}).length ? `<p class="small muted" style="margin:0 2px 8px">Đề này chưa có lời thoại và giải thích. Thêm ở trang đề (nút “Thêm lời thoại / giải thích”).</p>` : ''}
    <div class="lt-rvlist">${rows}</div>`;
}
function transcriptHtml(pn) {
  const paras = R.test.tx?.parts?.[pn];
  if (!paras?.length) return '';
  return `<details class="lt-tx" id="lt-tx" ${R.txOpen ? 'open' : ''}><summary>Lời thoại Part ${pn}</summary>
    ${paras.map((x, i) => (x.sep ? '<hr>' : `<p id="lt-tp-${pn}-${i}">${x.html}</p>`)).join('')}
    <p class="small faint">Chữ in đậm/gạch chân: chỗ chứa đáp án. Bấm Q… để xem câu hỏi đó.</p></details>`;
}
function flash(el) { el.classList.remove('lt-flash'); void el.offsetWidth; el.classList.add('lt-flash'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
on('lt-goto-tx', (el) => {
  const d = document.getElementById('lt-tx');
  if (!d) return;
  R.txOpen = true;
  d.open = true;
  const p = document.getElementById(`lt-tp-${el.dataset.p}-${el.dataset.i}`);
  if (p) flash(p);
});
// Bấm mốc "Q12" trong lời thoại → tới câu 12 trong phần chữa.
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.lt-tx .lt-qb');
  if (!b) return;
  const n = (b.textContent.match(/\d+/) || [])[0];
  const el = n && (document.getElementById(`lt-rv-${n}`) || [...document.querySelectorAll('.lt-rv')].reverse().find((x) => Number(x.id.slice(6)) <= Number(n)));
  if (el) flash(el);
});
document.addEventListener('toggle', (e) => { if (e.target.id === 'lt-tx' && R) R.txOpen = e.target.open; }, true);
on('lt-ai', async (el) => {
  const n = Number(el.dataset.n), t = R?.test;
  if (!t) return;
  const info = qInfo(t, n);
  const nums = info?.multi || [n];
  const key = nums.map((x) => t.key[x]?.text ?? t.key[x]?.set?.join(', ')).filter(Boolean)[0] || '';
  const ev = (t.tx?.ev?.[n] || []).map((e) => plain(e.html));
  const paras = (t.tx?.parts?.[info?.part] || []).filter((x) => x.qs?.some((q) => nums.includes(q))).map((x) => plain(x.html));
  const prompt = `IELTS Listening, ${t.title}, Part ${info?.part}, câu ${nums.join(' & ')}.
Yêu cầu của đề: ${info?.instr || ''}
Câu hỏi: ${info?.text || ''}
${info?.opts ? 'Các lựa chọn:\n' + info.opts.map((o) => `${o.k}. ${o.t}`).join('\n') : ''}
Đáp án đúng: ${key}
Đoạn lời thoại chứa đáp án:
${(paras.length ? paras : ev).join('\n').slice(0, 3000) || '(không có lời thoại)'}

Hãy giải thích như một giám khảo IELTS cho người Việt học, bằng tiếng Việt, ngắn gọn. Trả về DUY NHẤT một JSON:
{"why": "vì sao đáp án đúng (trích câu trong lời thoại)", "para": [["cụm trong đề", "cụm tương ứng trong bài nghe"]], "trap": "bẫy/đáp án gây nhiễu và vì sao sai", "tip": "1 mẹo ngắn cho dạng câu này"}`;
  R.aiBusy = { ...(R.aiBusy || {}), [n]: true };
  rerender();
  try {
    const text = await askAI(S.settings.ai, prompt, { system: 'Bạn là giám khảo IELTS 10 năm kinh nghiệm, giải thích đáp án Listening cho học viên Việt Nam. Chỉ trả về JSON hợp lệ, không thêm chữ nào khác.' });
    const json = JSON.parse((text.match(/\{[\s\S]*\}/) || ['{}'])[0]);
    const note = cleanNote({ ...json, ai: true });
    if (!note) throw new Error('AI trả về không đúng định dạng');
    const k = nums.length > 1 ? `${nums[0]}-${nums[nums.length - 1]}` : String(n);
    const upd = { ...t, notes: { ...(t.notes || {}), [k]: note } };
    await ltPut(upd);
    R.test = upd;
  } catch (e) {
    console.error(e);
    toast(e?.message || 'AI chưa giải thích được', 'bad');
  } finally {
    delete R.aiBusy[n];
    rerender();
  }
});

// ---------------------------------------------------------------- Mục trên trang Listening
export function ltestCard() {
  const list = tests();
  const rows = list.map((t) => {
    const att = attempts(t.id);
    const best = att.filter((a) => a.total === 40).reduce((m, a) => Math.max(m, a.band), 0);
    return `<div class="wrow" data-act="go" data-to="#/ltest/${encodeURIComponent(t.id)}" role="button"><span class="num ${best ? 'done' : ''}">${best || '–'}</span><div class="body"><span style="font-weight:600">${esc(t.title)}</span><p>${t.n} câu · ${att.length ? `đã làm ${att.length} lần` : 'chưa làm'}</p></div>${icon('chev')}</div>`;
  }).join('');
  return `<h2>Đề thật của bạn</h2>${list.length ? `<div class="wlist">${rows}</div>` : ''}
    <button class="listlink" style="margin-top:${list.length ? 8 : 0}px" data-act="go" data-to="#/limport"><span class="lead">${icon('plus')}</span><span class="body"><b>Nhập đề</b><small>File đề .html (câu hỏi + đáp án) và file nghe từng Part · chỉ lưu trên máy</small></span>${icon('chev')}</button>`;
}
