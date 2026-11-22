// Trang "Câu tôi đã viết" (#/mysent): gom mọi câu người học tự viết.
//  - Từ vựng: câu ở bước Đặt câu (lưu trong từng từ: w.sentences = [{ text, at, ai? }]), kèm nhận xét AI nếu đã nhờ chấm.
//  - Ngữ pháp: câu viết ở cuối mỗi bài (lưu trong tiến độ bài: L:<bài>.sentences = [chuỗi]).
import { S, saveWord, gPut } from './store.js';
import { esc, toast, fmtDate, dateStr, today, addDays } from './util.js';
import { icon, on, rerender, navBar, confirmSheet, chooseSheet, richText } from './ui.js';
import { G } from './grammar.js';

const ui = { tab: 'vocab', q: '' };

export const vocabSentences = () => [...S.words.values()]
  .flatMap((w) => (w.sentences || []).map((x, i) => ({ w, i, text: x.text, at: x.at || 0, ai: x.ai || '' })))
  .sort((a, b) => b.at - a.at);
export const grammarSentences = () => [...S.grammar.values()]
  .filter((r) => String(r.id).startsWith('L:') && r.sentences?.length)
  .flatMap((r) => r.sentences.map((text, i) => ({ r, i, text, lesson: G.lessons.get(r.lessonId), at: r.doneAt || '' })))
  .reverse();
export const sentenceCount = () => vocabSentences().length + grammarSentences().length;

const match = (s) => !ui.q || s.toLowerCase().includes(ui.q.toLowerCase());

on('ms-tab', (el) => { ui.tab = el.dataset.v; rerender(); });
on('ms-search', (el) => { ui.q = el.value; const box = document.getElementById('ms-list'); if (box) box.innerHTML = listHtml(); });
on('ms-del', async (el) => {
  const w = S.words.get(el.dataset.id);
  const i = Number(el.dataset.i);
  const s = w?.sentences?.[i];
  if (!s || !(await confirmSheet({ title: 'Xoá câu này?', body: s.text, okLabel: 'Xoá', danger: true }))) return;
  w.sentences = w.sentences.filter((_, k) => k !== i);
  await saveWord(w);
  toast('Đã xoá câu');
  rerender();
});
on('ms-gdel', async (el) => {
  const r = S.grammar.get(el.dataset.id);
  const i = Number(el.dataset.i);
  const s = r?.sentences?.[i];
  if (!s || !(await confirmSheet({ title: 'Xoá câu này?', body: s, okLabel: 'Xoá', danger: true }))) return;
  await gPut({ ...r, sentences: r.sentences.filter((_, k) => k !== i) });
  toast('Đã xoá câu');
  rerender();
});

