# Chạy thử miễn phí: Render, Neon, Cloudinary và Vercel tùy chọn

Ngày kiểm tra tài liệu nhà cung cấp: 29/10/2026. Free tier có hạn mức và có thể thay đổi; không tự chuyển sang gói trả phí.

## Aiven PostgreSQL

Chuẩn bị ngày 23/11/2026: ứng dụng hỗ trợ PostgreSQL Aiven với CA riêng và pool nhỏ. **Chưa cutover dữ liệu production.** Kiểm tra thực tế: Aiven PostgreSQL 18 kết nối được bằng Node và `psql`, xác minh CA/hostname, schema public chưa có dữ liệu ứng dụng. Neon nguồn đang từ chối kết nối vì quota, SQLSTATE `53000`; chưa xuất được dữ liệu mới nhất. Lượt backup GitHub thành công gần nhất quan sát được là 19/11/2026, artifact không còn; các lượt 20–23/11 thất bại. Không coi đây là bằng chứng dữ liệu Neon đã bị xóa.

### Cấu hình riêng tư và kiểm tra trước

1. Chạy `npm run setup:aiven`. Generator chỉ tạo `.secrets/aiven-migration.json` nếu chưa có; giữ nguyên các `.env` hiện có. File mẫu `deploy/aiven-migration.example.json` phải luôn để trống credential.
2. Điền `sourceUrl` là URI database Neon đang dùng, `targetUrl` là Service URI của Aiven. Khi xuất Neon, dùng direct connection thay cho endpoint pooling nếu có. Tải CA từ Overview của dịch vụ Aiven vào `.secrets/aiven-ca.pem`, khớp `targetCaFile`. Không gửi URI, mật khẩu hoặc khóa backup vào chat/Git.
3. `npm run db:aiven:check-target` chỉ kiểm tra đọc đích, dùng được khi nguồn đang hết quota. `npm run db:aiven:check` kiểm tra cả hai bên: PostgreSQL đích không thấp hơn nguồn, schema public, dung lượng nguồn tối đa 512 MiB để còn khoảng trống trong gói Free 1 GB, đích không có bảng/view/sequence/function/type ứng dụng.
4. Các lệnh kiểm tra dùng client read-only, không gọi migration/bootstrap API và không khởi tạo schema production. Lỗi không in URI hoặc thông điệp PostgreSQL có thể chứa dữ liệu riêng.

Gói Aiven Free công bố 1 CPU, RAM/disk 1 GB, tối đa 20 kết nối và không có pooling được quản lý. Pool `pg` phía ứng dụng vẫn dùng được: API mặc định `DATABASE_POOL_MAX=5`, job backup dùng 2; nếu chạy worker local thì dùng 3 và tính tổng các tiến trình/deploy chồng nhau để dành chỗ kết nối quản trị. Không cần bật worker cloud để chuyển DB. Xem [Free tier](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier).

### Chuyển đủ dữ liệu khi Neon đọc lại được

