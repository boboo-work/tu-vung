// Xem phim với phụ đề song ngữ (dùng được trên iPhone).
// Video: file trên máy hoặc link YouTube. Phụ đề: file .srt/.vtt tiếng Anh (+ file tiếng Việt nếu có; không có thì tự dịch).
// File ".song-ngu.srt" tải từ extension Chrome có sẵn cả hai dòng nên không cần dịch lại.
// Chạm vào từ để tra nghĩa và thêm vào kho từ (câu phụ đề làm câu ví dụ).
// Màn hình xem chỉ vẽ một lần; trong lúc phát chỉ cập nhật vài phần tử, để thẻ <video> không bị tạo lại.
import '../extension/subs.js';
import { S, blankWord, saveWord, findByText, addDeck } from './store.js';
import { on, navBar, icon, rerender, openSheet, closeSheet } from './ui.js';
import { esc, toast, pickFile, speak } from './util.js';
import { fetchDictionary, fetchTranslation } from './lookup.js';

const B = globalThis.BiSubs;
const KEY = 'mv-last';
const DECK = 'Phụ đề phim';
const M = { cues: null, tr: [], name: '', viName: '', src: null, yt: '', err: '', autoPause: false, hideTr: false, pos: 0, words: 0 };

// Phụ đề lần trước (video thì phải chọn lại, trừ YouTube).
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.cues?.length) Object.assign(M, { cues: saved.cues, tr: saved.tr || [], name: saved.name || '', viName: saved.viName || '', yt: saved.yt || '', pos: saved.pos || 0 });
  if (M.yt) M.src = { kind: 'yt', id: M.yt };
} catch { /* bỏ qua */ }
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ cues: M.cues, tr: M.tr, name: M.name, viName: M.viName, yt: M.src?.kind === 'yt' ? M.src.id : '', pos: M.pos }));
  } catch { /* hết chỗ: bỏ qua, chỉ mất phần nhớ lần sau */ }
}

const ytId = (s) => (String(s).trim().match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || String(s).trim().match(/^([\w-]{11})$/) || [])[1] || '';
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// File song ngữ (mỗi câu: dòng Anh rồi dòng Việt) → tách thành phụ đề gốc + bản dịch.
function splitBilingual(cues) {
  const tr = [];
  let n = 0;
  const out = cues.map((c, i) => {
    const lines = c.t.split('\n');
    const k = lines.findIndex((l) => B.VI.test(l));
    if (k > 0 && lines.slice(k).every((l) => B.VI.test(l) || !/[a-z]{3}/i.test(l))) {
      n++;
      tr[i] = lines.slice(k).join(' ');
      return { ...c, t: lines.slice(0, k).join('\n') };
    }
    return c;
  });
  return n >= cues.length * 0.5 ? { cues: out, tr } : { cues, tr: [] };
}

