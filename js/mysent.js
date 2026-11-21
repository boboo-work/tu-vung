// Trang "Câu tôi đã viết" (#/mysent): gom mọi câu người học tự viết.
//  - Từ vựng: câu ở bước Đặt câu (lưu trong từng từ: w.sentences = [{ text, at, ai? }]), kèm nhận xét AI nếu đã nhờ chấm.
//  - Ngữ pháp: câu viết ở cuối mỗi bài (lưu trong tiến độ bài: L:<bài>.sentences = [chuỗi]).
import { S, saveWord, gPut } from './store.js';
import { esc, toast, fmtDate, dateStr } from './util.js';
import { icon, on, rerender, navBar, confirmSheet, richText } from './ui.js';
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

const dateOf = (at) => (at ? fmtDate(typeof at === 'number' ? dateStr(new Date(at)) : at) : '');
function listHtml() {
  if (ui.tab === 'grammar') {
    const list = grammarSentences().filter((x) => match(x.text));
    if (!list.length) return `<div class="card empty"><p>${ui.q ? 'Không có câu nào khớp.' : 'Chưa có câu nào. Câu bạn viết ở bước cuối mỗi bài ngữ pháp sẽ hiện ở đây.'}</p></div>`;
    return list.map((x) => `<div class="card ms-item"><p class="en ms-text">${esc(x.text)}</p>
      <div class="ms-meta"><span class="small muted">${x.lesson ? esc(x.lesson.title) : 'Bài ngữ pháp'}${x.at ? ` · ${dateOf(x.at)}` : ''}</span>
      <button class="iconbtn sm" data-act="ms-gdel" data-id="${esc(x.r.id)}" data-i="${x.i}" aria-label="Xoá câu">${icon('trash', 'sm')}</button></div></div>`).join('');
  }
  const list = vocabSentences().filter((x) => match(x.text) || match(x.w.word));
  if (!list.length) return `<div class="card empty"><p>${ui.q ? 'Không có câu nào khớp.' : 'Chưa có câu nào. Khi học từ ở chế độ Đặt câu, câu bạn viết sẽ hiện ở đây.'}</p></div>`;
  return list.map((x) => `<div class="card ms-item"><p class="en ms-text">${esc(x.text)}</p>
    <div class="ms-meta"><button class="tag" data-act="go" data-to="#/word/${encodeURIComponent(x.w.id)}">${esc(x.w.word)}</button><span class="small muted">${dateOf(x.at)}</span>
    <button class="iconbtn sm" data-act="ms-del" data-id="${esc(x.w.id)}" data-i="${x.i}" aria-label="Xoá câu">${icon('trash', 'sm')}</button></div>
    ${x.ai ? `<details class="ms-ai"><summary>${icon('sparkle', 'sm')} Nhận xét của AI</summary><div class="ai-out">${richText(x.ai)}</div></details>` : ''}</div>`).join('');
}

export function mySentView() {
  const nv = vocabSentences().length, ng = grammarSentences().length;
  const tab = (v, l, n) => `<button class="${ui.tab === v ? 'on' : ''}" data-act="ms-tab" data-v="${v}">${l} · ${n}</button>`;
  return `<div class="page">${navBar('Câu tôi đã viết', { fallback: '#/vocab' })}
    <div class="seg" style="margin-bottom:12px">${tab('vocab', 'Từ vựng', nv)}${tab('grammar', 'Ngữ pháp', ng)}</div>
    <div class="search">${icon('search')}<input type="search" placeholder="Tìm trong câu đã viết…" value="${esc(ui.q)}" data-in="ms-search" autocomplete="off" autocapitalize="none" autocorrect="off"></div>
    <div id="ms-list">${listHtml()}</div></div>`;
}
