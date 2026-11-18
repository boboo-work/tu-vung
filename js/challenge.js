// Thử thách hôm nay: 4 chặng nối nhau, mỗi chặng là một lượt ngắn của một trò trong tab Game.
//  Săn từ (Reading) 3 câu → Bẫy hay Thật (Listening) 3 câu → Nói 30 giây (Speaking) 1 câu → Ý tưởng 60 giây (Writing) 2 thẻ.
//  Bẫy hay Thật cần đề Listening đã nhập (có lời thoại); chưa có thì bỏ chặng đó.
//  Giữa các chặng có màn chuyển chặng: nút "Bắt đầu" là một cú chạm, để iPhone cho mở micro và phát âm thanh.
//  Mỗi chặng vẫn lưu kết quả như chơi riêng (câu sai, thống kê, chuỗi ngày học). Tiến độ thử thách lưu trong S.hunt.daily.
import { S, saveHunt } from './store.js';
import { esc, today, addDays } from './util.js';
import { icon, on, go, replace, rerender } from './ui.js';
import { mochi, bolt, kit } from './hunt.js';
import { trapStats } from './trap.js';

export const STAGES = {
  hunt: { name: 'Săn từ', skill: 'Reading', unit: 'câu', size: 3, act: 'hn-start', bg: '#8EE3C8', what: 'Tìm từ cần điền trong bài đọc, né bẫy' },
  trap: { name: 'Bẫy hay Thật', skill: 'Listening', unit: 'câu', size: 3, act: 'tp-start', bg: '#FFC9A8', what: 'Nghe đoạn trong đề thật, chọn đáp án thật' },
  talk: { name: 'Nói 30 giây', skill: 'Speaking', unit: 'câu', size: 1, act: 'tk-start', bg: '#FFB3CB', what: 'Nghe câu hỏi, nói, rồi điền lại cụm hay' },
  idea: { name: 'Ý tưởng 60 giây', skill: 'Writing', unit: 'thẻ', size: 2, act: 'id-start', bg: '#BFE3FF', what: 'Nghĩ ý cho bài Task 2, ghép lại câu mẫu' },
};
const ORDER = ['hunt', 'trap', 'talk', 'idea'];
const hunt = () => S.hunt || (S.hunt = { plays: 0, best: 0, wrong: {}, pos: {}, seen: {} });
const daily = () => hunt().daily || (hunt().daily = { date: '', plan: [], i: 0, res: [], done: false, counted: false, total: 0, streak: 0, best: 0, last: '' });
/** Thử thách của hôm nay: chưa bắt đầu / đang làm (chặng thứ mấy) / đã xong. */
export function chalStatus() {
  const d = daily();
  const on = d.date === today();
  // Chuỗi còn giữ nếu lần xong gần nhất là hôm nay hoặc hôm qua.
  const streak = d.last === today() || d.last === addDays(today(), -1) ? d.streak : 0;
  return { started: on && d.plan.length > 0, done: on && d.done, i: on ? d.i : 0, n: on && d.plan.length ? d.plan.length : planToday().length, total: on ? d.total : 0, streak, best: d.best };
}
const planToday = () => ORDER.filter((g) => g !== 'trap' || trapStats().ready);

/** Một chặng chơi xong (gọi từ finish() của từng trò). */
export async function chalReport(g, r) {
  const d = daily();
  if (d.date !== today() || d.done || d.plan[d.i] !== g) { replace('#/chal'); return; }
  d.res[d.i] = { g, score: r.score || 0, ok: r.ok || 0, n: r.n || 0, skip: !!r.skip };
  d.i++;
  if (d.i >= d.plan.length) {
    d.done = true;
    d.total = d.res.reduce((a, x) => a + (x?.score || 0), 0);
    // Tính vào chuỗi khi đã chơi ít nhất (số chặng − 1): được bỏ qua tối đa một chặng.
    d.counted = d.res.filter((x) => x && !x.skip).length >= Math.max(1, d.plan.length - 1);
    if (d.counted && d.last !== today()) { d.streak = d.last === addDays(today(), -1) ? d.streak + 1 : 1; d.last = today(); }
    d.best = Math.max(d.best, d.total);
  }
  await saveHunt();
  replace('#/chal');
}

on('ch-begin', async () => {
  const d = daily();
  Object.assign(d, { date: today(), plan: planToday(), i: 0, res: [], done: false, total: 0, counted: false });
  await saveHunt();
  rerender(true);
});
on('ch-skip', async () => { const d = daily(); if (d.plan[d.i]) await chalReport(d.plan[d.i], { skip: true }); });

