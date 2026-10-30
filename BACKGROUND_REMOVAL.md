# Tách nền ảnh trong sổ

Chọn ảnh trên trang → **Chỉnh ảnh trong khung** → **Tách nền**. Xem kết quả trên nền caro, so sánh ảnh gốc, bật/tắt viền trắng và bóng đổ; bấm **Áp dụng** để dùng như sticker. Có thể hủy trong lúc xử lý hoặc bỏ kết quả trước khi lưu.

AI chạy trong Web Worker trên trình duyệt, không cần API trả phí hoặc biến môi trường mới. Lần đầu cần tải khoảng 56 MB tài nguyên từ chính website; trình duyệt có thể lưu cache cho lần sau. Thiết bị yếu sẽ chậm hơn; cần trình duyệt hỗ trợ WebAssembly, Worker, OffscreenCanvas và createImageBitmap. Có giới hạn xử lý 180 giây và nút hủy để giải phóng worker. Tóc, vật thể mờ và nền phức tạp có thể cần ảnh khác để có kết quả tốt.

Ảnh đầu vào được giảm cạnh dài tối đa 1280px trước khi suy luận. Trước khi Áp dụng, kết quả chỉ nằm trên thiết bị. Khi lưu, PNG trong suốt đi qua API ảnh riêng tư hiện có và được chuẩn hóa WebP có alpha, kiểm tra quota/ownership như ảnh thường. Ảnh gốc được giữ; Undo/Redo đổi ảnh và kiểu hiển thị trong một thao tác. Bản sao đã tải lên vẫn nằm trong thư viện và chịu chính sách lưu trữ/dọn dẹp hiện có.

Kiểu `photoStyle: cutout` bỏ khung giấy và giữ toàn bộ ảnh trong vùng phần tử; Canvas, xem album và MP4 dùng cùng hình học. Ảnh cũ không có trường này tiếp tục dùng Polaroid. Có thể chọn lại kiểu hiển thị ở thuộc tính ảnh.

## Build và triển khai

`npm ci` rồi `npm run build` hoặc `npm run build:web`. Prebuild tự chuẩn bị tài nguyên mô hình đã khóa phiên bản/hash. `npm run background:prepare` cho phép tải trước; build mới cần mạng nếu chưa có cache. Khoảng 54 MiB file được đặt trong thư mục public bị Git bỏ qua, sau đó đóng gói cùng website; không tải mô hình từ dịch vụ bên ngoài khi người dùng chạy AI. Render/Vercel phục vụ đường dẫn phiên bản với cache immutable.

Triển khai frontend và API cùng commit. Nếu dùng xuất MP4, cập nhật worker hiện có cùng commit để heartbeat báo `photoStylesVersion: 1`; API sẽ từ chối xuất trang có cutout khi worker chưa tương thích. Không cần tạo worker cloud cho chức năng AI này.

`npm run test:pilot -- background-removal` kiểm tra AI thật trên desktop/mobile, hủy, bản sao riêng tư/alpha, Undo/Redo, xem album và tải MP4 thật trong môi trường dữ liệu giả. Ảnh mẫu NASA chỉ dùng trong QA, không đưa vào sản phẩm. Kiểm thử hình học/chuẩn hóa ảnh nằm trong `tests/cutout.test.ts`.

Thông tin giấy phép được ghi trong `licenses/background-removal/README.md` và `THIRD_PARTY_NOTICES.md`.
