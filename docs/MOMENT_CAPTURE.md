# Lưu dấu mốc dễ hơn

Cập nhật 11/11/2026. Ưu tiên thao tác lưu khoảnh khắc từ Hôm nay, Dòng thời gian và Lịch; không thêm hạ tầng hoặc thay schema API.

## Trải nghiệm

- Nút Thêm dấu mốc nổi bật hơn các nút quản lý, dùng cùng một kiểu trên ba trang chính. Lịch vẫn lấy ngày đang chọn; lựa chọn không gian và quyền hiện tại được giữ nguyên.
- Trong form, chọn ảnh ở đầu, sau đó đặt tên, ngày và một lời nhắn. Có thể lưu chỉ nội dung mà không chọn ảnh. Xem trước ảnh, thêm ảnh qua nhiều lượt chọn và bỏ từng ảnh trước khi lưu; tối đa sáu ảnh tính cả ảnh đã lưu.
- Địa điểm là phần mở thêm. Bản đồ chỉ mount sau lần mở đầu tiên; dữ liệu đã nhập không bị mất khi thu gọn. Dấu mốc đang có địa điểm được mở sẵn phần này.
- Header và nút lưu nằm ngoài vùng nội dung cuộn, dùng được ở màn hình nhỏ. Nội dung footer cho biết không gian riêng/chung khi có metadata xác thực; backend cũ thiếu metadata dùng thông báo quyền trung tính.
- Khi đóng form có nội dung chưa lưu, xác nhận bằng dialog trong ứng dụng. Xóa ảnh đã lưu cũng dùng dialog ứng dụng và giữ revision hiện tại; không đặt lại nội dung đang gõ. Đây là bảo vệ thao tác đóng, chưa phải bản nháp dấu mốc bền vững qua reload/đóng trình duyệt.

## Hiệu năng và dữ liệu

- Ảnh được chuẩn bị bằng hàng đợi một ảnh tại một thời điểm ngay khi được chọn. Preview dùng bản đã tối ưu; upload dùng lại cùng promise/file qua WeakMap theo File và kích thước đích, không tối ưu lại chỉ để gửi. Object URL được thu hồi khi danh sách thay đổi hoặc form đóng. Giữ pipeline JPEG/PNG/WebP, giới hạn dung lượng, receipt/retry và chuẩn hóa ảnh hiện có; không đổi chính sách ảnh gốc.
- Trước đây luồng lưu thành công gọi callback cập nhật sau metadata, sau batch ảnh và khi đóng form. Nay chỉ công bố cập nhật cuối qua `onSaved`. Nếu batch lỗi, `onUpdated` vẫn công bố phần đã lưu và giữ lại đúng các file lỗi để thử lại. Xóa ảnh chủ động vẫn công bố cập nhật ngay.
- Có khóa đồng bộ trong form để không gửi hai lượt lưu khi thao tác lặp nhanh. Thử lại sau lỗi ảnh dùng ID/revision của dấu mốc vừa tạo, không POST tạo thêm dấu mốc. Không thêm retry mù cho POST tạo metadata khi phản hồi không rõ kết quả.
- Ảnh đã lưu trong form dùng endpoint thumbnail có kiểm tra quyền. Không cache lâu hơn hoặc bỏ kiểm tra quyền để làm form nhanh hơn.
- Lần thay đổi này không tối ưu SQL của `/journal-state`, không giải quyết cold start Render/Neon hoặc thời gian mạng tới Cloudinary. Phần chẩn đoán truy vấn vẫn nằm trong [PERFORMANCE.md](PERFORMANCE.md).

## Kiểm chứng

`node --import tsx scripts/pilot-qa.ts moment-composer` dùng API/ảnh giả trên desktop 1440 và mobile 390/320 px. Kiểm tra preview nhiều lượt chọn, số lần decode ảnh, không đọc lại feed trong khi upload bị giữ phản hồi, một POST metadata, gõ giữa câu, xác nhận đóng và vị trí nút lưu. Cố tình cho một ảnh lỗi rồi thử lại để đối chiếu ID/số ảnh, tránh tạo dấu mốc hoặc ảnh trùng.

Kiểm chứng cục bộ: 186/186 unit đạt; typecheck, format, build, production smoke và các suite `moment-composer`, `journal`, `journal-refresh`, `shared-plans` đạt. Bộ form còn kiểm tra ảnh hỏng, lỗi 409 khi xóa ảnh và việc giữ lời nhắn đang sửa. Báo cáo fixture nằm trong `test-results/moment-composer/` và `test-results/pilot/`. Số request/decode của fixture không phải phép đo tốc độ trên điện thoại thật hoặc production. CI và SHA API/asset frontend phải được xác minh riêng khi phát hành.
