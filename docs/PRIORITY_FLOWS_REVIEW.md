# Rà soát mẫu, bản đồ, ảnh trong lọ và chia sẻ

## Những thay đổi

- Photobooth có bốn ô ảnh dọc, nền giấy dài đúng tỉ lệ và ảnh không bị thu nhỏ bởi viền Polaroid. Mẫu kẹp gỗ/dây và vé dùng cùng các phần tử editor nên vẫn sửa ảnh, chữ, crop và undo được; không đóng thành một ảnh mẫu bất biến.
- [Bản đồ 34 tỉnh thành hiện hành](VIETNAM_MAP_DATA.md) hợp nhất hình học tham khảo theo sắp xếp 2025, có Hoàng Sa/Trường Sa minh họa; tô pastel theo mốc đã lưu và chọn viền theo tỉnh. Bản đồ đứng yên trong modal, danh sách bên cạnh cuộn riêng. Bản đồ địa điểm hiện tại vẫn có trong tab riêng.
- Lọ điều thương cho đính một ảnh. Ảnh qua MediaStore/quota, có record `love-photo` thuộc người tải; URL người dùng gửi không chứng minh quyền sở hữu. Chỉ tác giả hoặc người có quyền ở đúng nhóm thành viên sau khi mở mới được tải ảnh. Gửi lời không tự bỏ phiếu. Upload dùng receipt/đối soát và retry hữu hạn hiện có, tránh nhân đôi khi mất phản hồi; ảnh chưa gắn quá 24 giờ được dọn ở lần upload tiếp theo, tối đa 50 ảnh lưu trong lọ mỗi người. Sau reload người dùng cần chọn lại file. Frontend chỉ hiện chọn ảnh khi session xác nhận API hỗ trợ.
- Backup/restore và đối soát media giữ ảnh đã tải; xóa lời gỡ tham chiếu trong transaction rồi mới dọn object. Xóa tài khoản sử dụng sổ object/managed-media hiện có. Không tự cleanup dữ liệu thật khi kiểm thử.
- Nút PNG gốc vẫn còn. Hộp chia sẻ có Story 1080×1920, khổ gốc 1080×1350, ảnh dọc một trang và ảnh dài ghép cả sổ 720×(900×số trang), tối đa 10 trang. Xuất tuần tự bằng canvas riêng, đợi font/ảnh/SVG; không ghi đổi trang hoặc zoom đang chỉnh. Không cắt giữa trang hoặc phụ thuộc `window.Konva`. Chia sẻ bị hủy không hiện lỗi; trình duyệt thiếu Web Share sẽ tải PNG.
- Cài màn hình chính: có hướng dẫn khi không có prompt native; prompt bị đóng không được gọi lại cùng event. iPad dạng user-agent Mac được nhận diện; chỉ ghi đã cài khi browser báo `appinstalled` hoặc đang standalone. Service worker chỉ chuyển tiếp mạng và hiện trang ngoại tuyến chung, không cache API/media hoặc thông tin cá nhân. Cài app không đồng nghĩa có push notification hay dữ liệu offline.

- Bỏ mục “Góc chúng mình” khỏi thanh điều hướng. Câu hỏi và Lọ điều thương vẫn mở từ Hôm nay; giữ đường dẫn cũ để liên kết đã gửi tiếp tục hoạt động.
- Thanh điều hướng dưới nằm dưới lớp popup để không che nút xác nhận khi tạo sổ/thiệp trên điện thoại.

## Kiểm chứng

Đã chạy với dữ liệu giả ngày 05/11/2026:

- 165 unit test; typecheck/build và smoke production; API SQLite.
- PostgreSQL: 19 test đạt, một test backup SQLite được bỏ qua có chủ đích; backup/restore và API PostgreSQL được chạy riêng trên schema QA. Ảnh trong lọ còn trong backup sau restore sang Cloudinary HTTP fixture.
- `couple-rituals`: desktop/390/320, ảnh kín trước khi mở và sau thu hồi quyền; mất phản hồi upload/gửi lời, reload và chọn lại file không tạo lời/ảnh trùng; giữ nháp/IME và kiểm tra trang trí cùng kích thước.
- `priority-flows`: ba mẫu, PNG Story 1080×1920 và sổ hai trang 720×1800 có nội dung; bàn phím trên bản đồ, hai cụm đảo, hướng dẫn cài và service worker. MP4 fixture H.264/AAC 1080×1920, khoảng 15 giây; đã trích và xem frame của cả ba mẫu.

Preview trong Chromium không thay thế kiểm tra cài native trên iPhone/Android thật. Không gửi mail thật hoặc dùng media người dùng cho QA. CI/deploy của commit phát hành được kiểm tra riêng; QA cục bộ không phải pilot người thật.
