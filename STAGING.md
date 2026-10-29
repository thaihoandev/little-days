# Triển khai staging và rollback

Nếu chưa có VPS/domain và muốn dùng free tier, chọn [FREE_HOSTING.md](FREE_HOSTING.md): Render/Neon/Cloudinary, worker local và Vercel tùy chọn. Các bước Compose/systemd dưới đây dành cho máy chủ tự quản lý.

## Chuẩn bị cấu hình

```powershell
npm run setup:staging
```

Lệnh đã được chạy trong workspace này: tạo `.env.staging` và `.secrets/ops-token`, không ghi đè file đã có hoặc `.env` development. Không đưa hai file này lên Git. `.env.staging.example` là bản mẫu có thể chia sẻ.

Điền `APP_DOMAIN`, Cloudinary staging cloud/folder riêng và SMTP được phép gửi từ `MAIL_FROM`. Password PostgreSQL được sinh ngẫu nhiên dạng hex; giữ nguyên khi đã có volume database. Staging phải có dữ liệu, secret và storage namespace riêng với production. Không sao chép dữ liệu thật vào môi trường thử nếu chưa có quy trình phù hợp.

## Chạy trên máy chủ

Cần Docker Compose, domain trỏ tới máy chủ và cổng 80/443 truy cập được. Từ thư mục repository:

```sh
docker compose -p little-days-staging --env-file .env.staging -f compose.yaml -f deploy/staging.yaml config --quiet
docker compose -p little-days-staging --env-file .env.staging -f compose.yaml -f deploy/staging.yaml build
docker compose -p little-days-staging --env-file .env.staging -f compose.yaml -f deploy/staging.yaml up -d --wait
```

Caddy proxy tới API, phục vụ HTTPS; frontend build và API chung origin. Cookie Secure và proxy trust được đặt cho một proxy. PostgreSQL không publish cổng; app chỉ publish 3001 vào localhost để vận hành; metrics bị chặn tại proxy công khai. Cấu hình Caddy dựa trên [tài liệu reverse proxy chính thức](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

Trên Linux, thư mục `.secrets` nên chỉ cho người vận hành truy cập; file token cần đọc được trong các container app/Prometheus. Generator tạo thư mục 0700, file 0644 để bind-mount đọc được; không đổi thành file chỉ root đọc nếu container chạy bằng user node. Không in token qua log hoặc truyền nó trong URL.

Kiểm tra sau khi chạy: health/ready, đăng ký/xác minh email, reset mật khẩu bằng SMTP staging, upload ảnh/nhạc, mở share rồi thu hồi, xuất/tải MP4, hạn mức và tiến độ xóa tài khoản. Dùng dữ liệu thử riêng. Cấu hình domain/TLS và SMTP thật chưa được xác minh chỉ bằng bài kiểm thử local.

## Giám sát và backup theo lịch

Prometheus nằm ở `http://127.0.0.1:9090`; dùng SSH tunnel khi truy cập từ máy khác. Bảy rules có trong `deploy/alerts.yml`. Cấu hình receiver riêng nếu cần gửi cảnh báo ra ngoài.

Trên máy chủ Linux, đặt mã nguồn tại `/opt/little-days` hoặc sửa `WorkingDirectory`/`ExecStart` trong service. Tạo `/var/backups/little-days` bên ngoài volume media, cho uid 1000 quyền ghi; giới hạn quyền đọc của người khác. Sao chép hai file `deploy/little-days-backup.*` vào systemd và bật timer:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now little-days-backup.timer
sudo systemctl start little-days-backup.service
sudo journalctl -u little-days-backup.service
```

Script mặc định dùng project `little-days-staging`; nếu đã triển khai với tên khác, đặt `COMPOSE_PROJECT_NAME` cùng tên trong service. Chọn cửa sổ bảo trì; script dừng dịch vụ để lấy snapshot nhất quán. Timer trên server chưa được cài/bật bởi agent tại máy development này. Thử phục hồi sang đích độc lập trước khi coi lịch backup đáng tin cậy.

## Cập nhật và rollback

1. Tạo backup đã verify, ghi lại tag/digest image và cấu hình đang chạy; giữ image phiên bản trước.
2. Build/tag image mới bằng version riêng, cập nhật `APP_IMAGE` trong `.env.staging`. Không tái sử dụng một tag cho nhiều bản đã phát hành.
3. Dừng worker, cập nhật app/worker, chờ healthcheck rồi smoke upload/render/download và kiểm tra metrics.
4. Nếu lỗi, dừng worker, trả `APP_IMAGE` về bản trước và chạy `up -d --no-build --wait`. Giữ nguyên volume/media.
5. Nếu thay đổi schema không tương thích bản trước, rollback image không đủ. Dừng ghi và restore backup vào database/storage mới; kiểm tra xong mới chuyển cấu hình. Không tự rollback migration phá dữ liệu.

Migration hiện tự chạy có khóa khi khởi động. Chỉ mở rộng schema trong các bước cập nhật này. Chưa kiểm thử rollback qua hai phiên bản đã phát hành trên server thật; bài QA đã kiểm chứng restart giữ dữ liệu.

## Bộ kiểm chứng sẵn có

```powershell
npm test
npm run test:load
# TEST_DATABASE_URL phải tới database chuyên kiểm thử, có quyền tạo schema:
npm run test:postgres
docker build -t little-days:qa-20261029 .
npm run test:container
```

`test:postgres` tạo schema `qa_<UUID>` riêng cho từng suite và chỉ dọn schema mình tạo. Có auth/history/lease/cleanup/quota, API, ba người dùng xuất video qua Cloudinary fixture và backup PostgreSQL → PostgreSQL. `test:container` dùng project/volume Docker QA riêng, xuất MP4 Linux thật, restart giữ dữ liệu và backup PostgreSQL → SQLite; tự dọn container/volume của project đó. Không trỏ `TEST_DATABASE_URL` vào production.

Đã build và chạy container/PostgreSQL thật tại máy development. CI có workflow trong `.github/workflows/checks.yml`; kiểm tra kết quả GitHub Actions sau khi push. Chưa triển khai domain/cloud production hoặc gửi SMTP thật.