1. Giữ lại Neon và cấu hình cũ. Dừng lịch backup/reminder đang ghi, dừng API Render và mọi worker; đợi upload, thao tác account deletion và lease đang chạy kết thúc. Cờ `--source-stopped` là xác nhận người vận hành đã dừng các nguồn ghi, không tự dừng được Render/GitHub.
2. Chạy `npm run db:aiven:transfer -- --source-stopped`. Cần Docker Desktop/Docker Engine; công cụ dùng PostgreSQL client cùng major version nguồn. Credential chỉ truyền qua môi trường của container client tạm, không nằm trong argv hoặc log. Dump/list/báo cáo nằm trong `backups/aiven-migration/`, không được commit; đây là bản chứa dữ liệu riêng tư, cần lưu trên máy tin cậy.
3. Công cụ xuất schema public bằng `pg_dump`, giữ các bảng và tham chiếu media; không tải lại/ghi/xóa ảnh Cloudinary. `pg_restore` bỏ owner/ACL nguồn, chạy một transaction vào đích trống. Không xóa schema dữ liệu hoặc dùng `--clean` để ép ghi đè. Kiểm tra hoạt động nguồn và fingerprint trước/sau dump; nếu nguồn đổi thì dừng trước restore.
4. Đối soát mọi dòng bảng ứng dụng bằng SHA-256 theo từng dòng kết hợp count/sum/XOR, và đối chiếu định nghĩa cột/index/function/trigger/constraint. Nguồn và đích chưa khớp thì không cutover. Giữ cả tombstone, quota, lịch sử, session, receipt và trạng thái job; không reset job đang chạy để làm migration xanh. Chạy `npm run db:aiven:verify` để kiểm tra lại khi nguồn vẫn dừng ghi.
5. Sau khi code TLS đã được kiểm thử/deploy đúng phiên bản, cập nhật Render `DATABASE_URL` sang Aiven, `DATABASE_POOL_MAX=5` và **một** trong `DATABASE_CA_CERT` (PEM đầy đủ) hoặc `DATABASE_CA_CERT_FILE` (file CA có mount trên host). Helper bật `rejectUnauthorized: true`; SSL options trong URI được loại khỏi bản config có CA để không ghi đè việc xác minh CA/hostname. [Kết nối Node chính thức](https://aiven.io/docs/products/postgresql/howto/connect-node).
6. Cập nhật GitHub `BACKUP_DATABASE_URL` và `BACKUP_DATABASE_CA_CERT` (cùng PEM). Giữ Cloudinary cloud/folder/credential như trước để fingerprint media khớp. Chỉ bật lại backup khi đã kiểm tra API, tài khoản, lịch/timeline, ảnh, lịch sử và link chia sẻ với dữ liệu chuyển. FE Vercel không nhận database URL hoặc CA.

Dump được giữ để đối soát. Quay lại Neon chỉ đơn giản trước khi có ghi mới ở Aiven; sau khi đã có ghi mới phải đối soát, không đổi URL ngược lại rồi bỏ các thay đổi đó. Không tự xóa Neon sau cutover. Dữ liệu cũ không tự hợp nhất nếu chọn bắt đầu bằng Aiven trống rồi tạo tài khoản/kỉ niệm mới.

### Khi Neon hết quota

Neon xác nhận hết compute/network allowance có thể chặn cả `pg_dump` với `53000`; dữ liệu vẫn được giữ. Phương án miễn phí bảo toàn dữ liệu là chờ kỳ quota mở lại hoặc chủ tài khoản làm việc với Neon để có quyền xuất. Không tự nâng gói trả phí. [Quy định quota và xuất dữ liệu Neon](https://neon.com/docs/introduction/plans#how-do-i-restore-or-export-a-free-plan-project-that-hit-its-limits).

Nếu không có backup và cần bắt đầu ngay bằng database trống, cần chủ dự án chọn rõ phương án này: dữ liệu/tài khoản cũ chưa có trong app mới, giữ nguyên Neon và namespace media cũ. Dùng Cloudinary folder mới để API/cleanup của database trống không đụng đến ảnh cũ; không ghi đè dữ liệu Aiven mới bằng dump cũ về sau.

### Kiểm chứng

`tests/postgres-config.test.ts` kiểm tra giới hạn pool, CA/file CA, lỗi cấu hình và giữ tham số không liên quan TLS. `tests/postgres-transfer.test.ts` dùng hai database QA độc lập, dump/restore thực, so khớp dữ liệu/schema/tombstone/trigger, đích có dữ liệu, nguồn thay đổi trong khi dump và kiểm tra riêng đích khi nguồn không kết nối được. Integration chỉ chạy khi `TEST_DATABASE_URL` loopback và `QA_PG_CLIENT_CONTAINER` được cấu hình; `test:postgres`/CI cung cấp đúng container QA. Không phục hồi vào Aiven thật để chạy QA.

## Bắt đầu ở đây: chỉ dùng Render + Neon + Cloudinary

Chưa cần Vercel hoặc VPS. Render đã phục vụ cả giao diện và API. Các file được tách theo môi trường; không phải điền tất cả:

| File/chỗ cấu hình    | Việc cần làm lúc này                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| `.env`               | Giữ nguyên, chỉ dành cho chạy development local                        |
| `.env.cloud`         | Điền để máy bạn chạy worker xuất video cho app cloud                   |
| Render → Environment | Điền biến của API trên Render; Render không đọc `.env.cloud` ở máy bạn |
| `.env.staging`       | Bỏ qua, dành cho VPS/Docker Compose                                    |
| Các file `*.example` | Chỉ là mẫu, không cần chỉnh                                            |

Thứ tự thực hiện:

1. Tạo Neon Free database, lấy PostgreSQL connection string có TLS.
2. Đưa mã nguồn lên repository GitHub của bạn, không đưa file secret/dữ liệu lên Git. Render → New → Blueprint → chọn repository; sử dụng `render.yaml` tại root.
3. Điền `DATABASE_URL` và ba credentials Cloudinary trong Render. Giữ folder `little-days-cloud`. Nếu chưa biết URL Render ở bước hỏi `APP_ORIGIN`, tạm điền `https://example.invalid`; sau khi service được tạo, đổi thành URL `.onrender.com` thật và chờ redeploy trước khi dùng.
4. Trong `.env.cloud`, điền **cùng** database URL, ba credentials Cloudinary và `APP_ORIGIN` là URL Render thật. Giữ các biến còn lại như mẫu; folder phải giống API.
5. Ở thư mục dự án chạy `npm run build`, rồi `npm run worker:cloud`. Giữ terminal mở khi cần xuất video. Không cần chạy `npm run dev` để sử dụng web đã deploy.
6. Mở URL Render, tạo album mới và thử xuất một clip ngắn. Album cũ trong SQLite local chưa được chuyển tự động sang Neon.

Máy bạn tắt thì web cloud vẫn dùng được, còn video chờ worker. Để bật email xác minh/quên mật khẩu, dùng Brevo HTTPS theo [AUTH_EMAIL.md](AUTH_EMAIL.md): chỉ thêm ba biến trên Render, không thêm file `.env`.

**Trạng thái 29/10/2026:** người dùng đã xác nhận email thật hoạt động. Phương án worker Northflank đã hủy; giữ worker hiện tại. Bước vận hành tiếp theo là cảnh báo email: thêm `OPS_ALERT_ENABLED=true` và `OPS_ALERT_EMAIL` trong Render Environment theo [OPERATIONS.md](OPERATIONS.md). Không tạo thêm file env hoặc tài nguyên cloud.

## Phương án đã chuẩn bị

Backup theo lịch không cần thêm host: cấu hình GitHub Actions theo [SCHEDULED_BACKUP.md](SCHEDULED_BACKUP.md). Chỉ nhập secrets/variables trên GitHub, không thêm file `.env`. Cập nhật API và worker local trước khi bật; lịch chưa tự kích hoạt.

| Thành phần                    | Chạy ở đâu                                                 |
| ----------------------------- | ---------------------------------------------------------- |
| Frontend + API                | Một Render Free Web Service, build từ Dockerfile hiện có   |
| Database bền vững             | Neon Free PostgreSQL riêng                                 |
| Ảnh/nhạc/video                | Cloudinary hiện có, dùng folder riêng cho môi trường cloud |
| Worker xuất MP4               | Máy của bạn: `npm run worker:cloud`                        |
| Frontend tách riêng, tùy chọn | Vercel Hobby, proxy `/api` về Render                       |

Web/API hoạt động trên cloud. Worker chỉ cần kết nối ra PostgreSQL và Cloudinary; không mở cổng/router máy bạn. Tắt máy/worker thì video xếp hàng chờ; giao diện có thông báo khi chưa có bộ xuất sẵn sàng. Album/media vẫn trên cloud. Không thể hứa có worker render luôn trực tuyến miễn phí chỉ bằng Vercel.

Render Free có HTTPS và URL `.onrender.com`, nhưng ngủ sau 15 phút không có request và mất mọi thay đổi trên đĩa khi restart/spin-down. Vì vậy **không dùng SQLite hoặc local media trên Render**. Free Render Postgres hết hạn sau 30 ngày, nên cấu hình này dùng Neon. Xem [giới hạn Render Free](https://render.com/docs/free).

Neon có gói Free với hạn mức compute/storage/network; worker poll và heartbeat liên tục có thể làm database luôn hoạt động, tiêu compute ngay cả khi không xuất video. Chỉ bật worker khi cần và xem usage trong Neon. Không mặc định nâng plan. Xem [Neon plans](https://neon.com/docs/introduction/plans).

## 1. Tạo database và chuẩn bị media

Tạo một Neon Free project/database cho app cloud, lấy connection string PostgreSQL có TLS từ dashboard. Không dán URL chứa mật khẩu vào chat, Git hoặc frontend. Dùng connection string chuẩn mà Neon cấp; adapter hiện dùng `pg` và transaction/advisory transaction lock. Kiểm chứng PostgreSQL thật đã có; chưa kết nối tài khoản Neon thật của bạn.

Dùng Cloudinary cloud đã có và folder `little-days-cloud`, hoặc một cloud/folder thử riêng. API và worker phải cùng cloud/folder/database và quota. Cấu hình mới không tự di chuyển album SQLite đang có ở máy bạn. Muốn đưa album cũ lên cloud cần quy trình backup/restore vào database trống; giữ bản gốc cho tới khi đã xác minh.

## 2. Deploy Render bằng Blueprint

### Nếu push GitHub nhưng Render không tự build

Vào service **little-days-api → Settings → Build & Deploy**: liên kết GitHub repository `thaihoandev/little-days`, chọn branch `main`, đặt **Auto-Deploy → After CI Checks Pass** rồi lưu. Render đợi các kiểm tra CI của commit mới thành công trước khi deploy. Dịch vụ tạo từ **Public Git Repository URL** không tự deploy; cần kết nối qua tài khoản GitHub và cấp quyền repository cho Render. Không cần tạo database hoặc storage mới.

`render.yaml` khai báo `branch: main` và `autoDeployTrigger: checksPass`, theo lựa chọn giữ **After CI Checks Pass** của chủ dự án. Cấu hình này được áp dụng khi Blueprint sync; push file YAML không tự sửa Settings của service được tạo thủ công. Nếu Blueprint tắt Auto Sync, dùng **Manual Sync**. Không cần deploy thủ công khi đang chờ CI; kiểm tra GitHub Actions của commit mới nhất và đợi tất cả các kiểm tra cần thiết thành công. Nếu có kiểm tra lỗi, sửa lỗi trước khi chờ Render triển khai.

Tham khảo [Render deploys](https://render.com/docs/deploys) và [Blueprint specification](https://render.com/docs/blueprint-spec).

Đưa mã nguồn vào repository Git của bạn, giữ `.env*` chứa secret, `.secrets`, `data`, `backups` và `test-results` ngoài Git. Trên Render tạo **Blueprint** từ repository; file `render.yaml` ở root chỉ tạo **một web service plan free**, không tạo database trả phí hoặc worker cloud.

Điền trong Render Environment:

- `DATABASE_URL`: Neon connection string.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- `APP_ORIGIN`: URL HTTPS Render của app, ví dụ `https://little-days-api-xxx.onrender.com`. Sau khi biết URL, cập nhật lại và redeploy nếu cần.
- Giữ `CLOUDINARY_FOLDER=little-days-cloud`, `STORAGE_DRIVER=cloudinary`, `RENDER_WORKER_MODE=external`, `DISABLE_RENDER_WORKER=true`.

Dockerfile build frontend lẫn backend; không cần Vercel để có giao diện. Service expose port 3001, healthcheck `/api/health/ready`. Build không cần database/Cloudinary credentials; secret chỉ cấu hình runtime. Blueprint theo [Render specification](https://render.com/docs/blueprint-spec).

Free API mặc định 256 MB media/tài khoản, 5 lượt/300 giây video trong 24 giờ và retention 7 ngày. Đây là quota ứng dụng, không thay thế hạn mức tổng Cloudinary/Neon/Render. Tài khoản khách vẫn tạo album và đăng ký được.

Khi Blueprint hỏi `MAIL_DRIVER`, chọn `disabled` để dựng demo trước hoặc `brevo` sau khi đã cấu hình sender/API key. Bật gửi thật bằng `MAIL_DRIVER=brevo`, `BREVO_API_KEY` và `MAIL_FROM` trên Render; xem [AUTH_EMAIL.md](AUTH_EMAIL.md). Render Free chặn SMTP ports 25/465/587; adapter Brevo dùng HTTPS nên không dùng các cổng này. [Giới hạn outbound](https://render.com/docs/free#other-limitations).

## 3. Bật worker ở máy bạn

```powershell
npm run setup:cloud
# Điền DATABASE_URL và ba credentials Cloudinary trong .env.cloud.
# Cloudinary folder, quota và retention phải giống Render.
npm run build
npm run worker:cloud
```

`setup:cloud` đã tạo `.env.cloud` mẫu trong workspace và không ghi đè file có sẵn hoặc `.env` development. `worker:cloud` dùng file này riêng, từ chối SQLite và credential mẫu. Worker Windows dùng workspace local `data-cloud-worker`, còn media/database ở cloud. Dừng bằng Ctrl+C khi không cần render để giảm tiêu compute Neon.

Mở URL Render, tạo album, upload ảnh/nhạc, xuất một clip ngắn và kiểm tra tải MP4. Chưa có deploy Render/Neon thật trong phiên này vì chưa kết nối tài khoản/repository đích. Luồng cùng kiến trúc API/worker/database/cloud media đã được kiểm chứng bằng PostgreSQL và Cloudinary fixture.

## 4. Thêm Vercel nếu muốn frontend riêng

```powershell
npm run setup:vercel -- --api-origin https://YOUR-API.onrender.com
```

Lệnh tạo `vercel.json`, từ chối URL chứa credentials/path/query và không ghi đè file đã có nếu thiếu `--overwrite`. Cấu hình build `npm run build:web`, output `dist`, framework Vite. Import repo vào Vercel với **root là thư mục gốc repository**, không chọn `apps/web` vì cần packages dùng chung. Không thêm secret database/Cloudinary vào Vercel frontend.

Sau khi có URL `.vercel.app`, đặt `APP_ORIGIN` của Render thành chính xác URL frontend đó. Cookie HttpOnly đi qua rewrite cùng origin; không cần chuyển session sang localStorage. Share/email link dùng origin frontend. Nếu chỉ dùng Render thì bỏ qua bước này.

Vercel phục vụ frontend và rewrite API ra Render. Remotion worker giữ ở ngoài Vercel Functions: hiện Hobby có giới hạn function duration/payload không phù hợp để chuyển nguyên backend upload 20 MB + worker dài hạn vào một function. [Vite trên Vercel](https://vercel.com/docs/frameworks/frontend/vite), [rewrites](https://vercel.com/docs/routing/rewrites), [Functions limits](https://vercel.com/docs/functions/limitations). External rewrite cũng có timeout; cần thử upload/stream/download qua URL Vercel thật trước pilot.

## Giới hạn vận hành của phương án free

- Render có cold start và hạn mức giờ/bandwidth/build; kiểm tra dashboard, không dùng request giả để tránh sleep. Đây là phương án hobby/demo, không phải cam kết uptime production.
- Không có Prometheus/systemd trong một free web service. Có thể xem log Render, operator API nếu cấu hình khóa và chạy `ops:check` từ máy bạn.
- Backup theo lịch kiểu VPS trong STAGING.md không tự chạy trên Render. Dùng cửa sổ bảo trì: tạm ngừng ghi/API ở Render, dừng worker, đợi lease/heartbeat hết hạn, rồi `npm run backup:create:cloud`. Lưu backup ở máy/đích độc lập và restore drill trước pilot. Chỉ dùng lệnh khi đã điền đúng `.env.cloud`.
- Nếu muốn render 24/7 không phụ thuộc máy cá nhân, cần một container/VM đủ RAM. Có thể khảo sát quota free Sandbox của Northflank hoặc Oracle Always Free, nhưng phải kiểm tra tài nguyên được cấp và điều kiện tài khoản trước khi chọn; không coi mọi dịch vụ có nhãn free là đủ để chạy Chromium. [Northflank pricing](https://northflank.com/pricing), [Oracle Free Tier](https://www.oracle.com/cloud/free/).

Các file cấu hình đã sẵn sàng cho repository GitHub. Push mã nguồn chưa đồng nghĩa với deploy hosting: cần kết nối repository với Render/Vercel và điền runtime secrets trong tài khoản của người sở hữu.
