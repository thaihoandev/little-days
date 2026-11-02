# Trạng thái triển khai Little Days

Ngày cập nhật: **02/11/2026**.

## Kết quả hiện tại

Sửa focus/caret popup nhập chữ, thêm nút căn lề và 10 font tiếng Việt tự host dùng chung canvas/viewer/MP4; toolbar tải ảnh rõ, thùng rác tách hàng bộ lọc, hồ sơ rộng hai cột/tab mobile và loading khi lấy dữ liệu. Tài liệu hướng dẫn tập trung tại `docs/`. Xem [INTERFACE_REFINEMENT.md](INTERFACE_REFINEMENT.md) về cập nhật API/worker đang dùng; không thêm env.

Đợt ưu tiên tiếp theo: thùng rác dấu mốc, lịch sử 20 phiên bản gồm ảnh với CAS/khôi phục và xóa vĩnh viễn theo quyền; bình luận/cảm xúc dùng quyền timeline, hỗ trợ backup/quota/xóa tài khoản; Ngày này năm trước trên Hôm nay. Trang Ảnh đã lưu được thiết kế lại, gom ảnh album/dấu mốc, lọc/tìm và tải ảnh riêng tư; bỏ caption tên file. Hướng dẫn và giới hạn: [MEMORY_COMMUNITY.md](MEMORY_COMMUNITY.md). Cần deploy FE/API cùng commit, không thêm env.

Cải thiện tiếp giao diện timeline: đường chỉ uốn lượn, các nhóm ngày hai bên trên desktop, card gọn có padding, nút icon/tooltip; bản đồ ảnh hiển thị sẵn, zoom chuột/phím, chọn vị trí bằng map/GPS không hiện tọa độ; lịch bỏ lặp ngày ở nhóm con. Xem [TIMELINE_JOURNEY_DESIGN.md](TIMELINE_JOURNEY_DESIGN.md).

Tối ưu ảnh trước upload, tiến trình thực và hai upload đồng thời; gom timeline/Hôm nay theo ngày, phân biệt bìa album và các loại dấu mốc; tên/avatar riêng tư và vị trí tùy chọn có bản đồ Leaflet/OSM tải theo yêu cầu. Rút gọn banner để ưu tiên dữ liệu cá nhân. Xem [cập nhật và nghiên cứu ngày 31/10](UPDATE_2026_10_31.md), gồm số đo dung lượng, giới hạn và đề xuất tiếp theo. Không thêm env/dịch vụ trả phí; deploy FE/API cùng commit.

Bổ sung cộng tác dòng thời gian theo email tài khoản đã xác minh: lời mời/chấp nhận trong ứng dụng, cùng CRUD dấu mốc và ảnh, lịch chung có tùy chọn hiện/ẩn theo thành viên, thu hồi/rời và xử lý xóa tài khoản. Dữ liệu chia sẻ không mở quyền album riêng. Lịch desktop 3:1, trang Hôm nay ưu tiên nội dung ngày hiện tại; các trang và editor có URL riêng, hỗ trợ tải lại/Back/Forward. Hướng dẫn trong [TIMELINE_COLLABORATION.md](TIMELINE_COLLABORATION.md); cần deploy FE/API cùng commit, không thêm env.

Thêm tách nền AI trên trình duyệt: xem trước/so sánh, hủy, viền trắng/bóng đổ, lưu bản sao trong suốt riêng tư và Undo/Redo. Kiểu ảnh cutout được dùng chung cho Canvas, viewer và MP4; giữ ảnh gốc và layout cũ. Không cần env hay dịch vụ trả phí mới. Xem [BACKGROUND_REMOVAL.md](BACKGROUND_REMOVAL.md) về tài nguyên mô hình, triển khai và yêu cầu cập nhật worker xuất video hiện có.

Bổ sung logo cuốn sổ/trái tim, favicon SVG/PNG và Apple touch icon; ô lịch hiển thị thumbnail đại diện của sự kiện dưới số ngày. Đã bỏ giao diện sửa tiêu đề/mô tả timeline, vẫn hiển thị nội dung riêng đã lưu. Không đổi database hoặc biến môi trường.

Frontend đã được người dùng deploy lên https://little-days-memories.vercel.app; kiểm tra HTTP và proxy healthcheck thành công. API chạy trên Render tại https://little-days-api.onrender.com, dùng PostgreSQL Neon và Cloudinary; người dùng xác nhận Brevo HTTPS đã gửi email thật thành công. Worker xuất video hiện vẫn chạy theo cấu hình cũ; phương án worker Northflank đã được người dùng hủy. Đây là bản MVP để chạy thử, chưa phải toàn bộ hệ thống production trong `IMPLEMENTATION_PLAN.md`.

