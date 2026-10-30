# Hồ sơ nghiệm thu pilot Little Days

Mẫu ghi nhận bắt đầu ngày 30/10/2026. Chưa có kết quả pilot thực tế. Dùng mã P01–P05 thay cho thông tin nhận diện; không ghi email, mật khẩu, token, khóa backup hoặc ảnh riêng tư vào file này.

## Điều kiện trước đợt thử

| Điều kiện | Trạng thái | Bằng chứng cần ghi |
| --- | --- | --- |
| App public / HTTPS | Đã triển khai theo phiên làm việc | URL và commit Render đang chạy |
| Xác minh/quên mật khẩu gửi email thật | Người dùng xác nhận đã xong | Ngày thử; không đính kèm link có token |
| Backup và phục hồi độc lập | Người dùng xác nhận đã xong 30/10/2026 | GitHub run URL, ngày backup, kết quả checksum; không ghi khóa |
| Receiver cảnh báo vận hành | Chưa xác nhận riêng | Ngày nhận cảnh báo/phục hồi |
| QA tự động trên commit ứng viên | Chưa điền | Commit + đường dẫn report.json của test:pilot |
| Worker local và thời gian thử video | Chưa điền | Khoảng thời gian hẹn theo giờ Việt Nam |

## Ma trận kịch bản

Mỗi ô ghi `PASS`, `FAIL:<mã lỗi>` hoặc `CHƯA THỬ`. Không thay các ô bằng kết quả của tài khoản tự động.

| Mã | Kịch bản và điều kiện đạt | P01 | P02 | P03 | P04 | P05 |
| --- | --- | --- | --- | --- | --- | --- |
| TC01 | Đăng ký/xác minh; đăng nhập lại vẫn thấy album đã tạo | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC02 | Ngày bắt đầu/múi giờ/kỉ niệm hiển thị đúng theo thông tin nhập | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC03 | Upload ảnh dọc/ngang; sửa chữ tiếng Việt, nhóm/căn chỉnh/lưu mẫu đúng | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC04 | Lưu → đóng/mở lại; hai tab báo 409; history restore có thể quay lại | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC05 | Điện thoại đọc/sửa được, không tràn ngang hoặc nút bị che | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC06 | Nhạc/trim/thời lượng cảnh khớp preview; MP4 tải được và phát đúng | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC07 | Share chỉ đọc; người khác không vào thư viện riêng; thu hồi link có hiệu lực | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC08 | File sai bị từ chối, hủy export và hạn mức có thông báo rõ ràng | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC09 | Quên/đổi mật khẩu hoạt động; phiên cũ bị thu hồi | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |
| TC10 | Xóa tài khoản thử riêng hoàn tất; share/phiên cũ bị thu hồi; tài khoản khác giữ nguyên | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ | CHƯA THỬ |

## Thiết bị và quan sát

| Người thử | Thiết bị / hệ điều hành / trình duyệt | Ngày thử | Điểm khó dùng nhất | Mong muốn ưu tiên |
| --- | --- | --- | --- | --- |
| P01 | | | | |
| P02 | | | | |
| P03 | | | | |
| P04 | | | | |
| P05 | | | | |

## Sổ lỗi

P0: mất dữ liệu/lộ nội dung/vượt quyền → dừng pilot và xử lý ngay. P1: không hoàn thành luồng chính → chưa mở rộng pilot. P2: hoàn thành được bằng cách khác → có kế hoạch sửa. P3: lỗi hiển thị nhỏ → ghi backlog. Nếu lỗi ảnh hưởng bảo mật/dữ liệu, ưu tiên mức độ ảnh hưởng thực tế hơn tên chức năng.

| Mã lỗi | TC / người thử | Mức độ | Bước tái hiện và kết quả mong đợi | RequestId/jobId nếu có | Commit sửa | Người xác nhận thử lại | Trạng thái |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BUG-001 | | | | | | | CHƯA GHI NHẬN |

## Quyết định sau pilot

- [ ] Có ít nhất 3 người thật hoàn tất TC01–TC09; TC10 thực hiện bằng tài khoản thử được chủ tài khoản đồng ý xóa.
- [ ] Không còn P0/P1; lỗi đã sửa được thử lại trên commit ứng viên.
- [ ] Email/cảnh báo/backup/restore có bằng chứng thật và owner rollback.
- [ ] Ghi thời gian xuất và mức dùng tài nguyên trên hạ tầng đang chạy; có phương án nếu worker local tắt.
- [ ] Đối chiếu license font/nhạc/Remotion theo mô hình phát hành thực tế.

Quyết định hiện tại: **CHƯA NGHIỆM THU PILOT**. Người phụ trách, commit phát hành, phiên bản rollback và thời điểm mở rộng: chưa điền.
