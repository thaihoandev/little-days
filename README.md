# Little Days — Couple Scrapbook

Ứng dụng React + TypeScript cho cặp đôi: trang chủ lịch và timeline, lưu dấu mốc/ảnh/ghi chú, tùy chỉnh scrapbook và xuất video MP4. API NestJS xử lý tài khoản, dữ liệu riêng tư và tác vụ render Remotion. Xem [lịch, timeline, 9 mẫu và thư viện nhạc](CALENDAR_TIMELINE.md), gồm hướng dẫn cập nhật API/worker hiện có.

## Chạy local

App cloud hiện dùng Render/Neon/Cloudinary. Backup tự động qua GitHub Actions, không cần thêm host, được hướng dẫn tại [SCHEDULED_BACKUP.md](SCHEDULED_BACKUP.md); lịch mặc định chưa bật đến khi điền secrets/variables.

Yêu cầu Node.js **22.14 trở lên** và npm. File `.env` đã được tạo và chọn Cloudinary cho media; database mặc định là SQLite, không cần Docker.

Mở `.env` và điền ba giá trị từ tài khoản Cloudinary:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Giữ `DATABASE_URL` trống để dùng SQLite. Nếu muốn chạy offline, đổi `STORAGE_DRIVER=local`. Không đặt tiền tố `VITE_` cho API key hoặc secret.

```powershell
npm ci
# Chỉ cần nếu chưa có .env; lệnh này giữ nguyên file đã tồn tại:
npm run setup:env
npm run video:browser
npm run dev
```

- Web: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- API health: [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)
- `npm run dev` chạy ba tiến trình: web, API và render worker. Dừng bằng `Ctrl+C`.

`video:browser` tải Chromium của Remotion một lần. Không cần chạy lại khi trình duyệt vẫn còn trong `node_modules/.remotion`. Nếu đổi máy hoặc chạy `npm ci`, có thể phải tải lại.

`setup:env` tạo `.env` từ `.env.example` và sinh mật khẩu PostgreSQL ngẫu nhiên cho Docker; không ghi đè file đã tồn tại. Giữ `APP_ORIGIN` khớp origin web. Vite đọc `PORT` và `WEB_PORT` từ `.env` tại thư mục gốc; API và worker đọc cùng file đó. Mặc định không cần chỉnh các cổng.

## Cách dùng

1. Trang **Hôm nay** hiển thị lịch, các ngày sắp tới và ghi chú trước album. Bấm **Thêm dấu mốc** để lưu ngày, lời nhắn và tối đa 6 ảnh; mở **Dòng thời gian** để tìm/lọc hoặc **Lịch của mình** để xem theo ngày. Bấm **Bắt đầu một cuốn sổ**, đặt tên và chọn một trong chín mẫu để tạo scrapbook.
2. Trong **Thiết lập**, nhập tên hai người, ngày bắt đầu và múi giờ.
3. Trong **Ảnh**, tải JPEG/PNG/WebP, rồi bấm ảnh để thêm vào trang.
4. Chọn phần tử trên canvas để kéo, resize, xoay, đổi chữ/font/màu hoặc crop. Chạm hai lần vào text để nhập lời nhắn.
5. Giữ **Shift** khi chạm phần tử, kéo vùng trống hoặc dùng ô chọn trong **Lớp** để chọn nhiều. Dùng **Nhóm / Bỏ nhóm** (Ctrl+G / Ctrl+Shift+G), kéo/resize/xoay nhóm, căn chỉnh và chia đều khoảng cách. Đường dẫn căn xuất hiện khi kéo gần mép/tâm trang hoặc phần tử khác.
   Trên màn hình cảm ứng, dùng hai ngón trên canvas để phóng to/thu nhỏ từ 60–150%; chạm mức `%` để về 100%. Chuyển sang hai ngón sẽ hủy thao tác kéo đang dở. Zoom chỉ thay đổi cách xem, không đổi bố cục hoặc tạo bước undo.