// ---------------------------------------------------------------- Dịch
// Google Dịch (miễn phí, không cần key). Không gọi được thì dịch từng câu đang xem bằng MyMemory (hạn mức thấp hơn).
const GT = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi';
let gtDead = false;
async function google(text, extra = '') {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(`${GT}&dt=t${extra}&q=${encodeURIComponent(text)}`, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
const joined = (d) => (d?.[0] || []).map((x) => x?.[0] || '').join('');
const busy = new Set();
async function ensureTr(i) {
  if (!M.cues || M.tr[i] != null) return;
  const idx = [];
  let len = 0;
  for (let j = i; j < M.cues.length && idx.length < 40 && len < 1500; j++) {
    if (M.tr[j] != null || busy.has(j)) continue;
    idx.push(j); len += M.cues[j].t.length + 1;
  }
  if (!idx.length) return;
  idx.forEach((j) => busy.add(j));
  const flat = (j) => M.cues[j].t.replace(/\s*\n\s*/g, ' ');
  let parts = null;
  if (!gtDead) {
    try {
      const res = joined(await google(idx.map(flat).join('\n'))).split('\n');
      parts = res.length === idx.length ? res : await Promise.all(idx.map(async (j) => joined(await google(flat(j))).trim()));
    } catch { gtDead = true; }
  }
  if (!parts) {
    // Dự phòng: chỉ dịch câu đang xem.
    const t = await fetchTranslation(flat(i)).catch(() => '');
    parts = idx.map((j) => (j === i ? t : null));
  }
  idx.forEach((j, k) => { busy.delete(j); if (parts[k]) M.tr[j] = parts[k].trim(); });
  persist();
  paint(true);
  idx.forEach((j) => { const row = document.querySelector(`#mv-list [data-i="${j}"] .mv-rt`); if (row && M.tr[j]) row.textContent = M.tr[j]; });
}

// ---------------------------------------------------------------- Trang chọn
export function movieView() {
  stopLoop();
  if (M.playing && M.cues && M.src) return playerView();
  const nav = navBar('Xem phim song ngữ', { fallback: '#/listening' });
  const vName = M.src ? (M.src.kind === 'yt' ? `YouTube · ${M.src.id}` : M.src.name) : '';
  const step = (n, title, done, body) => `<div class="card mv-step"><div class="mv-sh"><span class="mv-n ${done ? 'done' : ''}">${done ? icon('check', 'sm') : n}</span><b>${title}</b></div>${body}</div>`;
  const body = `
    ${step(1, 'Video', !!M.src, `
      ${vName ? `<p class="mv-chosen">${icon('check', 'sm')} ${esc(vName)}</p>` : ''}
      <button class="btn ${M.src ? 'ghost' : ''}" data-act="mv-video">${icon('folder', 'sm')} Chọn video trên máy</button>
      <form data-submit="mv-yt" class="mv-yt"><input class="input" name="yt" placeholder="hoặc dán link YouTube" value="${esc(M.src?.kind === 'yt' ? `https://youtu.be/${M.src.id}` : '')}" autocomplete="off" autocapitalize="off"><button class="btn sm soft" type="submit">Dùng</button></form>
      <p class="small faint">Video trên máy chỉ phát trong app, không tải lên đâu cả.</p>`)}
    ${step(2, 'Phụ đề tiếng Anh', !!M.cues, `
      ${M.cues ? `<p class="mv-chosen">${icon('check', 'sm')} ${esc(M.name)} · ${M.cues.length} câu${M.tr.filter(Boolean).length ? ` · có sẵn ${M.tr.filter(Boolean).length} câu dịch` : ''}</p>` : ''}
      <button class="btn ${M.cues ? 'ghost' : ''}" data-act="mv-sub">${icon('upload', 'sm')} Chọn file .srt / .vtt</button>
      <p class="small faint">File <b>.song-ngu.srt</b> tải từ extension Chrome (bảng <i>Song ngữ ⋯</i> → <i>Tải .srt song ngữ</i>) đã có sẵn dòng tiếng Việt.</p>`)}
    ${step(3, 'Phụ đề tiếng Việt <span class="tag">không bắt buộc</span>', !!M.viName, `
      ${M.viName ? `<p class="mv-chosen">${icon('check', 'sm')} ${esc(M.viName)}</p>` : '<p class="small muted">Không có file thì app tự dịch từng đoạn bằng Google Dịch khi xem (cần mạng).</p>'}
      <button class="btn ghost" data-act="mv-sub-vi" ${M.cues ? '' : 'disabled'}>Chọn file tiếng Việt</button>`)}
    ${M.err ? `<div class="banner" style="margin-top:12px">${icon('info')}<span>${esc(M.err)}</span></div>` : ''}
    <button class="btn" style="margin-top:16px" data-act="mv-start" ${M.cues && M.src ? '' : 'disabled'}>Bắt đầu xem</button>`;
  return `<div class="page mv">${nav}${body}</div>`;
}

on('mv-video', async () => {
  const f = await pickFile('video/*,.mkv,.mp4,.mov,.webm,.m4v');
  if (!f) return;
  if (M.src?.kind === 'file') URL.revokeObjectURL(M.src.url);
  M.src = { kind: 'file', url: URL.createObjectURL(f), name: f.name };
  M.err = ''; M.pos = 0;
  persist();
  rerender();
});
on('mv-yt', (form) => {
  const id = ytId(form.elements.yt.value);
  if (!id) { M.err = 'Link YouTube không đúng. Ví dụ: https://www.youtube.com/watch?v=…'; rerender(); return; }
  if (M.src?.kind === 'file') URL.revokeObjectURL(M.src.url);
  M.src = { kind: 'yt', id };
  M.err = ''; M.pos = 0;
  persist();
  rerender();
});
on('mv-sub', async () => {
  const f = await pickFile('.srt,.vtt,.ass,.ssa,.ttml,.dfxp,.xml,.txt');
  if (!f) return;
  const cues = B.parse(await f.text());
  if (!cues.length) { M.err = `Không đọc được phụ đề trong file “${f.name}”.`; rerender(); return; }
  const sp = splitBilingual(cues);
  Object.assign(M, { cues: sp.cues, tr: sp.tr, name: f.name, viName: '', err: '', pos: 0 });
  if (B.lang(sp.cues) === 'vi') M.err = 'File này có vẻ là phụ đề tiếng Việt. Bước 2 cần phụ đề tiếng Anh; file tiếng Việt chọn ở bước 3.';
  persist();
  rerender();
});
on('mv-sub-vi', async () => {
  const f = await pickFile('.srt,.vtt,.ass,.ssa,.ttml,.dfxp,.xml,.txt');
  if (!f || !M.cues) return;
  const vi = B.parse(await f.text());
  if (!vi.length) { M.err = `Không đọc được phụ đề trong file “${f.name}”.`; rerender(); return; }
  M.tr = B.align(M.cues, vi).map((t) => t || null);
  M.viName = f.name; M.err = '';
  persist();
  rerender();
});
on('mv-start', () => { M.playing = true; rerender(true); });
on('mv-change', () => { M.playing = false; savePos(); rerender(true); });

// ---------------------------------------------------------------- Trang xem
function playerView() {
  const nav = navBar(M.src.kind === 'yt' ? 'YouTube' : M.src.name.replace(/\.[^.]+$/, ''), { fallback: '#/listening', right: `<button class="iconbtn" data-act="mv-change" aria-label="Đổi video hoặc phụ đề">${icon('swap')}</button>` });
  const media = M.src.kind === 'yt' ? '<div id="mv-yt"></div>' : `<video id="mv-v" src="${esc(M.src.url)}" playsinline webkit-playsinline controls preload="metadata"></video>`;
  const rows = M.cues.map((c, i) => `<div class="mv-row" data-act="mv-seek" data-i="${i}" role="button"><span class="mv-ts">${mmss(c.s)}</span><div><p>${esc(c.t)}</p><p class="mv-rt">${esc(M.tr[i] || '')}</p></div></div>`).join('');
  setTimeout(startPlayer, 0);
  return `<div class="page mv mv-play ${M.hideTr ? 'hide-tr' : ''}">${nav}
    <div class="mv-top">
      <div class="mv-media">${media}</div>
      <div class="mv-now"><div class="mv-o" id="mv-o"></div><div class="mv-t" id="mv-t" data-act="mv-peek"></div></div>
      <div class="mv-ctl">
        <button data-act="mv-prev" aria-label="Câu trước">${svgPrev}</button>
        <button data-act="mv-rep" aria-label="Nghe lại câu">${svgRep}</button>
        <button data-act="mv-toggle" class="main" aria-label="Phát / dừng" id="mv-pp">${svgPlay}</button>
        <button data-act="mv-next" aria-label="Câu sau">${svgNext}</button>
      </div>
      <div class="mv-opts">
        <button class="tag ${M.autoPause ? 'on' : ''}" data-act="mv-opt" data-k="autoPause">Dừng sau mỗi câu</button>
        <button class="tag ${M.hideTr ? 'on' : ''}" data-act="mv-opt" data-k="hideTr">Che dòng dịch</button>
        <span class="small faint" id="mv-cnt">${M.words ? `Đã thêm ${M.words} từ` : 'Chạm vào từ để tra'}</span>
      </div>
    </div>
    <h2>Toàn bộ phụ đề · ${M.cues.length} câu</h2>
    <div class="mv-list" id="mv-list">${rows}</div>
  </div>`;
}
const svg = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">${d}</svg>`;
const svgPrev = svg('<path d="M6 5v14M19 5L9 12l10 7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
const svgNext = svg('<path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>');
const svgRep = svg('<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>');
const svgPlay = svg('<path d="M7 4l13 8-13 8z" fill="currentColor"/>');
const svgPause = svg('<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor"/>');

// Lớp điều khiển chung cho <video> và YouTube.
let P = null;
let loop = 0;
function stopLoop() { if (loop) { clearInterval(loop); loop = 0; } }
function startPlayer() {
  stopLoop();
  P = null;
  const v = document.getElementById('mv-v');
  if (v) {
    P = { time: () => v.currentTime, seek: (t) => { v.currentTime = t; }, play: () => v.play().catch(() => {}), pause: () => v.pause(), paused: () => v.paused };
    v.addEventListener('loadedmetadata', () => { if (M.pos > 1 && M.pos < v.duration - 2) v.currentTime = M.pos; }, { once: true });
    v.addEventListener('error', () => toast('Máy không phát được video này (iPhone phát tốt nhất .mp4 / .mov).', 'bad'));
  } else if (document.getElementById('mv-yt')) {
    loadYT().then((YT) => {
      const el = document.getElementById('mv-yt');
      if (!el) return;
      const yp = new YT.Player(el, {
        videoId: M.src.id, width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, cc_load_policy: 0, iv_load_policy: 3, start: Math.floor(M.pos || 0) },
      });
      P = { time: () => yp.getCurrentTime?.() || 0, seek: (t) => yp.seekTo?.(t, true), play: () => yp.playVideo?.(), pause: () => yp.pauseVideo?.(), paused: () => (yp.getPlayerState?.() ?? 2) !== 1 };
    }).catch(() => toast('Không tải được trình phát YouTube (cần mạng).', 'bad'));
  }
  cur = -2; stopAt = -1;
  loop = setInterval(() => {
    if (!document.getElementById('mv-list')) { savePos(); stopLoop(); return; }
    paint(false);
  }, 120);
}
let ytPromise = null;
function loadYT() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return ytPromise || (ytPromise = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytPromise = null; rej(new Error('yt')); };
    document.head.append(s);
  }));
}
function savePos() { if (P) { M.pos = P.time(); persist(); } }

