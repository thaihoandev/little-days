# Chuyển động, đồng hồ cát và nhập liệu mobile

Cập nhật 06/11/2026. Bổ sung trên [bốn trang chính và nhịp yêu thương](MAIN_PAGES_AND_SHARED_RHYTHM.md), không thêm biến môi trường hoặc dịch vụ.

## Tránh tự zoom toàn trang khi nhập

Các ô nhập chữ/số/ngày, textarea và select trên màn hình tối đa 820px hoặc thiết bị cảm ứng dùng cỡ chữ tính toán tối thiểu 16px. Cỡ chữ lớn từ tiêu đề vẫn được giữ qua `max(16px, 1em)`. Bổ sung khả năng co chiều rộng cho control trong hàng hẹp.

Đây là xử lý focus zoom của trình duyệt khi chạm vào form, không phải phóng to riêng một ô nhập. Không thêm `maximum-scale=1`, `user-scalable=no` hoặc JS ép lại viewport. Cử chỉ phóng to chủ động vẫn khả dụng. Font, cỡ chữ và hệ tọa độ của tài liệu scrapbook không bị thay đổi bởi CSS form. Tham khảo [bản sửa tương tự của GitLab](https://gitlab.com/gitlab-org/gitlab/-/merge_requests/220666/commits).

## Tài khoản sau khi xác minh email

Trang liên kết giữ trạng thái xác minh thành công trong lúc tải session, thư viện và module tài khoản. Nút tiếp tục có trạng thái bận; chỉ chuyển sang Hôm nay kèm popup tài khoản sau khi dữ liệu/form sẵn sàng. Nếu tải thất bại, giữ màn hình hiện tại và cho thử lại, không dùng lại token xác minh.

Cảnh 3D chưa ghép đôi dùng ảnh dựng từ mô hình; có nút **Xem thử 3D**. Khi có không gian chung, cảnh tự khởi tạo lúc trình duyệt rảnh và vùng đồng hồ sắp hiển thị. Popup tài khoản được ưu tiên trước shader/GPU. Đưa các import Three.js đã biết vào `optimizeDeps.include` để ổn định cold start của Vite; [tài liệu chính thức](https://vite.dev/config/dep-optimization-options) mô tả pre-bundling và khả năng reload khi phát hiện import mới. Đây là biện pháp ổn định dev/QA, không thay cơ chế bundle production.

Kiểm tra auth giữ nguyên assertion email đã xác minh, bổ sung HTTP 503 và một phản hồi session bị giữ bằng gate: UI vẫn ở trang xác minh, chỉ mở tài khoản khi gate được giải phóng. Mail, token và tài khoản đều là fixture cô lập.

## Đồng hồ cát

- Ba sắc màu: **Nắng ấm**, **Hồng sương**, **Trời sao**. Vật liệu kính/kim loại/cát và ánh sáng đổi cùng nhau; không cần tải model/texture ngoài.
- Ba chế độ: **Êm dịu**, **Lấp lánh**, **Tĩnh**. Hạt cát chuyển động, đốm sáng và quầng sáng tạo khác biệt; thiết lập giảm chuyển động của hệ điều hành luôn được ưu tiên.
- Mức cát thay đổi êm theo số ngày cùng góp trong tuần. Nút xoay trái/phải và đặt lại góc nhìn dùng được bằng bàn phím/cảm ứng. Chuyển màu/chế độ/tiến độ dùng lại canvas và GPU context.
- Màu/chế độ được lưu một preference nhỏ trên thiết bị, không chứa dữ liệu cặp đôi. Giá trị không hợp lệ trở về mặc định.
- Giữ giới hạn DPR 1.5 và 24 fps; dừng vẽ khi tab ẩn, khuất viewport hoặc có dialog. Mesh/points, vật liệu, môi trường và renderer được thu hồi khi unmount. Tham khảo [Three.js BufferAttribute](https://threejs.org/docs/pages/BufferAttribute.html) cho buffer hạt được tái sử dụng.
- PNG dự phòng được kết xuất lại từ chính mô hình mới. Thiết bị thiếu WebGL vẫn xem được nhịp tuần.

## Chuyển động giao diện và điều hướng

Tiêu đề chuyển trang có chuyển động ngắn; thẻ album/ảnh/kỉ niệm và câu hỏi/lọ xuất hiện nhẹ, một số thẻ ảnh có nhịp trễ ngắn. Bổ sung phản hồi hover/nhấn nút, zoom ảnh nhẹ, popup mở và trạng thái đang tải. CSS mới áp dụng vào giao diện; không thay animation của phần tử trong tài liệu hoặc frame video. Form/canvas không bị remount chỉ để chạy chuyển động.

Hiệu ứng tuân theo reduced motion. Không dùng chuyển động vô hạn cho danh sách hay đặt hiệu ứng lên phần tử nhập chữ. Popup chỉ có hiệu ứng lúc mở, không khởi động lại khi gõ/IME.

**Ảnh đã lưu → Về Album**. **Câu hỏi/Lọ điều thương → Về Hôm nay**. Các nút luôn có đích nội bộ rõ ràng cả khi mở trang trực tiếp. Bỏ đường kẻ trên `albums-section`; giữ phân cách chung ở header. Bộ lọc vùng miền của bản đồ được thu gọn để phù hợp control 16px trên mobile; chỉ hai danh sách vẫn cuộn riêng.

## Kiểm chứng và giới hạn

Suite `main-pages`: đổi sắc màu/chuyển động, canvas được tái sử dụng khi đổi màu và tiến độ, số lệnh GPU dừng trong 250ms khi popup tài khoản mở và tiếp tục sau khi đóng, reduced motion, PNG fallback, font control, nhập giữa câu/focus, nút quay lại và overflow ở 1440/390/320px. Context mobile bật touch/isMobile; chạm ô nhập rồi gõ phải giữ `visualViewport.scale`. Các kiểm tra pixel không khẳng định FPS trên mọi GPU. Kiểm tra font/focus trên Chromium cảm ứng không thay thế việc xác nhận auto-zoom trên iPhone vật lý.

Chạy thêm các suite lịch, tài khoản, editor/IME và cộng tác bị ảnh hưởng; CI chạy toàn bộ bộ hồi quy. CI/deploy đối chiếu đúng commit riêng, không coi một lượt QA cục bộ là pilot người thật.
