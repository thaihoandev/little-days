# Upload phục hồi và thư viện lớn

Cập nhật ngày 02/11/2026. Giữ Vercel/Render/Neon/Cloudinary hiện có; không thêm dịch vụ trả phí hoặc worker cloud.

## Sử dụng

- Khi mạng mất phản hồi, album/dấu mốc tự kiểm tra kết quả lần tải trước rồi thử lại có giới hạn. Ảnh đã lưu không được tạo lại chỉ vì trình duyệt chưa nhận được phản hồi.
- Trong editor, ảnh lỗi được giữ trong phiên làm việc; chọn **Thử lại ảnh…** hoặc **Thử lại các ảnh lỗi**. Dấu mốc cũng giữ lại riêng các file lỗi. Các file thành công không phải tải lại.
- Nếu tải lại trang, trình duyệt không giữ bytes file. Có thể chọn lại file trong cùng tab; mã đối soát còn hạn được dùng lại khi tên/kích thước/thời gian sửa file và bytes sau chuẩn hóa giống nhau. Hai file khác tên dù cùng nội dung vẫn là hai lựa chọn riêng. Không có upload tiếp từng đoạn byte hoặc upload offline.
- Timeline lấy 20 mục mỗi trang, gồm album, kỉ niệm trong sổ và dấu mốc; **Xem thêm dấu mốc** lấy trang tiếp theo. Thư viện lấy 60 ảnh mỗi trang và có **Xem thêm ảnh**. Tìm kiếm/bộ lọc chạy tại API trên toàn bộ nội dung có quyền xem, có debounce và hủy request cũ.
- Mục đã chọn để tạo scrapbook được giữ khi chuyển trang/bộ lọc. Tác vụ nền không reset trang đã mở rộng hoặc đang có lựa chọn; các thao tác sửa/xóa/lấy lại vẫn tải lại dữ liệu liên quan. Kiểm tra revision khi tạo sổ tiếp tục áp dụng.
- Bản đồ lấy dữ liệu ghim nhẹ riêng với tối đa 500 điểm mỗi trang; khi có nhiều hơn, dùng **Xem thêm địa điểm**. Mở chỉnh sửa sẽ lấy lại nội dung đầy đủ có kiểm tra quyền.
- Ảnh trong ô nhỏ dùng bản WebP tối đa cạnh 480px, tải lười ở các danh sách ảnh. Lightbox/tải xuống/editor canvas/video tiếp tục dùng ảnh gốc. Sổ được mở bằng tài liệu đầy đủ, không chỉnh sửa từ bản tóm tắt.

## API và lưu trữ

