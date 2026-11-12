// Các màn hình: Statistics, Cài đặt (mục tiêu, giao diện, dữ liệu, AI), Trợ lý AI.
import { S, allWords, summary, series, saveSettings, deckName, wipeAll } from './store.js';
import { esc, toast, pickFile, fmtDate, speak, canSpeak, fold, englishVoices, onVoices, today, addDays } from './util.js';
import { isNew, isMastered } from './srs.js';
import { icon, on, go, rerender, navBar, confirmSheet, promptSheet, richText } from './ui.js';
import { importFile, exportCSV, exportBackup, restoreBackup, downloadTemplate, loadSeed } from './io.js';
import { roundInfo, bestRun } from './game.js';
import { bestDrop, DROP_ROUND } from './drop.js';
import { AI_ACTIONS, AI_MODELS, GEMINI_MODELS, aiReady, askAI } from './ai.js';

const ui = { statsKind: 'day', statsSel: null, anim: false, ai: { wordId: null, action: 'context', input: '', q: '', loading: false, result: null, error: null } };

// ================= STATISTICS =================
function mainChart() {
  const data = series(ui.statsKind);
  const max = Math.max(1, ...data.map((d) => d.n + d.r));
  const H = 140;
  const sel = ui.statsSel ?? data.length - 1;
  const d = data[sel];
  const bars = data.map((x, i) => {
    const hn = (x.n / max) * H, hr = (x.r / max) * H;
    return `<div class="bar ${i === sel ? 'sel' : ''}" style="--i:${i}" data-act="stats-sel" data-i="${i}" role="button" aria-label="${esc(x.label)}: ${x.n} từ mới, ${x.r} từ ôn">
      ${x.r ? `<i class="r" style="height:${Math.max(3, hr)}px"></i>` : ''}${x.n ? `<i class="n" style="height:${Math.max(3, hn)}px"></i>` : ''}</div>`;
  }).join('');
  const total = data.reduce((a, x) => a + x.n + x.r, 0);
  const anim = ui.anim;
  ui.anim = false;
  return `<div class="legend"><span><i style="background:var(--series-1)"></i>Từ mới</span><span><i style="background:var(--series-2)"></i>Từ ôn tập</span></div>
    <p class="readout"><b>${esc(d.label)}</b> · ${d.n} từ mới · ${d.r} từ ôn</p>
    <div class="bars ${anim ? 'anim' : ''}"><span class="maxline">${max}</span>${bars}</div>
    <div class="xlabels">${data.map((x, i) => `<span>${data.length > 10 && i % 2 ? '' : esc(x.short)}</span>`).join('')}</div>
    ${total ? '' : '<p class="small faint center" style="margin-top:10px">Chưa có hoạt động trong khoảng thời gian này.</p>'}
    <details><summary>Xem dạng bảng</summary><table class="data"><tr><th>Thời gian</th><th>Từ mới</th><th>Từ ôn</th></tr>
      ${data.slice().reverse().map((x) => `<tr><td>${esc(x.label)}</td><td>${x.n}</td><td>${x.r}</td></tr>`).join('')}</table></details>`;
}

