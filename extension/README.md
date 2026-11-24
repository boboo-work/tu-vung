# Phụ đề song ngữ · extension Chrome

Hiện phụ đề Anh + Việt trên YouTube, Netflix và các web phim. Chạm vào từ để xem nghĩa, nghe đọc và lưu; danh sách từ tải về được dạng CSV để nhập vào app Từ Vựng.

## Cài (Chrome / Edge / Cốc Cốc / Brave trên máy tính)

1. Tải thư mục `extension` này về máy (trên GitHub: Code → Download ZIP, giải nén).
2. Mở `chrome://extensions`, bật **Developer mode** (Chế độ nhà phát triển) ở góc phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) → chọn thư mục `extension`.
4. Ghim biểu tượng extension lên thanh công cụ cho dễ bật/tắt.

Khi cập nhật mã: vào `chrome://extensions` bấm nút tải lại ở thẻ extension, rồi tải lại trang phim.

Chrome trên iPhone/Android không chạy được extension. Trên iPhone dùng app Từ Vựng → Listening → **Xem phim song ngữ**.

## Dùng

- **YouTube:** mở video có phụ đề, extension tự bật CC và hiện 2 dòng.
- **Netflix:** bật phụ đề *English* trong menu phụ đề của Netflix.
- **Phim nói tiếng Anh nhưng chỉ có phụ đề tiếng Việt:** tiện ích tự dịch ngược sang tiếng Anh, dòng trên có nhãn **EN dịch máy** (có thể khác lời thoại thật). Muốn đúng lời thoại thì mở file .srt tiếng Anh.
- **Web phim khác:** bật phụ đề tiếng Anh trong trình phát. Trang không có phụ đề tiếng Anh: rê chuột lên video → **Song ngữ ⋯** → **Mở file .srt/.vtt**.
- Rê chuột vào phụ đề → video tạm dừng. Chạm vào từ → nghĩa, phiên âm, nghe đọc, **Lưu từ**.
- Phím tắt: `A` câu trước · `S` nghe lại câu · `D` câu sau (không có trên Netflix).
- Bảng **Song ngữ ⋯**: chọn nguồn phụ đề, chọn dòng dịch (dịch máy hoặc phụ đề tiếng Việt có sẵn), chỉnh lệch giờ, **Tải .srt song ngữ** (mở cùng video trong app Từ Vựng trên iPhone).
- Biểu tượng extension → **Từ đã lưu** → **Tải CSV cho app Từ Vựng**; trong app: Từ vựng → Nhập CSV/Excel.

## Cách hoạt động

| File | Vai trò |
|---|---|
| `inject.js` | Chạy trong trang: thấy trình phát tải file phụ đề (VTT, SRT, TTML, YouTube json3/srv3…) thì chuyển bản chữ cho `content.js`. Không sửa, không chặn gì. |
| `subs.js` | Đọc các định dạng phụ đề (dùng chung với app, `js/movie.js` import file này). |
| `content.js` | Chọn video lớn nhất trong khung, chọn phụ đề tiếng Anh, vẽ lớp phụ đề (shadow DOM), tra từ, bảng chọn nguồn, phím tắt. Không có file phụ đề thì đọc chữ phụ đề trình phát đang hiện (Netflix, trình phát tự vẽ). |
| `background.js` | Dịch câu (Google Dịch, dự phòng MyMemory), tra từ (Google + Wiktionary), lưu từ trong `chrome.storage.local`. |
| `popup.*` | Cài đặt, danh sách từ, xuất CSV. |

Chỉ chữ phụ đề và từ đang tra được gửi tới dịch vụ dịch/từ điển; địa chỉ trang và danh sách từ chỉ nằm trên máy.
