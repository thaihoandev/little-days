# Kỉ niệm mang theo, bản nháp và đồng hồ cát theo dữ liệu

Ngày triển khai: **09/11/2026**. Phạm vi mã nguồn; chưa xác nhận rollout production. Xem [cơ sở nghiên cứu](IMPROVEMENT_RESEARCH_2026_11.md).

## Lưu và bản nháp trên thiết bị

- Lưu server vẫn dùng `expectedRevision`, chặn ghi tiếp khi 409 và lưu nốt sửa đổi trong lúc request đang chạy. Lỗi dọn bản nháp sau PATCH thành công được báo riêng, không biến thành lỗi lưu server.
- Bản nháp dùng IndexedDB, có phiên bản cấu trúc, tài khoản/album, revision gốc, thời điểm và ID riêng cho từng phiên editor. Hai tab không dùng chung một nhánh. Khi mở lại có thể chọn nhánh muốn khôi phục; khôi phục không bỏ qua CAS.
- Bản nháp localStorage cũ chỉ được gỡ sau khi IndexedDB ghi thành công. Nháp nhỏ có thêm bản khẩn cấp localStorage; nháp lớn ưu tiên IndexedDB. Trình duyệt có thể chặn hoặc thu hồi storage: không coi đây là backup bảo đảm. Tab bị hủy trước khi transaction hoàn tất vẫn có thể mất thao tác cuối.
- Khi tab ẩn, ứng dụng yêu cầu giữ lại bản nháp; `beforeunload` chỉ đăng ký khi còn thay đổi chưa lưu. Không dựa vào request mạng lúc đóng tab để bảo đảm lưu.
- Hàng đợi ghi thiết bị gộp thay đổi đang chờ về bản mới nhất. Số thứ tự trong từng nhánh giúp chọn bản khẩn cấp mới hơn khi IndexedDB chưa kịp commit, kể cả khi đồng hồ thiết bị đổi. Di chuyển/dọn bản nháp có kiểm tra nội dung hiện tại, không xóa đè thay đổi mới.
- Khi có lỗi lưu, có thể tải tệp JSON cứu bản nháp hiện tại. Tệp giữ cấu trúc/chữ, không kèm bytes ảnh/nhạc và chưa có chức năng nhập tệp tự động.
- Đăng xuất/xóa tài khoản dọn bản nháp của đúng tài khoản trên thiết bị khi trình duyệt cho phép. Storage bị chặn không ngăn thao tác server hoàn tất.

## Quay lại chỗ đang đọc

Timeline/lịch giữ bộ lọc, không gian, ngày/tháng, nhóm ngày mở và mốc card theo từng history entry trong RAM, tối đa 40 mục. Khi quay lại timeline, tải lại tối đa 200 phần tử qua phân trang có kiểm tra quyền để tìm vị trí cũ; không giữ bản sao đầy đủ nội dung riêng tư trong cache mới. Đổi tài khoản/đăng xuất xóa trạng thái đọc.

Vị trí được phục hồi theo card và độ lệch khi có thể; nếu nguồn thay đổi hoặc mất quyền, chỉ dùng dữ liệu hiện còn được phép. Việc tải lại toàn bộ trang làm mất bộ nhớ vị trí này. Khôi phục toàn trang từ bfcache yêu cầu tải lại session/danh sách, không mặc định tin DOM cũ.

## ZIP dữ liệu cá nhân

Mở **Tài khoản → Hồ sơ → Mang kỉ niệm theo mình → Tải dữ liệu cá nhân (.zip)**. Chỉ hiện khi session API có capability hỗ trợ.

Gói gồm:

- `little-days.json`: tài liệu đầy đủ của sổ cá nhân, dấu mốc riêng và metadata nhạc.
- `memories.md`: phần chữ và liên kết ảnh đọc được bằng trình xem Markdown ngoài ứng dụng.
- `media/`: ảnh và nhạc đang lưu, đường dẫn trong JSON trỏ vào gói.
- `checksums.json`: SHA-256 các tệp nội dung; `README.txt` giải thích phạm vi.

Không gồm timeline chung, lời kín, câu trả lời, history/trash, cấu hình xác thực hoặc bản nháp trên thiết bị. Đây là gói lưu giữ nội dung cá nhân hiện tại, không phải xuất toàn bộ dữ liệu tài khoản theo một nghĩa pháp lý hay backup/restore toàn hệ thống; chưa có import ZIP. Ảnh là phiên bản đang lưu sau tối ưu, không hứa tái tạo file máy ảnh trước upload. Media demo có sẵn không được đóng gói.

Giới hạn: tối đa 500 record thuộc phạm vi xuất, 1.500 media, 8 MiB metadata và 96 MiB tổng nội dung; bộ nhớ thực tế có thêm chi phí dựng ZIP/Blob. API kiểm tra tổng bytes bằng SQL trước khi tải/deserialize tài liệu. Thư viện vượt giới hạn dùng tải từng ảnh, PNG hoặc PDF từng sổ. Có nút hủy và báo lỗi; không âm thầm bỏ qua tệp thiếu. Ngày trong tên ZIP dùng giờ Việt Nam.

