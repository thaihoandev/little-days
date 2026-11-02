# Kỉ niệm có thể lấy lại, cùng trò chuyện và thư viện ảnh

Cập nhật ngày **02/11/2026**. Phạm vi đợt ưu tiên: thùng rác/lịch sử dấu mốc, bình luận/cảm xúc, Ngày này năm trước và cải thiện Ảnh đã lưu. Các ý tưởng khác trong danh sách nghiên cứu chưa được coi là đã triển khai.

## Cách sử dụng

- Trong thẻ dấu mốc, icon **lời nhắn** mở bình luận và bốn cảm xúc. Mỗi người chọn một cảm xúc hoặc bỏ chọn. Bình luận có tên, avatar khi được phép xem, thời gian và nút xóa theo quyền.
- Icon **lịch sử** mở các phiên bản nội dung/ảnh. Chọn một phiên bản để xem trước rồi khôi phục. Thao tác này tạo phiên bản mới, không ghi đè lịch sử bằng revision cũ.
- Xóa dấu mốc chuyển vào **Thùng rác dấu mốc**, rời khỏi timeline/lịch/thư viện ảnh hiện tại. Mở icon thùng rác tại danh sách để lấy lại. Thành viên đang có quyền cộng tác được lấy lại dấu mốc; chỉ chủ dòng thời gian được xóa vĩnh viễn, có xác nhận riêng.
- **Ngày này năm trước** xuất hiện tại Hôm nay khi có kỉ niệm của các năm trước cùng ngày/tháng. Hiển thị năm, ảnh, lời nhắn; bấm để mở album hoặc dấu mốc. Không dùng kế hoạch chưa hoàn thành hoặc nội dung trong thùng rác; ngày 29/2 được so khớp đúng ngày, không tự chuyển sang 28/2.
- **Ảnh đã lưu** gom ảnh album và dấu mốc được phép xem, có tìm theo tên album/dấu mốc/ngày và bộ lọc nguồn. Bố cục ảnh dọc/ngang, bo góc, nhãn ngữ cảnh và icon thay cho tên file. Hiển thị trước 60 ảnh rồi có nút xem thêm; đây là giới hạn render phía client, chưa phải phân trang API.
- Icon **tải xuống** có trên từng ảnh ở thư viện và trong popup xem ảnh. Tải qua endpoint riêng tư, kiểm tra HTTP/định dạng ảnh trước khi lưu; không mở tab ảnh mới. Tên tải về có dạng `little-days-<id>.jpg/webp/png`. Metadata tên file gốc vẫn giữ trong backend để không phá dữ liệu cũ, nhưng không dùng làm caption hiển thị.

## Quyền truy cập và giới hạn

- Giữ tối đa **20 phiên bản/dấu mốc**, gồm cả ảnh từng được gỡ khỏi bản hiện tại. Lịch sử bắt đầu được ghi từ khi triển khai tính năng; không tự tạo lại các phiên bản hoặc ảnh đã xóa trước đó.
- Thùng rác không tự xóa theo ngày; nội dung vẫn nằm trong giới hạn 500 dấu mốc của timeline. Ảnh trong thùng rác/lịch sử vẫn được tính dung lượng, bảo vệ khỏi dọn rác và đưa vào backup. Sau khi phiên bản cũ bị loại khỏi 20 bản giữ lại, media không còn tham chiếu được dọn bằng cơ chế maintenance/grace hiện có khi API hoạt động.
- Xóa vĩnh viễn loại bỏ dấu mốc, phiên bản, bình luận/cảm xúc và dọn những ảnh còn liên quan. Lỗi xóa object được xử lý bởi cơ chế dọn media hiện có; không giảm quota trước khi xóa object thành công.
- Lấy lại/khôi phục/xóa có kiểm tra revision. Khi người khác vừa sửa, API trả xung đột; giao diện giữ lỗi để người dùng tải lại thay vì âm thầm ghi đè.
- Bình luận tối đa 100/dấu mốc, 2.000/tác giả và 1.000 ký tự/bình luận; thao tác gửi/cảm xúc có rate limit. Gửi lại cùng request ID không tạo bình luận trùng. Không có chat hoặc thông báo push/email mới trong đợt này.
- Thu hồi/rời timeline chặn request tiếp theo tới bình luận, lịch sử và ảnh lưu trữ. Thông tin tác giả không còn quyền xem hồ sơ được thay bằng nhãn thành viên trước đây; không lộ avatar riêng qua bình luận cũ.
- Khi xóa tài khoản, nội dung bình luận/cảm xúc do tài khoản đó viết được xóa; xóa chủ timeline cũng xóa hoạt động của timeline đó. Ảnh trong lịch sử được tích hợp với quy trình xóa tài khoản và backup/restore.

## Dữ liệu và triển khai

Không có SQL migration thủ công, dependency hoặc biến môi trường mới. Dùng bảng `records` hiện có:

| Loại | Chủ sở hữu | Nội dung |
| --- | --- | --- |
| `journal` | Chủ timeline | Thêm `deletedAt` tùy chọn cho thùng rác |
| `journal-version` | Chủ timeline | Snapshot bất biến, revision, tác giả và hành động |
| `journal-comment` | Tác giả | Lời nhắn, dấu mốc đích, chủ timeline |
| `journal-reaction` | Tác giả | Một cảm xúc/tác giả/dấu mốc |

ID phiên bản/bình luận có tiền tố dấu mốc để truy vấn đúng nhóm thay vì tải toàn bộ lịch sử của tài khoản. Backup giữ nguyên các record mới và ảnh snapshot.

Deploy **API Render và FE Vercel cùng commit**. Session API mới có `journalFeatures: 1`; frontend cũ vẫn tương thích, frontend mới ẩn nút cộng tác/thùng rác khi API chưa hỗ trợ. Không thay Cloudinary, Brevo, Neon, lịch backup hoặc cấu hình worker hiện tại.

## Kiểm chứng

- Unit: quyền ba tài khoản, CAS/khôi phục stale, giữ ảnh đã gỡ, snapshot/backup, giới hạn 20 phiên bản, thùng rác/lấy lại/xóa vĩnh viễn, idempotency bình luận, cảm xúc và xóa tài khoản; thêm ca ngày nhuận.
- UI desktop/mobile: hai người bình luận, thả cảm xúc, xem/khôi phục phiên bản ảnh, các bước thùng rác, gallery không hiện tên file, bộ lọc, tải file khớp SHA-256 và không tràn ngang.
- SQLite và PostgreSQL dùng cùng dịch vụ; kiểm thử local dùng tài khoản/mail/tile giả, không gửi email thật hoặc sửa dữ liệu production.