Ngày 30/10/2026, người dùng xác nhận đã bật backup theo lịch và hoàn tất phục hồi thử. Chưa ghi URL run/report kiểm chứng production vào hồ sơ; kết quả này được ghi nhận theo xác nhận của người dùng. Người dùng đã yêu cầu bỏ qua pilot thật và tiếp tục triển khai; tài liệu pilot giữ làm tham khảo, không là bước chặn.

**Bản 0.2** tách render worker khỏi API, thêm hàng đợi SQL có lease/heartbeat và adapter media local/S3. Đã kiểm chứng hai worker qua S3 fixture; PostgreSQL 17 và container production cũng đã chạy thật trong QA.

**Bổ sung Cloudinary:** có adapter dùng SDK chính thức, upload authenticated cho ảnh/video, chunked video và private download qua backend. `.env` đã được tạo, chọn Cloudinary; người dùng chỉ cần điền ba thông tin tài khoản, database vẫn mặc định SQLite. S3 được giữ làm lựa chọn tương thích.

## Đã triển khai

**Bổ sung ngày 30/10:** lịch và timeline trở thành nội dung chính của trang chủ; dấu mốc/ghi chú độc lập kèm tối đa 6 ảnh, lặp hằng năm, tìm/lọc; chín mẫu scrapbook và bốn bản nhạc nghe thử/chọn cho video. Journal được tính quota, bảo vệ ownership, CAS, backup/restore và xóa tài khoản. Xem [hướng dẫn chức năng và cập nhật API/worker](CALENDAR_TIMELINE.md). Chưa xác nhận deploy commit bổ sung này lên dịch vụ thật; không cần thêm env hoặc worker cloud.

**Cải thiện thiết kế tiếp theo:** timeline có đường nối hành trình, phân tháng, thẻ giấy và ảnh lớn; thống kê từ dữ liệu thật. Popup select có theme riêng trên trình duyệt hỗ trợ, fallback native. Danh sách trang có icon xóa với xác nhận/undo/bảo vệ trang cuối. Thanh trên canvas thêm nhanh chữ/khung ảnh/sticker, tải ảnh, nhân bản Ctrl/⌘ D và căn giữa; không thay đổi schema hay file env. Chi tiết và phím tắt trong `CALENDAR_TIMELINE.md`.

**Hoàn thiện xem album và mỹ thuật:** scrollbar sage đồng bộ; viewer co theo cả hai chiều trong một màn hình và khóa nền; popup xem ảnh giữ người dùng trong trang; xóa trang dùng dialog riêng. Có 18 trang trí SVG trong 5 bộ và 9 mẫu có minh họa giấy/hoa/tem/washi; mẫu timeline có ba cột mốc riêng. Trường sticker `decorationId` là bổ sung tùy chọn, không cần migration hay env; cần cập nhật API và worker cùng commit để lưu/render đúng. Mẫu đã lưu của người dùng được giữ nguyên; gallery mới áp dụng khi thêm trang/tạo album.

**Đa dạng kiểu và giảm tài nguyên ảnh:** có 6 mẫu chữ, 6 mẫu bộ đếm với 5 giao diện; `counterStyle` tùy chọn được dùng chung trong Canvas/DOM/video, tách khỏi cách tính ngày. Viewer có 3 kiểu sổ, 3 hiệu ứng chuyển trang, vuốt ngang và reduced motion. Ảnh mới dùng chung bộ chuẩn hóa tối đa cạnh 1600px, chất lượng 80; ảnh còn trên mục tiêu 700 KiB được thử 1280/72 rồi 1024/66, tối đa 3 lượt, bỏ EXIF và không phóng ảnh nhỏ. Ảnh cũ không tự đổi. Timeline hiển thị tối đa 3 thumbnail dạng cụm gọn, có số ảnh còn lại và xem đủ qua popup.