ZIP được tạo trên thiết bị. API trả snapshot từ transaction nhất quán, chỉ đọc record sở hữu và dấu mốc riêng. Từng media đi qua API kiểm tra quyền hiện tại; đối chiếu lại tài khoản/fingerprint trước tải gói. Không tạo URL công khai, output server, record media mới hoặc job phải dọn retention; không tiêu quota video. API có giới hạn tần suất. Nội dung đã tải ra thiết bị không thể thu hồi qua Little Days.

## PDF cuốn sổ

Trong editor, chọn **Chia sẻ & Xuất ảnh Story → Cuốn sổ PDF → Tải cuốn sổ PDF**. Xuất tối đa 20 trang, mỗi trang thiết kế 720 × 900, tối đa 32 MiB ảnh đầu vào. Kết xuất từng trang qua renderer Canvas hiện có, chờ font/ảnh và lưu tài liệu trước xuất; kiểm tra lại quyền/revision sau kết xuất.

PDF dạng ảnh giữ chữ tiếng Việt, crop và thứ tự lớp; chưa tìm kiếm/chọn được chữ, không kèm nhạc hoặc chuyển động. Không dùng canvas ghép toàn sổ. Không thay primitive Canvas/viewer/MP4 hoặc thêm dependency/font mới.

## Câu hỏi theo chủ đề

Catalog có **96 câu tự biên soạn**, ID nội dung ổn định: 60 câu cũ và 36 câu mới về biết ơn, kỉ niệm, dự định. Có thể chọn chủ đề dùng chung trong Câu hỏi. Cần giữ ít nhất một chủ đề.

Chọn mới áp dụng từ **ngày mai theo giờ Việt Nam**; server lưu revision/CAS. Vòng đã tạo tiếp tục giữ nguyên câu, nội dung kín và thành viên ban đầu. Khi client gửi ID câu đã lỗi thời ở vòng chưa tạo, API trả 409 để đọc lại, không gắn câu trả lời vào một câu khác. Không cá nhân hóa từ lời riêng tư hoặc gửi nội dung sang AI.

Frontend mới dùng capability của session, đọc `catalogVersion=1` và ghi qua endpoint `answers-v2` có ID câu bắt buộc. Giao thức cũ tiếp tục lịch 60 câu cho vòng chưa tạo, giữ nháp của tab cũ tương thích; vòng đã có câu trả lời luôn đọc câu đã lưu. Nếu hai phiên cũ/mới cùng bắt đầu một ngày, CAS buộc phía đến sau tải lại câu đã được chốt. Khi backend rollback chưa có endpoint mới, request mới không rơi vào hợp đồng cũ rồi bị gắn nhầm câu.

Record chủ đề nằm trong repository hiện có, giới hạn lịch thay đổi gần đây; backup logic bao gồm record, xóa tài khoản theo owner hiện có. Thay thành viên làm đổi epoch và dùng lựa chọn mặc định của nhóm hiện tại; không mở lại lời kín cũ.

## Đồng hồ cát ghi nhận điều gì

Một lượt cát là **một thành viên có đóng góp trong một ngày Việt Nam**. Nguồn vẫn là metadata của câu trả lời, lời trong lọ, dấu mốc hoặc lần thêm ảnh được lưu thành công trong không gian chung và còn hợp lệ với tập thành viên hiện tại. Retry, autosave, mở app và thời gian online không thêm cát.

- Tổng tuần = số lượt thành viên/ngày khác nhau; sức chứa = số thành viên hiện tại × 7. Hai người có tối đa 14 lượt/tuần. Một người góp hôm nay cũng được ghi nhận, chưa cần cả hai hoàn tất.
- Các chấm ngày và số ngày cùng góp vẫn chỉ sáng hoàn tất khi mọi thành viên đều có đóng góp. Không hiển thị bảng so sánh ai quan tâm hơn. Nhịp có thể ẩn.
- Có số lượt, số ngày hoạt động và thời điểm API đối chiếu. Loading/lỗi không được diễn giải như tuần có 0 đóng góp. Khi đổi phạm vi thành viên phải bỏ số liệu cũ.
- Bình dưới trống khi 0, bình trên giảm khi tổng tăng; hình khối cát nằm trong lòng kính và chuyển thể tích giữa hai bình. Cát chảy ngắn khi tổng tăng rồi dừng; chuyển động trang trí không tự tăng số liệu.
- WebGL không dùng được thì SVG biểu diễn mức cát theo dữ liệu; chưa có dữ liệu dùng ảnh chờ. Vẫn giới hạn DPR/fps, tạm dừng khi ẩn tab/khuất viewport/có popup và tôn trọng reduced motion. Đổi màu/số liệu không tạo lại GPU context.
- Chế độ tĩnh giữ drawing buffer, dùng thời gian pose cố định và không đặt lại canvas khi kích thước nguyên không đổi. Cả dialog native đang mở cũng tạm dừng GPU. Đã kiểm tra lại bằng SwiftShader software sau lỗi so sánh ảnh reduced motion trên CI; phép so ảnh vẫn giữ nguyên và bổ sung kiểm tra không phát sinh lệnh vẽ GPU.
- Sang tuần mới tổng tuần tính lại. Xóa nội dung hoặc đổi quyền/thành viên có thể làm số liệu giảm: đây là thống kê nội dung còn hợp lệ, không phải sổ điểm vĩnh viễn hay thước đo tình cảm.

