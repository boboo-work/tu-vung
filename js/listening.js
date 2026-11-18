// Luyện IELTS Listening — L1 và L2 trong bản nghiệp vụ.
//  L1 Nghe số và chính tả (lỗi mất điểm "dễ" ở Part 1): đánh vần tên, số điện thoại, số -teen/-ty, giá tiền,
//     ngày tháng, giờ, mã số. Câu sinh ngẫu nhiên nên không bao giờ hết bài; có câu gây nhiễu kiểu thi thật
//     ("It used to be £45, but now it's £39"). Chấm theo luật thi: sai chính tả là sai.
//  L2 Nghe chép: nghe từng câu (nghe lại, nghe chậm, nghe từng đoạn), gõ lại, app so từng từ và chỉ ra loại lỗi
//     (từ nhỏ bị nuốt, đuôi -s/-ed, chính tả, không nghe ra từ).
// Âm thanh: giọng đọc có sẵn trên máy (Web Speech API), ưu tiên giọng Anh và Úc, chạy được khi offline.
import { S, saveSettings, saveListening, logGrammarDay, dayOf } from './store.js';
import { esc, toast, uid, today, fmtDate, englishVoices, onVoices, canSpeak, shuffle, voiceById } from './util.js';
import { icon, on, go, back, rerender, learnSwitch, confirmSheet } from './ui.js';
import { ltestCard } from './ltest.js';

// ---------------------------------------------------------------- Giọng đọc
const ACCENT = { 'en-GB': 'Anh', 'en-AU': 'Úc', 'en-IE': 'Ireland', 'en-NZ': 'New Zealand', 'en-ZA': 'Nam Phi', 'en-US': 'Mỹ', 'en-CA': 'Canada', 'en-IN': 'Ấn Độ' };
const langOf = (v) => (v?.lang || '').replace('_', '-');
const voicesFor = (lang) => englishVoices(lang).filter((v) => langOf(v).toLowerCase() === lang.toLowerCase());
const accentName = (v) => ACCENT[langOf(v)] || 'Anh';
/** Số giọng theo từng chất giọng có trên máy. */
export function voiceStock() {
  return { gb: voicesFor('en-GB').length, au: voicesFor('en-AU').length, other: ['en-IE', 'en-NZ', 'en-ZA', 'en-US'].reduce((a, l) => a + voicesFor(l).length, 0) };
}
/** Chọn một giọng cho một câu: theo cài đặt (trộn: ưu tiên Anh và Úc, thỉnh thoảng giọng khác nếu máy có). */
export function pickVoice() {
  const pref = S.settings.listenAccent || 'mix';
  // Giọng bạn chọn trong Cài đặt: dùng luôn nếu hợp chất giọng Listening (Trộn nhận mọi giọng).
  const mine = voiceById(S.settings.voiceName);
  if (mine && (pref === 'mix' || langOf(mine).toLowerCase() === pref.toLowerCase() || (pref === 'en-AU' && /en-nz/i.test(langOf(mine))))) return mine;
  const buckets = pref === 'en-GB' ? [['en-GB', 1]] : pref === 'en-AU' ? [['en-AU', 1], ['en-NZ', 0.01]]
    : [['en-GB', 0.45], ['en-AU', 0.35], ['en-IE', 0.07], ['en-NZ', 0.05], ['en-US', 0.08]];
  const avail = buckets.map(([l, w]) => [w, voicesFor(l).slice(0, 3)]).filter((b) => b[1].length);
  if (!avail.length) return voicesFor('en-GB')[0] || englishVoices('en-GB')[0] || null;
  let r = Math.random() * avail.reduce((a, b) => a + b[0], 0);
  for (const [w, vs] of avail) if ((r -= w) <= 0) return vs[Math.floor(Math.random() * vs.length)];
  return avail[0][1][0];
}
let utter = null;
/** Đọc một câu; onend chạy khi đọc xong (không chạy nếu bị ngắt bởi câu khác). */
export function say(text, { voice = null, rate = 0, onend } = {}) {
  if (!canSpeak()) { toast('Thiết bị này không hỗ trợ đọc thành tiếng'); return false; }
  const u = new SpeechSynthesisUtterance(text);
  if (voice) { u.voice = voice; u.lang = langOf(voice); } else u.lang = 'en-GB';
  u.rate = rate || S.settings.listenRate || 0.95;
  const done = () => { if (utter === u) { utter = null; playing(false); onend?.(); } };
  u.onend = done;
  u.onerror = done;
  utter = u;
  playing(true);
  // Trên iOS, cancel() rồi speak() ngay làm tiếng bị cắt → chỉ cancel khi đang đọc và chờ một nhịp.
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    setTimeout(() => { if (utter === u) speechSynthesis.speak(u); }, 80);
  } else speechSynthesis.speak(u);
  return true;
}
export function hush() {
  utter = null;
  playing(false);
  try { if (canSpeak()) speechSynthesis.cancel(); } catch { /* bỏ qua */ }
}
/** Đổi trạng thái nút nghe ngay trên trang (không vẽ lại để không mất chữ đang gõ). */
function playing(on) {
  document.querySelectorAll('.ls-play').forEach((b) => b.classList.toggle('playing', on));
}

