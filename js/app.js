// Điểm khởi động: router, thanh tab, event delegation, service worker.
import { S, init, dueWords } from './store.js';
import { icon, actions, on, go, back, setRenderer, TABS, closeSheet } from './ui.js';
import { homeView, learnView, reviewView, vocabView, wordView, formView, decksView } from './views.js';
import { statsView, settingsView, aiView, applyTheme } from './views2.js';
import { sessionView } from './study.js';
import { gameView } from './game.js';
import { countUp } from './fx.js';

const routes = {
  home: homeView, learn: learnView, review: reviewView, vocab: vocabView, stats: statsView,
  word: wordView, edit: formView, new: () => formView(null), decks: decksView,
  settings: settingsView, ai: aiView, session: sessionView, game: gameView,
};
const TAB_META = [['home', 'Trang chủ', 'home'], ['learn', 'Học', 'learn'], ['review', 'Ôn tập', 'review'], ['vocab', 'Từ vựng', 'vocab'], ['stats', 'Thống kê', 'stats']];

const view = document.getElementById('view');
let lastHash = null;

function renderTabs(active) {
  const due = dueWords().length;
  document.getElementById('tabbar').innerHTML = TAB_META.map(([id, label, ic]) =>
    `<a class="tab ${id === active ? 'on' : ''}" href="#/${id}" data-act="go" data-to="#/${id}" ${id === active ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${id === 'review' && due ? `<span class="badge">${due > 99 ? '99+' : due}</span>` : ''}</a>`).join('');
}

function render(resetScroll = false) {
  const [, name = 'home', arg] = location.hash.split('/');
  const route = routes[name] ? name : 'home';
  const changed = location.hash !== lastHash;
  const scroll = view.scrollTop;
  const cardScroll = view.querySelector('.ses-body')?.scrollTop ?? 0;
  const out = routes[route](arg ? decodeURIComponent(arg) : undefined);
  const html = typeof out === 'string' ? out : out.html;
  document.body.classList.toggle('no-tabs', !TABS.includes(route));
  view.classList.toggle('enter', changed);
  view.innerHTML = html;
  view.scrollTop = changed || resetScroll ? 0 : scroll;
  const body = view.querySelector('.ses-body');
  if (body) {
    if (!changed && !resetScroll) body.scrollTop = cardScroll;
    body.querySelector('.flash.back')?.classList.toggle('fit', body.scrollHeight <= body.clientHeight + 2);
  }
  if (changed) countUp(view);
  lastHash = location.hash;
  renderTabs(route);
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
    if (!document.hidden && !['session', 'game', 'edit', 'new', 'ai', 'settings'].includes(location.hash.split('/')[1])) render();
  });
}

function report(err) {
  console.error(err);
  import('./util.js').then(({ toast }) => toast('Có lỗi xảy ra: ' + (err?.message || err), 'bad'));
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
  setRenderer(render);
  if (!location.hash || location.hash === '#/session') history.replaceState(null, '', '#/home');
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const sw = navigator.serviceWorker;
    // Có bản mới → tự tải lại để dùng ngay (không tải lại giữa phiên học, chờ tới khi rời phiên).
    let hadController = !!sw.controller;
    let reloading = false;
    const reloadWhenIdle = () => {
      if (reloading) return;
      if (location.hash === '#/session' || location.hash === '#/game') { addEventListener('hashchange', reloadWhenIdle, { once: true }); return; }
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
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch((e) => console.warn('Service worker chưa đăng ký được:', e));
  }
}
boot();
