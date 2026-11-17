// Trò "Bẫy hay Thật" (Listening).
//  Lấy câu chứa đáp án trong lời thoại của các đề thật bạn đã nhập (Listening → Đề thật), giọng máy đọc lại câu đó.
//  Câu điền từ: Dễ = nhìn chữ, chạm đúng từ là đáp án, né từ bẫy; Vừa/Khó = chỉ nghe rồi gõ đáp án, xong mới hiện chữ.
//  Câu chọn chữ cái (A/B/C, nối, chọn 2): chọn đáp án khi nghe, rồi chạm cụm trong lời thoại làm bằng chứng.
//  Sau mỗi câu: vì sao chọn, bẫy, cặp paraphrase (lấy từ phần giải thích của đề nếu có).
//  Câu sai quay lại các lượt sau cho tới khi đúng 2 lần liên tiếp (dùng chung sổ câu sai với Săn từ).
import { S, saveHunt, logGrammarDay } from './store.js';
import { esc, toast, uid, shuffle } from './util.js';
import { icon, on, go, back, replace, rerender, confirmSheet } from './ui.js';
import { qInfo, noteOf, alternatives } from './ltest.js';
import { say, hush, pickVoice, numWords } from './listening.js';
import { mochi, bolt, kit } from './hunt.js';

// ---------------------------------------------------------------- Dữ liệu: câu hỏi từ đề thật đã nhập
const nt = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").replace(/[£$€]/g, '')
  .replace(/^[^a-z0-9]+|[^a-z0-9%]+$/g, '').replace(/[-–—]/g, ' ');