let cur = -2, stopAt = -1, lastSave = 0;
function paint(force) {
  if (!P || !M.cues) return;
  const t = P.time();
  // Dừng sau mỗi câu: tới cuối câu vừa nghe thì dừng lại.
  if (M.autoPause && stopAt >= 0 && !P.paused() && t >= M.cues[stopAt].e - 0.08) { P.pause(); stopAt = -1; }
  const i = B.at(M.cues, t);
  const pp = document.getElementById('mv-pp');
  if (pp) { const h = P.paused() ? svgPlay : svgPause; if (pp.dataset.s !== h.length + '') { pp.innerHTML = h; pp.dataset.s = h.length; } }
  if (Date.now() - lastSave > 5000) { lastSave = Date.now(); M.pos = t; persist(); }
  if (i === cur && !force) return;
  if (i !== cur && i >= 0 && !P.paused()) stopAt = i;
  cur = i;
  const o = document.getElementById('mv-o'), tr = document.getElementById('mv-t');
  if (!o) return;
  // Giữa hai câu vẫn hiện câu vừa qua (để kịp đọc / chạm từ).
  const show = i >= 0 ? i : B.before(M.cues, t);
  if (show < 0) { o.innerHTML = '<span class="faint">…</span>'; tr.textContent = ''; return; }
  o.classList.toggle('past', i < 0);
  o.innerHTML = M.cues[show].t.split('\n').map((line) => B.tokens(line).map((tk) => (tk.w ? `<span class="w" data-act="mv-word" data-w="${esc(tk.t)}">${esc(tk.t)}</span>` : esc(tk.t))).join('')).join('<br>');
  tr.textContent = M.tr[show] || (gtDead ? '' : '…');
  tr.classList.remove('peek');
  if (M.tr[show] == null) ensureTr(show);
  else if (M.tr.slice(show, show + 10).some((x, k) => x == null && show + k < M.cues.length)) ensureTr(show + M.tr.slice(show, show + 10).findIndex((x) => x == null));
  const list = document.getElementById('mv-list');
  list.querySelector('.on')?.classList.remove('on');
  const row = list.querySelector(`[data-i="${show}"]`);
  row?.classList.add('on');
  // Cuộn danh sách theo câu đang phát (chỉ khi người dùng không đang kéo xem chỗ khác).
  if (row && Date.now() - touchedAt > 4000) {
    const view = document.getElementById('view');
    const top = document.querySelector('.mv-top');
    const want = row.offsetTop - (top?.offsetHeight || 0) - 60;
    if (Math.abs(view.scrollTop - want) > 40 && view.scrollTop > want - 400) view.scrollTo({ top: Math.max(0, want), behavior: 'smooth' });
  }
}
let touchedAt = 0;
document.addEventListener('touchmove', () => { touchedAt = Date.now(); }, { passive: true });
document.addEventListener('wheel', () => { touchedAt = Date.now(); }, { passive: true });

