# Tạo scrapbook từ dòng thời gian

## Cách sử dụng

1. Mở **Dòng thời gian**, tìm hoặc lọc những kỉ niệm muốn giữ lại.
2. Đánh dấu từng thẻ hoặc bấm **Chọn mốc đang hiện**, tối đa 20 mốc.
3. Bấm **Tạo scrapbook**, nhập tên sổ và tên hai người.
4. Chọn một trong mười bốn mẫu minh họa, xem các trang bằng nút chuyển trang.
5. Bấm nút tạo sổ. Album mới mở trong editor để sửa bố cục, chữ, ảnh và trang trí; có thể xem như quyển sổ và tạo video bằng luồng hiện có.

Ngày được sắp từ cũ đến mới. Có thể chọn dấu mốc riêng, ngày bắt đầu của album hoặc kỉ niệm trong album. Ảnh thiếu không được thay bằng ảnh demo. Ghi chú dài được chia sang trang tiếp theo; bản đầy đủ cũng nằm trong các kỉ niệm của album.

Giới hạn: 20 mốc, 20 trang, 100 ảnh khác nhau, 30 album/tài khoản và quota media hiện có. Ghi chú/ảnh quá nhiều sẽ báo lỗi để chọn ít mốc hơn; không cắt bỏ nội dung âm thầm. Ảnh được chuẩn hóa WebP bằng cùng chính sách ảnh hiện có. Mỗi bản sao dùng thêm dung lượng tài khoản.

## Lưu trữ và quyền truy cập

`POST /api/albums/from-journal` nhận `requestId`, tiêu đề, hai tên, múi giờ, mẫu và danh sách nguồn có revision. Backend đọc lại dữ liệu từ nguồn thuộc tài khoản; không tin nội dung hoặc URL ảnh do client cung cấp. Nguồn thay đổi trong lúc tạo sẽ trả 409 và dọn bản sao chưa hoàn tất.

Album mới lưu trong `records`, `kind = 'album'`. Ảnh dùng UUID mới tại `uploads/<uuid>.webp` trong MediaStore và URL API riêng có kiểm tra quyền. Xóa dấu mốc hoặc album nguồn sau đó không làm mất ảnh đã sao chép. Nội dung đã nhập vào album không tự đồng bộ khi nguồn thay đổi.

`records`, `kind = 'journal-album-request'`, lưu dấu yêu cầu theo tài khoản để retry cùng yêu cầu không tạo album trùng. Yêu cầu đang chạy hoặc dùng lại ID với nội dung khác trả 409. Sau khi album đã xóa, ID cũ vẫn được giữ để không tạo lại album ngoài ý muốn. Xóa tài khoản dọn cả những bản ghi này.

Khóa giao dịch và kiểm tra revision hỗ trợ SQLite/PostgreSQL; các bản sao được ghi sổ trước upload và tính quota. Thất bại sẽ dọn media/quota; nếu không xác định được kết quả commit do mất kết nối DB, tránh xóa ảnh có thể đã được công bố. Cleanup/backup/xóa tài khoản tiếp tục dùng cơ chế hiện có. Không thêm bảng hoặc migration riêng.

## Deploy và giấy phép

Deploy API/frontend cùng commit; cập nhật worker hiện có nếu dùng xuất MP4. Không cần biến môi trường mới hoặc dịch vụ mới. Việc tạo album không phụ thuộc worker; xuất MP4 vẫn cần worker hiện có hoạt động.

Mã dự án dùng AGPL-3.0-only cùng ngoại lệ liên kết Remotion đã được chủ dự án chấp thuận; xem [LICENSE.md](../LICENSE.md). Giao diện có **Giấy phép** và **Mã nguồn**; build sạch tạo liên kết commit/archive tương ứng. Dữ liệu riêng của người dùng không được đưa vào mã nguồn công khai.

## Kiểm tra

- `npm test`: pagination, giữ nội dung, kiểm tra quyền/revision, retry, tranh chấp, quota và rollback ảnh.
- `npm run test:timeline-album`: desktop/mobile, chọn mẫu, xem trước, mở lại, ảnh độc lập và MP4 thật.
- `npm run test:api`: API/private media, nguồn bị xóa và retry.
- `npm run test:postgres`: giao dịch trên PostgreSQL riêng, cùng API, queue và backup/restore.

Các runner dùng dữ liệu giả cô lập trong `test-results/`, không gửi mail thật hoặc sử dụng dữ liệu người dùng.
