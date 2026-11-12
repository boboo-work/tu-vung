// Tra cứu tự động để điền form thêm từ (nút "Tự điền").
//  - Từ điển miễn phí: dictionaryapi.dev (dữ liệu từ Wiktionary, giấy phép CC BY-SA). Không cần key.
//    Cho IPA (không phải từ nào cũng có), loại từ, các nghĩa tiếng Anh, vài câu ví dụ, đồng/trái nghĩa.
//    Chỉ tiếng Anh; nghĩa đầu tiên không phải lúc nào cũng là nghĩa phổ biến nhất → khi không có AI, người dùng chọn nghĩa.
//  - Trợ lý AI (nếu đã kết nối ở Cài đặt): nghĩa tiếng Việt, ví dụ, collocations, word family, lỗi thường gặp,
//    và chọn đúng nghĩa dựa vào nghĩa tiếng Việt người dùng đã gõ (nếu có).
// Chỉ từ đang tra được gửi đi; không gửi dữ liệu nào khác của người dùng.
import { aiReady, askAI } from './ai.js';

const DICT_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
export const POS_LIST = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'phrasal verb', 'idiom', 'collocation', 'preposition', 'conjunction'];
export class LookupError extends Error {}

const clean = (s, n = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const list = (v, n = 8) => [...new Set((Array.isArray(v) ? v : []).map((x) => clean(x, 160)).filter(Boolean))].slice(0, n);
// Dữ liệu Wiktionary dùng "ɹ"; app dùng "r" như các từ mẫu.
function ipaNorm(s) {
  const t = clean(s, 80).replace(/ɹ/g, 'r');
  if (!t) return '';
  return /^[/[].*[/\]]$/.test(t) ? t : `/${t}/`;
}

// ---- Từ điển ----
const cache = new Map(); // tra lại cùng một từ trong phiên thì không gọi lại
export async function fetchDictionary(word) {
  // Dịch vụ miễn phí này hay trả lỗi tạm thời (khoảng 3/10 lượt khi kiểm thử: 500/502, trình duyệt báo là lỗi CORS
  // vì trang lỗi không có header cho phép). Mỗi lượt thử lại độc lập nên thử tối đa 4 lần, cách nhau tăng dần.
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  // Có lượt gọi bị treo hàng chục giây → mỗi lần chỉ chờ tối đa 6 giây, và tổng thời gian chờ không quá ~14 giây.
  let res = null;
  const t0 = Date.now();
  for (let attempt = 0; attempt < 4 && (!attempt || Date.now() - t0 < 8000); attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 500 * attempt));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try { res = await fetch(DICT_URL + encodeURIComponent(key), { signal: ctl.signal }); } catch { res = null; continue; } finally { clearTimeout(timer); }
    if (res.status < 500 && res.status !== 429) break;
  }
  if (!res) throw new LookupError('Không kết nối được tới từ điển. Hãy thử lại sau vài giây.');
  if (res.status === 404) return null;
  if (!res.ok) throw new LookupError(`Từ điển đang bận (lỗi ${res.status}). Hãy thử lại sau vài giây.`);
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data) || !data.length) return null;
  // IPA: ưu tiên bản có giọng Mỹ, rồi bản đầu tiên có chữ.
  const phon = data.flatMap((e) => e.phonetics || []).filter((p) => clean(p?.text));
  const us = phon.find((p) => /-us\./.test(p.audio || ''));
  const ipa = ipaNorm((us || phon[0])?.text || data.find((e) => clean(e.phonetic))?.phonetic || '');
  // Các nghĩa: mỗi nghĩa mang theo loại từ, ví dụ, đồng/trái nghĩa (cả mức nghĩa lẫn mức nhóm từ loại).
  const senses = [];
  const seen = new Set();
  for (const e of data) for (const m of e.meanings || []) for (const d of m.definitions || []) {
    const definition = clean(d.definition);
    if (!definition || seen.has(definition)) continue;
    seen.add(definition);
    senses.push({
      pos: clean(m.partOfSpeech, 30).toLowerCase(), definition, example: clean(d.example),
      synonyms: list([...(d.synonyms || []), ...(m.synonyms || [])], 6), antonyms: list([...(d.antonyms || []), ...(m.antonyms || [])], 6),
      group: senses.filter((s) => s.pos === clean(m.partOfSpeech, 30).toLowerCase()).length,
    });
  }
  const out = { ipa, senses: senses.slice(0, 6) };
  cache.set(key, out);
  return out;
}

