// Luyện IELTS Speaking — MVP (S1–S6 trong bản nghiệp vụ).
//  S1 Kho đề theo quý: Part 1 (chủ đề + câu hỏi), Part 2 (cue card) kèm câu Part 3; mỗi câu có bài mẫu 6.0–6.5 và 7.0.
//  S2 Ghi âm từng câu, nghe lại, nói lại bản 2 và nghe so 2 bản.
//  S3 Đồng hồ theo thể lệ: Part 2 chuẩn bị 1 phút + nói 2 phút (tự dừng ở 2:00), ô ghi chú từ khoá. Tính theo giờ thật.
//  S4 Số liệu không cần chữ: thời gian nói thật (trừ khoảng lặng), số khoảng dừng > 2 giây — đo trên máy.
//  S5 Tự chấm 4 tiêu chí bằng câu Có/Chưa (không quy đổi ra band), lưu lại để xem tiến bộ.
//  S6 Mục Speaking trong tab Học, mục tiêu ngày, giữ bản ghi 30 ngày (trừ bản "giữ lại").
// Nội dung: content/speaking/*.json (tạo bằng tools/speaking_import.py từ bộ đề quý của người học).
import { S, spPut, spDel, spCleanup, logGrammarDay, dayOf, SP_KEEP_DAYS } from './store.js';
import { esc, toast, speak, uid, today, fmtDate } from './util.js';
import { icon, on, go, back, rerender, navBar, learnSwitch, confirmSheet } from './ui.js';
import { _mt } from './speaking.js';

