// Cài đặt và danh sách từ đã lưu.
const DEF = { enabled: true, tl: 'vi', size: 26, showOrig: true, showTrans: true, pauseHover: true, pos: 10 };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEF, (cfg) => {
  for (const k of ['enabled', 'showOrig', 'showTrans', 'pauseHover']) {
    $(k).checked = !!cfg[k];
    $(k).addEventListener('change', () => chrome.storage.sync.set({ [k]: $(k).checked }));
  }
  $('tl').value = cfg.tl;
  $('tl').addEventListener('change', () => chrome.storage.sync.set({ tl: $('tl').value }));
  for (const [k, unit] of [['size', 'px'], ['pos', '%']]) {
    const show = () => { $(k + 'V').textContent = $(k).value + unit; };
    $(k).value = cfg[k]; show();
    $(k).addEventListener('input', show);
    $(k).addEventListener('change', () => chrome.storage.sync.set({ [k]: Number($(k).value) }));
  }
});

document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('section').forEach((s) => { s.hidden = s.id !== b.dataset.tab; });
}));

let words = [];
function draw() {
  $('count').textContent = words.length || '';
  $('csv').disabled = $('clear').disabled = !words.length;
  const list = $('list');
  list.textContent = '';
  if (!words.length) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="muted">Chưa có từ nào. Khi xem phim, chạm vào một từ trong phụ đề rồi bấm <b>Lưu từ</b>.</div>';
    list.append(li);
    return;
  }
  words.forEach((w, i) => {
    const li = document.createElement('li');
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = w.word;
    const m = document.createElement('span'); m.className = 'm'; m.textContent = w.meaning || '';
    const s = document.createElement('small'); s.textContent = w.examples?.[0] || ''; s.title = (w.examples || []).join('\n');
    d.append(b, m, s);
    const x = document.createElement('button'); x.textContent = '×'; x.title = 'Xoá';
    x.addEventListener('click', () => { words.splice(i, 1); chrome.storage.local.set({ words }); });
    li.append(d, x);
    list.append(li);
  });
}
chrome.storage.local.get({ words: [] }, (v) => { words = v.words; draw(); });
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.words) { words = ch.words.newValue || []; draw(); } });

// CSV theo đúng cột mà app Từ Vựng nhận khi nhập (Từ vựng → Nhập CSV/Excel).
const COLS = ['word', 'ipa', 'part_of_speech', 'meaning_vi', 'definition_en', 'examples', 'topic', 'notes'];
const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
$('csv').addEventListener('click', () => {
  const rows = [COLS].concat(words.map((w) => [
    w.word, w.ipa, w.pos, w.meaning, w.definition, (w.examples || []).join(' | '), 'Phụ đề phim',
    [(w.exTrans || []).filter(Boolean).join(' | '), w.source ? `Nguồn: ${w.source}` : ''].filter(Boolean).join('\n'),
  ]));
  const blob = new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tu-phu-de-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
});
$('clear').addEventListener('click', () => {
  if (confirm(`Xoá ${words.length} từ đã lưu? (Hãy tải CSV trước nếu chưa nhập vào app.)`)) chrome.storage.local.set({ words: [] });
});
