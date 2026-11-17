// Tab Game + trò "Săn từ" (Reading).
//  Câu điền từ: (1) đoán loại từ cho chỗ trống, (2) chạm đúng từ cần điền trong đoạn văn chứa đáp án, né bẫy,
//  (3) xem câu chứa đáp án, cặp paraphrase, bẫy, rồi cất từ vào túi từ vựng.
//  Câu TRUE/FALSE/NOT GIVEN: chọn đáp án rồi chạm cụm làm bằng chứng.
//  Dữ liệu: các đề Reading trong app (content/reading/*.json): câu hỏi, đáp án, vị trí câu chứa đáp án, cặp paraphrase,
//  lời giải 4 bước (có loại từ ở Bước 1 và bẫy sau dấu ⚠️).
//  Câu sai quay lại các lượt sau cho tới khi đúng 2 lần liên tiếp. Mỗi lượt tính vào chuỗi ngày học, không tính vào mục tiêu Reading.
import { S, saveHunt, logGrammarDay } from './store.js';
import { esc, toast, uid, shuffle, speak } from './util.js';
import { icon, on, go, back, replace, rerender, navBar, confirmSheet } from './ui.js';
import { md, openWordSheet } from './reading.js';
import { gamePool, GAME_MIN } from './game.js';
import { trapStats } from './trap.js';

