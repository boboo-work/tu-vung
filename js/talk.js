// Trò "Nói 30 giây" (Speaking).
//  Lấy câu hỏi Part 1 và Part 3 từ đề Speaking của quý (content/speaking): app đọc câu hỏi → nghĩ vài giây → nói 30 giây (Part 3: 45 giây),
//  có thể ghi âm (dùng chung phần ghi âm của Speaking) → xem bài mẫu 7.0 có tô cụm hay → điền lại 2–3 cụm hay bị che → tự chấm ý chính, lý do, ví dụ.
//  Cụm hay: lấy từ danh sách từ vựng của câu (nếu có); không có thì lấy các cụm bài 7.0 dùng mà bài 6.5 không có (chỗ "nâng band").
//  Mỗi lượt có trả lời tính vào chuỗi ngày học, không tính vào mục tiêu Speaking. Câu điền sai quay lại các lượt sau.
import { S, saveHunt, logGrammarDay } from './store.js';
import { esc, toast, uid, shuffle, speak } from './util.js';
import { icon, on, go, back, replace, rerender, confirmSheet } from './ui.js';
import { loadSpeaking, micKit } from './speak.js';
import { openWordSheet } from './reading.js';
import { mochi, bolt, kit } from './hunt.js';

// ---------------------------------------------------------------- Dữ liệu
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'so', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', "it's", 'i', "i'm", "i've", "i'd", 'my', 'me', 'we', 'our', 'you', 'your', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'this', 'that', 'these', 'those', 'there', 'which', 'who', 'what', 'when', 'where', 'how', 'do', 'does', 'did', 'have', 'has', 'had', 'not', "don't", "doesn't", 'very', 'really', 'quite', 'just', 'also', 'too', 'if', 'than', 'then', 'about', 'because', 'can', 'will', 'would', 'could', 'should', 'some', 'any', 'more', 'most', 'much', 'many', 'lot', 'lots', 'like', 'well', 'yes', 'no', 'all', 'one']);
const CONJ = new Set(['because', 'whereas', 'which', 'who', 'whose', 'although', 'though', 'unless', 'whether', 'since', 'while', 'when', 'where', 'if', 'so', 'but', 'that']);
// Từ không nên đứng đầu/cuối một cụm.
const EDGE = new Set([...STOP, 'between', 'among', 'into', 'through', 'while', 'whose', 'within', 'both', 'each', 'other', 'others', 'such', 'even', 'only', 'still', 'often', 'usually', 'people', 'things', 'thing', 'way', 'get', 'got', 'make', 'made', "you're", "we're", "they're", "that's", "there's", 'am', 'being', 'own', 'way', 'than', 'since', 'while', 'although', 'though', 'whether', 'either', 'neither', 'every', 'per', 'via', 'onto', 'upon', 'over', 'under', 'up', 'down', 'out', 'off', 'back', 'here', 'now', 'then']);
const wn = (w) => String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
/** Cụm trong danh sách từ vựng → mẫu tìm trong bài 7.0 ("grow attached to" khớp "grown attached to"; bỏ phần ghi chú sau "+", "/", "("). */
function phraseRe(p) {
  let base = String(p).split(/\s*(?:\+|\/|\(|=|…|\.\.\.)\s*/)[0].trim().toLowerCase().replace(/[’‘]/g, "'");
  base = base.replace(/^(to be|be|to)\s+/, '').replace(/\b(sb|sth|someone|something|one's)\b/g, '').replace(/\s+/g, ' ').trim();
  const ws = base.split(' ').filter(Boolean);
  if (!ws.length || (ws.length === 1 && (ws[0].length < 4 || STOP.has(ws[0])))) return null;
  const esc2 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${ws.map((w) => `${esc2(w)}(?:s|es|ed|d|ing|n|en)?`).join("[\\s,'-]+")}\\b`, 'i');
}
/** Chọn tối đa 3 cụm hay trong bài 7.0 (không chồng lên nhau): ưu tiên danh sách từ vựng, rồi tới cụm 7.0 có mà 6.5 không có. */
function pickPhrases(q) {
  const a = String(q.a7 || '');
  const out = [];
  const free = (s, e) => out.every((x) => e <= x.s || s >= x.e);
  for (const v of q.vocab || []) {
    const re = phraseRe(v.p);
    const m = re && a.match(re);
    if (m && free(m.index, m.index + m[0].length)) out.push({ s: m.index, e: m.index + m[0].length, t: m[0], m: v.m || '', src: 'vocab' });
    if (out.length >= 3) break;
  }
  if (out.length < 2) {
    // Cụm "nâng band": 2–4 từ liên tiếp trong bài 7.0 mà mọi từ chính đều không có ở bài 6.5.
    // Bỏ cụm đứng đầu câu ("Doctors diagnose…"), cụm có dấu câu ở giữa, cụm bắt đầu/kết thúc bằng từ nối.
    const six = new Set(String(q.a6 || '').split(/\s+/).map(wn));
    const toks = [...a.matchAll(/[A-Za-z][A-Za-z'’-]*/g)].map((m) => ({ w: wn(m[0]), s: m.index, e: m.index + m[0].length, cap: /^[A-Z]/.test(m[0]) }));
    const startOfSent = (t) => /(^|[.!?]\s*)$/.test(a.slice(Math.max(0, t.s - 3), t.s)) || t.s === 0;
    const cands = [];
    for (let i = 0; i < toks.length; i++) {
      for (let len = 2; len <= 3; len++) {
        const run = toks.slice(i, i + len);
        if (run.length < len) continue;
        if (EDGE.has(run[0].w) || EDGE.has(run[len - 1].w) || startOfSent(run[0])) continue;
        if (/[.,;:!?–—()"]/.test(a.slice(run[0].s, run[len - 1].e))) continue;
        if (run.some((t, k) => k && t.cap && t.w !== 'i')) continue; // tên riêng
        if (run.some((t) => CONJ.has(t.w))) continue; // nối hai mệnh đề: không phải một cụm
        const content = run.filter((t) => !STOP.has(t.w));
        if (!content.length || content.some((t) => six.has(t.w))) continue;
        if (content.every((t) => t.w.length < 5)) continue;
        cands.push({ s: run[0].s, e: run[len - 1].e, score: content.reduce((x, t) => x + Math.min(t.w.length, 10), 0) + (len === 3 ? 2 : 0) });
      }
    }
    // Từ đơn "đắt giá": dài, chỉ bài 7.0 dùng (noticeable, unwind…), xếp sau các cụm.
    for (const t of toks) {
      const name = t.cap && !startOfSent(t);
      const strong = t.w.length >= 9 || (t.w.length >= 7 && /(ly|ous|ive|able|ible|ful|ent|ant|ary|ic|ical)$/.test(t.w));
      if (strong && !EDGE.has(t.w) && !six.has(t.w) && !name) cands.push({ s: t.s, e: t.e, score: t.w.length - 4 });
    }
    cands.sort((x, y) => y.score - x.score);
    for (const c of cands) { if (out.length >= 3) break; if (free(c.s, c.e)) out.push({ s: c.s, e: c.e, t: a.slice(c.s, c.e), m: '', src: 'diff' }); }
  }
  return out.sort((x, y) => x.s - y.s);
}
async function loadAll() {
  await loadSpeaking();
  const SP = micKit.data();
  if (SP.state !== 'ready') throw new Error(SP.error || 'Chưa tải được đề Speaking');
  const files = SP.quarters.flatMap((q) => [q.p1?.file, q.p23?.file]).filter(Boolean);
  await Promise.all(files.map((f) => (SP.data.has(f) ? null : micKit.loadFile(f))));
  // File đang được trang Speaking tải dở: chờ thêm một chút.
  for (let k = 0; k < 50 && files.some((f) => !SP.data.has(f)); k++) await new Promise((ok) => setTimeout(ok, 200));
  return SP;
}
const CARDS = { list: null };
function buildCards(SP) {
  if (CARDS.list) return CARDS.list;
  const out = [];
  for (const qt of SP.quarters) {
    const p1 = SP.data.get(qt.p1?.file), p23 = SP.data.get(qt.p23?.file);
    for (const t of p1?.topics || []) (t.qs || []).forEach((q, i) => { if (q.a7 && q.q && i < 100) out.push(card(qt, 1, t.id, t.title, i, q)); });
    for (const c of p23?.cards || []) (c.p3 || []).forEach((q, i) => { if (q.a7 && q.q && i < 100) out.push(card(qt, 3, c.id, c.title, i, q)); });
  }
  return (CARDS.list = out.filter((c) => c.key));
}
function card(qt, part, tid, title, i, q) {
  const id = String(tid || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
  if (!id) return {};
  return { key: `sp-${qt.id}|${id}|${i}`.toLowerCase(), quarter: qt.id, qTitle: qt.title, part, topic: title, q: q.q, vi: q.vi || '', a6: q.a6 || '', a7: q.a7, vocab: q.vocab || [], phrases: pickPhrases(q) };
}
/** Dùng cho kiểm thử. */
export const _tk = { pickPhrases, phraseRe, loadAll, buildCards, get T() { return T; } };

// ---------------------------------------------------------------- Thống kê (nằm chung S.hunt)
const hunt = () => S.hunt || (S.hunt = { plays: 0, best: 0, wrong: {}, pos: {}, seen: {} });
const st = () => hunt().talk || (hunt().talk = { plays: 0, best: 0, n: 0, ok: 0, secs: 0 });
const wrongKeys = () => Object.keys(hunt().wrong).filter((k) => k.startsWith('sp-'));
export function talkStats() { const s = st(); return { ...s, acc: s.n ? Math.round((s.ok / s.n) * 100) : null }; }

// ---------------------------------------------------------------- Chọn câu
const SIZE = 5;
const ui = { src: 'new', part: 'mix', rec: true, onlyWrong: false };
function pickCards(all, { keys }) {
  const qs = [...new Set(all.map((c) => c.quarter))];
  let pool = all.filter((c) => (ui.src === 'all' || (ui.src === 'new' ? c.quarter === qs[0] : c.quarter === ui.src)) && (ui.part === 'mix' || String(c.part) === ui.part));
  const want = keys || (ui.onlyWrong ? wrongKeys() : null);
  if (want) { const set = new Set(want); return shuffle(all.filter((c) => set.has(c.key))).slice(0, SIZE); }
  const seen = hunt().seen, wr = hunt().wrong;
  const wrongFirst = shuffle(pool.filter((c) => c.key in wr)).slice(0, 2);
  pool = shuffle(pool.filter((c) => !(c.key in wr))).sort((a, b) => (seen[a.key] || 0) - (seen[b.key] || 0));
  // Trộn: khoảng 3 câu Part 1, 2 câu Part 3.
  let pick = pool;
  if (ui.part === 'mix') { const a = pool.filter((c) => c.part === 1), b = pool.filter((c) => c.part === 3); pick = [...a.slice(0, 3), ...b.slice(0, 2), ...a.slice(3), ...b.slice(2)]; }
  return shuffle([...wrongFirst, ...pick.slice(0, SIZE - wrongFirst.length)]);
}

// ---------------------------------------------------------------- Lượt chơi
// T.phase: think → speak → model → cloze → clozeDone → self
let T = null;
let LAST = null;
let timer = 0;
const THINK = { 1: 8, 3: 12 }, TALK = { 1: 30, 3: 45 };
const AU = { el: null, url: '' };
function startTimer(sec, onEnd) {
  clearInterval(timer);
  T.dur = sec * 1000;
  T.deadline = Date.now() + T.dur;
  T.onEnd = onEnd;
  timer = setInterval(tick, 200);
}
function stopTimer() { clearInterval(timer); timer = 0; if (T) T.deadline = 0; }
function tick() {
  if (!T || !location.hash.startsWith('#/tkplay')) { stopTimer(); return; }
  const left = Math.max(0, T.deadline - Date.now());
  const bar = document.querySelector('#hn-timer i'), s = document.getElementById('hn-secs'), big = document.getElementById('tk-big');
  if (bar) bar.style.width = `${(left / T.dur) * 100}%`;
  if (s) s.textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
  if (big) big.textContent = Math.ceil(left / 1000);
  if (!left) { const f = T.onEnd; stopTimer(); f?.(); }
}
const say = (text) => speak(text, { lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });
function beginCard() {
  const c = T.cards[T.i];
  stopTimer();
  clearAudio();
  Object.assign(T, { phase: 'think', take: null, spokeMs: 0, fills: [], checked: null, self: {}, show6: false, used: [], tStart: 0 });
  say(c.q);
  startTimer(THINK[c.part], startTalk);
}
function startTalk() {
  if (!T || T.phase !== 'think') return;
  const c = T.cards[T.i];
  stopTimer();
  try { speechSynthesis.cancel(); } catch { /* bỏ qua */ }
  T.phase = 'speak';
  T.tStart = Date.now();
  if (T.rec && T.micOk) { try { micKit.startRec(c.part); T.recording = true; } catch (e) { console.warn(e); T.recording = false; } }
  startTimer(TALK[c.part], endTalk);
  rerender();
}
async function endTalk() {
  if (!T || T.phase !== 'speak') return;
  const c = T.cards[T.i];
  stopTimer();
  T.phase = 'model';
  T.spokeMs = Date.now() - T.tStart;
  rerender();
  if (T.recording) {
    T.recording = false;
    const r = await micKit.stopRec();
    if (r && T && T.cards[T.i] === c) {
      T.take = r;
      T.spokeMs = r.speakMs || r.ms || T.spokeMs;
      // Cụm hay bạn đã nói được (khi máy nhận ra chữ).
      if (r.text) T.used = c.phrases.filter((p) => new RegExp(`\\b${p.t.split(/\s+/).slice(0, 2).map((w) => w.replace(/[^\w']/g, '')).join('\\W+')}`, 'i').test(r.text)).map((p) => p.t);
      rerender();
    }
  }
  const half = (TALK[c.part] * 1000) / 2;
  if (T.spokeMs >= half) T.score += 10;
}
function clearAudio() { if (AU.el) AU.el.pause(); if (AU.url) URL.revokeObjectURL(AU.url); AU.url = ''; }
function playTake() {
  if (!T?.take?.blob) return;
  if (!AU.el) AU.el = new Audio();
  if (!AU.url) { AU.url = URL.createObjectURL(T.take.blob); AU.el.src = AU.url; }
  try { speechSynthesis.cancel(); } catch { /* bỏ qua */ }
  AU.el.currentTime = 0;
  AU.el.play().catch(() => toast('Không phát được bản ghi'));
}
function result(ok, extra = {}) {
  const c = T.cards[T.i];
  T.res[T.i] = { key: c.key, ok, part: c.part, q: c.q, topic: c.topic, phrases: c.phrases.map((p) => p.t), ...extra };
  if (ok) { T.combo++; T.maxCombo = Math.max(T.maxCombo, T.combo); } else T.combo = 0;
}
function checkCloze() {
  const c = T.cards[T.i];
  const ok = c.phrases.map((p, i) => T.fills[i] === p.t);
  T.checked = ok;
  const n = ok.filter(Boolean).length;
  T.score += n * 10;
  T.blanks += ok.length; T.blanksOk += n;
  result(n === ok.length, { blanks: ok.length, blanksOk: n, spokeMs: T.spokeMs });
  T.phase = 'clozeDone';
  rerender();
}
async function finish() {
  stopTimer();
  clearAudio();
  try { speechSynthesis.cancel(); } catch { /* bỏ qua */ }
  if (T.recording) { T.recording = false; await micKit.stopRec(); }
  micKit.closeAll();
  const P = T;
  T = null;
  const done = P.res.filter(Boolean);
  const h = hunt(), s = st();
  if (done.length) {
    const now = Math.round(Date.now() / 1000);
    for (const r of done) {
      h.seen[r.key] = now;
      if (!r.ok) h.wrong[r.key] = 0;
      else if (r.key in h.wrong) { h.wrong[r.key]++; if (h.wrong[r.key] >= 2) delete h.wrong[r.key]; }
    }
    s.plays++; s.best = Math.max(s.best, P.score); s.n += P.blanks; s.ok += P.blanksOk; s.secs += Math.round(done.reduce((a, r) => a + (r.spokeMs || 0), 0) / 1000);
    await saveHunt();
    await logGrammarDay('hSets', P.id); // tính vào chuỗi ngày học, không tính vào mục tiêu Speaking
  }
  const secs = Math.round(done.reduce((a, r) => a + (r.spokeMs || 0), 0) / 1000);
  LAST = { score: P.score, n: done.length, blanks: P.blanks, blanksOk: P.blanksOk, secs, ms: Date.now() - P.t0, wrong: done.filter((r) => !r.ok), phrases: P.learned, counted: done.length > 0 };
  replace('#/tkres');
}

let starting = false;
on('tk-start', async (el) => {
  if (starting) return;
  const keys = el.dataset.keys ? el.dataset.keys.split(',') : null;
  starting = true;
  let all;
  try {
    // Mở micro ngay trong cú chạm (iOS chỉ hỏi quyền khi người dùng chạm).
    const mic = ui.rec ? micKit.openMic().then(() => true, (e) => { console.warn(e); toast('Không mở được micro: lượt này không ghi âm', 'bad'); return false; }) : Promise.resolve(false);
    toast('Đang chuẩn bị câu hỏi…');
    all = buildCards(await loadAll());
    const cards = pickCards(all, { keys });
    if (!cards.length) { toast(ui.onlyWrong ? 'Không còn câu nào cần ôn lại' : 'Chưa có câu phù hợp'); micKit.closeAll(); return; }
    T = { id: 'K:' + uid(), cards, i: 0, score: 0, combo: 0, maxCombo: 0, t0: Date.now(), res: [], blanks: 0, blanksOk: 0, learned: [], rec: ui.rec, micOk: await mic };
    beginCard();
    go('#/tkplay');
  } catch (e) { console.error(e); toast('Chưa tải được đề Speaking. Hãy mở app khi có mạng một lần.', 'bad'); }
  finally { starting = false; }
});
on('tk-go', () => startTalk());
on('tk-done', () => endTalk());
on('tk-say-q', () => { const c = T?.cards[T.i]; if (c) say(c.q); });
on('tk-say-model', () => { const c = T?.cards[T.i]; if (c) { clearAudio(); say(T.show6 ? c.a6 : c.a7); } });
on('tk-play-take', () => playTake());
on('tk-band', () => { if (T) { T.show6 = !T.show6; rerender(); } });
on('tk-cloze', () => {
  if (!T || T.phase !== 'model') return;
  try { speechSynthesis.cancel(); } catch { /* bỏ qua */ }
  clearAudio();
  const c = T.cards[T.i];
  if (!c.phrases.length) { result(true, { spokeMs: T.spokeMs }); T.phase = 'self'; rerender(true); return; }
  // Lựa chọn: các cụm đúng + 1–2 cụm của câu khác làm nhiễu.
  const others = shuffle(T.cards.flatMap((x) => (x === c ? [] : x.phrases.map((p) => p.t)))).filter((t) => !c.phrases.some((p) => p.t.toLowerCase() === t.toLowerCase())).slice(0, c.phrases.length > 2 ? 1 : 2);
  T.chips = shuffle([...c.phrases.map((p) => p.t), ...others]);
  T.fills = c.phrases.map(() => null);
  T.phase = 'cloze';
  rerender(true);
});
on('tk-chip', (el) => {
  if (!T || T.phase !== 'cloze') return;
  const t = T.chips[Number(el.dataset.i)];
  if (T.fills.includes(t)) return;
  const k = T.fills.indexOf(null);
  if (k < 0) return;
  T.fills[k] = t;
  if (!T.fills.includes(null)) checkCloze(); else rerender();
});
on('tk-unfill', (el) => { if (T?.phase === 'cloze') { T.fills[Number(el.dataset.i)] = null; rerender(); } });
on('tk-self-go', () => { if (T?.phase === 'clozeDone') { T.phase = 'self'; rerender(true); } });
on('tk-self', (el) => { if (T?.phase === 'self') { T.self[el.dataset.k] = !T.self[el.dataset.k]; rerender(); } });
on('tk-save', (el) => {
  const c = T?.cards[T.i];
  if (!c) return;
  const p = c.phrases[Number(el.dataset.i)];
  if (!p) return;
  const sent = (c.a7.match(new RegExp(`[^.!?]*${p.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?]*[.!?]?`, 'i')) || [c.a7])[0].trim();
  openWordSheet(p.t, sent, `Speaking · ${c.topic}`);
  if (!T.learned.includes(p.t)) T.learned.push(p.t);
});
on('tk-next', async () => {
  if (!T) return;
  T.score += Object.values(T.self).filter(Boolean).length * 5;
  if (!T.res[T.i]) result(true, { spokeMs: T.spokeMs });
  if (T.i + 1 < T.cards.length) { T.i++; beginCard(); rerender(true); } else await finish();
});
on('tk-quit', async () => {
  if (!T) { back('#/games'); return; }
  const done = T.res.filter(Boolean).length;
  if (!(await confirmSheet({ title: 'Dừng lượt chơi?', body: done ? `Đã làm ${done} câu: kết quả được lưu và tính vào chuỗi ngày học.` : 'Chưa làm xong câu nào nên lượt này không được lưu.', okLabel: 'Dừng' }))) return;
  if (done) await finish(); else { stopTimer(); clearAudio(); if (T.recording) await micKit.stopRec(); micKit.closeAll(); T = null; back('#/games'); }
});
on('tk-set', (el) => { ui[el.dataset.k] = el.dataset.v === 'true' ? true : el.dataset.v === 'false' ? false : el.dataset.v; rerender(); });
on('tk-wrong', () => { ui.onlyWrong = !ui.onlyWrong; rerender(); });

// ---------------------------------------------------------------- Màn hình
const STAR = () => kit.STAR(), FLAME = () => kit.FLAME();
const bigBtn = (act, label, extra = '') => `<button class="hn-btn" data-act="${act}" ${extra}>${label}</button>`;
const secTxt = (ms) => `${Math.round(ms / 1000)} giây`;
function hud(c) {
  const dots = T.cards.map((_, i) => `<span class="hn-dot ${i < T.i ? (T.res[i]?.ok ? 'ok' : 'no') : i === T.i ? 'cur' : ''}"></span>`).join('');
  const timed = T.deadline > 0;
  const left = Math.max(0, T.deadline - Date.now());
  return `<div class="hn-top"><button class="hn-x" data-act="tk-quit" aria-label="Thoát">${icon('x')}</button>
    ${timed ? `<div class="hn-timer" id="hn-timer"><i style="width:${(left / T.dur) * 100}%"></i></div><span class="hn-pill sm" id="hn-secs">0:${String(Math.ceil(left / 1000)).padStart(2, '0')}</span>` : `<div class="hn-dots">${dots}</div>`}</div>
    <div class="hn-hud"><span class="hn-pill">${STAR()}${T.score}</span><span class="hn-meta">Part ${c.part} · ${esc(c.topic.length > 26 ? c.topic.slice(0, 25) + '…' : c.topic)}</span><span class="hn-pill peach">${FLAME()}×${Math.max(1, T.combo)}</span></div>`;
}
const qCard = (c) => `<div class="hn-card tk-card"><span class="hn-tag" style="background:#FFB3CB">Câu ${T.i + 1}/${T.cards.length} · Part ${c.part}</span><span class="tk-tools"><button class="tk-say" data-act="tk-say-q" aria-label="Nghe lại câu hỏi">${icon('speaker', 'sm')}</button></span>
  <p class="hn-q">${esc(c.q)}</p>${c.vi ? `<details class="tk-vi"><summary>Nghĩa tiếng Việt</summary><p>${esc(c.vi)}</p></details>` : ''}</div>`;
function thinkView(c) {
  return `${hud(c)}${qCard(c)}
    <div class="tk-stage think"><p class="tk-lab">Nghĩ ý trong</p><b id="tk-big" class="tk-big">${Math.ceil(Math.max(0, T.deadline - Date.now()) / 1000)}</b>
      <p class="tk-hint">${c.part === 1 ? 'Trả lời thẳng → nêu lý do → thêm ví dụ của bạn' : 'Nêu quan điểm → giải thích → ví dụ hoặc so sánh'}</p></div>
    ${bigBtn('tk-go', 'Nói luôn!')}`;
}
function speakView(c) {
  const recOn = T.rec && T.micOk && T.recording;
  return `${hud(c)}${qCard(c)}
    <div class="tk-stage talk"><p class="tk-lab">${recOn ? 'Đang ghi âm · nói đi nào!' : 'Nói to câu trả lời của bạn'}</p><b id="tk-big" class="tk-big">${Math.ceil(Math.max(0, T.deadline - Date.now()) / 1000)}</b>
      ${recOn ? '<div class="tk-level"><i id="sp-level"></i></div>' : ''}
      <p class="tk-hint">Mục tiêu ${TALK[c.part]} giây · nói được quá nửa thời gian là +10</p></div>
    ${bigBtn('tk-done', 'Xong')}`;
}
/** Bài mẫu: tô cụm hay (chạm để lưu). */
function modelText(c) {
  if (T.show6) return esc(c.a6);
  let html = '', at = 0;
  c.phrases.forEach((p, i) => { html += esc(c.a7.slice(at, p.s)) + `<b class="tk-ph" data-act="tk-save" data-i="${i}" role="button">${esc(c.a7.slice(p.s, p.e))}</b>`; at = p.e; });
  return html + esc(c.a7.slice(at));
}
function modelView(c) {
  const t = T.take;
  const spoke = T.spokeMs;
  const good = spoke >= (TALK[c.part] * 1000) / 2;
  const mine = T.rec && T.micOk;
  return `${hud(c)}
    <div class="hn-panel" style="background:${good ? '#D9F7EC' : '#FFF0B8'}"><div class="hn-ptitle">${good ? mochi('happy', 48) : bolt('calm', 48)}<b>${mine && !t ? 'Đang lưu bản ghi…' : good ? `Bạn nói ${secTxt(spoke)} · +10` : `Bạn nói ${secTxt(spoke)} · lần sau cố nói dài hơn nhé`}</b></div>
      ${t?.blob ? `<button class="tp-replay" data-act="tk-play-take">${icon('speaker', 'sm')} Nghe lại bài của bạn</button>` : ''}
      ${t?.text ? `<p class="tk-said"><span class="faint">Máy nghe được:</span> ${esc(t.text)}</p>` : ''}
      ${T.used.length ? `<p class="tk-said">Bạn đã dùng cụm hay: <b>${T.used.map(esc).join(', ')}</b></p>` : ''}</div>
    <div class="hn-card tk-card"><span class="hn-tag" style="background:#FFD84D">Bài mẫu ${T.show6 ? '6.5' : '7.0'}</span><span class="tk-tools"><button class="tk-band" data-act="tk-band">Xem ${T.show6 ? '7.0' : '6.5'}</button><button class="tk-say" data-act="tk-say-model" aria-label="Nghe bài mẫu">${icon('speaker', 'sm')}</button></span>
      <p class="hn-q tk-model">${modelText(c)}</p>
      ${!T.show6 && c.phrases.length ? `<p class="tk-note">Chữ tô vàng là cụm hay${c.phrases.some((p) => p.src === 'diff') ? ' (bài 7.0 dùng, bài 6.5 không có)' : ''} · chạm để lưu vào từ vựng</p>` : ''}
      ${!T.show6 ? c.phrases.filter((p) => p.m).map((p) => `<p class="tk-mean"><b>${esc(p.t)}</b>: ${esc(p.m)}</p>`).join('') : ''}</div>
    ${bigBtn('tk-cloze', c.phrases.length ? 'Ôn cụm hay →' : 'Tự chấm →', mine && !t ? 'disabled' : '')}`;
}
function clozeView(c) {
  const done = T.phase === 'clozeDone';
  let html = '', at = 0;
  c.phrases.forEach((p, i) => {
    html += esc(c.a7.slice(at, p.s));
    const f = T.fills[i];
    if (done) html += `<b class="tk-blank ${T.checked[i] ? 'ok' : 'no'}">${esc(p.t)}${T.checked[i] ? '' : `<s>${esc(f || '')}</s>`}</b>`;
    else html += f ? `<button class="tk-blank filled" data-act="tk-unfill" data-i="${i}">${esc(f)}</button>` : `<span class="tk-blank ${T.fills.indexOf(null) === i ? 'cur' : ''}">${'①②③'[i]}</span>`;
    at = p.e;
  });
  html += esc(c.a7.slice(at));
  const chips = done ? '' : `<div class="tk-chips">${T.chips.map((t, i) => `<button class="tk-chip ${T.fills.includes(t) ? 'used' : ''}" data-act="tk-chip" data-i="${i}" ${T.fills.includes(t) ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>`;
  const n = done ? T.checked.filter(Boolean).length : 0;
  return `${hud(c)}
    <p class="hn-step">${done ? '' : 'Chạm cụm đúng để điền vào chỗ trống'}</p>
    <div class="hn-card"><span class="hn-tag" style="background:#C7B8FF">Điền lại cụm hay · bài 7.0</span><p class="hn-q tk-model">${html}</p></div>
    ${chips}
    ${done ? `<div class="hn-panel" style="background:${n === c.phrases.length ? '#D9F7EC' : '#FFE1EC'}"><div class="hn-ptitle">${n === c.phrases.length ? mochi('happy', 48) : bolt('dizzy', 48)}<b>Đúng ${n}/${c.phrases.length} cụm${n ? ` · +${n * 10}` : ''}</b></div>
      ${n < c.phrases.length ? '<p>Câu này sẽ quay lại ở lượt sau để bạn ôn tiếp.</p>' : ''}${bigBtn('tk-self-go', 'Tự chấm →')}</div>` : ''}`;
}
function selfView(c) {
  const items = c.part === 1 ? [['main', 'Trả lời thẳng câu hỏi'], ['why', 'Có lý do'], ['eg', 'Có ví dụ của bản thân']] : [['main', 'Nêu rõ quan điểm'], ['why', 'Có giải thích'], ['eg', 'Có ví dụ hoặc so sánh']];
  return `${hud(c)}
    <div class="hn-card"><span class="hn-tag" style="background:#8EE3C8">Tự chấm câu vừa nói</span><p class="tk-note" style="margin-top:8px">Mỗi ý có được +5. Thật lòng nhé, không ai chấm thay bạn đâu!</p>
      <div class="tk-self">${items.map(([k, l]) => `<button class="tk-check ${T.self[k] ? 'on' : ''}" data-act="tk-self" data-k="${k}" aria-pressed="${!!T.self[k]}"><span>${T.self[k] ? icon('check', 'sm') : ''}</span>${l}</button>`).join('')}</div></div>
    ${c.phrases.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFD84D">Cụm hay của câu này</span><div class="hn-chips">${c.phrases.map((p, i) => `<span data-act="tk-save" data-i="${i}" role="button">${esc(p.t)} +</span>`).join('')}</div><p class="tk-note">Chạm để lưu vào từ vựng</p></div>` : ''}
    ${bigBtn('tk-next', T.i + 1 < T.cards.length ? 'Câu tiếp →' : 'Xem kết quả')}`;
}
export function playView() {
  if (!T) return { html: `<div class="page hn-scr"><div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Nói 30 giây</h1></div><div class="hn-card" style="margin-top:20px"><p>Lượt chơi đã kết thúc.</p>${bigBtn('go', 'Về tab Game', 'data-to="#/games"')}</div></div>` };
  const c = T.cards[T.i];
  const body = T.phase === 'think' ? thinkView(c) : T.phase === 'speak' ? speakView(c) : T.phase === 'model' ? modelView(c) : T.phase === 'self' ? selfView(c) : clozeView(c);
  return { html: `<div class="page session hn-scr hn-play tk-scr"><div class="ses-body">${body}</div></div>` };
}

export function resultView() {
  if (!LAST) return `<div class="page hn-scr"><div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Nói 30 giây</h1></div><div class="hn-card" style="margin-top:20px"><p>Chưa có lượt nào vừa chơi.</p></div></div>`;
  const L = LAST;
  const streak = kit.streakDays();
  const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `<div class="page hn-scr hn-res">
    <div class="hn-trophy">${mochi('happy', 70)}<svg width="92" height="92" viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="6" width="20" height="32" rx="10" fill="#FFD84D" stroke="#2B2240" stroke-width="2.6"/><path d="M14 30a18 18 0 0 0 36 0M32 48v8M22 58h20" fill="none" stroke="#2B2240" stroke-width="2.6" stroke-linecap="round"/></svg>${bolt('happy', 70)}</div>
    <p class="hn-big center">Nói được ${mm(L.secs)}!</p>
    ${L.counted ? `<p class="center hn-sub">+1 ngày vào chuỗi học${streak ? ` · giờ là <span class="hn-pill sm peach">${streak} ngày</span>` : ''}</p>` : ''}
    <div class="hn-tiles3"><div style="background:#FFD84D"><b>${L.score}</b><span>điểm</span></div><div style="background:#FFB3CB"><b>${L.blanksOk}/${L.blanks}</b><span>cụm điền đúng</span></div><div style="background:#BFE3FF"><b>${L.n}</b><span>câu đã nói</span></div></div>
    ${L.phrases.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFD84D">Cụm đã mở để lưu</span><div class="hn-chips">${L.phrases.map((w) => `<span>${esc(w)}</span>`).join('')}</div></div>` : ''}
    ${L.wrong.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFB3CB">${L.wrong.length} câu cần ôn lại</span>${L.wrong.slice(0, 5).map((r) => `<p><b>Part ${r.part}</b> · ${esc(r.q)}<br><span class="faint">Cụm: ${esc(r.phrases.join(' · '))}</span></p>`).join('')}</div>` : ''}
    <div class="hn-row2">${bigBtn('go', 'Xong', 'data-to="#/games" style="flex:.75;background:#fff"')}${L.wrong.length ? bigBtn('tk-start', `Ôn lại ${L.wrong.length} câu!`, `data-keys="${esc(L.wrong.map((r) => r.key).join(','))}" style="flex:1.25"`) : bigBtn('tk-start', 'Chơi lượt mới!', 'style="flex:1.25"')}</div>
  </div>`;
}

// ---------------------------------------------------------------- Chọn lượt chơi
export function setupView() {
  const SP = micKit.data();
  if (SP.state !== 'ready' && SP.state !== 'loading' && SP.state !== 'error') loadSpeaking().then(() => rerender());
  const qs = SP.quarters || [];
  const seg = (k, opts) => `<div class="hn-seg">${opts.map(([v, l]) => `<button class="${String(ui[k]) === String(v) ? 'on' : ''}" data-act="tk-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const nw = wrongKeys().length;
  const canRec = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  if (!canRec) ui.rec = false;
  return `<div class="page hn-scr hn-setup">
    <div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Nói 30 giây</h1><span class="hn-pill sm pink">Speaking</span></div>
    <div class="hn-card" style="background:#FFF0B8">
      <div class="hn-stp"><span>1</span><p><b>Nghe câu hỏi, nghĩ nhanh</b> · 8 giây (Part 3: 12 giây)</p></div>
      <div class="hn-stp"><span>2</span><p><b>Nói 30 giây</b> (Part 3: 45 giây) · có thể ghi âm</p></div>
      <div class="hn-stp"><span>3</span><p><b>Xem bài mẫu 7.0, điền lại cụm hay</b> · rồi tự chấm</p></div></div>
    <p class="hn-lab">Đề</p>${seg('src', [['new', qs[0] ? esc(qs[0].title) : 'Quý mới nhất'], ...(qs[1] ? [[qs[1].id, esc(qs[1].title)]] : []), ['all', 'Tất cả']])}
    <p class="hn-lab">Phần thi</p>${seg('part', [['mix', 'Trộn'], ['1', 'Part 1'], ['3', 'Part 3']])}
    <p class="hn-lab">Ghi âm</p>${canRec ? seg('rec', [[true, 'Bật'], [false, 'Tắt']]) : '<p class="hn-sub">Máy này không ghi âm được trong trình duyệt: vẫn chơi được, chỉ không nghe lại bài của mình.</p>'}
    <div class="hn-card hn-toggle"><span><b>Chỉ câu cần ôn lại</b><br><span class="faint">${nw ? `${nw} câu điền cụm chưa đúng` : 'Chưa có câu nào'}</span></span>
      <button class="hn-sw ${ui.onlyWrong ? 'on' : ''}" data-act="tk-wrong" aria-label="Chỉ câu cần ôn lại" aria-pressed="${ui.onlyWrong}" ${nw ? '' : 'disabled'}><i></i></button></div>
    ${SP.state === 'error' ? `<p class="hn-sub">${esc(SP.error)}</p>` : ''}
    <p class="hn-sub" style="margin:10px 4px 0">${SIZE} câu mỗi lượt · khoảng 5 phút</p>
    <div class="hn-bottom">${bigBtn('tk-start', 'Bắt đầu nói!')}</div>
  </div>`;
}