- Session trả `libraryVersion: 1`. Frontend chỉ bật hợp đồng mới khi backend hỗ trợ; giữ đường đọc danh sách cũ để tương thích khi rollout.
- `GET /api/albums?summary=1` trả trang bìa và metadata cần cho dashboard, kèm `pageCount`; không tải tất cả bố cục trang. `GET /api/albums/:id` vẫn trả đủ sổ.
- `GET /api/library/feed`, `/api/library/photos`: `limit`, `cursor`, `q`, `kind`, `source`, `timeline`, `today`. `items`, `total`, `nextCursor`; timeline có số liệu tổng hợp. Cursor keyset theo ngày, thời gian tạo và ID ổn định, ràng buộc tài khoản/quyền lọc; dấu mốc mới trong cùng ngày được ưu tiên trước. Đổi bộ lọc phải bắt đầu trang đầu. Đây là danh sách trực tiếp, không phải snapshot cố định qua nhiều request: sửa ngày có thể thay đổi vị trí; client loại ID trùng.
- `GET /api/library/map` trả projection nhẹ và cursor cho ghim. `GET /api/journal/:id` trả dấu mốc đầy đủ, gồm metadata cộng tác cần thiết.
- SQL áp dụng quyền, lọc, sắp xếp và giới hạn trước khi trả dữ liệu. Loại trường bố cục trang khỏi dữ liệu trung gian; tính tổng và trang trong cùng truy vấn/snapshot. Truy vấn membership/account/profile theo lô, không lặp đọc từng người cho mỗi trang. PostgreSQL có index `(kind,owner)` tương ứng SQLite, được tạo tự động trong migration lock.
- Đọc album riêng tư gộp kiểm tra chủ sở hữu vào cùng truy vấn. Endpoint ảnh album chỉ truy vấn quyền và sự tồn tại của asset; không truyền/giải mã toàn bộ bố cục sổ cho từng thumbnail.
- `POST /api/albums/:id/assets`, `/api/journal/:id/assets` nhận `X-Upload-Id` UUID. Receipt lưu SHA-256 bytes và asset ID trong `records`, kind `upload-receipt`, chủ sở hữu là người upload. Metadata ảnh và receipt hoàn tất cùng transaction, giữ CAS/quota/history. Lease 4 phút chặn publish từ attempt đã hết hạn; attempt khác nhận `UPLOAD_PENDING`. Cùng mã khác bytes trả 409; ảnh đã bị xóa trả 410, không âm thầm khôi phục.
- `GET /api/albums/:id/uploads/:uploadId?sha256=…` và endpoint journal tương ứng trả missing/pending/completed sau khi kiểm tra quyền hiện tại. Trình duyệt dùng đối soát trước khi gửi lại file sau lỗi kết nối; tối đa ba lần thử lại tự động. Không retry lỗi quyền, validation, quota hoặc ảnh đã xóa.
- Mã đối soát được giữ trong sessionStorage tối đa 24 giờ, có fallback bộ nhớ; xóa khi đã xác nhận thành công. Receipt cũ hơn 7 ngày được dọn khi tài khoản bắt đầu lần upload tiếp theo. Không lưu ảnh/binary trong sessionStorage. Receipt đi theo backup/xóa tài khoản hiện có.
- Thêm `?thumbnail=1` vào endpoint ảnh album/dấu mốc để lấy preview. Quyền được kiểm tra trước mọi lần lấy cache; không tạo URL Cloudinary công khai. Cache RAM tối đa 16 MiB/64 ảnh/60 giây, gộp request cùng ảnh và tối đa hai tác vụ resize đồng thời. Không tạo object lưu trữ bổ sung, không thay ảnh gốc hoặc quota. Endpoint gốc tiếp tục trả đúng bytes để tải về.

## Đo trên fixture lớn

Chạy `node --import tsx scripts/benchmark-library.ts`. Chỉ tạo SQLite/dữ liệu giả trong `test-results/`; không kết nối database/media thật. Report tại `test-results/library-performance-report.json`.

Fixture: 12 album × 20 trang × 60 phần tử, 450 dấu mốc, 3.000 metadata ảnh. Năm mẫu đo cho mỗi đường đọc; số liệu một lượt chạy local:

| Đường đọc | Payload trước | Payload trang đầu sau | Giảm payload | Thời gian xử lý p50 trước/sau |
| --- | ---: | ---: | ---: | ---: |
| Danh sách album | 10.366.777 B | 762.685 B | 92,6% | 159 / 116 ms |
| Timeline | 3.403.241 B | 151.486 B | 95,5% | 38 / 91 ms |
| Thư viện ảnh | 13.770.040 B | 26.711 B | 99,8% | 184 / 76 ms |

Timeline mới thêm hợp nhất album và thống kê phía server; CPU truy vấn không nhanh hơn phép đọc journal cũ. Lợi ích chính là giảm dữ liệu truyền/xử lý ở trình duyệt. Các số này không phải đo tốc độ mạng hoặc công suất production, không bao gồm bytes tải ảnh và không loại bỏ cold start của host.

## Kiểm chứng và triển khai

- `tests/library-performance.test.ts`: SQL/cursor/tổng số/thứ tự/tìm kiếm tiếng Việt và ký tự LIKE, quyền và thu hồi, summary, receipt/replay/restart/cạnh tranh/hết lease, quota/history không tăng khi retry, preview và ảnh gốc. Chạy với SQLite và PostgreSQL QA.
- Suite `library-performance` trong `npm run test:pilot`: desktop/mobile, sổ 20 trang, 65 ảnh seed; cố tình làm mất phản hồi sau khi server lưu; xác nhận đối soát không gửi POST thứ hai; thử lại riêng file lỗi; phân trang 20/60 và tìm mục ngoài trang đầu. Không gửi email thật.
- Giữ các bộ hồi quy cộng tác, lịch, editor/autosave, backup, xóa tài khoản, production và MP4 hiện có.
- Deploy API Render và FE Vercel cùng commit, không thêm env. Không cần thay worker cho các endpoint tối ưu này; worker hiện có tiếp tục dùng tài liệu/ảnh đầy đủ.
