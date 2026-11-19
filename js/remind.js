// Nhắc học: giờ nhắc + ngày trong tuần, thêm vào app Lịch (.ics), thông báo khi app đang mở, số trên biểu tượng app.
// App không có máy chủ nên không gửi được thông báo đẩy lúc app đã tắt hẳn. Cách chắc chắn nhất trên iPhone là
// đưa lịch nhắc vào app Lịch (có chuông báo), còn app tự nhắc thêm khi đang mở hoặc vừa mở lại.
import { S, saveSettings, dayActive, dueWords } from './store.js';
import { today, toast, download } from './util.js';
import { icon, on, rerender } from './ui.js';
import { gDueCount } from './grammar.js';

export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const SENT_KEY = 'remindSent'; // ngày đã nhắc, để mỗi ngày chỉ nhắc một lần

const cfg = () => ({ on: S.settings.remindOn === true, time: S.settings.remindTime || '20:00', days: Array.isArray(S.settings.remindDays) ? S.settings.remindDays : [0, 1, 2, 3, 4, 5, 6] });
const studiedToday = () => dayActive(S.days.get(today()));
const dueCount = () => dueWords().length + gDueCount();
const canNotify = () => 'Notification' in window;
const granted = () => canNotify() && Notification.permission === 'granted';

/** Thời điểm nhắc hôm nay (Date) hoặc null nếu hôm nay không nhắc. */
function slotToday(now = new Date()) {
  const c = cfg();
  if (!c.on || !c.days.includes(now.getDay())) return null;
  const [h, m] = c.time.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Đã qua giờ nhắc hôm nay mà chưa học → hiện lời nhắc ở Trang chủ. */
export function remindDue() {
  const t = slotToday();
  return !!t && Date.now() >= t.getTime() && !studiedToday();
}

function message() {
  const n = dueCount();
  return n ? `Có ${n} thẻ đang chờ ôn. Vài phút thôi để giữ chuỗi ngày học nhé!` : 'Dành vài phút học hôm nay để giữ chuỗi ngày học nhé!';
}

async function notify(title, body) {
  if (!granted()) return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'remind', data: { url: './#/home' } });
    else new Notification(title, { body, icon: 'icons/icon-192.png', tag: 'remind' });
    return true;
  } catch { return false; }
}

let timer = 0;
/** Kiểm tra và nhắc (nếu tới giờ), rồi hẹn lần kiểm tra kế tiếp trong lúc app còn mở. */
export function checkRemind() {
  clearTimeout(timer);
  const t = slotToday();
  if (!t) return;
  const wait = t.getTime() - Date.now();
  if (wait > 0) { timer = setTimeout(checkRemind, Math.min(wait + 500, 2 ** 31 - 1)); return; }
  let sent = null;
  try { sent = localStorage.getItem(SENT_KEY); } catch {}
  if (sent === today() || studiedToday()) return;
  try { localStorage.setItem(SENT_KEY, today()); } catch {}
  // App đang hiện trên màn hình → lời nhắc trong app là đủ; app ở nền → thông báo hệ thống.
  if (document.hidden) notify('Đến giờ học rồi ⏰', message());
  else toast('Đến giờ học rồi! ' + message());
}

/** Số thẻ cần ôn trên biểu tượng app ở màn hình chính (iPhone cần cho phép thông báo). */
export function updateBadge() {
  if (!navigator.setAppBadge || !granted() || S.settings.remindBadge === false) return;
  const n = dueCount();
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

export function initRemind() {
  checkRemind();
  updateBadge();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) updateBadge();
    else checkRemind();
  });
}

