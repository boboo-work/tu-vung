// Game "Chọn từ" (#/pick → #/pplay → #/pres): câu có một chỗ trống, chọn 1 trong 4 từ trong 20 giây.
//  Chọn sai hoặc hết giờ → hiện đáp án đúng và giải thích (tiếng Anh, bấm xem tiếng Việt nếu file có).
//  Nguồn câu: các bộ người học tự nhập (file .csv / .xlsx, xem PICK_COLUMNS) và câu ví dụ của các từ đã học trong Kho từ.
//  Câu sai được nhớ lại (S.pick.wrong) để chơi "Chỉ câu đã sai".
import { sfx } from './sfx.js';
import { S, savePick } from './store.js';
import { esc, toast, uid, shuffle, parseCSV, readXlsx, toCSV, download } from './util.js';
import { icon, on, go, back, rerender, confirmSheet } from './ui.js';
import { mochi, bolt, kit } from './hunt.js';
import { gamePool } from './game.js';
import { findInSentence } from './study.js';

const ROUND = 10, SECS = 20;
export const PICK_COLUMNS = ['cau', 'dung', 'sai1', 'sai2', 'sai3', 'giai_thich', 'giai_thich_vi', 'dang', 'trinh_do', 'bo'];
const ui = { src: 'all', tag: 'all', lv: 'all', onlyWrong: false };
let P = null, LAST = null, timer = 0;

// ---------------------------------------------------------------- Đọc file bài tập
const key = (s) => String(s).normalize('NFC').toLowerCase().replace(/[\s_\-/&().]/g, '');
const COLS = {
  s: ['cau', 'câu', 'cauhoi', 'câuhỏi', 'sentence', 'question'],
  a: ['dung', 'đúng', 'dapan', 'đápán', 'dapandung', 'đápánđúng', 'answer', 'correct'],
  ex: ['giaithich', 'giảithích', 'explanation', 'explain', 'why', 'giaithichen'],
  exVi: ['giaithichvi', 'giảithíchvi', 'giaithichtiengviet', 'giảithíchtiếngviệt', 'explanationvi', 'tiengviet', 'tiếngviệt'],
  tag: ['dang', 'dạng', 'type', 'category', 'skill', 'tag'],
  lv: ['trinhdo', 'trìnhđộ', 'level', 'cefr', 'capdo', 'cấpđộ'],
  set: ['bo', 'bộ', 'set', 'bode', 'bộđề', 'chude', 'chủđề', 'topic'],
};
const isWrongCol = (h) => /^(sai|wrong|distractor|nhieu|nhiễu)\d*$/.test(h);
const BLANK = /_{2,}|…{1,}|\.{4,}|\[\s*\]/;

