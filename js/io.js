// Import / Export: CSV, Excel (.xlsx), sao lưu JSON, bộ từ mẫu.
import { S, blankWord, bulkAddWords, addDeck, allWords, deckName, exportData, restoreData, saveSettings, findByText, FALLBACK_DECK } from './store.js';
import { parseCSV, toCSV, readXlsx, download, today, splitList } from './util.js';
import { SEED, SEED_FIELDS } from './seed.js';

export const CSV_COLUMNS = ['word', 'ipa', 'part_of_speech', 'meaning_vi', 'definition_en', 'examples', 'collocations', 'synonyms', 'antonyms', 'word_family', 'common_mistakes', 'topic', 'difficulty', 'notes'];

// Tên cột chấp nhận khi import (không phân biệt hoa thường, dấu cách/gạch dưới).
const ALIASES = {
  word: ['word', 'english', 'englishword', 'phrase', 'term', 'tu', 'từ', 'tuvung', 'từvựng'],
  ipa: ['ipa', 'phonetic', 'phienam', 'phiênâm', 'pronunciation'],
  pos: ['partofspeech', 'pos', 'type', 'loaitu', 'loạitừ', 'tuloai', 'từloại'],
  meaning: ['meaningvi', 'meaning', 'vietnamese', 'vietnamesemeaning', 'nghia', 'nghĩa', 'nghiatiengviet', 'nghĩatiếngviệt'],
  definition: ['definitionen', 'definition', 'englishdefinition', 'dinhnghia', 'địnhnghĩa'],
  examples: ['examples', 'example', 'examplesentences', 'vidu', 'vídụ'],
  collocations: ['collocations', 'collocation'],
  synonyms: ['synonyms', 'synonym', 'dongnghia', 'đồngnghĩa'],
  antonyms: ['antonyms', 'antonym', 'trainghia', 'tráinghĩa'],
  family: ['wordfamily', 'family', 'hotu', 'họtừ'],
  mistakes: ['commonmistakes', 'mistakes', 'loithuonggap', 'lỗithườnggặp'],
  topic: ['topic', 'deck', 'category', 'chude', 'chủđề'],
  difficulty: ['difficulty', 'level', 'dokho', 'độkhó'],
  notes: ['notes', 'note', 'personalnotes', 'ghichu', 'ghichú'],
};
const key = (s) => String(s).normalize('NFC').toLowerCase().replace(/[\s_\-/&().]/g, '');
const multi = (s) => splitList(s, /\s*\|\s*|\n/);

function parseDifficulty(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['1', 'easy', 'dễ', 'de'].includes(s)) return 1;
  if (['3', 'hard', 'khó', 'kho'].includes(s)) return 3;
  return 2;
}

export async function importFile(file) {
  let rows;
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) rows = await readXlsx(await file.arrayBuffer());
  else if (name.endsWith('.xls')) throw new Error('Định dạng .xls cũ chưa được hỗ trợ — hãy lưu lại thành .xlsx hoặc .csv');
  else rows = parseCSV(await file.text());
  return importRows(rows);
}

export async function importRows(rows) {
  if (rows.length < 2) throw new Error('File không có dữ liệu (cần 1 dòng tiêu đề và ít nhất 1 dòng từ vựng)');
  const header = rows[0].map(key);
  const col = {};
  for (const [field, names] of Object.entries(ALIASES)) col[field] = header.findIndex((h) => names.includes(h));
  if (col.word < 0) throw new Error('Không tìm thấy cột "word" trong dòng tiêu đề');

  const added = [];
  const seen = new Set();
  let skippedEmpty = 0, skippedDup = 0, newDecks = 0;
  for (const r of rows.slice(1)) {
    const get = (f) => (col[f] >= 0 ? String(r[col[f]] ?? '').trim() : '');
    const text = get('word');
    if (!text) { skippedEmpty++; continue; }
    const k = text.toLowerCase();
    if (seen.has(k) || findByText(text)) { skippedDup++; continue; }
    seen.add(k);

    let deckId = FALLBACK_DECK;
    const topic = get('topic');
    if (topic) {
      let deck = S.decks.find((d) => d.name.toLowerCase() === topic.toLowerCase());
      if (!deck) { deck = await addDeck(topic); newDecks++; }
      deckId = deck.id;
    }
    const w = blankWord(deckId);
    Object.assign(w, {
      word: text, ipa: get('ipa'), pos: get('pos'), meaning: get('meaning'), definition: get('definition'),
      examples: multi(get('examples')), collocations: multi(get('collocations')),
      synonyms: multi(get('synonyms').replace(/,/g, '|')), antonyms: multi(get('antonyms').replace(/,/g, '|')),
      family: multi(get('family')), mistakes: get('mistakes'), difficulty: parseDifficulty(get('difficulty')), notes: get('notes'),
      createdAt: Date.now() + added.length,
    });
    added.push(w);
  }
  if (added.length) await bulkAddWords(added);
  return { added: added.length, skippedEmpty, skippedDup, newDecks };
}

const wordRow = (w) => [
  w.word, w.ipa, w.pos, w.meaning, w.definition, w.examples.join(' | '), w.collocations.join(' | '),
  w.synonyms.join(' | '), w.antonyms.join(' | '), w.family.join(' | '), w.mistakes, deckName(w.deckId), w.difficulty, w.notes,
];

export function exportCSV() {
  const rows = [CSV_COLUMNS, ...allWords().sort((a, b) => a.word.localeCompare(b.word)).map(wordRow)];
  return download(`tu-vung-${today()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}

export function downloadTemplate() {
  const sample = ['resilient', '/rɪˈzɪliənt/', 'adjective', 'kiên cường, mau phục hồi', 'able to recover quickly from difficulties',
    'Children are often more resilient than adults. | The economy proved resilient.', 'remarkably resilient | resilient to',
    'tough | strong', 'fragile | vulnerable', 'resilience (n) | resiliently (adv)', 'Giới từ: resilient to (không dùng "with")', 'IELTS Academic Vocabulary', '2', ''];
  return download('mau-import-tu-vung.csv', toCSV([CSV_COLUMNS, sample]), 'text/csv;charset=utf-8');
}

export async function exportBackup() {
  const saved = await download(`sao-luu-tu-vung-${today()}.json`, JSON.stringify(exportData(), null, 2), 'application/json');
  if (saved) await saveSettings({ lastBackup: today() });
  return saved;
}

export async function restoreBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('File sao lưu bị hỏng hoặc không phải JSON'); }
  return restoreData(data);
}

export async function loadSeed() {
  const added = [];
  for (const row of SEED) {
    if (findByText(row[0])) continue;
    const w = blankWord();
    SEED_FIELDS.forEach((f, i) => (w[f] = row[i]));
    w.createdAt = Date.now() + added.length;
    added.push(w);
  }
  if (added.length) await bulkAddWords(added);
  return added.length;
}