function go(i) {
  if (!P || !M.cues[i]) return;
  P.seek(M.cues[i].s + 0.01);
  stopAt = i;
  P.play();
  cur = -2;
  touchedAt = 0;
}
const nowIdx = () => {
  const t = P?.time() || 0;
  const i = B.at(M.cues, t);
  return { i: i >= 0 ? i : B.before(M.cues, t), t };
};
on('mv-prev', () => { const { i, t } = nowIdx(); go(i >= 0 && t - M.cues[i].s > 1.2 ? i : Math.max(0, i - 1)); });
on('mv-rep', () => go(Math.max(0, nowIdx().i)));
on('mv-next', () => go(nowIdx().i + 1));
on('mv-toggle', () => { if (!P) return; if (P.paused()) { stopAt = -1; P.play(); } else P.pause(); });
on('mv-seek', (el) => go(Number(el.dataset.i)));
on('mv-peek', (el) => el.classList.toggle('peek'));
on('mv-opt', (el) => {
  const k = el.dataset.k;
  M[k] = !M[k];
  el.classList.toggle('on', M[k]);
  if (k === 'hideTr') document.querySelector('.mv-play')?.classList.toggle('hide-tr', M[k]);
});

// ---------------------------------------------------------------- Tra từ
let pick = null;
on('mv-word', async (el) => {
  P?.pause();
  const word = el.dataset.w;
  const line = el.closest('.mv-o').textContent;
  const idx = Math.max(0, nowIdx().i);
  pick = { word, line, tr: M.tr[idx] || '', info: null };
  document.querySelectorAll('.mv-o .w.sel').forEach((n) => n.classList.remove('sel'));
  el.classList.add('sel');
  speak(word);
  drawSheet();
  const [d, g] = await Promise.allSettled([fetchDictionary(word.toLowerCase()), gtDead ? Promise.reject() : google(word.toLowerCase(), '&dt=bd')]);
  if (pick?.word !== word) return;
  const info = { ipa: '', pos: '', def: '', meaning: '', senses: [] };
  if (d.status === 'fulfilled' && d.value) {
    info.ipa = d.value.ipa; info.pos = d.value.senses[0]?.pos || ''; info.def = d.value.senses[0]?.definition || '';
  }
  if (g.status === 'fulfilled') {
    info.meaning = joined(g.value);
    info.senses = (g.value?.[1] || []).map((x) => ({ pos: x[0], terms: (x[1] || []).slice(0, 6) })).slice(0, 4);
  } else {
    info.meaning = await fetchTranslation(word.toLowerCase()).catch(() => '');
  }
  if (pick?.word !== word) return;
  pick.info = info;
  drawSheet();
});
function drawSheet() {
  const p = pick;
  const i = p.info;
  const have = findByText(p.word.toLowerCase()) || findByText(p.word);
  const first = i ? (i.senses[0]?.terms.slice(0, 3).join(', ') || i.meaning) : '';
  openSheet(`<div class="mv-sheet">
    <div class="row-between"><div><b class="mv-hw">${esc(p.word)}</b> ${i?.ipa ? `<span class="muted">${esc(i.ipa)}</span>` : ''}</div>
      <button class="iconbtn tonal" data-act="mv-say" aria-label="Nghe">${icon('speaker')}</button></div>
    ${!i ? '<p class="muted" style="margin-top:8px">Đang tra…</p>' : `
      ${i.meaning ? `<p class="mv-mean">${esc(i.meaning)}</p>` : ''}
      ${i.senses.map((s) => `<p class="small"><b class="mv-pos">${esc(s.pos)}</b> ${esc(s.terms.join(', '))}</p>`).join('')}
      ${i.def ? `<p class="small muted" style="margin-top:6px">${esc(i.def)}</p>` : ''}
      ${!i.meaning && !i.senses.length && !i.def ? '<p class="small muted" style="margin-top:8px">Không tra được (mất mạng?). Vẫn thêm được từ và tự ghi nghĩa.</p>' : ''}`}
    <p class="mv-ex">“${esc(p.line)}”${p.tr ? `<br><span class="muted">${esc(p.tr)}</span>` : ''}</p>
    ${have ? `<div class="banner info" style="margin-top:10px">${icon('check')}<span>“${esc(have.word)}” đã có trong kho${have.examples.includes(p.line) ? ' (đã có câu này)' : ''}.</span></div>` : ''}
    <form data-submit="mv-add" style="margin-top:12px">
      <input class="input" name="word" value="${esc((have?.word) || p.word.toLowerCase())}" aria-label="Từ sẽ lưu" autocomplete="off" autocapitalize="off">
      <input class="input" name="meaning" style="margin-top:8px" value="${esc(have?.meaning || first)}" placeholder="Nghĩa tiếng Việt" aria-label="Nghĩa" autocomplete="off">
      <div class="btn-row" style="margin-top:12px"><button class="btn ghost" type="button" data-act="sheet-close">Đóng</button>
      <button class="btn" type="submit" ${have?.examples.includes(p.line) ? 'disabled' : ''}>${have ? 'Thêm câu làm ví dụ' : 'Thêm vào kho từ'}</button></div>
    </form></div>`);
}
on('mv-say', () => pick && speak(pick.word));
on('mv-add', async (form) => {
  if (!pick) return;
  const word = form.elements.word.value.trim();
  const meaning = form.elements.meaning.value.trim();
  if (!word) return;
  const i = pick.info || {};
  let w = findByText(word);
  if (w) {
    if (!w.examples.includes(pick.line)) w.examples.push(pick.line);
    if (!w.meaning && meaning) w.meaning = meaning;
    await saveWord(w);
    toast(`Đã thêm câu ví dụ cho “${w.word}”`);
  } else {
    let deck = S.decks.find((d) => d.name.toLowerCase() === DECK.toLowerCase());
    if (!deck) deck = await addDeck(DECK);
    w = blankWord(deck.id);
    Object.assign(w, {
      word, meaning, ipa: i.ipa || '', pos: i.pos || i.senses?.[0]?.pos || '', definition: i.def || '',
      examples: [pick.line], notes: [pick.tr ? `Dịch câu: ${pick.tr}` : '', `Từ phim: ${M.src?.kind === 'yt' ? 'YouTube' : M.src?.name || M.name}`].filter(Boolean).join('\n'),
    });
    await saveWord(w);
    M.words++;
    const c = document.getElementById('mv-cnt');
    if (c) c.textContent = `Đã thêm ${M.words} từ`;
    toast(`Đã thêm “${word}” vào kho · chủ đề “${DECK}”`);
  }
  closeSheet(null);
});
