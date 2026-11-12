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

// ---- Gọi cả hai nguồn song song; lỗi của một nguồn không làm mất kết quả của nguồn kia ----
export async function lookupWord(word, { meaning = '', ai } = {}) {
  const useAI = aiReady(ai);
  const [d, a] = await Promise.allSettled([fetchDictionary(word), useAI ? askWordInfo(ai, word, meaning) : Promise.resolve(null)]);
  return {
    useAI,
    dict: d.status === 'fulfilled' ? d.value : null, dictError: d.status === 'rejected' ? d.reason?.message || 'Lỗi từ điển.' : '',
    ai: a.status === 'fulfilled' ? a.value : null, aiError: a.status === 'rejected' ? a.reason?.message || 'Lỗi AI.' : '',
  };
}

// Ghép kết quả thành các ô của form. `senseIdx` = nghĩa từ điển đã chọn (khi không có AI).
// Trả về { fields, from } — from[field] = 'dict' | 'ai'. Chỉ có khóa cho ô thực sự có dữ liệu.
export function buildFill(r, senseIdx = 0) {
  const fields = {}, from = {};
  const put = (k, v, src) => { if (Array.isArray(v) ? v.length : v) { fields[k] = v; from[k] = src; } };
  const sense = r.dict?.senses?.[senseIdx] || r.dict?.senses?.[0] || null;
  const sameGroup = sense ? r.dict.senses.filter((s) => s.pos === sense.pos) : [];
  const dictExamples = list(sameGroup.map((s) => s.example), 3);
  put('ipa', r.dict?.ipa || r.ai?.ipa, r.dict?.ipa ? 'dict' : 'ai');
  if (r.ai) {
    put('pos', r.ai.pos || sense?.pos, r.ai.pos ? 'ai' : 'dict');
    put('meaning', r.ai.meaning, 'ai');
    put('definition', r.ai.definition || sense?.definition, r.ai.definition ? 'ai' : 'dict');
    put('examples', r.ai.examples.length ? r.ai.examples : dictExamples, r.ai.examples.length ? 'ai' : 'dict');
    put('collocations', r.ai.collocations, 'ai');
    put('synonyms', r.ai.synonyms.length ? r.ai.synonyms : sense?.synonyms, r.ai.synonyms.length ? 'ai' : 'dict');
    put('antonyms', r.ai.antonyms.length ? r.ai.antonyms : sense?.antonyms, r.ai.antonyms.length ? 'ai' : 'dict');
    put('family', r.ai.family, 'ai');
    put('mistakes', r.ai.mistakes, 'ai');
  } else if (sense) {
    put('pos', sense.pos, 'dict');
    put('definition', sense.definition, 'dict');
    put('examples', dictExamples, 'dict');
    put('synonyms', sense.synonyms, 'dict');
    put('antonyms', sense.antonyms, 'dict');
  }
  return { fields, from };
}