const dayOfAt = (at) => (typeof at === 'number' ? (at ? dateStr(new Date(at)) : '') : at || '');
const dateOf = (at) => (dayOfAt(at) ? fmtDate(dayOfAt(at)) : '');
const dayName = (d) => (!d ? 'Không rõ ngày' : d === today() ? 'Hôm nay' : d === addDays(today(), -1) ? 'Hôm qua' : fmtDate(d));
// Câu của thẻ đang mở (Từ vựng / Ngữ pháp), kèm ngày viết (YYYY-MM-DD).
const tabSentences = () => (ui.tab === 'grammar' ? grammarSentences() : vocabSentences()).map((x) => ({ ...x, day: dayOfAt(x.at) })).sort((a, b) => b.day.localeCompare(a.day));
/** Xoá mọi câu (của thẻ đang mở) có ngày thoả điều kiện. Trả về số câu đã xoá. */
async function removeWhere(test) {
  let n = 0;
  if (ui.tab === 'grammar') {
    const recs = [];
    for (const r of S.grammar.values()) {
      if (!String(r.id).startsWith('L:') || !r.sentences?.length || !test(r.doneAt || '')) continue;
      n += r.sentences.length;
      recs.push({ ...r, sentences: [] });
    }
    if (recs.length) await gPut(...recs);
  } else {
    for (const w of S.words.values()) {
      if (!w.sentences?.length) continue;
      const keep = w.sentences.filter((x) => !test(dayOfAt(x.at || 0)));
      if (keep.length === w.sentences.length) continue;
      n += w.sentences.length - keep.length;
      w.sentences = keep;
      await saveWord(w);
    }
  }
  return n;
}
async function confirmRemove(label, test) {
  const count = tabSentences().filter((x) => test(x.day)).length;
  if (!count) { toast('Không có câu nào để xoá'); return; }
  if (!(await confirmSheet({ title: `Xoá ${count} câu?`, body: `${label}. Không hoàn tác được.`, okLabel: `Xoá ${count} câu`, danger: true }))) return;
  const n = await removeWhere(test);
  toast(`Đã xoá ${n} câu`);
  rerender();
}
on('ms-bulk', async () => {
  const list = tabSentences();
  const t = today(), week = addDays(t, -6);
  const cnt = (f) => list.filter((x) => f(x.day)).length;
  const RANGES = {
    today: ['Câu viết hôm nay', (d) => d === t],
    week: ['Câu viết trong 7 ngày qua', (d) => d >= week && d <= t],
    all: [`Tất cả câu ${ui.tab === 'grammar' ? 'ngữ pháp' : 'từ vựng'}`, () => true],
  };
  const v = await chooseSheet({ title: `Xoá câu ${ui.tab === 'grammar' ? 'ngữ pháp' : 'từ vựng'}`, options: Object.entries(RANGES).map(([k, [l, f]]) => ({ value: k, label: l, sub: `${cnt(f)} câu` })) });
  if (!v || !RANGES[v]) return;
  await confirmRemove(RANGES[v][0], RANGES[v][1]);
});
on('ms-day', (el) => { const d = el.dataset.d; confirmRemove(`Các câu viết ${dayName(d).toLowerCase() === 'hôm nay' ? 'hôm nay' : `ngày ${dayName(d)}`}`, (x) => x === d); });
const dayHead = (d, n) => `<div class="ms-day"><b>${esc(dayName(d))}</b><span class="small muted">${n} câu</span><button class="link danger-text" data-act="ms-day" data-d="${esc(d)}">Xoá ngày này</button></div>`;
/** Chèn tiêu đề ngày trước nhóm câu cùng ngày (danh sách đã xếp mới nhất trước). */
function withDays(list, row) {
  const count = {};
  for (const x of list) count[x.day] = (count[x.day] || 0) + 1;
  let last = null;
  return list.map((x) => { const h = x.day !== last ? dayHead(x.day, count[x.day]) : ''; last = x.day; return h + row(x); }).join('');
}
function listHtml() {
  if (ui.tab === 'grammar') {
    const list = tabSentences().filter((x) => match(x.text));
    if (!list.length) return `<div class="card empty"><p>${ui.q ? 'Không có câu nào khớp.' : 'Chưa có câu nào. Câu bạn viết ở bước cuối mỗi bài ngữ pháp sẽ hiện ở đây.'}</p></div>`;
    return withDays(list, (x) => `<div class="card ms-item"><p class="en ms-text">${esc(x.text)}</p>
      <div class="ms-meta"><span class="small muted">${x.lesson ? esc(x.lesson.title) : 'Bài ngữ pháp'}</span>
      <button class="iconbtn sm" data-act="ms-gdel" data-id="${esc(x.r.id)}" data-i="${x.i}" aria-label="Xoá câu">${icon('trash', 'sm')}</button></div></div>`);
  }
  const list = tabSentences().filter((x) => match(x.text) || match(x.w.word));
  if (!list.length) return `<div class="card empty"><p>${ui.q ? 'Không có câu nào khớp.' : 'Chưa có câu nào. Khi học từ ở chế độ Đặt câu, câu bạn viết sẽ hiện ở đây.'}</p></div>`;
  return withDays(list, (x) => `<div class="card ms-item"><p class="en ms-text">${esc(x.text)}</p>
    <div class="ms-meta"><button class="tag" data-act="go" data-to="#/word/${encodeURIComponent(x.w.id)}">${esc(x.w.word)}</button><span class="small muted">${new Date(x.at || 0).toTimeString().slice(0, 5)}</span>
    <button class="iconbtn sm" data-act="ms-del" data-id="${esc(x.w.id)}" data-i="${x.i}" aria-label="Xoá câu">${icon('trash', 'sm')}</button></div>
    ${x.ai ? `<details class="ms-ai"><summary>${icon('sparkle', 'sm')} Nhận xét của AI</summary><div class="ai-out">${richText(x.ai)}</div></details>` : ''}</div>`);
}

export function mySentView() {
  const nv = vocabSentences().length, ng = grammarSentences().length;
  const tab = (v, l, n) => `<button class="${ui.tab === v ? 'on' : ''}" data-act="ms-tab" data-v="${v}">${l} · ${n}</button>`;
  const right = (ui.tab === 'grammar' ? ng : nv) ? `<button class="iconbtn" data-act="ms-bulk" aria-label="Xoá nhiều câu" title="Xoá theo ngày / tuần / tất cả">${icon('trash')}</button>` : undefined;
  return `<div class="page">${navBar('Câu tôi đã viết', { fallback: '#/vocab', ...(right ? { right } : {}) })}
    <div class="seg" style="margin-bottom:12px">${tab('vocab', 'Từ vựng', nv)}${tab('grammar', 'Ngữ pháp', ng)}</div>
    <div class="search">${icon('search')}<input type="search" placeholder="Tìm trong câu đã viết…" value="${esc(ui.q)}" data-in="ms-search" autocomplete="off" autocapitalize="none" autocorrect="off"></div>
    <div id="ms-list">${listHtml()}</div></div>`;
}
