// Lớp dữ liệu: IndexedDB (bền vững) + bản sao trong bộ nhớ (đọc nhanh).
// Mọi thay đổi đều được ghi xuống IndexedDB ngay lập tức.
import { uid, today, addDays, dayDiff, parseDate, dateStr } from './util.js';
import { newSrs, schedule, isNew, isDue, isMastered } from './srs.js';

const DB_NAME = 'vocab-app';
const DB_VERSION = 3; // v2: kho 'grammar' (tiến độ bài, thẻ mẫu câu, sổ lỗi) · v3: kho 'writing' (bài viết, bản nháp)
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('words')) d.createObjectStore('words', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('decks')) d.createObjectStore('decks', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('days')) d.createObjectStore('days', { keyPath: 'date' });
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('grammar')) d.createObjectStore('grammar', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('writing')) d.createObjectStore('writing', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Cơ sở dữ liệu đang bị khoá bởi một tab khác'));
  });
}

function tx(stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(failure || t.error || new Error('Giao dịch bị huỷ'));
    let failure = null;
    // Lỗi giữa chừng → huỷ cả giao dịch, không để dữ liệu ghi dở.
    try { result = fn(t); } catch (e) { failure = e; try { t.abort(); } catch {} }
  });
}
const getAll = (store) =>
  new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const put = (store, value) => tx([store], 'readwrite', (t) => void t.objectStore(store).put(value));
const del = (store, key) => tx([store], 'readwrite', (t) => void t.objectStore(store).delete(key));

// ---- Mặc định ----
export const DEFAULT_DECKS = [
  ['ielts-academic', 'IELTS Academic Vocabulary'],
  ['ielts-speaking', 'IELTS Speaking'],
  ['ielts-writing', 'IELTS Writing'],
  ['ielts-reading', 'IELTS Reading'],
  ['ielts-listening', 'IELTS Listening'],
  ['collocations', 'Collocations'],
  ['idioms-phrasal', 'Idioms & Phrasal Verbs'],
  ['daily-english', 'Daily English'],
  ['business-english', 'Business English'],
  ['custom', 'My Custom Vocabulary'],
];
export const FALLBACK_DECK = 'custom';

const DEFAULT_SETTINGS = {
  newPerDay: 10,
  reviewPerDay: 20,
  theme: 'auto', // auto | light | dark
  accent: 'green', // màu chủ đạo: green | blue | purple | teal | orange | pink
  voice: 'en-US', // en-US | en-GB
  rate: 0.95,
  grammarPerDay: 1, // số bài ngữ pháp mỗi ngày (0 = tắt mục tiêu)
  writingPerDay: 1, // số bài Writing mỗi ngày (0 = tắt mục tiêu)
  grammarCourse: '', // khoá ngữ pháp đang học ('' = tự chọn theo kiểm tra đầu vào / tiến độ)
  grammarReviewPerDay: 10, // số thẻ mẫu câu tối đa mỗi lượt ôn
  voiceName: '', // '' = tự chọn giọng tốt nhất trên máy
  autoSpeak: true, // tự phát âm khi lật thẻ sang mặt đáp án
  autoFill: true, // tự tra thông tin khi gõ xong từ mới ở form thêm từ
  // Mỗi cách kết nối giữ key/mô hình riêng để đổi qua lại không bị lẫn.
  ai: { provider: 'anthropic', apiKey: '', model: 'claude-opus-5-5', endpoint: '', geminiKey: '', geminiModel: 'gemini-2.5-flash', oaBase: '', oaKey: '', oaModel: '' },
  lastBackup: null,
};

export const S = {
  words: new Map(),
  decks: [],
  days: new Map(),
  writing: new Map(), // id → bài viết (kind: part | task1) hoặc bản nháp (kind: draft)
  grammar: new Map(), // id → bản ghi: L:<bài> tiến độ · C:<thẻ> lịch ôn · E:<nhãn lỗi> sổ lỗi · placement
  settings: structuredClone(DEFAULT_SETTINGS),
  game: null, // dữ liệu mini game (vòng chơi, thống kê, kỷ lục) — tách riêng, không tính vào tiến độ học
  persisted: false,
};