const NUMW = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'half', 'quarter']);
const isNum = (n) => /^\d/.test(n) || NUMW.has(n);
const letter = (s) => (String(s).toUpperCase().match(/\b[A-L]\b/) || [''])[0];
/** Câu chứa đáp án (HTML có <u> ở chỗ đáp án) → các từ, đánh dấu từ nằm trong phần gạch chân. */
function toks(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  const out = [];
  let cur = null;
  const tw = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    let u = false;
    for (let x = n.parentElement; x && x !== d; x = x.parentElement) if (x.tagName === 'U') u = true;
    for (const ch of n.nodeValue.replace(/\u00a0/g, ' ')) {
      if (/\s/.test(ch)) { cur = null; continue; }
      if (!cur) { cur = { t: '', u: false }; out.push(cur); }
      cur.t += ch;
      if (u && /[\p{L}\p{N}]/u.test(ch)) cur.u = true;
    }
  }
  return out.filter((x) => x.t).map((x) => ({ ...x, n: nt(x.t) }));
}
/** Vị trí (các chỉ số) của cụm `alt` trong câu; ưu tiên chỗ nằm trong phần gạch chân. */
function findAlt(T, alt) {
  const want = alt.split(' ').filter(Boolean).length;
  const hits = [];
  for (let i = 0; i < T.length; i++) {
    for (let len = 1; len <= Math.min(6, T.length - i); len++) {
      const w = T.slice(i, i + len).map((x) => x.n).filter(Boolean).join(' ');
      if (w === alt) { hits.push(Array.from({ length: len }, (_, j) => i + j)); break; }
      if (w.split(' ').length > want) break;
    }
  }
  return hits.find((h) => h.some((i) => T[i].u)) || hits[0] || null;
}
/** Các cách viết đáp án được chấp nhận, kèm cách đọc của số ("10" → "ten"). */
function altsOf(text) {
  const a = alternatives(text);
  for (const x of [...a]) if (/^\d{1,4}$/.test(x)) a.push(numWords(Number(x)).replace(/-/g, ' '));
  return [...new Set(a)];
}
/** Cụm trong ngoặc kép ở phần "Bẫy" của giải thích: "eight", "lots of pictures". */
const quoted = (s) => [...String(s || '').matchAll(/["“]([^"”]{1,50})["”]/g)].map((m) => nt(m[1].replace(/\s+/g, ' ')).replace(/[^a-z0-9' %]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);

function buildCards(t) {
  const out = [];
  if (!t.tx?.ev) return out;
  const tid = String(t.id).replace(/^X:/, '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  const short = t.title.replace(/Cambridge(\s+IELTS)?\s*/i, 'Cam ').replace(/Listening\s*/i, '').replace(/\s+/g, ' ').trim();
  const seen = new Set();
  for (const p of t.parts) for (const g of p.groups) {
    const nums = g.t === 'fill' ? g.gaps : g.t === 'mcq' ? g.qs.map((q) => q.n) : g.t === 'match' ? g.items.map((x) => x.n) : [g.nums[0]];
    for (const n of nums) {
      const k = t.key[n];
      const ev = (t.tx.ev[n] || []).find((e) => e.part === p.n) || t.tx.ev[n]?.[0];
      const info = qInfo(t, n);
      if (!k || !ev || !info || seen.has(n)) continue;
      const T = toks(ev.html);
      if (T.length < 3) continue;
      const note = noteOf(t, n);
      const base = { key: `lt-${tid}|p${p.n}|${n}`, tid: t.id, test: short, pn: p.n, n, q: info.text, instr: info.instr, T, say: T.map((x) => x.t).join(' ').replace(/\s*…\s*/g, ' ').trim(), note };
      if (g.t === 'fill') {
        const alts = altsOf(k.text);
        let idx = null;
        for (const a of alts) { idx = findAlt(T, a); if (idx) break; }
        if (!idx) { const u = T.map((x, i) => (x.u ? i : -1)).filter((i) => i >= 0); if (u.length && u.length <= 4) idx = u; }
        if (!idx) continue;
        const ansSet = new Set(idx);
        const trapIdx = new Set();
        for (const ph of quoted(note?.trap).filter((x) => x.length > 2 && !/^(a|an|the|of|to|and|or|in|on)$/.test(x))) { const h = findAlt(T, ph); if (h) h.forEach((i) => { if (!ansSet.has(i)) trapIdx.add(i); }); }
        if (idx.some((i) => isNum(T[i].n))) T.forEach((x, i) => { if (!ansSet.has(i) && isNum(x.n) && x.n !== 'one') trapIdx.add(i); });
        out.push({ ...base, kind: 'fill', ans: k.text, alts, idx, trapIdx: [...trapIdx], limit: g.limit?.words ? `Tối đa ${g.limit.words} từ${g.limit.num ? ' và/hoặc một số' : ''}` : '' });
      } else {
        const right = g.t === 'multi' ? (k.set || []) : [letter(k.text)];
        if (!right.length || !right[0] || !info.opts?.length) continue;
        if (g.t === 'multi') g.nums.forEach((x) => seen.add(x));
        const good = T.map((x, i) => (x.u ? i : -1)).filter((i) => i >= 0);
        out.push({ ...base, kind: 'pick', nums: g.t === 'multi' ? g.nums : [n], opts: info.opts, right, need: right.length, good });
      }
      seen.add(n);
    }
  }
  return out;
}
const tests = () => [...S.ltest.values()].filter((r) => r.kind === 'test' && r.tx?.ev && Object.keys(r.tx.ev).length).sort((a, b) => b.at - a.at);
const CACHE = new Map();
function cardsOf(t) {
  const sig = `${t.at}|${Object.keys(t.notes || {}).length}|${t.tx?.n}`;
  const c = CACHE.get(t.id);
  if (c?.sig === sig) return c.cards;
  const cards = buildCards(t);
  CACHE.set(t.id, { sig, cards });
  return cards;
}
/** Dùng cho kiểm thử. */
export const _tp = { buildCards, toks, cardsOf, get H() { return H; } };

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
/** Đọc câu chứa đáp án; lần đầu đọc xong thì mới bắt đầu tính giờ (Vừa/Khó). */
function play() {
  if (!H) return;
  const c = H.cards[H.i];
  if (H.heard >= lv().plays) { toast(H.level === 'hard' ? 'Mức Khó chỉ nghe 1 lần' : 'Đã nghe đủ 2 lần'); return; }
  const id = H.cardId;
  H.heard++;
  syncPlay(true);
  const ok = say(c.say, { voice: H.voice, rate: (S.settings.listenRate || 0.95) * lv().rate, onend: () => { if (H?.cardId === id) { syncPlay(false); if (!H.deadline && ['find', 'type', 'pick'].includes(H.phase)) startTimer(lv().sec); } } });
  if (!ok) { // máy không đọc được: hiện chữ luôn
    H.noVoice = true; H.heard = lv().plays;
    if (!H.deadline) startTimer(lv().sec);
    rerender();
  }
}
/** Cập nhật nút nghe ngay trên trang (không vẽ lại để không mất chữ đang gõ). */
function syncPlay(on) {
  const b = document.getElementById('tp-play');
  if (!b) return;
  b.classList.toggle('playing', on);
  const left = lv().plays - H.heard;
  b.querySelector('b').textContent = 'Câu trong bài nghe';
  b.querySelector('small').textContent = on ? 'Đang đọc…' : left > 0 && lv().plays < 9 ? `Nghe lại · còn ${left} lần` : lv().plays < 9 ? 'Đã hết lượt nghe' : 'Nghe lại';
  b.disabled = !on && left <= 0;
}
function beginCard() {
  const c = H.cards[H.i];
  hush();
  stopTimer();
  Object.assign(H, { cardId: uid(), heard: 0, tap: undefined, why: '', typed: '', picks: [], ev: undefined, voice: pickVoice(), noVoice: false });
  H.phase = c.kind === 'fill' ? (hidden() ? 'type' : 'find') : 'pick';
  // Mức Dễ: chữ đã hiện nên tính giờ ngay.
  if (!hidden()) startTimer(lv().sec);
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
  hush();
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
  if (c.good.length) { hush(); H.phase = 'ev'; startTimer(LV.easy.sec); } else { result(H.pickOk, { why: H.why, picked: H.picks.join(', ') }); H.phase = 'done'; }
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
  hush();
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
  LAST = { score: P.score, ok: done.filter((r) => r.ok).length, n: done.length, maxCombo: P.maxCombo, ms: Date.now() - P.t0, traps: done.filter((r) => r.why === 'trap').length, dodged: done.filter((r) => r.ok && P.cards.find((c) => c.key === r.key)?.trapIdx?.length).length, wrong: done.filter((r) => !r.ok), counted: done.length > 0, level: P.level };
  replace('#/tres');
}

on('tp-start', (el) => {
  const keys = el.dataset.keys ? el.dataset.keys.split(',') : null;
  const opts = { src: ui.src, part: ui.part, onlyWrong: ui.onlyWrong, keys };
  if (!tests().length) { go('#/trap'); return; }
  const cards = pickCards(opts);
  if (!cards.length) { toast(opts.onlyWrong ? 'Không còn câu sai nào để phục thù' : 'Chưa có câu phù hợp: đề cần có lời thoại'); return; }
  H = { id: 'T:' + uid(), cards, i: 0, level: ui.level, score: 0, combo: 0, maxCombo: 0, t0: Date.now(), res: [] };
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
  hush();
  if (!(await confirmSheet({ title: 'Dừng lượt chơi?', body: done ? `Đã làm ${done} câu: kết quả được lưu và tính vào chuỗi ngày học.` : 'Chưa làm câu nào nên lượt này không được lưu.', okLabel: 'Dừng' }))) return;
  if (done) await finish(); else { stopTimer(); H = null; back('#/games'); }
});
on('tp-replay', () => { const c = H?.cards[H.i]; if (c) say(c.say, { voice: H.voice, rate: S.settings.listenRate || 0.95 }); });
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
  return `<button class="tp-play" id="tp-play" data-act="tp-play" ${left <= 0 ? 'disabled' : ''}>${icon('speaker')}<span><b>${H.heard ? 'Câu trong bài nghe' : 'Sắp đọc…'}</b><small>${H.heard ? sub : 'Lắng nghe nhé'}</small></span></button>`;
}
/** Lời thoại: mỗi từ chạm được (data-act), hoặc che mờ khi chưa được nhìn. */
function words(c, act, mark, blur) {
  if (blur) return `<p class="hn-para tp-blur" aria-label="Lời thoại đang che">${c.T.map((x) => `<span>${'•'.repeat(Math.min(9, x.t.length))}</span>`).join(' ')}</p>`;
  return `<p class="hn-para">${c.T.map((x, i) => `<span class="hn-w ${mark ? mark(i) : ''}${act ? '' : ' off'}" ${act ? `data-act="${act}" data-i="${i}" role="button"` : ''}>${esc(x.t)}</span>`).join(' ')}</p>`;
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
    <div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">${st === 'ev' ? 'Chạm bằng chứng' : 'Lời thoại'}</span>${words(c, st === 'ev' ? 'tp-ev' : '', mark, !showText)}</div>
    ${st === 'done' ? panel(ok ? '#D9F7EC' : '#FFE1EC', ok ? mochi('happy', 48) : bolt('dizzy', 48), title, '', `${noteHtml(c.note)}${bigBtn('tp-next', H.i + 1 < H.cards.length ? 'Câu tiếp →' : 'Xem kết quả')}`) : ''}`;
}
function noteHtml(note) {
  if (!note) return '<p class="small faint">Đề này chưa có phần giải thích. Thêm file giải thích ở trang đề để xem vì sao chọn và bẫy nằm ở đâu.</p>';
  return `<div class="tp-note">
    ${note.why ? `<p><b>Vì sao:</b> ${esc(note.why)}</p>` : ''}
    ${note.para?.length ? `<div class="hn-pairs">${note.para.map(([a, b]) => `<div><span>Đề: ${esc(a)}</span>${icon('chev')}<span>Nghe: ${esc(b)}</span></div>`).join('')}</div>` : ''}
    ${note.trap ? `<p><b>Bẫy:</b> ${esc(note.trap)}</p>` : ''}
    ${note.tip ? `<p class="tp-tip">${icon('info', 'sm')} ${esc(note.tip)}</p>` : ''}</div>`;
}
function fbView(c) {
  const ok = H.why === 'right';
  const sent = c.T.map((x, i) => {
    const cls = c.idx.includes(i) ? 'ans' : c.trapIdx.includes(i) || i === H.tap ? 'trap' : '';
    return cls ? `<b class="hn-hl ${cls}">${esc(x.t)}</b>` : esc(x.t);
  }).join(' ');
  const picked = H.typed || (H.tap >= 0 ? clean(c.T[H.tap]?.t || '') : '');
  return `<div class="hn-hero">${ok ? mochi('happy', 84) : bolt('dizzy', 84)}<div><p class="hn-big">${ok ? 'Nghe trúng!' : H.why === 'trap' ? 'Sập bẫy rồi!' : H.why === 'timeout' ? 'Hết giờ rồi!' : 'Trượt mất rồi'}</p>
      <p>${ok ? `<span class="hn-pill">${STAR()}+${20 + Math.min(4, H.combo - 1) * 5}</span> <span class="hn-pill peach">${FLAME()}×${H.combo}</span>` : `<span class="hn-pill pink">${picked ? `Bạn ${H.typed ? 'gõ' : 'chạm'} “${esc(picked)}”` : 'Chưa trả lời'}</span>`}</p></div></div>
    <div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">Câu trong bài nghe</span><p class="hn-sent">${sent}</p><button class="tp-replay" data-act="tp-replay">${icon('speaker', 'sm')} Nghe lại câu này</button></div>
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
