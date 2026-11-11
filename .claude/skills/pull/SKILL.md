---
name: pull
description: Tạo pull request gộp nhánh đang làm vào main cho repo này. Dùng khi người dùng gõ /pull hoặc bảo "tạo pull", "tạo pull request", "pull cho mình".
---

# /pull — tạo pull request vào `main`

Người dùng gõ `/pull` nghĩa là đã đồng ý tạo pull request; không cần hỏi lại. Làm lần lượt:

1. **Kiểm tra trạng thái.** Chạy `git status` và `git fetch origin main`.
   - Nếu có thay đổi chưa commit thuộc phần việc đang làm, commit chúng với thông điệp tiếng Việt mô tả rõ thay đổi. Nếu có file lạ không rõ nguồn gốc, hỏi người dùng trước khi commit.
   - Nếu nhánh hiện tại là `main`, dừng lại và báo: cần làm trên nhánh riêng.
2. **Kiểm tra có gì để gộp không.** Chạy `git log --oneline origin/main..HEAD`.
   - Không có commit nào: báo "không có thay đổi mới so với main" và dừng, không tạo pull request rỗng.
3. **Đẩy nhánh.** `git push -u origin <tên-nhánh>`. Không dùng force push. Lỗi mạng thì thử lại tối đa 4 lần (chờ 2s, 4s, 8s, 16s); lỗi quyền (403) thì báo người dùng, không thử lại.
4. **Kiểm tra pull request đang mở.** Dùng công cụ GitHub (`list_pull_requests`, lọc theo `head` là nhánh hiện tại, `state: open`).
   - Đã có pull request đang mở cho nhánh này: không tạo mới. Commit vừa đẩy đã tự vào pull request đó; cập nhật tiêu đề/mô tả nếu nội dung đã khác, rồi đưa link.
5. **Tạo pull request** vào `main` bằng công cụ GitHub (`create_pull_request`), viết bằng tiếng Việt:
   - **Tiêu đề:** một dòng nêu thay đổi chính, theo góc nhìn người dùng app.
   - **Mô tả** gồm hai mục:
     - `## Thay đổi` — gạch đầu dòng từng thay đổi, in đậm tên ngắn rồi giải thích; ghi cả việc tăng `VERSION` trong `sw.js` nếu có.
     - `## Kiểm thử` — đã thử gì, bằng cách nào, kết quả ra sao; nói rõ phần nào chưa thử được (ví dụ chưa thử trên iPhone thật).
   - Chỉ mô tả những gì thật sự có trong `git diff origin/main...HEAD`. Không ghi model hay thông tin cá nhân của người dùng.
   - Kết thúc mô tả bằng dòng attribution mà phiên làm việc quy định cho pull request (nếu có).
6. **Báo lại** cho người dùng bằng tiếng Việt: link pull request, và nhắc ngắn gọn rằng sau khi bấm Merge thì chờ 1–2 phút để GitHub Pages phát hành; số bản mới (`VERSION` trong `sw.js`) sẽ hiện ở cuối trang Cài đặt.

Lưu ý:
- Trước khi tạo pull request, nếu thay đổi có sửa mã app mà `VERSION` trong `sw.js` chưa tăng so với `origin/main`, hãy tăng nó, commit, rồi mới đẩy.
- Không tự merge pull request; việc merge do người dùng bấm.
- Nếu pull request trước của nhánh đã được merge và nhánh không còn commit mới, xem bước 2.