| Hạng mục | Kết quả |
| --- | --- |
| Workspace | React/TypeScript/Vite, NestJS, domain schemas và Remotion composition |
| Giao diện | Dashboard, thư viện ảnh, editor, viewer, video builder; bố cục desktop/mobile |
| Template | Chín mẫu có sẵn trên ba theme và mẫu cá nhân theo tài khoản; lưu chữ/nhóm/layout/hiệu ứng, dùng ảnh album đích |
| Lịch/timeline | Trang chủ ưu tiên lịch và ngày sắp tới; dấu mốc/ngày/lời nhắn/6 ảnh, ghi chú, lặp hằng năm, tìm/lọc; dữ liệu riêng theo tài khoản |
| Nhạc có sẵn | Bốn track tổng hợp bằng mã nguồn, nghe thử, lưu lựa chọn, lặp/fade/âm lượng dùng chung preview và MP4; API kiểm tra worker hỗ trợ track mới |
| Editor | Shift/marquee/checkbox chọn nhiều, nhóm/bỏ nhóm, kéo/resize/xoay nhóm; căn chỉnh, chia đều, snap guides; thứ tự lớp, ẩn/hiện/khóa; pinch zoom 60–150% và reset 100% |
| Trang | Thêm, nhân bản, đổi màu, đổi tên, sắp xếp và xóa |
| Lưu | Autosave/revision/409, bản nháp và undo/redo; lịch sử server 50 phiên bản, checkpoint có tên, preview và restore có CAS |
| Backup/restore | Database logic + media có SHA-256; restore vào đích trống, dry-run mặc định, import transaction; workflow GitHub Actions snapshot có lease/table locks, AES-256-GCM và restore drill trước khi upload; lịch chưa bật khi thiếu secrets/variables |
| Upload | JPEG/PNG/WebP, kiểm tra định dạng thực, 20 MB/40 megapixel, WebP tối ưu và bỏ EXIF |
| Kỉ niệm | Sự kiện có ngày, text, ảnh, đánh dấu nổi bật; đưa lời nhắn lên scrapbook |
| Ngày động | Số ngày bên nhau, countdown hằng năm, mốc số ngày tùy chỉnh; múi giờ album và 29/2 |
| Tài khoản | Phiên khách; đăng ký/đăng nhập, scrypt async, cookie HttpOnly; xác minh email, quên/reset/đổi mật khẩu; thu hồi phiên cũ và rate-limit bền vững |
| Email | Hộp thư local, SMTP/TLS, Brevo và Resend HTTPS; timeout, chặn redirect, log không chứa secret; link một lần 24h/15 phút |
| Quyền | Album/ảnh/export theo chủ sở hữu; link chia sẻ chỉ đọc và thu hồi |
| Database | SQLite mặc định; PostgreSQL 17 thật qua auth/history/lease/quota/cleanup, API, video và backup/restore |
| Video | Preset 15/30/60 giây hoặc cảnh 1–60 giây, tổng ≤180 giây; lưu tùy chọn theo album; preview và MP4 dùng cùng timeline |
| Nhạc riêng | Upload MP3/WAV/M4A AAC; kiểm tra file thật, chuẩn hóa MP3, trim/loop/volume/fade; quyền riêng tư, byte-range, chặn xóa khi đang render |
| Export | Snapshot bất biến, atomic claim, lease/heartbeat, retry tối đa 3 lần, cancel và output riêng cho từng lần render |
| Worker | Tiến trình riêng; hai worker cùng SQLite đã kiểm thử; worker cũ hết lease không được cập nhật/publish/xóa output mới |
| Storage | Local, Cloudinary authenticated hoặc S3-compatible private, stream qua API; cấu hình chung giữa API và worker |
| Migration media | Dry-run mặc định; copy local → Cloudinary/S3, kiểm SHA-256, idempotent và không xóa nguồn |
| Production build | NestJS phục vụ frontend build và API cùng origin |
| Công cụ | Dockerfile, Compose PostgreSQL và workflow CI được chuẩn bị |
| Vận hành | Quota bytes/lượt/giây video, retention 30 ngày, cleanup có lease và CLI dry-run, fingerprint đích storage |
| Giám sát | RequestId/log JSON, operator status/metrics có khóa riêng, bảy Prometheus rules; email opt-in qua mailer hiện có, lease/dedup bền vững, grace/cooldown và thông báo phục hồi |
| Staging | Caddy HTTPS, PostgreSQL/app/worker/Prometheus, cấu hình riêng, lịch backup và hướng dẫn rollback/pilot |
| Project skills | Ba SKILL.md riêng cho editor, backend và video trong `skills/` |

Trong lúc ảnh đang upload/lưu, editor tạm khóa tương tác để response chứa metadata mới không ghi đè thay đổi đang chỉnh. Canvas và video builder được lazy-load riêng khỏi dashboard.

Autosave nhận diện `503 BACKUP_IN_PROGRESS`, giữ bản nháp/chỉnh sửa mới và thử lại theo Retry-After. Lưu thủ công/Ctrl+S cũng xóa thông báo bảo trì cũ sau khi tự lưu lại thành công. Chỉ PATCH lưu nội dung album có cơ chế này; 409 vẫn chặn để giải quyết xung đột, POST/upload/export không tự retry.

## Video và nhạc riêng