// Thống kê mini game: tách riêng, không tính vào tiến độ học.
function gameStats() {
  const g = S.game;
  const r = roundInfo();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6)).map((d) => ({ date: d, ok: g.days[d]?.ok || 0, miss: g.days[d]?.miss || 0 }));
  const all = Object.values(g.days).reduce((a, d) => ({ ok: a.ok + d.ok, miss: a.miss + d.miss }), { ok: 0, miss: 0 });
  const total = all.ok + all.miss;
  const max = Math.max(1, ...days.map((d) => d.ok + d.miss));
  const names = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const drop = bestDrop();
  const debt = allWords().filter((w) => w.game?.debt).length;
  return `<h2>Mini game</h2>
    <p class="muted small" style="margin:-4px 2px 10px">Chỉ để ôn từ cho vui — không tính vào tiến độ học, chuỗi ngày hay tỉ lệ nhớ ở trên.</p>
    <div class="tiles">
      <div class="tile"><b>${r.played}/${r.total}</b><span>Vòng ${r.round}</span></div>
      <div class="tile"><b>${total}</b><span>Lượt gõ</span></div>
      <div class="tile"><b>${total ? Math.round((all.ok / total) * 100) + '%' : '—'}</b><span>Gõ đúng</span></div>
    </div>
    <div class="card" style="margin-top:10px">
      <div class="row-between"><b>7 ngày gần đây</b><span class="legend"><span><i style="background:var(--series-3)"></i>Đúng</span><span><i style="background:var(--series-2)"></i>Trượt</span></span></div>
      <div class="chart"><div class="bars" style="height:96px">${days.map((d) => `<div class="bar" style="cursor:default" title="${fmtDate(d.date)}: ${d.ok} đúng, ${d.miss} trượt"><span class="small" style="font-size:11.5px;color:var(--text-2);font-weight:600">${d.ok + d.miss || ''}</span>${d.miss ? `<i style="height:${Math.max(3, (d.miss / max) * 70)}px;background:var(--series-2);width:100%;max-width:28px;border-radius:4px 4px 0 0"></i>` : ''}${d.ok ? `<i style="height:${Math.max(3, (d.ok / max) * 70)}px;background:var(--series-3);width:100%;max-width:28px;border-radius:${d.miss ? '0' : '4px 4px 0 0'}"></i>` : ''}</div>`).join('')}</div>
      <div class="xlabels">${days.map((d, i) => `<span>${i === 6 ? 'Nay' : names[new Date(d.date + 'T00:00:00').getDay()]}</span>`).join('')}</div></div>
    </div>
    <div class="card" style="margin-top:10px">
      <div class="field"><div class="row-between"><span style="font-weight:600">Chạy & Gõ</span><span class="small muted">${g.plays.run} ván · kỷ lục ${bestRun()} từ</span></div></div>
      <div class="field"><div class="row-between"><span style="font-weight:600">Bắn Từ</span><span class="small muted">${g.plays.drop} ván · ${drop ? `kỷ lục ${drop.first}/${DROP_ROUND} đúng ngay` : 'chưa có kỷ lục'}</span></div></div>
      <div class="field"><div class="row-between"><span style="font-weight:600">Từ đang nợ</span><span class="small muted">${debt} từ · gặp lại đầu ván sau</span></div></div>
    </div>`;
}