// ---------------------------------------------------------------- Số và chữ cái thành lời
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function numWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numWords(n % 100) : '');
  return numWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? (n % 1000 < 100 ? ' and ' : ' ') + numWords(n % 1000) : '');
}
const ORD_IRR = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
export function ordWords(n) {
  const parts = numWords(n).split('-');
  const last = parts.pop();
  return [...parts, ORD_IRR[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th')].join('-');
}
/** Đọc từng ký tự: "0" = "oh", hai ký tự giống nhau liền nhau = "double …". */
const charWord = (c) => (c === '0' ? 'oh' : /\d/.test(c) ? ONES[+c] : c.toUpperCase());
function spellOut(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (s[i + 1] === c && s[i + 2] !== c) { out.push('double ' + charWord(c)); i++; } else out.push(charWord(c));
  }
  return out.join(', ');
}
const spellGroups = (s) => s.split(' ').map(spellOut).join('. ');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad2 = (n) => String(n).padStart(2, '0');
function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// ---------------------------------------------------------------- L1: các dạng nghe số và chính tả
export const CATS = {
  spell: { name: 'Đánh vần tên', sub: 'Tên người, tên đường, khách sạn, thị trấn' },
  phone: { name: 'Số điện thoại', sub: '“oh” = 0, “double two” = 22' },
  teen: { name: 'Số dễ nhầm', sub: '13/30, 15/50, 19/90…' },
  price: { name: 'Giá tiền', sub: '£12.50, $39.99 · có câu đổi giá' },
  date: { name: 'Ngày tháng', sub: '“the twenty-third of March”' },
  time: { name: 'Giờ', sub: '“quarter to nine”, “ten past six”' },
  code: { name: 'Mã số, mã bưu điện', sub: 'CB2 1TN, mã đặt chỗ KM4729' },
};
const CAT_IDS = Object.keys(CATS);
const REASON = {
  spell: ['Sai chính tả', 'Trong bài thi, sai một chữ cái là mất điểm. Nghe kỹ từng chữ người nói đánh vần.'],
  letter: ['Nhầm chữ cái', 'Người Việt hay nhầm G/J, E/I, A/R, M/N, B/V. Luyện thêm phần đánh vần với giọng Anh.'],
  digit: ['Sai hoặc thiếu chữ số', '“oh” là số 0, “double two” là 22. Ghi nhanh từng nhóm số khi nghe.'],
  teen: ['Nhầm số -teen và -ty', '-teen nhấn âm sau, kéo dài /tiːn/ (fif-TEEN). -ty nhấn âm đầu, đuôi ngắn /ti/ (FIF-ty).'],
  distract: ['Bị câu gây nhiễu', 'Người nói nhắc một con số rồi đổi lại. Nghe hết câu; đáp án thường đứng sau “but”, “actually”, “sorry, I mean”.'],
  clock: ['Nhầm cách đọc giờ', '“quarter to nine” là 8:45 (9 giờ kém 15), “twenty past six” là 6:20.'],
  format: ['Chưa đúng cách viết', 'Viết bằng số, và viết rõ tên tháng (23 March) để không bị hiểu sai.'],
  blank: ['Bỏ trống', 'Trong bài thi không bị trừ điểm khi đoán. Luôn viết một đáp án.'],
  other: ['Chưa nghe ra', 'Bấm Nghe lại và để ý phần được tô đậm trong câu.'],
};

const SURNAMES = ['Thornton', 'Ashworth', 'Kingsley', 'Whitfield', 'Pemberton', 'Gallagher', 'Barnett', 'Caldwell', 'Hargreaves', 'Rothwell', 'Stanfield', 'Woodhouse',
  'Blackwood', 'Merriman', 'Cartwright', 'Russell', 'Bennett', 'Chapman', 'Faulkner', 'Kershaw', 'Lockwood', 'Pritchard', 'Sheppard', 'Tennant', 'Vaughan', 'Wainwright',
  'Yardley', 'Jessop', 'Gilchrist', 'Harcourt', 'Ellery', 'Fenwick', 'Maxwell', 'Quigley', 'Radcliffe', 'Templeton', 'Underwood', 'Jarvis', 'Garrett', 'Ingram'];
const STREETS = ['Elmwood', 'Haddon', 'Beechcroft', 'Marlborough', 'Wexford', 'Harrowby', 'Copperfield', 'Glenview', 'Fernhill', 'Ashgrove', 'Kenmore', 'Larchfield',
  'Belgrave', 'Jasmine', 'Rivington', 'Gresham', 'Cavendish', 'Juniper'];
const TOWNS = ['Ballarat', 'Wollongong', 'Toowoomba', 'Geelong', 'Bendigo', 'Mildura', 'Bathurst', 'Harrogate', 'Keswick', 'Ludlow', 'Whitby', 'Penrith', 'Gisborne', 'Tamworth'];
const letters = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
const alnum = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const CONFUSE = ['GJ', 'EI', 'AR', 'MN', 'BV', 'PB', 'TD', 'AE', 'IY', 'UW', 'SF', 'QU'];
const confusable = (a, b) => CONFUSE.some((p) => p.includes(a) && p.includes(b));
/** So hai chuỗi ký tự cùng độ dài: chỉ khác ở chữ dễ nhầm → letter, khác chữ số → digit. */
function charReason(got, ans) {
  if (got.length !== ans.length) return /\d/.test(ans) && got.replace(/\D/g, '') !== ans.replace(/\D/g, '') ? 'digit' : lev(got, ans) <= 2 ? 'spell' : 'other';
  const diff = [...ans].map((c, i) => [c, got[i]]).filter(([a, b]) => a !== b);
  if (diff.every(([a, b]) => /\d/.test(a) || /\d/.test(b))) return 'digit';
  if (diff.every(([a, b]) => /[A-Z]/i.test(a) && /[A-Z]/i.test(b) && confusable(a.toUpperCase(), b.toUpperCase()))) return 'letter';
  return diff.length <= 2 ? 'spell' : 'other';
}

function genSpell() {
  const kind = pick(['surname', 'surname', 'street', 'town', 'hotel']);
  if (kind === 'street') {
    const n = pick(STREETS), no = rnd(2, 199);
    return { label: 'Address', pre: `${no}`, unit: 'Road', ans: n, say: `I live at ${no} ${n} Road. That's ${spellOut(n.toUpperCase())}, ${n} Road.`, show: `I live at ${no} <b>${n}</b> Road. That's ${n.toUpperCase().split('').join('-')}.` };
  }
  if (kind === 'town') {
    const n = pick(TOWNS);
    return { label: 'Town', ans: n, say: `It's in a town called ${n}. I'll spell that for you: ${spellOut(n.toUpperCase())}.`, show: `It's in a town called <b>${n}</b>. ${n.toUpperCase().split('').join('-')}.` };
  }
  if (kind === 'hotel') {
    const n = pick(STREETS);
    return { label: 'Hotel', pre: 'the', unit: 'Hotel', ans: n, say: `We're staying at the ${n} Hotel. That's ${spellOut(n.toUpperCase())}.`, show: `We're staying at the <b>${n}</b> Hotel. ${n.toUpperCase().split('').join('-')}.` };
  }
  const n = pick(SURNAMES), t = pick(['Mrs', 'Mr', 'Ms', 'Doctor']);
  return pick([
    { label: 'Surname', ans: n, say: `My surname is ${n}. That's ${spellOut(n.toUpperCase())}.`, show: `My surname is <b>${n}</b>. ${n.toUpperCase().split('').join('-')}.` },
    { label: 'Contact person', pre: t, ans: n, say: `You'll need to speak to ${t} ${n}, that's ${spellOut(n.toUpperCase())}.`, show: `You'll need to speak to ${t} <b>${n}</b>. ${n.toUpperCase().split('').join('-')}.` },
  ]);
}
function checkSpell(item, inp) {
  const got = letters(String(inp).replace(/\b(the|road|hotel|mrs|mr|ms|doctor|dr)\b/gi, ''));
  const ans = letters(item.ans);
  if (!String(inp).trim()) return { ok: false, why: 'blank' };
  if (!got) return { ok: false, why: 'other' };
  if (got === ans) return { ok: true };
  return { ok: false, why: charReason(got.toUpperCase(), ans.toUpperCase()) };
}

function genPhone(voice) {
  const au = /AU|NZ/.test(langOf(voice));
  const d = (k) => Array.from({ length: k }, () => rnd(0, 9)).join('');
  // Thường có một cặp số giống nhau để luyện "double".
  const dbl = (s) => { if (Math.random() < 0.6) { const i = rnd(0, s.length - 2); const c = String(rnd(0, 9)); return s.slice(0, i) + c + c + s.slice(i + 2); } return s; };
  const num = au ? `04${d(2)} ${dbl(d(3))} ${d(3)}` : `07${d(3)} ${dbl(d(3))} ${d(3)}`;
  const spoken = num.split(' ').map((g) => spellOut(g).replace(/,/g, '')).join(', ');
  const say = pick([`My mobile number is ${spoken}.`, `You can reach me on ${spoken}.`, `The best number to call is ${spoken}.`]);
  return { label: 'Phone', ans: num, say, show: say.replace(spoken, `<b>${num}</b>`) };
}
function checkPhone(item, inp) {
  const got = String(inp).replace(/\D/g, ''), ans = item.ans.replace(/\D/g, '');
  if (!String(inp).trim()) return { ok: false, why: 'blank' };
  if (!got) return { ok: false, why: 'format' };
  return got === ans ? { ok: true } : { ok: false, why: 'digit' };
}

const TEEN_CTX = [
  ['Group size', '', (w) => `There'll be ${w} people in the group.`],
  ['Platform', '', (w) => `The train leaves from platform ${w}.`],
  ['Walk to the beach', 'minutes', (w) => `It's only a ${w} minute walk to the beach.`],
  ['Room number', '', (w) => `You're in room ${w}, at the end of the corridor.`],
  ['Distance from town', 'km', (w) => `The campsite is about ${w} kilometres from the town.`],
  ['Places left', '', (w) => `There are only ${w} places left on the trip.`],
];
const WORD_NUM = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [numWords(i), i]));
function parseNum(s) {
  const t = String(s).toLowerCase().trim();
  const m = t.match(/\d+/);
  if (m) return Number(m[0]);
  const w = t.replace(/\s+/g, '-');
  return w in WORD_NUM ? WORD_NUM[w] : null;
}
function genTeen() {
  const k = rnd(3, 9);
  const teen = 10 + k, ty = 10 * k;
  const [target, other] = Math.random() < 0.5 ? [teen, ty] : [ty, teen];
  const [label, unit, f] = pick(TEEN_CTX);
  const fix = Math.random() < 0.3;
  const w = fix ? `${numWords(other)}... sorry, I mean ${numWords(target)}` : numWords(target);
  const say = f(w);
  return { label, unit, ans: String(target), other, fix, say, show: f(fix ? `${other}... sorry, I mean <b>${target}</b>` : `<b>${target}</b>`) };
}
function checkTeen(item, inp) {
  if (!String(inp).trim()) return { ok: false, why: 'blank' };
  const n = parseNum(inp);
  if (n === Number(item.ans)) return { ok: true };
  if (n === item.other) return { ok: false, why: item.fix ? 'distract' : 'teen' };
  return { ok: false, why: n == null ? 'format' : 'other' };
}

