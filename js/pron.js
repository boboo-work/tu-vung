// Mục Phát âm (tab Học → Phát âm).
//  #/pron           : lộ trình 4 tuần, bảng 44 âm, bài luyện, lý thuyết
//  #/psound/<id>    : thẻ một âm: gần giống tiếng Việt, khẩu hình, từ ví dụ (bấm nghe), âm dễ nhầm, ghi âm thử
//  #/ppairs         : nghe cặp âm dễ nhầm (sheep – ship…): app đọc một từ, chọn từ nghe được
//  #/pquiz/s|ed|stress : đuôi -s, đuôi -ed, trọng âm từ
//  #/ptopic/<id>    : lý thuyết (ký hiệu từ điển, âm cuối, nối âm và âm yếu, ngữ điệu)
// Giọng đọc: dùng đúng giọng đã chọn ở Cài đặt → Giọng đọc / Giọng (Web Speech). Tiến độ lưu ở S.pron (kv 'pron', có trong file sao lưu).
import { S, savePron } from './store.js';
import { esc, speak, canSpeak, shuffle, toast, voiceById } from './util.js';
import { icon, on, go, rerender, navBar, learnSwitch } from './ui.js';
import { sfx } from './sfx.js';
import { SOUNDS, GROUPS, KIND_NAME, PAIRS, ENDINGS, STRESS, TOPICS, WEEKS } from './pron-data.js';

const byId = new Map(SOUNDS.map((s) => [s.id, s]));
const ROUND = 10;

// ---------------------------------------------------------------- Đọc to: cùng giọng với Cài đặt (Anh–Mỹ / Anh–Anh và giọng cụ thể)
const ACCENT = { 'en-GB': 'Anh–Anh', 'en-US': 'Anh–Mỹ', 'en-AU': 'Anh–Úc', 'en-IE': 'Anh–Ireland', 'en-IN': 'Anh–Ấn', 'en-ZA': 'Anh–Nam Phi', 'en-CA': 'Anh–Canada', 'en-NZ': 'Anh–New Zealand', 'en-SG': 'Anh–Singapore', 'en-SCO': 'Anh–Scotland' };
/** Tên giọng dễ đọc: "Moira · Anh–Ireland" thay vì mã com.apple.voice…; chưa chọn giọng cụ thể thì theo Giọng đọc. */
const voiceLabel = () => {
  const v = voiceById(S.settings.voiceName);
  if (v) { const l = (v.lang || '').replace('_', '-'); return `${v.name} · ${ACCENT[l] || l}`; }
  return ACCENT[S.settings.voice] || 'Anh–Mỹ';
};
function say(text, rate = 0.85) {
  if (!canSpeak()) { toast('Thiết bị này không hỗ trợ đọc to'); return; }
  speechSynthesis.cancel();
  // Tốc độ theo Cài đặt, chậm hơn một chút để nghe rõ âm.
  speak(text, { lang: S.settings.voice, rate: Math.min(rate, S.settings.rate || 0.95), name: S.settings.voiceName });
}
on('pr-say', (el) => say(el.dataset.t, Number(el.dataset.r) || 0.85));
const sayBtn = (t, label = '', cls = '') => `<button class="pr-say ${cls}" data-act="pr-say" data-t="${esc(t)}" aria-label="Nghe ${esc(t)}">${icon('speaker', 'sm')}${label ? `<span>${label}</span>` : ''}</button>`;

// ---------------------------------------------------------------- Ký hiệu IPA trong trang từ → thẻ âm
const ALIAS = { g: 'g', 'oʊ': 'ou', i: 'i-short', u: 'u-short', ɹ: 'r', ɾ: 't', ɚ: 'schwa', ɝ: 'er', ɛ: 'e', ɐ: 'uh', ʧ: 'ch', ʤ: 'j', 'ɑ': 'a-long', 'ɔ': 'o-long', 'ɜ': 'er', 'eɪ': 'ei' };
const SYMS = [...SOUNDS.map((s) => [s.ipa, s.id]), ...Object.entries(ALIAS)].sort((a, b) => b[0].length - a[0].length);
/** Phiên âm → HTML, mỗi âm nhận ra được là một nút mở thẻ âm. */
export function ipaLinks(ipa) {
  const s = String(ipa || '');
  let out = '', i = 0;
  while (i < s.length) {
    const hit = SYMS.find(([sym]) => s.startsWith(sym, i));
    if (hit) { out += `<button class="ipa-sym" data-act="go" data-to="#/psound/${hit[1]}" title="Xem cách đọc /${esc(hit[0])}/">${esc(hit[0])}</button>`; i += hit[0].length; }
    else { out += esc(s[i]); i++; }
  }
  return out;
}

