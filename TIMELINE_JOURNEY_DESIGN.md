# Timeline dạng hành trình và bản đồ ảnh

Cập nhật giao diện ngày 31/10/2026, bổ sung cho `UPDATE_2026_10_31.md`.

## Thay đổi

- Timeline desktop gom theo ngày, mỗi ngày xen kẽ hai bên. Đường chỉ SVG uốn lượn liên tục, có nhánh và nút nối tại từng ngày; đo lại bằng ResizeObserver khi ảnh tải, thay kích thước hoặc thêm nội dung. Trên màn hình nhỏ, chuyển thành một cột để giữ card đủ rộng và đường chỉ chạy bên trái.
- Card giới hạn trong một nửa vùng timeline ở desktop, có padding phần thân, tiêu đề/ảnh vừa phải, tách rõ bìa album với dấu mốc/ghi chú. Nút sửa, xóa, mở album và chọn mốc dùng icon, có tên truy cập và tooltip. Các hành động chính vẫn có nhãn dễ hiểu.
- Banner thêm lớp màu, họa tiết sổ/ghim và số liệu thực tế. Thanh tạo sổ từ dấu mốc được thu gọn.
- Bản đồ hiển thị sẵn trên trang Dòng thời gian. Màn hình từ 1600px có bản đồ bên phải, giữ vị trí khi cuộn; màn hình nhỏ hơn đưa bản đồ lên trước danh sách. Có nút mở rộng khi cần xem diện tích lớn hơn.
- Ghim có một ảnh đại diện lấy từ ảnh riêng tư của dấu mốc; nhiều mốc cùng vị trí có huy hiệu đếm và danh sách chọn trong popup. Không có ảnh hoặc tải ảnh lỗi thì dùng biểu tượng dự phòng. Không gửi nội dung dấu mốc đến dịch vụ geocoding.
- Hỗ trợ cuộn chuột, pinch, double click và các phím +/−, mũi tên khi focus bản đồ; thêm icon phóng to/thu nhỏ/xem toàn bộ. Zoom không thay đổi vị trí đã lưu.
- Form địa điểm mở sẵn bản đồ, bỏ ô vĩ độ/kinh độ. Chạm để ghim hoặc chủ động bấm lấy GPS; vẫn sửa tên và bỏ vị trí được. Không tự xin quyền GPS. Backend tiếp tục lưu tọa độ với schema và quyền truy cập hiện có.
- Phần timeline của ngày được chọn trong Lịch chỉ hiển thị ngày một lần ở tiêu đề, không lặp lại trong heading nhóm con.

## Triển khai và giới hạn

Không thêm thư viện, API key, env, SQL migration hoặc dịch vụ trả phí. Đây là thay đổi frontend; Vercel cần build commit mới, API dùng các endpoint hiện có của bản hồ sơ/vị trí. Không thay cấu hình worker, mail, Cloudinary hoặc backup.

Leaflet vẫn được tải thành chunk riêng khi cần. Tile OSM bắt đầu tải khi trang timeline hoặc form vị trí hiển thị, dùng cache trình duyệt, có attribution và không prefetch/offline. Xem [tham chiếu Leaflet](https://leafletjs.com/reference.html) và [chính sách tile OSM](https://operations.osmfoundation.org/policies/tiles/). Tìm kiếm tên địa điểm chưa nằm trong bản này.

## Kiểm tra

UI fixture chạy desktop 1600px và mobile 390px, kiểm tra ba nhóm ngày xen kẽ, đường cong SVG, ảnh ghim đã decode, gộp hai mốc cùng vị trí, popup, zoom chuột/phím, chọn bằng map/GPS mà không có input tọa độ, ngày không bị lặp trong lịch và không tràn ngang. Tile và mail được giả lập local. Những bộ hồi quy cũ tiếp tục kiểm tra cộng tác, editor, template, album và video.

Build TypeScript/Vite và cả 16 bộ UI đã đạt. Kiểm tra collage gồm một/nhiều ảnh, mở ảnh thứ tư trong lightbox dù các upload hoàn thành khác thứ tự, và giữ popup khi component render lại mà nội dung không đổi. Marker chỉ dựng lại khi ID/revision dấu mốc thay đổi; ảnh trong popup tải theo khả năng lazy-loading của trình duyệt.
