// Điểm khởi động: router, thanh tab, event delegation, service worker.
import { S, init, dueWords } from './store.js';
import { icon, actions, on, go, back, setRenderer, TABS, closeSheet } from './ui.js';
import { homeView, learnView, reviewView, vocabView, wordView, formView, decksView } from './views.js';
import { statsView, settingsView, aiView, applyTheme, voicesView } from './views2.js';
import { sessionView } from './study.js';
import { gameView } from './game.js';
import { dropView } from './drop.js';
import { matchView, popView } from './games2.js';
import { loadWriting, writingView, typeView as wTypeView, promptView as wPromptView, writeView, essaysView, essayView, statsView as wStatsView } from './writing.js';
import { loadReading, readingView, passageView as rPassageView, runView as rRunView, resultView as rResultView, studyView as rStudyView, fullView as rFullView, reviewView as rReviewView, patternsView as rPatternsView, ownListView as rOwnListView, ownView as rOwnView, statsView as rStatsView } from './reading.js';
import { micTestView } from './speaking.js';
import { loadSpeaking, speakingView, sp1View, sp2View } from './speak.js';
import { loadListening, listeningView, numView as lNumView, dictView as lDictView } from './listening.js';
import { importView as lImportView, testView as lTestView, runView as lRunView } from './ltest.js';
import { gamesView, setupView as hSetupView, playView as hPlayView, resultView as hResultView } from './hunt.js';
import { setupView as tSetupView, playView as tPlayView, resultView as tResultView } from './trap.js';
import { setupView as kSetupView, playView as kPlayView, resultView as kResultView } from './talk.js';
import { setupView as iSetupView, playView as iPlayView, resultView as iResultView } from './idea.js';
import { chalView } from './challenge.js';
import { loadGrammar, grammarView, unitView, lessonView, cardsView, errorsView, testView, gDueCount } from './grammar.js';
import { countUp } from './fx.js';

const routes = {
  home: homeView, learn: learnView, review: reviewView, vocab: vocabView, stats: statsView,
  word: wordView, edit: formView, new: () => formView(null), decks: decksView,
  settings: settingsView, voices: voicesView, ai: aiView, session: sessionView, game: gameView, drop: dropView, match: matchView, pop: popView,
  writing: writingView, wtype: wTypeView, wprompt: wPromptView, wwrite: writeView, wessays: essaysView, wessay: essayView, wstats: wStatsView,
  reading: readingView, rpassage: rPassageView, rrun: rRunView, rresult: rResultView, rstudy: rStudyView,
  mictest: micTestView, speaking: speakingView, sp1: sp1View, sp2: sp2View,
  listening: listeningView, lnum: lNumView, ldict: lDictView, limport: lImportView, ltest: lTestView, lrun: lRunView,
  games: gamesView, hunt: hSetupView, hplay: hPlayView, hres: hResultView, trap: tSetupView, tplay: tPlayView, tres: tResultView, talk: kSetupView, tkplay: kPlayView, tkres: kResultView, idea: iSetupView, iplay: iPlayView, ires: iResultView, chal: chalView,
  rfull: rFullView, rvocab: rReviewView, rpatterns: rPatternsView, rown: rOwnListView, rownv: rOwnView, rstats: rStatsView,
  grammar: grammarView, gunit: unitView, glesson: lessonView, gcards: cardsView, gerrors: errorsView, gtest: testView,
};
const TAB_META = [['home', 'Trang chủ', 'home'], ['learn', 'Học', 'learn'], ['review', 'Ôn tập', 'review'], ['vocab', 'Từ vựng', 'vocab'], ['games', 'Game', 'game'], ['stats', 'Thống kê', 'stats']];

const view = document.getElementById('view');
let lastHash = null;