6. Trong **Lớp**, chọn, ẩn/hiện, khóa/mở khóa; dùng **Lên/Xuống một lớp** ở bảng bên phải để sắp xếp.
7. Trong **Trang sổ → Mẫu của bạn**, đặt tên rồi bấm **Lưu trang thành mẫu**. Thêm trang từ mẫu sẽ giữ chữ, bố cục, nhóm và hiệu ứng; dùng ảnh của album hiện tại theo thứ tự tải lên, hoặc để khung trống khi chưa có ảnh. Mẫu riêng được lưu theo tài khoản.
8. Thêm, nhân bản và sắp xếp trang. Thay đổi tự lưu; kéo/resize nhóm là một bước undo/redo.
   Icon thùng rác nằm ngay trong danh sách **Trang sổ**, có xác nhận và hoàn tác; không xóa được trang cuối. Thanh **Thiết kế nhanh** trên canvas thêm chữ/khung ảnh/sticker, tải ảnh, nhân bản và căn giữa. **Ctrl/⌘ D** nhân bản lựa chọn; các thao tác vẫn được autosave và undo/redo.
9. Trong **Kỉ niệm**, thêm sự kiện và đặt lời nhắn lên trang.
10. **Xem album** để đọc; **Chia sẻ** tạo link chỉ đọc, có thể thu hồi.
11. **Tạo video** → chọn trang/thứ tự, lời mở/kết và nhạc. Giữ preset 15/30/60 giây hoặc bật **Thời lượng từng trang** để đặt mỗi cảnh 1–60 giây; tổng tối đa 180 giây, gồm 2 giây mở đầu và 3 giây kết.
12. Bấm **Tải nhạc riêng** để thêm MP3/WAV/M4A, chọn điểm bắt đầu/kết thúc, âm lượng và lặp đoạn nhạc. Nếu tắt lặp, phần còn lại của video không có nhạc. Nhạc vào/ra nhẹ ở đầu và cuối.
13. Bấm **Lưu tùy chọn video** để lần sau mở lại vẫn giữ lựa chọn, rồi **Xuất video MP4**. Tác vụ đang xuất giữ nguyên bản chụp album, nhạc và cấu hình lúc bấm xuất.

Lần đầu mở web tạo phiên khách riêng tư cho trình duyệt. Đăng ký email/mật khẩu sẽ giữ các album của phiên đó và cho phép đăng nhập lại. Mật khẩu được hash bằng scrypt bất đồng bộ; đã có xác minh email, quên/reset và đổi mật khẩu kèm thu hồi các phiên cũ. Không dùng email/mật khẩu của dịch vụ khác để chạy thử.

Ảnh mẫu là tranh SVG tự tạo. Thư viện có bốn track tổng hợp bằng mã nguồn, nghe thử và chọn trong **Tạo video → Nhạc nền**. Có thể tải thêm nhạc riêng: tối đa 20 MB/file, 1–600 giây và 10 bản/album; backend kiểm tra dữ liệu thật, chuyển về MP3 stereo 44,1 kHz/128 kbps và bỏ metadata. MP3, WAV và M4A AAC đã được kiểm thử. Các font được đóng gói local qua Fontsource, có hỗ trợ tiếng Việt.

Nhạc riêng được lưu authenticated trong Cloudinary (resource video), hoặc cùng adapter S3/local đang dùng cho ảnh. Không cần thêm biến môi trường. API kiểm tra chủ sở hữu, hỗ trợ byte-range để seek, chặn xóa nhạc đang xuất và dọn nhạc khi xóa album. Migration storage bao gồm cả nhạc.

## Email và bảo mật tài khoản

Mở **Tài khoản** để xem trạng thái xác minh email, gửi lại liên kết hoặc đổi mật khẩu. **Đăng nhập → Quên mật khẩu?** để đặt lại mật khẩu. Link xác minh có hạn 24 giờ, link reset 15 phút và chỉ dùng một lần.

Development mặc định dùng hộp thư local: `npm run mail:outbox -- --latest` để xem thư và mở liên kết. Gửi thật qua SMTP bằng các biến mới trong `.env.example`; `.env` đang có và credentials Cloudinary được giữ nguyên. Xem [hướng dẫn tài khoản/email](AUTH_EMAIL.md).

