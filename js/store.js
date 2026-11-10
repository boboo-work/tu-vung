// Lớp dữ liệu: IndexedDB (bền vững) + bản sao trong bộ nhớ (đọc nhanh).
// Mọi thay đổi đều được ghi xuống IndexedDB ngay lập tức.
import { uid, today, addDays, dayDiff, parseDate, dateStr } from './util.js';
import { newSrs, schedule, isNew, isDue, isMastered } from './srs.js';

const DB_NAME = 'vocab-app';
const DB_VERSION = 1;
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
    t.onabort = () => reject(t.error || new Error('Giao dịch bị huỷ'));
    result = fn(t);
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
  voice: 'en-US', // en-US | en-GB
  rate: 0.95,
  ai: { provider: 'anthropic', apiKey: '', model: 'claude-opus-5-5', endpoint: '' },
  lastBackup: null,
};

export const S = {
  words: new Map(),
  decks: [],
  days: new Map(),
  settings: structuredClone(DEFAULT_SETTINGS),
  persisted: false,
};

export async function init() {
  db = await openDB();
  const [words, decks, days, kv] = await Promise.all([getAll('words'), getAll('decks'), getAll('days'), getAll('kv')]);
  S.words = new Map(words.map((w) => [w.id, w]));
  S.days = new Map(days.map((d) => [d.date, d]));
  S.decks = decks.sort((a, b) => a.order - b.order);
  const saved = kv.find((x) => x.key === 'settings')?.value;
  if (saved) S.settings = { ...DEFAULT_SETTINGS, ...saved, ai: { ...DEFAULT_SETTINGS.ai, ...(saved.ai || {}) } };
  if (!S.decks.length) {
    S.decks = DEFAULT_DECKS.map(([id, name], i) => ({ id, name, builtin: true, order: i }));
    await tx(['decks'], 'readwrite', (t) => S.decks.forEach((d) => t.objectStore('decks').put(d)));
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
const blankDay = (date) => ({ date, newIds: [], reviewIds: [], correct: 0, wrong: 0 });
export const dayOf = (date = today()) => S.days.get(date) || blankDay(date);

/**
 * Ghi nhận một lần trả lời và cập nhật lịch ôn.
 * rating: again | hard | good | easy.   source: 'learn' | 'review' | 'practice'
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
  const active = (d) => {
    const x = S.days.get(d);
    return !!x && x.newIds.length + x.reviewIds.length + x.correct + x.wrong > 0;
  };
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
    if (d.correct + d.wrong > 0) activeDays++;
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

// ---- Sao lưu / khôi phục ----
export function exportData() {
  const { ai, ...settings } = S.settings; // không đưa API key vào file sao lưu
  return {
    app: 'vocab-app', version: 1, exportedAt: new Date().toISOString(),
    settings, decks: S.decks, words: allWords(), days: [...S.days.values()],
  };
}

export function validateBackup(data) {
  if (!data || data.app !== 'vocab-app' || !Array.isArray(data.words) || !Array.isArray(data.decks)) {
    throw new Error('File không phải bản sao lưu hợp lệ của ứng dụng này');
  }
  for (const w of data.words) if (!w.id || typeof w.word !== 'string') throw new Error('Bản sao lưu chứa từ vựng bị lỗi');
  return true;
}

export async function restoreData(data) {
  validateBackup(data);
  const ai = S.settings.ai;
  const days = Array.isArray(data.days) ? data.days.filter((d) => d && d.date) : [];
  await tx(['words', 'decks', 'days', 'kv'], 'readwrite', (t) => {
    for (const s of ['words', 'decks', 'days']) t.objectStore(s).clear();
    data.words.forEach((w) => t.objectStore('words').put({ ...blankWord(), ...w, srs: { ...newSrs(), ...(w.srs || {}) } }));
    data.decks.forEach((d) => t.objectStore('decks').put(d));
    days.forEach((d) => t.objectStore('days').put({ ...blankDay(d.date), ...d }));
    t.objectStore('kv').put({ key: 'settings', value: { ...DEFAULT_SETTINGS, ...(data.settings || {}), ai } });
  });
  await init();
}

export async function wipeAll() {
  await tx(['words', 'decks', 'days', 'kv'], 'readwrite', (t) => {
    for (const s of ['words', 'decks', 'days', 'kv']) t.objectStore(s).clear();
  });
  S.settings = structuredClone(DEFAULT_SETTINGS);
  await init();
}

export async function bulkAddWords(words) {
  await tx(['words'], 'readwrite', (t) => words.forEach((w) => t.objectStore('words').put(w)));
  words.forEach((w) => S.words.set(w.id, w));
}