- Bật **Thời lượng từng trang** trong Tạo video; các cảnh giữ thời lượng khi đổi thứ tự. Mở đầu cố định 2 giây, kết 3 giây.
- **Tải nhạc riêng**: MP3/WAV/M4A AAC, 20 MB, từ 1 đến 600 giây, tối đa 10 bản/album. Chuẩn hóa MP3 stereo 44,1 kHz/128 kbps và bỏ metadata. Chọn đoạn cắt, âm lượng, lặp hoặc dừng khi hết đoạn. Có fade đầu/cuối.
- **Lưu tùy chọn video** lưu lựa chọn nhạc, điểm cắt, âm lượng, thứ tự và thời lượng cảnh trên backend. Trang đã xóa được loại khỏi lựa chọn khi mở lại; nhạc đã xóa chuyển sang không nhạc.
- Nhạc riêng đi qua MediaStore như ảnh/video; Cloudinary dùng MP3 authenticated thuộc resource video, API hỗ trợ byte-range. Job lưu metadata nhạc bất biến và worker đọc bytes từ storage. Không cần biến môi trường mới. Migration storage bao gồm audio.
- Nhạc đang dùng trong job hoạt động không thể bị xóa; xóa album dọn cả bản nhạc và cấu hình video. Tùy chọn hiện lưu bằng nút bấm, chưa autosave.

## Cách dùng editor nâng cao

- Shift + chạm hoặc kéo vùng trống để chọn nhiều; trên mobile có ô chọn trong mục **Lớp**. Ctrl+A chọn toàn bộ phần tử hiện, Ctrl+G nhóm, Ctrl+Shift+G bỏ nhóm.
- Kéo một thành viên để di chuyển cả nhóm; resize nhóm giữ tỷ lệ. Căn/chia đều coi mỗi nhóm như một khối; có phần tử khóa thì thao tác hình học bị chặn.
- Mục **Trang sổ → Mẫu của bạn** lưu mẫu trên backend. Mẫu giữ chữ, nhóm, layout, hiệu ứng và ẩn/khóa; không lưu liên kết ảnh album nguồn. Thêm trang sẽ gán ảnh album đích theo thứ tự tải lên. Tối đa 100 mẫu/tài khoản, 20 trang/album, 50 phần tử/trang.
- Trạng thái ẩn dùng chung trên canvas, viewer và MP4; album cũ không có trường visible/groupId vẫn mở được. Nhóm hiện hỗ trợ một cấp.

## Kiểm chứng đã chạy

