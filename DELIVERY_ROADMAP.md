# Triển khai phần còn lại

Phạm vi được yêu cầu: quota → retention/cleanup → giám sát → staging/PostgreSQL → load test và pilot, cùng cải thiện editor/video và quy trình backup.

- [x] Đợt ưu tiên 02/11: lịch sử/thùng rác dấu mốc, bình luận/cảm xúc, Ngày này năm trước; thư viện ảnh mới, ẩn tên file và tải ảnh xuống. Xem `MEMORY_COMMUNITY.md`.

- [x] Upload ảnh chuẩn hóa trước khi gửi/tiến trình/hai request đồng thời; timeline gom ngày và phân biệt album/dấu mốc; hồ sơ tên/avatar, vị trí và bản đồ miễn phí tải theo yêu cầu. Chi tiết và đề xuất tiếp theo: `UPDATE_2026_10_31.md`.

- [x] Cộng tác dòng thời gian theo lời mời tài khoản; thêm/sửa/xóa mốc/ảnh, lịch chung có tùy chọn cá nhân, thu hồi/rời, CAS và backup/xóa tài khoản. Lịch 3:1, Hôm nay tập trung, URL riêng và deep link editor. Xem `TIMELINE_COLLABORATION.md`.

- [x] Tách nền ảnh bằng AI trên trình duyệt, hủy/xem trước/so sánh, viền và bóng đổ; lưu bản sao riêng tư có alpha, giữ ảnh gốc và Undo/Redo; đồng bộ Canvas/viewer/MP4. Hướng dẫn trong `BACKGROUND_REMOVAL.md`.

