# Thiệp mời và bản xem chia sẻ

## Tạo và chỉnh sửa

1. Vào **Album → Tạo album → Thiệp mời**.
2. Chọn một trong bốn mẫu: **Một cuộc hẹn**, **Mừng ngày của bạn**, **Hẹn ngày yêu thương**, **Một tối dưới sao**.
3. Mở **Thiết lập → Lời mời trên trang này** để sửa từng dòng tên, giờ hẹn, địa điểm và lời nhắn. Đây là các phần tử chữ thật, có thể kéo, đổi font/căn lề, sửa màu, Undo/Redo và tự lưu như sổ hiện có. Thay ảnh bằng công cụ ảnh của editor.
4. Đổi **Loại thiết kế** giữa sổ và thiệp giữ nguyên các trang. Thêm mẫu vào sổ cũ ở **Trang sổ → Mẫu có sẵn**; thao tác này thêm trang mới, không ghi đè trang hiện tại.

Các mẫu giữ hệ tọa độ 720 × 900, không thêm loại phần tử riêng. Canvas, viewer và video dùng lại cùng artwork; không cần thêm font, asset bên ngoài hoặc dịch vụ trả phí.

## Nhạc và hiệu ứng khi chia sẻ

Trong **Thiết lập → Khi người thương mở link**, chủ album chọn gáy sổ, chuyển trang, không khí (hoa/sao/trái tim) và nhạc. Có bốn bản nhạc gốc hiện có hoặc tải MP3/WAV/M4A của mình, tối đa 20 MB theo bộ xử lý âm thanh hiện tại. Sau khi tải, chọn bản nhạc mới trong danh sách; upload xong không tự ghi đè lựa chọn đang chỉnh. Chỉ dùng nhạc có quyền chia sẻ.

Nhạc được lặp với âm lượng đã lưu. Người nhận bấm **Bật nhạc** để bắt đầu, có thể tắt lại; không tự phát âm thanh khi mở link. Khi tab bị ẩn, nhạc tạm dừng. Khi đóng viewer hoặc rời trang, phần tử audio được gỡ. Lỗi nhạc không ngăn xem các trang. Âm thanh dùng `preload="none"`, chỉ tải khi người xem bật.

**Chia sẻ** đợi lưu xong trước khi tạo link. Người nhận chỉ xem/lật trang và bật/tắt nhạc, không thấy bộ chọn gáy sổ hoặc chuyển trang. Chủ album vẫn có bộ chọn trong **Xem album**; lựa chọn được đưa vào lịch sử tự lưu nếu API hỗ trợ phiên bản mới. Link hiện nội dung đã lưu hiện tại, không phải bản snapshot bất biến.

Chữ/ảnh có hiệu ứng xuất hiện theo thiết lập phần tử; hiệu ứng lặp hiện có vẫn hoạt động. Giảm chuyển động của hệ điều hành tắt hiệu ứng trang, không khí và hiệu ứng lặp. Vòng vẽ phần tử dừng khi tab ẩn; trang không có hiệu ứng lặp dừng vòng vẽ sau khi xuất hiện xong.

Hiệu ứng không khí và nhạc trong hướng dẫn này dành cho viewer chia sẻ. Thiết lập xuất MP4 vẫn độc lập ở **Tạo video**, giữ các lựa chọn nhạc/thời lượng vốn có. Không tự tạo worker cloud.

## Quyền và lưu dữ liệu

- `documentKind` và `presentation` là trường tùy chọn của nội dung album, dùng Zod, CAS, draft, Undo/Redo và history hiện tại. Tài liệu cũ giữ hành vi cũ. Session quảng bá `albumPresentationVersion: 1`; FE không hiện chức năng cấu hình mới nếu API chưa hỗ trợ.
- Chỉ audio thuộc đúng album/chủ sở hữu được chọn. Link chỉ cấp quyền nghe đúng audio đang được chọn, không mở danh sách hoặc nhạc khác của album/tài khoản. URL nhạc chia sẻ kiểm tra token/quyền mỗi request, trả `no-store` và hỗ trợ byte range. Thu hồi link hoặc đổi bản nhạc chặn request tiếp theo đến nhạc cũ.
- Không xóa audio đang được chọn cho bản chia sẻ. Lưu/khôi phục album và xóa audio cùng khóa giao dịch theo chủ sở hữu, tránh lưu tham chiếu vào audio vừa bị xóa. Âm thanh vẫn dùng `MediaStore`, quota, backup và xóa tài khoản hiện có.
- Không thêm biến môi trường, dependency hoặc nguồn nhạc bên ngoài. Thư viện âm nhạc gốc và giấy phép hiện có được giữ nguyên.

## Lọ điều thương: đồng ý phải chủ động

Gửi lời vào lọ **không tính là đồng ý mở sớm**. Ban đầu có 0 phiếu; kể cả tác giả cũng phải bấm **Đồng ý mở sớm** nếu muốn mở trước ngày. Một người đồng ý không làm mở lời nhắn của cặp đôi. Điều kiện vẫn là **đến ngày hẹn HOẶC tất cả thành viên lúc gửi đồng ý**.

Lời cũ còn kín được bỏ các phiếu theo cơ chế cũ và yêu cầu đồng ý lại rõ ràng, không tự đoán phiếu tác giả là thao tác chủ động. Lời đã mở và ngày hẹn không bị thay đổi. Việc reset được áp dụng khi đọc/biểu quyết, không cần migration dữ liệu thật.

## Cơ sở thiết kế và kiểm chứng

Tham khảo [Canva Invitations](https://www.canva.com/invitations/) về luồng mẫu có sẵn → chỉnh nội dung → chia sẻ link. Little Days giữ luồng trong album và phong cách giấy/ảnh thay vì thêm một editor độc lập. [MDN Autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) là cơ sở dùng nút bật nhạc chủ động; [web.dev reduced motion](https://web.dev/articles/prefers-reduced-motion) là cơ sở tắt chuyển động theo tùy chọn hệ điều hành.

Kiểm chứng liên quan:

- `tests/invitations.test.ts`: tương thích tài liệu cũ, nội dung bản nháp, schema, hình học và ID của bốn mẫu.
- `tests/couple-rituals.test.ts`: không tự đồng ý, không mở sau một phiếu, đồng thuận nhiều thành viên, tương thích lời cũ, lịch mở và backup/restore.
- `npm run test:api`: nhạc riêng/chia sẻ, byte range, âm thanh ngoài album, CAS/history, đổi nhạc và thu hồi link. Runner PostgreSQL chạy cùng API trên schema QA riêng.
- `node --import tsx scripts/pilot-qa.ts invitations`: tạo thiệp từ UI, sửa chữ/giữ focus, lưu lựa chọn, nghe nhạc gốc/nhạc fixture tải lên, viewer chỉ đọc, thu hồi link, reduced motion, layout 1600/390/320 và xuất MP4 QA.
- Suite `couple-rituals`: khoảng cách input/tag và preview ký hiệu bổ sung trong suite thiệp; biểu quyết tác giả/người nhận được kiểm tra bằng hai phiên riêng.

Các runner dùng tài khoản/media giả, không gửi mail thật. Kết quả chạy local/CI/deploy được báo riêng khi bàn giao; không suy từ một job record ra video đã tải được hay từ push thành công ra API đã deploy.
