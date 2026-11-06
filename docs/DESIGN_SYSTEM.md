# Little Days — Photo Journal

Cập nhật 06/11/2026. Hướng thiết kế được chủ dự án duyệt: nhật ký ảnh hiện đại, ít chữ trang trí, nội dung của người dùng làm điểm nhấn.

Bố cục được tinh chỉnh tiếp theo [hướng dẫn ba trang và bàn thiết kế](LAYOUT_REFINEMENT.md): dải tuần thấp hơn, gợi ý hành động, nhóm ngày thu/mở, agenda chung và dock editor. Nội dung bên dưới mô tả nền tảng phong cách; hành vi mới theo hướng dẫn bổ sung.

## Ngôn ngữ giao diện

| Thành phần | Quy ước |
| --- | --- |
| Font sản phẩm | Plus Jakarta Sans 400/500/600/700, bundle Latin/tiếng Việt, không gọi Google Fonts khi chạy |
| Nền | `--paper: #F6F7F9`, bề mặt `--surface: #FFFFFF` |
| Chữ | `--ink: #20242D`, phụ `--muted: #626879` |
| Nhấn chính | Cherry `--accent: #C34255`, nền nhạt `--accent-soft: #FAEDF0` |
| Viền | `--line: #E7E9F0`; thẻ bo 16–18px, nút/form bo 10–12px |
| Trạng thái | Mint cho hoàn thành; màu riêng nhẹ cho ghi chú/kế hoạch, không dùng màu làm dấu hiệu duy nhất |
| Logo | Hai khung ảnh chồng nhau cùng trái tim; SVG gốc, favicon và bộ icon PWA sinh bằng `scripts/generate-brand.mjs` |

Token gốc ở `apps/web/src/styles.css`; lớp thành phần chung ở `apps/web/src/photo-journal.css`. Các stylesheet từng trang dùng lại token thay vì tự chọn bảng màu nâu/olive. Tên token `--green`/`--serif` cũ được giữ làm alias tương thích cho giao diện; không suy diễn chúng thành màu/font nội dung tài liệu.

## Phân vai và thứ tự nội dung

- **Hôm nay:** tên người dùng và hành động thêm dấu mốc; dải ảnh bảy ngày luôn thấy khi API hỗ trợ recap; nội dung đúng hôm nay; nhịp chung/đồng hồ cát và cuộc hẹn sắp tới nằm ở cột phụ desktop. Mobile sắp lại thành một cột, ưu tiên ảnh và kỉ niệm trước widget.
- **Dòng thời gian:** chọn không gian, lọc/tìm, đường hành trình theo ngày và bản đồ. Không lặp lịch tháng ở đây.
- **Lịch:** ô ngày và nội dung của ngày chọn, ghi chú/kế hoạch bên cạnh; giữ card cùng ngôn ngữ với Hôm nay.
- **Album:** thư viện sổ/thiệp/recap; mở Ảnh đã lưu từ đây. Editor, viewer, video, bộ mẫu và hộp thoại dùng cùng font/nút/bề mặt sản phẩm.
- **Câu hỏi/Lọ:** lối mở từ Hôm nay, có nút về. Màu và khoảng cách đồng bộ, cơ chế đồng ý/mở kín giữ nguyên.

Không đưa ảnh mẫu, số liệu giả hay avatar giả vào dữ liệu chạy thật. Tuần trống có ô thêm ảnh và lời hướng dẫn ngắn; tài khoản chưa cộng tác được hướng dẫn mời người thương.

## Ranh giới với nội dung scrapbook

Font của **sản phẩm** không thay font người dùng đã chọn trong **trang thiết kế**. Giữ nguyên domain font ID, màu chữ, tọa độ 720 × 900, crop, padding trang, hiệu ứng và bố cục đã lưu. Canvas, DOM viewer và MP4 tiếp tục đọc thuộc tính tài liệu; đổi màu khung chọn/căn chỉnh chỉ là trạng thái editor.

Font mới được khai báo trong CSS font dùng chung để môi trường web/video thống nhất, nhưng không tự chuyển tài liệu cũ sang font mới. Giấy phép OFL được lưu tại `licenses/fonts/plus-jakarta-sans-OFL.txt`, có inventory và notices.

## Responsive, bàn phím và tài nguyên

- Thanh điều hướng giữ bốn mục; mobile active gạch dưới. Form text/select trên mobile ít nhất 16px để tránh focus zoom toàn trang; vẫn cho phép người dùng pinch zoom.
- Dùng dialog/lightbox của ứng dụng, giữ nhãn icon, focus, IME và reduced motion. Không remount trường nhập mỗi lần gõ để tạo animation.
- Đồng hồ cát nhỏ ở cột phụ, cấu hình có lớp nổi riêng; tiếp tục lazy import, giới hạn DPR/fps, dừng khi bị che hoặc khuất viewport, có fallback thiếu WebGL.
- Dải tuần mở sẵn sẽ đọc metadata khi vào Hôm nay thay cho disclosure trước đây. Dùng capability gate và cache kiểm tra quyền/revision hiện có; không tải toàn bộ album để tạo dải. Tối đa bảy ảnh đại diện của tuần, ảnh xem đầy đủ chỉ mở khi cần. Xem [giới hạn cache và phép đo](PERFORMANCE.md).

## Kiểm chứng và giới hạn

Suite `main-pages` kiểm tra 1440/390/320px, font tiêu đề, bốn mục điều hướng, form mobile, nút quay lại, đồng hồ thật/fallback/reduced motion, popup và bản đồ cố định. Fixture có 16 dấu mốc và ba ảnh minh họa tự tạo trong database QA.

Các suite `daily-polish`, `weekly-experience`, `interface-refinement`, `priority-flows` và phần còn lại của `test:pilot` kiểm tra những luồng liên quan: card cùng kiểu, cache, quyền cộng tác, nhập chữ giữa câu, font tài liệu, preview/xuất ảnh và MP4. Khi báo kết quả phát hành, đối chiếu log thực tế; mô tả suite không đồng nghĩa mọi suite đã chạy đạt.

Kiểm tra cục bộ trong đợt đổi style: 168 unit đạt, build/typecheck và smoke production đạt. MP4 fixture Photobooth/kẹp gỗ/vé tải xuống được, H.264 1080 × 1920, khoảng 15 giây; đã xem frame mở đầu, trang và kết thúc. Hồi quy UI toàn bộ và CI của commit phát hành được đối chiếu riêng, không ghi nhận pilot người dùng thật từ các fixture này.

Ảnh chụp QA dùng Chromium và dữ liệu giả; không thay cho nghiệm thu Safari/iPhone thật hoặc đo cold start/mạng production. Giao diện đã lưu trong album được cố ý giữ phong cách người dùng chọn.