- `npm test`: **79 tests qua**, gồm ba kiểm thử bổ sung cho presets/ngày động, xoay ảnh/bỏ EXIF/không phóng ảnh nhỏ và nén ảnh nhiễu lớn về kích thước/dung lượng hợp lý. Giữ các kiểm thử calendar, template, SVG, nhạc, quota/backup/auth/queue/storage trước đó. Chạy ngoài sandbox để kiểm thử directory symlink trên Windows.
- `npm run typecheck`: qua.
- `npm run build`: qua, có frontend production và JavaScript backend biên dịch.
- `npm run format:check`: qua.
- `npm run test:ops`: API biên dịch, bật giám sát opt-in, operator status có khóa, ghi thư vào hộp local, restart và CLI không gửi trùng; không gửi email thật. Năm unit test giám sát cũng qua trên PostgreSQL 17 trong database/container QA riêng.
- `npm run test:scheduled-backup`: PostgreSQL schema QA riêng, SHARE locks chặn xóa media trong khi snapshot, Cloudinary HTTP fixture, chạy CLI mã hóa/giải mã/restore SQLite và so database/media; job bận không ghi đè archive tốt và lease được nhả. Đây là kiểm chứng fixture, chưa phải workflow chạy với Neon/Cloudinary thật.
- `npm run test:pilot`: **9 luồng cô lập qua**: journal, editor, save-recovery, gestures, auth, history, video, deletion, layout-render. Report ngày 30/10 tại `test-results/pilot/be85e2b5-0c2f-49f1-a3a2-c38f4709ac7e/report.json`; ảnh/log nằm trong test-results (gitignored). Đây là QA tự động, không phải pilot người thật. CI chạy cùng runner.
- `npm run test:journal`: kiểm tra trang chủ lịch, tạo/sửa/xóa mốc và ghi chú, ảnh riêng tư/404 tài khoản khác, reload, tìm timeline, lịch mobile không tràn, tạo album từ mẫu mới và lưu lựa chọn nhạc.
- Lượt QA sau cải thiện thiết kế: `npm run test:pilot` **10 luồng qua**, gồm suite `design` mới và các luồng ở trên; report `test-results/pilot/42329bbf-3765-46a6-a4ec-dbeb81135ac6/report.json`. Xác minh thêm icon xóa trang hiện tại/trang khác, hủy/xác nhận/undo, bảo vệ trang cuối, Ctrl+D, căn giữa, tải/thêm ảnh và lưu sau reload trên desktop/mobile. Timeline/popup dropdown mở thật được kiểm tra ở 1440px, 390px và 320px. Build/typecheck và format đều qua; MP4 layout vẫn xuất thành công 1.360.658 byte. Chưa kiểm chứng popup trên Safari/Firefox thật; trình duyệt thiếu hỗ trợ dùng native.
- Lượt QA hoàn thiện viewer/trang trí: **11 luồng qua**, report `test-results/pilot/66060f6e-d367-4a2b-97a1-884f6070fbdf/report.json`. Popup xóa trang thay native confirm; lightbox không mở tab; viewer vừa desktop/mobile và landscape 640×360, có Escape và khóa/nhả cuộn nền. Suite `templates` mở 9 mẫu qua API, kiểm tra SVG/ảnh đã giải mã và chụp contact sheet. Chọn/lưu/reload trang trí SVG trên canvas; MP4 thực có Cúc nhỏ, **1.388.860 byte**. Build/typecheck và format qua. QA dùng fixture riêng, không phải xác nhận deploy production.
- Lượt kiểm chứng ảnh tiêu chuẩn: API với Cloudinary fixture qua; test load SQLite/Cloudinary fixture qua quota với ảnh đã nén và 3 job render cùng lúc. API p95 28ms trong fixture local; số này không phải đo hạ tầng production. Các mẫu bộ đếm được chụp trong viewer tại `test-results/counter-designs.png`; test giao diện kiểm tra đủ 6 lựa chọn, lưu style/dateMode, kiểu sổ/hiệu ứng, dropdown bằng bàn phím và cụm 4 ảnh chỉ hiện 3 thumbnail nhưng mở được ảnh thứ tư.
- QA cuối cho bộ đếm/lật sổ/ảnh nhẹ: **11 luồng qua**, report `test-results/pilot/e343fc77-5b74-4424-981a-0064b11caee6/report.json`. MP4 thực có bộ đếm Tờ lịch và trang trí SVG, **1.484.403 byte**; build/typecheck và format qua. Không dùng tài khoản/dữ liệu/mail thật trong các lượt QA này.
- API qua Cloudinary fixture và backup/restore đã chạy lại với journal: phục hồi được ghi chú và bytes ảnh JPEG; API/ảnh vẫn kiểm tra chủ sở hữu.
- `SMOKE_STORAGE=cloudinary SMOKE_MUSIC_ID=warm-piano npm run test:workers`: MP4 15 giây **1.769.585 byte**, hai worker nhận đúng một lần, snapshot bất biến. ffprobe/ffmpeg xác nhận H.264 1080×1920/30 fps, AAC và đối chiếu nhạc nguồn tại ba vị trí bằng `scripts/verify-library-video.ts`.
- `npm run test:postgres`: chạy lại trên PostgreSQL 17 Docker QA riêng, gồm journal; 33 unit qua/1 SQLite-only bỏ qua, API, ba video đồng thời và backup/restore qua Cloudinary fixture. Container QA được dọn sau kiểm thử.
- `npm run test:save-recovery`: kiểm tra bổ sung trên code cuối cho cả autosave/lưu thủ công, tôn trọng Retry-After, lưu nội dung mới nhất, xóa thông báo sau phục hồi và giữ draft khi 409; qua desktop/mobile.
- `npm run test:gestures`: touch events thực qua Chromium CDP, mobile/desktop có cảm ứng; giới hạn 60–150%, reset 100%, không tăng revision/undo, không tràn ngang ở zoom tối đa, chuyển kéo sang pinch và touchcancel không làm lệch album; kéo một ngón sau đó vẫn lưu đúng. Core editor và layout/render MP4 đã chạy lại thành công sau cập nhật viewport.
- `npm run test:api`: qua với local storage và với `SMOKE_STORAGE=s3`; kiểm tra ownership, đăng ký/đăng nhập, CAS, xử lý ảnh thật, media riêng tư, thu hồi share, idempotency, cancel và xóa.
- `npm run test:s3`: qua HTTP fixture local, gồm SDK ký request, kiểm tra bucket, put buffer/stream, bounded read, get, prefix và delete.
- `npm run test:cloudinary`: qua HTTP fixture local, gồm SDK ký upload, authenticated assets, chunked video trên 6 MB, private download, bounded read và xóa.
- API và migration đã qua với `SMOKE_STORAGE=cloudinary`. Người dùng đã xác nhận cấu hình Cloudinary hoạt động; các kiểm thử tự động bổ sung dùng fixture riêng, không sử dụng credentials hoặc dữ liệu tài khoản thật.
- `SMOKE_STORAGE=cloudinary npm run test:workers` đã xuất và tải MP4 thật qua một API và hai worker với Cloudinary HTTP fixture; chỉ một worker nhận tác vụ. `.env` mặc định Cloudinary/SQLite và `setup:env` giữ nguyên file đã tồn tại đã được kiểm tra.
- `npm run test:migration`: qua dry-run không request S3, copy kiểm SHA-256, chạy lại idempotent, chống ghi đè nội dung khác và giữ nguồn.
- `npm run test:workers`: qua với một API, hai worker độc lập, S3 fixture và MP4 thật; job được nhận đúng một lần, snapshot không đổi sau khi sửa album.
- `npm run test:video`: MP4 12 giây, hai cảnh 3/4 giây qua Cloudinary fixture và hai worker; kiểm tra H.264 1080×1920/30 fps, tín hiệu 440 Hz của đoạn nhạc cắt/lặp tại nhiều thời điểm và khung hình mở đầu/hai cảnh/kết.
- `npm run test:video-ui`: qua upload/preview/byte-range/trim/loop/volume, đổi thứ tự cảnh, lưu/mở lại, xuất/hủy, xóa nhạc và desktop/mobile.
- `npm run test:history-ui`: tạo mốc, reload, preview, restore/quay lại, reset undo, desktop/mobile và chặn restore với revision cũ.
- `npm run test:auth`: đăng ký giữ album khách, xác minh/reset một lần, response quên mật khẩu chung, đổi mật khẩu, vô hiệu hóa phiên và persistence qua restart.
- `npm run test:smtp`: SMTP/TLS fixture localhost xác minh handshake, authentication và nhận thư; unit test từ chối AUTH/gửi mail nếu không có TLS. Không gửi email thật.
- `npm run test:mail`: toàn bộ auth API với Brevo và Resend qua HTTP fixture localhost; xác minh/reset một lần, thu hồi phiên, giữ album và persistence qua restart. Khóa giả, địa chỉ `.test`, không gọi provider hoặc gửi mail thật.
- `npm run test:auth-ui`: desktop/mobile, gửi lại/xác minh, đổi/quên/reset, đăng nhập lại giữ album, xóa token khỏi URL và từ chối link đã dùng.
- `npm run test:deletion`: Cloudinary HTTP fixture, xác nhận mật khẩu, thu hồi phiên/share, hủy export, dọn ảnh/nhạc/video/file chưa hoàn tất và giữ dữ liệu tài khoản khác.
- `npm run test:deletion-ui`: xác nhận rõ ràng, sai mật khẩu, đăng xuất, trạng thái sau reload, dọn đúng bản nháp và desktop/mobile.
- `npm run test:load`: ba người dùng cùng xếp hàng, một worker xuất ba MP4 thật qua Cloudinary fixture; kiểm tra quota/IDOR/operator API. SQLite: 2.016 request, p95 50 ms, ba video 6 giây trong khoảng 52 giây. PostgreSQL: 2.232 request, p95 122 ms, khoảng 65 giây. Đây là smoke local, không phải năng lực production.
- `npm run test:postgres`: schema QA riêng, auth/history/lease/quota/cleanup, API, ba video và backup PostgreSQL → PostgreSQL qua Cloudinary fixture.
- `npm run test:container`: image production Linux, PostgreSQL/API/worker, MP4 thật, restart giữ dữ liệu và backup PostgreSQL → SQLite có đối chiếu checksum.
- Caddy validate, Compose staging config và Prometheus config/rules đã được kiểm tra bằng công cụ thật; không dùng secret operator để kiểm tra cú pháp.
- UI có waveform từ PCM, thanh kéo điểm cắt và cảnh báo chữ tràn dựa trên DOM/font; smoke editor/video desktop/mobile đã qua.
- `npm run test:backup`: CLI backup local → restore Cloudinary fixture → backup lại, SHA-256, database đích trống, giữ session/share/history và tải media riêng tư qua API.
- `npm run test:layout`: qua với 3 ảnh + text: Shift/marquee, kéo/resize nhóm, hoàn tác, căn giữa, ẩn/khóa, lưu mẫu, thêm trang, mở lại và render MP4 thực tế. Video H.264 1080×1920, 30 fps, 15 giây; đã xem khung mở đầu/trang/kết, lớp ẩn không xuất hiện. Dữ liệu kiểm thử tách khỏi dữ liệu người dùng.
- `npm run test:ui`: qua luồng tạo album, chữ tiếng Việt, thuộc tính, undo/redo, upload, reload persistence, kỉ niệm, viewer, preview video và không tràn ngang tại desktop/mobile; đã chạy lại sau thay đổi upload overlay.
- `npm run test:production`: qua; server biên dịch phục vụ HTML/JS, session cookie và bảo vệ API.
- `npm run test:render`: render và tải thành công MP4 thật có ảnh upload, chữ tiếng Việt, hiệu ứng fade, mốc 1.000 ngày và audio. File mẫu: `test-results/recap-smoke.mp4` (1.783.073 byte tại lần kiểm thử cuối).
- FFprobe xác nhận video H.264, 1080 × 1920, 30 fps và audio AAC; clip preset 15 giây có container duration khoảng 15,06 giây do padding audio.
- Đã trích và xem trực quan frame mở đầu, trang scrapbook và lời kết.
- Metadata của ba project skill được kiểm tra bằng Node; validator Python chưa chạy vì môi trường không có Python thực thi được.

