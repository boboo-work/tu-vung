// Spaced Repetition — biến thể SM-2.
// Mỗi từ có: state ('new' | 'learning' | 'review'), ease (hệ số dễ, >= 1.3),
// interval (số ngày đến lần ôn kế), reps (số lần nhớ liên tiếp), lapses (số lần quên), due (YYYY-MM-DD).
//
// Đánh giá:  again = Quên (q=1) · hard = Khó (q=3) · good = Đúng trong bài tập (q=4) · easy = Dễ (q=5)
import { addDays, today as todayStr } from './util.js';

export const MASTERED_DAYS = 21; // khoảng cách ôn >= 21 ngày được coi là "đã ghi nhớ"
const Q = { again: 1, hard: 3, good: 4, easy: 5 };

export const newSrs = () => ({ state: 'new', ease: 2.5, interval: 0, reps: 0, lapses: 0, due: null, last: null });

export function schedule(prev, rating, today = todayStr()) {
  const s = { ...newSrs(), ...prev };
  const q = Q[rating];
  if (q === undefined) throw new Error('Đánh giá không hợp lệ: ' + rating);

  if (q < 3) {
    // Quên: quay về đầu chu kỳ, giảm hệ số dễ, ôn lại ngay trong hôm nay.
    if (s.state === 'review') s.lapses += 1;
    s.reps = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, +(s.ease - 0.2).toFixed(3));
    s.state = 'learning';
    s.due = today;
  } else {
    // Công thức SM-2: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
    s.ease = Math.max(1.3, +(s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(3));
    s.reps += 1;
    let iv;
    if (s.reps === 1) iv = q === 5 ? 2 : 1;
    else if (s.reps === 2) iv = q === 3 ? 3 : 6;
    else if (q === 3) iv = Math.max(s.interval + 1, Math.round(s.interval * 1.2));
    else iv = Math.max(s.interval + 1, Math.round(s.interval * s.ease * (q === 5 ? 1.15 : 1)));
    s.interval = Math.min(iv, 3650);
    s.due = addDays(today, s.interval);
    s.state = 'review';
  }
  s.last = today;
  return s;
}

// Xem trước khoảng cách nếu chọn từng mức đánh giá (hiển thị trên nút).
export const preview = (srs, rating, today = todayStr()) => schedule(srs, rating, today).interval;

export const isNew = (w) => !w.srs || w.srs.state === 'new';
export const isDue = (w, today = todayStr()) => !isNew(w) && w.srs.due && w.srs.due <= today;
export const isMastered = (w) => !isNew(w) && w.srs.state === 'review' && w.srs.interval >= MASTERED_DAYS;

export function statusOf(w, today = todayStr()) {
  if (isNew(w)) return { key: 'new', label: 'Chưa học' };
  if (isMastered(w)) return { key: 'mastered', label: 'Đã ghi nhớ' };
  if (w.srs.state === 'learning') return { key: 'learning', label: 'Đang học' };
  return { key: 'review', label: isDue(w, today) ? 'Đến hạn ôn' : 'Đang ôn' };
}
