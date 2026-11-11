// Nền tảng giao diện: icon, điều hướng, bottom sheet, đăng ký hành động.
import { esc } from './util.js';

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  learn: '<path d="M12 6.5C10.5 5 8 4.5 3 4.5v14c5 0 7.5.5 9 2 1.5-1.5 4-2 9-2v-14c-5 0-7.5.5-9 2zM12 6.5v14"/>',
  review: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5"/>',
  vocab: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/>',
  stats: '<path d="M5 20V11M12 20V4M19 20v-7M2.5 20h19"/>',
  gear: '<path d="M4 7h9M19 7h1M4 17h1M11 17h9"/><circle cx="16" cy="7" r="2.5"/><circle cx="8" cy="17" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9L3.5 9.7l5.9-.8z"/>',
  speaker: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4 .2 1.5 1 2.3 1.8 2.5C10.5 8.5 11 5.5 12 3z"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2.5h8a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  pen: '<path d="M4 20l1-4L16.5 4.5l3 3L8 19zM14 7l3 3"/>',
  ear: '<path d="M7 10a5 5 0 0 1 10 0c0 3-3 3.5-3 6.5a3 3 0 0 1-5.5 1.6M10 10.5a2 2 0 0 1 4 0"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  swap: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  game: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v4M5 12.5h4M15.5 11.5h.01M18 13.5h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12h.01"/>',
  blank: '<path d="M3 8h5M3 16h18M12 8h9"/><path d="M8.5 5.5v5h3v-5z"/>',
};

export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ---- Hành động (event delegation qua data-act / data-in / data-submit) ----
export const actions = {};
export const on = (name, fn) => (actions[name] = fn);

// ---- Điều hướng ----
export const TABS = ['home', 'learn', 'review', 'vocab', 'stats'];
let depth = 0;
export function go(hash) {
  const name = hash.split('/')[1];
  if (TABS.includes(name)) depth = 0; else depth++;
  if (location.hash === hash) rerender(); else location.hash = hash;
}
export function replace(hash) {
  history.replaceState(null, '', hash);
  rerender(true);
}
export function back(fallback = '#/home') {
  if (depth > 0) { depth--; history.back(); }
  else { depth = 0; replace(fallback); }
}

let renderFn = () => {};
export const setRenderer = (fn) => (renderFn = fn);
export const rerender = (resetScroll = false) => renderFn(resetScroll);

export const navBar = (title, { right = '<span class="spacer44"></span>', fallback = '#/home' } = {}) =>
  `<div class="nav"><button class="iconbtn" data-act="back" data-fallback="${fallback}" aria-label="Quay lại">${icon('back')}</button><h3>${esc(title)}</h3>${right}</div>`;

// ---- Bottom sheet ----
let sheetResolve = null;
export function openSheet(html) {
  document.getElementById('sheet').innerHTML = `<div class="grab"></div>${html}`;
  document.body.classList.add('sheet-open');
}
export function closeSheet(value = null) {
  document.body.classList.remove('sheet-open');
  const r = sheetResolve;
  sheetResolve = null;
  r?.(value);
}
on('sheet-close', () => closeSheet(null));
on('sheet-ok', () => {
  const input = document.querySelector('#sheet [data-sheet-input]');
  closeSheet(input ? input.value : true);
});

export function confirmSheet({ title, body = '', okLabel = 'Đồng ý', danger = false }) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><p class="sheet-body">${esc(body)}</p>
      <div class="btn-row"><button class="btn ghost" data-act="sheet-close">Huỷ</button>
      <button class="btn ${danger ? 'danger' : ''}" data-act="sheet-ok">${esc(okLabel)}</button></div>`);
    sheetResolve = (v) => resolve(v === true);
  });
}

export function promptSheet({ title, value = '', placeholder = '', okLabel = 'Lưu' }) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3>
      <form data-submit="sheet-ok" style="margin:12px 0 16px"><input class="input" data-sheet-input value="${esc(value)}" placeholder="${esc(placeholder)}" maxlength="60" autocomplete="off"></form>
      <div class="btn-row"><button class="btn ghost" data-act="sheet-close">Huỷ</button>
      <button class="btn" data-act="sheet-ok">${esc(okLabel)}</button></div>`);
    sheetResolve = (v) => resolve(typeof v === 'string' ? v : null);
    setTimeout(() => document.querySelector('#sheet [data-sheet-input]')?.focus(), 280);
  });
}

// Chọn một mục trong danh sách; trả về value hoặc null.
export function chooseSheet({ title, options, current }) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><div style="margin-top:12px">${options
      .map((o) => `<button class="listlink" data-act="sheet-pick" data-value="${esc(o.value)}"><span class="body"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${o.value === current ? icon('check') : ''}</button>`)
      .join('')}</div>`);
    sheetResolve = (v) => resolve(typeof v === 'string' ? v : null);
  });
}
on('sheet-pick', (el) => closeSheet(el.dataset.value));

// Hiển thị văn bản AI: escape rồi định dạng tối giản (đậm, gạch đầu dòng, đề mục).
export function richText(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      let l = esc(line.trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<b>$1</b>');
      if (!l) return '';
      if (/^#{1,6}\s/.test(l)) return `<p class="h">${l.replace(/^#{1,6}\s*/, '')}</p>`;
      if (/^[-*•]\s+/.test(l)) return `<div class="li">${l.replace(/^[-*•]\s+/, '')}</div>`;
      if (/^-{3,}/.test(l)) return `<p class="h">${l.replace(/-{3,}/g, '').trim() || '—'}</p>`;
      return `<p>${l}</p>`;
    })
    .join('');
}
