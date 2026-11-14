// Các màn hình chính: Home, Learn, Review, Vocabulary (danh sách, chi tiết, form, chủ đề).
import { gamePool, GAME_MIN } from './game.js';
import { S, dayActive, allWords, dueWords, newWords, dayOf, summary, forecast, deckName, blankWord, saveWord, deleteWord, findByText, addDeck, renameDeck, deleteDeck, resetProgress, FALLBACK_DECK } from './store.js';
import { esc, today, addDays, parseDate, fmtDate, relDay, fmtInterval, speak, toast, splitList, dayDiff, fold } from './util.js';
import { statusOf, isNew, isDue } from './srs.js';
import { icon, on, go, back, rerender, navBar, confirmSheet, promptSheet, chooseSheet } from './ui.js';
import { MODES, startSession, practicePool } from './study.js';
import { loadSeed } from './io.js';
import { aiReady } from './ai.js';
import { lookupWord, buildFill, POS_LIST } from './lookup.js';
import { G, nextLesson, todayLessons, gDueCount, grammarReviewCard } from './grammar.js';
import { W, nextPart, todayWriting, essayDraft, essayDraftCta } from './writing.js';
import { R, nextPassage, todayReading } from './reading.js';
import { learnSwitch } from './ui.js';

const ui = { learnDeck: '', vocab: { q: '', filter: 'all', limit: 60 }, form: null };
const voice = () => ({ lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName });
// Bộ lọc có thể trỏ tới chủ đề đã bị xoá (xoá chủ đề, khôi phục, xoá hết dữ liệu) → đưa về "tất cả".
function checkFilters() {
  const has = (id) => S.decks.some((d) => d.id === id);
  if (ui.learnDeck && !has(ui.learnDeck)) ui.learnDeck = '';
  if (!['all', 'fav', 'due'].includes(ui.vocab.filter) && !has(ui.vocab.filter)) ui.vocab.filter = 'all';
}
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const ring = (value, goal) => {
  const c = 2 * Math.PI * 24;
  const p = goal ? Math.min(1, value / goal) : 0;
  return `<svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="24"/><circle class="fg" cx="30" cy="30" r="24" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
};
const deckSelect = (value, act, allLabel = 'Tất cả chủ đề') =>
  `<select class="input" data-change="${act}" aria-label="Chủ đề"><option value="">${allLabel}</option>${S.decks.map((d) => `<option value="${d.id}" ${d.id === value ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>`;

// ================= HOME =================
export function homeView() {
  const sum = summary();
  const now = new Date();
  const head = `<header class="top"><div><p class="eyebrow">${WEEKDAYS[now.getDay()]}, ${now.getDate()} tháng ${now.getMonth() + 1}</p><h1>Hôm nay</h1></div>
    <button class="iconbtn tonal" data-act="go" data-to="#/settings" aria-label="Cài đặt">${icon('gear')}</button></header>`;

  // Chưa có từ nào và chưa học ngữ pháp → màn hình bắt đầu. Đã học ngữ pháp thì hiện Trang chủ đầy đủ.
  const learnedGrammar = S.grammar.size > 0; // đã học bài hoặc đã làm kiểm tra đầu vào
  const wroteSomething = S.writing.size > 0 || S.reading.size > 0; // đã dùng Writing hoặc Reading
  if (!sum.total && !learnedGrammar && !wroteSomething) {
    return `<div class="page">${head}
      <div class="card empty"><div class="art">${icon('learn')}</div>
        <h3>Bắt đầu kho từ của bạn</h3>
        <p>Thêm từ đầu tiên, import từ file CSV/Excel, hoặc nạp 20 từ mẫu để dùng thử ngay.</p>
        <div class="stack">
          <button class="btn" data-act="go" data-to="#/new">${icon('plus', 'sm')} Thêm từ đầu tiên</button>
          <button class="btn soft" data-act="seed">Nạp 20 từ mẫu</button>
          <button class="btn ghost" data-act="go" data-to="#/settings">Import CSV / Excel</button>
        </div></div>
      <button class="listlink" data-act="go" data-to="#/grammar" style="margin-top:12px"><span class="lead">${icon('learn')}</span><span class="body"><b>Học ngữ pháp</b><small>4 khoá từ A1 đến band 7.0, bài ngắn 8–12 phút</small></span>${icon('chev')}</button>
      <button class="listlink" data-act="go" data-to="#/writing"><span class="lead">${icon('pen')}</span><span class="body"><b>Luyện Writing</b><small>Task 2 theo đoạn hoặc cả bài 40 phút, Task 1 biểu đồ</small></span>${icon('chev')}</button>
      <button class="listlink" data-act="go" data-to="#/reading"><span class="lead">${icon('list')}</span><span class="body"><b>Luyện Reading</b><small>Đề thật, Simplify và Read connection theo Linear thinking</small></span>${icon('chev')}</button></div>`;
  }

  const day = dayOf();
  const t = today();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(t, i - 6);
    const x = S.days.get(d);
    const active = dayActive(x);
    return `<div class="${active ? 'on' : ''}"><i></i>${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][parseDate(d).getDay()]}</div>`;
  }).join('');
  const due = sum.due;
  const fresh = newWords().length;
  const newLeft = Math.max(0, S.settings.newPerDay - day.newIds.length);
  const canLearn = Math.min(fresh, newLeft);
  const backupAge = S.settings.lastBackup ? dayDiff(S.settings.lastBackup, t) : null;
  // Nhắc sao lưu mỗi tuần, khi đã có dữ liệu đáng giữ (từ vựng, ngữ pháp, bài viết hoặc kết quả Reading).
  const hasData = sum.total >= 10 || S.grammar.size > 0 || S.writing.size > 0 || S.reading.size > 0;
  const needBackup = hasData && (backupAge === null || backupAge >= 7);
  const gReady = G.state === 'ready';
  const gGoal = gReady ? S.settings.grammarPerDay : 0;
  const gToday = todayLessons();
  const gDue = gDueCount();
  const gNext = gReady && gToday < gGoal ? nextLesson() : null;
  const wGoal = W.state === 'ready' ? S.settings.writingPerDay : 0;
  const wToday = todayWriting();
  const wDraft = essayDraft();
  // Có bài 40 phút viết dở thì nhắc viết tiếp bài đó thay cho phần luyện hằng ngày.
  const wNext = !wDraft && wGoal && wToday < wGoal ? nextPart() : null;
  const rGoal = R.state === 'ready' ? S.settings.readingPerDay : 0;
  const rToday = todayReading();
  const rDraft = [...S.reading.values()].find((x) => x.kind === 'draft' && !String(x.pid).startsWith('full:'));
  const rNext = !rDraft && rGoal && rToday < rGoal ? nextPassage() : null;
  const rDraftMeta = rDraft && R.tests.flatMap((t) => t.passages).find((p) => p.id === rDraft.pid);
  const ringCount = 2 + (gGoal ? 1 : 0) + (wGoal ? 1 : 0) + (rGoal ? 1 : 0);

  return `<div class="page wide">${head}<div class="home-grid"><div>
    <div class="hero">
      <div class="row-between"><div><div class="big" data-count="${sum.streak}">${sum.streak}</div><div class="lbl">ngày học liên tiếp</div></div>${icon('flame')}</div>
      <div class="week">${week}</div>
    </div>
    <div class="goals ${['', '', '', 'three', 'four', 'four five'][ringCount]}">
      <div class="goal">${ring(day.newIds.length, S.settings.newPerDay)}<div><b>${day.newIds.length}/${S.settings.newPerDay}</b><span>Từ mới</span></div></div>
      <div class="goal">${ring(day.reviewIds.length, S.settings.reviewPerDay)}<div><b>${day.reviewIds.length}/${S.settings.reviewPerDay}</b><span>Ôn tập</span></div></div>
      ${gGoal ? `<div class="goal" data-act="go" data-to="#/grammar" role="button">${ring(gToday, gGoal)}<div><b>${gToday}/${gGoal}</b><span>Ngữ pháp</span></div></div>` : ''}
      ${wGoal ? `<div class="goal" data-act="go" data-to="#/writing" role="button">${ring(wToday, wGoal)}<div><b>${wToday}/${wGoal}</b><span>Writing</span></div></div>` : ''}
      ${rGoal ? `<div class="goal" data-act="go" data-to="#/reading" role="button">${ring(rToday, rGoal)}<div><b>${rToday}/${rGoal}</b><span>Reading</span></div></div>` : ''}
    </div>
    <div class="cta-stack">
      ${due ? `<button class="btn" data-act="start-review">${icon('review', 'sm')} Ôn tập ${due} từ đến hạn</button>` : ''}
      ${canLearn ? `<button class="btn ${due ? 'ghost' : ''}" data-act="start-learn" data-all="1">${icon('learn', 'sm')} Học ${canLearn} từ mới</button>` : ''}
      ${gDue ? `<button class="btn ${due || canLearn ? 'ghost' : ''}" data-act="g-cards">${icon('review', 'sm')} Ôn ${gDue} thẻ ngữ pháp</button>` : ''}
      ${gNext ? `<button class="btn ${due || canLearn || gDue ? 'ghost' : ''}" data-act="g-start" data-id="${gNext.id}">${icon('learn', 'sm')} Ngữ pháp: ${esc(gNext.title)}</button>` : ''}
      ${rDraftMeta ? `<button class="btn ${due || canLearn || gDue || gNext ? 'ghost' : ''}" data-act="go" data-to="#/rpassage/${rDraftMeta.id}">${icon('learn', 'sm')} Reading: làm tiếp ${esc(rDraftMeta.title)}</button>` : ''}
      ${rNext ? `<button class="btn ${due || canLearn || gDue || gNext ? 'ghost' : ''}" data-act="go" data-to="#/rpassage/${rNext.id}">${icon('learn', 'sm')} Reading: ${esc(rNext.title)}</button>` : ''}
      ${wDraft ? essayDraftCta(wDraft, due || canLearn || gDue || gNext ? 'ghost' : '') : ''}
      ${wNext ? `<button class="btn ${due || canLearn || gDue || gNext ? 'ghost' : ''}" data-act="w-today">${icon('pen', 'sm')} Writing: ${esc(wNext.part.name)}</button>` : ''}
      ${!due && !canLearn && !gDue && !gNext && !wNext && !wDraft && !rNext && !rDraftMeta ? `<div class="banner info">${icon('check')}<span>${fresh ? 'Bạn đã hoàn thành mục tiêu hôm nay. Muốn học thêm, mở tab <b>Học</b>.' : 'Không còn từ nào cần học hôm nay. Hãy thêm từ mới hoặc luyện tập tự do ở tab <b>Học</b>.'}</span></div>` : ''}
    </div></div><div>
    <h2>Tổng quan</h2>
    <div class="tiles">
      <div class="tile"><b>${sum.total}</b><span>Tổng số từ</span></div>
      <div class="tile"><b>${sum.learned}</b><span>Đã học</span></div>
      <div class="tile"><b>${sum.pctMastered}%</b><span>Đã ghi nhớ</span></div>
    </div>
    <h2>Công cụ</h2>
    <button class="listlink" data-act="go" data-to="#/ai"><span class="lead">${icon('sparkle')}</span><span class="body"><b>Trợ lý AI</b><small>Giải thích, phân biệt từ, chấm câu</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="go" data-to="#/new"><span class="lead">${icon('plus')}</span><span class="body"><b>Thêm từ mới</b><small>Lưu từ bạn vừa gặp</small></span>${icon('chev')}</button>
    ${needBackup ? `<div class="banner" style="margin-top:14px">${icon('info')}<span>${backupAge === null ? 'Bạn chưa sao lưu dữ liệu lần nào.' : `Lần sao lưu gần nhất cách đây ${backupAge} ngày.`} <a href="#/settings" data-act="go" data-to="#/settings">Sao lưu ngay</a></span></div>` : ''}
  </div></div></div>`;
}

on('seed', async () => {
  const n = await loadSeed();
  toast(n ? `Đã nạp ${n} từ mẫu` : 'Bộ từ mẫu đã có sẵn trong kho');
  rerender();
});
on('start-review', () => {
  const ids = dueWords().slice(0, S.settings.reviewPerDay).map((w) => w.id);
  startSession({ mode: 'en-vi', ids, source: 'review', backTo: '#/review' });
});
on('start-learn', (el) => {
  const extra = Number(el.dataset.extra || 0);
  const left = Math.max(0, S.settings.newPerDay - dayOf().newIds.length);
  const n = extra || left;
  const deckId = el.dataset.all ? '' : ui.learnDeck; // nút ở Trang chủ luôn học trên toàn kho
  const ids = newWords(deckId).slice(0, n).map((w) => w.id);
  startSession({ mode: 'en-vi', ids, source: 'learn', backTo: el.dataset.all ? '#/home' : '#/learn', deckId });
});

// ================= LEARN =================
const modeRows = (act, disabledCheck, skip = []) => MODES.filter((m) => !skip.includes(m.id)).map((m) => {
  const off = disabledCheck(m);
  return `<button class="listlink" data-act="${act}" data-mode="${m.id}" ${off ? 'disabled' : ''}><span class="lead">${icon(m.icon)}</span><span class="body"><b>${m.name}</b><small>${off || m.desc}</small></span>${icon('chev')}</button>`;
}).join('');

export function learnView() {
  checkFilters();
  const day = dayOf();
  const fresh = newWords(ui.learnDeck).length;
  const left = Math.max(0, S.settings.newPerDay - day.newIds.length);
  const n = Math.min(fresh, left);
  const scopeCount = allWords().filter((w) => !ui.learnDeck || w.deckId === ui.learnDeck).length;
  let main;
  if (!S.words.size) main = `<div class="card empty"><div class="art">${icon('learn')}</div><h3>Chưa có từ nào</h3><p>Thêm từ vào kho để bắt đầu học.</p><button class="btn" data-act="go" data-to="#/new">Thêm từ</button></div>`;
  else if (!fresh) main = `<div class="card"><b>Không còn từ mới${ui.learnDeck ? ' trong chủ đề này' : ''}</b><p class="muted small" style="margin-top:4px">Bạn đã học hết. Thêm từ mới hoặc luyện tập bên dưới.</p><button class="btn soft" style="margin-top:14px" data-act="go" data-to="#/new">${icon('plus', 'sm')} Thêm từ</button></div>`;
  else main = `<div class="card">
      <div class="row-between"><div><b style="font-size:20px">${fresh} từ chưa học</b><p class="muted small">Hôm nay: ${day.newIds.length}/${S.settings.newPerDay} từ mới</p></div>${ring(day.newIds.length, S.settings.newPerDay)}</div>
      ${n ? `<button class="btn" style="margin-top:16px" data-act="start-learn">Học ${n} từ mới</button>`
          : `<p class="small" style="margin-top:12px;color:var(--green);font-weight:600">Đã đạt mục tiêu từ mới hôm nay</p>
             <button class="btn soft" style="margin-top:10px" data-act="start-learn" data-extra="${Math.min(5, fresh)}">Học thêm ${Math.min(5, fresh)} từ</button>`}
    </div>`;
  return `<div class="page"><header class="top"><div><p class="eyebrow">Flashcard</p><h1>Học từ mới</h1></div></header>
    ${learnSwitch('vocab')}
    ${deckSelect(ui.learnDeck, 'learn-deck')}
    <div style="margin-top:12px">${main}</div>
    <h2>Luyện tập</h2>
    <p class="muted small" style="margin:-4px 2px 10px">10 từ mỗi lượt${ui.learnDeck ? ` trong “${esc(deckName(ui.learnDeck))}”` : ''}, ưu tiên từ đến hạn và từ đã học.</p>
    ${modeRows('practice', (m) => (!scopeCount ? 'Chưa có từ trong phạm vi này' : S.words.size < m.min ? `Cần ít nhất ${m.min} từ trong kho` : ''))}
    <h2>Mini game</h2>
    <button class="listlink" data-act="go" data-to="#/game"><span class="lead">${icon('game')}</span><span class="body"><b>Chạy & Gõ</b><small>${gamePool().length >= GAME_MIN ? 'Gõ đúng từ để nhảy qua chướng ngại vật · 3 mạng' : `Cần học ít nhất ${GAME_MIN} từ để chơi`}</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="go" data-to="#/drop"><span class="lead">${icon('target')}</span><span class="body"><b>Bắn Từ</b><small>${gamePool().length >= GAME_MIN ? 'Từ rơi xuống, gõ đúng để bắn trúng · không có mạng' : `Cần học ít nhất ${GAME_MIN} từ để chơi`}</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="go" data-to="#/match"><span class="lead">${icon('link')}</span><span class="body"><b>Nối Cụm</b><small>Chọn từ đúng để hoàn thành cụm từ · không cần bàn phím</small></span>${icon('chev')}</button>
    <button class="listlink" data-act="go" data-to="#/pop"><span class="lead">${icon('balloon')}</span><span class="body"><b>Nghe & Chạm</b><small>Nghe từ, chạm bong bóng có nghĩa đúng · không cần bàn phím</small></span>${icon('chev')}</button>
  </div>`;
}
on('learn-deck', (el) => { ui.learnDeck = el.value; rerender(); });
on('practice', (el) => startSession({ mode: el.dataset.mode, ids: practicePool(ui.learnDeck), source: 'practice', backTo: '#/learn' }));

// ================= REVIEW =================
export function reviewView() {
  const due = dueWords();
  const fc = forecast();
  const max = Math.max(1, ...fc.map((f) => f.count));
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const fcChart = `<div class="card"><div class="row-between"><b>7 ngày tới</b><span class="small muted">số từ đến hạn</span></div>
    <div class="chart"><div class="bars" style="height:90px">${fc.map((f) => `<div class="bar" title="${fmtDate(f.date)}: ${f.count} từ"><span class="small" style="font-size:11.5px;color:var(--text-2);font-weight:600">${f.count || ''}</span><i class="n" style="height:${(f.count / max) * 70}px;border-radius:4px 4px 0 0"></i></div>`).join('')}</div>
    <div class="xlabels">${fc.map((f, i) => `<span>${i === 0 ? 'Nay' : names[parseDate(f.date).getDay()]}</span>`).join('')}</div></div></div>`;

  if (!due.length) {
    const learned = allWords().filter((w) => !isNew(w));
    const next = learned.map((w) => w.srs.due).filter(Boolean).sort()[0];
    return `<div class="page"><header class="top"><div><p class="eyebrow">Spaced Repetition</p><h1>Ôn tập</h1></div></header>
      <div class="card empty"><div class="art">${icon('check')}</div><h3>${learned.length ? 'Đã ôn hết hôm nay' : 'Chưa có từ cần ôn'}</h3>
      <p>${learned.length ? `Lần ôn kế tiếp: ${relDay(next)}. Hệ thống sẽ tự đưa từ đến hạn vào đây.` : 'Học từ mới trước — hệ thống sẽ tự lên lịch ôn cho bạn.'}</p>
      <button class="btn soft" data-act="go" data-to="#/learn">Sang tab Học</button></div>
      ${grammarReviewCard()}
      ${learned.length ? `<div style="margin-top:12px">${fcChart}</div>` : ''}</div>`;
  }
  const batch = Math.min(due.length, S.settings.reviewPerDay);
  const overdue = due.filter((w) => w.srs.due < today()).length;
  return `<div class="page"><header class="top"><div><p class="eyebrow">Spaced Repetition</p><h1>Ôn tập</h1></div></header>
    <div class="hero"><div class="big">${due.length}</div><div class="lbl">từ đến hạn ôn hôm nay${overdue ? ` · ${overdue} từ quá hạn` : ''}</div>
      <button class="btn" style="margin-top:18px;background:var(--accent-ink);color:var(--accent)" data-act="start-review">Bắt đầu ôn ${batch} từ</button></div>
    ${grammarReviewCard()}
    <h2>Ôn bằng bài tập</h2>
    ${modeRows('review-mode', (m) => (S.words.size < m.min ? `Cần ít nhất ${m.min} từ trong kho` : ''), ['en-vi'])}
    <h2>Lịch sắp tới</h2>${fcChart}
    <h2>Đến hạn (${due.length})</h2>
    <div class="wlist" style="margin-top:0">${due.slice(0, 30).map(wordRow).join('')}</div>
    ${due.length > 30 ? `<p class="small faint center" style="margin-top:10px">và ${due.length - 30} từ khác</p>` : ''}
  </div>`;
}
on('review-mode', (el) => {
  const ids = dueWords().slice(0, S.settings.reviewPerDay).map((w) => w.id);
  startSession({ mode: el.dataset.mode, ids, source: 'review', backTo: '#/review' });
});

// ================= VOCABULARY =================
function wordRow(w) {
  const st = statusOf(w);
  return `<div class="wrow" data-act="go" data-to="#/word/${w.id}">
    <span class="dot ${st.key}" title="${st.label}"></span>
    <div class="body"><span class="w">${esc(w.word)}</span>${w.pos ? `<span class="pos">${esc(w.pos)}</span>` : ''}<p>${esc(w.meaning || '—')}</p></div>
    <button class="iconbtn ${w.favorite ? 'on' : ''}" data-act="fav" data-id="${w.id}" aria-label="Yêu thích">${icon('star', w.favorite ? 'fill' : '')}</button></div>`;
}

function filteredWords() {
  const { q, filter } = ui.vocab;
  const k = fold(q.trim());
  return allWords()
    .filter((w) => (filter === 'all' ? true : filter === 'fav' ? w.favorite : filter === 'due' ? isDue(w) : w.deckId === filter))
    .filter((w) => !k || fold(w.word).includes(k) || fold(w.meaning).includes(k) || fold(w.definition).includes(k))
    .sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));
}

