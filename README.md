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
| `js/speak.js` | Luyện IELTS Speaking: kho đề theo quý, ghi âm/nghe lại/bản 2, đồng hồ Part 2, số liệu thời gian nói và khoảng dừng, tự chấm |
| `js/listening.js` | Luyện IELTS Listening: nghe số và chính tả (7 dạng của Part 1, câu sinh ngẫu nhiên, có câu gây nhiễu), nghe chép có so từng từ |
| `js/ltest.js` | Listening đề thật tự nhập: đọc file đề HTML, ghép file nghe, làm bài như thi / luyện, chấm theo luật, band, chữa |
| `js/hunt.js` | Tab Game và trò Săn từ (Reading): chọn câu từ các đề, đoán loại từ, chạm từ trong bài, né bẫy, T/F/NG, phục thù câu sai |
| `js/trap.js` | Trò Bẫy hay Thật (Listening): lấy câu chứa đáp án từ lời thoại đề thật đã nhập, giọng máy đọc, chạm/gõ đáp án, chọn chữ cái và chạm bằng chứng, xem bẫy và paraphrase |
| `js/talk.js` | Trò Nói 30 giây (Speaking): câu hỏi Part 1/3 của quý, nghĩ rồi nói (có ghi âm), xem bài mẫu 7.0 có tô cụm hay, điền lại cụm, tự chấm |
| `js/idea.js` | Trò Ý tưởng 60 giây (Writing Task 2): 60 giây nghĩ ý cho một phần của bài, xem câu mẫu có cụm hay, ghép lại câu mẫu bị xáo, tự chấm |
| `js/challenge.js` | Thử thách hôm nay: 4 chặng nối nhau (Săn từ, Bẫy hay Thật, Nói 30 giây, Ý tưởng 60 giây), màn chuyển chặng, tổng kết, chuỗi ngày hoàn thành |
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

Tab **Học** → *Writing*. Task 2 gồm 30 đề (5 dạng × 6), mỗi đề luyện theo 5 phần (viết lại đề, câu quan điểm, 2 đoạn thân bài, kết luận) có bài mẫu band 7. Task 1 tự sinh biểu đồ đường/cột từ 8 mẫu; vì app biết số liệu gốc nên kiểm tra được con số, năm, xu hướng và giới từ by/to/from. Khi đã quen từng phần, viết cả bài: 5 phút lập dàn ý rồi viết trong 40 phút (đồng hồ tính theo giờ thật nên vẫn đúng khi khoá màn hình; thoát giữa chừng thì bản nháp nhớ cả dàn ý và thời gian đã dùng). Khi viết, app gợi ý vài từ trong kho từ vựng hợp với đề; từ nào được dùng trong bài nộp thì tính là một lần ôn. Bài nào cũng sửa được thành bản 2, 3…: app so với bản trước (số gợi ý lỗi, kiểm tra đạt, từ nối, câu phức, lỗi đã sửa / lỗi mới) và tô chỗ đã sửa. Trang *Hồ sơ Writing* có biểu đồ gợi ý lỗi trên 100 từ theo tuần, loại lỗi hay gặp kèm bài ngữ pháp để học lại, và nút xuất toàn bộ bài ra file .txt (trên iPhone mở bảng Chia sẻ). Phản hồi không dùng AI: thống kê, kiểm tra theo phần hoặc cả bài, bộ dò lỗi theo mẫu (`content/writing/rules.json`, mỗi luật kèm câu kiểm tra) ghi vào Sổ lỗi, rồi bài mẫu và tự chấm. App không chấm band.

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

## Reading

Tab **Học** → *Reading*. Mỗi passage làm theo một trong hai cách: **có hướng dẫn** (từng câu: chạm câu chứa thông tin trong bài → Simplify bằng cách gạch phần phụ → trả lời → xem giải 4 bước, lưu cặp paraphrase) hoặc **như thi** (20 phút, làm hết rồi nộp). Trang *Đọc hiểu từng đoạn* có câu gốc, Simplify, Read connection, main idea và bài tập cả đề. Chạm một từ trong bài để lưu vào kho (chủ đề IELTS Reading) kèm câu gốc; từ đã có thì thêm câu ví dụ và nghĩa theo ngữ cảnh.