Kết quả screenshot và video nằm trong `test-results/` và không đưa vào source control. Smoke test tạo tài khoản/album thử riêng; không dùng dữ liệu cá nhân của người dùng.

## Khác biệt so với kiến trúc đích

| Thiết kế đích | Bản hiện tại | Việc tiếp theo |
| --- | --- | --- |
| Supabase magic link | Guest + email/password, xác minh email, đổi/reset mật khẩu và thu hồi phiên | Magic link hoặc nhà cung cấp auth ngoài nếu có nhu cầu |
| PostgreSQL + Prisma quan hệ | Record repository trên SQLite/PostgreSQL | Migration quan hệ, index, kiểm tra adapter trên Postgres thật |
| Object storage private | Adapter local/S3 đã hoạt động qua API private | Xác minh bucket thật, lifecycle/retention, upload intent/complete |
| BullMQ/Redis + worker riêng | Worker riêng và SQL queue có atomic lease, retry, fencing | Giữ SQL queue để tránh dual-write/outbox; load test và đo nhu cầu trước khi thêm Redis |
| IndexedDB draft | LocalStorage document không chứa binary | Chuyển IndexedDB nếu dữ liệu lớn; hạn mức/lifecycle bản nháp |
| Server checkpoint/migration | Lịch sử 50 revision, checkpoint có tên, xem trước và restore trong UI; trigger nguyên tử | Migration schema document khi lên phiên bản mới |
| Editor nâng cao | Multi-select, nhóm, căn/chia đều, snap guides, lớp, mẫu cá nhân, cảnh báo chữ tràn và pinch zoom | Nhóm lồng nhau hoặc các gesture bổ sung khi có yêu cầu |
| Audio cá nhân | Nhạc gốc/tắt/upload, waveform/trim kéo, loop/volume/fade; lưu cấu hình, Cloudinary/S3/local | Thư viện nhạc tuyển chọn |
| Triển khai cloud | Render công khai, Neon/Cloudinary, Brevo thật đã được người dùng xác nhận; backup/restore CLI đã kiểm chứng qua fixture | Bật receiver cảnh báo, lịch backup và restore drill trên hạ tầng thật; worker cloud đã hủy |