function vocabList() {
  const list = filteredWords();
  if (!S.words.size) return `<div class="card empty" style="margin-top:12px"><div class="art">${icon('vocab')}</div><h3>Kho từ đang trống</h3><p>Bấm nút + để thêm từ, hoặc nạp bộ từ mẫu.</p><button class="btn soft" data-act="seed">Nạp 20 từ mẫu</button></div>`;
  if (!list.length) return `<div class="empty"><p>Không tìm thấy từ nào phù hợp.</p></div>`;
  return `<p class="small faint" style="margin:12px 2px 0">${list.length} từ</p>
    <div class="wlist" style="margin-top:8px">${list.slice(0, ui.vocab.limit).map(wordRow).join('')}</div>
    ${list.length > ui.vocab.limit ? `<button class="btn ghost" style="margin-top:12px" data-act="vocab-more">Hiện thêm (${list.length - ui.vocab.limit})</button>` : ''}`;
}

export function vocabView() {
  checkFilters();
  const f = ui.vocab.filter;
  const counts = {};
  for (const w of S.words.values()) counts[w.deckId] = (counts[w.deckId] || 0) + 1;
  const chip = (id, label) => `<button class="chip ${f === id ? 'on' : ''}" data-act="vocab-filter" data-filter="${id}">${label}</button>`;
  return `<div class="page"><header class="top"><div><p class="eyebrow">${S.words.size} từ</p><h1>Kho từ vựng</h1></div>
      <button class="iconbtn tonal" data-act="go" data-to="#/decks" aria-label="Quản lý chủ đề">${icon('folder')}</button></header>
    <div class="search">${icon('search')}<input type="search" placeholder="Tìm từ hoặc nghĩa…" value="${esc(ui.vocab.q)}" data-in="vocab-search" autocomplete="off" autocapitalize="none" autocorrect="off" enterkeyhint="search"></div>
    <div class="chips">${chip('all', 'Tất cả')}${chip('fav', '★ Yêu thích')}${chip('due', 'Đến hạn')}${S.decks.filter((d) => counts[d.id] || f === d.id).map((d) => chip(d.id, `${esc(d.name)} · ${counts[d.id] || 0}`)).join('')}</div>
    <div id="vocab-list">${vocabList()}</div>
    <button class="fab" data-act="go" data-to="#/new" aria-label="Thêm từ">${icon('plus')}</button></div>`;
}
on('vocab-search', (el) => { ui.vocab.q = el.value; ui.vocab.limit = 60; document.getElementById('vocab-list').innerHTML = vocabList(); });
on('vocab-filter', (el) => { ui.vocab.filter = el.dataset.filter; ui.vocab.limit = 60; rerender(); });
on('vocab-more', () => { ui.vocab.limit += 100; rerender(); });
on('fav', async (el) => {
  const w = S.words.get(el.dataset.id);
  w.favorite = !w.favorite;
  await saveWord(w);
  rerender();
});