- [x] Quota dung lượng và xuất video nguyên tử, API mức sử dụng và giao diện.
- [x] Retention video, dọn object được ghi nhận và workspace mồ côi; dry-run và lease.
- [x] Log cấu trúc, metrics có bảo vệ và rules cảnh báo vận hành.
- [x] Cấu hình staging HTTPS, PostgreSQL, healthcheck, SMTP, backup và hướng dẫn rollback.
- [x] Công cụ/lịch backup, checksum và drill local/PostgreSQL/container.
- [x] Load smoke ba người dùng/job, đo thời gian và báo cáo SQLite/PostgreSQL.
- [x] Cảnh báo chữ tràn, waveform/trim kéo thả, kiểm tra mobile.
- [x] Checklist pilot, tài liệu và giới hạn kiểm chứng.
- [x] Bổ sung phương án free theo yêu cầu: Render Blueprint, mẫu worker cloud riêng, generator Vercel và hướng dẫn.
- [x] App công khai trên Render, PostgreSQL Neon và Cloudinary; người dùng xác nhận Brevo HTTPS gửi email thật thành công.
- [x] Mã cảnh báo email opt-in, lưu trạng thái chống gửi trùng qua restart, grace/cooldown và CLI kiểm tra.
- [x] Mã backup GitHub Actions theo lịch, snapshot nhất quán có maintenance lease/table locks, AES-256-GCM và restore drill độc lập trước khi upload artifact.
- [ ] Bật receiver cảnh báo trên Render bằng email của người vận hành; xác nhận nhận mail cảnh báo thật.
- [x] Bật backup và hoàn tất phục hồi thử: người dùng xác nhận ngày 30/10/2026; chưa ghi URL run/report vào hồ sơ nghiệm thu.
- [x] Runner QA pilot cô lập cho 7 luồng desktop/mobile, gồm autosave sau backup và MP4 thật; hồ sơ ghi nhận P01–P05 và tiêu chí nghiệm thu.
- [ ] Đo công suất CPU/RAM/thời gian xuất trên hạ tầng đích và ghi bằng chứng backup/cảnh báo vào hồ sơ nghiệm thu.
- [x] Thao tác hai ngón phóng to/thu nhỏ canvas, reset 100%, hủy kéo dở khi chuyển sang pinch; zoom không sửa album/lịch sử.
- [x] Trang chủ ưu tiên lịch, ngày quan trọng sắp tới và ghi chú; điều hướng riêng lịch/timeline.
- [x] Timeline dấu mốc theo ngày, loại, lời nhắn và tối đa 6 ảnh; lặp hằng năm, tìm/lọc, CRUD riêng theo tài khoản.
- [x] Timeline kiểu hành trình: mốc tháng, đường nối, thẻ giấy/ảnh lớn, thống kê thật; desktop xen kẽ và mobile một cột.
- [x] Popup dropdown theo tông màu giấy, trạng thái chọn/hover và cuộn; fallback native khi trình duyệt chưa hỗ trợ.
- [x] Icon xóa trong danh sách trang, xác nhận/undo và bảo vệ trang cuối; thanh thêm nhanh chữ/ảnh/sticker, tải ảnh, Ctrl+D và căn giữa.
- [x] Popup xác nhận xóa trang trong app; xem ảnh timeline/thư viện trong lightbox, không mở tab mới.
- [x] Viewer album co theo cả hai chiều, giữ nút chuyển trang trong một màn hình; scrollbar sage đồng bộ.
- [x] 18 trang trí SVG trong 5 bộ, dùng chung canvas/viewer/video; 9 mẫu có minh họa và gallery xem trước, thêm trang trống.
- [x] 6 mẫu chữ và 6 mẫu bộ đếm/5 giao diện; chỉnh giao diện độc lập với elapsed/annual/milestone, giữ khi lưu và xuất MP4.
- [x] Viewer có ba kiểu gáy/bìa, ba hiệu ứng chuyển trang, vuốt ngang và hỗ trợ giảm chuyển động.
- [x] Popup kéo/phóng/thay ảnh trong khung mẫu, giữ bố cục khi đổi ảnh; resize tự do hoặc giữ tỉ lệ bằng tay nắm góc.
- [x] Đổi tên sổ trên header; tiêu đề/mô tả timeline riêng theo tài khoản, có revision và chống ghi đè đồng thời.
- [x] Năm mẫu màu mới (tổng 14), tám bảng phối giấy/chữ; chỉnh tiếp và hoàn tác bằng editor hiện có.
- [x] Ảnh mới tối đa cạnh 1600px, chuẩn hóa/nén thích ứng, bỏ EXIF; timeline chỉ hiện cụm ba thumbnail gọn và mở đủ ảnh qua popup.
- [x] Journal tích hợp quota, backup/restore, cleanup và xóa tài khoản; SQLite/PostgreSQL và Cloudinary fixture đã kiểm chứng.
- [x] Chín mẫu scrapbook chỉnh layout được, có preview trong tạo album và thêm trang; giữ mẫu cá nhân.
- [x] Thư viện bốn bản nhạc, nghe thử/lưu lựa chọn và dùng trong preview/MP4; nhạc bổ sung tổng hợp bằng mã, đã kiểm tra âm thanh MP4 thật.
- [ ] Deploy bản lịch/timeline/nhạc lên API/frontend và cập nhật worker hiện có cùng phiên bản; không cần thêm biến môi trường. Xem `CALENDAR_TIMELINE.md`.
- [x] Chọn mốc timeline → xem trước chín mẫu → tạo scrapbook với ngày/lời nhắn/ảnh sao chép riêng, phân trang và chỉnh layout tiếp.
- [x] AGPL-3.0-only kèm ngoại lệ liên kết Remotion được chủ dự án chấp thuận; giấy phép/font notices, kiểm kê dependency và liên kết source theo commit build trong UI.
- [ ] Kiểm tra điều kiện Remotion/native binaries theo phiên bản và mô hình phát hành thực tế; nghiệm thu rollout trên hạ tầng đích.

**Pilot 3–5 người thật được bỏ qua theo yêu cầu của người dùng ngày 30/10/2026.** Giữ các kiểm thử tự động để phát triển tiếp; không ghi nhận pilot là đã thực hiện.

Worker cloud đã được người dùng hủy; giữ worker hiện tại và không tạo tài nguyên Northflank hoặc dịch vụ tính phí. App đã chạy tại https://little-days-api.onrender.com. Email thật, backup và phục hồi được người dùng xác nhận; receiver cảnh báo và số đo hạ tầng vẫn cần bằng chứng riêng. Pilot thật không còn là bước bắt buộc trong phiên làm việc này.
