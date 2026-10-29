# Xóa tài khoản và dữ liệu

## Cách sử dụng

Mở **Tài khoản → Xóa tài khoản**, nhập mật khẩu hiện tại, gõ đúng **XÓA TÀI KHOẢN** và đánh dấu xác nhận. Yêu cầu được lưu trên database trước khi trả kết quả. Thao tác không thể hoàn tác sau khi được tiếp nhận.

Ngay khi tiếp nhận, ứng dụng thu hồi mọi phiên đăng nhập và link chia sẻ, vô hiệu hóa token xác minh/reset, hủy video chờ xuất và yêu cầu dừng video đang chạy. Tài khoản không thể đăng nhập hoặc ghi thêm dữ liệu. API trả HTTP 202; xóa file chạy nền để không giữ trình duyệt chờ Cloudinary.

Giao diện hiển thị tiến độ và dừng kiểm tra khi hoàn tất. Mã theo dõi nằm trong `sessionStorage`, vẫn dùng được khi tải lại cùng tab. Mã chỉ cho xem trạng thái; không cho đọc album, email hoặc media. Đóng tab/mất mã không dừng yêu cầu trên máy chủ.

## Phạm vi

- Xóa album, kỉ niệm, lịch sử phiên bản, mẫu layout cá nhân, cấu hình video và thông tin tài khoản.
- Dọn ảnh, nhạc riêng, video đã xuất và file upload/render chưa hoàn tất đã được ghi nhận trong sổ media.
- Xóa session, share token, auth token, hàng đợi video và thư development của email đó trong `DATA_DIR/mail`.
- Dọn bản nháp trình duyệt của người dùng hiện tại khi giao diện nhận kết quả chấp nhận. Bản nháp trên trình duyệt/thiết bị khác không thể bị server xóa từ xa.

Sau khi hoàn tất, giữ dấu chặn tối thiểu gồm UUID chủ sở hữu, hash mã theo dõi, mốc thời gian và thông tin kỹ thuật của yêu cầu. Dấu chặn ngăn tiến trình cũ ghi lại dữ liệu đã xóa; không chứa email, mật khẩu hoặc nội dung album.

Chỉ xóa object do database/lịch sử/sổ media của chủ sở hữu tham chiếu. File mồ côi từ trước khi có sổ media, không còn bất kỳ tham chiếu nào, cần quy trình kiểm kê storage riêng. Không quét xóa toàn bộ Cloudinary folder hoặc bucket dùng chung.

Email đã giao qua SMTP, file người khác đã tải và backup đã tạo trước đó nằm ngoài phạm vi dọn trực tiếp. Người vận hành cần áp dụng chính sách lưu trữ riêng cho backup. Khôi phục backup cũ vào database mới có thể đưa tài khoản đã xóa trở lại; cần đối chiếu và xử lý yêu cầu xóa trước khi mở lại dịch vụ.

## Độ bền và xử lý lỗi

API và worker cùng xử lý hàng đợi xóa với lease trên database. Job chờ video đang chạy và upload/email đã bắt đầu kết thúc hoặc hết hạn. Object được ghi nhận trước khi upload; snapshot video vẫn bất biến. SQL guard chặn ghi mới cho chủ sở hữu đã yêu cầu xóa.

Danh sách file còn lại được lưu sau mỗi lần xóa. Nếu storage lỗi hoặc tiến trình khởi động lại, job tiếp tục từ tiến độ đã lưu; thao tác xóa file có thể chạy lại. Retry tăng từ 5 giây tới tối đa 1 giờ giữa các lần thử. API hoặc worker phải đang chạy để tiến độ tiếp tục.

Giữ nguyên database, storage driver và đích lưu trữ khi còn yêu cầu chưa hoàn tất. Job lưu fingerprint của Cloudinary cloud/folder hoặc S3 bucket/prefix/endpoint; local dùng đường dẫn dữ liệu. Nếu đích thay đổi, job chuyển sang retry và không xóa file trên đích mới. Có thể xoay credentials nhưng phải giữ quyền xóa trên cùng đích.

Không cần biến môi trường mới; `.env` hiện có được giữ nguyên. Sau khi cập nhật mã nguồn, khởi động lại API và worker bằng `npm run dev`; production cần build và restart cả hai tiến trình.

## Vận hành

```powershell
# Thống kê trạng thái trong database, không xóa media:
npm run cleanup:accounts

# Xử lý tối đa 50 lượt job đã tới thời điểm chạy:
npm run cleanup:accounts -- --execute
```

Execute sử dụng database/storage từ `.env`, tôn trọng lease và thời gian retry, không bỏ qua video/upload đang chạy. Lệnh không hủy yêu cầu hoặc phục hồi tài khoản. Khi retry kéo dài, kiểm tra cấu hình đích, kết nối/quyền xóa storage và trạng thái API/worker. Không chạy migration storage khi đang dọn tài khoản.

Backup/restore từ chối chạy khi còn yêu cầu xóa chưa hoàn tất hoặc upload/email đang xử lý. Đợi hoàn tất, dừng API/worker và làm theo [BACKUP_RESTORE.md](BACKUP_RESTORE.md). Các backup đã tồn tại không được tự động viết lại. Backup không chứa hàng đợi xóa, sổ media hoặc dấu chặn tài khoản; cần lưu nhật ký yêu cầu xóa bằng quy trình vận hành riêng khi quản lý backup.

## Kiểm thử

```powershell
npm test
npm run test:deletion

# Cần web/API đang chạy:
npm run test:deletion-ui
```

Unit test kiểm tra mật khẩu, thu hồi quyền, chặn ghi muộn, chờ upload/render, retry qua repository mới, operation hết hạn, từ chối đổi đích storage và chặn backup đang xóa. API smoke dùng SQLite và Cloudinary HTTP fixture, kiểm tra ảnh/nhạc/video/file chưa hoàn tất và dữ liệu tài khoản khác. UI smoke kiểm tra xác nhận, sai mật khẩu, bản nháp đúng chủ sở hữu, tiến độ sau reload và desktop/mobile. Không dùng credentials Cloudinary thật hoặc gửi email thật.

Schema/guard đã được kiểm chứng với SQLite và PostgreSQL 17 thật trong container QA riêng. Cleanup media có thêm retention chung và quota; xem [OPERATIONS.md](OPERATIONS.md).