function renderTabs(active) {
  const due = dueWords().length + gDueCount();
  document.getElementById('tabbar').innerHTML = TAB_META.map(([id, label, ic]) =>
    `<a class="tab ${id === active ? 'on' : ''}" href="#/${id}" data-act="go" data-to="#/${id}" ${id === active ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${id === 'review' && due ? `<span class="badge">${due > 99 ? '99+' : due}</span>` : ''}</a>`).join('');
}

function render(resetScroll = false) {
  const [, name = 'home', arg] = location.hash.split('/');
  const route = routes[name] ? name : 'home';
  const changed = location.hash !== lastHash;
  const scroll = view.scrollTop;
  const cardScroll = view.querySelector('.ses-body')?.scrollTop ?? 0;
  const splitScroll = [...view.querySelectorAll('.split-l, .split-r')].map((el) => el.scrollTop);
  const out = routes[route](arg ? decodeURIComponent(arg) : undefined);
  const html = typeof out === 'string' ? out : out.html;
  document.body.classList.toggle('no-tabs', !TABS.includes(route));
  view.classList.toggle('enter', changed);
  view.innerHTML = html;
  view.scrollTop = changed || resetScroll ? 0 : scroll;
  const body = view.querySelector('.ses-body');
  if (body) {
    if (!changed && !resetScroll) {
      body.scrollTop = cardScroll;
      body.querySelectorAll(':scope > .split-l, :scope > .split-r').forEach((el, i) => { el.scrollTop = splitScroll[i] || 0; });
    }
    body.querySelector('.flash')?.classList.toggle('fit', body.scrollHeight <= body.clientHeight + 24);
  }
  if (changed) countUp(view);
  lastHash = location.hash;
  renderTabs(['grammar', 'writing', 'reading', 'speaking', 'listening'].includes(route) ? 'learn' : route);
  if (out?.focus) {
    const el = view.querySelector(out.focus);
    // Chỉ tự focus khi đổi bước/đổi trang, tránh bật bàn phím ngoài ý muốn khi vẽ lại.
    if (el && (changed || resetScroll)) setTimeout(() => el.focus({ preventScroll: true }), 60);
  }
}

on('go', (el) => go(el.dataset.to));
on('back', (el) => back(el.dataset.fallback || '#/home'));

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A' || el.type === 'button' || !el.closest('form')) e.preventDefault();
    Promise.resolve(fn(el, e)).catch(report);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-in]');
    if (el) actions[el.dataset.in]?.(el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el) Promise.resolve(actions[el.dataset.change]?.(el, e)).catch(report);
  });
  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-submit]');
    if (!form) return;
    e.preventDefault();
    Promise.resolve(actions[form.dataset.submit]?.(form, e)).catch(report);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(null); });
  window.addEventListener('hashchange', () => { closeSheet(null); render(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  // Sang ngày mới khi app đang mở nền → vẽ lại để cập nhật danh sách đến hạn.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !['session', 'game', 'drop', 'match', 'pop', 'edit', 'new', 'ai', 'settings', 'glesson', 'gcards', 'gtest', 'wwrite', 'rrun', 'mictest', 'sp1', 'sp2', 'lnum', 'ldict', 'lrun', 'limport', 'hplay', 'tplay', 'tkplay', 'iplay'].includes(location.hash.split('/')[1])) render();
  });
}

function report(err) {
  console.error(err);
  import('./util.js').then(({ toast }) => toast('Có lỗi xảy ra: ' + (err?.message || err), 'bad'));
}

