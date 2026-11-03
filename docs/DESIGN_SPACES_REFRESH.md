# Không gian riêng/chung và công cụ thiết kế sổ

Cập nhật 03/11/2026. Không thêm biến môi trường hoặc dịch vụ trả phí. Deploy FE/API cùng bản; session có `spacesVersion: 2` và `designCatalogVersion: 2` để frontend không gửi lựa chọn mới đến backend cũ.

## Riêng tư và cộng tác

- **Không gian riêng** luôn thuộc từng tài khoản. Chỉ tài khoản đó xem được dấu mốc, ảnh, lịch sử, bình luận và thùng rác trong không gian này. Album cá nhân cũng không tự chia sẻ.
- **Không gian chung** là nơi các thành viên đã chấp nhận lời mời cùng xem và chỉnh sửa. Khi có thành viên cộng tác, timeline ưu tiên mở không gian chung; bộ chọn phía trên cho chuyển sang riêng hoặc xem tất cả. Lịch vẫn tổng hợp dấu mốc có quyền truy cập theo lựa chọn hiện/ẩn của từng thành viên.
- Chọn đích tại **Lưu vào dòng thời gian** khi tạo. Người quản lý dữ liệu có thể sửa dấu mốc để đổi giữa không gian riêng của mình và không gian chung do mình khởi tạo. Thành viên cộng tác không được tự chuyển dữ liệu sang tài khoản khác. Chuyển đích giữ ID, ảnh, checklist, lịch sử và quota; dùng revision/CAS hiện có.
- Chuyển về riêng chặn request tiếp theo của thành viên, kể cả ảnh/thumbnail và lịch sử. Khôi phục nội dung từ phiên bản cũ không khôi phục quyền chia sẻ cũ. Nội dung đã được người khác tải xuống trước đó không thể thu hồi khỏi thiết bị của họ.
- Dữ liệu cũ đã có lịch sử chia sẻ giữ nguyên ở không gian chung. Các dấu mốc chưa từng chia sẻ được ghi rõ là riêng trước lời mời đầu tiên; không tự công bố chúng khi mời. Chủ dữ liệu có thể phân loại lại bằng đích lưu trên form sửa.

Storage/quota và quyền quản trị không gian chung vẫn neo ở người khởi tạo; chưa có chuyển sở hữu độc lập hoặc tự chuyển dữ liệu khi xóa tài khoản. Không có bản sao album/timeline cho từng thành viên.

## Avatar, bản đồ và bộ chọn

Avatar giữ khung vuông, bo tròn và crop cover trong thẻ timeline, thành viên popup chia sẻ và hồ sơ. Ảnh ghim bản đồ crop đúng khung; ảnh trong popup dùng kích thước cố định 42 × 42. Bộ chọn không gian có mô tả quyền tương ứng, chuyển thành một cột trên điện thoại.

## Thiết kế sổ

- Thêm **24 trang trí vector** thuộc tám bộ: cà phê, chuyến đi, biển, bầu trời, thư tay, vườn, sinh nhật và nhật ký giấy. Tìm theo tên hoặc bộ sưu tập. Tổng cộng 42 trang trí lớn.
- **Ký hiệu nhỏ** có thêm 12 vector theo ba nhóm Lời thương, Hành trình, Dấu ngày; giữ sáu ký hiệu chữ cũ. Vector tự vẽ trong mã nguồn, không gọi dịch vụ ảnh ngoài.
- Bộ đếm có **10 giao diện**, thêm bưu thiếp, đêm sao, tem, trang vở và ruy băng; tám bảng màu, chỉnh riêng nền/viền/điểm nhấn, ngày bắt đầu và lời nhắn. Chế độ ngày đã qua, dịp năm và mốc mục tiêu tiếp tục dùng chung ngày tham chiếu của tài liệu/video.
- Hiệu ứng lặp: đứng yên, nổi nhẹ, nhịp thở và đung đưa. Editor giữ vị trí tĩnh để dễ căn; mở **Xem album** để xem chuyển động. Viewer và MP4 dùng cùng hàm chuyển động; viewer dừng khi hệ thống bật giảm chuyển động.
- **Sao chép kiểu / Dán kiểu** giữ vị trí, kích thước, nội dung, ảnh và ngày riêng của phần tử đích; không sửa phần tử khóa. **Đặt lại góc** đưa lựa chọn về 0°. Các thao tác tiếp tục đi qua undo/redo và autosave.
- Khi hủy video đang chạy, giao diện hiện **Đang hủy xuất video…** ngay khi server nhận yêu cầu; nút không gửi lặp. Trạng thái hoàn tất hủy chỉ hiện sau khi worker xác nhận dừng, không giả báo đã hủy trong lúc worker còn xử lý.

Khung thiết kế vẫn 720 × 900. Không thay ảnh gốc, không lưu binary vào cache frontend và không bật lại worker cloud đã hủy. Nếu tiếp tục dùng worker xuất MP4 hiện có, cần cập nhật mã/build worker cùng bản để nhận kiểu bộ đếm và hiệu ứng mới. Kiểm tra xuất MP4 dùng worker QA cục bộ và dữ liệu giả; không chứng minh worker production đang chạy.

## Kiểm chứng

Unit kiểm tra quyền/private feed, dữ liệu cũ, khôi phục không công bố lại, schema bộ đếm, chuyển động xác định theo frame và dán kiểu giữ hình học. `node --import tsx scripts/pilot-qa.ts design-spaces` kiểm tra hai tài khoản, desktop/mobile, avatar ảnh ngang, crop map, đổi đích qua form, thiết kế mới, reduced motion và tải MP4 thực. SQL/quyền còn được chạy bằng PostgreSQL QA qua `npm run test:postgres`.

Kết quả CI và phiên bản deploy cần đối chiếu commit thực tế khi bàn giao; tài liệu này không ghi nhận pilot người dùng thật.

Kết quả local 03/11/2026: 130 unit đạt; API, typecheck, PostgreSQL/API/load/backup và 10 test timeline-sharing cuối trên PostgreSQL QA đạt. Đủ 22 suite UI đạt qua lượt đầu và các lượt chạy tiếp sau khi cập nhật fixture cho 11 mẫu bộ đếm; bài video còn kiểm tra phản hồi hủy ngay và worker xác nhận dừng. MP4 thực đạt H.264, 1080 × 1920, 30 fps, 15 giây; đã xem frame mở đầu, trang sổ và kết thúc. Các ảnh/email/database đều là fixture; chưa xác nhận bằng dữ liệu người dùng thật.
