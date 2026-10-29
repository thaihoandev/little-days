# Pilot và nghiệm thu

## Phạm vi

Pilot với 3–5 người dùng thật sau khi staging có domain/TLS và email hoạt động. Bộ kiểm thử ba tài khoản tự động đã có trong `test:load`; nó không thay thế phản hồi của người dùng thật.

## Kịch bản mỗi người dùng

1. Tạo tài khoản, xác minh email; tạo album có ngày bắt đầu và múi giờ của mình.
2. Tải ảnh dọc/ngang, sửa chữ tiếng Việt, chọn nhiều/nhóm/căn chỉnh, đổi layout và lưu mẫu riêng.
3. Đóng/mở lại; thử hai tab và xác nhận xung đột không ghi đè âm thầm. Xem lịch sử và khôi phục một revision.
4. Thử text dài/khung nhỏ, xem cảnh báo tràn và sửa lại; kiểm tra album trên điện thoại.
5. Upload nhạc, quan sát waveform, kéo điểm cắt, chỉnh âm lượng/lặp; xuất video và đối chiếu nội dung với preview.
6. Chia sẻ album cho người thứ hai; thu hồi link và kiểm tra link cũ không xem được.
7. Xem hạn mức; thử file không hợp lệ, hủy xuất video, đổi/quên mật khẩu và đăng nhập lại.
8. Với tài khoản thử riêng, xác nhận xóa tài khoản; kiểm tra phiên/share bị thu hồi và tiến độ hoàn tất.

Không yêu cầu người tham gia gửi mật khẩu, email token hoặc ảnh riêng tư qua kênh báo lỗi. Dùng requestId/jobId và mô tả thao tác; ảnh chụp lỗi phải được người dùng đồng ý chia sẻ.

## Mẫu ghi nhận

| Người thử | Thiết bị/trình duyệt | Kịch bản | Kết quả | Khó khăn/lỗi | Mức độ | Request/job ID | Đã xử lý |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | | | | | | | |
| P02 | | | | | | | |
| P03 | | | | | | | |
| P04 | | | | | | | |
| P05 | | | | | | | |

## Điều kiện mở rộng pilot

- [ ] Không có lỗi mất dữ liệu, lộ album hoặc vượt quyền.
- [ ] Các người thử hoàn tất tạo → lưu → mở lại → xuất/tải MP4.
- [ ] Không có lỗi chặn thao tác trên các điện thoại đã chọn.
- [ ] SMTP, TLS, quota, cleanup và cảnh báo được kiểm tra trên staging thật.
- [ ] Backup theo lịch chạy được; restore độc lập đã đối chiếu checksum và quyền truy cập.
- [ ] Ghi nhận thời gian xuất, RSS/CPU toàn container, chi phí storage và băng thông trên hạ tầng đích.
- [ ] Có tag image trước, backup và người chịu trách nhiệm rollback.
- [ ] Đối chiếu quyền sử dụng font/nhạc/Remotion theo mô hình phát hành.

Các ô này cần kết quả pilot/hạ tầng thật, không đánh dấu hoàn tất bằng smoke test local.