export async function init() {
  db = await openDB();
  const [words, decks, days, kv, grammar, writing] = await Promise.all([getAll('words'), getAll('decks'), getAll('days'), getAll('kv'), getAll('grammar'), getAll('writing')]);
  S.writing = new Map(writing.map((w) => [w.id, w]));
  S.grammar = new Map(grammar.map((g) => [g.id, g]));
  S.words = new Map(words.map((w) => [w.id, w]));
  S.days = new Map(days.map((d) => [d.date, d]));
  S.decks = decks.sort((a, b) => a.order - b.order);
  const saved = kv.find((x) => x.key === 'settings')?.value;
  if (saved) S.settings = { ...DEFAULT_SETTINGS, ...saved, ai: { ...DEFAULT_SETTINGS.ai, ...(saved.ai || {}) } };
  S.game = cleanGame(kv.find((x) => x.key === 'game')?.value);
  if (!S.decks.length) {
    S.decks = DEFAULT_DECKS.map(([id, name], i) => ({ id, name, builtin: true, order: i }));
    await tx(['decks'], 'readwrite', (t) => S.decks.forEach((d) => t.objectStore('decks').put(d)));
  }
  // Chủ đề dự phòng phải luôn tồn tại (nơi nhận từ khi xoá chủ đề / import không ghi chủ đề).
  if (!S.decks.some((d) => d.id === FALLBACK_DECK)) {
    const deck = { id: FALLBACK_DECK, name: 'My Custom Vocabulary', builtin: true, order: Math.max(-1, ...S.decks.map((d) => d.order)) + 1 };
    S.decks.push(deck);
    await put('decks', deck);
  }
  // Xin trình duyệt giữ dữ liệu bền vững (không tự xoá khi thiếu dung lượng).
  try {
    S.persisted = (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch { S.persisted = false; }
}

// ---- Cài đặt ----
export async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await put('kv', { key: 'settings', value: S.settings });
}

// ---- Từ vựng ----
export const WORD_FIELDS = ['word', 'ipa', 'pos', 'meaning', 'definition', 'examples', 'collocations', 'synonyms', 'antonyms', 'family', 'mistakes', 'deckId', 'difficulty', 'notes'];

export function blankWord(deckId = FALLBACK_DECK) {
  return {
    id: uid(), word: '', ipa: '', pos: '', meaning: '', definition: '',
    examples: [], collocations: [], synonyms: [], antonyms: [], family: [],
    mistakes: '', deckId, difficulty: 2, notes: '', favorite: false, sentences: [],
    createdAt: Date.now(), updatedAt: Date.now(), srs: newSrs(),
  };
}

export async function saveWord(w) {
  w.updatedAt = Date.now();
  S.words.set(w.id, w);
  await put('words', w);
  return w;
}
export async function deleteWord(id) {
  S.words.delete(id);
  await del('words', id);
}
export const findByText = (text, exceptId) => {
  const k = text.trim().toLowerCase();
  for (const w of S.words.values()) if (w.id !== exceptId && w.word.trim().toLowerCase() === k) return w;
  return null;
};
export const allWords = () => [...S.words.values()];
export const deckName = (id) => S.decks.find((d) => d.id === id)?.name || 'Chưa phân loại';

// ---- Chủ đề ----
export async function addDeck(name) {
  name = name.trim();
  if (!name) throw new Error('Tên chủ đề không được để trống');
  if (S.decks.some((d) => d.name.toLowerCase() === name.toLowerCase())) throw new Error('Chủ đề này đã tồn tại');
  const deck = { id: uid(), name, builtin: false, order: Math.max(-1, ...S.decks.map((d) => d.order)) + 1 };
  S.decks.push(deck);
  await put('decks', deck);
  return deck;
}
export async function renameDeck(id, name) {
  name = name.trim();
  if (!name) throw new Error('Tên chủ đề không được để trống');
  if (S.decks.some((d) => d.id !== id && d.name.toLowerCase() === name.toLowerCase())) throw new Error('Chủ đề này đã tồn tại');
  const deck = S.decks.find((d) => d.id === id);
  deck.name = name;
  await put('decks', deck);
}
export async function deleteDeck(id) {
  const deck = S.decks.find((d) => d.id === id);
  if (!deck || deck.builtin) throw new Error('Không thể xoá chủ đề mặc định');
  const moved = allWords().filter((w) => w.deckId === id);
  for (const w of moved) w.deckId = FALLBACK_DECK;
  await tx(['words', 'decks'], 'readwrite', (t) => {
    moved.forEach((w) => t.objectStore('words').put(w));
    t.objectStore('decks').delete(id);
  });
  S.decks = S.decks.filter((d) => d.id !== id);
  return moved.length;
}

// ---- Nhật ký theo ngày ----
const blankDay = (date) => ({ date, newIds: [], reviewIds: [], correct: 0, wrong: 0, gLessons: [], gReviews: [], wEssays: [] });
/** Ngày có học gì không (từ vựng hoặc ngữ pháp). */
export const dayActive = (x) => !!x && (x.newIds.length + x.reviewIds.length + x.correct + x.wrong + (x.gLessons?.length || 0) + (x.gReviews?.length || 0) + (x.wEssays?.length || 0)) > 0;

// ---- Writing ----
export async function wPut(...recs) {
  await tx(['writing'], 'readwrite', (t) => recs.forEach((r) => t.objectStore('writing').put(r)));
  recs.forEach((r) => S.writing.set(r.id, r));
}
export async function wDel(id) {
  S.writing.delete(id);
  await del('writing', id);
}
export const essays = () => [...S.writing.values()].filter((w) => w.kind !== 'draft');

// ---- Ngữ pháp ----
export async function gPut(...recs) {
  await tx(['grammar'], 'readwrite', (t) => recs.forEach((r) => t.objectStore('grammar').put(r)));
  recs.forEach((r) => S.grammar.set(r.id, r));
}
/** Ghi nhận hoạt động ngữ pháp vào nhật ký ngày (để tính chuỗi ngày và mục tiêu). kind: 'gLessons' | 'gReviews' */
export async function logGrammarDay(kind, id) {
  const t = today();
  const day = { ...blankDay(t), ...dayOf(t) };
  day[kind] = day[kind] || [];
  if (!day[kind].includes(id)) day[kind].push(id);
  S.days.set(t, day);
  await put('days', day);
  return day;
}
export const dayOf = (date = today()) => S.days.get(date) || blankDay(date);

/**
 * Ghi nhận một lần trả lời và cập nhật lịch ôn.
 * rating: again | hard | good | easy | known.   source: 'learn' | 'review' | 'practice'
 * - Từ mới chỉ "ra khỏi" trạng thái mới khi học bằng flashcard (source = learn).
 * - Từ đến hạn: mọi đánh giá đều cập nhật lịch.
 * - Từ chưa đến hạn: chỉ khi trả lời sai mới bị kéo về danh sách cần ôn (tránh "ôn sớm" làm phồng khoảng cách).
 */
export async function recordAnswer(wordId, rating, source) {
  const w = S.words.get(wordId);
  if (!w) return null;
  const t = today();
  const wasNew = isNew(w);
  const wasDue = isDue(w, t);
  const day = dayOf(t);
  if (rating === 'again') day.wrong += 1; else day.correct += 1;

  let changed = false;
  if (wasNew) {
    if (source === 'learn') { w.srs = schedule(w.srs, rating, t); changed = true; if (!day.newIds.includes(w.id)) day.newIds.push(w.id); }
  } else if (wasDue || rating === 'again') {
    w.srs = schedule(w.srs, rating, t); changed = true;
    if (wasDue && !day.reviewIds.includes(w.id) && !day.newIds.includes(w.id)) day.reviewIds.push(w.id);
  }
  S.days.set(t, day);
  await tx(['words', 'days'], 'readwrite', (x) => {
    if (changed) x.objectStore('words').put(w);
    x.objectStore('days').put(day);
  });
  return w;
}

export async function resetProgress(id) {
  const w = S.words.get(id);
  w.srs = newSrs();
  await saveWord(w);
}

// ---- Truy vấn cho việc học ----
export function dueWords(deckId) {
  const t = today();
  return allWords()
    .filter((w) => isDue(w, t) && (!deckId || w.deckId === deckId))
    .sort((a, b) => (a.srs.due < b.srs.due ? -1 : a.srs.due > b.srs.due ? 1 : a.srs.interval - b.srs.interval));
}
export function newWords(deckId) {
  return allWords()
    .filter((w) => isNew(w) && (!deckId || w.deckId === deckId))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function streak() {
  const active = (d) => dayActive(S.days.get(d));
  let d = today();
  if (!active(d)) d = addDays(d, -1); // hôm nay chưa học thì chuỗi vẫn giữ đến hết ngày
  let n = 0;
  while (active(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function summary() {
  const words = allWords();
  const learned = words.filter((w) => !isNew(w));
  const mastered = words.filter(isMastered);
  let correct = 0, wrong = 0, activeDays = 0;
  for (const d of S.days.values()) {
    correct += d.correct; wrong += d.wrong;
    if (dayActive(d)) activeDays++;
  }
  return {
    total: words.length,
    learned: learned.length,
    mastered: mastered.length,
    learning: learned.length - mastered.length,
    fresh: words.length - learned.length,
    due: dueWords().length,
    pctMastered: words.length ? Math.round((mastered.length / words.length) * 100) : 0,
    accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : null,
    answers: correct + wrong,
    activeDays,
    streak: streak(),
  };
}

// Chuỗi số liệu cho biểu đồ: theo ngày (14 ngày), tuần (8 tuần), tháng (6 tháng).
export function series(kind) {
  const t = today();
  const out = [];
  const sum = (from, to) => {
    let n = 0, r = 0;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const x = S.days.get(d);
      if (x) { n += x.newIds.length; r += x.reviewIds.length; }
    }
    return { n, r };
  };
  if (kind === 'day') {
    for (let i = 13; i >= 0; i--) {
      const d = addDays(t, -i);
      const dt = parseDate(d);
      out.push({ label: `${dt.getDate()}/${dt.getMonth() + 1}`, short: String(dt.getDate()), ...sum(d, d) });
    }
  } else if (kind === 'week') {
    const dow = (parseDate(t).getDay() + 6) % 7; // thứ Hai = 0
    const monday = addDays(t, -dow);
    for (let i = 7; i >= 0; i--) {
      const from = addDays(monday, -7 * i);
      const to = addDays(from, 6);
      const a = parseDate(from);
      out.push({ label: `Tuần từ ${a.getDate()}/${a.getMonth() + 1}`, short: `${a.getDate()}/${a.getMonth() + 1}`, ...sum(from, to > t ? t : to) });
    }
  } else {
    const now = parseDate(t);
    for (let i = 5; i >= 0; i--) {
      const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      const to = dateStr(last) > t ? t : dateStr(last);
      out.push({ label: `Tháng ${first.getMonth() + 1}/${first.getFullYear()}`, short: `T${first.getMonth() + 1}`, ...sum(dateStr(first), to) });
    }
  }
  return out;
}

// Dự báo số từ đến hạn trong 7 ngày tới (hôm nay gồm cả từ quá hạn).
export function forecast() {
  const t = today();
  const out = Array.from({ length: 7 }, (_, i) => ({ date: addDays(t, i), count: 0 }));
  for (const w of S.words.values()) {
    if (isNew(w) || !w.srs.due) continue;
    const i = Math.max(0, dayDiff(t, w.srs.due));
    if (i < 7) out[i].count++;
  }
  return out;
}

// ---- Mini game ----
// Mỗi từ có thêm w.game = { last (ms), round, debt }:
//   round = vòng gần nhất từ này xuất hiện trong game; debt = lần gần nhất gõ trượt và chưa gõ lại đúng.
// S.game = { round, plays, best, days }: vòng hiện tại (dùng chung cho các game), số ván, kỷ lục, số lượt đúng/trượt theo ngày.
const GAME_KEEP_DAYS = 120;
function cleanGame(g) {
  const o = g && typeof g === 'object' ? g : {};
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : 0);
  const days = {};
  if (o.days && typeof o.days === 'object') {
    for (const [d, v] of Object.entries(o.days)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === 'object') days[d] = { ok: n(v.ok), miss: n(v.miss) };
  }
  const drop = o.best?.drop && typeof o.best.drop === 'object' ? { first: n(o.best.drop.first), ms: n(o.best.drop.ms) } : null;
  const rec = (b) => (b && typeof b === 'object' ? { first: n(b.first), ms: n(b.ms) } : null);
  return {
    round: Math.max(1, n(o.round)),
    plays: { run: n(o.plays?.run), drop: n(o.plays?.drop), match: n(o.plays?.match), pop: n(o.plays?.pop) },
    best: { run: n(o.best?.run), drop, match: rec(o.best?.match), pop: rec(o.best?.pop) },
    days,
  };
}
const cleanWordGame = (g) => (g && typeof g === 'object' && Number(g.last) > 0
  ? { last: Number(g.last), round: Math.max(0, Math.round(Number(g.round)) || 0), debt: !!g.debt } : undefined);

export async function saveGame(patch = {}) {
  S.game = { ...S.game, ...patch };
  await put('kv', { key: 'game', value: S.game });
}

/**
 * Ghi nhận một lượt gõ trong mini game. Không đụng tới nhật ký học theo ngày, chuỗi ngày hay hệ số ôn tập.
 * Gõ trượt: chỉ đưa từ vào danh sách cần ôn hôm nay (giữ nguyên khoảng cách và hệ số dễ), không tính là "Quên".
 */
export async function recordGame(wordId, ok) {
  const w = S.words.get(wordId);
  if (!w) return;
  const t = today();
  w.game = { last: Date.now(), round: S.game.round, debt: !ok };
  if (!ok && !isNew(w) && (!w.srs.due || w.srs.due > t)) w.srs = { ...w.srs, due: t };
  const day = (S.game.days[t] ||= { ok: 0, miss: 0 });
  if (ok) day.ok += 1; else day.miss += 1;
  const cutoff = addDays(t, -GAME_KEEP_DAYS);
  for (const d of Object.keys(S.game.days)) if (d < cutoff) delete S.game.days[d];
  await tx(['words', 'kv'], 'readwrite', (x) => {
    x.objectStore('words').put(w);
    x.objectStore('kv').put({ key: 'game', value: S.game });
  });
}

// ---- Sao lưu / khôi phục ----
/** withWriting = false → bỏ bài viết khỏi file (file nhẹ hơn); khi khôi phục, bài viết đang có trên máy được giữ nguyên. */
export function exportData({ withWriting = true } = {}) {
  const { ai, ...settings } = S.settings; // không đưa API key vào file sao lưu
  return {
    app: 'vocab-app', version: 1, exportedAt: new Date().toISOString(),
    settings, decks: S.decks, words: allWords(), days: [...S.days.values()], game: S.game, grammar: [...S.grammar.values()],
    ...(withWriting ? { writing: essays() } : {}),
  };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strList = (v) => (Array.isArray(v) ? v.map(str).map((x) => x.trim()).filter(Boolean) : str(v).trim() ? [str(v).trim()] : []);
const int = (v, min, max, dflt) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : dflt);

export function validateBackup(data) {
  if (!data || data.app !== 'vocab-app' || !Array.isArray(data.words) || !Array.isArray(data.decks)) {
    throw new Error('File không phải bản sao lưu hợp lệ của ứng dụng này');
  }
  for (const w of data.words) {
    if (!w || typeof w !== 'object' || !ID_RE.test(str(w.id)) || typeof w.word !== 'string' || !w.word.trim()) throw new Error('Bản sao lưu chứa từ vựng bị lỗi');
  }
  for (const d of data.decks) {
    if (!d || typeof d !== 'object' || !ID_RE.test(str(d.id)) || typeof d.name !== 'string' || !d.name.trim()) throw new Error('Bản sao lưu chứa chủ đề bị lỗi');
  }
  return true;
}

// Bài viết trong file sao lưu: giữ đúng kiểu, cắt độ dài, bỏ trường lạ.
const W_ID = /^[A-Za-z0-9_:-]{1,80}$/;
function cleanWriting(w) {
  if (!w || typeof w !== 'object' || !W_ID.test(str(w.id)) || !['part', 'task1'].includes(w.kind)) return null;
  const r = w.report && typeof w.report === 'object' ? w.report : {};
  const nums = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [str(k).slice(0, 30), Number(v)]).slice(0, 30));
  return {
    id: w.id, kind: w.kind, promptId: str(w.promptId).slice(0, 64), part: str(w.part).slice(0, 30), title: str(w.title).slice(0, 300),
    text: str(w.text).slice(0, 20000), words: int(w.words, 0, 5000, 0), ms: int(w.ms, 0, 864e5, 0),
    at: DATE_RE.test(str(w.at)) ? w.at : today(), chart: w.chart && typeof w.chart === 'object' ? { tpl: str(w.chart.tpl).slice(0, 40), seed: int(w.chart.seed, 0, 2 ** 31, 0), mode: str(w.chart.mode).slice(0, 20), target: int(w.chart.target, 0, 9, 0) } : null,
    report: {
      stats: nums(r.stats),
      hits: (Array.isArray(r.hits) ? r.hits : []).filter((h) => h && typeof h === 'object').map((h) => ({ rule: str(h.rule).slice(0, 40), text: str(h.text).slice(0, 200) })).slice(0, 200),
      dismissed: (Array.isArray(r.dismissed) ? r.dismissed : []).map((x) => str(x).slice(0, 40)).slice(0, 200),
      checks: (Array.isArray(r.checks) ? r.checks : []).filter((c) => c && typeof c === 'object').map((c) => ({ ok: c.ok === true ? true : c.ok === false ? false : null, msg: str(c.msg).slice(0, 300) })).slice(0, 60),
    },
    self: Object.fromEntries(Object.entries(w.self && typeof w.self === 'object' ? w.self : {}).map(([k, v]) => [str(k).slice(0, 30), !!v]).slice(0, 30)),
  };
}
const G_ID = /^(?:[LCE]:[A-Za-z0-9_-]{1,64}|placement)$/;
const cleanSrs = (s) => {
  s = s && typeof s === 'object' ? s : {};
  const state = ['learning', 'review'].includes(s.state) ? s.state : null;
  if (!state || !DATE_RE.test(str(s.due))) return null;
  return { state, due: s.due, last: DATE_RE.test(str(s.last)) ? s.last : null, ease: Math.min(5, Math.max(1.3, Number(s.ease) || 2.5)),
    interval: int(s.interval, 0, 3650, 0), reps: int(s.reps, 0, 100000, 0), lapses: int(s.lapses, 0, 100000, 0) };
};
function cleanGrammar(g) {
  if (!g || typeof g !== 'object' || !G_ID.test(str(g.id))) return null;
  const kind = g.id[0];
  if (kind === 'C') { const srs = cleanSrs(g.srs); return srs ? { id: g.id, cardId: g.id.slice(2), srs } : null; }
  if (kind === 'L') {
    return { id: g.id, lessonId: g.id.slice(2), step: int(g.step, 0, 6, 0), pos: int(g.pos, 0, 100, 0), right: int(g.right, 0, 1e4, 0), wrong: int(g.wrong, 0, 1e4, 0),
      done: !!g.done, doneAt: DATE_RE.test(str(g.doneAt)) ? g.doneAt : null, best: int(g.best, 0, 100, 0),
      sentences: Array.isArray(g.sentences) ? g.sentences.filter((x) => typeof x === 'string').slice(-20) : [] };
  }
  if (kind === 'E') {
    return { id: g.id, tag: g.id.slice(2), log: (Array.isArray(g.log) ? g.log : []).filter((x) => x && DATE_RE.test(str(x.d))).map((x) => ({ d: x.d, ok: !!x.ok })).slice(-100) };
  }
  return { id: 'placement', date: DATE_RE.test(str(g.date)) ? g.date : null, pct: int(g.pct, 0, 100, 0), course: str(g.course).slice(0, 20), unitId: str(g.unitId).slice(0, 64),
    bands: Array.isArray(g.bands) ? g.bands.map((b) => int(b, 0, 100, 0)).slice(0, 4) : [] };
}

/** Đưa dữ liệu từ file sao lưu về đúng kiểu, để một file sai định dạng không làm hỏng app. */
function cleanBackup(data) {
  const decks = [];
  const deckIds = new Set();
  data.decks.forEach((d, i) => {
    if (deckIds.has(d.id)) return;
    deckIds.add(d.id);
    decks.push({ id: d.id, name: d.name.trim().slice(0, 60), builtin: !!d.builtin || d.id === FALLBACK_DECK, order: int(d.order, 0, 100000, i) });
  });
  const wordIds = new Set();
  const words = [];
  for (const w of data.words) {
    if (wordIds.has(w.id)) continue;
    wordIds.add(w.id);
    const s = w.srs && typeof w.srs === 'object' ? w.srs : {};
    const state = ['new', 'learning', 'review'].includes(s.state) ? s.state : 'new';
    const due = DATE_RE.test(str(s.due)) ? s.due : null;
    words.push({
      ...blankWord(),
      id: w.id, word: w.word.trim(), ipa: str(w.ipa), pos: str(w.pos), meaning: str(w.meaning), definition: str(w.definition),
      examples: strList(w.examples), collocations: strList(w.collocations), synonyms: strList(w.synonyms), antonyms: strList(w.antonyms), family: strList(w.family),
      mistakes: str(w.mistakes), notes: str(w.notes), deckId: deckIds.has(w.deckId) ? w.deckId : FALLBACK_DECK,
      difficulty: int(w.difficulty, 1, 3, 2), favorite: !!w.favorite,
      sentences: Array.isArray(w.sentences) ? w.sentences.filter((x) => x && typeof x.text === 'string').map((x) => ({ text: x.text, at: Number(x.at) || 0 })) : [],
      createdAt: Number(w.createdAt) || Date.now(), updatedAt: Number(w.updatedAt) || Date.now(),
      // Từ đã học mà thiếu ngày ôn thì coi như chưa học, tránh "mất tích" khỏi mọi danh sách.
      srs: state === 'new' || !due ? newSrs() : {
        state, due, last: DATE_RE.test(str(s.last)) ? s.last : null,
        ease: Math.min(5, Math.max(1.3, Number(s.ease) || 2.5)), interval: int(s.interval, 0, 3650, 0), reps: int(s.reps, 0, 100000, 0), lapses: int(s.lapses, 0, 100000, 0),
      },
    });
    const wg = cleanWordGame(w.game);
    if (wg) words[words.length - 1].game = wg;
  }
  const days = (Array.isArray(data.days) ? data.days : []).filter((d) => d && DATE_RE.test(str(d.date))).map((d) => ({
    date: d.date,
    newIds: Array.isArray(d.newIds) ? d.newIds.filter((x) => typeof x === 'string') : [],
    reviewIds: Array.isArray(d.reviewIds) ? d.reviewIds.filter((x) => typeof x === 'string') : [],
    correct: int(d.correct, 0, 1e6, 0), wrong: int(d.wrong, 0, 1e6, 0),
    gLessons: Array.isArray(d.gLessons) ? d.gLessons.filter((x) => typeof x === 'string') : [],
    gReviews: Array.isArray(d.gReviews) ? d.gReviews.filter((x) => typeof x === 'string') : [],
    wEssays: Array.isArray(d.wEssays) ? d.wEssays.filter((x) => typeof x === 'string') : [],
  }));
  const writing = Array.isArray(data.writing) ? data.writing.map(cleanWriting).filter(Boolean) : null;
  const grammar = (Array.isArray(data.grammar) ? data.grammar : []).map(cleanGrammar).filter(Boolean);
  const st = data.settings && typeof data.settings === 'object' ? data.settings : {};
  const settings = {
    ...DEFAULT_SETTINGS,
    newPerDay: int(st.newPerDay, 5, 200, DEFAULT_SETTINGS.newPerDay),
    reviewPerDay: int(st.reviewPerDay, 5, 200, DEFAULT_SETTINGS.reviewPerDay),
    theme: ['auto', 'light', 'dark'].includes(st.theme) ? st.theme : 'auto',
    accent: ['green', 'blue', 'purple', 'teal', 'orange', 'pink'].includes(st.accent) ? st.accent : 'green',
    voice: ['en-US', 'en-GB'].includes(st.voice) ? st.voice : 'en-US',
    rate: [0.75, 0.95, 1.1].includes(Number(st.rate)) ? Number(st.rate) : 0.95,
    voiceName: str(st.voiceName).slice(0, 80),
    autoSpeak: st.autoSpeak !== false,
    autoFill: st.autoFill !== false,
    lastBackup: DATE_RE.test(str(st.lastBackup)) ? st.lastBackup : null,
    grammarPerDay: int(st.grammarPerDay, 0, 2, DEFAULT_SETTINGS.grammarPerDay),
    grammarCourse: /^c[1-9]$/.test(str(st.grammarCourse)) ? st.grammarCourse : '',
    writingPerDay: int(st.writingPerDay, 0, 2, DEFAULT_SETTINGS.writingPerDay),
    grammarReviewPerDay: int(st.grammarReviewPerDay, 5, 50, DEFAULT_SETTINGS.grammarReviewPerDay),
  };
  return { decks, words, days, settings, game: cleanGame(data.game), grammar, writing };
}

export async function restoreData(data) {
  validateBackup(data);
  const clean = cleanBackup(data);
  const ai = S.settings.ai;
  await tx(['words', 'decks', 'days', 'kv', 'grammar', 'writing'], 'readwrite', (t) => {
    for (const s of ['words', 'decks', 'days', 'grammar']) t.objectStore(s).clear();
    // File sao lưu không kèm bài viết → giữ nguyên bài viết đang có trên máy.
    if (clean.writing) {
      t.objectStore('writing').clear();
      clean.writing.forEach((w) => t.objectStore('writing').put(w));
    }
    clean.grammar.forEach((g) => t.objectStore('grammar').put(g));
    clean.words.forEach((w) => t.objectStore('words').put(w));
    clean.decks.forEach((d) => t.objectStore('decks').put(d));
    clean.days.forEach((d) => t.objectStore('days').put(d));
    t.objectStore('kv').put({ key: 'settings', value: { ...clean.settings, ai } });
    t.objectStore('kv').put({ key: 'game', value: clean.game });
  });
  await init();
  return clean.words.length;
}

export async function wipeAll() {
  await tx(['words', 'decks', 'days', 'kv', 'grammar', 'writing'], 'readwrite', (t) => {
    for (const s of ['words', 'decks', 'days', 'kv', 'grammar', 'writing']) t.objectStore(s).clear();
  });
  S.settings = structuredClone(DEFAULT_SETTINGS);
  await init();
}

export async function bulkAddWords(words) {
  await tx(['words'], 'readwrite', (t) => words.forEach((w) => t.objectStore('words').put(w)));
  words.forEach((w) => S.words.set(w.id, w));
}