/** rows: mảng hàng (hàng đầu là tiêu đề) → { sets: [{ name, qs }], skipped } */
export function parseRows(rows, fallbackName) {
  if (rows.length < 2) throw new Error('File không có dữ liệu (cần 1 dòng tiêu đề và ít nhất 1 câu)');
  const head = rows[0].map(key);
  const col = {};
  for (const [f, names] of Object.entries(COLS)) col[f] = head.findIndex((h) => names.includes(h));
  const wrongCols = head.map((h, i) => (isWrongCol(h) ? i : -1)).filter((i) => i >= 0);
  if (col.s < 0 || col.a < 0) throw new Error('Thiếu cột "cau" (câu có chỗ trống ___) hoặc cột "dung" (đáp án đúng)');
  if (!wrongCols.length) throw new Error('Thiếu cột đáp án sai ("sai1", "sai2", "sai3")');
  const bySet = new Map();
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const get = (i) => (i >= 0 ? String(r[i] ?? '').replace(/\s+/g, ' ').trim() : '');
    let s = get(col.s);
    const a = get(col.a);
    const w = [...new Set(wrongCols.map(get).filter((x) => x && x.toLowerCase() !== a.toLowerCase()))].slice(0, 5);
    if (!s || !a || !w.length) { skipped++; continue; }
    if (BLANK.test(s)) s = s.replace(BLANK, '___');
    else {
      // Không có chỗ trống: khoét đáp án ra khỏi câu.
      const m = new RegExp(`(^|[^\\p{L}\\p{N}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').exec(s);
      // Không thấy đáp án trong câu: câu hỏi dạng "Choose the correct sentence." → giữ nguyên, chọn cả câu.
      if (m) { const i = m.index + m[1].length; s = s.slice(0, i) + '___' + s.slice(i + a.length); }
    }
    const name = get(col.set) || fallbackName;
    if (!bySet.has(name)) bySet.set(name, []);
    bySet.get(name).push({ s: s.slice(0, 400), a: a.slice(0, 80), w: w.map((x) => x.slice(0, 80)), ex: get(col.ex).slice(0, 800), exVi: get(col.exVi).slice(0, 800), tag: get(col.tag).slice(0, 30), lv: get(col.lv).toUpperCase().slice(0, 10) });
  }
  if (!bySet.size) throw new Error(`Không có câu nào dùng được${skipped ? ` (bỏ qua ${skipped} dòng thiếu câu, đáp án đúng hoặc đáp án sai)` : ''}`);
  return { sets: [...bySet].map(([name, qs]) => ({ name, qs })), skipped };
}
async function importPickFile(file) {
  const name = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Bộ câu hỏi';
  let rows;
  if (/\.xlsx$/i.test(file.name)) rows = await readXlsx(await file.arrayBuffer());
  else if (/\.xls$/i.test(file.name)) throw new Error('Định dạng .xls cũ chưa hỗ trợ, hãy lưu lại thành .xlsx hoặc .csv');
  else rows = parseCSV(await file.text());
  const { sets, skipped } = parseRows(rows, name);
  let n = 0;
  for (const st of sets) {
    // Nhập lại bộ cùng tên → thay bộ cũ (tránh trùng câu khi sửa file rồi nhập lại).
    const old = S.pick.sets.find((x) => x.name.toLowerCase() === st.name.toLowerCase());
    const id = old?.id || 'P' + uid();
    const rec = { id, name: st.name.slice(0, 80), at: Date.now(), qs: st.qs.map((q, i) => ({ ...q, id: `${id}:${i}` })) };
    if (old) S.pick.sets.splice(S.pick.sets.indexOf(old), 1, rec); else S.pick.sets.push(rec);
    n += st.qs.length;
  }
  await savePick();
  toast(`Đã nhập ${n} câu${sets.length > 1 ? ` vào ${sets.length} bộ` : ''}${skipped ? ` · bỏ qua ${skipped} dòng lỗi` : ''}`);
}
on('pk-import', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.onchange = () => importFiles([...input.files]);
  input.click();
});
async function importFiles(files) {
  for (const f of files) {
    try { await importPickFile(f); } catch (e) { console.error(e); toast(`${f.name}: ${e?.message || e}`, 'bad'); }
  }
  rerender();
}
on('pk-files', (el) => importFiles([...el.files])); // dùng cho kiểm thử
on('pk-template', () => {
  const rows = [PICK_COLUMNS,
    ['After she ___ from university, she found a job at a bank.', 'graduated', 'passed', 'finished', 'completed', 'We say "graduate from" a university or school. "Pass", "finish" and "complete" are not followed by "from".', '"Graduate from" = tốt nghiệp (trường nào). Ba từ còn lại không đi với "from".', 'Vocabulary', 'B1', 'Mẫu'],
    ['If I ___ more time, I would learn to play the piano.', 'had', 'have', 'will have', 'would have', 'Second conditional: If + past simple, would + verb. The situation is imaginary now.', 'Câu điều kiện loại 2: If + quá khứ đơn, would + động từ (giả định ở hiện tại).', 'Grammar', 'B1', 'Mẫu'],
    ['The museum is closed ___ Mondays.', 'on', 'in', 'at', 'by', 'Use "on" with days of the week.', 'Dùng "on" trước thứ trong tuần.', 'Grammar', 'A2', 'Mẫu'],
    ['The new policy had a significant ___ on small businesses.', 'impact', 'effect to', 'influence at', 'result', '"Have an impact on" is the natural collocation.', 'Cụm cố định: have an impact on sth (tác động lên).', 'Collocation', 'B2', 'Mẫu'],
  ];
  download('mau-bai-tap-chon-tu.csv', toCSV(rows), 'text/csv;charset=utf-8');
});

// ---------------------------------------------------------------- Câu từ Kho từ (câu ví dụ của từ đã học)
function vocabQs() {
  const pool = gamePool();
  const out = [];
  for (const w of pool) {
    for (const text of w.examples || []) {
      const hit = findInSentence(w.word, text);
      if (!hit || !/[A-Za-z]{3,}/.test(text.slice(0, hit.index) + text.slice(hit.index + hit.text.length))) continue;
      const others = pool.filter((x) => x.id !== w.id && x.word.toLowerCase() !== w.word.toLowerCase() && x.word.split(' ').length <= 3);
      const same = shuffle(others.filter((x) => x.deckId === w.deckId && x.pos === w.pos));
      const rest = shuffle(others.filter((x) => !same.includes(x)));
      const wrong = [...same, ...rest].map((x) => x.word).filter((x, i, a) => a.indexOf(x) === i && x.toLowerCase() !== hit.text.toLowerCase()).slice(0, 3);
      if (wrong.length < 3) break;
      out.push({ id: `w:${w.id}`, s: text.slice(0, hit.index) + '___' + text.slice(hit.index + hit.text.length), a: hit.text, w: wrong, ex: `${w.word}${w.ipa ? ` ${w.ipa}` : ''}${w.pos ? ` (${w.pos})` : ''}: ${w.meaning}`, exVi: '', tag: 'Kho từ', lv: '', diff: w.difficulty || 2 });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- Chọn câu cho lượt chơi
const sets = () => S.pick.sets;
function sourceQs(src = ui.src) {
  if (src === 'vocab') return vocabQs();
  if (src === 'all') return [...sets().flatMap((x) => x.qs), ...vocabQs()];
  return sets().find((x) => x.id === src)?.qs || [];
}
// Gom trình độ về 3 mức: A1, A2, "A1-A2" → Dễ; B1 → Vừa; B2, C1, C2, "B2-C1" → Khó. Câu từ Kho từ theo độ khó của từ.
export const LEVELS = [['easy', 'Dễ', 'A1–A2'], ['mid', 'Vừa', 'B1'], ['hard', 'Khó', 'B2–C1']];
function lvBucket(q) {
  const v = String(q.lv || '').toUpperCase();
  if (/C[12]|B2/.test(v)) return 'hard';
  if (/B1/.test(v)) return 'mid';
  if (/A[12]/.test(v)) return 'easy';
  if (q.diff) return ['', 'easy', 'mid', 'hard'][q.diff] || '';
  return '';
}
const filtered = (qs) => qs.filter((q) => (ui.tag === 'all' || q.tag === ui.tag) && (ui.lv === 'all' || lvBucket(q) === ui.lv) && (!ui.onlyWrong || S.pick.wrong[q.id]));
const wrongCount = () => sourceQs().filter((q) => S.pick.wrong[q.id]).length;

function startTimer() {
  clearInterval(timer);
  P.deadline = Date.now() + SECS * 1000;
  timer = setInterval(tick, 200);
}
function stopTimer() { clearInterval(timer); timer = 0; }
function tick() {
  if (!P || P.phase !== 'q' || !location.hash.startsWith('#/pplay')) { stopTimer(); return; }
  const left = Math.max(0, P.deadline - Date.now());
  const bar = document.querySelector('#pk-timer i'), s = document.getElementById('pk-secs');
  if (bar) bar.style.width = `${(left / (SECS * 1000)) * 100}%`;
  if (s) s.textContent = `0:${String(Math.ceil(left / 1000)).padStart(2, '0')}`;
  if (!left) { stopTimer(); answer(-1); }
}
function begin(qs) {
  if (!qs.length) { toast('Không có câu nào phù hợp', 'bad'); return; }
  P = { qs: qs.map((q) => ({ ...q, opts: shuffle([q.a, ...shuffle(q.w).slice(0, 3)]) })), i: 0, res: [], picked: null, phase: 'q', combo: 0, score: 0, vi: false, t0: Date.now() };
  S.pick.stats.plays++;
  savePick().catch(console.error);
  go('#/pplay');
  startTimer();
}
on('pk-start', (el) => {
  const keys = el.dataset.keys ? el.dataset.keys.split(',') : null;
  const all = sourceQs();
  let qs;
  if (keys) qs = keys.map((k) => all.find((q) => q.id === k) || LAST?.qs.find((q) => q.id === k)).filter(Boolean);
  else {
    const f = filtered(all);
    // Ưu tiên câu đã sai, sau đó câu ngẫu nhiên.
    const wrong = shuffle(f.filter((q) => S.pick.wrong[q.id]));
    qs = [...wrong.slice(0, 3), ...shuffle(f.filter((q) => !wrong.slice(0, 3).includes(q)))].slice(0, ROUND);
    qs = shuffle(qs);
  }
  begin(qs);
});
function answer(k) {
  if (!P || P.phase !== 'q') return;
  stopTimer();
  const q = P.qs[P.i];
  const pickedText = k >= 0 ? q.opts[k] : null;
  const ok = pickedText === q.a;
  P.picked = k;
  P.phase = 'fb';
  P.vi = false;
  if (ok) { P.combo++; P.score += 10 + Math.min(P.combo - 1, 5) * 2 + Math.ceil(Math.max(0, P.deadline - Date.now()) / 2000); } else P.combo = 0;
  sfx(ok ? 'ok' : 'bad', P.combo);
  P.res.push({ id: q.id, ok, picked: pickedText, timeout: k < 0 });
  const W = S.pick.wrong;
  if (ok) { if (W[q.id]) { W[q.id]--; if (W[q.id] <= 0) delete W[q.id]; } } else W[q.id] = (W[q.id] || 0) + 1;
  S.pick.stats.n++;
  if (ok) S.pick.stats.ok++;
  savePick().catch(console.error);
  rerender();
}
on('pk-opt', (el) => answer(Number(el.dataset.k)));
on('pk-vi', () => { if (P) { P.vi = !P.vi; rerender(); } });
function next() {
  if (!P || P.phase !== 'fb') return;
  if (P.i + 1 < P.qs.length) { P.i++; P.phase = 'q'; P.picked = null; rerender(true); startTimer(); return; }
  const ok = P.res.filter((r) => r.ok).length;
  LAST = { n: P.qs.length, ok, score: P.score, ms: Date.now() - P.t0, qs: P.qs, wrong: P.res.filter((r) => !r.ok).map((r) => ({ ...r, q: P.qs.find((q) => q.id === r.id) })) };
  sfx('win');
  if (P.score > (S.pick.stats.best || 0)) { S.pick.stats.best = P.score; LAST.best = true; savePick().catch(console.error); }
  P = null;
  go('#/pres');
}
on('pk-next', next);
on('pk-quit', async () => {
  if (P && P.res.length && !(await confirmSheet({ title: 'Dừng lượt này?', body: 'Các câu đã trả lời vẫn được ghi nhận.', okLabel: 'Dừng' }))) return;
  stopTimer();
  P = null;
  back('#/pick');
});
addEventListener('keydown', (e) => {
  if (!P || !location.hash.startsWith('#/pplay') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (P.phase === 'q' && /^[1-4]$/.test(e.key)) { e.preventDefault(); answer(Number(e.key) - 1); }
  else if (P.phase === 'fb' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); next(); }
});

// ---------------------------------------------------------------- Màn hình
const bigBtn = (act, label, extra = '') => `<button class="hn-btn" data-act="${act}" ${extra}>${label}</button>`;
const nav = (title) => `<div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">${title}</h1></div>`;
export const pickStats = () => { const s = S.pick?.stats || {}; return { acc: s.n ? Math.round((s.ok / s.n) * 100) : null, sets: S.pick?.sets.length || 0 }; };

on('pk-set', (el) => { ui[el.dataset.k] = el.dataset.v; rerender(); });
on('pk-src', (el) => { ui.src = el.value; ui.tag = 'all'; ui.lv = 'all'; rerender(); });
on('pk-wrong', () => { ui.onlyWrong = !ui.onlyWrong; rerender(); });
on('pk-del', async (el) => {
  const st = sets().find((x) => x.id === el.dataset.id);
  if (!st || !(await confirmSheet({ title: 'Xoá bộ này?', body: `${st.name}: ${st.qs.length} câu.`, okLabel: 'Xoá', danger: true }))) return;
  S.pick.sets = sets().filter((x) => x !== st);
  for (const q of st.qs) delete S.pick.wrong[q.id];
  if (ui.src === st.id) ui.src = 'all';
  await savePick();
  toast('Đã xoá bộ câu hỏi');
  rerender();
});
on('pk-del-all', async () => {
  const n = sets().length;
  if (!n || !(await confirmSheet({ title: `Xoá cả ${n} bộ?`, body: 'Xoá mọi bộ câu hỏi đã nhập. Câu lấy từ Kho từ không bị ảnh hưởng. Không hoàn tác được.', okLabel: `Xoá ${n} bộ`, danger: true }))) return;
  for (const st of sets()) for (const q of st.qs) delete S.pick.wrong[q.id];
  S.pick.sets = [];
  ui.src = 'all';
  await savePick();
  toast(`Đã xoá ${n} bộ`);
  rerender();
});

export function setupView() {
  if (ui.src !== 'all' && ui.src !== 'vocab' && !sets().some((x) => x.id === ui.src)) ui.src = 'all';
  const all = sourceQs();
  const tags = [...new Set(all.map((q) => q.tag).filter(Boolean))].slice(0, 6);
  const byLv = Object.fromEntries(LEVELS.map(([k]) => [k, all.filter((q) => (ui.tag === 'all' || q.tag === ui.tag) && lvBucket(q) === k).length]));
  if (ui.lv !== 'all' && !byLv[ui.lv]) ui.lv = 'all';
  if (!tags.includes(ui.tag)) ui.tag = 'all';

  const nw = wrongCount();
  if (!nw) ui.onlyWrong = false;
  const n = filtered(all).length;
  const seg = (k, opts) => `<div class="hn-seg pk-seg">${opts.map(([v, l]) => `<button class="${ui[k] === v ? 'on' : ''}" data-act="pk-set" data-k="${k}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
  const how = `<div class="hn-card" style="background:#FFF0B8">
      <div class="hn-stp"><span>1</span><p><b>Đọc câu có chỗ trống</b> · 4 từ để chọn, ${SECS} giây</p></div>
      <div class="hn-stp"><span>2</span><p><b>Chọn từ đúng</b> · bấm hoặc gõ phím 1–4</p></div>
      <div class="hn-stp"><span>3</span><p><b>Sai thì đọc vì sao</b> · câu sai sẽ quay lại</p></div></div>`;
  const vocabN = vocabQs().length;
  const list = sets().map((st) => `<div class="pk-setrow"><span><b>${esc(st.name)}</b><small>${st.qs.length} câu</small></span><button class="hn-x sm" data-act="pk-del" data-id="${esc(st.id)}" aria-label="Xoá bộ ${esc(st.name)}">${icon('trash', 'sm')}</button></div>`).join('');
  return `<div class="page hn-scr hn-setup">${nav('Chọn từ')}${how}
    <p class="hn-lab">Nguồn câu</p>
    <div class="hn-card hn-src"><select class="hn-select" data-change="pk-src" aria-label="Nguồn câu">
      <option value="all">Tất cả (${sets().reduce((a, x) => a + x.qs.length, 0) + vocabN} câu)</option>
      ${sets().map((st) => `<option value="${esc(st.id)}" ${ui.src === st.id ? 'selected' : ''}>${esc(st.name)} (${st.qs.length})</option>`).join('')}
      <option value="vocab" ${ui.src === 'vocab' ? 'selected' : ''}>Câu ví dụ trong Kho từ (${vocabN})</option></select></div>
    ${tags.length > 1 ? `<p class="hn-lab">Dạng</p>${seg('tag', [['all', 'Tất cả'], ...tags.map((t) => [t, t])])}` : ''}
    <p class="hn-lab">Trình độ</p><div class="hn-seg pk-seg pk-lv">${[['all', 'Tất cả', ''], ...LEVELS].map(([v, l, sub]) => `<button class="${ui.lv === v ? 'on' : ''}" data-act="pk-set" data-k="lv" data-v="${v}" ${v !== 'all' && !byLv[v] ? 'disabled' : ''}><b>${l}</b>${sub ? `<small>${sub} · ${byLv[v]}</small>` : `<small>${all.filter((q) => ui.tag === 'all' || q.tag === ui.tag).length} câu</small>`}</button>`).join('')}</div>
    <div class="hn-card hn-toggle"><span><b>Chỉ câu đã sai</b><br><span class="faint">${nw ? `${nw} câu đang chờ phục thù` : 'Chưa có câu nào'}</span></span>
      <button class="hn-sw ${ui.onlyWrong ? 'on' : ''}" data-act="pk-wrong" aria-label="Chỉ câu đã sai" aria-pressed="${ui.onlyWrong}" ${nw ? '' : 'disabled'}><i></i></button></div>
    <p class="hn-sub" style="margin:10px 4px 0">${n} câu chơi được · mỗi lượt ${Math.min(ROUND, n) || ROUND} câu${S.pick.stats.best ? ` · kỷ lục ${S.pick.stats.best} điểm` : ''}</p>
    ${!n && !sets().length ? `<div class="hn-card"><div class="hn-say">${bolt('calm', 58)}<div class="hn-bub">Chưa có câu để chơi. Nhập file bài tập (.csv hoặc .xlsx) theo file mẫu, hoặc học thêm từ có câu ví dụ trong Kho từ.</div></div></div>` : ''}
    <div class="hn-bottom">${bigBtn('pk-start', 'Bắt đầu!', n ? '' : 'disabled')}</div>
    <p class="hn-lab" style="margin-top:22px">Bộ câu hỏi của bạn</p>
    <div class="hn-card">${list || '<p class="hn-sub" style="margin:0">Chưa nhập bộ nào.</p>'}
      <div class="hn-row2" style="margin-top:12px">${bigBtn('pk-import', 'Nhập file', 'style="background:#BFE3FF"')}${bigBtn('pk-template', 'Tải file mẫu', 'style="background:#fff"')}</div>
      <p class="hn-sub" style="margin:10px 2px 0">Cột cần có: <b>cau</b> (câu có ___), <b>dung</b>, <b>sai1</b>–<b>sai3</b>. Thêm nếu muốn: giai_thich, giai_thich_vi, dang, trinh_do, bo (tên bộ). Nhập lại file cùng tên bộ thì bộ cũ được thay.</p>
      ${sets().length > 1 ? `<button class="btn ghost danger-text" style="margin-top:8px" data-act="pk-del-all">${icon('trash', 'sm')} Xoá tất cả ${sets().length} bộ</button>` : ''}
      <input type="file" id="pk-files" data-change="pk-files" multiple hidden></div>
  </div>`;
}

export function playView() {
  if (!P) return `<div class="page hn-scr">${nav('Chọn từ')}<div class="hn-card" style="margin-top:20px"><p>Lượt chơi đã kết thúc.</p>${bigBtn('go', 'Về Chọn từ', 'data-to="#/pick"')}</div></div>`;
  const q = P.qs[P.i];
  const fb = P.phase === 'fb';
  const left = Math.max(0, (P.deadline || 0) - Date.now());
  const dots = P.qs.map((_, i) => `<span class="hn-dot ${i < P.res.length ? (P.res[i].ok ? 'ok' : 'no') : i === P.i ? 'cur' : ''}"></span>`).join('');
  const top = `<div class="hn-top"><button class="hn-x" data-act="pk-quit" aria-label="Thoát">${icon('x')}</button>
    ${fb ? `<div class="hn-dots">${dots}</div>` : `<div class="hn-timer" id="pk-timer"><i style="width:${(left / (SECS * 1000)) * 100}%"></i></div><span class="hn-pill sm" id="pk-secs">0:${String(Math.ceil(left / 1000)).padStart(2, '0')}</span>`}</div>
    <div class="hn-hud"><span class="hn-pill">${kit.STAR()}${P.score}</span><span class="hn-meta">Câu ${P.i + 1}/${P.qs.length}</span><span class="hn-pill peach">${kit.FLAME()}×${Math.max(1, P.combo)}</span></div>`;
  const r = fb ? P.res[P.res.length - 1] : null;
  const gap = fb ? `<span class="hn-gap pk-gap ${r.ok ? 'ok' : 'no'}">${esc(q.a)}</span>` : '<span class="hn-gap">?</span>';
  const sent = esc(q.s).replace('___', gap);
  const tags = [q.tag, q.lv].filter(Boolean).map((t, i) => `<span class="hn-tag" style="background:${i ? '#fff' : '#BFE3FF'}">${esc(t)}</span>`).join(' ');
  const opts = q.opts.map((o, k) => {
    const cls = !fb ? '' : o === q.a ? 'right' : k === P.picked ? 'wrong' : 'dim';
    return `<button class="tp-opt pk-opt ${cls}" data-act="pk-opt" data-k="${k}" ${fb ? 'disabled' : ''}><b>${k + 1}</b><span>${esc(o)}</span></button>`;
  }).join('');
  let panel = '';
  if (fb) {
    const title = r.ok ? (P.combo > 2 ? `Chuẩn! Chuỗi ×${P.combo}` : 'Chính xác!') : r.timeout ? 'Hết giờ!' : 'Chưa đúng';
    const why = P.vi && q.exVi ? q.exVi : q.ex || q.exVi;
    panel = `<div class="hn-panel" style="background:${r.ok ? '#D9F7EC' : '#FFE1EC'}"><div class="hn-ptitle">${r.ok ? mochi('happy', 48) : bolt('dizzy', 48)}<b>${title}</b></div>
      ${r.ok ? '' : `<p>Đáp án là <b>${esc(q.a)}</b>${r.picked ? `, không phải “${esc(r.picked)}”` : ''}.</p>`}
      ${why ? `<p class="pk-why">${esc(why)}</p>` : ''}
      ${q.ex && q.exVi ? `<button class="pk-vi" data-act="pk-vi">${P.vi ? 'English' : 'Tiếng Việt'}</button>` : ''}
      ${bigBtn('pk-next', P.i + 1 < P.qs.length ? 'Câu tiếp →' : 'Xem kết quả')}</div>`;
  }
  return `<div class="page session hn-scr hn-play pk-play ${fb ? (r.ok ? 'win' : 'lose') : ''}"><div class="ses-body">${top}
    <div class="hn-card pk-card">${tags ? `<div class="pk-tags">${tags}</div>` : ''}<p class="hn-q pk-q">${sent}</p></div>
    <div class="tp-opts pk-opts ${q.opts.some((o) => o.length > 28) ? 'long' : ''}">${opts}</div>${panel}</div></div>`;
}

export function resultView() {
  if (!LAST) return `<div class="page hn-scr">${nav('Chọn từ')}<div class="hn-card" style="margin-top:20px"><p>Chưa có lượt nào vừa chơi.</p>${bigBtn('go', 'Về Chọn từ', 'data-to="#/pick"')}</div></div>`;
  const L = LAST;
  const mm = `${Math.floor(L.ms / 60000)}:${String(Math.floor(L.ms / 1000) % 60).padStart(2, '0')}`;
  const wrong = L.wrong.slice(0, 8).map((r) => `<p class="pk-wrong">${r.q.s.includes('___') ? esc(r.q.s).replace('___', `<b class="pk-ans">${esc(r.q.a)}</b>`) : `${esc(r.q.s)} <b class="pk-ans">${esc(r.q.a)}</b>`}${r.picked ? `<br><span class="faint">bạn chọn “${esc(r.picked)}”</span>` : '<br><span class="faint">hết giờ</span>'}</p>`).join('');
  return `<div class="page hn-scr hn-res">
    <div class="hn-trophy">${mochi('happy', 70)}${bolt(L.ok >= L.n * 0.7 ? 'happy' : 'calm', 70)}</div>
    <p class="hn-big center">Đúng ${L.ok}/${L.n}!</p>
    ${L.best ? '<p class="center hn-sub">Kỷ lục mới!</p>' : ''}
    <div class="hn-tiles3"><div style="background:#FFD84D"><b>${L.score}</b><span>điểm</span></div><div style="background:#FFB3CB"><b>${L.n - L.ok}</b><span>câu sai</span></div><div style="background:#BFE3FF"><b>${mm}</b><span>thời gian</span></div></div>
    ${L.wrong.length ? `<div class="hn-card"><span class="hn-tag" style="background:#FFB3CB">${L.wrong.length} câu cần phục thù</span>${wrong}</div>` : ''}
    <div class="hn-row2">${bigBtn('go', 'Xong', 'data-to="#/pick" style="flex:.75;background:#fff"')}${L.wrong.length ? bigBtn('pk-start', `Phục thù ${L.wrong.length} câu!`, `data-keys="${esc(L.wrong.map((r) => r.id).join(','))}" style="flex:1.25"`) : bigBtn('pk-start', 'Chơi lượt mới!', 'style="flex:1.25"')}</div>
  </div>`;
}