function money(p, c, voice) {
  const au = /AU|NZ|US|CA/.test(langOf(voice));
  const [sym, unit] = au ? ['$', 'dollars'] : ['£', 'pounds'];
  const said = !c ? `${numWords(p)} ${unit}` : (p < 100 && c >= 10 && Math.random() < 0.5 ? `${numWords(p)} ${numWords(c)}` : `${numWords(p)} ${unit} ${numWords(c)}`);
  return { said, text: `${sym}${p}${c ? '.' + pad2(c) : ''}`, cents: p * 100 + c };
}
function genPrice(voice) {
  const cents = () => pick([0, 0, 50, 25, 75, 95, 99, 20, 45, 60]);
  const p = rnd(4, 95), c = cents();
  const a = money(p, c, voice);
  if (Math.random() < 0.35) {
    if (Math.random() < 0.5) {
      const b = money(p + rnd(5, 30), cents(), voice);
      return { label: 'Student price', ans: a.text, cents: a.cents, trap: b.cents, say: `The full price is ${b.said}, but with a student card it's only ${a.said}.`, show: `The full price is ${b.text}, but with a student card it's only <b>${a.text}</b>.` };
    }
    const b = money(Math.max(2, p - rnd(3, 15)), cents(), voice);
    return { label: 'Price now', ans: a.text, cents: a.cents, trap: b.cents, say: `It used to be ${b.said}, but it's gone up to ${a.said}.`, show: `It used to be ${b.text}, but it's gone up to <b>${a.text}</b>.` };
  }
  const [label, f] = pick([['Ticket price', (s) => `A ticket costs ${s}.`], ['Price per night', (s) => `A double room is ${s} a night.`], ['Monthly fee', (s) => `The monthly fee is ${s}.`], ['Deposit', (s) => `You'll need to pay a deposit of ${s}.`]]);
  return { label, ans: a.text, cents: a.cents, say: f(a.said), show: f(`<b>${a.text}</b>`) };
}
function parseMoney(s) {
  const t = String(s).replace(/,/g, '.');
  const m = t.match(/(\d+)(?:\s*\.\s*(\d{1,2})|\D+(\d{2})\b)?/);
  if (!m) return null;
  const c = m[2] ?? m[3];
  return Number(m[1]) * 100 + (c ? (c.length === 1 ? Number(c) * 10 : Number(c)) : 0);
}
function checkPrice(item, inp) {
  if (!String(inp).trim()) return { ok: false, why: 'blank' };
  const v = parseMoney(inp);
  if (v == null) return { ok: false, why: 'format' };
  if (v === item.cents) return { ok: true };
  if (v === item.trap) return { ok: false, why: 'distract' };
  return { ok: false, why: 'other' };
}

function genDate(voice) {
  const d = rnd(1, 28), m = rnd(0, 11), M = MONTHS[m];
  const us = /AU|US|CA/.test(langOf(voice)) && Math.random() < 0.4;
  const said = us ? `${M} ${ordWords(d)}` : pick([`the ${ordWords(d)} of ${M}`, `${M} the ${ordWords(d)}`]);
  const ans = `${d} ${M}`;
  if (Math.random() < 0.25) {
    const d0 = d > 14 ? d - rnd(3, 9) : d + rnd(3, 9);
    return { label: 'Start date', ans, d, m, trap: d0, say: `The course was going to start on the ${ordWords(d0)} of ${M}, but it's been moved to the ${ordWords(d)}.`, show: `The course was going to start on the ${ordSuffix(d0)} of ${M}, but it's been moved to the <b>${ordSuffix(d)}</b>.` };
  }
  const [label, f] = pick([['Start date', (s) => `The course starts on ${s}.`], ['Date of arrival', (s) => `We're arriving on ${s}.`], ['Deadline', (s) => `Applications must be in by ${s}.`], ['Date of the party', (s) => `The party is on ${s}.`]]);
  return { label, ans, d, m, say: f(said), show: f(`<b>${ans}</b>`) };
}
const ordSuffix = (d) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
function checkDate(item, inp) {
  const t = String(inp).toLowerCase();
  if (!t.trim()) return { ok: false, why: 'blank' };
  const day = Number(t.match(/\d{1,2}/)?.[0]);
  const words = t.match(/[a-z]+/g) || [];
  let month = -1, spelled = true;
  for (const w of words) {
    const i = MONTHS.findIndex((M) => M.toLowerCase() === w || (w.length >= 3 && M.toLowerCase().startsWith(w)));
    if (i >= 0) { month = i; break; }
  }
  if (month < 0) {
    for (const w of words) {
      if (w.length < 4) continue;
      const i = MONTHS.findIndex((M) => lev(M.toLowerCase(), w) <= 2);
      if (i >= 0) { month = i; spelled = false; break; }
    }
  }
  if (month < 0) return { ok: false, why: /\d+\s*[/.-]\s*\d+/.test(t) ? 'format' : 'other' };
  if (day === item.d && month === item.m) return spelled ? { ok: true } : { ok: false, why: 'spell' };
  if (day === item.trap) return { ok: false, why: 'distract' };
  return { ok: false, why: 'other' };
}

