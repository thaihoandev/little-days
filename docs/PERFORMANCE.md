# Upload phục hồi và thư viện lớn

## Đồng hồ cát và form — bổ sung 06/11/2026

- Cảnh đang chạy phát lệnh WebGL; mở popup tài khoản có **0 lệnh drawElements trong 250ms** và đóng popup thì vẽ tiếp, kiểm tra trực tiếp trên API WebGL của fixture. Đổi màu/chế độ/tiến độ giữ nguyên DOM canvas và renderer. Chưa ghép đôi chỉ tải ảnh kết xuất, có nút chủ động thử 3D; cảnh ghép đôi khởi tạo lúc idle, ưu tiên form và ảnh đầu trang.
- Build cục bộ: chunk cảnh từ 136,00 lên **138,54 kB gzip** (+2,54 kB); JS chính từ 232,47 lên **233,81 kB gzip** (+1,34 kB). Đây là bytes build, không phải tốc độ mạng/GPU thực. Không thêm model/texture hoặc dịch vụ server.
- Cỡ chữ form mobile tối thiểu 16px; animation chuyển trang chỉ chạy trên header, không remount input/editor để làm hiệu ứng. Kiểm tra IME, focus, cache thư viện và popup vẫn được giữ.
- Chi tiết/giới hạn thiết bị: [chuyển động và mobile](INTERACTION_AND_MOBILE_REFINEMENT.md).

## Trang chính và cảnh 3D — 06/11/2026

- Lịch tháng chỉ mount trong Lịch; bản đồ chỉ ở Dòng thời gian. Hôm nay giới hạn bốn thẻ đúng ngày; recap tuần chỉ mount và lấy dữ liệu sau khi người dùng mở phần nhìn lại. Các kiểm tra cache thư viện ảnh khi đổi trang/mở popup vẫn giữ nguyên.
- Cảnh đồng hồ được tách bằng dynamic import và chỉ tải khi gần viewport. Build cục bộ ở lần cập nhật này: chunk cảnh 544,58 kB minified / 136,00 kB gzip; đây là bytes mã JavaScript, chưa phải thời gian tải trên mạng. Giới hạn DPR 1.5, render tối đa 24 fps, dừng khi khuất/ẩn tab, reduced motion giữ cảnh tĩnh; thiết bị thiếu WebGL dùng PNG từ cùng mô hình.
- Nhịp dùng metadata DISTINCT ngày/thành viên trong 60 ngày. Feed hoạt động lấy tối đa 200 dòng mỗi nguồn, trả tối đa 200 thông báo/30 ngày và không đọc bytes media hoặc text kín để dựng chuông. Chuông refresh khi tab hiển thị mỗi 30 giây; nhịp mỗi 60 giây, focus và thao tác liên quan. Đây là polling có giới hạn, không phải realtime push.
- Suite `main-pages` dùng fixture 16 dấu mốc, kiểm tra 1440/390/320px: cuộn danh sách tỉnh và danh sách kỉ niệm không đổi bounding box của SVG, header, ô tìm kiếm hoặc tiêu đề tỉnh; dialog/sidebar không cuộn toàn bộ. Canvas 3D có pixel thực, reduced motion đứng yên, ảnh dự phòng giải mã được khi chặn WebGL. Các kiểm tra này không đo FPS/GPU trên điện thoại thật hoặc cold start Render.
- Quy tắc quyền, cache nhỏ và giới hạn hiện tại được ghi trong [trang chính và nhịp yêu thương](MAIN_PAGES_AND_SHARED_RHYTHM.md).

## Giảm tải lại khi điều hướng — 05/11/2026

- Danh sách timeline, ảnh, ghim bản đồ và recap tuần giữ payload trong RAM tối đa 32 truy vấn / khoảng 8 MiB, hết hạn sau 2 phút. Không lưu nội dung riêng tư vào localStorage hay service worker. Mỗi lần tái sử dụng đều gọi `/api/journal-state` để kiểm tra tài khoản, tập quyền và revision hiện tại; lỗi xác thực không dùng dữ liệu cũ. Các lượt kiểm tra đồng thời dùng chung request đang chạy. Request danh sách bị hủy khi rời trang.
- Cache tách theo scope, version và toàn bộ đường dẫn/bộ lọc/cursor. Thao tác ghi và đổi tài khoản vô hiệu hóa bộ nhớ; phản hồi của lượt đọc trước thao tác ghi không được công bố. Có tối đa một lần đọc lại khi ghi và đọc giao nhau. Bộ nhớ này giữ payload từng trang, không giữ vị trí cuộn hoặc toàn bộ các trang đã mở rộng.
- Ảnh gốc và thumbnail riêng tư của album/dấu mốc dùng ETag và `private, no-cache`. API kiểm tra quyền hiện tại và sự tồn tại ảnh trước khi trả `304`; khi ảnh chưa đổi, không đọc lại bytes từ Cloudinary. Không dùng `max-age` để bỏ qua kiểm tra quyền. Mở ảnh lớn lần đầu vẫn cần tải ảnh gốc; thumbnail chỉ dùng cho ô nhỏ và danh sách trang editor.
- Recap tuần chỉ đổi khóa khi phiên bản nội dung đổi, thay vì dùng bộ đếm nội bộ của lượt tải. Popup không chủ động làm mới thư viện.
- Fixture `daily-polish` đếm request: lần đầu vào thư viện ảnh có **1** request `/library/photos`; chuyển sang lịch rồi trở lại có **0** request danh sách bổ sung khi revision giữ nguyên; mở/đóng tài khoản cũng có **0**. Vẫn có request kiểm tra phiên bản và quyền ảnh. Đây là số request fixture cục bộ, không phải phép đo thời gian production, mạng hoặc cold start Render.
- Kiểm chứng: `tests/validated-read.test.ts` (scope/revision, invalidation, quyền bị thu hồi, hủy, giới hạn query), `test:api` (304 không có bytes và tài khoản khác vẫn 404), suite `daily-polish` (điều hướng, popup và layout 1920/390/320px). Phần lịch dùng card hai cột desktop/một cột mobile, ảnh giới hạn kích thước và ghi chú có biểu tượng, nội dung xem trước ngắn.

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