Docker Desktop đã khởi động được; đã build image và chạy container/PostgreSQL 17 thật. CI có job PostgreSQL/container trong `.github/workflows/checks.yml`; kiểm tra kết quả GitHub Actions sau khi push. Kiểm thử cloud tự động dùng fixture; xác nhận email thật đến từ người dùng. Cảnh báo vận hành thật chưa được bật khi chưa có địa chỉ nhận cấu hình trên Render.

## Bổ sung ngày 30/10/2026: timeline → scrapbook và giấy phép

Đã có chọn dấu mốc, gallery chín mẫu và preview phân trang trong popup desktop/mobile; album mới mở ngay trong editor. Backend đọc nguồn theo quyền/revision, sao chép WebP riêng, giữ toàn bộ ghi chú, kiểm quota và tránh album trùng khi retry. Nguồn bị xóa không làm mất ảnh trong album mới. Không thêm migration hoặc biến môi trường. Xem `TIMELINE_SCRAPBOOK.md`.

Chủ dự án đã chọn AGPL-3.0-only và chấp thuận ngoại lệ liên kết Remotion. Có toàn văn license, ngoại lệ, font OFL, inventory/notice dependencies và popup giấy phép/link mã nguồn theo commit build. Remotion/dependencies giữ điều kiện riêng; kiểm kê metadata không thay thế việc kiểm tra điều kiện phân phối native binaries/phiên bản Remotion cụ thể.

Kiểm tra bổ sung đã qua: 12 luồng UI cô lập desktop/mobile; 8 unit test import và 2 test giấy phép; PostgreSQL có 42 test qua/1 test dành riêng SQLite được bỏ qua, API, ba người dùng render và backup/restore. Build/typecheck/format đã qua; MP4 import đã trích và xem khung mở đầu/trang ảnh/trang lời nhắn/kết. Các kết quả này dùng fixture local/Cloudinary giả, không xác nhận rollout production hoặc pilot người thật.