// ---------------------------------------------------------------- Linh vật (Mochi, Bolt) kiểu sticker
const INK = '#2B2240';
export function mochi(mood = 'calm', size = 58) {
  const eyes = mood === 'happy'
    ? `<path d="M22 31q5-5 10 0M36 31q5-5 10 0" fill="none" stroke="#1B1B1F" stroke-width="2.6" stroke-linecap="round"/>`
    : `<circle cx="27" cy="31" r="6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="43" cy="31" r="6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="28" cy="30" r="2.8" fill="#1B1B1F"/><circle cx="44" cy="30" r="2.8" fill="#1B1B1F"/>`;
  const mouth = mood === 'happy' ? `<path d="M27 40q7 9 14 0z" fill="#7A2E14" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
    : mood === 'oops' ? `<ellipse cx="35" cy="44" rx="3" ry="3.6" fill="#7A2E14"/>` : `<path d="M30 41q5 4 10 0" fill="none" stroke="#7A2E14" stroke-width="2.2" stroke-linecap="round"/>`;
  return `<svg class="hn-mascot" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 12c-1-6 3-9 8-9-1 5-3 8-8 9z" fill="#3E9B6B" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <rect x="21" y="52" width="8" height="10" rx="4" fill="#C9603A" stroke="${INK}" stroke-width="1.6"/><rect x="35" y="52" width="8" height="10" rx="4" fill="#C9603A" stroke="${INK}" stroke-width="1.6"/>
    <ellipse cx="32" cy="35" rx="23" ry="22" fill="#F08A5D" stroke="${INK}" stroke-width="2.4"/>
    <ellipse cx="34" cy="43" rx="13" ry="9" fill="#FBD3B8"/>${eyes}${mouth}
    <ellipse cx="19" cy="38" rx="3.5" ry="2.2" fill="#FF8FB1"/><ellipse cx="49" cy="38" rx="3.5" ry="2.2" fill="#FF8FB1"/></svg>`;
}
export function bolt(mood = 'calm', size = 58) {
  const eyes = mood === 'dizzy'
    ? `<path d="M24 25l7 7M31 25l-7 7M37 25l7 7M44 25l-7 7" stroke="#FF8FB1" stroke-width="2.6" stroke-linecap="round"/>`
    : mood === 'happy' ? `<path d="M23 30q5-5 10 0M35 30q5-5 10 0" fill="none" stroke="#7FE3C4" stroke-width="2.6" stroke-linecap="round"/>`
      : `<circle cx="28" cy="28.5" r="4" fill="#7FE3C4"/><circle cx="42" cy="28.5" r="4" fill="#7FE3C4"/>`;
  const mouth = mood === 'dizzy' ? `<ellipse cx="33" cy="46" rx="5" ry="3.5" fill="#C9D6F2" stroke="${INK}" stroke-width="1.4"/>` : `<path d="M25 44q8 5 16 0" fill="none" stroke="#C9D6F2" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg class="hn-mascot" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 12V5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="4.5" r="3.5" fill="#FFD84D" stroke="${INK}" stroke-width="1.6"/>
    <rect x="20" y="52" width="9" height="10" rx="3" fill="#2B3F6B" stroke="${INK}" stroke-width="1.6"/><rect x="35" y="52" width="9" height="10" rx="3" fill="#2B3F6B" stroke="${INK}" stroke-width="1.6"/>
    <rect x="10" y="12" width="44" height="42" rx="13" fill="#4A6FB5" stroke="${INK}" stroke-width="2.4"/>
    <rect x="16" y="20" width="34" height="17" rx="8.5" fill="#12203D"/>${eyes}${mouth}</svg>`;
}
const STAR = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.4.9-4.6 4.5 1.1 6.4L12 17.2l-5.8 3 1.1-6.4-4.6-4.5 6.4-.9z" fill="#FFD84D" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const FLAME = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1.3 4 6 6.3 6 11.5a6 6 0 0 1-12 0c0-2.4 1.2-3.8 2.4-4.8.2 1.8 1.2 2.8 2.2 3C10.4 8 11 5 12 2z" fill="#F08A5D" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- Dữ liệu: câu hỏi từ các đề Reading
const HD = { idx: null, items: new Map(), err: '' };
async function loadIndex() {
  if (HD.idx) return HD.idx;
  const r = await fetch('content/reading/index.json');
  if (!r.ok) throw new Error('index.json');
  HD.idx = (await r.json()).tests || [];
  return HD.idx;
}
async function loadItems(tid) {
  if (HD.items.has(tid)) return HD.items.get(tid);
  const t = (await loadIndex()).find((x) => x.id === tid);
  if (!t) return [];
  const r = await fetch(t.file);
  if (!r.ok) throw new Error(t.file);
  const items = buildItems(t, await r.json());
  HD.items.set(tid, items);
  return items;
}
const nw = (t) => String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9À-ɏ]+|[^a-z0-9À-ɏ]+$/gi, '');
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'or', 'is', 'are', 'was', 'were', 'it', 'its', 'that', 'this', 'for', 'with', 'by', 'as', 'at', 'be']);
const plainMd = (s) => String(s || '').replace(/\*\*|\*|`|>/g, '').replace(/\s+/g, ' ').trim();
const POS_NAME = { n: 'Danh từ', v: 'Động từ', a: 'Tính từ', num: 'Số', other: 'Từ loại khác' };
/** Loại từ của chỗ trống: lấy từ Bước 1 của lời giải ("→ **danh từ**"); đáp án là số thì là "Số". Không rõ thì bỏ bước đoán loại từ. */
function posOf(it, ans) {
  if (/^\d[\d.,:/]*$/.test(ans)) return { pos: 'num', why: 'Đáp án là một con số.' };
  const ex = String(it.exp || '');
  const m = ex.match(/\*\*([^*]{0,40}?(danh từ|động từ|tính từ|trạng từ|con số|số đếm|số)[^*]{0,30}?)\*\*/i);
  if (m) {
    const k = m[2].toLowerCase();
    const pos = k === 'danh từ' ? 'n' : k === 'động từ' ? 'v' : k === 'tính từ' ? 'a' : k === 'trạng từ' ? 'other' : 'num';
    const line = ex.split('\n').find((l) => l.includes(m[0])) || '';
    return { pos, why: plainMd(line).replace(/^Bước 1[^:]*:\s*/i, '') };
  }
  // Lời giải không ghi loại từ: chỉ suy ra khi chắc chắn (từ đứng trước/sau chỗ trống và đuôi của đáp án);
  // còn lưỡng lự (ví dụ "in response to ___ weather") thì bỏ bước đoán, không dạy sai.
  return posGuess(it.q, ans);
}
const DET = new Set(['the', 'a', 'an', 'its', 'their', 'his', 'her', 'our', 'your', 'my', 'this', 'these', 'those', 'that', 'some', 'many', 'few', 'several', 'own', 'of', 'in', 'on', 'for', 'by', 'with', 'from', 'about', 'into', 'between', 'among', 'any', 'no', 'each', 'every', 'more', 'less', 'such', 'both', 'all', 'other', 'various']);
const AFTER_N = new Set(['', 'of', 'and', 'or', 'that', 'which', 'who', 'were', 'are', 'is', 'was', 'in', 'on', 'for', 'to', 'from', 'with', 'by', 'as', 'at', 'than', 'have', 'has', 'had', 'can', 'could', 'will', 'would', 'may', 'might', 'should', 'must', 'being', 'became', 'become', 'rather', 'because', 'when', 'while', 'after', 'before', 'during', 'between', 'among', 'about', 'into', 'over', 'under', 'like', 'such']);
const NOUN_END = /(tion|sion|ment|ness|ity|ism|ance|ence|ship|ure|age|ery|hood|dom|ist|ology|graphy)s?$/;
const ADJ_END = /(ous|ful|ive|able|ible|ical|less|ish)$/;
function posGuess(q, ans) {
  const a = String(ans).trim().toLowerCase();
  if (/\s/.test(a)) return { pos: null, why: '' };
  const parts = String(q).split(/_{3,}|…{2,}|\.{4,}/);
  if (parts.length < 2) return { pos: null, why: '' };
  const prev = nw(parts[0].trim().split(/\s+/).pop() || '');
  const nextRaw = (parts[1].trim().split(/\s+/)[0] || '');
  const next = /^[.,;:!?)]/.test(nextRaw) ? '' : nw(nextRaw);
  if (ADJ_END.test(a) && !NOUN_END.test(a)) return { pos: 'a', why: `Đuôi “-${a.match(ADJ_END)[1]}” thường là tính từ${next && !AFTER_N.has(next) ? `, đứng trước danh từ “${next}”` : ''}.` };
  if (/ly$/.test(a)) return { pos: null, why: '' };
  if (DET.has(prev) && AFTER_N.has(next)) return { pos: 'n', why: `Sau “${prev}”${next ? ` và trước “${next}”` : ''} là chỗ của danh từ.` };
  if (NOUN_END.test(a) && (DET.has(prev) || AFTER_N.has(next))) return { pos: 'n', why: `Đuôi “-${a.match(NOUN_END)[1]}” là đuôi danh từ${DET.has(prev) ? `, lại đứng sau “${prev}”` : ''}.` };
  return { pos: null, why: '' };
}
/** Bẫy: các từ trong `…` sau dấu ⚠️ của lời giải (ví dụ “⚠️ `meat` là để ăn”). */
function trapsOf(exp) {
  const i = String(exp || '').indexOf('⚠');
  if (i < 0) return { words: [], note: '' };
  const tail = exp.slice(i);
  const words = new Set();
  for (const m of tail.matchAll(/`([^`]{1,60})`/g)) {
    for (const part of m[1].split(/,\s*|\s+(?:and|or|và|hoặc)\s+|\//)) {
      const ws = part.trim().split(/\s+/).map(nw).filter((w) => w && !STOP.has(w));
      if (ws.length && ws.length <= 2) ws.forEach((w) => words.add(w));
    }
  }
  return { words: [...words], note: tail.replace(/^⚠️?\s*/, '') };
}
function tokens(sents) {
  const out = [];
  sents.forEach((s, si) => String(s).split(/\s+/).filter(Boolean).forEach((t) => out.push({ t, si, n: nw(t) })));
  return out;
}
function findPhrase(toks, phrase, prefer) {
  const ws = String(phrase).split(/\s+/).map(nw).filter(Boolean);
  if (!ws.length) return null;
  const hits = [];
  for (let i = 0; i + ws.length <= toks.length; i++) if (ws.every((w, j) => toks[i + j].n === w)) hits.push(i);
  if (!hits.length) return null;
  const i = hits.find((x) => prefer.has(toks[x].si)) ?? hits[0];
  return Array.from({ length: ws.length }, (_, j) => i + j);
}
function buildItems(t, data) {
  const out = [];
  for (const p of data.passages || []) {
    for (const g of p.groups || []) {
      for (const it of g.items || []) {
        const loc = Array.isArray(it.loc) ? it.loc.filter((l) => Array.isArray(l) && p.paras?.[l[0]]) : [];
        if (!loc.length) continue;
        const pi = loc[0][0];
        const para = p.paras[pi];
        const sents = para.sents || [];
        const base = { key: `${t.id}|${p.id}|${it.n}`, test: t.title, tid: t.id, passage: p.title, pn: p.n, n: it.n, q: String(it.q || ''), para: para.label || String(pi + 1), exp: String(it.exp || ''), pairs: (it.pairs || []).filter((x) => Array.isArray(x) && x.length >= 2) };
        if (g.type === 'gap') {
          const toks = tokens(sents);
          const prefer = new Set(loc.filter((l) => l[0] === pi).map((l) => l[1]));
          let ans = null, idx = null;
          for (const a of it.a || []) { idx = findPhrase(toks, a, prefer); if (idx) { ans = a; break; } }
          if (!idx) continue;
          const traps = trapsOf(it.exp);
          const ansSet = new Set(idx.map((i) => toks[i].n));
          const trapIdx = toks.map((x, i) => (traps.words.includes(x.n) && !ansSet.has(x.n) ? i : -1)).filter((i) => i >= 0);
          const { pos, why } = posOf(it, ans);
          const plural = pos === 'n' && /[^s]s$/i.test(ans) && !/\s/.test(ans);
          out.push({ ...base, kind: 'gap', ans, alts: it.a, toks, idx, trapIdx, trapNote: traps.note, pos, posWhy: why, plural, limit: g.limit || '', sent: sents[toks[idx[0]].si] });
        } else if (g.type === 'tf') {
          const a = String((it.a || [])[0] || '').toUpperCase();
          if (!a) continue;
          const labels = /YES|NO\b/.test(a) || (g.items || []).some((x) => /^(YES|NO)$/i.test(String(x.a?.[0]))) ? ['YES', 'NO', 'NOT GIVEN'] : ['TRUE', 'FALSE', 'NOT GIVEN'];
          const good = new Set(loc.filter((l) => l[0] === pi).map((l) => l[1]));
          const phrases = [];
          sents.forEach((s, si) => String(s).split(/(?<=[,;:])\s+|\s+(?=[–—]\s)/).filter(Boolean).forEach((ph) => phrases.push({ t: ph, good: good.has(si) })));
          out.push({ ...base, kind: 'tf', ans: a, labels, phrases, evidence: !/NOT GIVEN/.test(a) && phrases.some((x) => x.good) });
        }
      }
    }
  }
  return out;
}

/** Dùng chung với trò Bẫy hay Thật. */
export const kit = { STAR: () => STAR, FLAME: () => FLAME, streakDays: () => streakDays() };
/** Dùng cho kiểm thử. */
export const _hn = { loadIndex, loadItems };

// ---------------------------------------------------------------- Chọn câu cho một lượt
const SIZE = 10;
const hunt = () => S.hunt || (S.hunt = { plays: 0, best: 0, wrong: {}, pos: {}, seen: {} });
const wrongKeys = () => Object.keys(hunt().wrong);
const ui = { src: 'all', kind: 'mix', speed: 'calm', onlyWrong: false };
async function pickCards({ src, kind, onlyWrong, keys }) {
  const idx = await loadIndex();
  const want = keys || (onlyWrong ? wrongKeys() : null);
  let tids;
  if (want) tids = [...new Set(want.map((k) => k.split('|')[0]))];
  else if (src !== 'all') tids = [src];
  else {
    // Tất cả đề: đề có câu đang chờ phục thù + vài đề ngẫu nhiên (không tải hết 30 đề một lúc).
    const w = [...new Set(wrongKeys().map((k) => k.split('|')[0]))].slice(0, 3);
    tids = [...new Set([...w, ...shuffle(idx.map((t) => t.id)).slice(0, 3)])];
  }
  const pool = (await Promise.all(tids.map((id) => loadItems(id).catch(() => [])))).flat()
    .filter((x) => kind === 'mix' || x.kind === kind);
  if (want) { const set = new Set(want); return shuffle(pool.filter((x) => set.has(x.key))).slice(0, SIZE); }
  const seen = hunt().seen, wr = hunt().wrong;
  const wrongFirst = shuffle(pool.filter((x) => x.key in wr)).slice(0, 4);
  const rest = shuffle(pool.filter((x) => !(x.key in wr))).sort((a, b) => (seen[a.key] || 0) - (seen[b.key] || 0));
  // Trộn đều hai dạng câu khi chọn "Trộn".
  const fresh = kind === 'mix' ? interleave(rest.filter((x) => x.kind === 'gap'), rest.filter((x) => x.kind === 'tf')) : rest;
  return shuffle([...wrongFirst, ...fresh.slice(0, SIZE - wrongFirst.length)]);
}
const interleave = (a, b) => { const out = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]); } return out; };

// ---------------------------------------------------------------- Lượt chơi
let H = null; // { id, cards, i, phase, score, combo, maxCombo, t0, res: [], posRes: [], saved: [] , pick…, dur, deadline }
let LAST = null; // tóm tắt lượt vừa xong (màn kết quả)
let timer = 0;
const durs = () => (ui.speed === 'exam' ? { guess: 6, find: 15, tf: 15 } : { guess: 8, find: 30, tf: 30 });
function startTimer(sec) {
  clearInterval(timer);
  H.dur = sec * 1000;
  H.deadline = Date.now() + H.dur;
  timer = setInterval(tick, 200);
}
function stopTimer() { clearInterval(timer); timer = 0; }
function tick() {
  if (!H || !location.hash.startsWith('#/hplay')) { stopTimer(); return; }
  const left = Math.max(0, H.deadline - Date.now());
  const bar = document.querySelector('#hn-timer i'), s = document.getElementById('hn-secs');
  if (bar) bar.style.width = `${(left / H.dur) * 100}%`;
  if (s) s.textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
  if (!left) { stopTimer(); onTimeout(); }
}
function onTimeout() {
  if (!H) return;
  const c = H.cards[H.i];
  if (H.phase === 'guess') choosePos(null);
  else if (H.phase === 'find') tapWord(-1);
  else if (H.phase === 'tf') chooseTf(null);
  else if (H.phase === 'tfev') tapPhrase(-1);
  void c;
}
function beginCard() {
  const c = H.cards[H.i];
  Object.assign(H, { pos: undefined, tap: undefined, tfPick: undefined, ev: undefined, saved1: false });
  if (c.kind === 'gap') { if (c.pos) { H.phase = 'guess'; startTimer(durs().guess); } else { H.phase = 'find'; startTimer(durs().find); } } else { H.phase = 'tf'; startTimer(durs().tf); }
}
function result(ok, extra = {}) {
  const c = H.cards[H.i];
  H.res[H.i] = { key: c.key, ok, kind: c.kind, n: c.n, ans: c.ans, ...extra };
  if (ok) { H.combo++; H.maxCombo = Math.max(H.maxCombo, H.combo); } else H.combo = 0;
}
function choosePos(p) {
  if (!H || H.phase !== 'guess') return;
  stopTimer();
  const c = H.cards[H.i];
  H.pos = p;
  const ok = p === c.pos;
  H.posRes.push({ pos: c.pos, ok });
  if (ok) H.score += 10;
  H.phase = 'guessDone';
  rerender();
}
function tapWord(i) {
  if (!H || H.phase !== 'find') return;
  stopTimer();
  const c = H.cards[H.i];
  H.tap = i;
  const kind = i < 0 ? 'timeout' : c.idx.includes(i) ? 'right' : c.trapIdx.includes(i) ? 'trap' : 'miss';
  H.tapKind = kind;
  if (kind === 'right') H.score += 20 + Math.min(4, H.combo) * 5;
  result(kind === 'right', { why: kind, picked: i >= 0 ? c.toks[i].t : '' });
  H.phase = 'findDone';
  rerender();
}
function chooseTf(v) {
  if (!H || H.phase !== 'tf') return;
  stopTimer();
  const c = H.cards[H.i];
  H.tfPick = v;
  if (v === c.ans) H.score += 10;
  if (c.evidence) { H.phase = 'tfev'; startTimer(durs().find); } else { result(v === c.ans, { why: v ? (v === c.ans ? 'right' : 'miss') : 'timeout', picked: v || '' }); H.phase = 'tfDone'; }
  rerender();
}
function tapPhrase(i) {
  if (!H || H.phase !== 'tfev') return;
  stopTimer();
  const c = H.cards[H.i];
  H.ev = i;
  const hit = i >= 0 && c.phrases[i].good;
  const ok = H.tfPick === c.ans;
  if (ok && hit) H.score += 20 + Math.min(4, H.combo) * 5;
  result(ok, { why: ok ? 'right' : H.tfPick ? 'miss' : 'timeout', picked: H.tfPick || '', ev: hit });
  H.phase = 'tfDone';
  rerender();
}
async function finish() {
  stopTimer();
  const P = H;
  H = null;
  const done = P.res.filter(Boolean);
  const h = hunt();
  if (done.length) {
    const now = Math.round(Date.now() / 1000);
    for (const r of done) {
      h.seen[r.key] = now;
      if (!r.ok) h.wrong[r.key] = 0;
      else if (r.key in h.wrong) { h.wrong[r.key]++; if (h.wrong[r.key] >= 2) delete h.wrong[r.key]; }
    }
    for (const r of P.posRes) { const s = h.pos[r.pos] || (h.pos[r.pos] = { n: 0, ok: 0 }); s.n++; if (r.ok) s.ok++; }
    h.plays++;
    h.best = Math.max(h.best, P.score);
    await saveHunt();
    await logGrammarDay('hSets', P.id); // tính vào chuỗi ngày học
  }
  LAST = { score: P.score, ok: done.filter((r) => r.ok).length, n: done.length, maxCombo: P.maxCombo, ms: Date.now() - P.t0, pos: P.posRes, saved: P.saved, wrong: done.filter((r) => !r.ok).map((r) => ({ ...r, card: P.cards.find((c) => c.key === r.key) })), counted: done.length > 0 };
  replace('#/hres');
}

on('hn-start', async (el) => {
  const keys = el.dataset.keys ? el.dataset.keys.split(',') : null;
  const opts = { src: el.dataset.src || ui.src, kind: el.dataset.kind || ui.kind, onlyWrong: el.dataset.wrong === '1' || (!el.dataset.kind && ui.onlyWrong), keys };
  toast('Đang chuẩn bị câu hỏi…');
  let cards;
  try { cards = await pickCards(opts); } catch (e) { console.error(e); toast('Chưa tải được đề Reading. Hãy mở app khi có mạng một lần.', 'bad'); return; }
  if (!cards.length) { toast(opts.onlyWrong ? 'Không còn câu sai nào để phục thù' : 'Chưa có câu phù hợp'); return; }
  H = { id: 'H:' + uid(), cards, i: 0, score: 0, combo: 0, maxCombo: 0, t0: Date.now(), res: [], posRes: [], saved: [] };
  beginCard();
  go('#/hplay');
});
on('hn-pos', (el) => choosePos(el.dataset.v));
on('hn-find', () => { if (H?.phase === 'guessDone') { H.phase = 'find'; startTimer(durs().find); rerender(true); } });
on('hn-word', (el) => tapWord(Number(el.dataset.i)));
on('hn-tf', (el) => chooseTf(el.dataset.v));
on('hn-ev', (el) => tapPhrase(Number(el.dataset.i)));
on('hn-explain', () => { if (H?.phase === 'findDone') { H.phase = 'fb'; rerender(true); } });
on('hn-next', async () => {
  if (!H) return;
  if (H.i + 1 < H.cards.length) { H.i++; beginCard(); rerender(true); } else await finish();
});
on('hn-quit', async () => {
  if (!H) { back('#/games'); return; }
  const done = H.res.filter(Boolean).length;
  if (!(await confirmSheet({ title: 'Dừng lượt săn?', body: done ? `Đã làm ${done} câu: kết quả được lưu và tính vào chuỗi ngày học.` : 'Chưa làm câu nào nên lượt này không được lưu.', okLabel: 'Dừng' }))) return;
  if (done) await finish(); else { stopTimer(); H = null; back('#/games'); }
});
on('hn-say', (el) => speak(el.dataset.w, { lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName }));
on('hn-save', (el) => {
  const c = H?.cards[H.i];
  if (!c) return;
  const w = el.dataset.w;
  openWordSheet(w, c.sent || '', `${c.test} · ${c.passage}`, { pos: { n: 'noun', v: 'verb', a: 'adjective' }[c.pos] || '' });
  // (bảng lưu từ của Reading: tra nghĩa, kiểm tra trùng từ đã có)
  if (!H.saved.includes(w)) H.saved.push(w);
});
on('hn-set', (el) => { ui[el.dataset.k] = el.dataset.v; rerender(); });
on('hn-src', (el) => { ui.src = el.value; rerender(); });
on('hn-wrong', () => { ui.onlyWrong = !ui.onlyWrong; rerender(); });

// ---------------------------------------------------------------- Màn hình
const hud = (c) => {
  const dots = H.cards.map((_, i) => `<span class="hn-dot ${i < H.i ? (H.res[i]?.ok ? 'ok' : 'no') : i === H.i ? 'cur' : ''}"></span>`).join('');
  const timed = ['guess', 'find', 'tf', 'tfev'].includes(H.phase);
  return `<div class="hn-top"><button class="hn-x" data-act="hn-quit" aria-label="Thoát">${icon('x')}</button>
    ${timed ? `<div class="hn-timer" id="hn-timer"><i style="width:${Math.max(0, (H.deadline - Date.now()) / H.dur) * 100}%"></i></div><span class="hn-pill sm" id="hn-secs">0:${String(Math.ceil(Math.max(0, H.deadline - Date.now()) / 1000)).padStart(2, '0')}</span>` : `<div class="hn-dots">${dots}</div>`}</div>
    <div class="hn-hud"><span class="hn-pill">${STAR}${H.score}</span><span class="hn-meta">${esc(c.test.replace('Cambridge ', 'Cam '))} · P${c.pn} · câu ${c.n}</span><span class="hn-pill peach">${FLAME}×${Math.max(1, H.combo)}</span></div>`;
};
const gapLine = (c, inner) => esc(c.q).replace(/_{3,}|…{2,}|\.{4,}/, inner);
const bubble = (svg, text) => `<div class="hn-say">${svg}<div class="hn-bub">${text}</div></div>`;
const panel = (bg, svg, title, body, btn) => `<div class="hn-panel" style="background:${bg}"><div class="hn-ptitle">${svg || ''}<b>${title}</b></div>${body ? `<p>${body}</p>` : ''}${btn}</div>`;
const bigBtn = (act, label, extra = '') => `<button class="hn-btn" data-act="${act}" ${extra}>${label}</button>`;

function guessView(c) {
  const done = H.phase === 'guessDone';
  const opts = [['n', '#8EE3C8', 'feathers, soil'], ['v', '#FFC9A8', 'grow, eat'], ['a', '#FFB3CB', 'soft, rare'], ['num', '#BFE3FF', '1800, 64']];
  const tiles = opts.map(([v, bg, ex]) => {
    const cls = !done ? '' : v === c.pos ? 'right' : v === H.pos ? 'wrong' : 'dim';
    return `<button class="hn-tile ${cls}" style="background:${bg}" data-act="hn-pos" data-v="${v}" ${done ? 'disabled' : ''}>${POS_NAME[v]}<small>${ex}</small></button>`;
  }).join('');
  const ok = H.pos === c.pos;
  const plural = c.plural ? ' số nhiều' : '';
  return `${hud(c)}
    <div class="hn-card"><span class="hn-tag" style="background:#C7B8FF">Câu ${c.n} · đoán loại từ</span>
      <p class="hn-q">${gapLine(c, '<span class="hn-gap">?</span>')}</p>${c.limit ? `<span class="hn-lim">${esc(c.limit)}</span>` : ''}</div>
    ${done ? '' : bubble(mochi('calm'), 'Chỗ trống này cần loại từ gì nhỉ?')}
    <div class="hn-tiles">${tiles}</div>
    ${done ? panel(ok ? '#D9F7EC' : '#FFE1EC', mochi(ok ? 'happy' : 'oops', 48), ok ? `Chuẩn! ${POS_NAME[c.pos].toLowerCase()}${plural} · +10` : H.pos ? `Cần ${POS_NAME[c.pos].toLowerCase()}${plural}` : `Hết giờ · cần ${POS_NAME[c.pos].toLowerCase()}${plural}`, esc(c.posWhy) + (c.plural ? ' Nhớ đuôi <b>-s</b>!' : ''), bigBtn('hn-find', 'Đi săn trong bài →')) : ''}`;
}
function findView(c) {
  const done = H.phase === 'findDone';
  const words = c.toks.map((t, i) => {
    let cls = 'hn-w';
    if (done) {
      if (c.idx.includes(i)) cls += ' right';
      else if (i === H.tap) cls += H.tapKind === 'trap' ? ' trap' : ' miss';
      else if (c.trapIdx.includes(i)) cls += ' trapmark';
    }
    return `<span class="${cls}${done ? ' off' : ''}" data-act="hn-word" data-i="${i}" role="button">${esc(t.t)}</span>`;
  }).join(' ');
  const hint = c.pairs[0] ? `Gợi ý của Bolt: tìm cụm nói lại “${esc(c.pairs[0][0])}”!` : 'Gợi ý của Bolt: tìm từ khoá của câu hỏi trong đoạn trước!';
  const V = {
    right: ['#D9F7EC', mochi('happy', 48), 'Bắt trúng rồi!', `Chuỗi ×${H.combo} · cộng thêm điểm chuỗi`],
    trap: ['#FFE1EC', bolt('dizzy', 48), `Sập bẫy “${esc(c.toks[H.tap]?.t.replace(/[^\p{L}\p{N}'-]/gu, '') || '')}”!`, 'Đáp án thật nằm ngay gần đó. Xem giải thích nhé.'],
    miss: ['#FFE1EC', bolt('dizzy', 48), 'Trượt mất rồi', `Đáp án là “${esc(c.ans)}”.`],
    timeout: ['#FFF0B8', bolt('calm', 48), 'Hết giờ!', `Đáp án là “${esc(c.ans)}”.`],
  }[H.tapKind] || [];
  return `${hud(c)}
    <div class="hn-strip">Tìm: ${gapLine(c, '<span class="hn-gap sm">?</span>')}${c.pos ? ` · <span class="faint">${POS_NAME[c.pos].toLowerCase()}${c.plural ? ' số nhiều' : ''}</span>` : c.limit ? ` · <span class="faint">${esc(c.limit)}</span>` : ''}</div>
    <div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">${esc(c.passage)} · đoạn ${esc(c.para)}</span><p class="hn-para">${words}</p></div>
    ${done ? panel(V[0], V[1], V[2], V[3], bigBtn('hn-explain', 'Xem giải thích')) : bubble(bolt('calm'), hint)}`;
}
function fbView(c) {
  const ok = H.tapKind === 'right';
  const picked = H.tap >= 0 ? c.toks[H.tap]?.t : '';
  // Câu chứa đáp án: tô đáp án, từ bẫy, và cụm paraphrase của bài.
  const si = c.toks[c.idx[0]].si;
  const pairWords = new Set(c.pairs.flatMap((p) => String(p[1]).split(/\s+/).map(nw)).filter((w) => w && !STOP.has(w)));
  const sent = c.toks.map((t, i) => ({ ...t, i })).filter((t) => t.si === si).map((t) => {
    const cls = c.idx.includes(t.i) ? 'ans' : c.trapIdx.includes(t.i) || t.i === H.tap ? 'trap' : pairWords.has(t.n) ? 'para' : '';
    return cls ? `<b class="hn-hl ${cls}">${esc(t.t)}</b>` : esc(t.t);
  }).join(' ');
  const pairs = c.pairs.length ? `<div class="hn-pairs">${c.pairs.map(([a, b]) => `<div><span>Đề: ${esc(a)}</span>${icon('chev')}<span>Bài: ${esc(b)}</span></div>`).join('')}</div>` : '';
  const trap = c.trapNote ? `<div class="hn-card hn-note" style="background:#FFF0B8"><span class="hn-tag" style="background:#FFFFFF">${ok ? 'Bẫy bạn đã né' : 'Vì sao là bẫy?'}</span><div class="md">${md(c.trapNote)}</div></div>` : '';
  const word = c.ans;
  return `<div class="hn-hero">${ok ? mochi('happy', 84) : bolt('dizzy', 84)}<div><p class="hn-big">${ok ? 'Bắt trúng!' : H.tapKind === 'trap' ? 'Sập bẫy rồi!' : H.tapKind === 'timeout' ? 'Hết giờ rồi!' : 'Trượt mất rồi'}</p>
      <p>${ok ? `<span class="hn-pill">${STAR}+${20 + Math.min(4, H.combo - 1) * 5}</span> <span class="hn-pill peach">${FLAME}×${H.combo}</span>` : `<span class="hn-pill pink">${picked ? `Bạn chạm “${esc(picked.replace(/[^\p{L}\p{N}'-]/gu, ''))}”` : 'Chưa chạm từ nào'}</span>`}</p></div></div>
    <div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">Câu trong bài</span><p class="hn-sent">${sent}</p>${pairs}</div>
    ${trap}
    <div class="hn-card"><span class="hn-tag" style="background:#FFD84D">${ok ? 'Từ mới nhặt được' : 'Đáp án'}</span>
      <div class="hn-wordrow"><div><p class="hn-word">${esc(word)}</p><p class="faint">${c.pos ? `${POS_NAME[c.pos].toLowerCase()}${c.plural ? ' số nhiều' : ''}` : 'đáp án'}${c.alts.length > 1 ? ` · chấp nhận: ${esc(c.alts.join(' / '))}` : ''}</p></div>
        <button class="hn-sq" data-act="hn-say" data-w="${esc(word)}" aria-label="Nghe phát âm">${icon('speaker')}</button></div>
      <button class="hn-btn ghost" data-act="hn-save" data-w="${esc(word)}">+ Cất vào túi từ vựng</button></div>
    <details class="hn-card hn-more"><summary>Lời giải đầy đủ</summary><div class="md">${md(c.exp.split('⚠')[0])}</div></details>`;
}
function tfView(c) {
  const picked = H.tfPick !== undefined;
  const BG = { TRUE: '#8EE3C8', YES: '#8EE3C8', FALSE: '#FFB3CB', NO: '#FFB3CB', 'NOT GIVEN': '#BFE3FF' };
  const btns = c.labels.map((l) => {
    const cls = !picked ? '' : l === c.ans ? 'right' : l === H.tfPick ? 'wrong' : 'dim';
    return `<button class="hn-tf ${cls}" style="background:${BG[l]}" data-act="hn-tf" data-v="${l}" ${picked ? 'disabled' : ''}>${l}</button>`;
  }).join('');
  const ev = H.phase === 'tfev' || (H.phase === 'tfDone' && c.evidence);
  const phrases = ev ? c.phrases.map((p, i) => {
    const cls = H.phase !== 'tfDone' ? '' : p.good ? 'right' : i === H.ev ? 'miss' : '';
    return `<span class="hn-w ph ${cls}${H.phase === 'tfDone' ? ' off' : ''}" data-act="hn-ev" data-i="${i}" role="button">${esc(p.t)}</span>`;
  }).join(' ') : '';
  const ok = H.tfPick === c.ans, hit = H.ev >= 0 && c.phrases[H.ev]?.good;
  const title = !H.tfPick ? `Hết giờ · đáp án ${c.ans}` : ok && (hit || !c.evidence) ? `Đúng${c.evidence ? ' cả hai' : ''}!` : ok ? 'Đáp án đúng, bằng chứng chưa trúng' : `Ối! Đáp án là ${c.ans}`;
  return `${hud(c)}
    <p class="hn-step">${H.phase === 'tf' ? 'Chọn nhanh nào!' : H.phase === 'tfev' ? 'Giờ chạm cụm làm bằng chứng' : ''}</p>
    <div class="hn-card"><span class="hn-tag" style="background:#C7B8FF">Câu ${c.n} · đúng hay sai?</span><p class="hn-q">${esc(c.q)}</p></div>
    <div class="hn-tfs">${btns}</div>
    ${ev ? `<div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">Đoạn ${esc(c.para)} · chạm bằng chứng</span><p class="hn-para">${phrases}</p></div>` : ''}
    ${H.phase === 'tfDone' ? panel(ok ? '#D9F7EC' : '#FFE1EC', ok ? mochi('happy', 48) : bolt('dizzy', 48), title, '', `<details class="hn-why"><summary>Xem lời giải</summary><div class="md">${md(c.exp)}</div></details>${bigBtn('hn-next', 'Câu tiếp →')}`) : ''}`;
}
export function playView() {
  if (!H) return { html: `<div class="page hn-scr">${navBar('Săn từ', { fallback: '#/games' })}<div class="hn-card" style="margin-top:20px"><p>Lượt chơi đã kết thúc.</p>${bigBtn('go', 'Về tab Game', 'data-to="#/games"')}</div></div>` };
  const c = H.cards[H.i];
  let body, actions = '';
  if (c.kind === 'gap') {
    if (H.phase === 'guess' || H.phase === 'guessDone') body = guessView(c);
    else if (H.phase === 'find' || H.phase === 'findDone') body = findView(c);
    else { body = fbView(c); actions = bigBtn('hn-next', H.i + 1 < H.cards.length ? 'Câu tiếp →' : 'Xem kết quả'); }
  } else body = tfView(c);
  return { html: `<div class="page session hn-scr hn-play ${H.phase === 'fb' ? (H.tapKind === 'right' ? 'win' : 'lose') : ''}"><div class="ses-body">${body}</div>${actions ? `<div class="ses-actions">${actions}</div>` : ''}</div>` };
}

export function resultView() {
  if (!LAST) return `<div class="page hn-scr">${navBar('Săn từ', { fallback: '#/games' })}<div class="hn-card" style="margin-top:20px"><p>Chưa có lượt nào vừa chơi.</p></div></div>`;
  const L = LAST;
  const mm = `${Math.floor(L.ms / 60000)}:${String(Math.floor(L.ms / 1000) % 60).padStart(2, '0')}`;
  const pos = {};
  for (const r of L.pos) { const s = pos[r.pos] || (pos[r.pos] = { n: 0, ok: 0 }); s.n++; if (r.ok) s.ok++; }
  const bars = Object.entries(pos).map(([k, v]) => `<div class="hn-barrow"><span>${POS_NAME[k]}</span><span class="hn-bar"><i style="width:${(v.ok / v.n) * 100}%;background:${v.ok === v.n ? '#8EE3C8' : '#FFC9A8'}"></i></span><b>${v.ok}/${v.n}</b></div>`).join('');
  const streak = streakDays();
  const wrong = L.wrong.slice(0, 5).map((r) => `<p><b>Câu ${r.n}</b> · đáp án <b>${esc(r.ans)}</b>${r.why === 'trap' ? ` · bạn dính bẫy “${esc(String(r.picked).replace(/[^\p{L}\p{N}'-]/gu, ''))}”` : r.why === 'timeout' ? ' · hết giờ' : r.picked ? ` · bạn chọn ${esc(String(r.picked).replace(/[^\p{L}\p{N}' -]/gu, ''))}` : ''}</p>`).join('');
  return `<div class="page hn-scr hn-res">
    <div class="hn-trophy">${mochi('happy', 70)}<svg width="92" height="92" viewBox="0 0 64 64" aria-hidden="true"><path d="M14 8h36v8a18 18 0 0 1-36 0z" fill="#FFD84D" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 12H6a8 8 0 0 0 9 10M50 12h8a8 8 0 0 1-9 10" fill="none" stroke="${INK}" stroke-width="2.4"/><rect x="27" y="34" width="10" height="10" fill="#FFD84D" stroke="${INK}" stroke-width="2.4"/><rect x="18" y="44" width="28" height="10" rx="3" fill="#C7B8FF" stroke="${INK}" stroke-width="2.4"/></svg>${bolt('happy', 70)}</div>
    <p class="hn-big center">Săn được ${L.ok}/${L.n}!</p>
    ${L.counted ? `<p class="center hn-sub">+1 ngày vào chuỗi học${streak ? ` · giờ là <span class="hn-pill sm peach">${streak} ngày</span>` : ''}</p>` : ''}
    <div class="hn-tiles3"><div style="background:#FFD84D"><b>${L.score}</b><span>điểm</span></div><div style="background:#FFC9A8"><b>×${L.maxCombo}</b><span>chuỗi dài nhất</span></div><div style="background:#BFE3FF"><b>${mm}</b><span>thời gian</span></div></div>
    ${bars ? `<div class="hn-card"><span class="hn-tag" style="background:#8EE3C8">Đoán loại từ</span>${bars}</div>` : ''}
    ${L.saved.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFD84D">Từ đã mở để cất</span><div class="hn-chips">${L.saved.map((w) => `<span>${esc(w)}</span>`).join('')}</div></div>` : ''}
    ${L.wrong.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFB3CB">${L.wrong.length} câu cần phục thù</span>${wrong}</div>` : ''}
    <div class="hn-row2">${bigBtn('go', 'Xong', 'data-to="#/games" style="flex:.75;background:#fff"')}${L.wrong.length ? bigBtn('hn-start', `Phục thù ${L.wrong.length} câu!`, `data-keys="${esc(L.wrong.map((r) => r.key).join(','))}" style="flex:1.25"`) : bigBtn('hn-start', 'Chơi lượt mới!', 'style="flex:1.25"')}</div>
  </div>`;
}
function streakDays() {
  let d = new Date(), n = 0;
  const key = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const active = (k) => { const x = S.days.get(k); if (!x) return false; return (x.newIds?.length || 0) + (x.reviewIds?.length || 0) + (x.correct || 0) + (x.wrong || 0) + ['gLessons', 'gReviews', 'wEssays', 'rPassages', 'sTurns', 'lSets', 'hSets'].reduce((a, f) => a + (x[f]?.length || 0), 0) > 0; };
  while (active(key(d)) && n < 3650) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------------------------------------------------------------- Chọn lượt chơi
export function setupView() {
  const idx = HD.idx;
  if (!idx) { loadIndex().then(() => rerender()).catch(() => { HD.err = 'Chưa tải được danh sách đề Reading.'; rerender(); }); }
  const seg = (k, opts) => `<div class="hn-seg">${opts.map(([v, l]) => `<button class="${ui[k] === v ? 'on' : ''}" data-act="hn-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const nw = wrongKeys().length;
  return `<div class="page hn-scr hn-setup">
    <div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Săn từ</h1><span class="hn-pill sm mint">Reading</span></div>
    <div class="hn-card" style="background:#FFF0B8">
      <div class="hn-stp"><span>1</span><p><b>Đoán loại từ</b> · nhìn chỗ trống</p></div>
      <div class="hn-stp"><span>2</span><p><b>Chạm từ cần điền</b> · né bẫy trong đoạn văn</p></div>
      <div class="hn-stp"><span>3</span><p><b>Nhặt từ</b> · cất vào túi từ vựng</p></div>
    </div>
    <p class="hn-lab">Nguồn câu</p>
    <div class="hn-card hn-src"><select class="hn-select" data-change="hn-src" aria-label="Nguồn câu"><option value="all">Tất cả đề (ngẫu nhiên)</option>${(idx || []).map((t) => `<option value="${esc(t.id)}" ${ui.src === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select></div>
    <p class="hn-lab">Dạng câu</p>${seg('kind', [['mix', 'Trộn'], ['gap', 'Điền từ'], ['tf', 'T / F / NG']])}
    <p class="hn-lab">Thời gian</p>${seg('speed', [['calm', 'Thong thả 30″'], ['exam', 'Như thi 15″']])}
    <div class="hn-card hn-toggle"><span><b>Chỉ câu đã sai</b><br><span class="faint">${nw ? `${nw} câu đang chờ phục thù` : 'Chưa có câu nào'}</span></span>
      <button class="hn-sw ${ui.onlyWrong ? 'on' : ''}" data-act="hn-wrong" aria-label="Chỉ câu đã sai" aria-pressed="${ui.onlyWrong}" ${nw ? '' : 'disabled'}><i></i></button></div>
    ${HD.err ? `<p class="hn-sub">${esc(HD.err)}</p>` : ''}
    <div class="hn-bottom">${bigBtn('hn-start', 'Bắt đầu săn!')}</div>
  </div>`;
}

// ---------------------------------------------------------------- Tab Game
export function gamesView() {
  const h = hunt();
  const acc = Object.values(h.pos || {}).reduce((a, v) => ({ n: a.n + v.n, ok: a.ok + v.ok }), { n: 0, ok: 0 });
  const nw = wrongKeys().length;
  const ready = gamePool().length >= GAME_MIN;
  const ts = trapStats();
  const card = (bg, ic, name, sub, right, act = '') => `<${act ? 'button' : 'div'} class="hn-game" style="background:${bg}" ${act}><span class="hn-gi">${ic}</span><span class="hn-gb"><b>${name}</b><small>${sub}</small></span>${right}</${act ? 'button' : 'div'}>`;
  const ICON = {
    hunt: `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="#BFE9FF" stroke="${INK}" stroke-width="2"/><path d="M15 15l5.5 5.5" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></svg>`,
    trap: `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 10a7 7 0 0 1 14 0c0 4-4 4.5-4 8.5a3 3 0 0 1-6 0" fill="#FFE1CF" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></svg>`,
    talk: `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="3" width="7" height="12" rx="3.5" fill="#FFD84D" stroke="${INK}" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/></svg>`,
    pen: `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16.5 4.5l3 3L8 19z" fill="#C7B8FF" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  };
  const mini = (to, bg, name) => `<button class="hn-mini" style="background:${bg}" data-act="go" data-to="${to}" ${ready || to === '#/match' || to === '#/pop' ? '' : ''}>${name}</button>`;
  return `<div class="page hn-scr hn-hub">
    <header class="hn-head"><div><p class="hn-eyebrow">Ôn từ đề thật · 3–5 phút</p><h1 class="hn-h">Game</h1></div>${streakDays() ? `<span class="hn-pill">${FLAME}${streakDays()} ngày</span>` : ''}</header>
    <div class="hn-card hn-daily"><div class="hn-dtop"><div><span class="hn-pill sm">Thử thách hôm nay</span><p class="hn-dtitle">10 câu Săn từ<br>trộn đề ngẫu nhiên</p><p class="hn-sub">${nw ? `Ưu tiên ${nw} câu bạn từng sai` : 'Điền từ và True/False/Not Given'}</p></div>${mochi('calm', 100)}</div>
      ${bigBtn('hn-start', 'Chơi ngay!', 'data-src="all" data-kind="mix"')}</div>
    <h2 class="hn-h2">4 trò chơi</h2>
    <div class="hn-games">
      ${card('#8EE3C8', ICON.hunt, 'Săn từ', 'Reading · tìm từ cần điền, né bẫy', `<span class="hn-gr">${acc.n ? `${Math.round((acc.ok / acc.n) * 100)}%` : '–'}</span>`, 'data-act="go" data-to="#/hunt"')}
      ${card('#FFC9A8', ICON.trap, 'Bẫy hay Thật <span class="hn-pill xs">MỚI</span>', ts.ready ? 'Listening · nghe đề thật, né bẫy' : 'Listening · cần nhập đề có lời thoại', `<span class="hn-gr">${ts.acc != null ? `${ts.acc}%` : '–'}</span>`, 'data-act="go" data-to="#/trap"')}
      ${card('#FFB3CB', ICON.talk, 'Nói 30 giây', 'Speaking · nói rồi học cụm mẫu', '<span class="hn-pill xs">Sắp có</span>')}
      ${card('#BFE3FF', ICON.pen, 'Ý tưởng 60 giây', 'Writing · ghép lại câu mẫu', '<span class="hn-pill xs">Sắp có</span>')}
    </div>
    <h2 class="hn-h2">Mini game từ vựng</h2>
    <div class="hn-minis">${mini('#/game', '#FFF0B8', 'Chạy &amp; Gõ')}${mini('#/drop', '#D9F7EC', 'Bắn Từ')}${mini('#/match', '#FFE1EC', 'Nối Cụm')}${mini('#/pop', '#E4EEFF', 'Nghe &amp; Chạm')}</div>
    ${ready ? '' : `<p class="hn-sub" style="margin-top:8px">Chạy &amp; Gõ và Bắn Từ cần học ít nhất ${GAME_MIN} từ.</p>`}
  </div>`;
}