// ---------------------------------------------------------------- Nội dung
export const SP = { state: 'idle', error: '', quarters: [], data: new Map(), loading: new Set() };
export async function loadSpeaking() {
  if (SP.state === 'loading' || SP.state === 'ready') return;
  SP.state = 'loading';
  try {
    const r = await fetch('content/speaking/index.json');
    if (!r.ok) throw new Error(`index.json: ${r.status}`);
    SP.quarters = (await r.json()).quarters || [];
    SP.state = 'ready';
    spCleanup().catch(console.error);
  } catch (e) {
    console.error(e);
    SP.state = 'error';
    SP.error = 'Chưa tải được đề Speaking. Hãy mở app khi có mạng một lần để app lưu sẵn.';
  }
}
async function loadFile(file) {
  if (SP.data.has(file) || SP.loading.has(file)) return;
  SP.loading.add(file);
  try {
    const r = await fetch(file);
    if (!r.ok) throw new Error(`${file}: ${r.status}`);
    SP.data.set(file, await r.json());
  } catch (e) {
    console.error(e);
    SP.data.set(file, { error: true });
  } finally {
    SP.loading.delete(file);
    if (/^#\/(speaking|sp1|sp2)\b/.test(location.hash)) rerender();
  }
}
const quarterOf = (id) => SP.quarters.find((q) => String(id).startsWith(q.id + '-'));
/** Lấy chủ đề Part 1 / đề Part 2 theo id; chưa tải file thì bắt đầu tải và trả về null. */
function getItem(id) {
  const q = quarterOf(id);
  if (!q) return { missing: true };
  const p1 = id.includes('-p1-');
  const file = p1 ? q.p1.file : q.p23.file;
  const data = SP.data.get(file);
  if (!data) { loadFile(file); return null; }
  if (data.error) return { error: true };
  const item = (p1 ? data.topics : data.cards).find((x) => x.id === id);
  return item ? { item, q, p1 } : { missing: true };
}

// ---------------------------------------------------------------- Định dạng
const md = (s) => esc(s || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
const paras = (s) => String(s || '').split(/\n{2,}/).map((p) => `<p>${md(p)}</p>`).join('');
const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const sec = (ms) => `${Math.round(ms / 1000)}″`;
const words = (s) => (String(s || '').match(/[A-Za-z']+/g) || []).length;
const voice = () => ({ lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });
const say = (t) => speak(t, voice());
const LIMIT = { 1: 60e3, 2: 120e3, 3: 120e3 };      // tự dừng ghi
const SHORT = { 1: 10e3, 2: 100e3, 3: 25e3 };       // nhắc "hơi ngắn"
const FRAME = {
  1: 'Trả lời thẳng → lý do → ví dụ hoặc cảm xúc · 20–30 giây',
  2: 'Đi lần lượt 4 gợi ý, mỗi gợi ý khoảng 25–30 giây · chuyện đã xảy ra thì dùng thì quá khứ',
  3: 'Quan điểm → giải thích → ví dụ → mặt khác hoặc kết luận · 40–60 giây',
};
const STALL = ['Well, let me think…', "That's an interesting question.", 'To be honest, I’ve never really thought about it, but…', 'I’d say…'];

// ---------------------------------------------------------------- Micro & ghi âm
// Micro + AudioContext được mở trong một lần chạm (iOS yêu cầu), giữ suốt lượt luyện để Part 2 tự bắt đầu ghi sau 1 phút.
const Mic = { stream: null, ctx: null, an: null, buf: null };
let rec = null; // { mr, chunks, samples, t0, timer, max, part }
function mime() {
  if (!window.MediaRecorder) return '';
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac']) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}
async function openMic() {
  if (Mic.stream?.active) { Mic.ctx?.resume?.(); return true; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw Object.assign(new Error('Máy này không hỗ trợ ghi âm trong trình duyệt.'), { name: 'NotSupported' });
  Mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext || window.webkitAudioContext;
  Mic.ctx = new AC();
  Mic.ctx.resume?.();
  Mic.an = Mic.ctx.createAnalyser(); Mic.an.fftSize = 1024;
  Mic.ctx.createMediaStreamSource(Mic.stream).connect(Mic.an);
  Mic.buf = new Float32Array(Mic.an.fftSize);
  return true;
}
function closeMic() {
  if (rec) { try { rec.mr.stop(); } catch {} clearInterval(rec.timer); rec = null; }
  Mic.stream?.getTracks().forEach((t) => t.stop());
  try { Mic.ctx?.close(); } catch {}
  Object.assign(Mic, { stream: null, ctx: null, an: null, buf: null });
}
function startRec(part) {
  const type = mime();
  const mr = new MediaRecorder(Mic.stream, type ? { mimeType: type } : undefined);
  rec = { mr, chunks: [], samples: [], t0: Date.now(), max: LIMIT[part], part };
  mr.ondataavailable = (e) => e.data.size && rec?.chunks.push(e.data);
  rec.timer = setInterval(() => {
    if (!rec) return;
    Mic.an.getFloatTimeDomainData(Mic.buf);
    let sum = 0; for (const v of Mic.buf) sum += v * v;
    const level = Math.sqrt(sum / Mic.buf.length);
    rec.samples.push(level);
    const lv = document.getElementById('sp-level');
    if (lv) lv.style.width = `${Math.min(100, level * 900)}%`;
  }, 50);
  mr.start(1000);
}
/** Dừng ghi → { blob, mime, ms, speakMs, pauses, longest } */
function stopRec() {
  return new Promise((resolve) => {
    const r = rec;
    if (!r) return resolve(null);
    rec = null;
    clearInterval(r.timer);
    const ms = Math.min(Date.now() - r.t0, r.max);
    r.mr.onstop = () => {
      const blob = new Blob(r.chunks, { type: r.mr.mimeType || mime() || 'audio/mp4' });
      // Mẫu âm lượng lấy mỗi 50 ms; khi màn hình tắt có thể thiếu mẫu → quy đổi theo thời gian thật.
      const a = _mt.analyse(r.samples, 50);
      const scale = r.samples.length ? ms / (r.samples.length * 50) : 1;
      resolve({ blob, mime: blob.type, ms, speakMs: Math.min(ms, Math.round(a.speakMs * scale)), pauses: a.pauses, longest: Math.round((a.longest || 0) * scale) });
    };
    try { r.mr.stop(); } catch { resolve(null); }
  });
}
const urls = new Map(); // takeId → object URL
function audioUrl(t) {
  if (!t?.audio) return '';
  if (!urls.has(t.id)) urls.set(t.id, URL.createObjectURL(t.audio));
  return urls.get(t.id);
}

// ---------------------------------------------------------------- Lượt luyện
// P = lượt đang luyện: Part 1 (một chủ đề) hoặc Part 2&3 (một đề).
//   stage: ask | rec | review | done            (câu Part 1 / Part 3)
//          card | prep | speak | p2review       (Part 2)
let P = null;
const ui = { quarter: '', tab: 'p1', showVi: false };
const mainQs = (t) => [...t.qs.filter((x) => !x.extra), ...t.qs.filter((x) => x.extra)];
function newSession(kind, id) {
  return { kind, id, sid: 'S:' + uid(), stage: kind === 'p1' ? 'ask' : 'card', part: kind === 'p1' ? 1 : 2, qi: 0, ans: {}, silent: false, notes: '', micErr: '', t0: 0, deadline: 0, counted: false, warned: false, self: {} };
}
const key = (part, qi) => `${part}:${qi}`;
const takesOf = (part, qi) => (P?.ans[key(part, qi)] || []).map((id) => S.speaking.get(id)).filter(Boolean);
function curQs() {
  const g = getItem(P.id);
  if (!g?.item) return [];
  return P.kind === 'p1' ? mainQs(g.item) : g.item.p3;
}
async function saveTake(res, part, qi) {
  const list = P.ans[key(part, qi)] || (P.ans[key(part, qi)] = []);
  const t = {
    id: 'T:' + uid(), kind: 'take', sid: P.sid, item: P.id, part, qi, v: list.length + 1, at: Date.now(), date: today(),
    ms: Math.round(res.ms), speakMs: Math.round(res.speakMs), pauses: res.pauses || 0, longest: Math.round(res.longest || 0),
    keep: false, silent: !!res.silent, mime: res.mime || '', audio: res.blob && res.blob.size ? res.blob : null,
  };
  list.push(t.id);
  await spPut(t);
  return t;
}
async function countTurn() {
  if (P.counted) return;
  P.counted = true;
  await logGrammarDay('sTurns', P.id);
}

// Đồng hồ chung: Part 2 chuẩn bị / nói, và tự dừng ghi ở giới hạn thời gian. Tính theo giờ thật nên vẫn đúng khi khoá màn hình.
let ticker = 0;
function tick() {
  if (!P) return;
  const now = Date.now();
  const clock = document.getElementById('sp-clock');
  if (P.stage === 'prep') {
    const left = P.deadline - now;
    if (clock) clock.textContent = mmss(left);
    if (left <= 0) beginTalk();
  } else if (P.stage === 'speak' || P.stage === 'rec') {
    const el = now - P.t0;
    const lim = LIMIT[P.part];
    if (clock) clock.textContent = P.stage === 'speak' ? mmss(lim - el) : `${mmss(el)} / ${mmss(lim)}`;
    if (P.stage === 'speak' && !P.warned && lim - el <= 30e3) { P.warned = true; toast('Còn 30 giây — chuẩn bị kết thúc ý cuối'); navigator.vibrate?.(80); }
    if (el >= lim) finishRec();
  }
}
function ensureTicker() { if (!ticker) ticker = setInterval(tick, 250); }
function stopTicker() { clearInterval(ticker); ticker = 0; }
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
// Rời màn hình luyện → dừng ghi, tắt micro.
window.addEventListener('hashchange', () => {
  if (!/^#\/(sp1|sp2)\//.test(location.hash) && (Mic.stream || rec)) { closeMic(); stopTicker(); if (P && ['rec', 'speak', 'prep'].includes(P.stage)) P = null; }
});

function micError(e) {
  const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
  const how = 'Cách bật lại trên iPhone: trong Safari bấm “aA” → Cài đặt trang web → Micro → Cho phép (hoặc Cài đặt → Safari → Micro). Nếu dùng app ở màn hình chính: đóng hẳn app, mở lại rồi bấm Ghi âm và chọn Cho phép.';
  P.micErr = denied ? `Micro đang bị chặn. ${how}` : `Không mở được micro (${e?.message || e}). ${how}`;
  rerender();
}
async function beginAnswer() {
  if (!P) return;
  if (P.silent) { P.t0 = Date.now(); P.stage = 'rec'; rerender(); ensureTicker(); return; }
  try {
    await openMic();
    P.micErr = '';
    startRec(P.part);
    P.t0 = Date.now(); P.stage = 'rec';
    rerender(); ensureTicker();
  } catch (e) { micError(e); }
}
async function finishRec() {
  if (!P || !['rec', 'speak'].includes(P.stage)) return;
  const part = P.part, qi = P.stage === 'speak' ? -1 : P.qi;
  const wasTalk = P.stage === 'speak';
  P.stage = 'saving';
  let res;
  if (P.silent) {
    const ms = Math.min(Date.now() - P.t0, LIMIT[part]);
    res = { ms, speakMs: ms, pauses: 0, longest: 0, silent: true };
  } else res = await stopRec();
  if (!P) return;
  if (res) await saveTake(res, part, qi);
  P.stage = wasTalk ? 'p2review' : 'review';
  if (wasTalk) await countTurn(); // xong bài nói Part 2 = một lượt trong ngày
  rerender(true);
}
function beginTalk() {
  if (!P || P.stage !== 'prep') return;
  P.stage = 'speak'; P.part = 2; P.warned = false;
  if (!P.silent && Mic.stream) {
    try { startRec(2); } catch (e) { micError(e); return; }
  }
  P.t0 = Date.now();
  rerender(); ensureTicker();
  navigator.vibrate?.(120);
}

// ---------------------------------------------------------------- Hành động
on('sp-quarter', (el) => { ui.quarter = el.dataset.q; rerender(); });
on('sp-tab', (el) => { ui.tab = el.dataset.tab; rerender(); });
on('sp-open', (el) => { const id = el.dataset.id; P = newSession(id.includes('-p1-') ? 'p1' : 'p23', id); go(`#/${P.kind === 'p1' ? 'sp1' : 'sp2'}/${encodeURIComponent(id)}`); if (P.kind === 'p1') setTimeout(sayQuestion, 350); });
on('sp-say', (el) => say(el.dataset.text));
on('sp-ask-again', () => sayQuestion());
on('sp-vi', () => { ui.showVi = !ui.showVi; rerender(); });
on('sp-silent', () => { P.silent = !P.silent; P.micErr = ''; rerender(); });
on('sp-rec', () => beginAnswer());
on('sp-stop', () => finishRec());
on('sp-again', async () => { P.stage = P.kind === 'p23' && P.part === 2 ? 'speak' : 'ask'; if (P.stage === 'speak') { try { if (!P.silent) { await openMic(); startRec(2); } P.t0 = Date.now(); P.warned = false; rerender(); ensureTicker(); } catch (e) { P.stage = 'p2review'; micError(e); } } else beginAnswer(); });
on('sp-next', () => {
  const qs = curQs();
  if (P.qi + 1 < qs.length) { P.qi++; P.stage = 'ask'; rerender(true); sayQuestion(); }
  else { P.stage = 'done'; closeMic(); stopTicker(); rerender(true); }
});
on('sp-skip', () => {
  const qs = curQs();
  if (P.qi + 1 < qs.length) { P.qi++; P.stage = 'ask'; rerender(true); sayQuestion(); }
  else { P.stage = 'done'; closeMic(); stopTicker(); rerender(true); }
});
on('sp-finish', async () => {
  const answered = Object.keys(P.ans).length;
  if (!answered) { if (await confirmSheet({ title: 'Thoát lượt luyện?', body: 'Bạn chưa ghi câu nào.', okLabel: 'Thoát' })) { closeMic(); stopTicker(); P = null; back('#/speaking'); } return; }
  if (rec) await finishRec();
  P.stage = 'done'; closeMic(); stopTicker(); rerender(true);
});
on('sp-quit', async () => {
  if (P && Object.keys(P.ans).length && P.stage !== 'done' && !(await confirmSheet({ title: 'Thoát lượt luyện?', body: 'Các bản ghi đã lưu vẫn còn, nhưng lượt này chưa được tự chấm.', okLabel: 'Thoát' }))) return;
  closeMic(); stopTicker(); P = null; back('#/speaking');
});
// Part 2
on('sp-prep', async () => {
  P.part = 2;
  if (!P.silent) { try { await openMic(); P.micErr = ''; } catch (e) { micError(e); return; } }
  P.stage = 'prep'; P.deadline = Date.now() + 60e3;
  rerender(); ensureTicker();
  setTimeout(() => document.getElementById('sp-notes')?.focus({ preventScroll: true }), 80);
});
on('sp-talk-now', () => beginTalk());
on('sp-notes', (el) => { P.notes = el.value; });
on('sp-to-p3', () => { P.part = 3; P.qi = 0; P.stage = 'ask'; rerender(true); sayQuestion(); });
on('sp-keep', async (el) => {
  const t = S.speaking.get(el.dataset.id);
  if (!t) return;
  await spPut({ ...t, keep: !t.keep });
  toast(t.keep ? 'Bỏ giữ lại: bản ghi sẽ tự xoá sau 30 ngày' : 'Đã giữ lại bản ghi này');
  rerender();
});
on('sp-self', (el) => {
  const [c, i] = el.dataset.k.split(':');
  (P.self[c] ||= [])[Number(i)] = el.dataset.v === '1' ? 1 : 0;
  rerender();
});
on('sp-save', async () => {
  const g = getItem(P.id);
  const takes = Object.values(P.ans).map((ids) => S.speaking.get(ids[ids.length - 1])).filter(Boolean);
  const self = {};
  for (const c of Object.keys(SELF)) self[c] = SELF[c].items.map((_, i) => P.self[c]?.[i] ?? 0);
  await spPut({
    id: P.sid, kind: 'session', item: P.id, part: P.kind === 'p1' ? 1 : 2, title: g?.item?.title || '', quarter: g?.q?.id || '', at: Date.now(), date: today(),
    takes: takes.length, speakMs: takes.reduce((a, t) => a + (t.speakMs || 0), 0), pauses: takes.reduce((a, t) => a + (t.pauses || 0), 0), self,
  });
  await countTurn();
  toast('Đã lưu lượt luyện');
  P = null;
  replaceBack();
});
function replaceBack() { go('#/speaking'); }
function sayQuestion() {
  if (!P || P.stage !== 'ask') return;
  const q = curQs()[P.qi];
  if (q) say(q.q.split(' / ')[0]);
}

// ---------------------------------------------------------------- Tự chấm (S5)
// Câu Có/Chưa rút từ mô tả band 5–7 của giám khảo; không quy đổi ra band.
export const SELF = {
  fc: { name: 'Fluency & Coherence', items: ['Nói liền mạch, ít dừng lâu để tìm từ', 'Câu trả lời có lý do và ví dụ, không chỉ một câu', 'Dùng được từ nối (because, so, for example, however…)'] },
  lr: { name: 'Lexical Resource', items: ['Dùng được ít nhất 2 cụm đúng chủ đề (lấy từ bài mẫu cũng được)', 'Quên từ thì diễn đạt cách khác thay vì dừng lại'] },
  gr: { name: 'Grammar', items: ['Có câu phức (because, when, which, if…)', 'Chia thì đúng, nhất là quá khứ khi kể chuyện', 'Lỗi không làm người nghe hiểu sai'] },
  pr: { name: 'Pronunciation', items: ['Nghe lại thấy rõ âm cuối (-s, -ed, -t)', 'Nói rõ ràng, so với giọng mẫu không bị khó nghe'] },
};
const BANDS = `<details class="sp-bands"><summary>Bảng mô tả band 5–7 (rút gọn)</summary>
  <table class="small"><tr><th></th><th>Band 5</th><th>Band 6</th><th>Band 7</th></tr>
  <tr><td>Trôi chảy</td><td>Hay dừng, lặp lại, câu ngắn</td><td>Nói dài được, đôi lúc ngập ngừng</td><td>Nói dài dễ dàng, ngập ngừng do tìm ý chứ không do tìm từ</td></tr>
  <tr><td>Từ vựng</td><td>Đủ cho chủ đề quen</td><td>Đủ để bàn lâu, biết diễn đạt lại</td><td>Có collocation, từ ít gặp, dùng linh hoạt</td></tr>
  <tr><td>Ngữ pháp</td><td>Chủ yếu câu đơn, nhiều lỗi</td><td>Có câu phức, còn lỗi nhưng hiểu được</td><td>Nhiều câu phức, phần lớn câu không lỗi</td></tr>
  <tr><td>Phát âm</td><td>Đôi chỗ khó hiểu</td><td>Hiểu được, chưa đều</td><td>Dễ hiểu, ngữ điệu tự nhiên</td></tr></table></details>`;

// ---------------------------------------------------------------- Màn hình chung
const loadingCard = (msg = 'Đang tải đề…') => (SP.state === 'error'
  ? `<div class="card"><b>Không tải được đề</b><p class="small muted" style="margin-top:4px">${esc(SP.error)}</p></div>`
  : `<div class="card" style="display:flex;gap:12px;align-items:center"><div class="spin"></div><span class="muted">${msg}</span></div>`);
const ring = (value, goal) => {
  const c = 2 * Math.PI * 24;
  const p = goal ? Math.min(1, value / goal) : 0;
  return `<svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="24"/><circle class="fg" cx="30" cy="30" r="24" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
};
export const todaySpeaking = () => (dayOf().sTurns || []).length;
const sessions = () => [...S.speaking.values()].filter((r) => r.kind === 'session').sort((a, b) => b.at - a.at);
/** Các chủ đề / đề đã luyện (đã tự chấm, hoặc đã tính lượt trong ngày). */
function doneItems() {
  const m = new Set(sessions().map((s) => s.item));
  for (const d of S.days.values()) for (const x of d.sTurns || []) m.add(x);
  return m;
}
/** Gợi ý lượt tiếp theo: chủ đề Part 1 hoặc đề Part 2 chưa luyện ở quý mới nhất. */
export function nextSpeaking() {
  if (SP.state !== 'ready' || !SP.quarters.length) return null;
  const done = doneItems();
  const q = SP.quarters[0];
  const p1 = q.p1.topics.find((t) => !done.has(t.id));
  const p2 = q.p23.cards.find((c) => !done.has(c.id));
  return { p1, p2, q };
}

function speakBtn(text, label = '') {
  return `<button class="iconbtn sp-say" data-act="sp-say" data-text="${esc(text)}" aria-label="Nghe">${icon('speaker', 'sm')}${label ? `<span>${label}</span>` : ''}</button>`;
}
function vocabList(list) {
  if (!list?.length) return '';
  return `<div class="sp-vocab">${list.map((v) => `<div class="sp-v"><b class="en">${md(v.p)}</b>${v.m ? ` <span>— ${md(v.m)}</span>` : ''}${v.u ? `<small>${md(v.u)}</small>` : ''}${v.e ? `<small class="sp-err">${md(v.e)}</small>` : ''}</div>`).join('')}</div>`;
}
function samples(x, { part }) {
  const n6 = words(x.a6), n7 = words(x.a7);
  return `<div class="sp-samples">
    <div class="sp-sample"><div class="row-between"><span class="tag">Bản 6.0–6.5 · ${n6} từ</span>${speakBtn(x.a6.replace(/\*/g, ''))}</div><div class="en sp-text">${paras(x.a6)}</div></div>
    <div class="sp-sample b7"><div class="row-between"><span class="tag on">Bản 7.0 · ${n7} từ</span>${speakBtn(x.a7.replace(/\*/g, ''))}</div><div class="en sp-text">${paras(x.a7)}</div></div>
  </div>
  ${part !== 2 && x.vocab?.length ? `<h4 class="sp-h">Cụm hay</h4>${vocabList(x.vocab)}` : ''}
  ${part !== 2 && x.grammar ? `<p class="small sp-gram">${md(x.grammar)}</p>` : ''}`;
}
function takeRow(t, label) {
  const url = audioUrl(t);
  const meta = t.silent ? `${mmss(t.ms)} · không ghi âm` : `${mmss(t.ms)} · nói thật ${sec(t.speakMs)} · ${t.pauses} lần dừng > 2″`;
  return `<div class="sp-take"><div class="row-between"><b>${label}</b><span class="small muted">${meta}</span></div>
    ${url ? `<audio controls preload="none" src="${url}"></audio>` : t.silent ? '' : `<p class="small faint">${t.dropped ? `Âm thanh đã tự xoá sau ${SP_KEEP_DAYS} ngày` : 'Không có âm thanh'}</p>`}
    ${url ? `<button class="tag ${t.keep ? 'on' : ''}" data-act="sp-keep" data-id="${t.id}">${t.keep ? 'Đang giữ lại' : `Giữ lại (mặc định xoá sau ${SP_KEEP_DAYS} ngày)`}</button>` : ''}</div>`;
}
function statsLine(t, part) {
  if (!t) return '';
  const short = t.ms < SHORT[part];
  const tip = part === 1 ? 'Thử thêm lý do và ví dụ để được 20–30 giây.' : part === 3 ? 'Thử quan điểm → giải thích → ví dụ để được 40–60 giây.' : 'Giám khảo để bạn nói đủ 2 phút; nên nói ít nhất 1:40.';
  return `<div class="tiles sp-tiles"><div class="tile"><b>${mmss(t.ms)}</b><span>thời lượng</span></div><div class="tile"><b>${t.silent ? '–' : sec(t.speakMs)}</b><span>nói thật</span></div><div class="tile"><b>${t.silent ? '–' : t.pauses}</b><span>dừng &gt; 2″</span></div></div>
    ${short ? `<p class="small sp-warn">Hơi ngắn. ${tip}</p>` : ''}`;
}
function compare(list, part) {
  if (list.length < 2) return '';
  const [a, b] = [list[list.length - 2], list[list.length - 1]];
  const d = (x, y, unit = '') => { const v = y - x; return v === 0 ? 'bằng' : `${v > 0 ? '+' : ''}${unit === 's' ? Math.round(v / 1000) + '″' : v}`; };
  return `<p class="small sp-compare">So với bản trước: thời lượng ${d(a.ms, b.ms, 's')} · nói thật ${d(a.speakMs, b.speakMs, 's')} · khoảng dừng ${d(a.pauses, b.pauses)}</p>`;
}
function history(part, qi) {
  if (!P) return '';
  const old = [...S.speaking.values()].filter((t) => t.kind === 'take' && t.item === P.id && t.part === part && t.qi === qi && t.sid !== P.sid).sort((a, b) => b.at - a.at).slice(0, 3);
  if (!old.length) return '';
  return `<details class="sp-hist"><summary>Các lần trước (${old.length})</summary>${old.map((t) => takeRow(t, fmtDate(t.date))).join('')}</details>`;
}
function micBox() {
  if (!P.micErr) return '';
  return `<div class="banner" style="margin-top:12px">${icon('info')}<span>${esc(P.micErr)}<br><button class="link" data-act="sp-silent" style="margin-top:6px">Luyện không ghi âm (chỉ bấm giờ)</button></span></div>`;
}
const silentTag = () => `<button class="tag ${P.silent ? 'on' : ''}" data-act="sp-silent" title="Không ghi âm, vẫn bấm giờ và tự chấm">${P.silent ? 'Đang nói thầm' : 'Nói thầm'}</button>`;

// ---------------------------------------------------------------- Trang chính
export function speakingView() {
  const head = `<header class="top"><div><p class="eyebrow">Forecast theo quý</p><h1>Speaking</h1></div>
    <button class="iconbtn tonal" data-act="go" data-to="#/mictest" aria-label="Thử micro">${icon('ear')}</button></header>${learnSwitch('speaking')}`;
  if (SP.state !== 'ready') return `<div class="page">${head}${loadingCard('Đang tải danh sách đề…')}</div>`;
  const q = SP.quarters.find((x) => x.id === ui.quarter) || SP.quarters[0];
  const goal = S.settings.speakingPerDay, done = todaySpeaking();
  const nx = nextSpeaking();
  const doneMap = doneItems();
  const todayCard = `<div class="card"><div class="row-between"><div style="min-width:0"><p class="small muted">${goal ? `Hôm nay: ${done}/${goal} lượt` : `Hôm nay: ${done} lượt`} · 1 lượt = 1 chủ đề Part 1 hoặc 1 đề Part 2</p>
      ${nx?.p1 ? `<b style="display:block;margin-top:4px">Gợi ý: ${esc(nx.p1.title)}</b><p class="small muted">Part 1 · ${nx.p1.n} câu · ${esc(nx.q.title)}</p>` : ''}</div>${goal ? ring(done, goal) : ''}</div>
    <div class="btn-row" style="margin-top:14px">${nx?.p1 ? `<button class="btn" data-act="sp-open" data-id="${nx.p1.id}">Luyện Part 1</button>` : ''}${nx?.p2 ? `<button class="btn ${nx?.p1 ? 'ghost' : ''}" data-act="sp-open" data-id="${nx.p2.id}">Part 2 &amp; 3</button>` : ''}</div></div>`;
  const qSeg = SP.quarters.length > 1 ? `<div class="seg" style="margin-top:16px">${SP.quarters.map((x) => `<button class="${x.id === q.id ? 'on' : ''}" data-act="sp-quarter" data-q="${x.id}">${esc(x.title)}</button>`).join('')}</div>` : '';
  const tSeg = `<div class="seg" style="margin-top:10px"><button class="${ui.tab === 'p1' ? 'on' : ''}" data-act="sp-tab" data-tab="p1">Part 1 · ${q.p1.topics.length}</button><button class="${ui.tab === 'p23' ? 'on' : ''}" data-act="sp-tab" data-tab="p23">Part 2 &amp; 3 · ${q.p23.cards.length}</button></div>`;
  const row = (id, num, title, sub) => {
    const d = doneMap.has(id);
    return `<div class="wrow" data-act="sp-open" data-id="${id}" role="button"><span class="num ${d ? 'done' : ''}">${d ? icon('check', 'sm') : num}</span><div class="body"><span style="font-weight:600">${esc(title)}</span><p>${sub}</p></div>${icon('chev')}</div>`;
  };
  const list = ui.tab === 'p1'
    ? q.p1.topics.map((t, i) => row(t.id, t.c ? '★' : i + 1 - q.p1.topics.filter((x) => x.c).length, t.title, `${t.n} câu${t.c ? ' · chủ đề bắt buộc (luôn có)' : ''}`)).join('')
    : q.p23.cards.map((c) => row(c.id, c.n, c.title.replace(/^Describe\s+/i, ''), `Part 2 · ${c.q3} câu Part 3`)).join('');
  const ss = sessions();
  const week = ss.filter((s) => Date.now() - s.at < 7 * 864e5);
  const prog = ss.length ? `<h2>Tiến bộ</h2><div class="card">
      <p class="small muted">7 ngày qua: ${week.length} lượt · nói thật ${Math.round(week.reduce((a, s) => a + s.speakMs, 0) / 60000)} phút</p>
      ${ss.slice(0, 6).map((s) => {
        const yes = s.self ? Object.entries(s.self).map(([k, v]) => `${k.toUpperCase()} ${v.filter(Boolean).length}/${v.length}`).join(' · ') : 'chưa tự chấm';
        return `<div class="sp-prog"><div class="row-between"><b class="small">${esc(s.title || s.item)}</b><span class="small muted">${fmtDate(s.date)}</span></div><p class="small muted">${s.takes} bản ghi · nói thật ${sec(s.speakMs)} · ${s.pauses} lần dừng · ${yes}</p></div>`;
      }).join('')}</div>` : '';
  return `<div class="page">${head}${todayCard}${qSeg}${tSeg}<div class="wlist" style="margin-top:10px">${list}</div>${prog}
    <p class="small faint" style="margin:14px 2px 0">App đo thời gian nói và khoảng dừng để bạn tự theo dõi, không chấm band. Bản ghi tự xoá sau ${SP_KEEP_DAYS} ngày, trừ bản bạn bấm “Giữ lại”.</p></div>`;
}

// ---------------------------------------------------------------- Part 1 và Part 3 (từng câu)
function questionScreen(q, qi, total, part, nav) {
  const list = takesOf(part, qi);
  const last = list[list.length - 1];
  const head = `<p class="mode-label">${part === 1 ? 'Part 1' : 'Part 3'} · câu ${qi + 1}/${total}${q.extra ? ' · câu thêm' : ''}</p>
    <div class="sp-q"><div class="row-between" style="align-items:flex-start;gap:10px"><p class="sp-qtext">${md(q.q)}</p>${speakBtn(q.q.split(' / ')[0])}</div>
      ${q.vi ? (ui.showVi ? `<p class="small muted" style="margin-top:6px">${md(q.vi)}</p>` : `<button class="link small" data-act="sp-vi" style="margin-top:4px">Xem nghĩa</button>`) : ''}</div>`;
  let body = '', actions = '';
  if (P.stage === 'ask') {
    body = `<p class="small sp-frame">${icon('info', 'sm')} ${FRAME[part]}</p>
      <p class="small faint" style="margin-top:6px">Cụm “mua thời gian”: ${STALL.map((x) => `<i>${esc(x)}</i>`).join(' · ')}</p>${micBox()}`;
    actions = `<div class="btn-row"><button class="btn ghost" data-act="sp-skip" style="flex:.55">Bỏ qua</button><button class="btn" data-act="sp-rec">${P.silent ? 'Bắt đầu nói' : 'Ghi âm câu trả lời'}</button></div>`;
  } else if (P.stage === 'rec') {
    body = `<div class="card sp-recbox"><p><b>${P.silent ? 'Đang bấm giờ…' : 'Đang ghi…'}</b> <span id="sp-clock" class="muted">0:00 / ${mmss(LIMIT[part])}</span></p>${P.silent ? '' : '<div class="mt-meter"><i id="sp-level"></i></div>'}
      <p class="small faint" style="margin-top:8px">${FRAME[part]}</p></div>`;
    actions = `<button class="btn" data-act="sp-stop">Dừng</button>`;
  } else if (P.stage === 'saving') {
    body = loadingCard('Đang lưu bản ghi…');
  } else {
    body = `${statsLine(last, part)}${compare(list, part)}
      ${list.map((t, i) => takeRow(t, `Bản ${i + 1}`)).join('')}
      <h4 class="sp-h">Bài mẫu</h4>${samples(q, { part })}${history(part, qi)}`;
    actions = `<div class="btn-row"><button class="btn ghost" data-act="sp-again" style="flex:.8">Nói lại bản ${list.length + 1}</button><button class="btn" data-act="sp-next">${qi + 1 < total ? 'Câu tiếp theo' : 'Xong, tự chấm'}</button></div>`;
  }
  return `<div class="page session sp-page">${nav}<div class="ses-body">${head}${body}</div><div class="ses-actions">${actions}</div></div>`;
}
function topBar(title) {
  return `<div class="ses-top"><button class="iconbtn" data-act="sp-quit" aria-label="Thoát">${icon('x')}</button><b class="sp-title">${esc(title)}</b>${silentTag()}<button class="tag" data-act="sp-finish">Kết thúc</button></div>`;
}
function doneScreen(title, nav) {
  const all = Object.entries(P.ans).map(([k, ids]) => ({ k, t: S.speaking.get(ids[ids.length - 1]), n: ids.length })).filter((x) => x.t);
  const sum = all.reduce((a, x) => a + (x.t.speakMs || 0), 0), pauses = all.reduce((a, x) => a + (x.t.pauses || 0), 0);
  const selfRows = Object.entries(SELF).map(([c, def]) => `<div class="sp-self"><b>${def.name}</b>${def.items.map((txt, i) => {
    const v = P.self[c]?.[i];
    return `<div class="row-between sp-yn"><span class="small">${esc(txt)}</span><span class="seg sm"><button class="${v === 1 ? 'on' : ''}" data-act="sp-self" data-k="${c}:${i}" data-v="1">Có</button><button class="${v === 0 ? 'on' : ''}" data-act="sp-self" data-k="${c}:${i}" data-v="0">Chưa</button></span></div>`;
  }).join('')}</div>`).join('');
  return `<div class="page session sp-page">${nav}<div class="ses-body">
    <p class="mode-label">Xong lượt luyện</p><h2 style="margin-top:6px;text-transform:none;font-size:20px;color:var(--text);letter-spacing:0">${esc(title)}</h2>
    <div class="tiles sp-tiles"><div class="tile"><b>${all.length}</b><span>câu đã nói</span></div><div class="tile"><b>${sec(sum)}</b><span>nói thật</span></div><div class="tile"><b>${pauses}</b><span>dừng &gt; 2″</span></div></div>
    <p class="small muted" style="margin-top:10px">Đây là dấu hiệu để tự theo dõi, không phải điểm. Nghe lại bản ghi rồi tự chấm theo từng câu dưới đây.</p>
    ${selfRows}${BANDS}</div>
    <div class="ses-actions"><button class="btn" data-act="sp-save">Lưu tự chấm</button></div></div>`;
}
export function sp1View(id) {
  id = decodeURIComponent(id || '');
  if (SP.state !== 'ready') return `<div class="page">${navBar('Part 1', { fallback: '#/speaking' })}${loadingCard()}</div>`;
  const g = getItem(id);
  if (!g) return `<div class="page">${navBar('Part 1', { fallback: '#/speaking' })}${loadingCard()}</div>`;
  if (!g.item) return `<div class="page">${navBar('Part 1', { fallback: '#/speaking' })}<div class="card">Không tìm thấy chủ đề này.</div></div>`;
  if (!P || P.id !== id) P = newSession('p1', id);
  const t = g.item;
  const nav = topBar(`${t.title}`);
  if (P.stage === 'done') return doneScreen(`Part 1 · ${t.title}`, nav);
  const qs = mainQs(t);
  const note = P.qi === 0 && P.stage === 'ask' && t.note ? `<p class="small faint sp-note">${md(t.note)}</p>` : '';
  const html = questionScreen(qs[P.qi], P.qi, qs.length, 1, nav);
  return note ? html.replace('<div class="ses-body">', `<div class="ses-body">${note}`) : html;
}

// ---------------------------------------------------------------- Part 2 & 3
function cueCard(c) {
  return `<div class="card sp-cue"><p class="sp-cue-t">${md(c.title)}</p><p class="small muted" style="margin-top:8px">You should say:</p>
    <ul>${c.points.map((p) => `<li>${md(p)}</li>`).join('')}</ul>
    ${c.guess ? '<p class="small faint">Gợi ý cue card do app soạn theo bảng ghi chú vì file nguồn không có đề gốc.</p>' : ''}</div>`;
}
function notesTable(c) {
  if (!c.notes?.length) return '';
  return `<table class="sp-notes small">${c.notes.map((n) => `<tr><td>${md(n.k)}</td><td>${md(n.v)}</td></tr>`).join('')}</table>`;
}
export function sp2View(id) {
  id = decodeURIComponent(id || '');
  if (SP.state !== 'ready') return `<div class="page">${navBar('Part 2 & 3', { fallback: '#/speaking' })}${loadingCard()}</div>`;
  const g = getItem(id);
  if (!g) return `<div class="page">${navBar('Part 2 & 3', { fallback: '#/speaking' })}${loadingCard()}</div>`;
  if (!g.item) return `<div class="page">${navBar('Part 2 & 3', { fallback: '#/speaking' })}<div class="card">Không tìm thấy đề này.</div></div>`;
  if (!P || P.id !== id) P = newSession('p23', id);
  const c = g.item;
  const nav = topBar(`Đề ${c.n}`);
  if (P.stage === 'done') return doneScreen(`Part 2 & 3 · ${c.title}`, nav);
  if (P.part === 3) return questionScreen(c.p3[P.qi], P.qi, c.p3.length, 3, nav);
  const talks = takesOf(2, -1);
  const last = talks[talks.length - 1];
  let body = '', actions = '';
  if (P.stage === 'card') {
    body = `<p class="mode-label">Part 2 · thẻ đề</p>${cueCard(c)}
      ${c.note ? `<p class="small faint sp-note">${md(c.note)}</p>` : ''}
      <p class="small sp-frame">${icon('info', 'sm')} ${FRAME[2]}</p>${micBox()}`;
    actions = `<div class="btn-row"><button class="btn ghost" data-act="sp-say" data-text="${esc(c.title + '. You should say: ' + c.points.join('; '))}" style="flex:.6">${icon('speaker', 'sm')} Nghe đề</button><button class="btn" data-act="sp-prep">Bắt đầu · 1 phút chuẩn bị</button></div>`;
  } else if (P.stage === 'prep') {
    body = `<p class="mode-label">Chuẩn bị · <span id="sp-clock">${mmss(P.deadline - Date.now())}</span></p>${cueCard(c)}
      <label class="small muted" for="sp-notes">Ghi từ khoá (không viết câu)</label>
      <textarea id="sp-notes" class="input sp-notesbox" data-in="sp-notes" rows="4" autocapitalize="none" placeholder="vd: Hung – uni – 8 years – keyboard – types all day">${esc(P.notes)}</textarea>
      ${notesTable(c) ? `<details class="sp-hist"><summary>Xem ghi chú mẫu</summary>${notesTable(c)}</details>` : ''}`;
    actions = `<button class="btn" data-act="sp-talk-now">Nói ngay</button>`;
  } else if (P.stage === 'speak') {
    body = `<p class="mode-label">${P.silent ? 'Đang bấm giờ' : 'Đang ghi'} · còn <span id="sp-clock">${mmss(LIMIT[2] - (Date.now() - P.t0))}</span></p>
      ${P.silent ? '' : '<div class="mt-meter"><i id="sp-level"></i></div>'}${cueCard(c)}
      ${P.notes ? `<div class="card small sp-mynotes"><b>Ghi chú của bạn</b><p>${esc(P.notes)}</p></div>` : ''}`;
    actions = `<button class="btn" data-act="sp-stop">Dừng</button>`;
  } else if (P.stage === 'saving') {
    body = loadingCard('Đang lưu bản ghi…');
  } else { // p2review
    body = `<p class="mode-label">Part 2 · kết quả</p><p class="sp-cue-t" style="margin:6px 0 4px">${md(c.title)}</p>
      ${statsLine(last, 2)}${compare(talks, 2)}${talks.map((t, i) => takeRow(t, `Bản ${i + 1}`)).join('')}
      ${P.notes ? `<div class="card small sp-mynotes"><b>Ghi chú của bạn</b><p>${esc(P.notes)}</p></div>` : ''}
      <h4 class="sp-h">Bài mẫu</h4>${samples(c, { part: 2 })}
      ${notesTable(c) ? `<h4 class="sp-h">Ghi chú 1 phút mẫu</h4>${notesTable(c)}` : ''}
      ${c.vocab?.length ? `<h4 class="sp-h">Cụm hay</h4>${vocabList(c.vocab)}` : ''}
      ${c.grammar?.length ? `<h4 class="sp-h">Ngữ pháp dùng trong bài</h4><ul class="small sp-gl">${c.grammar.map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
      ${history(2, -1)}`;
    actions = `<div class="btn-row"><button class="btn ghost" data-act="sp-again" style="flex:.8">Nói lại bản ${talks.length + 1}</button>${c.p3.length ? `<button class="btn" data-act="sp-to-p3">Sang Part 3 · ${c.p3.length} câu</button>` : '<button class="btn" data-act="sp-finish">Xong, tự chấm</button>'}</div>`;
  }
  return `<div class="page session sp-page">${nav}<div class="ses-body">${body}</div><div class="ses-actions">${actions}</div></div>`;
}

// ---------------------------------------------------------------- Sao lưu kèm âm thanh (tuỳ chọn)
export const audioTakes = () => [...S.speaking.values()].filter((r) => r.kind === 'take' && r.audio);
export async function audioForBackup() {
  const out = {};
  for (const t of audioTakes()) {
    const buf = new Uint8Array(await t.audio.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    out[t.id] = { type: t.audio.type || t.mime || 'audio/mp4', b64: btoa(bin) };
  }
  return out;
}
export const _sp = { getItem, mainQs, md };