// ---- Chi tiết từ ----
const listField = (title, arr, en = true) => (arr?.length ? `<div class="field"><h4>${title}</h4><ul>${arr.map((x) => `<li class="${en ? 'en' : ''}">${esc(x)}</li>`).join('')}</ul></div>` : '');
const pillField = (title, arr) => (arr?.length ? `<div class="field"><h4>${title}</h4><div class="pill-list">${arr.map((x) => `<span>${esc(x)}</span>`).join('')}</div></div>` : '');
const textField = (title, text, en = false) => (text ? `<div class="field"><h4>${title}</h4><p class="${en ? 'en' : ''}" style="white-space:pre-wrap">${esc(text)}</p></div>` : '');
const DIFF = { 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' };

export function wordView(id) {
  const w = S.words.get(id);
  if (!w) return `<div class="page">${navBar('Từ vựng', { fallback: '#/vocab' })}<div class="empty"><p>Không tìm thấy từ này (có thể đã bị xoá).</p></div></div>`;
  const st = statusOf(w);
  const s = w.srs;
  const details = [listField('Ví dụ', w.examples), pillField('Collocations', w.collocations), pillField('Đồng nghĩa', w.synonyms), pillField('Trái nghĩa', w.antonyms),
    pillField('Word family', w.family), textField('Lỗi thường gặp', w.mistakes), textField('Ghi chú cá nhân', w.notes)].join('');
  return `<div class="page">
    ${navBar('', { fallback: '#/vocab', right: `<button class="iconbtn ${w.favorite ? 'on' : ''}" data-act="fav" data-id="${w.id}" aria-label="Yêu thích">${icon('star', w.favorite ? 'fill' : '')}</button><button class="iconbtn" data-act="go" data-to="#/edit/${w.id}" aria-label="Sửa">${icon('edit')}</button>` })}
    <div class="card">
      <div class="row-between" style="align-items:flex-start"><div style="min-width:0"><div class="headword">${esc(w.word)}</div>
        <div class="ipa" style="margin-top:4px">${esc(w.ipa || '')} ${w.pos ? `<span class="tag">${esc(w.pos)}</span>` : ''}</div></div>
        <button class="speakbtn" data-act="speak" data-text="${esc(w.word)}" aria-label="Nghe phát âm">${icon('speaker')}</button></div>
      <p class="meaning">${esc(w.meaning || '(chưa có nghĩa tiếng Việt)')}</p>
      ${w.definition ? `<p class="muted en" style="margin-top:6px">${esc(w.definition)}</p>` : ''}
      <div class="pill-list" style="margin-top:14px"><button class="tag" data-act="move-deck" data-id="${w.id}" style="min-height:30px">${icon('folder', 'sm')} <span style="vertical-align:4px">${esc(deckName(w.deckId))}</span></button><span class="tag" style="padding-top:6px">Độ khó: ${DIFF[w.difficulty] || 'Trung bình'}</span></div>
    </div>
    ${details ? `<div class="card">${details}</div>` : ''}
    ${w.sentences?.length ? `<div class="card"><div class="field"><h4>Câu tôi đã viết</h4><ul>${w.sentences.slice(-5).reverse().map((x) => `<li class="en">${esc(x.text)}</li>`).join('')}</ul></div></div>` : ''}
    <div class="card"><div class="row-between" style="margin-bottom:12px"><b>Tiến độ ghi nhớ</b><span class="tag">${st.label}</span></div>
      ${isNew(w) ? `<p class="muted small">Từ này chưa được học. Nó sẽ xuất hiện trong tab Học.</p>` : `<div class="kv">
        <div><span>Ôn kế tiếp</span>${fmtDate(s.due)} (${relDay(s.due)})</div><div><span>Khoảng cách</span>${fmtInterval(s.interval)}</div>
        <div><span>Hệ số dễ</span>${s.ease.toFixed(2)}</div><div><span>Nhớ liên tiếp / Quên</span>${s.reps} / ${s.lapses}</div></div>`}
    </div>
    <div class="stack" style="margin-top:16px">
      <button class="btn soft" data-act="go" data-to="#/ai/${w.id}">${icon('sparkle', 'sm')} Hỏi trợ lý AI về từ này</button>
      ${isNew(w) ? '' : `<button class="btn ghost" data-act="reset-word" data-id="${w.id}">Đặt lại tiến độ</button>`}
      <button class="btn danger" data-act="delete-word" data-id="${w.id}">${icon('trash', 'sm')} Xoá từ</button>
    </div></div>`;
}
on('speak', (el) => speak(el.dataset.text, voice()));
on('delete-word', async (el) => {
  const w = S.words.get(el.dataset.id);
  if (!(await confirmSheet({ title: `Xoá “${w.word}”?`, body: 'Từ và toàn bộ tiến độ học của nó sẽ bị xoá vĩnh viễn.', okLabel: 'Xoá', danger: true }))) return;
  await deleteWord(w.id);
  toast('Đã xoá từ');
  back('#/vocab');
});
on('reset-word', async (el) => {
  if (!(await confirmSheet({ title: 'Đặt lại tiến độ?', body: 'Từ này sẽ quay về trạng thái "chưa học".', okLabel: 'Đặt lại' }))) return;
  await resetProgress(el.dataset.id);
  toast('Đã đặt lại tiến độ');
  rerender();
});
on('move-deck', async (el) => {
  const w = S.words.get(el.dataset.id);
  const v = await chooseSheet({ title: 'Chuyển sang chủ đề', current: w.deckId, options: S.decks.map((d) => ({ value: d.id, label: d.name })) });
  if (!v || v === w.deckId) return;
  w.deckId = v;
  await saveWord(w);
  toast(`Đã chuyển sang “${deckName(v)}”`);
  rerender();
});

// ---- Form thêm / sửa ----
const POS = POS_LIST;

export function formView(id) {
  const editing = id ? S.words.get(id) : null;
  if (id && !editing) return `<div class="page">${navBar('Sửa từ')}<div class="empty"><p>Không tìm thấy từ này.</p></div></div>`;
  const preDeck = ['all', 'fav', 'due'].includes(ui.vocab.filter) ? FALLBACK_DECK : ui.vocab.filter;
  const w = editing || blankWord(preDeck);
  ui.form = { id: editing ? w.id : null };
  const posOpts = [...new Set([...POS, w.pos].filter(Boolean))];
  const ta = (name, label, val, hint, rows = 3) => `<label for="f-${name}">${label} ${hint ? `<small>· ${hint}</small>` : ''}</label><textarea id="f-${name}" name="${name}" rows="${rows}">${esc(val)}</textarea>`;
  return {
    html: `<div class="page">${navBar(editing ? 'Sửa từ' : 'Thêm từ mới', { fallback: '#/vocab' })}
    <form class="form" data-submit="save-word" novalidate>
      <label for="f-word">Từ / cụm từ tiếng Anh *</label>
      <input type="text" id="f-word" name="word" value="${esc(w.word)}" maxlength="120" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" placeholder="ví dụ: resilient">
      <p class="err" id="e-word" hidden></p>
      <div class="fill-row"><button type="button" class="btn soft sm" id="fill-btn" data-act="form-fill">${icon('sparkle', 'sm')} Tự điền thông tin</button></div>
      <p class="small faint fill-hint">${S.settings.autoFill !== false && !editing ? 'Tự tra khi bạn gõ xong từ (đổi ở Cài đặt). ' : ''}${aiReady(S.settings.ai)
        ? 'IPA, loại từ, định nghĩa từ từ điển; nghĩa tiếng Việt, ví dụ, collocations từ Trợ lý AI. Chỉ điền vào ô còn trống.'
        : 'IPA, định nghĩa, ví dụ từ từ điển; nghĩa tiếng Việt từ dịch miễn phí; đồng nghĩa và gợi ý collocations theo thống kê. Kết nối AI ở Cài đặt để kết quả sát và đầy đủ hơn.'}</p>
      <div class="small fill-status" id="fill-status" role="status" hidden><p id="fill-text"></p><button type="button" class="btn ghost sm" id="fill-pick" data-act="form-pick-sense" hidden>Chọn nghĩa</button></div>
      <label for="f-meaning">Nghĩa tiếng Việt *</label>
      <input type="text" id="f-meaning" name="meaning" value="${esc(w.meaning)}" maxlength="300" autocomplete="off" placeholder="ví dụ: kiên cường">
      <p class="err" id="e-meaning" hidden></p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label for="f-ipa">Phiên âm IPA</label><input type="text" id="f-ipa" name="ipa" value="${esc(w.ipa)}" maxlength="80" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="/rɪˈzɪliənt/"></div>
        <div><label for="f-pos">Loại từ</label><select id="f-pos" name="pos"><option value="">— Chọn —</option>${posOpts.map((p) => `<option ${p === w.pos ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      </div>
      <label for="f-definition">Định nghĩa tiếng Anh</label>
      <textarea id="f-definition" name="definition" rows="2" autocapitalize="none">${esc(w.definition)}</textarea>
      ${ta('examples', 'Câu ví dụ', w.examples.join('\n'), 'mỗi dòng một câu')}
      ${ta('collocations', 'Collocations', w.collocations.join('\n'), 'mỗi dòng một cụm', 2)}
      <label for="f-synonyms">Từ đồng nghĩa <small>· cách nhau bằng dấu phẩy</small></label>
      <input type="text" id="f-synonyms" name="synonyms" value="${esc(w.synonyms.join(', '))}" autocomplete="off" autocapitalize="none">
      <label for="f-antonyms">Từ trái nghĩa <small>· cách nhau bằng dấu phẩy</small></label>
      <input type="text" id="f-antonyms" name="antonyms" value="${esc(w.antonyms.join(', '))}" autocomplete="off" autocapitalize="none">
      ${ta('family', 'Word family', w.family.join('\n'), 'mỗi dòng một dạng từ', 2)}
      ${ta('mistakes', 'Lỗi thường gặp', w.mistakes, '', 2)}
      <label for="f-deck">Chủ đề</label>
      <select id="f-deck" name="deckId">${S.decks.map((d) => `<option value="${d.id}" ${d.id === w.deckId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <label>Độ khó</label>
      <div class="seg" id="f-diff" data-value="${w.difficulty}">${[1, 2, 3].map((n) => `<button type="button" class="${n === w.difficulty ? 'on' : ''}" data-act="form-diff" data-value="${n}">${DIFF[n]}</button>`).join('')}</div>
      ${ta('notes', 'Ghi chú cá nhân', w.notes, '', 2)}
      <div class="savebar"><button class="btn" type="submit">${editing ? 'Lưu thay đổi' : 'Lưu từ'}</button></div>
    </form></div>`,
    focus: editing ? null : '#f-word',
  };
}
on('form-diff', (el) => {
  const seg = el.parentNode;
  seg.dataset.value = el.dataset.value;
  seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
});
let saving = false;
// ---- Tự điền ----
const FILL_LABELS = { ipa: 'IPA', pos: 'loại từ', meaning: 'nghĩa tiếng Việt', definition: 'định nghĩa', examples: 'ví dụ', collocations: 'collocations', synonyms: 'đồng nghĩa', antonyms: 'trái nghĩa', family: 'word family', mistakes: 'lỗi thường gặp' };
const FILL_SOURCES = { dict: 'từ điển', ai: 'AI', tr: 'dịch miễn phí', dm: 'gợi ý thống kê' };
const $id = (id) => document.getElementById(id);
const wordNow = () => ($id('f-word')?.value || '').replace(/\s+/g, ' ').trim();
function setFillStatus(text, kind = '', { pick = false } = {}) {
  const el = $id('fill-status');
  if (!el) return;
  $id('fill-text').textContent = text;
  el.className = `small fill-status ${kind}`;
  el.hidden = !text;
  $id('fill-pick').hidden = !pick;
}
// Chỉ điền vào ô còn trống; trả về true nếu đã điền.
function fillIfEmpty(key, value) {
  const el = $id('f-' + key);
  if (!el || !value || (Array.isArray(value) && !value.length) || el.value.trim()) return false;
  if (key === 'pos' && ![...el.options].some((o) => o.value === value || o.text === value)) el.add(new Option(value, value));
  el.value = Array.isArray(value) ? value.join(['synonyms', 'antonyms'].includes(key) ? ', ' : '\n') : value;
  return true;
}
let fillBusy = '';   // từ đang được tra (tránh tra trùng khi vừa rời ô nhập vừa bấm nút)
let lastLookup = null; // { word, r } — kết quả gần nhất, dùng cho nút "Chọn nghĩa"
let lastAuto = '';   // từ đã tự tra gần nhất trong form này

// Điền kết quả vào form và hiện tóm tắt. `needPick`: từ nhiều nghĩa nhưng chưa chọn nghĩa.
function applyFill(r, word, sense, { needPick = false } = {}) {
  const { fields, from } = buildFill(r, sense, { pickSense: !needPick });
  const done = {};
  for (const [k, v] of Object.entries(fields)) if (fillIfEmpty(k, v)) (done[from[k]] ||= []).push(FILL_LABELS[k]);
  const lines = Object.entries(done).map(([src, ls]) => `${FILL_SOURCES[src][0].toUpperCase()}${FILL_SOURCES[src].slice(1)}: ${ls.join(', ')}`);
  const notes = [];
  if (from.ipa === 'ai' && done.ai?.includes('IPA')) notes.push('IPA do AI gợi ý, nên kiểm tra lại.');
  if (r.dict && !r.dict.ipa && !r.ai) notes.push('Từ điển không có IPA cho từ này.');
  if (done.tr) notes.push('Nghĩa tiếng Việt là dịch tự động, hãy xem có sát nghĩa bạn cần không.');
  if (done.dm?.includes('collocations')) notes.push('Collocations là gợi ý theo thống kê, cần chọn lọc.');
  if (!r.useAI && !r.web?.meaning && !$id('f-meaning')?.value.trim()) notes.push(r.web?.meaningFailed ? 'Chưa dịch được nghĩa tiếng Việt (dịch vụ không phản hồi), hãy nhập tay hoặc bấm Tự điền lại.' : 'Chưa có nghĩa tiếng Việt: hãy nhập tay hoặc kết nối AI.');
  if (r.web?.hintsFailed) notes.push('Dịch vụ gợi ý từ chưa phản hồi.');
  if (r.aiError) notes.push(`AI chưa trả lời được: ${r.aiError}`);
  if (r.dictError) notes.push(`Từ điển: ${r.dictError}`);
  if (!r.dict && !r.dictError && (r.ai || r.web)) notes.push('Từ điển không có từ này.');
  if (needPick) notes.push(`Từ có ${r.dict.senses.length} nghĩa — chọn nghĩa bạn cần để điền định nghĩa, loại từ, ví dụ.`);
  const attribution = [r.dict && 'từ điển: Wiktionary (CC BY-SA)', done.tr && 'dịch: MyMemory', done.dm && 'gợi ý: Datamuse'].filter(Boolean);
  if (attribution.length) notes.push(`Nguồn ${attribution.join(' · ')}.`);
  const head = lines.length ? `Đã điền — ${lines.join(' · ')}.` : 'Không có ô trống nào cần điền thêm.';
  setFillStatus([head, ...notes, lines.length ? 'Hãy xem lại trước khi lưu.' : ''].filter(Boolean).join('\n'), lines.length ? 'ok' : '', { pick: needPick });
}

// auto = true: chạy tự động khi gõ xong từ (không bật bảng chọn nghĩa, không báo lỗi khi chưa gõ gì).
async function runFill({ auto = false } = {}) {
  const word = wordNow();
  const btn = $id('fill-btn');
  if (!btn) return;
  if (!word) { if (!auto) { setFillStatus('Hãy gõ từ tiếng Anh trước rồi bấm Tự điền.', 'bad'); $id('f-word')?.focus(); } return; }
  if (auto) {
    if (word === lastAuto || word.length < 2 || !/^[A-Za-z][A-Za-z '’-]*$/.test(word)) return; // chưa gõ xong, đã tra rồi, hoặc không phải tiếng Anh
    const dup = findByText(word, ui.form?.id);
    if (dup) { lastAuto = word; setFillStatus(`“${dup.word}” đã có trong kho (${deckName(dup.deckId)}).`, 'bad'); return; }
  }
  if (word.length > 60) { setFillStatus('Từ/cụm từ quá dài để tra cứu.', 'bad'); return; }
  if (!navigator.onLine) { if (!auto) setFillStatus('Tự điền cần kết nối mạng. Hiện thiết bị đang offline — bạn vẫn có thể nhập tay.', 'bad'); return; }
  if (fillBusy === word) return;
  fillBusy = word;
  lastAuto = word; // đã tra từ này (tự động hoặc bấm nút) → không tự tra lại khi rời ô
  const label = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Đang tra…';
  setFillStatus('');
  const stale = () => wordNow() !== word; // đã đổi từ hoặc rời form trong lúc chờ → bỏ kết quả
  try {
    const have = Object.fromEntries(['meaning', 'collocations', 'synonyms', 'antonyms'].map((k) => [k, !!$id('f-' + k)?.value.trim()]));
    const r = await lookupWord(word, { meaning: $id('f-meaning')?.value.trim() || '', ai: S.settings.ai, have });
    if (stale()) return;
    if (!r.dict && !r.ai && !r.web?.meaning && !r.web?.hints) {
      setFillStatus(r.dictError || r.aiError ? `Không tra được: ${[r.dictError, r.aiError].filter(Boolean).join(' · ')}` : `Không tìm thấy “${word}”. Kiểm tra lại chính tả hoặc nhập tay.`, 'bad');
      return;
    }
    lastLookup = { word, r };
    // Không có AI mà từ điển có nhiều nghĩa: nghĩa đầu tiên có thể không phải nghĩa bạn cần → cho chọn.
    const multi = !r.ai && r.dict?.senses.length > 1;
    if (multi && !auto) {
      const picked = await pickSense(r);
      if (stale()) return;
      applyFill(r, word, picked ?? 0, { needPick: picked === null });
    } else applyFill(r, word, 0, { needPick: multi });
    if (!auto && !$id('f-meaning')?.value.trim()) $id('f-meaning')?.focus({ preventScroll: true });
  } catch (e) {
    setFillStatus(e?.message || 'Có lỗi khi tra cứu.', 'bad');
  } finally {
    fillBusy = '';
    if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
  }
}
async function pickSense(r) {
  const picked = await chooseSheet({
    title: 'Chọn nghĩa đúng với từ của bạn',
    options: r.dict.senses.map((s, i) => ({ value: String(i), label: s.definition.length > 110 ? s.definition.slice(0, 107) + '…' : s.definition, sub: s.pos })),
  });
  return picked === null ? null : Number(picked);
}
on('form-fill', () => runFill());
on('form-pick-sense', async () => {
  if (!lastLookup || lastLookup.word !== wordNow()) { setFillStatus('Hãy bấm Tự điền lại cho từ này.', 'bad'); return; }
  const picked = await pickSense(lastLookup.r);
  if (picked === null || lastLookup.word !== wordNow()) return;
  applyFill(lastLookup.r, lastLookup.word, picked);
});
// Tự chạy khi gõ xong từ (rời ô nhập, hoặc bấm Enter / nút xong trên bàn phím) ở form THÊM từ mới.
document.addEventListener('focusout', (e) => {
  if (e.target?.id !== 'f-word' || ui.form?.id || S.settings.autoFill === false) return;
  // Rời ô sang nút Tự điền: nếu là bấm nút thì nút tự chạy; nếu chỉ là Tab bàn phím thì vẫn tự tra.
  if (e.relatedTarget?.id === 'fill-btn') { setTimeout(() => runFill({ auto: true }), 400); return; }
  runFill({ auto: true });
});
// Gõ lại vào ô đang báo lỗi thì ẩn lỗi đi (lỗi trùng từ sẽ được kiểm tra lại khi bấm Lưu).
document.addEventListener('input', (e) => {
  const id = e.target?.id;
  if (id !== 'f-word' && id !== 'f-meaning') return;
  const p = $id('e-' + id.slice(2));
  if (p && !p.hidden && e.target.value.trim()) { p.hidden = true; p.textContent = ''; e.target.classList.remove('bad'); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target?.id !== 'f-word') return;
  e.preventDefault(); // Enter ở ô từ không nên lưu cả form: chuyển sang ô nghĩa
  $id('f-meaning')?.focus();
});

on('save-word', async (form) => {
  if (saving) return; // chặn bấm Lưu hai lần liên tiếp
  const fd = new FormData(form);
  const v = (k) => String(fd.get(k) || '').trim();
  const setErr = (k, msg) => {
    const p = document.getElementById('e-' + k);
    p.textContent = msg; p.hidden = !msg;
    document.getElementById('f-' + k).classList.toggle('bad', !!msg);
  };
  let bad = null;
  const text = v('word').replace(/\s+/g, ' ');
  const dup = text && findByText(text, ui.form.id);
  if (!text) { setErr('word', 'Vui lòng nhập từ tiếng Anh.'); bad = bad || 'word'; }
  else if (dup) { setErr('word', `“${dup.word}” đã có trong kho (${deckName(dup.deckId)}).`); bad = bad || 'word'; }
  else setErr('word', '');
  if (!v('meaning')) { setErr('meaning', 'Vui lòng nhập nghĩa tiếng Việt.'); bad = bad || 'meaning'; } else setErr('meaning', '');
  if (bad) { document.getElementById('f-' + bad).focus(); toast('Còn thiếu thông tin bắt buộc', 'bad'); return; }

  const w = ui.form.id ? S.words.get(ui.form.id) : blankWord();
  Object.assign(w, {
    word: text, meaning: v('meaning'), ipa: v('ipa'), pos: v('pos'), definition: v('definition'),
    examples: splitList(v('examples')), collocations: splitList(v('collocations')),
    synonyms: splitList(v('synonyms'), /[,;\n]/), antonyms: splitList(v('antonyms'), /[,;\n]/),
    family: splitList(v('family')), mistakes: v('mistakes'), deckId: v('deckId') || FALLBACK_DECK,
    difficulty: Number(document.getElementById('f-diff').dataset.value) || 2, notes: v('notes'),
  });
  const isEdit = !!ui.form.id;
  saving = true;
  try { await saveWord(w); } finally { saving = false; }
  toast(isEdit ? 'Đã lưu thay đổi' : `Đã thêm “${w.word}”`);
  back('#/vocab');
});

// ---- Quản lý chủ đề ----
export function decksView() {
  const counts = {};
  for (const w of S.words.values()) counts[w.deckId] = (counts[w.deckId] || 0) + 1;
  return `<div class="page">${navBar('Chủ đề', { fallback: '#/vocab', right: `<button class="iconbtn" data-act="deck-add" aria-label="Thêm chủ đề">${icon('plus')}</button>` })}
    <p class="muted small" style="margin:0 2px 12px">Chạm vào chủ đề để xem từ. Để chuyển một từ sang chủ đề khác, mở từ đó rồi chạm vào tên chủ đề.</p>
    <div class="wlist" style="margin-top:0">${S.decks.map((d) => `<div class="wrow" data-act="deck-open" data-id="${d.id}">
      <div class="body"><span style="font-weight:600">${esc(d.name)}</span><p>${counts[d.id] || 0} từ${d.builtin ? '' : ' · tự tạo'}</p></div>
      <button class="iconbtn" data-act="deck-rename" data-id="${d.id}" aria-label="Đổi tên">${icon('edit', 'sm')}</button>
      ${d.builtin ? '<span class="spacer44"></span>' : `<button class="iconbtn" data-act="deck-delete" data-id="${d.id}" aria-label="Xoá">${icon('trash', 'sm')}</button>`}</div>`).join('')}</div>
    <button class="btn soft" style="margin-top:14px" data-act="deck-add">${icon('plus', 'sm')} Tạo chủ đề mới</button></div>`;
}
on('deck-open', (el) => { ui.vocab.filter = el.dataset.id; ui.vocab.q = ''; go('#/vocab'); });
on('deck-add', async () => {
  const name = await promptSheet({ title: 'Chủ đề mới', placeholder: 'Tên chủ đề', okLabel: 'Tạo' });
  if (name === null) return;
  try { await addDeck(name); toast('Đã tạo chủ đề'); rerender(); } catch (e) { toast(e.message, 'bad'); }
});
on('deck-rename', async (el) => {
  const d = S.decks.find((x) => x.id === el.dataset.id);
  const name = await promptSheet({ title: 'Đổi tên chủ đề', value: d.name });
  if (name === null) return;
  try { await renameDeck(d.id, name); rerender(); } catch (e) { toast(e.message, 'bad'); }
});
on('deck-delete', async (el) => {
  const d = S.decks.find((x) => x.id === el.dataset.id);
  if (!(await confirmSheet({ title: `Xoá chủ đề “${d.name}”?`, body: 'Các từ trong chủ đề này sẽ được chuyển sang “My Custom Vocabulary”, không bị xoá.', okLabel: 'Xoá chủ đề', danger: true }))) return;
  const n = await deleteDeck(d.id);
  if (ui.vocab.filter === d.id) ui.vocab.filter = 'all';
  toast(n ? `Đã xoá, chuyển ${n} từ sang My Custom Vocabulary` : 'Đã xoá chủ đề');
  rerender();
});