export function statsView() {
  const sum = summary();
  const head = `<header class="top"><div><p class="eyebrow">Tiến độ</p><h1>Thống kê</h1></div></header>`;
  if (!sum.total) return `<div class="page">${head}<div class="card empty"><div class="art">${icon('stats')}</div><h3>Chưa có dữ liệu</h3><p>Thêm từ và bắt đầu học để xem tiến độ của bạn ở đây.</p></div></div>`;
  const pct = (n) => (sum.total ? (n / sum.total) * 100 : 0);
  const byDeck = S.decks.map((d) => {
    const ws = allWords().filter((w) => w.deckId === d.id);
    return { name: d.name, total: ws.length, learned: ws.filter((w) => !isNew(w)).length, mastered: ws.filter(isMastered).length };
  }).filter((d) => d.total);
  const seg = (k, label) => `<button class="${ui.statsKind === k ? 'on' : ''}" data-act="stats-kind" data-kind="${k}">${label}</button>`;
  return `<div class="page">${head}
    <div class="tiles">
      <div class="tile"><b data-count="${sum.streak}">${sum.streak}</b><span>Ngày liên tiếp</span></div>
      <div class="tile"><b data-count="${sum.learned}">${sum.learned}</b><span>Từ đã học</span></div>
      <div class="tile"><b data-count="${sum.pctMastered}" data-suffix="%">${sum.pctMastered}%</b><span>Đã ghi nhớ</span></div>
    </div>
    <div class="tiles" style="margin-top:10px">
      <div class="tile"><b data-count="${sum.total}">${sum.total}</b><span>Tổng số từ</span></div>
      <div class="tile"><b>${sum.accuracy === null ? '—' : sum.accuracy + '%'}</b><span>Tỉ lệ nhớ</span></div>
      <div class="tile"><b data-count="${sum.activeDays}">${sum.activeDays}</b><span>Ngày đã học</span></div>
    </div>
    <h2>Hoạt động học</h2>
    <div class="card"><div class="seg">${seg('day', 'Ngày')}${seg('week', 'Tuần')}${seg('month', 'Tháng')}</div><div class="chart">${mainChart()}</div></div>
    <h2>Mức độ ghi nhớ</h2>
    <div class="card">
      <div class="dist">${[[sum.mastered, 'var(--series-3)'], [sum.learning, 'var(--series-1)'], [sum.fresh, 'var(--neutral-mark)']].filter(([n]) => n).map(([n, c]) => `<i style="width:${pct(n)}%;background:${c}"></i>`).join('')}</div>
      <div class="legend" style="flex-direction:column;gap:8px;font-size:14.5px;color:var(--text)">
        <span class="row-between"><span><i style="background:var(--series-3)"></i>Đã ghi nhớ <span class="faint small">(ôn cách ≥ 21 ngày)</span></span><b>${sum.mastered}</b></span>
        <span class="row-between"><span><i style="background:var(--series-1)"></i>Đang học / đang ôn</span><b>${sum.learning}</b></span>
        <span class="row-between"><span><i style="background:var(--neutral-mark)"></i>Chưa học</span><b>${sum.fresh}</b></span>
      </div>
    </div>
    <h2>Theo chủ đề</h2>
    <div class="card">${byDeck.map((d) => `<div class="field"><div class="row-between"><span style="font-weight:600;min-width:0">${esc(d.name)}</span><span class="small muted" style="white-space:nowrap;flex:none">${d.learned}/${d.total} đã học · ${d.mastered} đã nhớ</span></div>
      <div class="mini-bar"><i style="width:${(d.learned / d.total) * 100}%"></i></div></div>`).join('')}</div>
    ${gameStats()}
  </div>`;
}
on('stats-kind', (el) => { ui.statsKind = el.dataset.kind; ui.statsSel = null; ui.anim = true; rerender(); });
on('stats-sel', (el) => { ui.statsSel = Number(el.dataset.i); rerender(); });

// ================= SETTINGS =================
// Màu chủ đạo: [id, tên, màu mẫu hiển thị trên nút chọn]. Giá trị thật cho sáng/tối nằm trong css/app.css.
const ACCENTS = [['green', 'Xanh lá', '#1F6F54'], ['blue', 'Xanh dương', '#1F5FBF'], ['purple', 'Tím', '#6B3FB8'], ['teal', 'Xanh ngọc', '#0F7480'], ['orange', 'Cam', '#B4530F'], ['pink', 'Hồng', '#B8336F']];
export function applyTheme() {
  let t = S.settings.theme;
  try { localStorage.setItem('theme', t); } catch {}
  if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const accent = ACCENTS.some(([id]) => id === S.settings.accent) ? S.settings.accent : 'green';
  try { localStorage.setItem('accent', accent); } catch {}
  document.documentElement.dataset.accent = accent;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0F1110' : '#F5F4EF');
}

// Số bản đang chạy = tên cache của service worker (VERSION trong sw.js).
let appVer = '';
globalThis.caches?.keys().then((keys) => {
  appVer = keys.filter((k) => k.startsWith('tu-vung-')).map((k) => k.slice(8)).sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)))[0] || '';
  if (appVer && location.hash === '#/settings') rerender();
}).catch(() => {});

