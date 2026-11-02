# Chỉnh giao diện, nhập chữ và thư viện font

Cập nhật 02/11/2026.

- Sửa lỗi popup nhập chữ chạy lại focus khi callback đóng thay đổi sau mỗi lần gõ. Focus chỉ đặt khi mở, callback đóng cập nhật qua ref; giữ caret/selection khi sửa giữa câu và tránh xử lý Escape trong lúc IME đang ghép chữ.
- Có nút căn trái/giữa/phải ngay trong popup và bảng thuộc tính. Dùng trường `align` đã có, không đổi tọa độ hoặc kích thước khung. Canvas, viewer và MP4 cùng dùng giá trị đã lưu. Chạm đúp chữ cũng mở trình soạn trên thiết bị cảm ứng.
- Thêm 10 font tự host có Latin và tiếng Việt: Roboto, Nunito, Quicksand, Playfair Display, Merriweather, Montserrat, Source Sans 3, Comfortaa, Dancing Script và EB Garamond. Giữ ba alias font cũ để đọc sổ/mẫu đã lưu. Canvas đợi font được dùng tải xong rồi vẽ lại, không yêu cầu Google Fonts API. License OFL nguyên bản nằm tại `licenses/fonts/` từ thư mục gốc.
- Nút tải ảnh trong lightbox chuyển lên toolbar bên cạnh nút đóng, nền sáng/chữ xanh rõ; footer chỉ giữ chuyển ảnh và nhãn khoảnh khắc. Có loading và lỗi khi ảnh chưa tải được.
- Header danh sách dấu mốc chia hàng rõ: tiêu đề + nút Thùng rác có nhãn, bộ lọc ở hàng dưới. Không để icon chen vào giữa tìm kiếm và dropdown.
- Hồ sơ desktop rộng hơn, chia thông tin cá nhân/dung lượng và bảo mật thành hai cột. Mobile có tab Hồ sơ/Bảo mật để trang tổng quan gọn trong màn hình. Các form dài hoặc bàn phím làm giảm diện tích vẫn cho cuộn để không che thao tác quan trọng.
- Thêm loading khi lấy ảnh thư viện và hạn mức, không hiện nhầm trạng thái trống khi dữ liệu chưa về.

## Triển khai

Không thêm biến môi trường. Deploy API và frontend cùng commit; session mới trả `fontCatalogVersion: 1`, frontend chỉ cho chọn thêm font khi API hỗ trợ để tránh lỗi autosave với backend cũ.

Để xuất MP4 có font mới, cập nhật và khởi động lại **worker đang dùng** cùng commit. Worker báo `fontCatalogVersion: 1`; API không nhận job dùng font mới khi còn worker cũ đang hoạt động hoặc chưa có worker phù hợp. Font cũ vẫn giữ luồng hiện có. Không tạo lại worker cloud hoặc tài nguyên tính phí.

## Tài liệu

19 tài liệu hướng dẫn/kế hoạch/vận hành đã chuyển vào `docs/`; [mục lục](README.md) liên kết các hướng dẫn. README dự án và các liên kết tương đối được cập nhật. Giấy phép và notices vẫn nằm tại thư mục gốc để công cụ build/phân phối dùng đúng đường dẫn.

## Kiểm chứng

Kiểm thử gõ/chèn giữa câu/IME, focus qua rerender, ba cách căn chữ, đủ 10 font có cả hai subset thực sự được tải, lưu/mở viewer và MP4 thật. Kiểm tra nút tải ảnh, vị trí thùng rác, loading khi cố tình làm chậm API và hồ sơ không cuộn ở viewport desktop/mobile tiêu chuẩn. Kiểm tra schema/font cũ và notices, build TypeScript/Vite cùng các bộ hồi quy của dự án.
