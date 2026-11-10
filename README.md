# Từ Vựng — ứng dụng học từ vựng tiếng Anh cá nhân (PWA)

PWA thuần HTML/CSS/JavaScript (ES modules), không cần build, không phụ thuộc thư viện ngoài.
Dữ liệu lưu trong IndexedDB trên thiết bị; chạy offline nhờ service worker.

## Chạy thử trên máy tính

    python3 -m http.server 5173

Mở http://localhost:5173

## Đưa lên iPhone

Service worker (chế độ offline) và "Thêm vào MH chính" cần HTTPS. Tải cả thư mục này lên một
dịch vụ host tĩnh bất kỳ (GitHub Pages, Netlify, Cloudflare Pages, Vercel…), rồi:

1. Mở địa chỉ đó bằng Safari trên iPhone.
2. Chia sẻ → Thêm vào MH chính.
3. Mở app từ màn hình chính một lần khi có mạng; từ đó dùng được offline.

Dữ liệu gắn với địa chỉ (origin) của trang. Khi đổi địa chỉ, dùng Cài đặt → Sao lưu / Khôi phục để chuyển dữ liệu.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html`, `css/app.css` | Khung trang, design tokens, giao diện sáng/tối |
| `js/app.js` | Khởi động, router theo hash, thanh tab, event delegation |
| `js/store.js` | IndexedDB + trạng thái trong bộ nhớ, nhật ký theo ngày, thống kê, sao lưu |
| `js/srs.js` | Thuật toán lặp lại ngắt quãng (biến thể SM-2) |
| `js/study.js` | Phiên học: flashcard và 5 dạng bài tập |
| `js/views.js`, `js/views2.js` | Các màn hình |
| `js/io.js` | Import CSV/XLSX, export CSV, sao lưu JSON, bộ từ mẫu |
| `js/ai.js` | Lớp kết nối Trợ lý AI (Claude API trực tiếp hoặc proxy riêng) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |

Khi sửa mã và phát hành lại, tăng `VERSION` trong `sw.js`.

## Thuật toán ôn tập

- Quên → ôn lại ngay trong phiên, hệ số dễ −0.2, chu kỳ về đầu.
- Khó / Đúng / Dễ → SM-2: lần 1 = 1–2 ngày, lần 2 = 3–6 ngày, sau đó khoảng cách × hệ số dễ.
- Từ chưa đến hạn: trả lời đúng không đổi lịch; trả lời sai bị kéo về danh sách cần ôn hôm nay.
- "Đã ghi nhớ" = khoảng cách ôn ≥ 21 ngày.

## Mở rộng thành app iOS

Bọc nguyên thư mục này bằng Capacitor (WKWebView) để phát hành qua App Store; lớp `store.js`
là nơi duy nhất cần thay nếu muốn chuyển sang SQLite hoặc đồng bộ đám mây.