// ---- Bàn phím ảo ----
// iOS tự đẩy cả trang lên khi người dùng chạm vào ô nhập, làm phần trên của màn hình bị khuất và gây giật.
// Cách xử lý, theo thứ tự ưu tiên:
//  1. Tự focus ô nhập với preventScroll ngay trong cú chạm → iOS mở bàn phím mà không đẩy trang (không có gì để giật).
//  2. Thu app lại cho vừa vùng nhìn thấy phía trên bàn phím (--app-h) khi bàn phím đã mở xong.
//  3. Nếu trang vẫn bị đẩy thì kéo về; chỉ khi đã đứng yên mà vẫn lệch mới dời app theo (--vv-top),
//     không bù vị trí giữa lúc bàn phím đang trượt (đó là nguyên nhân màn hình nhảy xuống rồi bật lại).
// iOS quyết định đẩy cả trang lên ngay lúc ô nhập được focus, theo vị trí của ô lúc đó (app chưa kịp co lại).
// Ô nằm ở nửa dưới màn hình → tạm dời ô lên vùng trên trong khoảnh khắc focus để iOS thấy không cần đẩy, rồi trả về chỗ cũ;
// sau đó app tự co lại vừa phần phía trên bàn phím và tự cuộn khung chứa để ô nhập lộ ra.
const KB_GUESS = 380; // bàn phím iPhone kèm thanh gợi ý
function focusNoPan(el) {
  const r = el.getBoundingClientRect();
  // Bàn phím đang mở (chạm sang ô khác): so với mép trên bàn phím thật; chưa mở: so với chỗ bàn phím sẽ lên tới.
  const vv = window.visualViewport;
  const open = vv && window.innerHeight - vv.height > 120;
  const limit = open ? vv.offsetTop + vv.height - 8 : window.innerHeight - KB_GUESS;
  const lift = r.top + 48 > limit ? Math.round(r.top - (open ? vv.offsetTop : 0) - 90) : 0;
  if (lift <= 0) { el.focus({ preventScroll: true }); return; }
  const prev = el.style.transform;
  el.style.transform = `translateY(${-lift}px)`;
  el.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = prev; }));
}
/** Cuộn đúng khung chứa gần nhất (không cuộn cả trang) để ô đang nhập nằm trong vùng nhìn thấy. */
function ensureVisible(el) {
  let box = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;
  const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
  // Ô nhiều dòng cao hơn khung: chỉ cần thấy phần đầu.
  const bottom = Math.min(r.bottom, r.top + Math.max(60, b.height * 0.5));
  if (bottom > b.bottom - 12) box.scrollTop += bottom - b.bottom + 12;
  else if (r.top < b.top + 8) box.scrollTop -= b.top + 8 - r.top;
}
function watchKeyboard() {
  const TYPING = 'input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea';
  let tap = null;
  document.addEventListener('touchstart', (e) => {
    const el = e.touches.length === 1 ? e.target.closest?.(TYPING) : null;
    tap = el && !el.disabled && !el.readOnly && document.activeElement !== el ? { el, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (tap && Math.hypot(e.touches[0].clientX - tap.x, e.touches[0].clientY - tap.y) > 10) tap = null; // đang cuộn, không phải chạm
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const t = tap;
    tap = null;
    if (!t || !t.el.isConnected || !e.cancelable) return;
    e.preventDefault(); // chặn cú focus mặc định (kèm việc iOS đẩy trang)
    focusNoPan(t.el);
  }, { passive: false });

  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const fixedScreen = () => !!view.querySelector(':scope > .session, :scope > .game');
  const unshift = () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    if (root.scrollTop) root.scrollTop = 0;
    if (document.body.scrollTop) document.body.scrollTop = 0;
    // Phiên học và mini game được thiết kế nằm gọn một màn hình: không để trình duyệt tự cuộn khung chứa
    // (trừ khi màn hình quá thấp, ô đang nhập sẽ bị khuất nếu kéo về đầu).
    if (fixedScreen() && view.scrollTop) {
      const el = document.activeElement;
      const bottom = el && view.contains(el) ? el.getBoundingClientRect().bottom + view.scrollTop : 0;
      if (bottom <= vv.height + vv.offsetTop) view.scrollTop = 0;
    }
  };
  let lastH = 0;
  let settleTimer = 0;
  let wasOpen = false;
  const settle = () => {
    unshift();
    const top = Math.max(0, Math.round(vv.offsetTop));
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height));
    root.style.setProperty('--vv-top', `${top}px`);
    root.style.setProperty('--kb', `${kb > 120 ? Math.max(0, kb - top) : 0}px`);
  };
  const sync = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height));
    const open = kb > 120;
    unshift();
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    root.style.setProperty('--kb', `${open ? kb : 0}px`);
    if (!vv.offsetTop) root.style.setProperty('--vv-top', '0px');
    document.body.classList.toggle('kb', open);
    clearTimeout(settleTimer);
    // Bàn phím đang mở sẵn (không trượt lên/xuống): iOS dời trang khi chuyển ô (mũi tên ∧ ∨ trên bàn phím) → bù ngay,
    // không chờ, để không thấy màn hình bị đẩy lên rồi mới về.
    if (open && wasOpen && Math.round(vv.height) === lastH) settle();
    else settleTimer = setTimeout(settle, 320);
    wasOpen = open;
    if (Math.round(vv.height) !== lastH) {
      lastH = Math.round(vv.height);
      // Sau khi thu app lại, đưa ô đang nhập vào vùng nhìn thấy nếu nó đang bị khuất (form thêm từ, cài đặt, màn hình thấp…).
      const el = document.activeElement;
      if (open && el && el !== document.body && view.contains(el)) requestAnimationFrame(() => ensureVisible(el));
    }
  };
  // Chuyển sang ô khác khi bàn phím đã mở (chạm hoặc mũi tên ∧ ∨): kéo trang về, chỉ cuộn khung chứa để lộ ô.
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el.matches?.(TYPING) || !view.contains(el) || window.innerHeight - vv.height <= 120) return;
    const fix = () => { if (document.activeElement === el) { unshift(); ensureVisible(el); settle(); } };
    requestAnimationFrame(fix);
    setTimeout(fix, 250);
  });
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  window.addEventListener('scroll', unshift, { passive: true });
  sync();
}

