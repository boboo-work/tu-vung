// Trò "Ý tưởng 60 giây" (Writing Task 2).
//  Lấy 30 đề Task 2 trong app: mỗi lượt 5 thẻ, mỗi thẻ là một đề + một việc nhỏ (viết lại đề, nêu quan điểm, ý chính thân bài 1/2, câu kết).
//  60 giây nghĩ và ghi nhanh ý (gõ hoặc chỉ nghĩ) → xem câu mẫu của phần đó (tô cụm hay kèm nghĩa) → ghép lại câu mẫu bị xáo thành 4–6 mảnh
//  (cụm hay giữ nguyên một mảnh để nhớ cả cụm) → tự chấm theo tiêu chí của phần đó.
//  Mỗi lượt có trả lời tính vào chuỗi ngày học, không tính vào mục tiêu Writing. Thẻ ghép sai quay lại các lượt sau.
import { S, saveHunt, logGrammarDay } from './store.js';
import { esc, toast, uid, shuffle } from './util.js';
import { icon, on, go, back, replace, rerender, confirmSheet } from './ui.js';
import { W, loadWriting } from './writing.js';
import { openWordSheet } from './reading.js';
import { mochi, bolt, kit } from './hunt.js';
import { chalReport } from './challenge.js';

// ---------------------------------------------------------------- Dữ liệu
const TASKS = {
  para: { name: 'Viết lại đề', ask: 'Nói lại đề bằng cách diễn đạt khác', hint: 'Đổi từ khoá sang từ đồng nghĩa, đổi cấu trúc câu, giữ nguyên ý.' },
  thesis: { name: 'Câu quan điểm', ask: 'Bạn trả lời câu hỏi của đề thế nào?', hint: '' },
  body1: { name: 'Ý chính thân bài 1', ask: 'Ý chính của đoạn thân bài thứ nhất là gì?', hint: 'Một câu chủ đề: nêu ý, chưa cần ví dụ.' },
  body2: { name: 'Ý chính thân bài 2', ask: 'Ý chính của đoạn thân bài thứ hai là gì?', hint: 'Mặt còn lại, hoặc câu hỏi thứ hai / giải pháp.' },
  concl: { name: 'Câu kết luận', ask: 'Câu kết: tóm lại quan điểm của bạn', hint: 'Nhắc lại quan điểm bằng cách nói khác, không thêm ý mới.' },
};
const sentences = (t) => String(t).match(/[^.!?]+[.!?]+(?=\s|$)/g)?.map((x) => x.trim()) || [String(t).trim()];
/** Câu mẫu của một phần: thân bài và kết luận lấy câu đầu (câu chủ đề / câu tóm ý); câu đầu ngắn thì lấy thêm câu sau. */
function modelOf(p, part) {
  const t = String(p.model?.[part] || '').trim();
  if (!['body1', 'body2', 'concl'].includes(part)) return t;
  const ss = sentences(t);
  return ss[0].split(/\s+/).length < 14 && ss[1] ? `${ss[0]} ${ss[1]}` : ss[0];
}
/** Cụm hay của đề có trong câu mẫu (khớp không phân biệt hoa thường). */
function phrasesIn(p, sent) {
  const out = [];
  for (const ph of p.phrases || []) {
    const i = sent.toLowerCase().indexOf(String(ph.en).toLowerCase());
    if (i >= 0 && out.every((x) => i >= x.e || i + ph.en.length <= x.s)) out.push({ s: i, e: i + ph.en.length, t: sent.slice(i, i + ph.en.length), vi: ph.vi });
  }
  return out.sort((a, b) => a.s - b.s);
}
const BREAK = new Set(['because', 'which', 'who', 'that', 'although', 'while', 'whereas', 'since', 'so', 'but', 'and', 'or', 'if', 'when', 'as', 'to', 'for', 'in', 'on', 'by', 'with', 'than', 'rather', 'such', 'would', 'should', 'can', 'could', 'will', 'may', 'might', 'must']);
// Không ngắt ngay sau các từ này (tách khỏi từ đi sau thì mảnh vô nghĩa: "it | is", "the | cost").
const GLUE = new Set(['it', 'this', 'that', 'there', 'the', 'a', 'an', 'to', 'of', 'not', 'very', 'more', 'most', 'their', 'its', 'his', 'her', 'our', 'my', 'your', 'such', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had']);
/** Chia câu mẫu thành 4–6 mảnh: ưu tiên ngắt sau dấu phẩy và trước từ nối/giới từ; cụm hay không bị cắt. */
function chunk(sent, phrases) {
  const words = [...sent.matchAll(/\S+/g)].map((m) => ({ t: m[0], s: m.index, e: m.index + m[0].length }));
  const n = words.length;
  if (n < 6) return null;
  const want = Math.max(4, Math.min(6, Math.round(n / 5)));
  const inPhrase = (i) => phrases.some((p) => words[i].s >= p.s && words[i].s < p.e && words[i - 1] && words[i - 1].s >= p.s);
  // Điểm ngắt trước từ i (1..n-1).
  const cand = [];
  for (let i = 1; i < n; i++) {
    if (inPhrase(i)) continue;
    const prev = words[i - 1].t, w = words[i].t.toLowerCase().replace(/[^a-z']/g, '');
    if (GLUE.has(prev.toLowerCase().replace(/[^a-z']/g, '')) && !/[,;:.!?]$/.test(prev)) continue;
    let sc = /[.!?]$/.test(prev) ? 8 : /[,;:–—]$/.test(prev) ? 5 : BREAK.has(w) ? 3 : 0;
    if (sc) cand.push({ i, sc });
  }
  const ideal = (k) => Math.round((n * k) / want);
  const cuts = cand.filter((c) => c.sc === 8).map((c) => c.i); // luôn ngắt giữa hai câu
  for (let k = 1; k < want; k++) {
    const target = ideal(k);
    if (cuts.length >= want - 1) break;
    const best = cand.filter((c) => !cuts.some((x) => Math.abs(x - c.i) < 2) && c.i < n - 1).sort((a, b) => Math.abs(a.i - target) * 2 - a.sc - (Math.abs(b.i - target) * 2 - b.sc))[0];
    if (best && Math.abs(best.i - target) <= 5) cuts.push(best.i); // chỉ ngắt ở chỗ tự nhiên (dấu phẩy, trước từ nối/giới từ)
  }
  cuts.sort((a, b) => a - b);
  const bounds = [0, ...cuts, n];
  const parts = [];
  for (let k = 0; k + 1 < bounds.length; k++) parts.push(sent.slice(words[bounds[k]].s, words[bounds[k + 1] - 1].e));
  const uniq = new Set(parts.map((x) => x.toLowerCase()));
  return parts.length >= 4 && uniq.size === parts.length ? parts : null;
}
function buildCards() {
  const out = [];
  for (const id of W.order) {
    const p = W.prompts.get(id);
    if (!p?.model) continue;
    for (const part of Object.keys(TASKS)) {
      const sent = modelOf(p, part);
      if (!sent || sent.split(/\s+/).length < 6) continue;
      const phrases = phrasesIn(p, sent);
      const chunks = chunk(sent, phrases);
      if (!chunks) continue;
      const key = `wr-${String(p.id).toLowerCase().replace(/[^a-z0-9-]/g, '')}|${part}|0`;
      out.push({ key, pid: p.id, type: p.type, topic: p.topic, q: p.q, part, sent, phrases, chunks, allPhrases: p.phrases || [] });
    }
  }
  return out;
}
/** Dùng cho kiểm thử. */
export const _id = { chunk, buildCards, modelOf, get I() { return I; } };

// ---------------------------------------------------------------- Thống kê (nằm chung S.hunt)
const hunt = () => S.hunt || (S.hunt = { plays: 0, best: 0, wrong: {}, pos: {}, seen: {} });
const st = () => hunt().idea || (hunt().idea = { plays: 0, best: 0, n: 0, ok: 0 });
const wrongKeys = () => Object.keys(hunt().wrong).filter((k) => k.startsWith('wr-'));
export function ideaStats() { const s = st(); return { ...s, acc: s.n ? Math.round((s.ok / s.n) * 100) : null }; }

// ---------------------------------------------------------------- Chọn thẻ
const SIZE = 5;
const ui = { type: 'all', part: 'mix', onlyWrong: false };
const PART_GROUP = { mix: null, intro: ['para', 'thesis'], body: ['body1', 'body2'], concl: ['concl'] };
function pickCards(all, keys) {
  const want = keys || (ui.onlyWrong ? wrongKeys() : null);
  if (want) { const set = new Set(want); return shuffle(all.filter((c) => set.has(c.key))).slice(0, SIZE); }
  let pool = all.filter((c) => (ui.type === 'all' || c.type === ui.type) && (!PART_GROUP[ui.part] || PART_GROUP[ui.part].includes(c.part)));
  const seen = hunt().seen, wr = hunt().wrong;
  const wrongFirst = shuffle(pool.filter((c) => c.key in wr)).slice(0, 2);
  pool = shuffle(pool.filter((c) => !(c.key in wr))).sort((a, b) => (seen[a.key] || 0) - (seen[b.key] || 0));
  // Mỗi đề tối đa một thẻ, mỗi phần tối đa 2 thẻ trong lượt, để gặp nhiều đề và nhiều phần.
  const used = new Set(wrongFirst.map((c) => c.pid)), parts = {}, pick = [];
  wrongFirst.forEach((c) => { parts[c.part] = (parts[c.part] || 0) + 1; });
  for (const c of pool) {
    if (pick.length + wrongFirst.length >= SIZE) break;
    if (used.has(c.pid) || (!PART_GROUP[ui.part] && (parts[c.part] || 0) >= 2)) continue;
    used.add(c.pid); parts[c.part] = (parts[c.part] || 0) + 1; pick.push(c);
  }
  return shuffle([...wrongFirst, ...pick]);
}

// ---------------------------------------------------------------- Lượt chơi
// I.phase: idea (60 giây) → model → order → orderDone → self
let I = null;
let LAST = null;
let timer = 0;
const IDEA_SEC = 60;
function startTimer(sec, onEnd) {
  clearInterval(timer);
  I.dur = sec * 1000; I.deadline = Date.now() + I.dur; I.onEnd = onEnd;
  timer = setInterval(tick, 250);
}
function stopTimer() { clearInterval(timer); timer = 0; if (I) I.deadline = 0; }
function tick() {
  if (!I || !location.hash.startsWith('#/iplay')) { stopTimer(); return; }
  const left = Math.max(0, I.deadline - Date.now());
  const bar = document.querySelector('#hn-timer i'), s = document.getElementById('hn-secs');
  if (bar) bar.style.width = `${(left / I.dur) * 100}%`;
  const sec = Math.ceil(left / 1000);
  if (s) s.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  if (!left) { const f = I.onEnd; stopTimer(); f?.(); }
}
function beginCard() {
  stopTimer();
  Object.assign(I, { phase: 'idea', note: '', built: [], pool: [], checked: null, self: {} });
  startTimer(IDEA_SEC, endIdea);
}
function endIdea() {
  if (!I || I.phase !== 'idea') return;
  stopTimer();
  I.note = (document.getElementById('id-note')?.value || I.note || '').trim();
  I.phase = 'model';
  document.activeElement?.blur?.();
  rerender(true);
}
function result(ok, extra = {}) {
  const c = I.cards[I.i];
  I.res[I.i] = { key: c.key, ok, part: c.part, q: c.q, sent: c.sent, ...extra };
  if (ok) { I.combo++; I.maxCombo = Math.max(I.maxCombo, I.combo); } else I.combo = 0;
}
function checkOrder() {
  const c = I.cards[I.i];
  const ok = I.built.map((k, pos) => k === pos);
  I.checked = ok;
  const n = ok.filter(Boolean).length;
  const all = n === c.chunks.length;
  I.score += all ? 20 + Math.min(4, I.combo) * 5 : n * 2;
  I.n++; if (all) I.ok++;
  result(all, { right: n, total: c.chunks.length, note: I.note });
  I.phase = 'orderDone';
  rerender();
}
async function finish() {
  stopTimer();
  const P = I;
  I = null;
  const done = P.res.filter(Boolean);
  const h = hunt(), s = st();
  if (done.length) {
    const now = Math.round(Date.now() / 1000);
    for (const r of done) {
      h.seen[r.key] = now;
      if (!r.ok) h.wrong[r.key] = 0;
      else if (r.key in h.wrong) { h.wrong[r.key]++; if (h.wrong[r.key] >= 2) delete h.wrong[r.key]; }
    }
    s.plays++; s.best = Math.max(s.best, P.score); s.n += P.n; s.ok += P.ok;
    await saveHunt();
    await logGrammarDay('hSets', P.id); // tính vào chuỗi ngày học, không tính vào mục tiêu Writing
  }
  if (P.chal) { await chalReport('idea', { score: P.score, ok: P.ok, n: done.length }); return; }
  LAST = { score: P.score, n: done.length, ok: P.ok, notes: done.filter((r) => r.note).length, ms: Date.now() - P.t0, wrong: done.filter((r) => !r.ok), learned: P.learned, counted: done.length > 0 };
  replace('#/ires');
}

async function ready() {
  await loadWriting();
  for (let k = 0; k < 50 && W.state === 'loading'; k++) await new Promise((ok) => setTimeout(ok, 200));
  if (W.state !== 'ready') throw new Error(W.error || 'writing');
  return CARDS.list || (CARDS.list = buildCards());
}
const CARDS = { list: null };
on('id-start', async (el) => {
  const keys = el.dataset.keys ? el.dataset.keys.split(',') : null;
  const chal = el.dataset.chal === '1', size = Number(el.dataset.size) || 0;
  let all;
  try { all = await ready(); } catch (e) { console.error(e); toast('Chưa tải được đề Writing. Hãy mở app khi có mạng một lần.', 'bad'); return; }
  const saved = { ...ui };
  if (chal) Object.assign(ui, { type: 'all', part: 'mix', onlyWrong: false });
  const cards = pickCards(all, chal ? null : keys).slice(0, size || SIZE);
  Object.assign(ui, saved);
  if (!cards.length) { toast(ui.onlyWrong ? 'Không còn thẻ nào cần ôn lại' : 'Chưa có thẻ phù hợp'); return; }
  I = { id: 'I:' + uid(), cards, i: 0, score: 0, combo: 0, maxCombo: 0, t0: Date.now(), res: [], n: 0, ok: 0, learned: [], chal };
  beginCard();
  go('#/iplay');
});
on('id-in', (el) => { if (I) I.note = el.value; });
on('id-done', () => endIdea());
on('id-order', () => {
  if (!I || I.phase !== 'model') return;
  const c = I.cards[I.i];
  let order = shuffle(c.chunks.map((_, k) => k));
  for (let t = 0; t < 5 && order.every((k, i) => k === i); t++) order = shuffle(order); // không để trùng thứ tự đúng
  I.pool = order; I.built = [];
  I.phase = 'order';
  rerender(true);
});
on('id-pick', (el) => {
  if (!I || I.phase !== 'order') return;
  const k = Number(el.dataset.k);
  if (I.built.includes(k)) return;
  I.built.push(k);
  rerender(); // ghép đủ thì hiện nút Kiểm tra: vẫn sửa được trước khi chấm
});
on('id-check', () => { if (I?.phase === 'order' && I.built.length === I.cards[I.i].chunks.length) checkOrder(); });
on('id-unpick', (el) => { if (I?.phase === 'order') { I.built.splice(Number(el.dataset.pos), 1); rerender(); } });
on('id-self-go', () => { if (I?.phase === 'orderDone') { I.phase = 'self'; rerender(true); } });
on('id-self', (el) => { if (I?.phase === 'self') { I.self[el.dataset.k] = !I.self[el.dataset.k]; rerender(); } });
on('id-save', (el) => {
  const c = I?.cards[I.i];
  const ph = c?.phrases[Number(el.dataset.i)] || c?.allPhrases.map((x) => ({ t: x.en, vi: x.vi }))[Number(el.dataset.a)];
  if (!ph) return;
  openWordSheet(ph.t, c.sent, `Writing · ${c.topic}`);
  if (!I.learned.includes(ph.t)) I.learned.push(ph.t);
});
on('id-next', async () => {
  if (!I) return;
  I.score += Object.values(I.self).filter(Boolean).length * 5;
  if (I.i + 1 < I.cards.length) { I.i++; beginCard(); rerender(true); } else await finish();
});
on('id-quit', async () => {
  if (!I) { back('#/games'); return; }
  const done = I.res.filter(Boolean).length;
  if (!(await confirmSheet({ title: 'Dừng lượt chơi?', body: done ? `Đã làm ${done} thẻ: kết quả được lưu và tính vào chuỗi ngày học.` : 'Chưa làm xong thẻ nào nên lượt này không được lưu.', okLabel: 'Dừng' }))) return;
  if (done) await finish(); else { const chal = I.chal; stopTimer(); I = null; if (chal) replace('#/chal'); else back('#/games'); }
});
on('id-set', (el) => { ui[el.dataset.k] = el.dataset.v; rerender(); });
on('id-wrong', () => { ui.onlyWrong = !ui.onlyWrong; rerender(); });

// ---------------------------------------------------------------- Màn hình
const STAR = () => kit.STAR(), FLAME = () => kit.FLAME();
const bigBtn = (act, label, extra = '') => `<button class="hn-btn" data-act="${act}" ${extra}>${label}</button>`;
const typeName = (t) => W.types?.[t]?.short || t;
function hud(c) {
  const dots = I.cards.map((_, i) => `<span class="hn-dot ${i < I.i ? (I.res[i]?.ok ? 'ok' : 'no') : i === I.i ? 'cur' : ''}"></span>`).join('');
  const timed = I.deadline > 0;
  const left = Math.max(0, I.deadline - Date.now());
  const sec = Math.ceil(left / 1000);
  return `<div class="hn-top"><button class="hn-x" data-act="id-quit" aria-label="Thoát">${icon('x')}</button>
    ${timed ? `<div class="hn-timer" id="hn-timer"><i style="width:${(left / I.dur) * 100}%"></i></div><span class="hn-pill sm" id="hn-secs">${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</span>` : `<div class="hn-dots">${dots}</div>`}</div>
    <div class="hn-hud"><span class="hn-pill">${STAR()}${I.score}</span><span class="hn-meta">${esc(typeName(c.type))} · ${esc(c.topic)}</span><span class="hn-pill peach">${FLAME()}×${Math.max(1, I.combo)}</span></div>`;
}
const promptCard = (c, small) => `<div class="hn-card"><span class="hn-tag" style="background:#BFE3FF">Đề Task 2 · ${esc(typeName(c.type))}</span><p class="${small ? 'id-qs' : 'hn-q id-q'}">${esc(c.q)}</p></div>`;
function ideaView(c) {
  const t = TASKS[c.part];
  const hint = c.part === 'thesis' ? W.types?.[c.type]?.hint || '' : t.hint;
  return `${hud(c)}${promptCard(c)}
    <div class="hn-card id-task"><span class="hn-tag" style="background:#C7B8FF">Thẻ ${I.i + 1}/${I.cards.length} · ${esc(t.name)}</span>
      <p class="id-ask">${esc(t.ask)}</p>${hint ? `<p class="tk-note">${esc(hint)}</p>` : ''}
      <textarea id="id-note" class="answer-input id-note" data-in="id-in" rows="3" placeholder="Ghi nhanh ý bằng tiếng Anh (không bắt buộc, có thể chỉ nghĩ)" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false">${esc(I.note)}</textarea></div>
    ${bigBtn('id-done', 'Xong, xem câu mẫu')}`;
}
function sentHtml(c, act = true) {
  let html = '', at = 0;
  c.phrases.forEach((p, i) => { html += esc(c.sent.slice(at, p.s)) + `<b class="tk-ph" ${act ? `data-act="id-save" data-i="${i}" role="button"` : ''}>${esc(c.sent.slice(p.s, p.e))}</b>`; at = p.e; });
  return html + esc(c.sent.slice(at));
}
function modelView(c) {
  const t = TASKS[c.part];
  return `${hud(c)}${promptCard(c, true)}
    ${I.note ? `<div class="hn-card"><span class="hn-tag" style="background:#FFF0B8">Ý của bạn</span><p class="id-mine">${esc(I.note)}</p></div>` : ''}
    <div class="hn-card"><span class="hn-tag" style="background:#FFD84D">Câu mẫu · ${esc(t.name)}</span><p class="hn-q tk-model">${sentHtml(c)}</p>
      ${c.phrases.length ? `<p class="tk-note">Chữ tô vàng là cụm hay · chạm để lưu vào từ vựng</p>${c.phrases.map((p) => `<p class="tk-mean"><b>${esc(p.t)}</b>: ${esc(p.vi)}</p>`).join('')}` : ''}</div>
    ${bigBtn('id-order', 'Ghép lại câu này →')}`;
}
function orderView(c) {
  const done = I.phase === 'orderDone';
  const line = done
    ? c.chunks.map((t, k) => `<span class="id-chunk ${I.checked[I.built.indexOf(k)] ? 'ok' : 'no'}">${esc(t)}</span>`).join(' ')
    : I.built.map((k, pos) => `<button class="id-chunk placed" data-act="id-unpick" data-pos="${pos}">${esc(c.chunks[k])}</button>`).join(' ') + `<span class="id-slot">${I.built.length + 1}</span>`;
  const pool = done ? '' : `<div class="tk-chips">${I.pool.map((k) => `<button class="tk-chip ${I.built.includes(k) ? 'used' : ''}" data-act="id-pick" data-k="${k}" ${I.built.includes(k) ? 'disabled' : ''}>${esc(c.chunks[k])}</button>`).join('')}</div>`;
  const n = done ? I.checked.filter(Boolean).length : 0, all = done && n === c.chunks.length;
  return `${hud(c)}
    <p class="hn-step">${done ? '' : I.built.length === c.chunks.length ? 'Đọc lại câu: sai chỗ nào thì chạm mảnh đó để bỏ ra' : 'Chạm các mảnh theo đúng thứ tự · chạm mảnh đã ghép để bỏ ra'}</p>
    <div class="hn-card"><span class="hn-tag" style="background:#C7B8FF">${done ? 'Câu đúng' : `Ghép câu · ${c.chunks.length} mảnh`}</span><p class="id-line">${line}</p></div>
    ${pool}
    ${!done && I.built.length === c.chunks.length ? bigBtn('id-check', 'Kiểm tra') : ''}
    ${done ? `<div class="hn-panel" style="background:${all ? '#D9F7EC' : '#FFE1EC'}"><div class="hn-ptitle">${all ? mochi('happy', 48) : bolt('dizzy', 48)}<b>${all ? `Chuẩn từng mảnh! +${20 + Math.min(4, I.combo - 1) * 5}` : `Đúng vị trí ${n}/${c.chunks.length} mảnh${n ? ` · +${n * 2}` : ''}`}</b></div>
      ${all ? '' : `<p>Câu đúng: ${sentHtml(c, false)}</p><p class="tk-note">Thẻ này sẽ quay lại ở lượt sau.</p>`}${bigBtn('id-self-go', 'Tự chấm →')}</div>` : ''}`;
}
function selfView(c) {
  const part = (W.parts || []).find((p) => p.id === c.part);
  const items = (part?.self || []).slice(0, 3);
  const others = c.allPhrases.filter((x) => !c.phrases.some((p) => p.t.toLowerCase() === String(x.en).toLowerCase()));
  return `${hud(c)}
    <div class="hn-card"><span class="hn-tag" style="background:#8EE3C8">Tự chấm ý của bạn</span>
      ${I.note ? `<p class="id-mine">${esc(I.note)}</p>` : '<p class="tk-note" style="margin-top:8px">Bạn chỉ nghĩ trong đầu: chấm theo ý bạn đã nghĩ.</p>'}
      <div class="tk-self">${items.map((l, k) => `<button class="tk-check ${I.self[k] ? 'on' : ''}" data-act="id-self" data-k="${k}" aria-pressed="${!!I.self[k]}"><span>${I.self[k] ? icon('check', 'sm') : ''}</span>${esc(l)}</button>`).join('')}</div>
      <p class="tk-note">Mỗi ý có được +5</p></div>
    ${others.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFD84D">Cụm hay khác của đề này</span>${others.map((x) => `<p class="tk-mean"><b class="tk-ph" data-act="id-save" data-a="${c.allPhrases.indexOf(x)}" role="button">${esc(x.en)}</b> ${esc(x.vi)}</p>`).join('')}<p class="tk-note">Chạm để lưu vào từ vựng</p></div>` : ''}
    ${bigBtn('id-next', I.i + 1 < I.cards.length ? 'Thẻ tiếp →' : 'Xem kết quả')}`;
}
export function playView() {
  if (!I) return { html: `<div class="page hn-scr"><div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Ý tưởng 60 giây</h1></div><div class="hn-card" style="margin-top:20px"><p>Lượt chơi đã kết thúc.</p>${bigBtn('go', 'Về tab Game', 'data-to="#/games"')}</div></div>` };
  const c = I.cards[I.i];
  const body = I.phase === 'idea' ? ideaView(c) : I.phase === 'model' ? modelView(c) : I.phase === 'self' ? selfView(c) : orderView(c);
  return { html: `<div class="page session hn-scr hn-play tk-scr id-scr"><div class="ses-body">${body}</div></div>` };
}

export function resultView() {
  if (!LAST) return `<div class="page hn-scr"><div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Ý tưởng 60 giây</h1></div><div class="hn-card" style="margin-top:20px"><p>Chưa có lượt nào vừa chơi.</p></div></div>`;
  const L = LAST;
  const streak = kit.streakDays();
  const mm = `${Math.floor(L.ms / 60000)}:${String(Math.floor(L.ms / 1000) % 60).padStart(2, '0')}`;
  return `<div class="page hn-scr hn-res">
    <div class="hn-trophy">${mochi('happy', 70)}<svg width="92" height="92" viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="8" width="34" height="46" rx="5" fill="#fff" stroke="#2B2240" stroke-width="2.6"/><path d="M19 20h20M19 28h20M19 36h12" stroke="#2B2240" stroke-width="2.6" stroke-linecap="round"/><path d="M40 50l4-12 12-14 4 4-12 14z" fill="#C7B8FF" stroke="#2B2240" stroke-width="2.4" stroke-linejoin="round"/></svg>${bolt('happy', 70)}</div>
    <p class="hn-big center">Ghép đúng ${L.ok}/${L.n} câu!</p>
    ${L.counted ? `<p class="center hn-sub">+1 ngày vào chuỗi học${streak ? ` · giờ là <span class="hn-pill sm peach">${streak} ngày</span>` : ''}</p>` : ''}
    <div class="hn-tiles3"><div style="background:#FFD84D"><b>${L.score}</b><span>điểm</span></div><div style="background:#C7B8FF"><b>${L.notes}</b><span>lần ghi ý</span></div><div style="background:#BFE3FF"><b>${mm}</b><span>thời gian</span></div></div>
    ${L.learned.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFD84D">Cụm đã mở để lưu</span><div class="hn-chips">${L.learned.map((w) => `<span>${esc(w)}</span>`).join('')}</div></div>` : ''}
    ${L.wrong.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFB3CB">${L.wrong.length} câu cần ghép lại</span>${L.wrong.slice(0, 5).map((r) => `<p><b>${esc(TASKS[r.part].name)}</b> · <span class="faint">${esc(r.sent)}</span></p>`).join('')}</div>` : ''}
    <div class="hn-row2">${bigBtn('go', 'Xong', 'data-to="#/games" style="flex:.75;background:#fff"')}${L.wrong.length ? bigBtn('id-start', `Ghép lại ${L.wrong.length} câu!`, `data-keys="${esc(L.wrong.map((r) => r.key).join(','))}" style="flex:1.25"`) : bigBtn('id-start', 'Chơi lượt mới!', 'style="flex:1.25"')}</div>
  </div>`;
}

// ---------------------------------------------------------------- Chọn lượt chơi
export function setupView() {
  if (W.state === 'idle') loadWriting().then(() => rerender());
  const seg = (k, opts) => `<div class="hn-seg">${opts.map(([v, l]) => `<button class="${ui[k] === v ? 'on' : ''}" data-act="id-set" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const nw = wrongKeys().length;
  const types = Object.entries(W.types || {});
  return `<div class="page hn-scr hn-setup">
    <div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Ý tưởng 60 giây</h1><span class="hn-pill sm">Writing</span></div>
    <div class="hn-card" style="background:#FFF0B8">
      <div class="hn-stp"><span>1</span><p><b>60 giây nghĩ ý</b> · cho một phần của bài Task 2</p></div>
      <div class="hn-stp"><span>2</span><p><b>Xem câu mẫu</b> · cụm hay có nghĩa tiếng Việt</p></div>
      <div class="hn-stp"><span>3</span><p><b>Ghép lại câu mẫu</b> · rồi tự chấm ý của mình</p></div></div>
    <p class="hn-lab">Dạng đề</p>
    <div class="hn-card hn-src"><select class="hn-select" data-change="id-type" aria-label="Dạng đề"><option value="all">Tất cả dạng (${W.prompts?.size || 30} đề)</option>${types.map(([k, v]) => `<option value="${esc(k)}" ${ui.type === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
    <p class="hn-lab">Phần luyện</p>${seg('part', [['mix', 'Trộn'], ['intro', 'Mở bài'], ['body', 'Thân bài'], ['concl', 'Kết luận']])}
    <div class="hn-card hn-toggle"><span><b>Chỉ câu cần ghép lại</b><br><span class="faint">${nw ? `${nw} câu ghép chưa đúng` : 'Chưa có câu nào'}</span></span>
      <button class="hn-sw ${ui.onlyWrong ? 'on' : ''}" data-act="id-wrong" aria-label="Chỉ câu cần ghép lại" aria-pressed="${ui.onlyWrong}" ${nw ? '' : 'disabled'}><i></i></button></div>
    ${W.state === 'error' ? `<p class="hn-sub">${esc(W.error)}</p>` : ''}
    <p class="hn-sub" style="margin:10px 4px 0">${SIZE} thẻ mỗi lượt · khoảng 6 phút</p>
    <div class="hn-bottom">${bigBtn('id-start', 'Bắt đầu!')}</div>
  </div>`;
}
on('id-type', (el) => { ui.type = el.value; rerender(); });
