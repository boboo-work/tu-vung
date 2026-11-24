// Service worker của extension: dịch câu, tra từ, lưu từ.
// Chỉ chữ của phụ đề / từ đang tra được gửi tới dịch vụ dịch. Không gửi địa chỉ trang hay dữ liệu nào khác.
const GT = 'https://translate.googleapis.com/translate_a/single';
const MM = 'https://api.mymemory.translated.net/get';
const DICT = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const cache = new Map(); // `${tl}|${text}` → bản dịch

async function getJSON(url, opts = {}, timeout = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function google(text, tl, extra = '') {
  // dt=t: bản dịch; dt khác thêm khi tra từ. Đoạn dài gửi bằng POST (URL có giới hạn độ dài), lỗi thì thử lại bằng GET.
  const base = `${GT}?client=gtx&sl=auto&tl=${encodeURIComponent(tl)}&dt=t${extra}`;
  const get = () => getJSON(`${base}&q=${encodeURIComponent(text)}`);
  if (text.length < 1500) return get();
  try {
    return await getJSON(base, { method: 'POST', body: new URLSearchParams({ q: text }), headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
  } catch (e) {
    if (text.length < 2500) return get();
    throw e;
  }
}
const joined = (d) => (d?.[0] || []).map((x) => x?.[0] || '').join('');

async function myMemory(text, tl) {
  const d = await getJSON(`${MM}?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${tl === 'en' ? 'vi|en' : `en|${tl}`}`);
  return String(d?.responseData?.translatedText || '');
}

// Dịch nhiều dòng một lần: nối bằng xuống dòng, Google giữ nguyên số dòng trong hầu hết trường hợp.
async function translateLines(lines, tl) {
  const out = new Array(lines.length).fill(null);
  const todo = [];
  lines.forEach((l, i) => {
    const k = `${tl}|${l}`;
    if (cache.has(k)) out[i] = cache.get(k);
    else todo.push(i);
  });
  // Mỗi dòng của phụ đề có thể có xuống dòng bên trong → thay bằng dấu cách trước khi nối.
  const flat = (i) => lines[i].replace(/\s*\n\s*/g, ' ');
  const chunks = [];
  let cur = [], len = 0;
  for (const i of todo) {
    const n = flat(i).length + 1;
    if (cur.length && (len + n > 3500 || cur.length >= 60)) { chunks.push(cur); cur = []; len = 0; }
    cur.push(i); len += n;
  }
  if (cur.length) chunks.push(cur);
  for (const ch of chunks) {
    let parts = null;
    try {
      const res = joined(await google(ch.map(flat).join('\n'), tl)).split('\n');
      if (res.length === ch.length) parts = res;
    } catch { /* thử cách khác bên dưới */ }
    if (!parts) {
      // Số dòng lệch (hoặc lỗi) → dịch từng dòng, chạy song song vài dòng một lúc.
      parts = [];
      for (let j = 0; j < ch.length; j += 6) {
        const got = await Promise.all(ch.slice(j, j + 6).map(async (i) => {
          try { return joined(await google(flat(i), tl)); } catch { /* sang nguồn dự phòng */ }
          try { return await myMemory(flat(i), tl); } catch { return null; }
        }));
        parts.push(...got);
      }
    }
    ch.forEach((i, j) => {
      const t = parts[j] != null ? parts[j].trim() : null;
      out[i] = t;
      if (t) cache.set(`${tl}|${lines[i]}`, t);
    });
  }
  if (cache.size > 5000) [...cache.keys()].slice(0, 2000).forEach((k) => cache.delete(k));
  return out;
}

// Tra một từ: nghĩa theo từ loại (Google), IPA và định nghĩa tiếng Anh (Wiktionary).
async function lookup(word, tl) {
  const [g, d] = await Promise.allSettled([
    google(word, tl, '&dt=bd&dt=md'),
    getJSON(DICT + encodeURIComponent(word.toLowerCase()), {}, 6000),
  ]);
  const out = { word, meaning: '', senses: [], ipa: '', definition: '', pos: '' };
  if (g.status === 'fulfilled') {
    const v = g.value;
    out.meaning = joined(v);
    out.senses = (v?.[1] || []).map((x) => ({ pos: x[0], terms: (x[1] || []).slice(0, 6) })).slice(0, 4);
    // dt=md: định nghĩa tiếng Anh nằm ở v[12] = [[từ loại, [[định nghĩa, mã, ví dụ?], …]], …]
    const md = v?.[12]?.[0]?.[1]?.[0];
    if (Array.isArray(md) && typeof md[0] === 'string') out.definition = md[0];
  }
  if (d.status === 'fulfilled' && Array.isArray(d.value)) {
    const e = d.value;
    const ph = e.flatMap((x) => x.phonetics || []).filter((p) => p.text);
    out.ipa = (ph.find((p) => /-us\./.test(p.audio || '')) || ph[0])?.text || e.find((x) => x.phonetic)?.phonetic || '';
    const m = e[0]?.meanings?.[0];
    if (m) {
      out.pos = out.pos || m.partOfSpeech || '';
      out.definition = out.definition || m.definitions?.[0]?.definition || '';
    }
  }
  if (!out.pos && out.senses[0]) out.pos = out.senses[0].pos;
  if (!out.meaning && !out.senses.length) {
    try { out.meaning = await myMemory(word, tl); } catch { /* không có mạng */ }
  }
  return out;
}

async function saveWord(item) {
  const { words = [] } = await chrome.storage.local.get('words');
  const k = item.word.trim().toLowerCase();
  const old = words.find((w) => w.word.trim().toLowerCase() === k);
  if (old) {
    // Đã có: thêm câu ví dụ mới (nếu khác) thay vì tạo bản trùng.
    if (item.example && !old.examples.includes(item.example)) { old.examples.push(item.example); old.exTrans.push(item.exTrans || ''); }
    if (!old.meaning && item.meaning) old.meaning = item.meaning;
  } else {
    words.unshift({ ...item, examples: item.example ? [item.example] : [], exTrans: [item.exTrans || ''], at: Date.now() });
  }
  await chrome.storage.local.set({ words });
  updateBadge(words.length);
  return { count: words.length, existed: !!old };
}

function updateBadge(n) {
  chrome.action.setBadgeText({ text: n ? String(n > 999 ? '999+' : n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#6C4DF6' });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const run = async () => {
    if (msg.type === 'translate') return translateLines(msg.lines || [], msg.tl || 'vi');
    if (msg.type === 'lookup') return lookup(msg.word, msg.tl || 'vi');
    if (msg.type === 'save') return saveWord(msg.item);
    return null;
  };
  run().then((v) => reply({ ok: true, v }), (e) => reply({ ok: false, error: String(e?.message || e) }));
  return true; // trả lời bất đồng bộ
});

chrome.runtime.onInstalled.addListener(async () => {
  const { words = [] } = await chrome.storage.local.get('words');
  updateBadge(words.length);
});
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.words) updateBadge((ch.words.newValue || []).length);
});