async function boot() {
  try {
    await init();
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty" style="padding-top:30vh"><h3>Không mở được dữ liệu</h3><p>${String(err?.message || err)}. Nếu bạn đang ở chế độ Duyệt riêng tư, hãy mở bằng tab thường.</p></div>`;
    return;
  }
  applyTheme();
  bindEvents();
  watchKeyboard();
  setRenderer(render);
  if (!location.hash || /^#\/(session|glesson|gcards|gtest|wwrite|rrun|lnum|ldict|lrun|hplay|hres|tplay|tres|tkplay|tkres|iplay|ires)\b/.test(location.hash)) history.replaceState(null, '', '#/home');
  render();
  // Nội dung ngữ pháp tải sau, không chặn lần mở app đầu tiên.
  // Writing dùng nhãn lỗi của ngữ pháp, nên tải ngữ pháp trước.
  loadGrammar().then(loadWriting).then(loadReading).then(loadSpeaking).then(loadListening).then(() => { if (!document.querySelector('.session')) render(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const sw = navigator.serviceWorker;
    // Có bản mới → tự tải lại để dùng ngay (không tải lại giữa phiên học, chờ tới khi rời phiên).
    let hadController = !!sw.controller;
    let reloading = false;
    const reloadWhenIdle = () => {
      if (reloading) return;
      if (/^#\/(session|game|drop|match|pop|glesson|gcards|gtest|wwrite|rrun|sp1|sp2|lnum|ldict|lrun|hplay|tplay|tkplay|iplay)\b/.test(location.hash)) { addEventListener('hashchange', reloadWhenIdle, { once: true }); return; }
      reloading = true;
      location.reload();
    };
    sw.addEventListener('controllerchange', () => {
      if (hadController) reloadWhenIdle();
      hadController = true;
    });
    sw.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      // App mở từ màn hình chính trên iOS thường chỉ "thức dậy" chứ không tải lại → kiểm tra bản mới mỗi lần quay lại app.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg?.update?.().catch(() => {});
      });
    }).catch((e) => console.warn('Service worker chưa đăng ký được:', e));
  }
}
boot();
