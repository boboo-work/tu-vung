// Tiện ích dùng chung: escape, ngày tháng, phát âm, CSV, XLSX, tải file.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- Ngày (chuỗi YYYY-MM-DD theo giờ địa phương) ----
const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dateStr(new Date());
export const parseDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
};
export const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export const fmtDate = (s) => {
  if (!s) return '—';
  const d = parseDate(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const relDay = (s) => {
  const n = dayDiff(today(), s);
  if (n === 0) return 'hôm nay';
  if (n === 1) return 'ngày mai';
  if (n === -1) return 'hôm qua';
  if (n < 0) return `quá hạn ${-n} ngày`;
  return `sau ${n} ngày`;
};
export const fmtInterval = (n) => {
  if (n <= 0) return 'hôm nay';
  if (n < 30) return `${n} ngày`;
  if (n < 365) return `${Math.round(n / 30)} tháng`;
  return `${(n / 365).toFixed(1)} năm`;
};

// ---- Mảng ----
export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Chuẩn hoá để so sánh đáp án: bỏ hoa/thường, dấu câu thừa, khoảng trắng thừa.
export const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"“”()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const splitList = (s, sep = /\n/) =>
  String(s ?? '')
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

// ---- Toast ----
let toastTimer;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

// ---- Phát âm (Web Speech API, chạy offline trên iOS) ----
export const canSpeak = () => 'speechSynthesis' in window;
let voices = [];
const voiceListeners = [];
export const onVoices = (fn) => voiceListeners.push(fn);
if (canSpeak()) {
  const load = () => { voices = speechSynthesis.getVoices(); voiceListeners.forEach((fn) => fn()); };
  voices = speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}
// Giọng tự nhiên của Apple/Google. iOS còn liệt kê nhiều giọng "robot" (Eloquence, giọng vui) dưới cùng mã en-US —
// chọn nhầm các giọng đó là nguyên nhân tiếng đọc bị khựng, máy móc.
const GOOD = ['samantha', 'ava', 'allison', 'evan', 'nathan', 'susan', 'zoe', 'tom', 'joelle', 'noelle', 'nicky', 'aaron', 'alex',
  'daniel', 'kate', 'serena', 'oliver', 'stephanie', 'jamie', 'arthur', 'martha', 'google us english', 'google uk english'];
const ROBOT = ['eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley', 'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles',
  'cellos', 'good news', 'jester', 'organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'junior', 'ralph', 'fred', 'kathy', 'deranged', 'hysterical', 'pipe organ'];
function voiceScore(v) {
  const n = (v.name || '').toLowerCase(), uri = (v.voiceURI || '').toLowerCase();
  let s = 0;
  if (ROBOT.some((r) => n.startsWith(r))) s -= 20;
  if (GOOD.some((g) => n.startsWith(g))) s += 5;
  if (n.includes('premium') || uri.includes('premium')) s += 4;
  else if (n.includes('enhanced') || uri.includes('enhanced')) s += 3;
  if (n.includes('siri')) s += 3;
  if (uri.includes('compact')) s -= 1;
  if (v.localService) s += 1; // chạy được khi offline
  return s;
}
const sameLang = (v, lang) => (v.lang || '').replace('_', '-').toLowerCase() === lang.toLowerCase();
/** Các giọng tiếng Anh đúng chất giọng đã chọn, tốt nhất đứng đầu. */
export function englishVoices(lang = 'en-US') {
  let list = voices.filter((v) => sameLang(v, lang));
  if (!list.length) list = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('en'));
  const natural = list.filter((v) => voiceScore(v) > -10); // ẩn các giọng robot nếu máy có giọng tự nhiên
  return (natural.length ? natural : list).slice().sort((a, b) => voiceScore(b) - voiceScore(a));
}
export function speak(text, { lang = 'en-US', rate = 0.95, name = '' } = {}) {
  if (!canSpeak()) {
    toast('Thiết bị này không hỗ trợ phát âm');
    return false;
  }
  if (!text) return false;
  if (!voices.length) voices = speechSynthesis.getVoices();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = rate;
  const list = englishVoices(lang);
  const v = (name && list.find((x) => x.name === name)) || list[0];
  if (v) { u.voice = v; u.lang = v.lang.replace('_', '-'); }
  // Trên iOS, gọi cancel() rồi speak() ngay lập tức làm tiếng bị cắt/giật → chỉ cancel khi đang đọc, và chờ một nhịp.
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    setTimeout(() => speechSynthesis.speak(u), 80);
  } else speechSynthesis.speak(u);
  return true;
}

// ---- Tải file ----
// Bỏ dấu tiếng Việt để tìm kiếm ("kien cuong" khớp "kiên cường").
export const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** Lưu file. Trả về false nếu người dùng huỷ. Trên iPhone dùng bảng Chia sẻ ("Lưu vào Tệp") vì app cài ở màn hình chính không tải file trực tiếp được. */
export async function download(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  if (isIOS() && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mime.split(';')[0] });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    // iOS Safari chỉ báo sự kiện "change" ổn định khi thẻ input nằm trong trang.
    input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(input);
    const done = (f) => { input.remove(); resolve(f); };
    input.onchange = () => done(input.files[0] || null);
    input.oncancel = () => done(null);
    input.click();
  });
}

// ---- CSV ----
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  // Tự nhận diện dấu phân cách (Excel tiếng Việt hay xuất bằng ';').
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => firstLine.split(ch).length;
  const sep = count(';') > count(',') && count(';') >= count('\t') ? ';' : count('\t') > count(',') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

export function toCSV(rows) {
  const q = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
}

// ---- XLSX (đọc tối giản, không cần thư viện): giải nén zip + đọc sheet đầu tiên ----
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('File không phải định dạng .xlsx hợp lệ');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    files[name] = { method, csize, off };
    p += 46 + nlen + elen + clen;
  }
  return {
    names: Object.keys(files),
    async text(name) {
      const f = files[name];
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const raw = u8.subarray(start, start + f.csize);
      const data = f.method === 0 ? raw : await inflate(raw);
      return dec.decode(data);
    },
  };
}

export async function readXlsx(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt này chưa hỗ trợ đọc .xlsx — hãy lưu file thành CSV rồi import.');
  const zip = await unzip(buf);
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const shared = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) {
    for (const si of xml(ss).getElementsByTagName('si')) {
      let t = '';
      for (const el of si.getElementsByTagName('t')) {
        if (el.parentNode.nodeName === 'rPh') continue;
        t += el.textContent;
      }
      shared.push(t);
    }
  }
  const sheetName = zip.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  if (!sheetName) throw new Error('Không tìm thấy sheet nào trong file');
  const doc = xml(await zip.text(sheetName));
  const rows = [];
  for (const r of doc.getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') || '';
      let col = 0;
      for (const ch of ref.replace(/\d+/g, '')) col = col * 26 + (ch.charCodeAt(0) - 64);
      col = col ? col - 1 : row.length;
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let val = v;
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map((x) => x.textContent).join('');
      row[col] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ''));
  }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}