function clockSaid(h, m) {
  const nx = h % 12 + 1;
  if (Math.random() < 0.5) {
    if (!m) return `${numWords(h)} o'clock`;
    return `${numWords(h)} ${m < 10 ? 'oh ' + numWords(m) : numWords(m)}`;
  }
  if (!m) return `${numWords(h)} o'clock`;
  if (m === 15) return `quarter past ${numWords(h)}`;
  if (m === 30) return `half past ${numWords(h)}`;
  if (m === 45) return `quarter to ${numWords(nx)}`;
  if (m < 30) return `${numWords(m)} past ${numWords(h)}`;
  return `${numWords(60 - m)} to ${numWords(nx)}`;
}
function genTime() {
  const h = rnd(1, 11), m = pick([0, 5, 10, 15, 20, 30, 40, 45, 50, 15, 45]);
  const ans = `${h}:${pad2(m)}`;
  if (Math.random() < 0.25) {
    const h0 = h % 12 + 1, m0 = pick([0, 15, 30]);
    return { label: 'Saturday start', ans, h, m, trap: [h0, m0], say: `On weekdays it starts at ${clockSaid(h0, m0)}, but on Saturdays it's ${clockSaid(h, m)}.`, show: `On weekdays it starts at ${h0}:${pad2(m0)}, but on Saturdays it's <b>${ans}</b>.` };
  }
  const [label, f] = pick([['Start time', (s) => `The tour starts at ${s}.`], ['Departure', (s) => `The coach leaves at ${s}.`], ['Meeting time', (s) => `Let's meet at ${s}, outside the library.`], ['Check-in', (s) => `You can check in from ${s}.`]]);
  return { label, ans, h, m, say: f(clockSaid(h, m)), show: f(`<b>${ans}</b>`) };
}
function checkTime(item, inp) {
  const t = String(inp).toLowerCase();
  if (!t.trim()) return { ok: false, why: 'blank' };
  const mm = t.match(/(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?/);
  if (!mm) return { ok: false, why: 'format' };
  const h = Number(mm[1]) % 12 || 12, m = Number(mm[2] || 0);
  if (h === item.h && m === item.m) return { ok: true };
  if (item.trap && h === item.trap[0] && m === item.trap[1]) return { ok: false, why: 'distract' };
  // "quarter to nine" viết thành 9:15 / 9:45, "twenty past six" viết thành 6:40…
  if (item.m && (m === item.m || m === 60 - item.m || m === (item.m + 30) % 60) && Math.abs(h - item.h) <= 1) return { ok: false, why: 'clock' };
  return { ok: false, why: 'other' };
}

function genCode() {
  const L = 'ABDEFGHJLNPQRSTUWXYZ';
  const lt = () => L[rnd(0, L.length - 1)];
  if (Math.random() < 0.5) {
    const pc = `${pick(['CB', 'OX', 'BS', 'LS', 'YO', 'EH', 'NW', 'SE', 'BN', 'GL', 'RG', 'TN'])}${rnd(1, 9)} ${rnd(1, 9)}${lt()}${lt()}`;
    return { label: 'Postcode', ans: pc, say: `And the postcode is ${spellGroups(pc)}.`, show: `And the postcode is <b>${pc}</b>.` };
  }
  let ref = `${lt()}${lt()}${rnd(1000, 9999)}`;
  if (Math.random() < 0.5) ref = ref.slice(0, 3) + ref[2] + ref.slice(4); // một cặp số giống nhau
  const [label, f] = pick([['Booking reference', (s) => `Your booking reference is ${s}.`], ['Membership number', (s) => `Your membership number is ${s}.`]]);
  return { label, ans: ref, say: f(spellOut(ref)), show: f(`<b>${ref}</b>`) };
}
function checkCode(item, inp) {
  const got = alnum(inp), ans = alnum(item.ans);
  if (!String(inp).trim()) return { ok: false, why: 'blank' };
  if (!got) return { ok: false, why: 'other' };
  return got === ans ? { ok: true } : { ok: false, why: charReason(got, ans) };
}

const GEN = { spell: genSpell, phone: genPhone, teen: genTeen, price: genPrice, date: genDate, time: genTime, code: genCode };
const CHECK = { spell: checkSpell, phone: checkPhone, teen: checkTeen, price: checkPrice, date: checkDate, time: checkTime, code: checkCode };
const SIZE_NUM = 10, SIZE_DICT = 6;
/** Dùng cho kiểm thử. */
export const _lt = { GEN, CHECK };
function makeItem(cat) {
  const voice = pickVoice();
  return { cat, voice, plays: 0, input: '', res: null, ...GEN[cat](voice) };
}

// ---------------------------------------------------------------- L2: nghe chép
export const LS = { state: 'idle', sentences: [] };
export async function loadListening() {
  if (LS.state === 'loading' || LS.state === 'ready') return;
  LS.state = 'loading';
  try {
    const r = await fetch('content/listening/dictation.json');
    if (!r.ok) throw new Error(`dictation.json: ${r.status}`);
    LS.sentences = (await r.json()).sentences || [];
    LS.state = 'ready';
  } catch (e) {
    console.error(e);
    LS.state = 'error';
  }
}
const DSRC = {
  p12: { name: 'Part 1–2', sub: 'Đặt chỗ, hỏi thông tin, giới thiệu địa điểm' },
  p34: { name: 'Part 3–4', sub: 'Thảo luận bài tập, bài giảng' },
  mine: { name: 'Câu của bạn', sub: 'Câu ví dụ trong các từ bạn đã thêm' },
};
function myExamples() {
  const out = [];
  for (const w of S.words.values()) {
    (w.examples || []).forEach((t, i) => {
      const n = String(t).trim().split(/\s+/).length;
      if (n >= 5 && n <= 28 && /^[\x20-\x7E’‘“”—–]+$/.test(t)) out.push({ id: `w:${w.id}:${i}`, t: String(t).trim() });
    });
  }
  return out;
}
function dictPool(src) {
  if (src === 'mine') return myExamples();
  const parts = src === 'p34' ? [3, 4] : [1, 2];
  return LS.sentences.filter((x) => parts.includes(x.p));
}
/** Chia câu thành đoạn ngắn để nghe từng đoạn: theo dấu phẩy, đoạn dài quá 7 từ thì chia đôi. */
function chunks(text) {
  const out = [];
  for (const part of text.split(/(?<=,)\s+/)) {
    const w = part.split(/\s+/);
    if (w.length > 7) { const h = Math.ceil(w.length / 2); out.push(w.slice(0, h).join(' '), w.slice(h).join(' ')); } else out.push(part);
  }
  return out.length > 4 ? [text] : out;
}

const CONTR = {
  "it's": 'it is', "that's": 'that is', "there's": 'there is', "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "i'd": 'i would',
  "we'd": 'we would', "you'd": 'you would', "they'd": 'they would', "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will', "there'll": 'there will',
  "it'll": 'it will', "won't": 'will not', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not',
  "weren't": 'were not', "can't": 'can not', cannot: 'can not', "couldn't": 'could not', "shouldn't": 'should not', "wouldn't": 'would not', "haven't": 'have not',
  "hasn't": 'has not', "i've": 'i have', "we've": 'we have', "you've": 'you have', "they've": 'they have', "let's": 'let us', "what's": 'what is', "here's": 'here is',
  "she's": 'she is', "he's": 'he is', "who's": 'who is', "name's": 'name is', "ought": 'ought',
};
// Chính tả Anh – Mỹ đều được chấp nhận.
const VARIANT = {
  colour: 'color', colours: 'colors', favourite: 'favorite', neighbour: 'neighbor', neighbours: 'neighbors', centre: 'center', centres: 'centers', theatre: 'theater',
  organiser: 'organizer', organisers: 'organizers', criticised: 'criticized', programme: 'program', programmes: 'programs', travelling: 'traveling', travelled: 'traveled',
  cancelled: 'canceled', enrol: 'enroll', enrolment: 'enrollment', catalogue: 'catalog', licence: 'license', grey: 'gray', metre: 'meter', metres: 'meters', kilometre: 'kilometer',
  kilometres: 'kilometers', litre: 'liter', litres: 'liters', behaviour: 'behavior', labour: 'labor', analyse: 'analyze', realise: 'realize', recognise: 'recognize',
  organise: 'organize', organised: 'organized', apologise: 'apologize', jewellery: 'jewelry', cheque: 'check', tyre: 'tire', defence: 'defense', practise: 'practice',
};
/** Chuẩn hoá thành dãy từ để so: chữ thường, bỏ dấu câu, tách từ ghép, mở dạng rút gọn, số viết bằng chữ → số. */
export const tokens = (text) => tokensD(text).map((x) => x.n);
/** Như tokens, kèm cách viết để hiện (số giữ nguyên như trong câu: "two", "forty-eight"). */
function tokensD(text) {
  const raw = String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”"!?;:()]/g, ' ').replace(/(\d),(\d{3})/g, '$1$2').replace(/[.,](?=\s|$)/g, ' ').replace(/[—–]/g, ' ')
    .split(/\s+/).filter(Boolean);
  const out = [];
  for (let w of raw) {
    w = w.replace(/^'+|'+$/g, '');
    if (!w) continue;
    if (w in WORD_NUM) { out.push({ n: String(WORD_NUM[w]), d: w }); continue; } // "forty-eight" → 48
    if (CONTR[w]) { out.push(...CONTR[w].split(' ').map((x) => ({ n: x, d: x }))); continue; }
    for (const p of w.split('-').filter(Boolean)) out.push({ n: p in WORD_NUM ? String(WORD_NUM[p]) : VARIANT[p] || p, d: p });
  }
  // "twenty thousand" → 20000, "two hundred" → 200
  const res = [];
  for (const t of out) {
    const prev = res[res.length - 1];
    if ((t.n === 'thousand' || t.n === 'hundred') && /^\d+$/.test(prev?.n || '')) res[res.length - 1] = { n: String(Number(prev.n) * (t.n === 'thousand' ? 1000 : 100)), d: `${prev.d} ${t.d}` };
    else res.push(t);
  }
  return res;
}
/** Căn hai dãy từ (câu đúng a, câu gõ b) → các bước: ok | sub | del (thiếu) | ins (thừa). */
export function align(a, b) {
  const n = a.length, m = b.length;
  const D = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)]);
  for (let j = 1; j <= m; j++) D[0][j] = j;
  const near = (x, y) => lev(x, y) <= Math.max(1, Math.floor(x.length / 3)) || endingPair(x, y);
  const cost = (x, y) => (x === y ? 0 : near(x, y) ? 0.6 : 1.4);
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j - 1] + cost(a[i - 1], b[j - 1]), D[i - 1][j] + 1, D[i][j - 1] + 1);
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && Math.abs(D[i][j] - (D[i - 1][j - 1] + cost(a[i - 1], b[j - 1]))) < 1e-9) { ops.push(a[i - 1] === b[j - 1] ? { t: 'ok', a: a[i - 1] } : { t: 'sub', a: a[i - 1], b: b[j - 1] }); i--; j--; }
    else if (i > 0 && Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) { ops.push({ t: 'del', a: a[i - 1] }); i--; }
    else { ops.push({ t: 'ins', b: b[j - 1] }); j--; }
  }
  return ops.reverse();
}
const SMALL = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'by', 'with', 'from', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should', 'it', 'that', 'this', 'there', 'as', 'up', 'so', 'if', 'not', 'than', 'into', 'about', 'i',
  'you', 'we', 'they', 'he', 'she', 'us', 'me', 'my', 'your', 'our', 'their', 'its', 'some', 'any', 'very', 'just', 'them', 'his', 'her']);