// ---- Trợ lý AI ----
const AI_SYSTEM = 'Bạn là từ điển Anh–Việt chính xác cho người Việt luyện IELTS. Chỉ trả về MỘT đối tượng JSON hợp lệ, không giải thích, không dùng markdown.';
function aiPrompt(word, meaning) {
  return `Từ/cụm từ tiếng Anh: "${word}".${meaning ? ` Người học đã ghi nghĩa tiếng Việt: "${meaning}" — hãy chọn đúng nghĩa này.` : ''}
Trả về JSON với các khóa sau:
{"pos": một trong [${POS_LIST.join(', ')}],
 "ipa": "phiên âm IPA Anh-Mỹ, đặt trong dấu / /",
 "meaning": "nghĩa tiếng Việt ngắn gọn (tối đa 12 từ)",
 "definition": "định nghĩa tiếng Anh đơn giản, một câu",
 "examples": ["3 câu ví dụ tự nhiên, đa dạng ngữ cảnh"],
 "collocations": ["4-6 collocation thông dụng"],
 "synonyms": ["3-5 từ đồng nghĩa"], "antonyms": ["0-3 từ trái nghĩa"],
 "family": ["các dạng từ liên quan, ví dụ: significance (n)"],
 "mistakes": "một lỗi người Việt hay mắc với từ này, ngắn gọn; để rỗng nếu không có"}
Mục nào không chắc thì để rỗng ("" hoặc []) thay vì đoán.`;
}
export async function askWordInfo(ai, word, meaning) {
  const text = await askAI(ai, aiPrompt(word, meaning), { system: AI_SYSTEM });
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let o;
  try { o = JSON.parse(text.slice(a, b + 1)); } catch { throw new LookupError('AI trả về dữ liệu không đúng định dạng. Hãy thử lại.'); }
  if (!o || typeof o !== 'object') throw new LookupError('AI trả về dữ liệu không đúng định dạng. Hãy thử lại.');
  const pos = clean(o.pos, 30).toLowerCase();
  return {
    pos: POS_LIST.includes(pos) ? pos : '', ipa: ipaNorm(o.ipa), meaning: clean(o.meaning, 200), definition: clean(o.definition),
    examples: list(o.examples, 3), collocations: list(o.collocations, 6), synonyms: list(o.synonyms, 6), antonyms: list(o.antonyms, 4),
    family: list(o.family, 6), mistakes: clean(o.mistakes, 300),
  };
}

// ---- Nguồn miễn phí bổ sung (dùng khi không có AI, hoặc AI lỗi) ----
//  - MyMemory (api.mymemory.translated.net): nghĩa tiếng Việt. Không cần key, hạn mức ngày, chất lượng khá với từ thông dụng.
//  - Datamuse (api.datamuse.com): đồng/trái nghĩa và các từ hay đi liền nhau (dùng làm gợi ý collocation theo thống kê).
//    Không dùng IPA của Datamuse: dấu nhấn âm bị đặt sai chỗ (ví dụ rɪzˈɪɫjʌnt thay vì /rɪˈzɪliənt/) nên dễ dạy sai.
const MM_URL = 'https://api.mymemory.translated.net/get';
const DM_URL = 'https://api.datamuse.com/words';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJSON(url, { tries = 2, timeout = 6000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(600);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (res.ok) return await res.json();
      last = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { last = e; } finally { clearTimeout(timer); }
  }
  throw last || new Error('Không kết nối được');
}
const sameText = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();