## Ưu tiên tiếp theo

Đợt cải tiến editor tiếp theo đã thêm popup chỉnh/thay ảnh trong khung (kéo, zoom, upload), resize tự do/giữ tỉ lệ, tên sổ sửa trên header và tiêu đề/mô tả timeline lưu riêng theo tài khoản. Năm mẫu màu mới nâng catalog lên 14; tám bảng phối giấy/chữ cho trang hiện tại giữ ảnh/SVG và hỗ trợ Undo. Giấy/trang trí khóa không chặn chọn ảnh bên dưới. Không thêm biến môi trường hoặc bảng mới; API/frontend phải deploy cùng commit để có endpoint `timeline-heading`.

Đã qua 93 unit test, build/typecheck/format, 13 luồng UI desktop/mobile và API trên PostgreSQL 17 riêng. Sáu test journal trên PostgreSQL bao gồm tạo tiêu đề đồng thời và revision conflict. Video crop/phối màu thật đã được kiểm bằng ffprobe (H.264 1080×1920, khoảng 7 giây) và xem khung hình; đã xem gallery 14 mẫu. Đây là QA tự động bằng fixture, không phải pilot người thật hoặc xác nhận rollout production.

Đã bổ sung xóa tài khoản vĩnh viễn: xác nhận mật khẩu/câu xác nhận trong UI, thu hồi session/share/auth token, hủy export, hàng đợi dọn dữ liệu và media có lease/retry qua restart. Có sổ object trước upload, chặn ghi muộn, dọn thư local, trạng thái theo dõi sau reload và CLI vận hành. API Cloudinary fixture và UI desktop/mobile đã qua; dữ liệu tài khoản khác được giữ. Backup/restore chặn khi còn yêu cầu xóa. Xem `ACCOUNT_DELETION.md` về backup cũ và media mồ côi trước khi có sổ object.

1. Tiếp tục các cải tiến editor/video có trong kế hoạch; pilot người thật đã được bỏ qua theo yêu cầu.
2. Bật và xác minh receiver cảnh báo trên Render bằng hai biến trong OPERATIONS.md; giữ Brevo hiện có.
3. Điền GitHub Secrets/Variables theo SCHEDULED_BACKUP.md, bật workflow backup, kiểm tra run thật và tải archive để drill độc lập. Không cần VPS hoặc worker cloud.
4. Đo tải/CPU/RAM toàn container và chi phí trên hạ tầng đích, hiệu chỉnh quota.
5. Thư viện nhạc tuyển chọn và nhóm lồng nhau là các phần mở rộng còn lại; không chờ pilot để phát triển tiếp.
6. Đối chiếu license, kiểm toán bảo mật và xác nhận rollout/rollback trước phát hành.

## Tài liệu

- `README.md`: hướng dẫn chạy và kiểm thử.
- `BACKUP_RESTORE.md`: lịch sử phiên bản, lệnh backup/restore, giới hạn và quy trình kiểm tra sau phục hồi.
- `SCHEDULED_BACKUP.md`: GitHub Actions backup mã hóa theo lịch, cấu hình secrets/variables, giới hạn quota và phục hồi từ artifact.
- `AUTH_EMAIL.md`: luồng tài khoản, hộp thư local, SMTP, hạn token và rate-limit.
- `ACCOUNT_DELETION.md`: xóa tài khoản, dọn dữ liệu/media, retry và hướng dẫn vận hành.
- `OPERATIONS.md`: quota/retention/cleanup, log/metrics, backup theo lịch và drill.
- `STAGING.md`: cấu hình HTTPS/container, PostgreSQL, backup và rollback.
- `FREE_HOSTING.md`: Render/Neon/Cloudinary với worker local và Vercel frontend tùy chọn.
- `PILOT.md`: kịch bản, mẫu ghi nhận và điều kiện nghiệm thu với người dùng thật.
- `PILOT_RESULTS.md`: hồ sơ điều kiện vận hành, ma trận TC01–TC10 cho P01–P05, sổ lỗi và quyết định nghiệm thu.
- `IMPLEMENTATION_PLAN.md`: kế hoạch đích chi tiết.
- `skills/couple-scrapbook-editor/SKILL.md`: quy tắc layout và autosave.
- `skills/couple-scrapbook-backend/SKILL.md`: quyền truy cập và persistence.
- `skills/couple-scrapbook-video/SKILL.md`: frame timing và render pipeline.

Các project skill là artifact trong repository, chưa được cài vào danh mục skill tự động của Codex trên máy. Không thay đổi cấu hình global để chạy ứng dụng.