function endingPair(x, y) {
  if (x === y) return false;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  return ['s', 'es', 'ed', 'd', "'s"].some((e) => l === s + e) || (s.endsWith('y') && l === s.slice(0, -1) + 'ies');
}
export function errType(op) {
  if (op.t === 'del') return SMALL.has(op.a) ? 'small' : 'word';
  if (op.t === 'ins') return 'extra';
  if (op.t !== 'sub') return null;
  if (endingPair(op.a, op.b)) return 'ending';
  if (SMALL.has(op.a) && SMALL.has(op.b)) return 'small';
  const lim = op.a.length <= 4 ? 1 : op.a.length <= 8 ? 2 : 3;
  return lev(op.a, op.b) <= lim ? 'spell' : 'word';
}
const DERR = {
  small: ['Từ nhỏ bị nuốt', 'a, the, of, to, is… được đọc lướt thành âm /ə/. Nghe cả cụm: “a lot of” = /əˈlɒtəv/.'],
  ending: ['Đuôi -s / -ed', 'Âm /s/ /z/ /ɪz/ và /t/ /d/ ở cuối từ rất nhẹ. Trong bài thi, thiếu s là sai.'],
  spell: ['Sai chính tả', 'Nghe ra nhưng viết sai. Ôn lại những từ này trong phần từ vựng.'],
  word: ['Không nghe ra từ', 'Bấm “Từng đoạn” để nghe chậm phần khó, rồi nghe cả câu lại.'],
  extra: ['Thừa từ', 'Viết đúng những gì nghe được, không tự thêm từ.'],
};
function gradeDict(item) {
  const A = tokensD(item.t), B = tokensD(item.input);
  const ops = align(A.map((x) => x.n), B.map((x) => x.n));
  // Gắn cách viết để hiện: từ câu đúng theo thứ tự, từ câu gõ theo thứ tự.
  let i = 0, j = 0;
  for (const o of ops) { if (o.t !== 'ins') o.ad = A[i++].d; if (o.t !== 'del') o.bd = B[j++].d; }
  const ref = ops.filter((o) => o.t !== 'ins').length;
  const ok = ops.filter((o) => o.t === 'ok').length;
  const errs = {};
  for (const o of ops) { const e = errType(o); if (e) errs[e] = (errs[e] || 0) + 1; }
  return { ops, pct: ref ? Math.round((ok / ref) * 100) : 0, perfect: ops.every((o) => o.t === 'ok'), errs };
}
function diffHtml(ops) {
  return ops.map((o) => {
    const a = o.ad ?? o.a, b = o.bd ?? o.b;
    if (o.t === 'ok') return `<span class="ls-ok">${esc(a)}</span>`;
    if (o.t === 'del') return `<span class="ls-miss">${esc(a)}</span>`;
    if (o.t === 'ins') return `<s class="ls-extra">${esc(b)}</s>`;
    return `<span class="ls-sub"><s>${esc(b)}</s> ${esc(a)}</span>`;
  }).join(' ');
}

// ---------------------------------------------------------------- Phiên luyện
let N = null; // phiên nghe số và chính tả
let D = null; // phiên nghe chép
const ui = { src: 'p12' };
const stats = () => S.listening || (S.listening = { sets: [], cat: {}, err: {}, miss: [], seen: [] });

function newNumSet(cat) {
  let cats;
  if (cat === 'mix') cats = shuffle([...CAT_IDS, ...shuffle(CAT_IDS).slice(0, SIZE_NUM - CAT_IDS.length)]);
  else if (cat.startsWith('redo:')) { const c = cat.slice(5).split(',').filter((x) => GEN[x]); cats = Array.from({ length: SIZE_NUM }, (_, i) => c[i % c.length]); }
  else cats = Array(SIZE_NUM).fill(cat);
  N = { id: 'L:' + uid(), kind: 'num', cat: cat.startsWith('redo:') ? 'redo' : cat, items: cats.map(makeItem), i: 0, stage: 'q', saved: false };
}
function newDictSet(src) {
  const pool = dictPool(src);
  const seen = new Set(stats().seen);
  const fresh = shuffle(pool.filter((x) => !seen.has(x.id)));
  const list = (fresh.length >= SIZE_DICT ? fresh : [...fresh, ...shuffle(pool.filter((x) => seen.has(x.id)))]).slice(0, SIZE_DICT);
  D = { id: 'L:' + uid(), kind: 'dict', cat: src, items: list.map((x) => ({ id: x.id, t: x.t, voice: pickVoice(), plays: 0, input: '', res: null })), i: 0, stage: 'q', saved: false };
}
function playNum(it, rate = 0) {
  if (S.settings.listenOnce && it.plays >= 1 && !it.res) { toast('Chế độ thi: chỉ nghe 1 lần'); return; }
  it.plays++;
  say(it.say, { voice: it.voice, rate });
  const c = document.getElementById('ls-plays');
  if (c) c.textContent = playsText(it);
}
const playsText = (it) => (it.plays ? `Đã nghe ${it.plays} lần` : 'Chưa nghe');

/** Lưu bộ đã làm (khi xong, hoặc khi thoát giữa chừng mà đã làm được quá nửa) và tính một lượt trong ngày. */
// Câu đã trả lời thật: bỏ qua câu bấm "Kiểm tra" khi ô còn trống (bấm nhầm, bỏ qua).
const answered = (x) => x.res && x.res.why !== 'blank';
async function saveSet(P) {
  if (!P || P.saved) return;
  const done = P.items.filter(answered);
  if (!done.length) { if (P.stage === 'done') toast('Bạn chưa trả lời câu nào nên bài này không được lưu'); return; }
  if (done.length < Math.ceil(P.items.length / 2)) return;
  P.saved = true;
  const st = stats();
  const rec = { id: P.id, kind: P.kind, cat: P.cat, date: today(), at: Date.now(), n: done.length };
  if (P.kind === 'num') { rec.ok = done.filter((x) => x.res.ok).length; rec.first = done.filter((x) => x.res.ok && x.plays <= 1).length; } else {
    rec.ok = done.filter((x) => x.res.perfect).length;
    rec.pct = Math.round(done.reduce((a, x) => a + x.res.pct, 0) / done.length);
  }
  st.sets = [...st.sets, rec].slice(-300);
  await saveListening();
  await logGrammarDay('lSets', P.id);
}