export async function fetchTranslation(word) {
  const d = await getJSON(`${MM_URL}?q=${encodeURIComponent(word)}&langpair=en|vi`);
  const fix = (t) => (word === word.toLowerCase() ? clean(t, 80).toLowerCase() : clean(t, 80));
  const main = clean(d?.responseData?.translatedText, 80);
  // Hết hạn mức ngày hoặc không dịch được (trả lại nguyên từ gốc) → coi như không có.
  if (!main || /MYMEMORY|WARNING|INVALID/i.test(main) || sameText(main, word)) return '';
  const out = [fix(main)];
  // Thêm một nghĩa phụ nếu rất sát và gọn (nhiều mục phía dưới của MyMemory là rác nên lọc chặt).
  const alt = (d.matches || [])
    .filter((m) => sameText(m.segment, word) && Number(m.match) >= 0.99)
    .map((m) => clean(m.translation, 80))
    .find((t) => /^[\p{L} ]+$/u.test(t) && t.split(' ').length <= 4 && !out.some((o) => sameText(o, t)));
  if (alt) out.push(fix(alt));
  return out.join('; ');
}

const STOP = new Set(('a an the of and or to in on at for with by from as is are was were be been being it its this that these those not no nor but if than then so such very more most much many ' +
  'other another each every all any some can could may might will would shall should do does did has have had which who whom whose what when where why how there here you he she we they me him her us them my your his our their one two out up').split(' '));
export async function fetchHints(word) {
  // Chỉ có ý nghĩa với từ đơn; cụm nhiều chữ thì bỏ qua.
  if (/\s/.test(word)) return { synonyms: [], antonyms: [], collocations: [], failed: 0 };
  const w = encodeURIComponent(word.toLowerCase());
  const q = (rel, max) => getJSON(`${DM_URL}?${rel}=${w}&max=${max}`);
  const [syn, ant, aft, bef] = await Promise.allSettled([q('rel_syn', 10), q('rel_ant', 6), q('rel_bga', 16), q('rel_bgb', 16)]);
  const words = (r, n) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []).map((x) => x.word).filter((x) => /^[a-z]{3,}$/.test(x) && !STOP.has(x) && x !== word.toLowerCase()).slice(0, n);
  const after = words(aft, 3).map((x) => `${word} ${x}`);
  const before = words(bef, 3).map((x) => `${x} ${word}`);
  const collocations = [];
  for (let i = 0; i < 3; i++) { if (before[i]) collocations.push(before[i]); if (after[i]) collocations.push(after[i]); }
  return { synonyms: words(syn, 5), antonyms: words(ant, 3), collocations, failed: [syn, ant, aft, bef].filter((r) => r.status === 'rejected').length };
}

// `have` = các ô đã có dữ liệu → không cần gọi nguồn tương ứng (đỡ tốn hạn mức).
async function fetchExtras(word, have = {}) {
  const needHints = !(have.synonyms && have.antonyms && have.collocations);
  const [t, h] = await Promise.allSettled([have.meaning ? Promise.resolve('') : fetchTranslation(word), needHints ? fetchHints(word) : Promise.resolve(null)]);
  return {
    meaning: t.status === 'fulfilled' ? t.value : '', meaningFailed: t.status === 'rejected',
    hints: h.status === 'fulfilled' ? h.value : null, hintsFailed: h.status === 'rejected' || (h.status === 'fulfilled' && h.value?.failed >= 3),
  };
}

