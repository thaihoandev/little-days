# Trạng thái triển khai Little Days

Ngày cập nhật: **29/10/2026**.

## Kết quả hiện tại

Bản local đã có luồng thực tế từ tạo album, upload ảnh, chỉnh layout và lưu server đến preview và xuất MP4. Đây là bản MVP để chạy thử, chưa phải toàn bộ hệ thống production trong `IMPLEMENTATION_PLAN.md`.

**Bản 0.2** tách render worker khỏi API, thêm hàng đợi SQL có lease/heartbeat và adapter media local/S3. Đã kiểm chứng hai worker qua S3 fixture; PostgreSQL 17 và container production cũng đã chạy thật trong QA.

**Bổ sung Cloudinary:** có adapter dùng SDK chính thức, upload authenticated cho ảnh/video, chunked video và private download qua backend. `.env` đã được tạo, chọn Cloudinary; người dùng chỉ cần điền ba thông tin tài khoản, database vẫn mặc định SQLite. S3 được giữ làm lựa chọn tương thích.

## Đã triển khai

| Hạng mục | Kết quả |
| --- | --- |
| Workspace | React/TypeScript/Vite, NestJS, domain schemas và Remotion composition |
| Giao diện | Dashboard, thư viện ảnh, editor, viewer, video builder; bố cục desktop/mobile |
| Template | Ba mẫu có sẵn và mẫu cá nhân theo tài khoản; lưu chữ/nhóm/layout/hiệu ứng, dùng ảnh album đích |
| Editor | Shift/marquee/checkbox chọn nhiều, nhóm/bỏ nhóm, kéo/resize/xoay nhóm; căn chỉnh, chia đều, snap guides; thứ tự lớp, ẩn/hiện/khóa |
| Trang | Thêm, nhân bản, đổi màu, đổi tên, sắp xếp và xóa |
| Lưu | Autosave/revision/409, bản nháp và undo/redo; lịch sử server 50 phiên bản, checkpoint có tên, preview và restore có CAS |
| Backup/restore | Database logic + media có SHA-256; restore vào đích trống, dry-run mặc định, import transaction; kiểm thử SQLite và Cloudinary fixture |
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
| Giám sát | RequestId/log JSON, operator status/metrics có khóa riêng, bảy Prometheus rules |
| Staging | Caddy HTTPS, PostgreSQL/app/worker/Prometheus, cấu hình riêng, lịch backup và hướng dẫn rollback/pilot |
| Project skills | Ba SKILL.md riêng cho editor, backend và video trong `skills/` |

Trong lúc ảnh đang upload/lưu, editor tạm khóa tương tác để response chứa metadata mới không ghi đè thay đổi đang chỉnh. Canvas và video builder được lazy-load riêng khỏi dashboard.

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

- `npm test`: **63 tests qua**, gồm HTTPS mail contracts/lỗi/timeout/thu hồi token, quota, retention, cleanup/junction, backup, cấu hình Vercel, auth/domain/queue/storage.
- `npm run typecheck`: qua.
- `npm run build`: qua, có frontend production và JavaScript backend biên dịch.
- `npm run format:check`: qua.
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
| Editor nâng cao | Multi-select, nhóm, căn/chia đều, snap guides, lớp, mẫu cá nhân và cảnh báo chữ tràn | Nhóm lồng nhau và gesture trên canvas |
| Audio cá nhân | Nhạc gốc/tắt/upload, waveform/trim kéo, loop/volume/fade; lưu cấu hình, Cloudinary/S3/local | Thư viện nhạc tuyển chọn |
| Triển khai cloud | Build/container local; backup/restore CLI đã kiểm chứng SQLite + Cloudinary fixture | Staging, domain, HTTPS, secrets, lịch backup và restore drill trên hạ tầng thật |

Docker Desktop đã khởi động được; đã build image và chạy container/PostgreSQL 17 thật. CI có job PostgreSQL/container trong `.github/workflows/checks.yml`; kiểm tra kết quả GitHub Actions sau khi push. Kiểm thử cloud tự động dùng fixture, không thay thế domain/SMTP/provider staging thật. Chưa triển khai máy chủ công khai.

## Ưu tiên tiếp theo

Đã bổ sung xóa tài khoản vĩnh viễn: xác nhận mật khẩu/câu xác nhận trong UI, thu hồi session/share/auth token, hủy export, hàng đợi dọn dữ liệu và media có lease/retry qua restart. Có sổ object trước upload, chặn ghi muộn, dọn thư local, trạng thái theo dõi sau reload và CLI vận hành. API Cloudinary fixture và UI desktop/mobile đã qua; dữ liệu tài khoản khác được giữ. Backup/restore chặn khi còn yêu cầu xóa. Xem `ACCOUNT_DELETION.md` về backup cũ và media mồ côi trước khi có sổ object.

1. Dùng thử album với ảnh thật và lấy phản hồi về thao tác editor/thiết kế template.
2. Điền domain/credentials staging, triển khai máy chủ và xác minh HTTPS/SMTP thật.
3. Bật timer backup trên server và restore drill; cấu hình receiver cảnh báo ngoài nếu cần.
4. Đo tải/CPU/RAM toàn container và chi phí trên hạ tầng đích, hiệu chỉnh quota.
5. Pilot 3–5 người theo PILOT.md; thư viện nhạc tuyển chọn, gesture và nhóm lồng nhau là mở rộng sau pilot.
6. Đối chiếu license, kiểm toán bảo mật và xác nhận rollout/rollback trước phát hành.

## Tài liệu

- `README.md`: hướng dẫn chạy và kiểm thử.
- `BACKUP_RESTORE.md`: lịch sử phiên bản, lệnh backup/restore, giới hạn và quy trình kiểm tra sau phục hồi.
- `AUTH_EMAIL.md`: luồng tài khoản, hộp thư local, SMTP, hạn token và rate-limit.
- `ACCOUNT_DELETION.md`: xóa tài khoản, dọn dữ liệu/media, retry và hướng dẫn vận hành.
- `OPERATIONS.md`: quota/retention/cleanup, log/metrics, backup theo lịch và drill.
- `STAGING.md`: cấu hình HTTPS/container, PostgreSQL, backup và rollback.
- `FREE_HOSTING.md`: Render/Neon/Cloudinary với worker local và Vercel frontend tùy chọn.
- `PILOT.md`: kịch bản, mẫu ghi nhận và điều kiện nghiệm thu với người dùng thật.
- `IMPLEMENTATION_PLAN.md`: kế hoạch đích chi tiết.
- `skills/couple-scrapbook-editor/SKILL.md`: quy tắc layout và autosave.
- `skills/couple-scrapbook-backend/SKILL.md`: quyền truy cập và persistence.
- `skills/couple-scrapbook-video/SKILL.md`: frame timing và render pipeline.

Các project skill là artifact trong repository, chưa được cài vào danh mục skill tự động của Codex trên máy. Không thay đổi cấu hình global để chạy ứng dụng.
