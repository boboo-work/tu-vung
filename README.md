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
| `js/game.js` | Mini game “Chạy & Gõ”: gõ đúng từ để nhảy qua chướng ngại vật |
| `js/drop.js` | Mini game “Bắn Từ”: từ rơi xuống, gõ đúng để bắn trúng, sai thì bị đập vỡ và gặp lại |
| `js/games2.js` | Mini game “Nối Cụm” (hoàn thành collocation) và “Nghe & Chạm” (nghe, chạm bong bóng nghĩa đúng) |
| `js/lookup.js` | “Tự điền” ở form thêm từ (tự chạy khi gõ xong từ, bật/tắt ở Cài đặt): từ điển Wiktionary, dịch MyMemory, gợi ý Datamuse và Trợ lý AI để điền IPA, định nghĩa, ví dụ, nghĩa tiếng Việt, collocations… |
| `js/views.js`, `js/views2.js` | Các màn hình |
| `js/io.js` | Import CSV/XLSX, export CSV, sao lưu JSON, bộ từ mẫu |
| `js/ai.js` | Lớp kết nối Trợ lý AI (Claude API trực tiếp hoặc proxy riêng) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |

Khi sửa mã và phát hành lại, tăng `VERSION` trong `sw.js`.

## Ngữ pháp

Tab **Học** có công tắc *Từ vựng | Ngữ pháp*. Có 4 khoá: **Nền tảng** (A1–A2, 9 unit, 33 bài), **IELTS Core** (band 4.5–6.0, 10 unit, 34 bài), **IELTS 6.5 Booster** (band 6.0–6.5, 5 unit, 14 bài) và **IELTS 7.0 Advanced** (band 6.5 → 7.0, 8 unit, 17 bài); mỗi bài 6 bước: khởi động → quy tắc → ví dụ → luyện tập → sửa lỗi → tự đặt câu. Mỗi bài tạo thẻ mẫu câu ôn bằng cùng thuật toán với từ vựng; câu sai được ghi vào **Sổ lỗi** theo loại lỗi. Có bài kiểm tra đầu vào 30 câu để biết nên bắt đầu từ đâu.

Nội dung nằm ở `content/grammar/*.json` (dữ liệu, không phải code). Mỗi bài: `rule` (dòng quy tắc, hỗ trợ `**đậm**`, `*nghiêng*`), `examples`, `items` (dạng `mc` chọn đáp án, `fill` điền chỗ trống `___`, `tf` đúng/sai, `fix` sửa câu, thêm `"strict": true` nếu đáp án chỉ khác câu gốc ở dấu câu; mỗi câu có `why` và nhãn lỗi `tag`), `cards` (thẻ mẫu câu), `write` (đề tự đặt câu + câu mẫu). Thêm bài mới hoặc khoá mới chỉ cần thêm dữ liệu; khi phát hành nhớ tăng `VERSION` trong `sw.js`.

## Writing

Tab **Học** → *Writing*. Task 2 gồm 30 đề (5 dạng × 6), mỗi đề luyện theo 5 phần (viết lại đề, câu quan điểm, 2 đoạn thân bài, kết luận) có bài mẫu band 7. Task 1 tự sinh biểu đồ đường/cột từ 8 mẫu; vì app biết số liệu gốc nên kiểm tra được con số, năm, xu hướng và giới từ by/to/from. Khi đã quen từng phần, viết cả bài: 5 phút lập dàn ý rồi viết trong 40 phút (đồng hồ tính theo giờ thật nên vẫn đúng khi khoá màn hình; thoát giữa chừng thì bản nháp nhớ cả dàn ý và thời gian đã dùng). Khi viết, app gợi ý vài từ trong kho từ vựng hợp với đề; từ nào được dùng trong bài nộp thì tính là một lần ôn. Phản hồi không dùng AI: thống kê, kiểm tra theo phần hoặc cả bài, bộ dò lỗi theo mẫu (`content/writing/rules.json`, mỗi luật kèm câu kiểm tra) ghi vào Sổ lỗi, rồi bài mẫu và tự chấm. App không chấm band.

## Thuật toán ôn tập

- Quên → ôn lại ngay trong phiên, hệ số dễ −0.2, chu kỳ về đầu.
- Khó / Đúng / Dễ → SM-2: lần 1 = 1–2 ngày, lần 2 = 3–6 ngày, sau đó khoảng cách × hệ số dễ.
- Đã nhớ → giãn cách dài hơn Dễ: ít nhất 7 ngày, với từ đã ôn lâu thì gấp 1,3 lần khoảng cách của Dễ.
- Từ chưa đến hạn: trả lời đúng không đổi lịch; trả lời sai bị kéo về danh sách cần ôn hôm nay.
- "Đã ghi nhớ" = khoảng cách ôn ≥ 21 ngày.

## Mở rộng thành app iOS

Bọc nguyên thư mục này bằng Capacitor (WKWebView) để phát hành qua App Store; lớp `store.js`
là nơi duy nhất cần thay nếu muốn chuyển sang SQLite hoặc đồng bộ đám mây.

## Mini game và lịch ôn

- Hai mini game chỉ dùng từ đã học, lấy theo "vòng": một vòng xong khi mọi từ đã xuất hiện ít nhất một lần, nên không từ nào bị sót. Từ gõ trượt ("nợ") được gặp lại đầu ván sau.
- Game không ghi vào nhật ký học, chuỗi ngày hay tỉ lệ nhớ. Gõ trượt chỉ đưa từ vào danh sách cần ôn hôm nay, giữ nguyên khoảng cách và hệ số dễ.
- Thống kê game (vòng, lượt gõ, kỷ lục) nằm riêng ở cuối tab Thống kê và có trong file sao lưu.