// ---- Gọi các nguồn song song; lỗi của một nguồn không làm mất kết quả của nguồn khác ----
export async function lookupWord(word, { meaning = '', ai, have = {} } = {}) {
  const useAI = aiReady(ai);
  const [d, a, x] = await Promise.allSettled([fetchDictionary(word), useAI ? askWordInfo(ai, word, meaning) : Promise.resolve(null), useAI ? Promise.resolve(null) : fetchExtras(word, have)]);
  let web = x.status === 'fulfilled' ? x.value : null;
  // AI đã kết nối mà lỗi → dùng nguồn miễn phí thay thế.
  if (useAI && a.status === 'rejected') web = await fetchExtras(word, have).catch(() => null);
  return {
    useAI,
    dict: d.status === 'fulfilled' ? d.value : null, dictError: d.status === 'rejected' ? d.reason?.message || 'Lỗi từ điển.' : '',
    ai: a.status === 'fulfilled' ? a.value : null, aiError: a.status === 'rejected' ? a.reason?.message || 'Lỗi AI.' : '',
    web,
  };
}

// Ghép kết quả thành các ô của form. `senseIdx` = nghĩa từ điển đã chọn (khi không có AI).
// Trả về { fields, from } — from[field] = 'dict' | 'ai' | 'tr' (dịch miễn phí) | 'dm' (gợi ý thống kê). Chỉ có khóa cho ô thực sự có dữ liệu.
// `pickSense: false` = chưa chọn nghĩa (từ nhiều nghĩa, không có AI) → chưa điền các ô phụ thuộc vào nghĩa.
export function buildFill(r, senseIdx = 0, { pickSense = true } = {}) {
  const fields = {}, from = {};
  const put = (k, v, src) => { if (Array.isArray(v) ? v.length : v) { fields[k] = v; from[k] = src; } };
  const sense = pickSense ? (r.dict?.senses?.[senseIdx] || r.dict?.senses?.[0] || null) : null;
  const sameGroup = sense ? r.dict.senses.filter((s) => s.pos === sense.pos) : [];
  const dictExamples = list(sameGroup.map((s) => s.example), 3);
  const hints = r.web?.hints;
  put('ipa', r.dict?.ipa || r.ai?.ipa, r.dict?.ipa ? 'dict' : 'ai');
  if (r.ai) {
    put('pos', r.ai.pos || sense?.pos, r.ai.pos ? 'ai' : 'dict');
    put('meaning', r.ai.meaning || r.web?.meaning, r.ai.meaning ? 'ai' : 'tr');
    put('definition', r.ai.definition || sense?.definition, r.ai.definition ? 'ai' : 'dict');
    put('examples', r.ai.examples.length ? r.ai.examples : dictExamples, r.ai.examples.length ? 'ai' : 'dict');
    put('collocations', r.ai.collocations.length ? r.ai.collocations : hints?.collocations, r.ai.collocations.length ? 'ai' : 'dm');
    put('synonyms', r.ai.synonyms.length ? r.ai.synonyms : sense?.synonyms?.length ? sense.synonyms : hints?.synonyms, r.ai.synonyms.length ? 'ai' : sense?.synonyms?.length ? 'dict' : 'dm');
    put('antonyms', r.ai.antonyms.length ? r.ai.antonyms : sense?.antonyms?.length ? sense.antonyms : hints?.antonyms, r.ai.antonyms.length ? 'ai' : sense?.antonyms?.length ? 'dict' : 'dm');
    put('family', r.ai.family, 'ai');
    put('mistakes', r.ai.mistakes, 'ai');
  } else {
    put('meaning', r.web?.meaning, 'tr');
    if (sense) {
      put('pos', sense.pos, 'dict');
      put('definition', sense.definition, 'dict');
      put('examples', dictExamples, 'dict');
    }
    put('collocations', hints?.collocations, 'dm');
    put('synonyms', sense?.synonyms?.length ? sense.synonyms : hints?.synonyms, sense?.synonyms?.length ? 'dict' : 'dm');
    put('antonyms', sense?.antonyms?.length ? sense.antonyms : hints?.antonyms, sense?.antonyms?.length ? 'dict' : 'dm');
  }
  return { fields, from };
}