// ---------------------------------------------------------------- Hành động
on('ls-num', (el) => {
  newNumSet(el.dataset.cat || 'mix');
  playNum(N.items[0]);
  go('#/lnum');
});
on('ls-dict', (el) => {
  const src = el.dataset.src || ui.src;
  if (dictPool(src).length < 3) { toast(src === 'mine' ? 'Cần ít nhất 3 câu ví dụ trong từ vựng của bạn' : 'Chưa tải được câu nghe chép'); return; }
  newDictSet(src);
  const it = D.items[0];
  it.plays++;
  say(it.t, { voice: it.voice });
  go('#/ldict');
});
on('ls-src', (el) => { ui.src = el.dataset.src; rerender(); });
on('ls-set', async (el) => {
  const k = el.dataset.key;
  const v = k === 'listenRate' ? Number(el.dataset.value) : k === 'listenOnce' ? !S.settings.listenOnce : el.dataset.value;
  await saveSettings({ [k]: v });
  rerender();
  if (k === 'listenAccent' || k === 'listenRate') say('The museum is open from nine until half past five, Tuesday to Sunday.', { voice: pickVoice() });
});
on('ls-hear', (el) => say(el.dataset.text, { voice: pickVoice() }));
on('ls-play', (el) => {
  if (N && location.hash.startsWith('#/lnum')) playNum(N.items[N.i], el.dataset.slow ? 0.75 : 0);
  else if (D) {
    const it = D.items[D.i];
    const ch = el.dataset.chunk != null ? chunks(it.t)[Number(el.dataset.chunk)] : null;
    it.plays++;
    say(ch || it.t, { voice: it.voice, rate: el.dataset.slow ? 0.7 : 0 });
  }
});
on('ls-in', (el) => {
  const P = location.hash.startsWith('#/lnum') ? N : D;
  if (P?.items[P.i]) P.items[P.i].input = el.value;
});
on('ls-check', async () => {
  if (location.hash.startsWith('#/lnum')) {
    const it = N?.items[N.i];
    if (!it || it.res) return;
    it.input = document.getElementById('ls-in')?.value ?? it.input;
    if (!it.plays) { toast('Bấm Nghe trước đã'); return; }
    hush();
    it.res = CHECK[it.cat](it, it.input);
    const st = stats();
    // Ô trống (bấm nhầm / bỏ qua) không tính vào thống kê.
    if (it.res.why !== 'blank') {
      const c = st.cat[it.cat] || (st.cat[it.cat] = { n: 0, ok: 0 });
      c.n++;
      if (it.res.ok) c.ok++; else st.err[it.res.why] = (st.err[it.res.why] || 0) + 1;
      await saveListening();
    }
    rerender();
    return;
  }
  const it = D?.items[D.i];
  if (!it || it.res) return;
  it.input = document.getElementById('ls-in')?.value ?? it.input;
  if (!it.input.trim()) { toast('Gõ lại những gì bạn nghe được'); return; }
  hush();
  it.res = gradeDict(it);
  const st = stats();
  for (const [k, v] of Object.entries(it.res.errs)) st.err['d' + k] = (st.err['d' + k] || 0) + v;
  const missed = it.res.ops.filter((o) => (o.t === 'del' || o.t === 'sub') && !SMALL.has(o.a) && ['word', 'spell'].includes(errType(o))).map((o) => o.a).filter((w) => !/^\d+$/.test(w));
  st.miss = [...st.miss.filter((x) => !missed.includes(x.w)), ...missed.map((w) => ({ w, at: Date.now() }))].slice(-100);
  st.seen = [...st.seen.filter((x) => x !== it.id), it.id].slice(-300);
  await saveListening();
  rerender();
});
on('ls-next', async () => {
  const P = location.hash.startsWith('#/lnum') ? N : D;
  if (!P) return;
  if (P.i + 1 < P.items.length) {
    P.i++;
    const it = P.items[P.i];
    if (P === N) playNum(it); else { it.plays++; say(it.t, { voice: it.voice }); }
    rerender(true);
    return;
  }
  hush();
  P.stage = 'done';
  await saveSet(P);
  rerender(true);
});
on('ls-quit', async () => {
  const P = location.hash.startsWith('#/lnum') ? N : D;
  hush();
  if (P && P.stage !== 'done') {
    const done = P.items.filter(answered).length;
    const half = Math.ceil(P.items.length / 2);
    if (done && !(await confirmSheet({ title: 'Dừng bộ này?', body: done >= half ? 'Phần đã làm được lưu và tính một lượt hôm nay.' : `Làm được ${done}/${P.items.length} câu. Cần làm ít nhất ${half} câu mới được tính một lượt.`, okLabel: 'Dừng' }))) return;
    await saveSet(P);
  }
  if (P === N) N = null; else D = null;
  back('#/listening');
});
on('ls-redo', () => {
  const wrong = [...new Set(N.items.filter((x) => x.res && !x.res.ok).map((x) => x.cat))];
  newNumSet(wrong.length ? 'redo:' + wrong.join(',') : N.cat);
  playNum(N.items[0]);
  rerender(true);
});
on('ls-again-dict', () => {
  newDictSet(D.cat);
  const it = D.items[0];
  it.plays++;
  say(it.t, { voice: it.voice });
  rerender(true);
});