// Các ô nhập của từng cách kết nối AI.
const keyInput = (id, value, placeholder) => `<input type="password" id="${id}" value="${esc(value)}" placeholder="${placeholder}" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">`;
const modelInput = (id, value, placeholder, list = []) => `<input type="text" id="${id}" value="${esc(value)}" placeholder="${placeholder}" ${list.length ? `list="${id}-list"` : ''} autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">${list.length ? `<datalist id="${id}-list">${list.map((m) => `<option value="${m}">`).join('')}</datalist>` : ''}`;
function aiFields(ai) {
  if (ai.provider === 'proxy') return `<label for="ai-endpoint">Địa chỉ máy chủ</label><input type="url" id="ai-endpoint" value="${esc(ai.endpoint)}" placeholder="https://…/api/ask" autocomplete="off" autocapitalize="none">
      <p class="small faint" style="margin-top:6px">Máy chủ nhận POST {system, prompt, model} và trả về {text}. API key nằm ở máy chủ.</p>`;
  if (ai.provider === 'gemini') return `<label for="ai-gemini-key">API key của Gemini</label>${keyInput('ai-gemini-key', ai.geminiKey, 'AIza…')}
      <p class="small faint" style="margin-top:6px">Lấy key miễn phí tại aistudio.google.com → “Get API key”. Key chỉ lưu trên thiết bị này, không nằm trong file sao lưu, và chỉ được gửi tới máy chủ của Google.</p>
      <label for="ai-gemini-model">Mô hình</label>${modelInput('ai-gemini-model', ai.geminiModel, 'gemini-2.5-flash', GEMINI_MODELS)}
      <p class="small faint" style="margin-top:6px">Gõ đúng tên mô hình như trong Google AI Studio. Nếu Google đã ra mô hình mới hơn, bạn cứ gõ tên đó vào đây.</p>`;
  if (ai.provider === 'openai') return `<label for="ai-oa-base">Địa chỉ API</label><input type="url" id="ai-oa-base" value="${esc(ai.oaBase)}" placeholder="https://api.openai.com/v1" autocomplete="off" autocapitalize="none">
      <label for="ai-oa-key">API key</label>${keyInput('ai-oa-key', ai.oaKey, 'sk-…')}
      <label for="ai-oa-model">Mô hình</label>${modelInput('ai-oa-model', ai.oaModel, 'ví dụ: gpt-4o-mini')}
      <p class="small faint" style="margin-top:6px">Dùng cho nhà cung cấp nhận định dạng “chat completions” (OpenAI, DeepSeek, Groq, OpenRouter…). Key chỉ lưu trên thiết bị này và chỉ được gửi tới địa chỉ bạn nhập. Một số nhà cung cấp không cho gọi thẳng từ trình duyệt — bấm “Kiểm tra kết nối” để biết.</p>`;
  return `<label for="ai-key">API key</label>${keyInput('ai-key', ai.apiKey, 'sk-ant-…')}
      <p class="small faint" style="margin-top:6px">Key chỉ lưu trên thiết bị này, không nằm trong file sao lưu, và chỉ được gửi tới api.anthropic.com. Hãy đặt hạn mức chi tiêu cho key.</p>
      <label for="ai-model">Mô hình</label>
      <select id="ai-model">${AI_MODELS.map(([id, l]) => `<option value="${id}" ${id === ai.model ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}

export function settingsView() {
  const s = S.settings;
  const seg = (name, cur, opts) => `<div class="seg" style="min-width:190px">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="set" data-key="${name}" data-value="${v}">${l}</button>`).join('')}</div>`;
  const stepper = (key, val) => `<div class="stepper"><button data-act="step" data-key="${key}" data-d="-5" aria-label="Giảm">−</button><b>${val}</b><button data-act="step" data-key="${key}" data-d="5" aria-label="Tăng">+</button></div>`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ready = aiReady(s.ai);
  const voiceList = englishVoices(s.voice);
  return `<div class="page">${navBar('Cài đặt')}
    <h2 style="margin-top:6px">Mục tiêu mỗi ngày</h2>
    <div class="card">
      <div class="setrow"><div><b>Từ mới</b><small>Số từ mới học mỗi ngày</small></div>${stepper('newPerDay', s.newPerDay)}</div>
      <div class="setrow"><div><b>Từ ôn tập</b><small>Số từ mỗi lượt ôn</small></div>${stepper('reviewPerDay', s.reviewPerDay)}</div>
    </div>
    <h2>Giao diện & phát âm</h2>
    <div class="card">
      <div class="setrow"><b>Chế độ</b>${seg('theme', s.theme, [['auto', 'Tự động'], ['light', 'Sáng'], ['dark', 'Tối']])}</div>
      <div class="setrow" style="flex-wrap:wrap;row-gap:10px"><b style="flex:1 0 100%">Màu chủ đạo</b><div class="swatches" role="radiogroup" aria-label="Màu chủ đạo">${ACCENTS.map(([id, name, c]) => `<button class="swatch ${(s.accent || 'green') === id ? 'on' : ''}" style="--c:${c}" data-act="set" data-key="accent" data-value="${id}" role="radio" aria-checked="${(s.accent || 'green') === id}" aria-label="${name}" title="${name}">${(s.accent || 'green') === id ? icon('check') : ''}</button>`).join('')}</div></div>
      <div class="setrow"><b>Giọng đọc</b>${seg('voice', s.voice, [['en-US', 'Anh-Mỹ'], ['en-GB', 'Anh-Anh']])}</div>
      <div class="setrow"><div style="min-width:0"><b>Giọng</b><small>${voiceList.length ? `${voiceList.length} giọng trên máy này` : 'Chưa tải được danh sách giọng'}</small></div>
        <select class="input" style="max-width:190px" data-change="voice-name" aria-label="Giọng đọc"><option value="">Tự động (tốt nhất)</option>${voiceList.map((v) => `<option value="${esc(v.name)}" ${v.name === s.voiceName ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>
      <div class="setrow"><b>Tốc độ đọc</b>${seg('rate', s.rate, [[0.75, 'Chậm'], [0.95, 'Vừa'], [1.1, 'Nhanh']])}</div>
      <div class="setrow"><div><b>Tự phát âm khi lật thẻ</b><small>Đọc từ ngay khi lật sang mặt đáp án</small></div>${seg('autoSpeak', s.autoSpeak !== false, [['true', 'Bật'], ['false', 'Tắt']]).replace('min-width:190px', 'min-width:120px')}</div>
      <div class="setrow"><div><b>Nghe thử</b>${canSpeak() ? '' : '<small>Thiết bị này không hỗ trợ phát âm</small>'}</div><button class="speakbtn" data-act="test-voice" aria-label="Nghe thử">${icon('speaker')}</button></div>
      <p class="small faint" style="margin-top:10px">Muốn giọng tự nhiên hơn: mở Cài đặt của iPhone → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Anh, tải một giọng “Nâng cao” hoặc “Cao cấp” (ví dụ Ava, Zoe, Daniel), rồi quay lại đây chọn giọng đó.</p>
    </div>
    <h2>Dữ liệu</h2>
    <div class="card stack">
      <p class="small muted">${S.words.size} từ · sao lưu gần nhất: ${s.lastBackup ? fmtDate(s.lastBackup) : 'chưa có'} · lưu trữ bền vững: ${S.persisted ? 'đã bật' : 'chưa được cấp'}</p>
      <button class="btn" data-act="backup">${icon('download', 'sm')} Sao lưu toàn bộ (JSON)</button>
      <button class="btn ghost" data-act="restore">${icon('upload', 'sm')} Khôi phục từ bản sao lưu</button>
      <div class="btn-row"><button class="btn ghost" data-act="import">Import CSV / Excel</button><button class="btn ghost" data-act="export-csv">Export CSV</button></div>
      <div class="btn-row"><button class="btn ghost sm" data-act="template">Tải file mẫu</button><button class="btn ghost sm" data-act="seed2">Nạp 20 từ mẫu</button></div>
      <p class="small faint">File import cần dòng tiêu đề; cột bắt buộc: <b>word</b>. Nhiều ví dụ/collocation trong một ô cách nhau bằng dấu “|”. Từ trùng sẽ được bỏ qua.</p>
    </div>
    <h2>Trợ lý AI</h2>
    <div class="card form">
      <div class="banner ${ready ? 'info' : ''}" style="margin-bottom:4px">${icon(ready ? 'check' : 'info')}<span>${ready ? 'Đã cấu hình. Bấm “Kiểm tra kết nối” để xác nhận.' : 'Chưa kết nối. Các tính năng AI sẽ không hoạt động cho đến khi bạn cấu hình bên dưới.'}</span></div>
      <label for="ai-provider">Cách kết nối</label>
      <select id="ai-provider" data-change="ai-provider">${[['anthropic', 'Claude API'], ['gemini', 'Google Gemini'], ['openai', 'API khác (tương thích OpenAI)'], ['proxy', 'Máy chủ riêng (proxy)']].map(([v, l]) => `<option value="${v}" ${s.ai.provider === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${aiFields(s.ai)}
      <div class="btn-row" style="margin-top:16px"><button class="btn" data-act="ai-save">Lưu</button><button class="btn ghost" data-act="ai-test">Kiểm tra kết nối</button></div>
    </div>
    <h2>Cài lên iPhone</h2>
    <div class="card small muted">${standalone ? 'Ứng dụng đang chạy ở chế độ cài đặt trên màn hình chính.' : 'Mở trang này bằng Safari → nút Chia sẻ → “Thêm vào MH chính”. Sau đó app chạy toàn màn hình và dùng được khi offline.'}</div>
    <h2>Vùng nguy hiểm</h2>
    <button class="btn danger" data-act="wipe">${icon('trash', 'sm')} Xoá toàn bộ dữ liệu</button>
    <p class="small faint center" style="margin-top:18px">Từ Vựng · bản ${appVer || '…'}</p>
  </div>`;
}

on('step', async (el) => {
  const key = el.dataset.key;
  const v = Math.min(200, Math.max(5, S.settings[key] + Number(el.dataset.d)));
  await saveSettings({ [key]: v });
  rerender();
});
on('set', async (el) => {
  const key = el.dataset.key;
  const v = key === 'rate' ? Number(el.dataset.value) : key === 'autoSpeak' ? el.dataset.value === 'true' : el.dataset.value;
  await saveSettings(key === 'voice' ? { voice: v, voiceName: '' } : { [key]: v });
  if (key === 'theme' || key === 'accent') applyTheme();
  rerender();
});
on('test-voice', () => speak('Practice makes perfect. This is how your words will sound.', { lang: S.settings.voice, rate: S.settings.rate, name: S.settings.voiceName }));
on('voice-name', async (el) => { await saveSettings({ voiceName: el.value }); speak('Practice makes perfect.', { lang: S.settings.voice, rate: S.settings.rate, name: el.value }); });
// Danh sách giọng thường về trễ sau khi mở app → vẽ lại trang Cài đặt khi có.
onVoices(() => { if (location.hash === '#/settings' && !document.activeElement?.matches('input, select, textarea')) rerender(); });
on('backup', async () => { if (await exportBackup()) { toast('Đã tạo file sao lưu'); rerender(); } });
on('restore', async () => {
  const file = await pickFile('.json,application/json');
  if (!file) return;
  if (!(await confirmSheet({ title: 'Khôi phục dữ liệu?', body: `Toàn bộ dữ liệu hiện tại (${S.words.size} từ) sẽ được THAY THẾ bằng nội dung trong “${file.name}”.`, okLabel: 'Khôi phục', danger: true }))) return;
  try { const n = await restoreBackup(file); applyTheme(); toast(`Đã khôi phục ${n} từ`); rerender(); } catch (e) { toast(e.message, 'bad'); }
});
on('import', async () => {
  const file = await pickFile('.csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!file) return;
  try {
    const r = await importFile(file);
    const parts = [`Đã thêm ${r.added} từ`];
    if (r.skippedDup) parts.push(`bỏ qua ${r.skippedDup} từ trùng`);
    if (r.skippedEmpty) parts.push(`${r.skippedEmpty} dòng trống`);
    if (r.newDecks) parts.push(`tạo ${r.newDecks} chủ đề mới`);
    toast(parts.join(' · '));
    rerender();
  } catch (e) { toast(e.message, 'bad'); }
});
on('export-csv', async () => { if (!S.words.size) return toast('Chưa có từ nào để export'); if (await exportCSV()) toast('Đã export CSV'); });
on('template', () => downloadTemplate());
on('seed2', async () => { const n = await loadSeed(); toast(n ? `Đã nạp ${n} từ mẫu` : 'Bộ từ mẫu đã có sẵn trong kho'); rerender(); });
on('wipe', async () => {
  const typed = await promptSheet({ title: 'Xoá toàn bộ dữ liệu? Gõ XOA để xác nhận', placeholder: 'XOA', okLabel: 'Xoá hết' });
  if (typed === null) return;
  if (typed.trim().toUpperCase() !== 'XOA') return toast('Chưa xoá — bạn cần gõ đúng XOA', 'bad');
  await wipeAll();
  applyTheme();
  toast('Đã xoá toàn bộ dữ liệu');
  go('#/home');
});

// Đọc form AI: ô nào đang hiển thị thì lấy giá trị mới, ô của cách kết nối khác giữ nguyên giá trị đã lưu.
const readAiForm = () => {
  const val = (id, old) => { const el = document.getElementById(id); return el ? el.value.trim() : old; };
  const cur = S.settings.ai;
  return {
    ...cur,
    provider: val('ai-provider', cur.provider),
    apiKey: val('ai-key', cur.apiKey),
    model: val('ai-model', cur.model),
    endpoint: val('ai-endpoint', cur.endpoint),
    geminiKey: val('ai-gemini-key', cur.geminiKey),
    geminiModel: val('ai-gemini-model', cur.geminiModel),
    oaBase: val('ai-oa-base', cur.oaBase),
    oaKey: val('ai-oa-key', cur.oaKey),
    oaModel: val('ai-oa-model', cur.oaModel),
  };
};
on('ai-provider', async () => { await saveSettings({ ai: readAiForm() }); rerender(); });
on('ai-save', async () => {
  const ai = readAiForm();
  if (ai.provider === 'proxy' && ai.endpoint && !/^https?:\/\//i.test(ai.endpoint)) return toast('Địa chỉ máy chủ phải bắt đầu bằng http(s)://', 'bad');
  if (ai.provider === 'openai' && ai.oaBase && !/^https:\/\//i.test(ai.oaBase)) return toast('Địa chỉ API phải bắt đầu bằng https://', 'bad');
  await saveSettings({ ai });
  toast(aiReady(ai) ? 'Đã lưu cấu hình AI' : 'Đã lưu — AI vẫn chưa được kết nối');
  rerender();
});
on('ai-test', async (el) => {
  await saveSettings({ ai: readAiForm() });
  el.disabled = true; el.textContent = 'Đang kiểm tra…';
  try { await askAI(S.settings.ai, 'Trả lời đúng một từ: OK'); toast('Kết nối AI hoạt động tốt'); }
  catch (e) { toast(e.message, 'bad'); }
  rerender();
});

// ================= AI ASSISTANT =================
export function aiView(id) {
  const a = ui.ai;
  if (id && id !== a.wordId) Object.assign(a, { wordId: id, result: null, error: null, input: '' });
  if (a.wordId && !S.words.has(a.wordId)) a.wordId = null;
  const ready = aiReady(S.settings.ai);
  const w = a.wordId ? S.words.get(a.wordId) : null;
  const notReady = ready ? '' : `<div class="banner" style="margin-bottom:12px">${icon('info')}<span><b>Chưa kết nối AI.</b> Trợ lý cần một API thật để hoạt động — ứng dụng không giả lập câu trả lời. <a href="#/settings" data-act="go" data-to="#/settings">Mở Cài đặt để kết nối</a></span></div>`;

  let picker;
  if (!w) {
    const k = fold(a.q.trim());
    const list = allWords().filter((x) => !k || fold(x.word).includes(k) || fold(x.meaning).includes(k)).sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 8);
    picker = `<div class="search">${icon('search')}<input type="search" placeholder="Chọn một từ trong kho…" value="${esc(a.q)}" data-in="ai-search" autocomplete="off" autocapitalize="none"></div>
      <div id="ai-list">${aiList(list)}</div>`;
  } else {
    const act = AI_ACTIONS.find((x) => x.id === a.action);
    picker = `<div class="card"><div class="row-between"><div style="min-width:0"><div class="headword" style="font-size:26px">${esc(w.word)}</div><p class="muted">${esc(w.meaning)}</p></div>
        <button class="btn ghost sm" data-act="ai-change">Đổi từ</button></div></div>
      <h2>Bạn cần hỗ trợ gì?</h2>
      <div class="chips wrap">${AI_ACTIONS.map((x) => `<button class="chip ${x.id === a.action ? 'on' : ''}" data-act="ai-action" data-id="${x.id}">${x.label}</button>`).join('')}</div>
      ${act.needsInput ? `<textarea class="input" id="ai-input" rows="3" style="margin-top:12px" placeholder="${esc(act.placeholder)}" data-in="ai-input">${esc(a.input)}</textarea>` : ''}
      <button class="btn" style="margin-top:12px" data-act="ai-ask" ${ready && !a.loading ? '' : 'disabled'}>${icon('sparkle', 'sm')} ${a.loading ? 'Đang hỏi AI…' : 'Hỏi AI'}</button>
      ${a.loading ? `<div class="card" style="margin-top:12px;display:flex;gap:12px;align-items:center"><div class="spin"></div><span class="muted">AI đang soạn câu trả lời…</span></div>` : ''}
      ${a.error ? `<div class="banner" style="margin-top:12px">${icon('info')}<span>${esc(a.error)}</span></div>` : ''}
      ${a.result ? `<div class="card ai-out" style="margin-top:12px">${richText(a.result)}</div>` : ''}`;
  }
  return `<div class="page">${navBar('Trợ lý AI')}${notReady}${picker}</div>`;
}
const aiList = (list) => (list.length
  ? `<div class="wlist">${list.map((x) => `<div class="wrow" data-act="ai-pick" data-id="${x.id}"><div class="body"><span class="w">${esc(x.word)}</span><p>${esc(x.meaning)}</p></div>${icon('chev')}</div>`).join('')}</div>`
  : `<div class="empty"><p>${S.words.size ? 'Không tìm thấy từ phù hợp.' : 'Kho từ đang trống — hãy thêm từ trước.'}</p></div>`);
on('ai-search', (el) => {
  ui.ai.q = el.value;
  const k = fold(el.value.trim());
  document.getElementById('ai-list').innerHTML = aiList(allWords().filter((x) => !k || fold(x.word).includes(k) || fold(x.meaning).includes(k)).sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 8));
});
on('ai-pick', (el) => { Object.assign(ui.ai, { wordId: el.dataset.id, result: null, error: null, input: '' }); rerender(true); });
on('ai-change', () => { Object.assign(ui.ai, { wordId: null, result: null, error: null }); history.replaceState(null, '', '#/ai'); rerender(true); });
on('ai-action', (el) => { Object.assign(ui.ai, { action: el.dataset.id, result: null, error: null }); rerender(); });
on('ai-input', (el) => { ui.ai.input = el.value; });
on('ai-ask', async () => {
  const a = ui.ai;
  const w = S.words.get(a.wordId);
  const act = AI_ACTIONS.find((x) => x.id === a.action);
  const input = a.input.trim();
  if (act.needsInput === 'required' && !input) { toast('Hãy nhập câu của bạn trước'); document.getElementById('ai-input')?.focus(); return; }
  Object.assign(a, { loading: true, error: null, result: null });
  rerender();
  try { a.result = await askAI(S.settings.ai, act.build(w, act.needsInput ? input : '')); }
  catch (e) { a.error = e.message; }
  a.loading = false;
  if (location.hash.startsWith('#/ai')) rerender();
});