Thêm đề mới từ bộ 3 file Markdown (đề + đáp án, Simplify + connection, giải chi tiết):

```bash
python3 tools/reading_import.py dir "…/Reading Lychee/Lychee 17" "…/Lychee 18" --skip cam20-t1
python3 tools/reading_import.py one --id cam20-t2 --title "Cambridge 20 · Test 2" DE.md SIMPLIFY.md GIAI.md
```

Chế độ `dir` tự ghép file đề với file Simplify/giải theo tên bài đọc (tên file đề đặt nhầm cũng không sao), đọc được các kiểu file Simplify (①② nội dòng, bảng "Giữ lại", bảng có câu gốc gạch `~~`), hai kiểu file giải, và file đề chép từ web (mất tiêu đề nhóm câu, đáp án gộp `21&22`, danh sách phương án lẫn cột → lấy từ file giải). Đề nào lỗi nặng thì bỏ qua và in lý do. Kết quả nằm ở `content/reading/<id>.json` và `index.json`; app tải đề khi mở lần đầu rồi lưu lại để dùng offline. Tăng `VERSION` trong `sw.js` sau khi thêm đề.

## Game

Tab **Game** (giữa Từ vựng và Thống kê): thử thách hôm nay, các trò ôn từ đề thật và 4 mini game từ vựng (chuyển từ tab Học sang). Giao diện kiểu sticker, Mochi và Bolt dẫn trò.