// ---- File lịch (.ics) ----
const pad = (n) => String(n).padStart(2, '0');
function icsText() {
  const c = cfg();
  const [h, m] = c.time.split(':').map(Number);
  const now = new Date();
  // Bắt đầu từ ngày gần nhất có nhắc (kể cả hôm nay) để sự kiện đầu tiên khớp với RRULE.
  const start = new Date(now);
  for (let i = 0; i < 7 && !c.days.includes(start.getDay()); i++) start.setDate(start.getDate() + 1);
  const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const url = location.href.split('#')[0];
  const days = [...c.days].sort().map((d) => ICS_DAY[d]).join(',');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tu Vung//Nhac hoc//VI', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:tu-vung-remind-${stamp}@tu-vung`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${ymd(start)}T${pad(h)}${pad(m)}00`, // giờ địa phương của máy
    'DURATION:PT15M',
    `RRULE:FREQ=WEEKLY;BYDAY=${days}`,
    'SUMMARY:Học tiếng Anh · Từ Vựng',
    'DESCRIPTION:Mở app Từ Vựng: ôn thẻ đến hạn\\, học từ mới và giữ chuỗi ngày học.',
    `URL:${url}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Đến giờ học tiếng Anh rồi!', 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

// ---- Giao diện trong Cài đặt ----
export function remindSection() {
  const c = cfg();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const perm = canNotify() ? Notification.permission : 'unsupported';
  const permText = perm === 'granted' ? 'Đã cho phép' : perm === 'denied' ? 'Đã bị chặn — bật lại trong Cài đặt iPhone → Thông báo → Từ Vựng' : perm === 'unsupported' ? (standalone ? 'Thiết bị này chưa hỗ trợ thông báo cho web app' : 'Trên iPhone cần mở app từ màn hình chính (iOS 16.4 trở lên)') : 'Chưa cho phép';
  const dayChips = [1, 2, 3, 4, 5, 6, 0].map((i) =>
    `<button class="chip ${c.days.includes(i) ? 'on' : ''}" data-act="remind-day" data-d="${i}" aria-pressed="${c.days.includes(i)}">${WEEKDAY_SHORT[i]}</button>`).join('');
  return `<h2>Nhắc học</h2>
    <div class="card">
      <div class="setrow"><div><b>Nhắc mỗi ngày</b><small>Nhắc khi tới giờ mà hôm nay bạn chưa học</small></div><div class="seg set-seg two">${[['true', 'Bật'], ['false', 'Tắt']].map(([v, l]) => `<button class="${String(c.on) === v ? 'on' : ''}" data-act="remind-on" data-value="${v}">${l}</button>`).join('')}</div></div>
      ${c.on ? `<div class="setrow"><div><label for="remind-time"><b>Giờ nhắc</b></label></div><input id="remind-time" class="input" type="time" value="${c.time}" data-change="remind-time" style="max-width:130px"></div>
      <div class="setrow col"><b>Ngày nhắc</b><div class="chips wrap">${dayChips}</div></div>
      <div class="setrow"><div style="min-width:0"><b>Thêm vào app Lịch</b><small>Cách chắc chắn nhất: Lịch của iPhone sẽ báo chuông đúng giờ, kể cả khi app đang tắt</small></div>
        <button class="btn sm" data-act="remind-ics" style="flex:none">${icon('clock', 'sm')} Thêm</button></div>
      <div class="setrow"><div style="min-width:0"><b>Thông báo của app</b><small>${permText}</small></div>
        ${perm === 'default' ? '<button class="btn sm ghost" data-act="remind-perm" style="flex:none">Cho phép</button>' : perm === 'granted' ? '<button class="btn sm ghost" data-act="remind-test" style="flex:none">Thử</button>' : ''}</div>
      ${perm === 'granted' && navigator.setAppBadge ? `<div class="setrow"><div><b>Số thẻ trên biểu tượng app</b><small>Hiện số thẻ cần ôn ở màn hình chính</small></div><div class="seg set-seg two">${[['true', 'Bật'], ['false', 'Tắt']].map(([v, l]) => `<button class="${String(S.settings.remindBadge !== false) === v ? 'on' : ''}" data-act="remind-badge" data-value="${v}">${l}</button>`).join('')}</div></div>` : ''}
      <p class="small faint" style="margin-top:10px">App không có máy chủ nên chỉ tự gửi thông báo được khi đang mở hoặc chạy nền. Sau khi bấm <b>Thêm</b>: trên iPhone chọn <b>Lưu vào Tệp</b>, mở file <b>nhac-hoc.ics</b> trong app Tệp rồi bấm <b>Thêm tất cả</b>. Đổi giờ thì xoá sự kiện cũ trong Lịch rồi thêm lại.</p>` : ''}
    </div>`;
}

on('remind-on', async (el) => {
  const v = el.dataset.value === 'true';
  await saveSettings({ remindOn: v });
  if (v && canNotify() && Notification.permission === 'default') await Notification.requestPermission().catch(() => {});
  checkRemind();
  updateBadge();
  rerender();
});
on('remind-time', async (el) => {
  if (!/^\d{2}:\d{2}$/.test(el.value)) return;
  await saveSettings({ remindTime: el.value });
  try { localStorage.removeItem(SENT_KEY); } catch {}
  checkRemind();
  toast(`Sẽ nhắc lúc ${el.value}`);
});
on('remind-day', async (el) => {
  const d = Number(el.dataset.d);
  const days = cfg().days.includes(d) ? cfg().days.filter((x) => x !== d) : [...cfg().days, d];
  if (!days.length) { toast('Chọn ít nhất một ngày'); return; }
  await saveSettings({ remindDays: days.sort() });
  checkRemind();
  rerender();
});
on('remind-perm', async () => {
  const p = await Notification.requestPermission().catch(() => 'default');
  toast(p === 'granted' ? 'Đã bật thông báo' : 'Chưa được cho phép thông báo');
  updateBadge();
  rerender();
});
on('remind-test', async () => {
  if (!(await notify('Đến giờ học rồi ⏰', message()))) toast('Không gửi được thông báo trên thiết bị này', 'bad');
});
on('remind-badge', async (el) => {
  const v = el.dataset.value === 'true';
  await saveSettings({ remindBadge: v });
  if (!v) navigator.clearAppBadge?.().catch(() => {});
  else updateBadge();
  rerender();
});
on('remind-ics', async () => {
  const ok = await download('nhac-hoc.ics', icsText(), 'text/calendar;charset=utf-8');
  if (ok) toast('Mở file nhac-hoc.ics để thêm vào Lịch');
});