// ---------------------------------------------------------------- Lưu tiến độ
const P = () => S.pron;
async function bump(kind, ok, key) {
  const st = P().stats[kind] || (P().stats[kind] = { n: 0, ok: 0 });
  st.n++; if (ok) st.ok++;
  if (key) { const w = P().wrong; if (ok) { if (w[key]) { w[key]--; if (w[key] <= 0) delete w[key]; } } else w[key] = (w[key] || 0) + 1; }
  await savePron();
}
on('pr-week', async (el) => {
  const n = Number(el.dataset.n);
  P().weeks[n - 1] = !P().weeks[n - 1];
  await savePron();
  rerender();
});
const pct = (st) => (st?.n ? `${Math.round((st.ok / st.n) * 100)}%` : '–');

// ---------------------------------------------------------------- Trang chính
export function pronView() {
  const tile = (s) => `<button class="pr-tile k-${s.kind}" data-act="go" data-to="#/psound/${s.id}"><b>/${esc(s.ipa)}/</b><small>${esc(s.ex[0])}</small></button>`;
  const groups = GROUPS.map((g) => `<h2>${g.title}</h2><p class="muted small" style="margin:-4px 2px 10px">${g.tip}</p>
    <div class="pr-grid">${SOUNDS.filter((s) => g.kinds.includes(s.kind)).map(tile).join('')}</div>`).join('');
  const weeks = WEEKS.map((w) => `<div class="pr-week ${P().weeks[w.n - 1] ? 'done' : ''}">
    <button class="pr-check" data-act="pr-week" data-n="${w.n}" aria-pressed="${!!P().weeks[w.n - 1]}" aria-label="Đánh dấu xong tuần ${w.n}">${P().weeks[w.n - 1] ? icon('check', 'sm') : ''}</button>
    <div class="body" data-act="go" data-to="${w.go}" role="button"><b>Tuần ${w.n} · ${esc(w.what)}</b><small>Xong khi: ${esc(w.done)}</small></div></div>`).join('');
  const done = P().weeks.filter(Boolean).length;
  const st = P().stats;
  const link = (to, ic, title, sub) => `<button class="listlink" data-act="go" data-to="${to}"><span class="lead">${icon(ic)}</span><span class="body"><b>${title}</b><small>${sub}</small></span>${icon('chev')}</button>`;
  return `<div class="page"><header class="top"><div><p class="eyebrow">IPA · phiên âm Anh–Anh</p><h1>Phát âm</h1></div><button class="iconbtn tonal" data-act="go" data-to="#/settings" aria-label="Đổi giọng đọc" title="Đổi giọng đọc">${icon('speaker')}</button></header>
    ${learnSwitch('pron')}
    <div class="card pr-road"><div class="row-between"><b>Lộ trình 4 tuần · 15 phút/ngày</b><span class="tag">${done}/4 tuần</span></div>${weeks}
      <p class="small muted" style="margin-top:10px">Giọng đọc: <b>${esc(voiceLabel())}</b> (đổi ở Cài đặt → Giọng). Tập trước gương để nhìn khẩu hình. Mỗi từ mới: chép kèm phiên âm, đánh dấu trọng âm, nghe Anh–Anh rồi đọc theo 3 lần.</p></div>
    <h2>Luyện tập</h2>
    ${link('#/ppairs', 'ear', 'Cặp âm dễ nhầm', `Nghe rồi chọn: sheep – ship, think – sink… · đúng ${pct(st.pairs)}`)}
    ${link('#/pquiz/s', 'speaker', 'Đuôi -s / -es đọc thế nào?', `/ɪz/, /s/ hay /z/ · đúng ${pct(st.s)}`)}
    ${link('#/pquiz/ed', 'speaker', 'Đuôi -ed đọc thế nào?', `/ɪd/, /t/ hay /d/ · đúng ${pct(st.ed)}`)}
    ${link('#/pquiz/stress', 'target', 'Trọng âm từ', `Chạm âm tiết được nhấn · đúng ${pct(st.stress)}`)}
    ${groups}
    <h2>Lý thuyết</h2>
    ${TOPICS.map((t) => link(`#/ptopic/${t.id}`, 'list', t.title, t.level)).join('')}
    <p class="small muted" style="margin:14px 2px 0">Mẹo: trong trang của mỗi từ, chạm vào ký hiệu phiên âm để mở thẻ của âm đó.</p>
  </div>`;
}

// ---------------------------------------------------------------- Thẻ một âm (+ ghi âm thử)
const Rec = { mr: null, url: '', id: '', timer: 0, stream: null };
function stopRec() {
  clearTimeout(Rec.timer);
  try { if (Rec.mr && Rec.mr.state !== 'inactive') Rec.mr.stop(); } catch { /* bỏ qua */ }
  Rec.stream?.getTracks().forEach((t) => t.stop());
  Rec.stream = null;
}
addEventListener('hashchange', () => { if (!location.hash.startsWith('#/psound')) stopRec(); });
on('pr-rec', async (el) => {
  if (Rec.mr && Rec.mr.state === 'recording') { stopRec(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Máy này không hỗ trợ ghi âm trong trình duyệt', 'bad'); return; }
  try {
    Rec.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    Rec.mr = new MediaRecorder(Rec.stream);
    Rec.id = el.dataset.id;
    Rec.mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    Rec.mr.onstop = () => {
      if (Rec.url) URL.revokeObjectURL(Rec.url);
      Rec.url = URL.createObjectURL(new Blob(chunks, { type: Rec.mr.mimeType || 'audio/mp4' }));
      Rec.stream?.getTracks().forEach((t) => t.stop());
      rerender();
      new Audio(Rec.url).play().catch(() => {});
    };
    Rec.mr.start();
    Rec.timer = setTimeout(stopRec, 6000);
    rerender();
  } catch (e) { toast(e?.name === 'NotAllowedError' ? 'Chưa được phép dùng micro. Bật quyền micro cho trang này rồi thử lại.' : 'Không mở được micro', 'bad'); }
});
on('pr-play-rec', () => { if (Rec.url) new Audio(Rec.url).play().catch(() => {}); });

export function soundView(id) {
  const s = byId.get(id);
  if (!s) return `<div class="page">${navBar('Phát âm', { fallback: '#/pron' })}<div class="card empty"><p>Không tìm thấy âm này.</p></div></div>`;
  const i = SOUNDS.indexOf(s), prev = SOUNDS[i - 1], next = SOUNDS[i + 1];
  const mate = s.mate && byId.get(s.mate);
  const pair = PAIRS.find((p) => p.sounds.includes(s.id));
  const recOn = Rec.mr && Rec.mr.state === 'recording' && Rec.id === s.id;
  const hasRec = Rec.url && Rec.id === s.id;
  return `<div class="page">${navBar(KIND_NAME[s.kind], { fallback: '#/pron' })}
    <div class="card pr-hero k-${s.kind}"><b class="pr-big">/${esc(s.ipa)}/</b>
      <button class="btn soft" data-act="pr-say" data-t="${esc(s.ex.join(', '))}" data-r="0.75">${icon('speaker', 'sm')} Nghe 4 từ ví dụ</button></div>
    <div class="card"><div class="kv"><div><span>Gần giống tiếng Việt</span><b>${esc(s.vi)}</b></div><div><span>Khẩu hình</span><b>${esc(s.mouth)}</b></div></div>
      ${s.note ? `<p class="small pr-note">${icon('info', 'sm')} <span>${esc(s.note)}</span></p>` : ''}</div>
    <h2>Từ ví dụ</h2>
    <div class="pr-words">${s.ex.map((w) => `<button class="pr-word" data-act="pr-say" data-t="${esc(w)}" data-r="0.75">${icon('speaker', 'sm')}<span>${esc(w)}</span></button>`).join('')}</div>
    <h2>Tự đọc thử</h2>
    <div class="card"><p class="small muted" style="margin:0 0 10px">Bấm ghi âm, đọc 4 từ trên (tối đa 6 giây), rồi nghe lại để so với giọng mẫu.</p>
      <div class="btn-row"><button class="btn ${recOn ? 'danger' : ''}" data-act="pr-rec" data-id="${s.id}">${recOn ? 'Dừng ghi' : `${icon('ear', 'sm')} Ghi âm`}</button>
      ${hasRec ? `<button class="btn ghost" data-act="pr-play-rec">${icon('speaker', 'sm')} Nghe lại giọng mình</button>` : ''}</div></div>
    ${mate || pair ? `<h2>Dễ nhầm với</h2>` : ''}
    ${mate ? `<button class="listlink" data-act="go" data-to="#/psound/${mate.id}"><span class="lead"><b class="pr-mini">/${esc(mate.ipa)}/</b></span><span class="body"><b>${esc(KIND_NAME[mate.kind])} /${esc(mate.ipa)}/</b><small>${esc(mate.ex.slice(0, 3).join(', '))}</small></span>${icon('chev')}</button>` : ''}
    ${pair ? `<button class="listlink" data-act="pr-pairs-go" data-g="${pair.id}"><span class="lead">${icon('ear')}</span><span class="body"><b>Luyện nghe cặp ${esc(pair.title)}</b><small>${esc(pair.pairs.slice(0, 3).map((p) => p.join(' – ')).join(' · '))}</small></span>${icon('chev')}</button>` : ''}
    <div class="btn-row" style="margin-top:18px">${prev ? `<button class="btn ghost" data-act="go" data-to="#/psound/${prev.id}">← /${esc(prev.ipa)}/</button>` : '<span></span>'}${next ? `<button class="btn ghost" data-act="go" data-to="#/psound/${next.id}">/${esc(next.ipa)}/ →</button>` : ''}</div>
  </div>`;
}

// ---------------------------------------------------------------- Cặp âm dễ nhầm
const ui = { group: 'all' };
let PP = null; // lượt nghe cặp âm: { qs: [{ g, pair, ans }], i, res, picked }
on('pr-pairs-go', (el) => { ui.group = el.dataset.g || 'all'; PP = null; go('#/ppairs'); });
on('pr-pairs-group', (el) => { ui.group = el.dataset.g; rerender(); });
on('pr-pairs-start', () => {
  const gs = ui.group === 'all' ? PAIRS : PAIRS.filter((p) => p.id === ui.group);
  const all = gs.flatMap((g) => g.pairs.map((pair) => ({ g, pair })));
  const wrongFirst = all.filter((x) => P().wrong[`pair:${x.pair.join('|')}`]);
  const qs = shuffle([...shuffle(wrongFirst).slice(0, 3), ...shuffle(all.filter((x) => !wrongFirst.includes(x)))]).slice(0, ROUND)
    .map((x) => ({ ...x, ans: Math.random() < 0.5 ? 0 : 1, order: Math.random() < 0.5 ? [0, 1] : [1, 0] }));
  PP = { qs, i: 0, res: [], picked: null };
  rerender(true);
  setTimeout(() => say(PP.qs[0].pair[PP.qs[0].ans], 0.8), 250);
});
on('pr-pairs-play', () => { const q = PP?.qs[PP.i]; if (q) say(q.pair[q.ans], 0.8); });
on('pr-pairs-pick', async (el) => {
  if (!PP || PP.picked != null) return;
  const q = PP.qs[PP.i];
  PP.picked = Number(el.dataset.k);
  const ok = PP.picked === q.ans;
  PP.res.push(ok);
  sfx(ok ? 'ok' : 'bad');
  rerender();
  await bump('pairs', ok, `pair:${q.pair.join('|')}`);
});
on('pr-pairs-next', () => {
  if (!PP) return;
  if (PP.i + 1 >= PP.qs.length) { PP.done = true; sfx('win'); rerender(true); return; }
  PP.i++; PP.picked = null; rerender(true);
  setTimeout(() => { const q = PP?.qs[PP.i]; if (q) say(q.pair[q.ans], 0.8); }, 250);
});
on('pr-pairs-quit', () => { PP = null; rerender(true); });

export function pairsView() {
  const nav = navBar('Cặp âm dễ nhầm', { fallback: '#/pron' });
  if (PP?.done) {
    const ok = PP.res.filter(Boolean).length;
    const miss = PP.qs.filter((_, i) => !PP.res[i]);
    return `<div class="page">${nav}<div class="card center"><p class="eyebrow">Kết quả</p><b class="g-final">${ok}/${PP.qs.length}</b>
      <p class="muted small">${ok === PP.qs.length ? 'Tai bạn phân biệt rất tốt!' : 'Các cặp nghe nhầm sẽ quay lại nhiều hơn ở lượt sau.'}</p></div>
      ${miss.length ? `<h2>Nghe lại cặp nhầm</h2><div class="card">${miss.map((q) => `<div class="pr-pairrow"><span>${esc(q.g.title)}</span><span>${sayBtn(q.pair[0], esc(q.pair[0]))}${sayBtn(q.pair[1], esc(q.pair[1]))}</span></div>`).join('')}</div>` : ''}
      <button class="btn" style="margin-top:18px" data-act="pr-pairs-start">Lượt mới</button>
      <button class="btn ghost" style="margin-top:10px" data-act="pr-pairs-quit">Chọn cặp khác</button></div>`;
  }
  if (PP) {
    const q = PP.qs[PP.i], answered = PP.picked != null, ok = PP.picked === q.ans;
    const btn = (k) => {
      const cls = !answered ? '' : k === q.ans ? 'right' : k === PP.picked ? 'wrong' : 'dim';
      return `<button class="tp-opt pr-pick ${cls}" data-act="pr-pairs-pick" data-k="${k}" ${answered ? 'disabled' : ''}><span>${esc(q.pair[k])}</span></button>`;
    };
    return `<div class="page">${nav}
      <div class="row-between" style="margin-bottom:10px"><span class="tag">${esc(q.g.title)}</span><span class="small muted">Câu ${PP.i + 1}/${PP.qs.length}</span></div>
      <div class="card center"><p class="small muted" style="margin:0 0 12px">App vừa đọc một trong hai từ. Bạn nghe được từ nào?</p>
        <button class="btn soft" data-act="pr-pairs-play">${icon('speaker', 'sm')} Nghe lại</button></div>
      <div class="pr-picks">${q.order.map(btn).join('')}</div>
      ${answered ? `<div class="feedback ${ok ? 'ok' : 'bad'}" style="margin-top:14px"><b class="t">${ok ? 'Chính xác!' : `Từ được đọc là “${esc(q.pair[q.ans])}”`}</b>
        <p class="small">${esc(q.g.tip)}</p><div class="pr-pairrow" style="margin-top:8px">${sayBtn(q.pair[0], esc(q.pair[0]))}${sayBtn(q.pair[1], esc(q.pair[1]))}</div></div>
        <button class="btn" style="margin-top:14px" data-act="pr-pairs-next">${PP.i + 1 < PP.qs.length ? 'Câu tiếp' : 'Xem kết quả'}</button>` : ''}
      ${canSpeak() ? '' : '<p class="small center" style="color:var(--red)">Máy này không đọc to được nên không luyện nghe được.</p>'}
    </div>`;
  }
  const chip = (id, label) => `<button class="chip ${ui.group === id ? 'on' : ''}" data-act="pr-pairs-group" data-g="${id}">${label}</button>`;
  const nw = PAIRS.flatMap((g) => g.pairs).filter((p) => P().wrong[`pair:${p.join('|')}`]).length;
  return `<div class="page">${nav}
    <div class="card"><b>Cách luyện</b><p class="small muted" style="margin-top:4px">Mỗi câu app đọc một từ trong cặp, bằng giọng bạn chọn ở Cài đặt. Chọn từ bạn nghe được. Sau đó nghe lại cả hai từ và tự đọc theo. ${nw ? `Có ${nw} cặp bạn từng nghe nhầm, sẽ được ưu tiên.` : ''}</p></div>
    <h2>Chọn cặp âm</h2>
    <div class="chips" style="flex-wrap:wrap">${chip('all', 'Trộn tất cả')}${PAIRS.map((g) => chip(g.id, esc(g.title))).join('')}</div>
    <button class="btn" style="margin-top:18px" data-act="pr-pairs-start" ${canSpeak() ? '' : 'disabled'}>Bắt đầu nghe (${ROUND} câu)</button>
    <p class="small muted center" style="margin-top:10px">Câu luyện đọc: I think there are three trees. · She sells sea shells. · The van is very heavy.</p>
  </div>`;
}

// ---------------------------------------------------------------- Đuôi -s / -ed, trọng âm
let QZ = null; // { kind, qs, i, res, picked }
on('pr-quiz-start', (el) => {
  const kind = el.dataset.k;
  const src = kind === 'stress' ? STRESS.map((x) => ({ w: x[0], syl: x[1], ans: x[2], note: x[3] })) : ENDINGS[kind].words.map(([w, ans]) => ({ w, ans }));
  const key = (q) => `${kind}:${q.w}`;
  const wrong = src.filter((q) => P().wrong[key(q)]);
  QZ = { kind, qs: shuffle([...shuffle(wrong).slice(0, 3), ...shuffle(src.filter((q) => !wrong.includes(q)))]).slice(0, ROUND), i: 0, res: [], picked: null };
  rerender(true);
});
on('pr-quiz-pick', async (el) => {
  if (!QZ || QZ.picked != null) return;
  const q = QZ.qs[QZ.i];
  QZ.picked = el.dataset.v;
  const ok = String(q.ans) === QZ.picked;
  QZ.res.push(ok);
  sfx(ok ? 'ok' : 'bad');
  say(q.w.replace(/\s*\(.*\)$/, ''), 0.8);
  rerender();
  await bump(QZ.kind, ok, `${QZ.kind}:${q.w}`);
});
on('pr-quiz-next', () => {
  if (!QZ) return;
  if (QZ.i + 1 >= QZ.qs.length) { QZ.done = true; sfx('win'); rerender(true); return; }
  QZ.i++; QZ.picked = null; rerender(true);
});
on('pr-quiz-quit', () => { QZ = null; rerender(true); });

export function quizView(kind) {
  if (!['s', 'ed', 'stress'].includes(kind)) kind = 's';
  const title = kind === 'stress' ? 'Trọng âm từ' : `Đuôi ${ENDINGS[kind].label}`;
  const nav = navBar(title, { fallback: '#/pron' });
  if (QZ && QZ.kind !== kind) QZ = null;
  if (!QZ) {
    const rules = kind === 'stress'
      ? `<p class="small">Âm tiết được nhấn: to hơn, dài hơn, cao giọng hơn; các âm tiết khác đọc nhẹ (thường thành schwa /ə/).</p><ul class="small pr-rules"><li>Danh từ, tính từ 2 âm tiết: thường nhấn <b>âm đầu</b> (ˈtable, ˈhappy).</li><li>Động từ 2 âm tiết: thường nhấn <b>âm sau</b> (beˈgin, deˈcide).</li><li>-tion, -sion, -ic, -ity, -ian: nhấn âm tiết <b>ngay trước</b> hậu tố.</li><li>-ee, -eer, -ese: nhấn <b>chính hậu tố</b>.</li><li>-y, -ate, -graphy, -logy (từ 3 âm tiết trở lên): nhấn âm tiết <b>thứ ba từ cuối</b>.</li><li>-ful, -less, -ness, -ment, -er…: <b>không đổi</b> trọng âm của từ gốc.</li></ul>`
      : `<ul class="small pr-rules">${ENDINGS[kind].opts.map(([k, l]) => `<li><b>${l}</b>: ${esc(ENDINGS[kind].why[k])}</li>`).join('')}</ul><p class="small muted">Mẹo: đặt tay lên cổ họng. Âm cuối của từ gốc có rung là hữu thanh.</p>`;
    return `<div class="page">${nav}<div class="card"><b>Quy tắc</b>${rules}</div>
      <button class="btn" style="margin-top:18px" data-act="pr-quiz-start" data-k="${kind}">Bắt đầu (${ROUND} câu)</button></div>`;
  }
  if (QZ.done) {
    const ok = QZ.res.filter(Boolean).length;
    return `<div class="page">${nav}<div class="card center"><p class="eyebrow">Kết quả</p><b class="g-final">${ok}/${QZ.qs.length}</b></div>
      <button class="btn" style="margin-top:18px" data-act="pr-quiz-start" data-k="${kind}">Lượt mới</button>
      <button class="btn ghost" style="margin-top:10px" data-act="go" data-to="#/pron">Về Phát âm</button></div>`;
  }
  const q = QZ.qs[QZ.i], answered = QZ.picked != null, ok = answered && String(q.ans) === QZ.picked;
  let body, why;
  if (kind === 'stress') {
    body = `<p class="small muted center" style="margin:0 0 12px">Chạm âm tiết được nhấn</p><div class="pr-syls">${q.syl.map((s, k) => {
      const cls = !answered ? '' : k === q.ans ? 'right' : String(k) === QZ.picked ? 'wrong' : 'dim';
      return `<button class="pr-syl ${cls}" data-act="pr-quiz-pick" data-v="${k}" ${answered ? 'disabled' : ''}>${esc(s)}</button>`;
    }).join('')}</div>`;
    why = q.note;
  } else {
    const E = ENDINGS[kind];
    body = `<p class="small muted center" style="margin:0 0 12px">Đuôi của từ này đọc là?</p><div class="pr-picks three">${E.opts.map(([k, l]) => {
      const cls = !answered ? '' : k === q.ans ? 'right' : k === QZ.picked ? 'wrong' : 'dim';
      return `<button class="tp-opt pr-pick ${cls}" data-act="pr-quiz-pick" data-v="${k}" ${answered ? 'disabled' : ''}><span>${l}</span></button>`;
    }).join('')}</div>`;
    why = E.why[q.ans];
  }
  return `<div class="page">${nav}
    <div class="row-between" style="margin-bottom:10px"><span class="tag">${esc(title)}</span><span class="small muted">Câu ${QZ.i + 1}/${QZ.qs.length}</span></div>
    <div class="card center pr-qword"><b>${esc(q.w)}</b>${answered ? sayBtn(q.w.replace(/\s*\(.*\)$/, '')) : ''}</div>
    ${body}
    ${answered ? `<div class="feedback ${ok ? 'ok' : 'bad'}" style="margin-top:14px"><b class="t">${ok ? 'Chính xác!' : 'Chưa đúng'}</b><p class="small">${esc(why)}</p></div>
      <button class="btn" style="margin-top:14px" data-act="pr-quiz-next">${QZ.i + 1 < QZ.qs.length ? 'Câu tiếp' : 'Xem kết quả'}</button>` : ''}
  </div>`;
}

// ---------------------------------------------------------------- Lý thuyết
export function topicView(id) {
  const t = TOPICS.find((x) => x.id === id);
  if (!t) return `<div class="page">${navBar('Phát âm', { fallback: '#/pron' })}<div class="card empty"><p>Không tìm thấy bài này.</p></div></div>`;
  const table = (tb) => `<div class="card pr-table">${tb.rows.map((r) => `<div class="pr-trow">${r.map((c, k) => `<div><small>${esc(tb.head[k])}</small>${k === tb.say ? `<span class="pr-sayline">${esc(c)} ${sayBtn(c)}</span>` : `<span>${esc(c)}</span>`}</div>`).join('')}</div>`).join('')}</div>`;
  return `<div class="page">${navBar(t.title, { fallback: '#/pron' })}
    <p class="muted small" style="margin:0 2px 12px"><span class="tag">${esc(t.level)}</span> ${esc(t.intro)}</p>
    ${t.tables.map(table).join('')}
    ${t.tip ? `<div class="banner info">${icon('info')}<span>${esc(t.tip)}</span></div>` : ''}
  </div>`;
}