- **Săn từ (Reading):** lấy câu từ các đề Reading trong app. Câu điền từ: đoán loại từ cho chỗ trống (chỉ hỏi khi lời giải ghi rõ hoặc suy ra chắc chắn), rồi chạm đúng từ cần điền trong đoạn văn chứa đáp án, né bẫy (lấy từ ghi chú ⚠️ của lời giải); sau đó xem câu chứa đáp án, cặp paraphrase, vì sao là bẫy, lời giải đầy đủ, nghe phát âm và cất từ vào từ vựng. Câu TRUE/FALSE/NOT GIVEN: chọn đáp án rồi chạm cụm làm bằng chứng. Mỗi lượt 10 câu, có giờ (thong thả 30″ / như thi 15″), điểm và chuỗi đúng; câu sai quay lại các lượt sau cho tới khi đúng 2 lần liên tiếp ("phục thù").
- **Bẫy hay Thật (Listening):** dùng các đề Listening thật bạn đã nhập (cần có lời thoại; có file giải thích thì xem được vì sao và bẫy). Mỗi câu phát một đoạn vài câu quanh đáp án bằng **giọng gốc trong file nghe** (đề không có file nghe thì giọng máy đọc). File nghe không có mốc thời gian nên app tự dò: tìm khoảng lặng dài (lúc đọc câu hỏi), bỏ câu hướng dẫn đầu/cuối, rồi chia lời thoại theo tỉ lệ ký tự; làm một lần cho mỗi Part và lưu vào đề. Đoạn nghe bị lệch thì bấm −3s / +3s, app nhớ cho câu đó. Câu điền từ: mức Dễ nhìn chữ và chạm đúng từ là đáp án, né số và từ bị gài; mức Vừa (nghe 2 lần) và Khó (nghe 1 lần, nhanh 1,1×) chỉ nghe rồi gõ đáp án, xong mới hiện lời thoại. Câu chọn chữ cái (A/B/C, nối, chọn 2): chọn đáp án khi nghe, rồi chạm cụm trong lời thoại làm bằng chứng. Sau mỗi câu: vì sao, bẫy, cặp paraphrase, mẹo. Câu sai quay lại các lượt sau như Săn từ. Đề không đưa vào app: mỗi người tự nhập trên máy mình.
- **Nói 30 giây (Speaking):** lấy câu hỏi Part 1 và Part 3 từ đề Speaking của quý (mặc định quý mới nhất). App đọc câu hỏi, cho 8 giây nghĩ (Part 3: 12 giây), rồi bạn nói 30 giây (Part 3: 45 giây); bật ghi âm thì nghe lại được bài mình và xem máy nghe được gì. Sau đó xem bài mẫu 7.0 (đổi sang 6.5 được) có tô 2–3 cụm hay kèm nghĩa, chạm để lưu vào từ vựng; rồi điền lại các cụm đó vào bài mẫu bị che (có cụm nhiễu); cuối cùng tự chấm ý chính, lý do, ví dụ. Cụm hay lấy từ danh sách từ vựng của câu; đề chưa có danh sách thì lấy cụm bài 7.0 dùng mà bài 6.5 không có. Mỗi lượt 5 câu; câu điền sai quay lại các lượt sau.
- **Ý tưởng 60 giây (Writing):** lấy 30 đề Task 2 trong app. Mỗi thẻ là một đề kèm một việc nhỏ: viết lại đề, nêu quan điểm, ý chính thân bài 1 / thân bài 2, hoặc câu kết. Có 60 giây nghĩ và ghi nhanh ý (gõ hoặc chỉ nghĩ), rồi xem câu mẫu của phần đó (cụm hay tô vàng kèm nghĩa, chạm để lưu). Sau đó ghép lại câu mẫu bị xáo thành 4–6 mảnh: chỉ ngắt ở chỗ hết câu, dấu phẩy hoặc trước từ nối, cụm hay giữ nguyên một mảnh. Cuối cùng tự chấm theo tiêu chí của phần đó. Chọn được dạng đề và phần luyện (mở bài, thân bài, kết luận); mỗi lượt 5 thẻ, khác đề nhau; câu ghép sai quay lại các lượt sau.
- **Thử thách hôm nay:** mỗi ngày một vòng đủ 4 kỹ năng, khoảng 10 phút: Săn từ 3 câu → Bẫy hay Thật 3 câu (bỏ chặng này nếu chưa nhập đề Listening có lời thoại) → Nói 30 giây 1 câu → Ý tưởng 60 giây 2 thẻ. Giữa các chặng có màn chuyển chặng, cần một cú chạm để iPhone cho bật micro và phát âm thanh. Mỗi chặng vẫn lưu kết quả như chơi riêng. Cuối vòng có tổng kết điểm từng chặng, điểm cao nhất và chuỗi ngày hoàn thành thử thách. Được bỏ qua tối đa 1 chặng; bỏ nhiều hơn thì ngày đó không tính vào chuỗi. Tiến độ lưu trên máy, thoát giữa chừng thì quay lại làm tiếp được.
- Mỗi lượt có ít nhất 1 câu trả lời được tính vào chuỗi ngày học, không tính vào mục tiêu Reading. Thống kê game có trong file sao lưu.
- Sắp có: Bẫy hay Thật (Listening), Nói 30 giây (Speaking), Ý tưởng 60 giây (Writing).

## Listening

Tab **Học** → *IELTS* → *Listening* (mục IELTS gồm 4 kỹ năng Listening, Reading, Writing, Speaking và mở lại kỹ năng xem gần nhất). Âm thanh là giọng đọc có sẵn trên máy, ưu tiên giọng Anh và Úc (chọn *Trộn / Anh / Úc* và tốc độ ở trang Listening), chạy được khi offline.