// ---------------------------------------------------------------- Màn hình
const bigBtn = (act, label, extra = '') => `<button class="hn-btn" data-act="${act}" ${extra}>${label}</button>`;
const FLAME = () => kit.FLAME(), STAR = () => kit.STAR();
function rail(d) {
  return `<div class="ch-rail">${d.plan.map((g, k) => {
    const st = STAGES[g], r = d.res[k];
    const cls = k < d.i ? (r?.skip ? 'skip' : 'done') : k === d.i && !d.done ? 'cur' : '';
    return `<div class="ch-step ${cls}" style="--bg:${st.bg}"><span>${k < d.i ? (r?.skip ? '–' : icon('check', 'sm')) : k + 1}</span><b>${esc(st.skill)}</b></div>`;
  }).join('<i class="ch-line"></i>')}</div>`;
}
export function chalView() {
  const d = daily();
  const s = chalStatus();
  const head = `<div class="hn-nav"><button class="hn-x" data-act="back" data-fallback="#/games" aria-label="Quay lại">${icon('back')}</button><h1 class="hn-h">Thử thách hôm nay</h1>${s.streak ? `<span class="hn-pill sm peach">${FLAME()}${s.streak}</span>` : ''}</div>`;
  // Chưa bắt đầu hôm nay
  if (!s.started) {
    const plan = planToday();
    return `<div class="page hn-scr hn-setup ch-scr">${head}
      <div class="hn-card ch-hero"><div class="hn-dtop"><div><span class="hn-pill sm">4 kỹ năng · khoảng 10 phút</span><p class="hn-dtitle">Mỗi ngày một vòng<br>đủ 4 kỹ năng</p></div>${mochi('happy', 92)}</div></div>
      <div class="ch-list">${ORDER.map((g, k) => {
        const st = STAGES[g], skip = !plan.includes(g);
        return `<div class="ch-item ${skip ? 'off' : ''}" style="background:${st.bg}"><span class="ch-num">${skip ? '–' : plan.indexOf(g) + 1}</span><span><b>${esc(st.name)}</b> · ${st.size} ${st.unit}<br><small>${skip ? 'Bỏ qua: chưa nhập đề Listening có lời thoại' : esc(st.what)}</small></span></div>`;
      }).join('')}</div>
      <p class="hn-sub center">${s.streak ? `Bạn đang có chuỗi ${s.streak} ngày hoàn thành thử thách. Giữ lửa nhé!` : 'Hoàn thành mỗi ngày để giữ chuỗi thử thách.'} Được bỏ qua tối đa 1 chặng.</p>
      <div class="hn-bottom">${bigBtn('ch-begin', 'Bắt đầu thử thách!')}</div></div>`;
  }
  // Đã xong
  if (s.done) {
    const rows = d.plan.map((g, k) => { const st = STAGES[g], r = d.res[k] || {}; return `<div class="ch-row" style="--bg:${st.bg}"><b>${esc(st.name)}</b><span>${r.skip ? 'bỏ qua' : `${r.ok}/${r.n} đúng`}</span><span class="hn-pill sm">${STAR()}${r.score || 0}</span></div>`; }).join('');
    return `<div class="page hn-scr hn-res ch-scr">${head}
      <div class="hn-trophy">${mochi('happy', 70)}<svg width="92" height="92" viewBox="0 0 64 64" aria-hidden="true"><path d="M14 8h36v8a18 18 0 0 1-36 0z" fill="#FFD84D" stroke="#2B2240" stroke-width="2.4" stroke-linejoin="round"/><path d="M14 12H6a8 8 0 0 0 9 10M50 12h8a8 8 0 0 1-9 10" fill="none" stroke="#2B2240" stroke-width="2.4"/><rect x="27" y="34" width="10" height="10" fill="#FFD84D" stroke="#2B2240" stroke-width="2.4"/><rect x="18" y="44" width="28" height="10" rx="3" fill="#FF8FB1" stroke="#2B2240" stroke-width="2.4"/></svg>${bolt('happy', 70)}</div>
      <p class="hn-big center">Xong thử thách hôm nay!</p>
      <p class="center hn-sub">${!d.counted ? `Bạn bỏ qua nhiều chặng nên hôm nay chưa tính vào chuỗi (cần làm ít nhất ${Math.max(1, d.plan.length - 1)} chặng).` : s.streak > 1 ? `Chuỗi thử thách: <span class="hn-pill sm peach">${FLAME()}${s.streak} ngày</span>` : 'Ngày đầu tiên của chuỗi thử thách. Mai quay lại nhé!'}</p>
      <div class="hn-tiles3"><div style="background:#FFD84D"><b>${d.total}</b><span>điểm hôm nay</span></div><div style="background:#FFC9A8"><b>${s.streak}</b><span>ngày liên tiếp</span></div><div style="background:#C7B8FF"><b>${d.best}</b><span>kỷ lục</span></div></div>
      <div class="hn-card">${rows}</div>
      <div class="hn-row2">${bigBtn('go', 'Về tab Game', 'data-to="#/games" style="background:#fff"')}</div></div>`;
  }
  // Đang làm: màn chuyển chặng
  const g = d.plan[d.i], st = STAGES[g];
  const last = d.res[d.i - 1];
  return `<div class="page hn-scr hn-setup ch-scr">${head}${rail(d)}
    ${last && !last.skip ? `<div class="hn-panel" style="background:#D9F7EC"><div class="hn-ptitle">${mochi('happy', 44)}<b>Xong chặng ${d.i}: ${last.ok}/${last.n} đúng · +${last.score}</b></div></div>` : ''}
    <div class="hn-card ch-next" style="background:${st.bg}"><span class="hn-tag" style="background:#fff">Chặng ${d.i + 1}/${d.plan.length} · ${esc(st.skill)}</span>
      <p class="hn-dtitle">${esc(st.name)}</p><p class="ch-what">${esc(st.what)} · ${st.size} ${st.unit}</p>
      ${g === 'talk' ? '<p class="tk-note">Nếu bật ghi âm, iPhone có thể hỏi quyền dùng micro.</p>' : ''}${g === 'trap' ? '<p class="tk-note">Bật tiếng để nghe nhé.</p>' : ''}</div>
    <div class="hn-bottom">${bigBtn(st.act, d.i ? 'Vào chặng tiếp!' : 'Vào chặng 1!', `data-chal="1" data-size="${st.size}"`)}
      <button class="ch-skip" data-act="ch-skip">Bỏ qua chặng này</button></div></div>`;
}
