# Cùng xây dựng dòng thời gian

## Sử dụng

1. Cả hai đăng nhập bằng tài khoản riêng và xác minh email.
2. Chủ dòng thời gian mở **Chia sẻ dòng thời gian**, nhập email người muốn mời và chọn **Mời cùng chỉnh sửa**.
3. Người nhận mở ứng dụng: lời mời hiện trên Hôm nay/Lịch/Dòng thời gian. Mở lời mời và **Chấp nhận**.
4. Người nhận có thể xem ảnh, thêm, sửa và xóa các dấu mốc/ghi chú trong dòng thời gian chung. Khi thêm mới, chọn **Lưu vào dòng thời gian**; trên trang Timeline có bộ lọc dòng thời gian riêng/chung.

Ghi chú mới từ Hôm nay/Lịch luôn mặc định vào dòng thời gian riêng. Chọn rõ dòng thời gian chung trong form nếu muốn cùng lưu giữ; sửa mốc có sẵn giữ nguyên dòng thời gian gốc.
5. **Hiện trên lịch của tôi** mặc định bật sau khi chấp nhận. Tắt lựa chọn này chỉ ẩn các mốc chung khỏi Hôm nay/Lịch của người nhận; không đổi lịch của chủ và không mất quyền cùng chỉnh sửa.
6. Chủ có thể thu hồi quyền; người nhận có thể từ chối/rời dòng thời gian. Các dấu mốc đã cùng viết vẫn thuộc dòng thời gian gốc. Quyền quản lý thành viên thuộc chủ dòng thời gian.

Lời mời nằm trong ứng dụng, không tự gửi email. Mỗi dòng thời gian có tối đa 10 thành viên/lời mời; mỗi người nhận tối đa 100 dòng thời gian/lời mời. Dữ liệu được tải lại khi quay lại tab hoặc khoảng 30 giây khi đang xem dashboard; không ghi đè form đang mở. Khi hai người cùng sửa một mốc, bản lưu sau với revision cũ nhận thông báo xung đột và giữ nội dung đang nhập.

Chia sẻ này áp dụng cho dấu mốc/ghi chú và ảnh của chúng. Album, ảnh riêng trong album và các mốc tổng hợp từ album không tự được cấp quyền. Tạo scrapbook từ dấu mốc tiếp tục dùng nguồn thuộc tài khoản của người tạo; chia sẻ album công khai vẫn là cơ chế riêng chỉ đọc.

## Lịch và trang Hôm nay

Desktop dùng lịch rộng 3 phần, ghi chú ngày đang chọn và sự kiện sắp tới rộng 1 phần; màn hình hẹp xếp dọc. Hôm nay ưu tiên ngày hiện tại, số điều cần nhớ, ghi nhanh, lịch và ghi chú; phần giới thiệu scrapbook lớn chuyển về trang Album. Lịch chung hợp nhất theo ngày, giữ nhãn người sở hữu và không nhân bản dữ liệu sang tài khoản khác.

## URL riêng

| Trang | Đường dẫn |
| --- | --- |
| Hôm nay | `/today` (`/` chuyển về đây) |
| Dòng thời gian | `/timeline` |
| Lịch | `/calendar` |
| Album | `/albums` |
| Ảnh đã lưu | `/photos` |
| Chỉnh sửa album | `/albums/:id` |

URL hỗ trợ tải lại, mở trực tiếp, Back/Forward và tiêu đề tab riêng. Liên kết album chia sẻ và xác minh/khôi phục tài khoản vẫn dùng cơ chế cũ. API kiểm tra quyền sở hữu khi mở album từ URL; biết ID không cấp quyền truy cập.

## Lưu trữ và triển khai

Không thêm biến môi trường hoặc dịch vụ mới. Deploy frontend và API cùng commit; không cần đổi worker MP4 cho tính năng này. Quyền được lưu trong bảng `records` qua hai kind `timeline-grant` (chủ dòng thời gian) và `timeline-member-index` (tra cứu theo người nhận, không sao chép dữ liệu mốc). Backup/restore hiện có giữ cả hai loại record.

Ảnh và mốc do thành viên thêm vẫn thuộc chủ dòng thời gian; dung lượng tính vào quota của chủ. Thu hồi quyền chặn các lần đọc ảnh và chỉnh sửa mới; upload đang chạy phải kiểm tra lại quyền trước khi gắn ảnh vào dấu mốc, nếu bị thu hồi sẽ dọn bản tải lên. Giao dịch và khóa theo chủ/thành viên dùng chung cho SQLite/PostgreSQL, giữ compare-and-swap. Xóa tài khoản thu hồi các quan hệ liên quan, không xóa nhầm mốc thuộc người khác.

Kiểm chứng: `tests/timeline-sharing.test.ts` cho đồng thuận, CAS đồng thời, ảnh/quota, thu hồi trong lúc upload, backup và xóa thành viên; cùng bộ test đó chạy trên PostgreSQL trong CI. `npm run test:pilot -- timeline-sharing` dùng hai tài khoản giả, outbox email local và trình duyệt desktop/mobile để kiểm tra quyền, lịch chung, tỷ lệ 3:1 và điều hướng. Không gửi email thật hoặc tạo tài nguyên trả phí.