- **Nghe số & chính tả (Part 1):** 7 dạng: đánh vần tên, số điện thoại, số dễ nhầm (13/30), giá tiền, ngày tháng, giờ, mã số và mã bưu điện. Mỗi bộ 10 câu sinh ngẫu nhiên; một phần có câu gây nhiễu kiểu thi ("It used to be £45, but it's gone up to £52"). Chấm theo luật thi (sai chính tả là sai), chấp nhận các cách viết hợp lệ (7.30 / 7:30, 23 March / March 23rd, £12.50 / 12.50), và nói rõ vì sao sai: nhầm -teen/-ty, nhầm chữ cái, bị nhiễu, đọc giờ "quarter to"… Có chế độ *Chỉ nghe 1 lần* như khi thi. Mỗi dạng hiện tỉ lệ đúng; app gợi ý dạng yếu nhất.
- **Nghe chép:** mỗi bộ 6 câu (Part 1–2, Part 3–4 trong `content/listening/dictation.json`, hoặc câu ví dụ trong từ vựng của bạn). Nghe lại, nghe chậm, nghe từng đoạn; gõ lại rồi app so từng từ và chỉ ra từ thiếu, từ sai, từ thừa, loại lỗi (từ nhỏ bị nuốt, đuôi -s/-ed, chính tả). Chính tả Anh và Mỹ đều được chấp nhận, số viết bằng chữ hay bằng số đều được.
- **Lỗi hay gặp và từ hay nghe sót** hiện ở trang Listening; thống kê có trong file sao lưu.
- **Mục tiêu ngày:** 1 lượt = 1 bộ (làm được quá nửa bộ cũng tính); Cài đặt → Lượt Listening.
- **Đề thật của bạn:** *Nhập đề* → chọn cùng lúc file đề `.html` (câu hỏi + đáp án, ví dụ trang đề lưu từ web) và file nghe từng Part (`…Part1.mp3`…). App tự đọc 4 Part, các dạng điền từ (bảng, ghi chú), chọn 1, chọn 2 đáp án, nối chữ cái, giới hạn số từ và đáp án (kể cả kiểu `10/ten`, `metal(s)`). Đề và file nghe **chỉ lưu trên máy**, không có trong file sao lưu (chỉ sao lưu kết quả). Làm *Như thi* (mỗi Part nghe 1 lần, không tua) hoặc *Luyện* (tua ±5 giây, 0.85×), cả đề hoặc từng Part; nộp bài ra điểm, band ước lượng (đủ 40 câu), lý do sai từng câu (chính tả, thiếu "s", quá số từ…), tỉ lệ đúng theo dạng câu; nghe lại từng Part khi chữa.
- **Lời thoại và giải thích (đề thật):** chọn thêm file lời thoại `.html` (chia "PART n", chỗ đáp án in đậm/gạch chân, mốc `(Q1)`, `(Q21/Q22)`) và file giải thích `.json`, lúc nhập đề hoặc sau đó ở trang đề (*Thêm lời thoại / giải thích / file nghe*). Sau khi nộp: mỗi câu hiện câu chứa đáp án trong lời thoại (bấm để mở đúng đoạn), *Vì sao*, *Paraphrase* (đề ↔ bài nghe), *Bẫy*, mẹo; toàn bộ lời thoại có mốc câu hỏi. Câu chưa có giải thích: nút *Nhờ AI giải thích* (dùng AI đã kết nối trong Cài đặt).
- **Nhập nhiều đề một lần:** chọn cả bộ (ví dụ Cam 21 gồm Test 1–4, dạng file lẻ, file `.zip` phẳng hoặc mỗi đề một thư mục). Mỗi file được ghép vào đúng đề theo mã sách + số Test trong tên file / thư mục / tiêu đề (`Cam21_Test02_Part3.mp3`, `Test 2/Transcript.html`), rồi theo tên file trùng nhau. Màn xem trước hiện từng đề; file không ghép được thì báo rõ. Nhập lại đề cùng tên thì thay bản cũ, giữ kết quả các lần làm. *Thêm lời thoại / giải thích* ở trang đề chỉ nhận file đúng của đề đó.
- **Gói đề một file:** trang đề → *Xuất gói đề (1 file)* gộp đề, file nghe, lời thoại, giải thích thành một `.zip` để gửi riêng cho bạn học; người nhận chọn file đó ở *Nhập đề*. *Nhập đề* cũng nhận file `.zip` tự nén các file đề. Nội dung HTML trong gói được lọc lại trước khi hiển thị (gói có thể do người khác gửi).
  File giải thích: `{"type": "ltest-notes", "title": "…", "notes": {"1": {"why": "…", "para": [["cụm trong đề", "cụm trong bài nghe"]], "trap": "…", "tip": "…"}, "21-22": {…}}}`.