// ---------------------------------------------------------------- Màn hình chung
const ring = (value, goal) => {
  const c = 2 * Math.PI * 24;
  const p = goal ? Math.min(1, value / goal) : 0;
  return `<svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="24"/><circle class="fg" cx="30" cy="30" r="24" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
};
export const todayListening = () => (dayOf().lSets || []).length;
const pct = (c) => (c?.n ? Math.round((c.ok / c.n) * 100) : null);
/** Dạng yếu nhất (đã làm ít nhất 5 câu), hoặc dạng chưa làm. */
export function weakestCat() {
  const st = stats();
  const untried = CAT_IDS.find((c) => !st.cat[c]?.n);
  if (untried) return { cat: untried, p: null };
  const list = CAT_IDS.filter((c) => st.cat[c].n >= 5).map((c) => ({ cat: c, p: pct(st.cat[c]) })).sort((a, b) => a.p - b.p);
  return list[0] && list[0].p < 90 ? list[0] : null;
}
function topBar(P, title) {
  const w = Math.round(((P.i + (P.items[P.i]?.res ? 1 : 0)) / P.items.length) * 100);
  return `<div class="ses-top"><button class="iconbtn" data-act="ls-quit" aria-label="Thoát">${icon('x')}</button><div class="progress" aria-label="${esc(title)}"><i style="width:${w}%"></i></div><span class="count">${P.i + 1}/${P.items.length}</span></div>`;
}
const playBtn = (label = 'Nghe', extra = '') => `<button class="btn soft ls-play" data-act="ls-play" ${extra}>${icon('speaker', 'sm')} ${label}</button>`;
const INPUT_ATTR = 'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"';

// ---------------------------------------------------------------- L1: màn hình
export function numView() {
  if (!N) return { html: `<div class="page">${emptyBack()}</div>` };
  if (N.stage === 'done') return numDone();
  const it = N.items[N.i];
  const once = S.settings.listenOnce;
  const field = `<label class="ls-field"><span class="ls-label">${esc(it.label)}:</span>${it.pre ? `<span class="muted">${esc(it.pre)}</span>` : ''}
    <input id="ls-in" class="input" data-in="ls-in" value="${esc(it.input)}" ${INPUT_ATTR} ${it.res ? 'readonly' : ''} enterkeyhint="done" aria-label="Đáp án">${it.unit ? `<span class="muted">${esc(it.unit)}</span>` : ''}</label>`;
  let fb = '';
  if (it.res) {
    const [t, tip] = it.res.ok ? [] : REASON[it.res.why] || REASON.other;
    fb = `<div class="ls-fb ${it.res.ok ? 'good' : 'bad'}">
      <b>${it.res.ok ? `${icon('check', 'sm')} Đúng${it.plays > 1 ? ` (nghe ${it.plays} lần)` : ''}` : `${icon('x', 'sm')} ${esc(t)}`}</b>
      ${it.res.ok ? '' : `<p>Đáp án: <b>${esc(it.ans)}</b>${it.input.trim() ? ` · bạn viết: <s>${esc(it.input)}</s>` : ''}</p><p class="small">${esc(tip)}</p>`}</div>
      <div class="card ls-tr"><p class="small muted">Người nói (giọng ${accentName(it.voice)}):</p><p>${it.show}</p></div>`;
  }
  const playRow = `<div class="btn-row ls-playrow">${playBtn(it.plays ? 'Nghe lại' : 'Nghe', once && it.plays && !it.res ? 'disabled' : '')}${once && !it.res ? '' : `<button class="btn ghost ls-play" data-act="ls-play" data-slow="1" style="flex:.6">Chậm</button>`}</div>`;
  const body = `<p class="mode-label">${esc(CATS[it.cat].name)}</p>
    <div class="card ls-q">${playRow}<p class="small faint center" id="ls-plays" style="margin-top:6px">${once && !it.res ? 'Chế độ thi: chỉ nghe 1 lần · ' : ''}${playsText(it)}</p>
      <form data-submit="ls-check" style="margin-top:14px">${field}</form></div>${fb}`;
  const actions = it.res
    ? `<button class="btn" data-act="ls-next">${N.i + 1 < N.items.length ? 'Câu tiếp theo' : 'Xem kết quả'}</button>`
    : `<button class="btn" data-act="ls-check">Kiểm tra</button>`;
  return { html: `<div class="page session compact ls-page">${topBar(N, 'Nghe số')}<div class="ses-body">${body}</div><div class="ses-actions">${actions}</div></div>`, focus: it.res ? null : '#ls-in' };
}
function numDone() {
  const done = N.items.filter((x) => x.res);
  const ok = done.filter((x) => x.res.ok).length, first = done.filter((x) => x.res.ok && x.plays <= 1).length;
  const byCat = {};
  for (const x of done) { const c = byCat[x.cat] || (byCat[x.cat] = { n: 0, ok: 0 }); c.n++; if (x.res.ok) c.ok++; }
  const wrong = done.filter((x) => !x.res.ok);
  const why = {};
  for (const x of wrong) why[x.res.why] = (why[x.res.why] || 0) + 1;
  const topWhy = Object.entries(why).sort((a, b) => b[1] - a[1])[0];
  return { html: `<div class="page session ls-page"><div class="ses-top"><button class="iconbtn" data-act="ls-quit" aria-label="Thoát">${icon('x')}</button><div class="progress"><i style="width:100%"></i></div><span class="count">Xong</span></div><div class="ses-body">
    <p class="mode-label">Kết quả</p>
    <div class="tiles sp-tiles"><div class="tile"><b>${ok}/${done.length}</b><span>đúng</span></div><div class="tile"><b>${first}</b><span>đúng ngay lần nghe đầu</span></div></div>
    ${topWhy ? `<div class="banner info" style="margin-top:12px">${icon('info')}<span><b>Lỗi nhiều nhất: ${esc(REASON[topWhy[0]]?.[0] || '')}</b> (${topWhy[1]} câu). ${esc(REASON[topWhy[0]]?.[1] || '')}</span></div>` : `<div class="banner info" style="margin-top:12px">${icon('check')}<span>Không sai câu nào. Thử bật “Chỉ nghe 1 lần” hoặc tốc độ Nhanh trong Cài đặt Listening.</span></div>`}
    ${Object.keys(byCat).length > 1 ? `<div class="card" style="margin-top:12px">${Object.entries(byCat).map(([c, v]) => `<div class="row-between ls-catline"><span>${esc(CATS[c].name)}</span><b>${v.ok}/${v.n}</b></div>`).join('')}</div>` : ''}
    ${wrong.length ? `<h4 class="sp-h">Câu sai</h4><div class="card">${wrong.map((x) => `<div class="ls-wrong"><p class="small muted">${esc(x.label)} · ${esc(REASON[x.res.why]?.[0] || '')}</p><p>${x.show}</p>${x.input.trim() ? `<p class="small">Bạn viết: <s>${esc(x.input)}</s></p>` : ''}</div>`).join('')}</div>` : ''}
  </div><div class="ses-actions"><div class="btn-row"><button class="btn ghost" data-act="ls-quit">Xong</button><button class="btn" data-act="ls-redo">${wrong.length ? 'Luyện tiếp dạng còn sai' : 'Làm bộ mới'}</button></div></div></div>` };
}

// ---------------------------------------------------------------- L2: màn hình
export function dictView() {
  if (!D) return { html: `<div class="page">${emptyBack()}</div>` };
  if (D.stage === 'done') return dictDone();
  const it = D.items[D.i];
  const ch = chunks(it.t);
  const playRow = `<div class="btn-row ls-playrow">${playBtn(it.plays ? 'Nghe lại' : 'Nghe')}<button class="btn ghost ls-play" data-act="ls-play" data-slow="1" style="flex:.6">Chậm</button></div>
    ${ch.length > 1 ? `<div class="ls-chunks"><span class="small muted">Từng đoạn:</span>${ch.map((_, i) => `<button class="tag" data-act="ls-play" data-chunk="${i}">${i + 1}</button>`).join('')}</div>` : ''}`;
  let fb = '';
  if (it.res) {
    const errs = Object.entries(it.res.errs).sort((a, b) => b[1] - a[1]);
    fb = `<div class="ls-fb ${it.res.perfect ? 'good' : 'bad'}"><b>${it.res.perfect ? `${icon('check', 'sm')} Đúng cả câu` : `Đúng ${it.res.pct}% số từ`}</b>
      ${it.res.perfect ? '' : `<p class="ls-diff">${diffHtml(it.res.ops)}</p><p class="small muted ls-legend"><span class="ls-miss">thiếu</span> <span class="ls-sub"><s>sai</s> đúng</span> <s class="ls-extra">thừa</s></p>`}</div>
      ${errs.length ? `<div class="card ls-errs">${errs.map(([k, v]) => `<div><b>${esc(DERR[k][0])}</b> · ${v}<p class="small muted">${esc(DERR[k][1])}</p></div>`).join('')}</div>` : ''}
      <div class="card ls-tr"><p class="small muted">Câu đúng (giọng ${accentName(it.voice)}):</p><p>${esc(it.t)}</p></div>`;
  }
  const body = `<p class="mode-label">Nghe chép · ${esc(DSRC[D.cat].name)}</p>
    <div class="card ls-q">${playRow}
      <form data-submit="ls-check" style="margin-top:12px"><textarea id="ls-in" class="input ls-tx" data-in="ls-in" rows="3" placeholder="Gõ lại câu bạn nghe được" ${INPUT_ATTR} ${it.res ? 'readonly' : ''}>${esc(it.input)}</textarea></form></div>${fb}`;
  const actions = it.res
    ? `<button class="btn" data-act="ls-next">${D.i + 1 < D.items.length ? 'Câu tiếp theo' : 'Xem kết quả'}</button>`
    : `<button class="btn" data-act="ls-check">Kiểm tra</button>`;
  return { html: `<div class="page session compact ls-page">${topBar(D, 'Nghe chép')}<div class="ses-body">${body}</div><div class="ses-actions">${actions}</div></div>`, focus: it.res ? null : '#ls-in' };
}
function dictDone() {
  const done = D.items.filter((x) => x.res);
  const avg = done.length ? Math.round(done.reduce((a, x) => a + x.res.pct, 0) / done.length) : 0;
  const errs = {};
  for (const x of done) for (const [k, v] of Object.entries(x.res.errs)) errs[k] = (errs[k] || 0) + v;
  const list = Object.entries(errs).sort((a, b) => b[1] - a[1]);
  return { html: `<div class="page session ls-page"><div class="ses-top"><button class="iconbtn" data-act="ls-quit" aria-label="Thoát">${icon('x')}</button><div class="progress"><i style="width:100%"></i></div><span class="count">Xong</span></div><div class="ses-body">
    <p class="mode-label">Kết quả nghe chép</p>
    <div class="tiles sp-tiles"><div class="tile"><b>${avg}%</b><span>số từ đúng</span></div><div class="tile"><b>${done.filter((x) => x.res.perfect).length}/${done.length}</b><span>câu đúng cả câu</span></div></div>
    ${list.length ? `<h4 class="sp-h">Bạn hay mất điểm ở</h4><div class="card ls-errs">${list.map(([k, v]) => `<div><b>${esc(DERR[k][0])}</b> · ${v} lần<p class="small muted">${esc(DERR[k][1])}</p></div>`).join('')}</div>` : ''}
    <h4 class="sp-h">Các câu</h4><div class="card">${done.map((x) => `<div class="ls-wrong"><p class="small muted">${x.res.pct}%</p><p>${esc(x.t)}</p><button class="tag" data-act="ls-hear" data-text="${esc(x.t)}">${icon('speaker', 'sm')} Nghe</button></div>`).join('')}</div>
  </div><div class="ses-actions"><div class="btn-row"><button class="btn ghost" data-act="ls-quit">Xong</button><button class="btn" data-act="ls-again-dict">Làm bộ mới</button></div></div></div>` };
}
const emptyBack = () => `<div class="empty" style="padding-top:20vh"><h3>Bộ luyện đã kết thúc</h3><p>Mở lại từ trang Listening.</p><button class="btn" style="margin-top:14px" data-act="go" data-to="#/listening">Về Listening</button></div>`;

// ---------------------------------------------------------------- Trang chính
const ERR_NAME = { ...Object.fromEntries(Object.entries(REASON).map(([k, v]) => [k, v])), ...Object.fromEntries(Object.entries(DERR).map(([k, v]) => ['d' + k, v])) };
export function listeningView() {
  const head = `<header class="top"><div><p class="eyebrow">Nghe số, chính tả và nghe chép</p><h1>Listening</h1></div></header>${learnSwitch('listening')}`;
  const st = stats();
  const goal = S.settings.listeningPerDay ?? 1, done = todayListening();
  const weak = weakestCat();
  const todayCard = `<div class="card"><div class="row-between"><div style="min-width:0"><p class="small muted">${goal ? `Hôm nay: ${done}/${goal} lượt` : `Hôm nay: ${done} lượt`}</p>
      ${weak ? `<b style="display:block;margin-top:4px">Gợi ý: ${esc(CATS[weak.cat].name)}</b><p class="small muted">${weak.p == null ? 'Bạn chưa luyện dạng này' : `Đang đúng ${weak.p}%, thấp nhất trong các dạng`}</p>` : ''}</div>${goal ? ring(done, goal) : ''}</div>
    <div class="btn-row" style="margin-top:14px"><button class="btn" data-act="ls-num" data-cat="${weak?.cat || 'mix'}">Nghe số &amp; chính tả</button><button class="btn ghost" data-act="ls-dict" data-src="${ui.src}">Nghe chép</button></div></div>`;
  const catRow = (id, name, sub, c) => {
    const p = pct(c);
    return `<div class="wrow" data-act="ls-num" data-cat="${id}" role="button"><span class="num ${p != null && p >= 80 ? 'done' : ''}">${p == null ? '–' : p + '%'}</span><div class="body"><span style="font-weight:600">${esc(name)}</span><p>${esc(sub)}</p></div>${icon('chev')}</div>`;
  };
  const numCard = `<h2>Nghe số &amp; chính tả · Part 1</h2><div class="wlist">${catRow('mix', 'Trộn cả 7 dạng', 'Như phần điền form ở Part 1', null)}${CAT_IDS.map((c) => catRow(c, CATS[c].name, CATS[c].sub, st.cat[c])).join('')}</div>
    <p class="small faint" style="margin:8px 2px 0">Số bên trái là tỉ lệ đúng của bạn ở dạng đó.</p>`;
  const nMine = myExamples().length;
  const dictCard = `<h2>Nghe chép</h2><div class="card">
    <div class="seg">${Object.entries(DSRC).map(([k, v]) => `<button class="${ui.src === k ? 'on' : ''}" data-act="ls-src" data-src="${k}">${esc(v.name)}</button>`).join('')}</div>
    <p class="small muted" style="margin-top:10px">${esc(DSRC[ui.src].sub)}${ui.src === 'mine' ? ` · ${nMine} câu` : ''}. Nghe từng câu, gõ lại; app chỉ ra từ bị thiếu, sai chính tả, sai đuôi -s/-ed.</p>
    <button class="btn" style="margin-top:12px" data-act="ls-dict" data-src="${ui.src}" ${ui.src === 'mine' && nMine < 3 ? 'disabled' : ''}>Bắt đầu nghe chép</button>
    ${ui.src === 'mine' && nMine < 3 ? '<p class="small faint" style="margin-top:6px">Cần ít nhất 3 câu ví dụ tiếng Anh trong các từ bạn đã thêm.</p>' : ''}</div>`;
  const errs = Object.entries(st.err).filter(([k, v]) => v && ERR_NAME[k]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const miss = st.miss.slice(-14).reverse();
  const errCard = errs.length || miss.length ? `<h2>Lỗi hay gặp</h2><div class="card ls-errs">
    ${errs.map(([k, v]) => `<div><b>${esc(ERR_NAME[k][0])}</b> · ${v} lần<p class="small muted">${esc(ERR_NAME[k][1])}</p></div>`).join('')}
    ${miss.length ? `<div><b>Từ hay nghe sót</b><p class="ls-misslist">${miss.map((x) => `<button class="tag" data-act="ls-hear" data-text="${esc(x.w)}">${esc(x.w)}</button>`).join('')}</p></div>` : ''}</div>` : '';
  const recent = st.sets.slice(-5).reverse();
  const recentCard = recent.length ? `<h2>Gần đây</h2><div class="card">${recent.map((r) => `<div class="row-between ls-catline"><span>${r.kind === 'num' ? esc(CATS[r.cat]?.name || (r.cat === 'mix' ? 'Trộn 7 dạng' : 'Luyện lại dạng sai')) : `Nghe chép · ${esc(DSRC[r.cat]?.name || '')}`} <span class="small muted">· ${fmtDate(r.date)}</span></span><b>${r.kind === 'num' ? `${r.ok}/${r.n}` : `${r.pct}%`}</b></div>`).join('')}</div>` : '';
  return `<div class="page">${head}${todayCard}<p class="small faint" style="margin:8px 2px 0">1 lượt = 1 bộ nghe số (${SIZE_NUM} câu), 1 bộ nghe chép (${SIZE_DICT} câu) hoặc 1 lần làm đề thật. Làm được quá nửa bộ cũng tính.</p>${ltestCard()}${numCard}${dictCard}${errCard}${recentCard}${settingsCard()}</div>`;
}
function settingsCard() {
  const s = S.settings;
  const seg = (key, cur, opts) => `<div class="seg ls-seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="ls-set" data-key="${key}" data-value="${v}">${l}</button>`).join('')}</div>`;
  const vs = voiceStock();
  let tip = '';
  if (!canSpeak()) tip = 'Máy này không đọc được thành tiếng.';
  else if (!vs.gb && !vs.au) tip = 'Máy chưa có giọng Anh hoặc Úc nên đang dùng giọng tiếng Anh khác.';
  else if (!vs.au) tip = 'Máy chưa có giọng Úc.';
  else if (!vs.gb) tip = 'Máy chưa có giọng Anh.';
  return `<h2>Cài đặt Listening</h2><div class="card">
    <div class="setrow col"><div><b>Giọng</b><small>Đề thi ở Việt Nam chủ yếu là giọng Anh và Úc</small></div>${seg('listenAccent', s.listenAccent || 'mix', [['mix', 'Trộn'], ['en-GB', 'Anh'], ['en-AU', 'Úc']])}</div>
    <div class="setrow col"><div><b>Tốc độ</b></div>${seg('listenRate', s.listenRate || 0.95, [[0.8, 'Chậm'], [0.95, 'Thường'], [1.05, 'Nhanh']])}</div>
    <div class="setrow"><div><b>Chỉ nghe 1 lần</b><small>Như khi thi: không nghe lại trước khi kiểm tra (nghe số &amp; chính tả)</small></div><button class="tag ${s.listenOnce ? 'on' : ''}" data-act="ls-set" data-key="listenOnce">${s.listenOnce ? 'Bật' : 'Tắt'}</button></div>
    <div class="setrow"><div><b>Giọng trên máy</b><small>${vs.gb} giọng Anh · ${vs.au} giọng Úc${vs.other ? ` · ${vs.other} giọng khác` : ''}${tip ? `. ${tip} Có thể tải thêm: Cài đặt iPhone → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Anh.` : ''}</small></div><button class="tag" data-act="ls-hear" data-text="The museum is open from nine until half past five, Tuesday to Sunday.">Nghe thử</button></div>
  </div>
  <p class="small faint" style="margin:14px 2px 0">Bài nghe dùng giọng đọc của máy. Bài nghe có hội thoại thật cho Part 1–4 sẽ được thêm sau.</p>`;
}
// Danh sách giọng thường về trễ → vẽ lại trang Listening khi có.
onVoices(() => { if (location.hash === '#/listening') rerender(); });
