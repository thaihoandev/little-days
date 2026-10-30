# Pilot và nghiệm thu

## Phạm vi

Trạng thái ngày 30/10/2026: người dùng đã xác nhận email thật, backup theo lịch và phục hồi thử hoàn tất. Chưa có kết quả từ 3–5 người dùng thật; xác nhận receiver cảnh báo vận hành vẫn cần ghi riêng. Ghi run URL/checksum đã đối chiếu vào [PILOT_RESULTS.md](PILOT_RESULTS.md), không ghi khóa mã hóa hoặc thông tin tài khoản.

Pilot với 3–5 người dùng thật sau khi staging có domain/TLS và email hoạt động. Bộ kiểm thử ba tài khoản tự động đã có trong `test:load`; nó không thay thế phản hồi của người dùng thật.

## Nghiệm thu tự động trước khi mời người thử

```powershell
npm ci
npm run video:browser
npm run test:pilot

# Chỉ kiểm tra tự lưu/lưu thủ công khi backup và giữ bản nháp khi xung đột:
npm run test:save-recovery

```

`test:pilot` tự mở API, worker và web trên cổng localhost trống riêng, dùng SQLite/media/hộp thư local trong `test-results/pilot/<UUID>`. Không dùng `.env.cloud`, Neon, Cloudinary hoặc email thật; không chạy lên app production. Nó kiểm tra editor, autosave khi backup trả 503, auth, history, video, xóa tài khoản, layout và MP4 thật bằng các smoke scripts sẵn có. API bắt đầu trước worker để tránh migration khởi động cùng lúc. Chỉ các tiến trình do lượt kiểm thử tạo ra được dừng.

Kết quả là `report.json`, log từng kịch bản và ảnh desktop/mobile trong thư mục lượt chạy. Report ghi commit HEAD và `workingTreeDirty` để nhận biết kiểm thử có thay đổi chưa commit; `fullSuite: false` khi chạy riêng save-recovery. Luôn ghi `realPilotVerified: false`, không đánh dấu người thật đã thử. Các file này được ignore khỏi Git. Đừng chia sẻ toàn bộ thư mục data/mail; nếu cần đính kèm báo cáo chỉ chọn report và ảnh fixture.

Editor tự thử lưu lại sau `503 BACKUP_IN_PROGRESS`, tôn trọng Retry-After và giữ chỉnh sửa mới nhất trong lúc chờ. Lỗi 409 vẫn yêu cầu giải quyết xung đột, không tự ghi đè. Lỗi gửi POST/upload/export không được tự retry bởi cơ chế autosave này.

## Tổ chức đợt thử

1. Chọn 3–5 người và gán mã P01–P05, gồm ít nhất một người dùng điện thoại. Dùng tài khoản/ảnh thử riêng; chỉ người tham gia tự đăng nhập và giữ mật khẩu.
2. Chọn một khoảng thời gian có worker local chạy để thử MP4. Worker cloud vẫn được bỏ qua theo yêu cầu.
3. Mỗi người thực hiện kịch bản bên dưới, ghi kết quả theo mã TC trong PILOT_RESULTS.md. Cần xác nhận bản nháp khi có cảnh báo chưa lưu trước khi đóng trang.
4. Người vận hành ghi lỗi, mức độ và bằng chứng đã loại thông tin riêng tư. Không tự thu thập ảnh hay nội dung album.
5. Sửa lỗi chặn thao tác/mất dữ liệu, chạy lại QA và nhờ đúng người gặp lỗi thử lại trước khi quyết định phát hành.

Nội dung mời mẫu để người vận hành tự gửi: “Mời bạn thử Little Days tại https://little-days-api.onrender.com. Hãy dùng ảnh thử không riêng tư, tạo một album, đổi bố cục, mở lại trên điện thoại và xuất clip ngắn trong thời gian đã hẹn. Gửi lại mã bước bị lỗi, thiết bị/trình duyệt và mô tả thao tác; không gửi mật khẩu, token email hoặc ảnh riêng tư.” Repository không tự gửi lời mời.

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