## Speaking

Tab **Học** → *Speaking*. Đề lấy theo quý (forecast), mỗi quý có Part 1 (chủ đề bắt buộc Where you live / Work / Study lên đầu) và Part 2 kèm câu Part 3; câu nào cũng có bài mẫu **6.0–6.5** và **7.0**, cụm hay, ghi chú ngữ pháp.

- **Part 1 / Part 3:** app đọc câu hỏi, gợi ý khung trả lời, ghi âm (Part 1 tự dừng ở 1 phút, Part 3 ở 2 phút), hiện thời lượng, thời gian nói thật (trừ khoảng lặng), số khoảng dừng > 2 giây; nghe lại, xem bài mẫu, nói lại bản 2 và so với bản trước.
- **Part 2:** thẻ đề → 1 phút chuẩn bị (ô ghi từ khoá) → tự bắt đầu ghi, 2 phút nói, nhắc khi còn 30 giây, tự dừng ở 2:00. Đồng hồ tính theo giờ thật.
- **Tự chấm:** cuối lượt, 10 câu Có/Chưa cho 4 tiêu chí; không quy đổi ra band. Mục *Tiến bộ* ở trang Speaking.
- **Mục tiêu ngày:** 1 lượt = 1 chủ đề Part 1 hoặc 1 đề Part 2 (Cài đặt → Lượt Speaking); tính vào chuỗi ngày học và vòng trên Trang chủ.
- **Micro:** chỉ bật khi đang nói (Part 2: micro tắt suốt 1 phút chuẩn bị, hết giờ mới bật và ghi); màn hình được giữ sáng khi ghi. Rời app khi đang ghi → app dừng và lưu phần đã ghi.
- **Chữ khi nói:** nhận dạng giọng nói của trình duyệt (trên iPhone do Apple xử lý) hiện chữ ngay khi nói; sau khi dừng, sửa được, sao chép câu trả lời hoặc sao chép kèm câu hỏi và yêu cầu chấm (từng câu hoặc cả lượt). Bật/tắt ở trang Speaking.
- **Bản ghi:** lưu trên máy, tự xoá âm thanh sau 7 / 30 / 90 ngày (Cài đặt) trừ bản bấm "Giữ lại"; mỗi bản ghi có nút "Xoá…": xoá hẳn (mất khỏi lịch sử) hoặc chỉ xoá âm thanh; xoá cả một lượt ở mục Tiến bộ (trừ luôn vào mục tiêu ngày); xoá âm thanh hàng loạt ở trang Speaking. Bản bấm nhầm không nghe thấy tiếng nói thì không lưu. Sao lưu mặc định không kèm âm thanh, có hỏi khi tạo file. Không có micro thì chọn "Nói thầm": vẫn bấm giờ và tự chấm.

Thêm đề quý mới từ thư mục Markdown (`Part 1/Forecast Qn-YYYY/*.md`, `Part 2&3/Forecast Qn-YYYY/*.md`):

```bash
python3 tools/speaking_import.py "…/Speaking" content/speaking
```

Công cụ đọc được cả kiểu viết Quý 2 (`**Q1. …**`, `**Band 6.0–6.5:** …`) và Quý 3 (`### Q1. …`, `**Band 6.0–6.5**` + `> …`), in số câu và câu nào thiếu bài mẫu. Đề Part 2 thiếu phần "You should say" thì lấy gợi ý từ `tools/speaking_cuecards_<quý>.json` (app ghi chú "gợi ý do app soạn"). Tăng `VERSION` trong `sw.js` sau khi nhập.

