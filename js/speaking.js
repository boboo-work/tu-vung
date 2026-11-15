// Speaking – bản thử nhỏ: kiểm tra trên iPhone ghi âm, nghe lại, đo thời gian nói/khoảng dừng
// và nhận dạng giọng nói của trình duyệt có chạy không, trước khi làm MVP.
import { esc, toast } from './util.js';
import { icon, on, rerender, navBar } from './ui.js';

const MAX_MS = 60e3;
const st = { phase: 'idle', recog: true, result: null, err: '', live: '' };
let rec = null; // { stream, mr, chunks, ctx, an, samples, t0, recog, finals, timer }

const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const standalone = () => !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
function mimeType() {
  if (!window.MediaRecorder) return '';
  for (const m of ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/aac']) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
}
function caps() {
  return {
    'Chạy dạng app ở màn hình chính': standalone() ? 'Có' : 'Không (đang mở trong trình duyệt)',
    'Micro (getUserMedia)': navigator.mediaDevices?.getUserMedia ? 'Có' : 'Không',
    'Ghi âm (MediaRecorder)': window.MediaRecorder ? `Có · ${mimeType() || 'định dạng mặc định'}` : 'Không',
    'Nhận dạng giọng nói': SR() ? 'Có' : 'Không',
    'Đọc mẫu (giọng máy)': 'speechSynthesis' in window ? 'Có' : 'Không',
  };
}

async function start() {
  st.err = ''; st.result = null; st.live = '';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = mimeType();
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    // Đo âm lượng mỗi 50 ms để tính thời gian nói và khoảng dừng.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    rec = { stream, mr, chunks, ctx, an, samples: [], t0: performance.now(), finals: [], recog: null };
    rec.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      rec.samples.push(Math.sqrt(sum / buf.length));
      const el = document.getElementById('mt-time');
      const ms = performance.now() - rec.t0;
      if (el) el.textContent = `${(ms / 1000).toFixed(0)} giây / ${MAX_MS / 1000}`;
      const lv = document.getElementById('mt-level');
      if (lv) lv.style.width = `${Math.min(100, rec.samples[rec.samples.length - 1] * 900)}%`;
      if (ms >= MAX_MS) stop();
    }, 50);
    mr.start(1000);
    if (st.recog && SR()) startRecog();
    st.phase = 'rec';
    rerender();
  } catch (e) {
    st.err = `Không mở được micro: ${e.name || ''} ${e.message || e}`.trim();
    st.phase = 'idle';
    rerender();
  }
}
function startRecog() {
  try {
    const r = new (SR())();
    r.lang = 'en-US'; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) rec.finals.push(t.trim()); else interim += t;
      }
      st.live = [...rec.finals, interim].join(' ').trim();
      const el = document.getElementById('mt-live');
      if (el) el.textContent = st.live || '…';
    };
    r.onerror = (e) => { st.err = `Nhận dạng giọng nói báo lỗi: ${e.error || e.message || 'không rõ'}`; const el = document.getElementById('mt-err'); if (el) el.textContent = st.err; };
    // iOS hay tự dừng sau một lúc im lặng: khởi động lại khi còn đang ghi.
    r.onend = () => { if (rec && st.phase === 'rec' && rec.recog === r) { try { r.start(); } catch {} } };
    r.start();
    rec.recog = r;
  } catch (e) {
    st.err = `Không bật được nhận dạng giọng nói: ${e.message || e}`;
  }
}
function analyse(samples, stepMs = 50) {
  if (!samples.length) return { speakMs: 0, pauses: 0, longest: 0 };
  // Ngưỡng nói = gấp 3 mức ồn nền (10% mẫu nhỏ nhất), tối thiểu 0.01.
  const sorted = [...samples].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
  const th = Math.max(0.01, floor * 3);
  let speak = 0, pauses = 0, run = 0, longest = 0, started = false;
  for (const v of samples) {
    if (v >= th) {
      if (started && run * stepMs >= 2000) pauses++;
      longest = Math.max(longest, started ? run * stepMs : 0);
      run = 0; speak++; started = true;
    } else run++;
  }
  return { speakMs: speak * stepMs, pauses, longest, th };
}
function stop() {
  if (!rec || st.phase !== 'rec') return;
  st.phase = 'done';
  clearInterval(rec.timer);
  const r = rec;
  const totalMs = performance.now() - r.t0;
  r.mr.onstop = () => {
    const blob = new Blob(r.chunks, { type: r.mr.mimeType || mimeType() || 'audio/mp4' });
    const a = analyse(r.samples);
    const transcript = (r.finals.join(' ') || st.live || '').trim();
    const words = (transcript.match(/[A-Za-z']+/g) || []).length;
    st.result = { url: URL.createObjectURL(blob), size: blob.size, type: blob.type, totalMs, ...a, transcript, words, wpm: a.speakMs ? Math.round(words / (a.speakMs / 60000)) : 0 };
    r.stream.getTracks().forEach((t) => t.stop());
    r.ctx.close?.();
    rerender();
  };
  try { r.recog?.stop(); } catch {}
  r.recog = null;
  r.mr.stop();
}
on('mt-start', start);
on('mt-stop', stop);
on('mt-recog', () => { st.recog = !st.recog; rerender(); });
on('mt-speak', () => {
  const u = new SpeechSynthesisUtterance('Describe a book you have recently read. You should say what the book is, why you read it, and what you learned from it.');
  u.lang = 'en-GB'; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u);
});
on('mt-copy', async () => {
  const r = st.result;
  const lines = [
    'KẾT QUẢ THỬ MICRO', ...Object.entries(caps()).map(([k, v]) => `${k}: ${v}`),
    r ? `Ghi âm: ${(r.totalMs / 1000).toFixed(1)} giây, ${Math.round(r.size / 1024)} KB, ${r.type}` : 'Chưa ghi âm',
    r ? `Thời gian nói: ${(r.speakMs / 1000).toFixed(1)} giây · khoảng dừng > 2 giây: ${r.pauses} · dừng lâu nhất ${(r.longest / 1000).toFixed(1)} giây` : '',
    r ? `Nhận dạng: ${r.words} từ · ${r.wpm} từ/phút · "${r.transcript.slice(0, 300)}"` : '',
    st.err ? `Lỗi: ${st.err}` : 'Lỗi: không có',
    `Thiết bị: ${navigator.userAgent}`,
  ].filter(Boolean).join('\n');
  try { await navigator.clipboard.writeText(lines); toast('Đã sao chép kết quả, dán lại cho Claude'); } catch { toast('Không sao chép được, hãy chụp màn hình'); }
});

export function micTestView() {
  const nav = navBar('Thử micro (Speaking)', { fallback: '#/settings' });
  const c = caps();
  const r = st.result;
  const capRows = Object.entries(c).map(([k, v]) => `<div class="row-between r-type"><span>${esc(k)}</span><b class="${/^Có/.test(v) ? 'ok-t' : 'no-t'}">${esc(v)}</b></div>`).join('');
  const recCard = st.phase === 'rec'
    ? `<div class="card"><p><b>Đang ghi…</b> <span id="mt-time" class="muted">0 giây / ${MAX_MS / 1000}</span></p>
        <div class="mt-meter"><i id="mt-level"></i></div>
        ${st.recog && SR() ? `<p class="small muted" style="margin-top:10px">Máy nghe được:</p><p id="mt-live" class="en" style="min-height:48px">${esc(st.live || '…')}</p>` : ''}
        <p id="mt-err" class="small no-t">${esc(st.err)}</p>
        <button class="btn" style="margin-top:12px" data-act="mt-stop">Dừng</button></div>`
    : `<div class="card"><p>Bấm ghi rồi nói tiếng Anh khoảng 30 giây (ví dụ trả lời: <i>Describe a book you have recently read</i>). Thử để im 3 giây ở giữa để kiểm tra phần đếm khoảng dừng.</p>
        <div class="row-between" style="margin-top:12px"><span class="small">Nhận dạng giọng nói cùng lúc</span><button class="tag ${st.recog ? 'on' : ''}" data-act="mt-recog">${st.recog ? 'Bật' : 'Tắt'}</button></div>
        <div class="btn-row" style="margin-top:12px"><button class="btn ghost" data-act="mt-speak" style="flex:.8">${icon('speaker', 'sm')} Nghe câu hỏi</button><button class="btn" data-act="mt-start">Bắt đầu ghi</button></div>
        ${st.err ? `<p class="small no-t" style="margin-top:10px">${esc(st.err)}</p>` : ''}</div>`;
  const res = r ? `<h2>Kết quả</h2><div class="card">
      <audio controls src="${r.url}" style="width:100%"></audio>
      <div class="tiles w-tiles" style="margin-top:12px"><div class="tile"><b>${(r.speakMs / 1000).toFixed(0)}″</b><span>thời gian nói / ${(r.totalMs / 1000).toFixed(0)}″</span></div><div class="tile"><b>${r.pauses}</b><span>khoảng dừng > 2″</span></div><div class="tile"><b>${r.wpm || '–'}</b><span>từ/phút</span></div></div>
      <p class="small muted" style="margin-top:10px">Bản chép (${r.words} từ):</p><p class="en">${esc(r.transcript || '(không nhận dạng được)')}</p>
      <p class="small faint" style="margin-top:8px">${Math.round(r.size / 1024)} KB · ${esc(r.type)}</p></div>` : '';
  return `<div class="page">${nav}
    <p class="muted small" style="margin:0 2px 12px">Bản thử trước khi làm phần Speaking. Hãy thử 2 lần: một lần trong Safari, một lần trong app ở màn hình chính, rồi bấm “Sao chép kết quả” và dán lại cho Claude.</p>
    <h2>Máy này hỗ trợ</h2><div class="card">${capRows}</div>
    <h2>Ghi thử</h2>${recCard}${res}
    <button class="btn soft" style="margin-top:16px" data-act="mt-copy">Sao chép kết quả</button></div>`;
}
export const _mt = { analyse };