## Lần đầu sử dụng, cảm ứng và lịch điện thoại

Hôm nay gợi ý lưu một kỉ niệm riêng khi tài khoản chưa có nội dung, có “Để sau” nhớ theo tài khoản trên thiết bị. Không tự chèn dữ liệu mẫu hoặc bắt mời người thương trước khi sử dụng.

Chỉnh ảnh có nút trái/phải/lên/xuống và nhập độ phóng, ngoài kéo/range hiện có. Bổ sung vùng chạm cho các điều khiển liên quan và focus rõ ràng. Đây là cải thiện theo phạm vi kiểm tra, không phải chứng nhận toàn bộ WCAG.

Menu dấu mốc có **Thêm vào lịch điện thoại**: tải `.ics` của một sự kiện đang được phép đọc. Chỉ xuất tên/ngày, không kèm ghi chú/vị trí/ảnh. Sự kiện cả ngày dùng ngày kết thúc loại trừ; có UID ổn định, escape text và gấp dòng theo UTF-8. Bản sao không tự đồng bộ hay bị thu hồi. Lặp 29/2 theo iCalendar chỉ xuất hiện vào năm nhuận, khác chính sách nhắc bù nếu ứng dụng có áp dụng.

## Kiểm chứng và triển khai

Các suite mới:

```powershell
node --import tsx scripts/pilot-qa.ts portable-experience
node --import tsx scripts/pilot-qa.ts device-drafts
```

`portable-experience` tải PDF/ZIP/ICS thật, kiểm tra desktop/mobile, quyền tài khoản, nhịp một người góp, lỗi dọn storage, chủ đề và vị trí đọc sau phân trang. Có benchmark local cho serialization, localStorage cũ, IndexedDB và số đo tài nguyên/long task; log nằm trong `test-results/portable/`, không thu telemetry production hoặc gửi nội dung ra ngoài.

`device-drafts` kiểm tra hai tab giữ hai nhánh xung đột, chọn/khôi phục, di chuyển nháp cũ, lỗi IndexedDB, bản khẩn cấp mới hơn và dọn nháp có điều kiện. Unit mới được đưa vào runner PostgreSQL.

QA rộng đã chạy đủ **31 suite pilot** bằng fixture; sau các lớp bảo vệ metadata, nháp khẩn cấp và giao thức câu hỏi, đã chạy lại **portable-experience, device-drafts, couple-rituals, main-pages**, đều qua. Unit bản chốt: **177/177 qua**. Runner PostgreSQL 17: **105 qua, 2 bỏ qua theo điều kiện driver/phạm vi**, API, ba MP4 của ba người dùng và backup/restore qua Cloudinary HTTP fixture đều qua. Hai test bỏ qua đã ghi rõ trong runner: nhánh backup local và worker SQLite; không tính là test PostgreSQL đã thực thi.

Build/typecheck, format và smoke server production đã qua. Bundle local: JS chính **243,10 kB gzip**, CSS **50,16 kB gzip**, cảnh 3D tải riêng **138,87 kB gzip**; đây là bytes build, không phải tốc độ mạng hoặc FPS. Không thêm dependency. Các runner đã dừng service do mình khởi tạo; container PostgreSQL QA tạm đã được dừng/xóa.

PDF đã được tải thật, Poppler nhận hai trang 720 × 900 và đã xem trang có ảnh/chữ tiếng Việt. ZIP đã đọc bằng trình đọc ZIP độc lập và đối chiếu SHA-256; CRC-32 có test vector chuẩn. `.ics` đã tải và kiểm tra định dạng, ngày, UTF-8/escape, chưa mở trong lịch tài khoản thật.

Phép đo trong lượt QA cuối với tài liệu 20 trang × 50 phần tử, chuỗi ước tính 1,84 MB UTF-16: serialize khoảng 2,2–3,2 ms; ghi localStorage đồng bộ khoảng 5,3–6,2 ms; hoàn tất IndexedDB bất đồng bộ khoảng 22,5–26,8 ms. Hai viewport chạy trên cùng máy, không đại diện hai thiết bị khác nhau. Thời gian hoàn tất IndexedDB **không** là thời gian chặn main thread và không thể so trực tiếp thành tỉ lệ “nhanh hơn”. Phép đo chưa bao gồm mạng/cold start/production và không chứng minh INP thực tế đạt 200 ms. Không thu dữ liệu người dùng thật.

Không thêm env hoặc dependency. FE/API cần phát hành cùng thay đổi để có ZIP và cài đặt chủ đề; FE có gate cho backend cũ. Worker không cần đổi do không thay hợp đồng render video. Không tự provision dịch vụ hoặc gửi mail thật. Chưa xác minh import `.ics` trực tiếp trong tài khoản Google/Apple/Outlook thật, retention người dùng, FPS điện thoại thật hoặc rollout cloud.
