// Lớp phụ đề song ngữ trên video. Chạy trong mọi khung (iframe) có video.
// Nguồn phụ đề, theo thứ tự ưu tiên:
//   1. File phụ đề trình phát tải về (inject.js bắt được): YouTube, nhiều web phim dùng JW Player / video.js / HLS…
//   2. Phụ đề có sẵn trong thẻ <video> (textTracks).
//   3. File .srt/.vtt người dùng tự mở.
//   4. Chữ phụ đề trình phát đang hiện trên trang (Netflix và các trang tự vẽ phụ đề): đọc chữ rồi dịch từng câu.
(() => {
  if (window.__bisubContent) return;
  window.__bisubContent = true;
  const B = globalThis.BiSubs;
  const HOST = location.hostname;
  const IS_YT = /(^|\.)youtube(-nocookie)?\.com$/.test(HOST);
  const NO_SEEK = /(^|\.)netflix\.com$/.test(HOST); // Netflix báo lỗi khi tự tua bằng currentTime
  const DEF = { enabled: true, tl: 'vi', size: 26, showOrig: true, showTrans: true, pauseHover: true, pos: 10 };
  let cfg = { ...DEF };

  // Chỗ trình phát hay vẽ phụ đề (để đọc chữ, và làm mờ đi khi đã có lớp song ngữ).
  const CAPTION_SEL = [
    '.player-timedtext', '.ytp-caption-window-container', '.vjs-text-track-display', '.jw-captions', '.jw-text-track-container',
    '.plyr__captions', '.shaka-text-container', '.art-subtitle', '.dplayer-subtitle', '.atvwebplayersdk-captions-text',
    '.dss-subtitle-renderer-wrapper', '.fp-captions', '.mejs__captions-layer', '.vds-captions', 'media-captions',
    '.bmpui-ui-subtitle-overlay', '.html5-captions', '.subtitle-container', '[class*="subtitles-text"]', '[class*="captions-text"]',
  ].join(',');

  // ---------- Trạng thái ----------
  const tracks = new Map(); // key → { key, label, lang, cues, tr: [], src, at, vid }
  let mainKey = null, transKey = '', picked = false; // picked: người dùng đã tự chọn nguồn
  let offset = 0; // lệch giờ (giây), cộng vào thời gian video
  let video = null;
  let domBox = null, domText = '', domTrans = '';
  const pending = new Set();
  const domCache = new Map();
  const touchedTracks = new Map(); // textTrack → mode cũ (để trả lại khi tắt)

  const send = (msg) => new Promise((res) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => { void chrome.runtime.lastError; res(r?.ok ? r.v : null); });
    } catch { res(null); } // extension vừa được tải lại: trang cũ không còn kết nối
  });

  const ytVid = () => {
    if (!IS_YT) return '';
    const u = new URL(location.href);
    return u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{6,})/) || [])[1] || '';
  };

  // ---------- Nhận phụ đề ----------
  function guessLang(url, cues) {
    const g = B.lang(cues);
    if (g !== '?') return g;
    if (/[/_.\-=](vi|vie|vn|vietnamese)([/_.\-&]|$)/i.test(url)) return 'vi';
    if (/[/_.\-=](en|eng|english)([/_.\-&]|$)/i.test(url)) return 'en';
    return '?';
  }
  function addTrack(t) {
    const old = tracks.get(t.key);
    if (old && t.merge) {
      // Phụ đề HLS tới thành nhiều đoạn nhỏ → nối lại.
      const seen = new Set(old.cues.map((c) => c.s.toFixed(2) + c.t));
      const add = t.cues.filter((c) => !seen.has(c.s.toFixed(2) + c.t));
      if (!add.length) return;
      old.cues = old.cues.concat(add).sort((a, b) => a.s - b.s);
      old.tr = []; old.aligned = null;
      old.at = Date.now();
    } else {
      if (old && old.cues.length === t.cues.length && old.cues[0]?.t === t.cues[0]?.t) return;
      tracks.set(t.key, { tr: [], at: Date.now(), ...t });
    }
    pick();
  }
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.__bisub !== 'track') return;
    const { url, text } = e.data;
    const cues = B.parse(text);
    if (cues.length < 2) return;
    let u = null;
    try { u = new URL(url, location.href); } catch { /* url lạ */ }
    if (IS_YT && /timedtext/.test(url) && u) {
      const p = u.searchParams;
      const lg = p.get('tlang') || p.get('lang') || '';
      addTrack({
        key: `yt:${p.get('v')}:${lg}:${p.get('kind') || ''}`, vid: p.get('v') || '', cues, src: 'yt',
        lang: lg.slice(0, 2).toLowerCase() || guessLang(url, cues),
        label: `YouTube · ${lg || '?'}${p.get('kind') === 'asr' ? ' (tự động)' : ''}${p.get('tlang') ? ' (YouTube dịch)' : ''}`,
      });
      return;
    }
    const base = u ? u.origin + u.pathname : url;
    const name = decodeURIComponent((base.split('/').pop() || 'phụ đề')).slice(0, 40);
    addTrack({ key: 'net:' + base.replace(/[-_]?\d+(\.\w+)$/, '$1'), merge: /\.(vtt|webvtt)$/i.test(base) && cues.length < 80, cues, src: 'net', lang: guessLang(url, cues), label: name });
  });

  function scanTextTracks() {
    if (!video) return;
    const list = video.textTracks;
    for (let i = 0; i < (list?.length || 0); i++) {
      const tt = list[i];
      if (!/subtitles|captions/.test(tt.kind) || !tt.cues?.length) continue;
      const key = `tt:${i}:${tt.label}:${tt.language}`;
      const old = tracks.get(key);
      if (old && old.cues.length === tt.cues.length) continue;
      const cues = [...tt.cues].map((c) => ({ s: c.startTime, e: c.endTime, t: B.clean(c.text || '') })).filter((c) => c.t);
      if (cues.length < 2) continue;
      const lg = (tt.language || '').slice(0, 2).toLowerCase();
      addTrack({ key, cues, src: 'tt', tt, lang: lg === 'vi' || lg === 'en' ? lg : B.lang(cues), label: tt.label || tt.language || `Phụ đề ${i + 1}` });
    }
  }

  function usable() {
    const vid = ytVid();
    return [...tracks.values()].filter((t) => !t.vid || t.vid === vid);
  }
  function pick() {
    const list = usable().sort((a, b) => b.at - a.at);
    if (picked && (mainKey === 'dom' || tracks.has(mainKey))) { render(true); return; }
    picked = false;
    const tl = cfg.tl;
    const main = list.find((t) => t.lang === 'en' && t.src === 'file') || list.find((t) => t.lang === 'en') || list.find((t) => t.lang !== tl) || list[0];
    mainKey = main ? main.key : null;
    const other = list.find((t) => t !== main && t.lang === tl);
    transKey = other ? other.key : '';
    render(true);
  }
  const mainTrack = () => (mainKey && mainKey !== 'dom' ? tracks.get(mainKey) : null);

  // ---------- Dịch ----------
  // Phim nói tiếng Anh nhưng chỉ có phụ đề tiếng Việt: dịch ngược sang tiếng Anh, tiếng Anh (dịch máy) ở dòng trên.
  const rev = (t) => !!t && t.src !== 'dom' && t.lang === cfg.tl && cfg.tl !== 'en' && !(transKey && tracks.has(transKey));
  const target = (t) => (rev(t) ? 'en' : cfg.tl);
  function transOf(t, i) {
    if (transKey && tracks.has(transKey)) {
      const o = tracks.get(transKey);
      if (!t.aligned || t.alignedWith !== transKey) { t.aligned = B.align(t.cues, o.cues); t.alignedWith = transKey; }
      return t.aligned[i] || '';
    }
    return t.tr[i];
  }
  async function ensure(t, i) {
    if (transKey && tracks.has(transKey)) return;
    if (t.failUntil > Date.now()) return; // vừa lỗi mạng: chờ một lúc rồi thử lại
    const idx = [];
    for (let j = Math.max(0, i - 1); j < Math.min(t.cues.length, i + 40); j++) if (t.tr[j] == null && !pending.has(t.key + j)) idx.push(j);
    if (!idx.length || idx.length < 8 && idx[0] !== i && t.tr[i] != null) return; // còn đủ câu đã dịch phía trước
    idx.forEach((j) => pending.add(t.key + j));
    const tl = target(t);
    const out = await send({ type: 'translate', lines: idx.map((j) => t.cues[j].t), tl });
    idx.forEach((j, k) => { pending.delete(t.key + j); if (out?.[k] && tl === target(t)) t.tr[j] = out[k]; });
    if (!out || !out.some(Boolean)) t.failUntil = Date.now() + 8000;
    render(true);
  }
  async function translateAll(t, onStep) {
    for (let i = 0; i < t.cues.length; i += 60) {
      const idx = [];
      for (let j = i; j < Math.min(t.cues.length, i + 60); j++) if (t.tr[j] == null) idx.push(j);
      if (idx.length) {
        const out = await send({ type: 'translate', lines: idx.map((j) => t.cues[j].t), tl: target(t) });
        idx.forEach((j, k) => { if (out?.[k]) t.tr[j] = out[k]; });
      }
      onStep?.(Math.min(1, (i + 60) / t.cues.length));
    }
  }

  // ---------- Giao diện (shadow DOM để CSS của trang không ảnh hưởng) ----------
  const host = document.createElement('bisub-layer');
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;display:none;contain:layout;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
    .wrap{position:absolute;inset:0}
    .box{position:absolute;left:50%;transform:translateX(-50%);max-width:92%;width:max-content;text-align:center;pointer-events:auto;
      background:rgba(8,8,12,.72);border-radius:10px;padding:.28em .7em .34em;line-height:1.32;cursor:default;user-select:text}
    .box:empty,.box.off{display:none}
    .o{color:#fff;font-weight:600;text-shadow:0 1px 2px #000}
    .w{border-radius:4px;cursor:pointer;padding:0 .04em}
    .w:hover{background:rgba(255,216,77,.35)}
    .w.sel{background:#FFD84D;color:#111;text-shadow:none}
    .mt{display:inline-block;font-size:.5em;font-weight:700;vertical-align:middle;margin-right:.5em;padding:.1em .45em;border-radius:6px;background:#FFD84D;color:#111;text-shadow:none}
    .t{color:#FFD84D;font-weight:500;font-size:.86em;margin-top:.12em;text-shadow:0 1px 2px #000}
    .t.wait{opacity:.5}
    .chip{position:absolute;top:10px;right:10px;pointer-events:auto;border:0;border-radius:99px;padding:6px 12px;font-size:13px;font-weight:700;
      background:rgba(108,77,246,.92);color:#fff;cursor:pointer;opacity:0;transition:opacity .2s;box-shadow:0 2px 8px rgba(0,0,0,.3)}
    .chip.show{opacity:1}
    .panel,.bubble{position:absolute;pointer-events:auto;background:#fff;color:#1d1b26;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:14px;line-height:1.4}
    .panel{top:48px;right:10px;width:320px;max-width:calc(100% - 20px);max-height:calc(100% - 60px);overflow:auto;padding:14px}
    .panel h3{margin:0 0 6px;font-size:15px}
    .panel .sec{margin-top:12px}
    .panel .lbl{font-size:12px;font-weight:700;color:#6b6880;text-transform:uppercase;letter-spacing:.03em;margin-bottom:4px}
    .opt{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px;cursor:pointer}
    .opt:hover{background:#f2effe}
    .opt input{margin-top:3px}
    .opt small{display:block;color:#6b6880}
    .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    button.b{border:0;border-radius:9px;padding:7px 11px;font-size:13px;font-weight:600;background:#efeafe;color:#4a32c9;cursor:pointer}
    button.b.p{background:#6C4DF6;color:#fff}
    button.b:disabled{opacity:.5;cursor:default}
    .hint{font-size:12.5px;color:#6b6880;margin-top:8px}
    .x{position:absolute;top:8px;right:10px;border:0;background:none;font-size:18px;cursor:pointer;color:#6b6880}
    .bubble{width:290px;padding:14px;max-height:70%;overflow:auto}
    .bubble .hw{font-size:20px;font-weight:800;margin-right:6px}
    .bubble .ipa{color:#6b6880}
    .bubble .pos{font-size:12px;font-weight:700;color:#6C4DF6;margin-top:6px;text-transform:uppercase}
    .bubble .mean{font-size:15px;font-weight:600;margin-top:4px}
    .bubble .def{font-size:13px;color:#4b4860;margin-top:6px}
    .bubble input{width:100%;border:1px solid #d9d4ee;border-radius:8px;padding:6px 8px;font-size:14px;margin-top:4px}
    .bubble .ok{color:#14915f;font-weight:700;font-size:13px}
    .spk{border:0;background:#efeafe;border-radius:99px;width:28px;height:28px;cursor:pointer;vertical-align:middle}
  </style><div class="wrap"><div class="box off"></div><button class="chip" title="Phụ đề song ngữ">Song ngữ ⋯</button></div>`;
  const wrap = root.querySelector('.wrap');
  const box = root.querySelector('.box');
  const chip = root.querySelector('.chip');
  let panel = null, bubble = null;
  // Không để cú chạm vào lớp phụ đề lọt xuống trình phát (bấm vào video = dừng/phát).
  for (const ev of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'touchstart', 'keydown', 'wheel']) {
    wrap.addEventListener(ev, (e) => { if (e.target !== wrap) e.stopPropagation(); });
  }
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (k === 'class') n.className = v;
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c.nodeType ? c : String(c));
    return n;
  };

  let shown = { key: '', text: '', tr: '' };
  let curIdx = -1;
  function lineNow() {
    if (mainKey === 'dom') return domText ? { text: domText, tr: domTrans, idx: -1 } : null;
    const t = mainTrack();
    if (!t || !video) return null;
    const i = B.at(t.cues, video.currentTime + offset);
    curIdx = i;
    if (i < 0) return null;
    if (t.tr[i] == null) ensure(t, i);
    // Chỉ có phụ đề tiếng Việt: dòng trên là tiếng Anh dịch máy, dòng dưới là phụ đề gốc.
    if (rev(t)) return { text: t.tr[i] || '', tr: t.cues[i].t, idx: i, mt: true };
    return { text: t.cues[i].t, tr: transOf(t, i), idx: i };
  }
  function render(force) {
    if (!cfg.enabled || !video) return;
    const L = lineNow();
    const key = L ? `${mainKey}|${L.idx}|${L.text}` : '';
    const tr = L?.tr ?? null;
    if (!force && key === shown.key && tr === shown.tr) return;
    shown = { key, text: L?.text || '', tr };
    box.textContent = '';
    if (!L) { box.classList.add('off'); return; }
    box.classList.remove('off');
    if (cfg.showOrig) {
      const o = el('div', { class: 'o' });
      if (L.mt) o.append(el('span', { class: 'mt', title: 'Phim chỉ có phụ đề tiếng Việt: dòng tiếng Anh là dịch máy, có thể khác lời thoại thật' }, 'EN dịch máy'));
      if (L.mt && !L.text) o.append('…');
      L.text.split('\n').forEach((line, n) => {
        if (n) o.append(el('br'));
        for (const tk of B.tokens(line)) o.append(tk.w ? el('span', { class: 'w', 'data-w': tk.t }, tk.t) : tk.t);
      });
      box.append(o);
    }
    if (cfg.showTrans) {
      const waiting = tr == null || tr === '';
      if (!waiting || cfg.showOrig) box.append(el('div', { class: 't' + (waiting ? ' wait' : '') }, waiting ? (mainKey === 'dom' || (transKey && tracks.has(transKey)) ? '' : '…') : tr));
    }
    if (!box.childNodes.length) box.classList.add('off');
  }

  // ---------- Vị trí theo video ----------
  let lastRect = '';
  function place() {
    const r = video.getBoundingClientRect();
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    const parent = fs && fs !== video && fs.tagName !== 'VIDEO' ? fs : document.documentElement;
    if (host.parentNode !== parent) parent.append(host);
    const k = `${r.left}|${r.top}|${r.width}|${r.height}`;
    if (k === lastRect) return;
    lastRect = k;
    Object.assign(host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const scale = Math.max(0.62, Math.min(1.6, r.width / 1280));
    box.style.fontSize = Math.round(cfg.size * scale) + 'px';
    box.style.bottom = cfg.pos + '%';
  }

  function pickVideo() {
    let best = null, area = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area && r.width > 200 && r.height > 110 && getComputedStyle(v).visibility !== 'hidden') { best = v; area = a; }
    }
    if (best !== video) {
      video = best;
      lastRect = '';
      if (video && !video.__bisubEv) {
        video.__bisubEv = true;
        video.addEventListener('seeked', () => render(true));
      }
    }
  }

  // ---------- Phụ đề vẽ trên trang ----------
  function findDomBox() {
    if (!video) return null;
    const vr = video.getBoundingClientRect();
    for (const n of document.querySelectorAll(CAPTION_SEL)) {
      const r = n.getBoundingClientRect();
      if (r.width && r.bottom > vr.top && r.top < vr.bottom + 40 && r.right > vr.left && r.left < vr.right) return n;
    }
    return null;
  }
  async function pollDom() {
    domBox = findDomBox();
    if (mainKey !== 'dom') return;
    const text = domBox ? B.clean(domBox.innerText || '') : '';
    if (text === domText) return;
    domText = text;
    domTrans = domCache.get(text) ?? '';
    render(true);
    if (text && !domCache.has(text) && cfg.showTrans) {
      domCache.set(text, '');
      const out = await send({ type: 'translate', lines: [text], tl: cfg.tl });
      if (out?.[0]) { domCache.set(text, out[0]); if (domText === text) { domTrans = out[0]; render(true); } }
    }
  }

  // Làm mờ phụ đề gốc của trình phát (vẫn đọc được chữ), để không hiện hai lần.
  function hideNative(on) {
    document.querySelectorAll('[data-bisub-hide]').forEach((n) => { if (!on) n.removeAttribute('data-bisub-hide'); });
    if (on && video) {
      const vr = video.getBoundingClientRect();
      for (const n of document.querySelectorAll(CAPTION_SEL)) {
        const r = n.getBoundingClientRect();
        if (!r.width || (r.bottom > vr.top && r.top < vr.bottom + 40)) n.setAttribute('data-bisub-hide', '');
      }
    }
    // Phụ đề <track> trình duyệt tự vẽ: chuyển sang "ẩn" (vẫn đọc được câu).
    const t = mainTrack();
    if (on && t?.tt && t.tt.mode === 'showing') { touchedTracks.set(t.tt, 'showing'); t.tt.mode = 'hidden'; }
    if (!on) { touchedTracks.forEach((m, tt) => { try { tt.mode = m; } catch { /* bỏ qua */ } }); touchedTracks.clear(); }
  }

  // YouTube: tự bật CC một lần mỗi video để trình phát tải phụ đề về.
  const ccTried = new Set();
  function youtubeCC() {
    const vid = ytVid();
    if (!vid || ccTried.has(vid) || usable().some((t) => t.src === 'yt') || !video || video.paused) return;
    const btn = document.querySelector('.ytp-subtitles-button');
    if (!btn || btn.offsetParent === null) return;
    ccTried.add(vid);
    if (btn.getAttribute('aria-pressed') === 'false') btn.click();
  }

  // ---------- Vòng lặp ----------
  let raf = 0;
  function frame() {
    raf = 0;
    if (!cfg.enabled || !video || !video.isConnected) { host.style.display = 'none'; return; }
    const active = !!(mainKey && (mainKey !== 'dom' || domBox));
    host.style.display = '';
    place();
    if (active) render(false); else box.classList.add('off');
    raf = requestAnimationFrame(frame);
  }
  function tick() {
    if (!cfg.enabled) { stop(); return; }
    pickVideo();
    if (!video) { host.style.display = 'none'; return; }
    scanTextTracks();
    if (IS_YT) youtubeCC();
    if (!mainKey || mainKey === 'dom') {
      // Không có file phụ đề → đọc chữ phụ đề trình phát đang hiện.
      if (!mainKey && findDomBox()) { mainKey = 'dom'; }
      pollDom();
    }
    if (mainKey && mainKey !== 'dom' && !tracks.has(mainKey)) pick();
    if (IS_YT && mainTrack()?.vid && mainTrack().vid !== ytVid()) pick();
    hideNative(!!mainKey && (mainKey !== 'dom' || !!domBox));
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function stop() {
    host.style.display = 'none';
    hideNative(false);
    closePanel(); closeBubble();
  }
  setInterval(tick, 700);
  setInterval(() => { if (mainKey === 'dom' && cfg.enabled) pollDom(); }, 200);

  // ---------- Dừng khi rê chuột vào phụ đề ----------
  let hoverPaused = false, bubblePaused = false;
  box.addEventListener('mouseenter', () => {
    if (cfg.pauseHover && video && !video.paused) { video.pause(); hoverPaused = true; }
  });
  box.addEventListener('mouseleave', () => {
    if (hoverPaused && !bubble && video?.paused) video.play().catch(() => {});
    hoverPaused = false;
  });

  // ---------- Tra từ ----------
  box.addEventListener('click', (e) => {
    const w = e.target.closest?.('.w');
    if (w) openBubble(w);
  });
  function closeBubble(resume = true) {
    if (!bubble) return;
    bubble.remove(); bubble = null;
    root.querySelectorAll('.w.sel').forEach((n) => n.classList.remove('sel'));
    if (resume && bubblePaused && video?.paused && !hoverPaused) video.play().catch(() => {});
    bubblePaused = false;
  }
  function speak(text) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch { /* trình duyệt không hỗ trợ */ }
  }
  async function openBubble(w) {
    const word = w.dataset.w;
    const line = shown.text.replace(/\n/g, ' ');
    const lineTr = shown.tr || '';
    closeBubble(false);
    w.classList.add('sel');
    if (video && !video.paused) { video.pause(); bubblePaused = true; } else if (hoverPaused) { bubblePaused = true; hoverPaused = false; }
    const status = el('div', { class: 'def' }, 'Đang tra…');
    const body = el('div', {}, status);
    bubble = el('div', { class: 'bubble' },
      el('button', { class: 'x', title: 'Đóng', on: { click: () => closeBubble() } }, '×'),
      el('div', {}, el('span', { class: 'hw' }, word), el('button', { class: 'spk', title: 'Nghe', on: { click: () => speak(word) } }, '🔊')),
      body);
    wrap.append(bubble);
    // Đặt bóng ngay trên từ vừa chạm.
    const hr = host.getBoundingClientRect(), wr = w.getBoundingClientRect();
    const bw = Math.min(290, hr.width - 20);
    bubble.style.width = bw + 'px';
    bubble.style.left = Math.max(10, Math.min(hr.width - bw - 10, wr.left - hr.left + wr.width / 2 - bw / 2)) + 'px';
    bubble.style.bottom = Math.max(10, hr.bottom - wr.top + 10) + 'px';
    speak(word);
    const r = await send({ type: 'lookup', word, tl: cfg.tl });
    if (!bubble || !bubble.contains(body)) return;
    body.textContent = '';
    if (!r) { body.append(el('div', { class: 'def' }, 'Không tra được (mất mạng?).')); }
    const first = r ? (r.senses[0]?.terms.slice(0, 3).join(', ') || r.meaning) : '';
    if (r) {
      if (r.ipa) body.append(el('div', { class: 'ipa' }, r.ipa));
      if (r.meaning) body.append(el('div', { class: 'mean' }, r.meaning));
      for (const s of r.senses) body.append(el('div', { class: 'pos' }, s.pos), el('div', {}, s.terms.join(', ')));
      if (r.definition) body.append(el('div', { class: 'def' }, r.definition));
    }
    const lemma = el('input', { value: word.toLowerCase(), 'aria-label': 'Từ sẽ lưu' });
    const mean = el('input', { value: first || '', placeholder: 'Nghĩa tiếng Việt', 'aria-label': 'Nghĩa' });
    const ok = el('div', { class: 'ok' });
    const saveBtn = el('button', {
      class: 'b p', on: {
        click: async () => {
          saveBtn.disabled = true;
          const res = await send({
            type: 'save', item: {
              word: lemma.value.trim() || word, meaning: mean.value.trim(), ipa: r?.ipa || '', pos: r?.pos || '', definition: r?.definition || '',
              example: line, exTrans: lineTr, source: document.title.slice(0, 120), url: location.href.slice(0, 300),
            },
          });
          ok.textContent = res ? (res.existed ? `Đã có trong danh sách · thêm câu ví dụ (${res.count} từ)` : `Đã lưu · ${res.count} từ`) : 'Lưu không được.';
          if (!res) saveBtn.disabled = false;
        },
      },
    }, 'Lưu từ');
    body.append(el('div', { class: 'sec', style: 'margin-top:10px' }, el('div', { class: 'lbl', style: 'font-size:12px;color:#6b6880;font-weight:700' }, 'Lưu vào danh sách'), lemma, mean),
      el('div', { class: 'row', style: 'margin-top:8px' }, saveBtn, ok));
  }

  // ---------- Bảng chọn nguồn ----------
  let chipTimer = 0;
  document.addEventListener('mousemove', (e) => {
    if (!cfg.enabled || !video || host.style.display === 'none') return;
    const r = video.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    chip.classList.add('show');
    clearTimeout(chipTimer);
    chipTimer = setTimeout(() => { if (!panel) chip.classList.remove('show'); }, 2500);
  }, { passive: true });
  chip.addEventListener('click', () => (panel ? closePanel() : openPanel()));
  function closePanel() { panel?.remove(); panel = null; chip.classList.remove('show'); }

  function download(name, text) {
    const a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' })), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function openFile() {
    const inp = el('input', { type: 'file', accept: '.srt,.vtt,.ass,.ssa,.ttml,.dfxp,.xml,.txt' });
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      if (!f) return;
      const cues = B.parse(await f.text());
      if (!cues.length) { alert('Không đọc được file phụ đề này.'); return; }
      const key = 'file:' + f.name;
      tracks.set(key, { key, cues, tr: [], src: 'file', lang: B.lang(cues), label: f.name, at: Date.now() });
      if (B.lang(cues) === cfg.tl && mainKey && mainKey !== 'dom') transKey = key; else { mainKey = key; }
      picked = true; offset = 0;
      render(true); openPanel();
    });
    inp.click();
  }

  function openPanel() {
    closePanel();
    chip.classList.add('show');
    const list = usable().sort((a, b) => b.at - a.at);
    const radio = (name, val, cur, title, sub, fn) => el('label', { class: 'opt' },
      el('input', { type: 'radio', name, checked: val === cur, on: { change: fn } }),
      el('span', {}, title, sub ? el('small', {}, sub) : null));
    const langName = (l) => ({ en: 'tiếng Anh', vi: 'tiếng Việt' }[l] || 'chưa rõ');
    const srcs = list.map((t) => radio('m', t.key, mainKey, t.label, `${t.cues.length} câu · ${langName(t.lang)}`, () => { mainKey = t.key; picked = true; render(true); openPanel(); }));
    if (domBox || mainKey === 'dom') srcs.push(radio('m', 'dom', mainKey, 'Chữ phụ đề đang hiện trên trình phát', 'Dịch từng câu khi hiện · không tua theo câu được', () => { mainKey = 'dom'; picked = true; domText = ''; render(true); openPanel(); }));
    const t = mainTrack();
    const transOpts = t ? [radio('tr', '', transKey, 'Dịch máy (Google)', `sang ${cfg.tl}`, () => { transKey = ''; render(true); })]
      .concat(list.filter((x) => x !== t).map((x) => radio('tr', x.key, transKey, x.label, `${x.cues.length} câu · ${langName(x.lang)}`, () => { transKey = x.key; render(true); }))) : [];
    const offLbl = el('b', {}, `${offset >= 0 ? '+' : ''}${offset.toFixed(1)} giây`);
    const shift = (d) => { offset = Math.round((offset + d) * 10) / 10; offLbl.textContent = `${offset >= 0 ? '+' : ''}${offset.toFixed(1)} giây`; render(true); };
    const dl = el('button', {
      class: 'b', disabled: !t, on: {
        click: async () => {
          dl.disabled = true;
          if (!(transKey && tracks.has(transKey))) await translateAll(t, (p) => { dl.textContent = `Đang dịch… ${Math.round(p * 100)}%`; });
          const name = (document.title || 'phu-de').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'phu-de';
          if (rev(t)) download(`${name}.song-ngu.srt`, B.toSrt(t.cues.map((c, i) => ({ ...c, t: t.tr[i] || '' })), t.cues.map((c) => c.t)));
          else download(`${name}.song-ngu.srt`, B.toSrt(t.cues, t.cues.map((_, i) => transOf(t, i) || '')));
          dl.textContent = 'Tải .srt song ngữ'; dl.disabled = false;
        },
      },
    }, 'Tải .srt song ngữ');
    const hint = IS_YT ? 'YouTube: phụ đề tự bật. Nếu chưa thấy, bấm nút CC trên trình phát một lần.'
      : /netflix/.test(HOST) ? 'Netflix: bật phụ đề tiếng Anh trong menu phụ đề của Netflix.'
        : 'Bật phụ đề tiếng Anh trong trình phát của trang. Chỉ có phụ đề tiếng Việt: tiện ích tự dịch ngược sang tiếng Anh (dịch máy, có thể khác lời thoại). Muốn đúng lời thoại: mở file .srt tiếng Anh tải từ nơi khác.';
    panel = el('div', { class: 'panel' },
      el('button', { class: 'x', title: 'Đóng', on: { click: closePanel } }, '×'),
      el('h3', {}, 'Phụ đề song ngữ'),
      el('div', { class: 'sec' }, el('div', { class: 'lbl' }, 'Phụ đề gốc'), srcs.length ? srcs : el('div', { class: 'hint' }, 'Chưa thấy phụ đề nào trên video này.')),
      transOpts.length ? el('div', { class: 'sec' }, el('div', { class: 'lbl' }, 'Dòng dịch'), transOpts) : null,
      el('div', { class: 'sec row' }, el('button', { class: 'b p', on: { click: openFile } }, 'Mở file .srt/.vtt…'), dl),
      t ? el('div', { class: 'sec' }, el('div', { class: 'lbl' }, 'Lệch giờ'), el('div', { class: 'row' },
        el('button', { class: 'b', on: { click: () => shift(-0.5) } }, '−0.5'), offLbl, el('button', { class: 'b', on: { click: () => shift(0.5) } }, '+0.5'))) : null,
      el('div', { class: 'hint' }, hint),
      t && !NO_SEEK ? el('div', { class: 'hint' }, 'Phím tắt: A câu trước · S nghe lại câu · D câu sau.') : null);
    wrap.append(panel);
  }

  // ---------- Phím tắt ----------
  document.addEventListener('keydown', (e) => {
    if (!cfg.enabled || !video || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || NO_SEEK) return;
    const tg = e.composedPath()[0];
    if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
    const t = mainTrack();
    if (!t) return;
    const k = e.key.toLowerCase();
    if (!['a', 's', 'd'].includes(k)) return;
    const now = video.currentTime + offset;
    let i = B.at(t.cues, now);
    if (i < 0) i = B.before(t.cues, now);
    let to;
    if (k === 's') to = t.cues[Math.max(0, i)];
    else if (k === 'd') to = t.cues[i + 1];
    else to = t.cues[i >= 0 && now - t.cues[i].s > 1.2 ? i : i - 1];
    if (!to) return;
    e.preventDefault(); e.stopImmediatePropagation();
    video.currentTime = Math.max(0, to.s - offset + 0.01);
    if (video.paused) video.play().catch(() => {});
  }, true);

  // ---------- Cài đặt ----------
  chrome.storage.sync.get(DEF, (v) => { cfg = { ...DEF, ...v }; lastRect = ''; tick(); });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'sync') return;
    const oldTl = cfg.tl;
    for (const k of Object.keys(ch)) cfg[k] = ch[k].newValue;
    if (cfg.tl !== oldTl) { tracks.forEach((t) => { t.tr = []; }); domCache.clear(); domTrans = ''; pick(); }
    lastRect = '';
    if (!cfg.enabled) stop(); else { tick(); render(true); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeBubble(); closePanel(); } });
  document.addEventListener('fullscreenchange', () => { lastRect = ''; });
  // YouTube chuyển video không tải lại trang.
  window.addEventListener('yt-navigate-finish', () => { picked = false; offset = 0; domText = ''; pick(); });
})();