**Mail trên Render Free:** đã có Brevo HTTPS, chỉ cấu hình `MAIL_DRIVER=brevo`, `BREVO_API_KEY`, `MAIL_FROM` trên Render API sau khi xác minh sender. Không cần thêm file `.env` hoặc cấu hình mail cho worker. Có adapter Resend HTTPS nếu đã dùng provider đó. Xem [các bước bật Brevo](AUTH_EMAIL.md#bật-mail-trên-render-free-dùng-brevo-https).

**Tài khoản → Xóa tài khoản** yêu cầu mật khẩu, câu xác nhận và đồng ý xóa vĩnh viễn. Hệ thống thu hồi phiên/link chia sẻ ngay, hủy xuất video và dọn dữ liệu/media nền với retry qua restart. Không cần biến môi trường mới. Xem [hướng dẫn xóa tài khoản](ACCOUNT_DELETION.md).

## Lịch sử và khôi phục

Trong editor, bấm **Lịch sử phiên bản** cạnh undo/redo để xem trước và khôi phục bản cũ hoặc đặt tên mốc lưu. Giữ 50 revision gần nhất, kể cả mốc có tên. Khôi phục tạo revision mới và giữ bản trước đó; thư viện ảnh hiện tại được giữ nguyên.

Có lệnh `backup:create`, `backup:verify`, `backup:restore` cho database cùng media local/S3/Cloudinary. Restore mặc định chỉ kiểm tra và yêu cầu database đích trống. Xem [hướng dẫn backup/restore](BACKUP_RESTORE.md) trước khi chạy. `.env` không được đưa vào backup hoặc thay đổi tự động.

## Phần đã triển khai

- Trang chủ lịch, timeline với ảnh/ghi chú riêng tư, chín mẫu trang, viewer responsive và giao diện tiếng Việt.
- Text, ảnh, sticker và bộ đếm ngày; chọn nhiều, nhóm/bỏ nhóm, kéo/resize/xoay nhóm, crop, căn chỉnh, chia đều, đường dẫn căn, lớp ẩn/hiện/khóa.
- Mẫu bố cục cá nhân lưu trên backend, tái sử dụng với ảnh album đích; trạng thái lớp và bố cục dùng chung giữa editor/viewer/MP4.
- Thêm/nhân bản/xóa/sắp xếp trang; chỉnh màu giấy, font và chuyển động video.
- 18 trang trí vector trong 5 bộ và 9 mẫu minh họa; popup xóa trang/xem ảnh, album co vừa một màn hình và scrollbar theo tông giao diện. Xem [hướng dẫn mẫu và trang trí](CALENDAR_TIMELINE.md).
- 6 mẫu chữ, 6 mẫu bộ đếm với 5 giao diện; viewer có ba kiểu sổ/ba hiệu ứng chuyển trang và vuốt ngang. Ảnh mới chuẩn hóa tối đa 1600px, nén thêm khi nặng; ảnh timeline xếp cụm thumbnail nhỏ.
- Lưu server có optimistic revision, phát hiện xung đột, bản nháp local và undo/redo.
- Quản lý kỉ niệm theo ngày; đếm ngày lịch theo múi giờ và tính kỉ niệm hằng năm, có quy tắc 29/2.
- Upload nhiều ảnh theo lần lượt, kiểm tra file thực, giới hạn 20 MB/40 megapixel, tối ưu WebP và bỏ EXIF trên bản dẫn xuất.
- Session cookie HttpOnly; tài nguyên riêng tư; link chia sẻ ngẫu nhiên chỉ đọc và thu hồi được.
- Preview Remotion Player; snapshot bất biến; MP4 1080 × 1920, 30 fps, nhạc nền gốc.
- Hàng đợi lưu database, atomic claim, lease/heartbeat, retry có giới hạn, progress, idempotency và hủy tác vụ. Worker chạy riêng khỏi API.
- Lưu ảnh/video trên Cloudinary, disk hoặc S3-compatible storage; mọi lượt đọc vẫn đi qua API kiểm tra quyền.
- SQLite chạy mặc định; repository có adapter PostgreSQL khi đặt `DATABASE_URL`.

## Cấu trúc

```text
apps/web/src/                  React UI, Konva editor, document hook
apps/api/src/                  NestJS API, repository, durable render queue
apps/worker/src/               Render worker độc lập và healthcheck
packages/domain/               Schemas và logic ngày/crop/template
packages/scrapbook-renderer/    DOM artwork dùng chung viewer/video
packages/video/                Remotion composition và timing theo frame
scripts/                       Tạo asset và smoke tests
tests/                         Unit/repository tests
data/                          SQLite, upload và MP4 (gitignored)
test-results/                  Screenshot và video kiểm thử (gitignored)
```

## Các lệnh kiểm tra

```powershell
npm test
npm run typecheck
npm run test:api
npm run test:auth
npm run test:smtp
npm run test:s3
npm run test:cloudinary
npm run test:migration
npm run test:workers
npm run build
npm run test:production
npm run test:backup # CLI backup/restore và API qua Cloudinary fixture

# Cần npm run dev đang chạy:
npm run test:ui
npm run test:history-ui
npm run test:auth-ui # Cần MAIL_DRIVER=local, DATA_DIR=test-results/auth-ui-data
npm run test:layout # Cần web/API/worker ổn định; tạo MP4 kiểm thử
npm run test:render
npm run test:video # API + 2 worker, Cloudinary fixture, MP4 thật và kiểm tra tín hiệu âm thanh
npm run test:video-ui # Cần web/API đang chạy; kiểm tra upload/preview/lưu cấu hình
```

- Unit tests kiểm tra ngày/múi giờ, năm nhuận, schema, crop, CAS, atomic claim, hết lease, fencing, cancel, retry và storage.
- API smoke test khởi động server riêng ở cổng 4311, dữ liệu trong `test-results/api-db`; kiểm tra tài khoản, ownership, upload, CAS, chia sẻ và vòng đời export.
- UI smoke test mở Chromium riêng, tạo album thử, chỉnh chữ/ảnh, kiểm tra lưu sau reload, memory, viewer, preview và viewport mobile. Không truy cập profile trình duyệt cá nhân.
- Render smoke test tạo album thử riêng, upload ảnh và xuất MP4 thật; kết quả `test-results/recap-smoke.mp4`.
- `test:s3` kiểm tra SDK qua một HTTP fixture local. `test:workers` tự khởi động API và hai worker, kiểm tra ảnh/video qua S3 fixture và xuất MP4 thật; không cần `npm run dev`.
- `test:cloudinary` kiểm tra SDK chính thức qua HTTP fixture: ký SHA-256, upload authenticated, chunked video, private download, bounded read và delete. Kiểm tra API/worker với Cloudinary bằng cách đặt `SMOKE_STORAGE=cloudinary` trước `npm run test:api`, `npm run test:migration` hoặc `npm run test:workers`.
- `test:migration` kiểm tra dry-run không truy cập S3, copy được kiểm SHA-256, chạy lại không trùng dữ liệu và từ chối ghi đè file khác nội dung.
- Kiểm tra API với S3 fixture trên PowerShell: `$env:SMOKE_STORAGE='s3'; npm run test:api; Remove-Item Env:SMOKE_STORAGE`.
- Các lệnh smoke tạo dữ liệu thử. Có thể xóa album thử bằng giao diện khi không còn job đang chạy.
- `npm run format` định dạng mã; `npm run format:check` kiểm tra định dạng.

## Chạy production trên một máy

```powershell
npm run build
# Đặt NODE_ENV=production trong .env; APP_ORIGIN đúng URL truy cập.
npm start

# Terminal thứ hai, cùng .env/database/storage:
npm run worker
```

API sẽ phục vụ cả frontend build ở cổng 3001. Tài nguyên video vẫn cần `packages/`, font dependencies và asset trong `apps/web/public/`, nên không chỉ copy thư mục `build/` khi triển khai. Dockerfile giữ đủ các thành phần này.

Mặc định bind loopback. Đặt `HOST=0.0.0.0` khi chạy trong container hoặc khi đã cấu hình reverse proxy. Với HTTPS, đặt `COOKIE_SECURE=true` và `APP_ORIGIN` theo domain thực tế.

### PostgreSQL qua Docker Compose

1. Chạy Docker Desktop/Linux engine.
2. Thêm `POSTGRES_PASSWORD` mạnh vào `.env`; không commit file đó.
3. Chạy `docker compose up --build` để mở API, worker và PostgreSQL.
4. Mở [http://127.0.0.1:3001](http://127.0.0.1:3001).

Database và media ở hai volume riêng. Thay database không tự di chuyển album SQLite cũ. Compose là cấu hình chuẩn bị sẵn; trạng thái kiểm chứng thực tế xem [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

Tăng worker bằng `docker compose up --build --scale worker=2`. Mỗi worker render một video mỗi lúc, có workspace/output riêng theo lease. API và worker dùng chung volume khi `STORAGE_DRIVER=local`; với nhiều máy cần PostgreSQL và object storage dùng chung.

## Lưu ảnh và video trên Cloudinary

Đây là lựa chọn mặc định trong `.env`. Điền **cloud name, API key và API secret** từ [Cloudinary Console](https://console.cloudinary.com/), rồi chạy `npm run dev`. Không cần unsigned upload preset hoặc tự tạo bucket. `CLOUDINARY_FOLDER=little-days` làm prefix cho public ID; có thể giữ nguyên.

Ảnh được upload với `resource_type=image`, video dùng `resource_type=video`; cả hai đều dùng `type=authenticated`. Backend dùng SDK chính thức để ký upload và tạo URL tải có thời hạn 60 giây, rồi stream nội dung qua API sau khi kiểm tra quyền. URL ký số và API secret không được gửi xuống giao diện. Video lớn được upload theo chunk.

Cloudinary lưu và phục vụ media; Remotion worker vẫn chịu trách nhiệm dựng video từ layout đã chọn. Giới hạn dung lượng và tính năng thực tế phụ thuộc tài khoản Cloudinary. Kiểm thử tự động hiện dùng HTTP fixture, chưa kiểm chứng với tài khoản thật.

Nếu đã có ảnh/video trong local `data/`, hãy dừng API/worker, điền ba thông tin Cloudinary rồi chạy:

```powershell
npm run storage:migrate
npm run storage:migrate -- --execute
npm run dev
```

Lệnh đầu chỉ kiểm tra. Lệnh thứ hai copy và kiểm SHA-256, giữ nguyên file nguồn. Không đổi `CLOUDINARY_FOLDER` sau khi đã upload, trừ khi có kế hoạch chuyển dữ liệu tương ứng.

Tham khảo: [Cloudinary Node SDK](https://cloudinary.com/documentation/node_integration), [authenticated upload và private download](https://cloudinary.com/documentation/image_upload_api_reference#private_download_url_syntax).

## Lưu ảnh và video trên S3

S3 là lựa chọn tương thích còn giữ lại. Cấu hình mặc định trong `.env` hiện dùng Cloudinary.

Mặc định `STORAGE_DRIVER=local` giữ cách chạy cũ. Để dùng bucket riêng tư có sẵn, đặt trong `.env`:

```dotenv
STORAGE_DRIVER=s3
S3_BUCKET=your-private-bucket
S3_REGION=us-east-1
S3_ENDPOINT=https://your-s3-compatible-endpoint
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=false
S3_PREFIX=little-days
```

`S3_ENDPOINT` có thể bỏ trống khi dùng AWS S3. MinIO hoặc một số endpoint tương thích cần `S3_FORCE_PATH_STYLE=true`. Bucket phải được tạo trước, không public. Quyền cần thiết là `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` cho prefix và quyền bucket phục vụ HeadBucket/ready check. Cấu hình cả API lẫn worker giống nhau. Không đưa access keys vào frontend hoặc source control.

Adapter không tạo bucket và không tự truy cập credentials trong profile AWS của máy. API stream file qua kiểm tra quyền; không phát URL public khiến link bị thu hồi vẫn đọc được ảnh.

### Chuyển dữ liệu local cũ sang cloud storage

1. Đợi hoặc hủy mọi video đang chạy, dừng API và worker, backup database và `data/`.
2. Giữ nguyên database và `DATA_DIR`; chọn `STORAGE_DRIVER=cloudinary` hoặc `s3` và cấu hình target trong `.env`.
3. Chạy `npm run storage:migrate`. Mặc định chỉ kiểm tra file được album/video tham chiếu và in tổng số file/dung lượng; chưa gửi request đến cloud.
4. Chạy `npm run storage:migrate -- --execute` để copy. Công cụ kiểm SHA-256, bỏ qua file đích trùng khớp, từ chối ghi đè file khác nội dung và giữ nguyên nguồn local.
5. Khởi động API và worker bằng cấu hình đã chọn, thử mở ảnh và tải video cũ trước khi dọn backup.

Không tự đổi database hoặc key prefix sau khi copy. Việc chuyển SQLite sang PostgreSQL là một migration khác, chưa có trong công cụ này.

## Giới hạn vận hành hiện tại

Muốn chạy free, không thuê VPS: xem [FREE_HOSTING.md](FREE_HOSTING.md). Đã có `render.yaml`, mẫu `.env.cloud` cho worker local và generator cấu hình Vercel frontend.

Đã có quota media/lượt xuất, retention video, cleanup có tham chiếu, log/metrics và cấu hình staging HTTPS. Xem [OPERATIONS.md](OPERATIONS.md), [STAGING.md](STAGING.md) và [PILOT.md](PILOT.md). `npm run setup:staging` tạo cấu hình riêng và giữ nguyên `.env`; domain/SMTP/credentials staging cần điền trước khi chạy trên máy chủ.

- Render worker đã tách riêng và có atomic claim/lease. SQLite phù hợp các tiến trình trên cùng máy; triển khai nhiều máy cần PostgreSQL và cloud storage dùng chung. Chưa load test toàn hệ thống nhiều API replica.
- Chưa tích hợp Supabase Auth, email magic link, Redis/BullMQ hay CDN. Hàng đợi hiện dùng SQL trực tiếp và không cần Redis. Cần backup DB cùng media theo driver đang dùng.
- PostgreSQL hiện lưu record JSON trong bảng chung để giữ adapter đơn giản; chưa chuyển thành schema quan hệ/Prisma như thiết kế dài hạn.
- Đã có group/multi-select, lịch sử server và upload nhạc riêng; chưa có collaboration hoặc AI viết lời dẫn.
- Bộ đếm hỗ trợ số ngày đã bên nhau, kỉ niệm hằng năm và mốc số ngày tùy chỉnh; mỗi phần tử có thể chọn chế độ riêng.
- Editor và DOM renderer có thể khác cách xuống dòng ở text quá dài. UI cho đổi khung/cỡ chữ; cần kiểm tra preview trước khi xuất.
- Link chia sẻ chỉ có ý nghĩa với người khác khi app được triển khai tại URL truy cập được; link localhost chỉ hoạt động trên cùng máy.
- Video mặc định được giữ 30 ngày; cleanup bảo vệ media còn được album/lịch sử/job tham chiếu. Có thể tắt retention bằng `VIDEO_RETENTION_DAYS=0`. Xóa album dọn media và export khi tác vụ hoạt động đã dừng.
- Mỗi tài khoản có một video hoạt động tại một thời điểm; worker thử lỗi tạm thời tối đa 3 lần, phục hồi lease hết hạn, và dừng ngay với ảnh nguồn bị thiếu.
- Không đổi đích storage tùy ý: fingerprint ngăn khởi động với đích khác trước khi migration rõ ràng hoàn tất. Object mồ côi đã ghi nhận có cleanup; object không còn bất kỳ sổ/tham chiếu nào cần kiểm kê nhà cung cấp riêng.
- Đã kiểm chứng PostgreSQL 17, container production, ba người dùng xuất video và restore drill local. Còn domain/SMTP thật, đo tải trên hạ tầng đích, pilot, kiểm toán bảo mật và xác minh lịch backup trên server.

Không công bố bản local như dịch vụ production nhiều người dùng trước khi hoàn thiện các mục này. Kiểm tra điều kiện license Remotion phù hợp mô hình sử dụng trước khi thương mại hóa.

## Kế hoạch gốc

Ba project skill đã được chuẩn bị trong `skills/couple-scrapbook-editor/`, `skills/couple-scrapbook-backend/` và `skills/couple-scrapbook-video/`. Chúng mô tả implementation thực tế và chưa được cài vào cấu hình skill global của Codex.

[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) mô tả kiến trúc đích và toàn bộ lộ trình. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) phân biệt phần đã làm, đã kiểm tra và còn thiếu.
