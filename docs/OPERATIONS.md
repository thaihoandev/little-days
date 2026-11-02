# Quota, cleanup và giám sát

## Mặc định và cấu hình

Các giá trị sau có mặc định trong backend; `.env` hiện có không cần thêm biến để chạy. API và worker phải dùng cùng cấu hình.

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `QUOTA_STORAGE_MB` | 512 | Dung lượng media mỗi chủ sở hữu, gồm ảnh/nhạc/video và phần đã giữ chỗ cho upload |
| `QUOTA_EXPORTS_PER_DAY` | 10 | Số job mới được tiếp nhận trong cửa sổ 24 giờ liên tục |
| `QUOTA_VIDEO_SECONDS_PER_DAY` | 600 | Tổng thời lượng video được tiếp nhận trong cửa sổ đó |
| `QUOTA_QUEUE_SIZE` | 20 | Tổng job queued/running trong hệ thống |
| `VIDEO_RETENTION_DAYS` | 30 | Video hết hạn theo thời điểm tạo job; 0 để giữ vô thời hạn |
| `ORPHAN_GRACE_HOURS` | 24 | Thời gian bảo vệ trước khi dọn object/workspace không còn tham chiếu |
| `MAINTENANCE_ENABLED` | true | Dọn tự động khi khởi động và mỗi giờ |
| `OPS_TOKEN` | trống | Khóa riêng tối thiểu 32 ký tự cho operator API |
| `OPS_TOKEN_FILE` | trống | Đường dẫn file khóa; ưu tiên hơn `OPS_TOKEN` |

Quota dung lượng tính bytes media, không bao gồm database, thư local, workspace render hoặc backup. Nội dung cũ đang được album/lịch sử/job tham chiếu và các object đã ghi nhận được đối soát khi khởi động. Dữ liệu cũ vượt quota vẫn đọc được nhưng không thể upload/xuất thêm cho đến khi giải phóng đủ chỗ. Trước khi upload MP4, worker kiểm tra kích thước thực; lỗi quota dừng job thay vì retry render vô ích.

Một chủ sở hữu chỉ có một video hoạt động. PostgreSQL dùng advisory transaction lock, SQLite dùng transaction ghi để giữ quota nguyên tử. Yêu cầu lặp cùng idempotency key không tiêu thêm lượt. Job đã nhận vẫn tính lượt/thời lượng nếu người dùng hủy hoặc render thất bại; xóa album/job không hoàn lại cửa sổ sử dụng. Counter được đưa vào backup mới. Restore backup cũ chưa có counter chỉ suy ra được các job còn trong backup.

**Tài khoản** hiển thị mức dùng media/lượt/giây video và thời gian giữ video. `GET /api/usage` chỉ trả dữ liệu của phiên hiện tại; không nhận owner từ client. Hạn mức áp dụng cho cả phiên khách; đây là quota theo chủ sở hữu, không nhận diện một người qua nhiều phiên khách khác nhau.

## Retention và cleanup

Video hết hạn được chuyển sang trạng thái không còn tải được, kèm thông báo có thể xuất lại. Album, ảnh và cấu hình gốc được giữ. File được dọn sau khi không còn tham chiếu và qua thời gian bảo vệ; bytes vẫn tính quota nếu storage chưa xóa thành công.

Cleanup dùng lease chung, mỗi lượt xử lý tối đa 50 video hết hạn và 50 object. Bảo vệ album hiện tại, 50 revision lịch sử, nhạc trong thư viện, snapshot của job đang hoạt động, upload/email đang chạy và yêu cầu xóa tài khoản đang xử lý. File của upload/render lỗi đã được ghi nhận trước khi gửi lên storage có thể được dọn sau thời gian bảo vệ. Không quét xóa tùy ý object không rõ nguồn trong Cloudinary/bucket dùng chung.

```powershell
# Chỉ thống kê ứng viên; không xóa media:
npm run cleanup:media

# Xử lý bằng database/storage hiện cấu hình:
npm run cleanup:media -- --execute
```

Workspace chỉ được dọn trong `DATA_DIR/work/<job UUID>/<attempt UUID>`, khi đủ cũ và job không queued/running. Không đi theo symlink/junction. Khi API/worker khác máy, mỗi máy dọn workspace của chính nó; object cloud dùng lease trên database chung.

Đích storage được gắn fingerprint vào database để tránh dọn nhầm cloud/folder/bucket. Đổi credentials vẫn được nếu giữ đích. Chuyển local → Cloudinary/S3 phải dừng dịch vụ và chạy `storage:migrate -- --execute`; công cụ kiểm checksum cả ảnh trong lịch sử trước khi cập nhật fingerprint. Object local mồ côi không được copy sang cloud và nguồn vẫn được giữ. Chưa có công cụ tự chuyển cloud → cloud hoặc cloud → local; dùng quy trình backup/restore sang database mới.

## Log và metrics

HTTP có `X-Request-Id` do server tạo. Log JSON ghi method/status/thời gian/requestId; không ghi request body, cookie, Authorization, URL truy vấn, email hoặc nội dung album. Worker ghi jobId và trạng thái có cấu trúc. Những dòng khởi động NestJS/Node vẫn có thể là log văn bản.

Operator API trả 404 khi khóa thiếu/sai hoặc chưa cấu hình. Không dùng cookie tài khoản để quản trị:

- `/api/ops/status`: worker còn sống, hàng đợi, tuổi job chờ lâu nhất, cleanup retry, dung lượng, lỗi render gần đây và số đo render.
- `/api/ops/metrics`: Prometheus text format, không có nhãn email/owner/jobId hoặc nội dung riêng tư.
- `npm run ops:check`: kiểm tra API bằng khóa cấu hình; JSON và exit code 1 khi có dấu hiệu cần xử lý. Dùng `OPS_ORIGIN` khi API khác cổng.

Số đo render là wall time, CPU của tiến trình Node, RSS lấy cuối tác vụ và bytes output. CPU/RSS không bao gồm Chromium/ffmpeg và không phải đỉnh RAM toàn container. Dùng `docker stats` hoặc giám sát host khi tính chi phí/công suất thực tế. Số đo theo job được xóa cùng tài khoản.

`deploy/prometheus.yml` và `deploy/alerts.yml` có bảy cảnh báo: API không scrape được, worker mất heartbeat, queue chờ lâu, HTTP 5xx, xóa tài khoản retry, tài khoản gần quota và nhiều render lỗi. Caddy chặn operator API từ domain công khai; Prometheus truy cập qua mạng nội bộ. Prometheus UI chỉ bind localhost.

Rules hiển thị trạng thái firing trong Prometheus. Có thể dùng Alertmanager riêng, hoặc bật bộ cảnh báo email tích hợp dưới đây. Không cần cài thêm dịch vụ cho cách tích hợp.

### Cảnh báo email với Brevo hiện có

Trên **Render → little-days-api → Environment**, thêm đúng hai biến, sau khi deploy bản mã mới:

```dotenv
OPS_ALERT_ENABLED=true
OPS_ALERT_EMAIL=email-cua-ban@example.com
```

Thay địa chỉ mẫu bằng email nhận cảnh báo của người vận hành. Giữ nguyên `MAIL_DRIVER=brevo`, `BREVO_API_KEY`, `MAIL_FROM` đã hoạt động. Không thêm file `.env`, không đặt email vận hành vào frontend. Khi chưa cấu hình, tính năng mặc định tắt và không gửi mail.

API kiểm tra mỗi phút. Một tập cảnh báo phải ổn định ít nhất hai phút mới gửi; tối đa một lần thử gửi mỗi giờ cho một địa chỉ nhận. Chỉ gửi khi tập cảnh báo thay đổi, có thông báo phục hồi khi các điều kiện hết lỗi. Bao gồm queue chờ trên 10 phút, cleanup retry, tài khoản vượt 90% quota và ít nhất ba render lỗi/24h. Worker không heartbeat chỉ tạo cảnh báo khi có video queued/running, phù hợp worker local được bật khi cần.

`ops_notifications` lưu trạng thái/lease trên database chung để các tiến trình không gửi cùng cảnh báo và restart không gửi lại. Địa chỉ người nhận chỉ ở biến môi trường; khóa dòng là SHA-256 của địa chỉ. Nội dung thư/log không gồm email khách hàng, ảnh, chữ scrapbook, owner hoặc job ID. Trạng thái thông báo mới nhất có trong `/api/ops/status` dưới `notifications` và chỉ đọc được bằng operator token.

```powershell
# Kiểm tra một lần với cùng database/mail cấu hình; gửi nếu đủ điều kiện:
npm run ops:monitor

# Chỉ dùng khi đã kiểm tra provider; có thể gửi trùng nếu lần trước thực tế đã nhận:
npm run ops:monitor -- --retry-uncertain
```

Lần thử được ghi trước khi gọi provider. Nếu bị từ chối xác định, trạng thái là `failed`; timeout/mất kết nối hoặc tiến trình dừng giữa lúc gửi là `unknown`. Không tự gửi lại cùng tập cảnh báo. Sau khi sửa cấu hình, lệnh retry chủ động vẫn tuân thủ grace/cooldown. `accepted` nghĩa provider nhận yêu cầu, chưa xác nhận vào inbox. Việc kiểm thử tự động chỉ dùng mailer giả hoặc hộp thư local, không gửi email thật.

Bộ tích hợp chạy cùng API nên ngừng kiểm tra khi API dừng hoặc ngủ. Nó không phát hiện được chính API đang mất kết nối; nếu cần giám sát uptime độc lập phải cấu hình hệ thống bên ngoài. Không có worker cloud hoặc cơ chế giữ Render thức được thêm ở bước này. Cảnh báo chỉ lưu trạng thái vận hành, không thay thế backup dữ liệu.

Tham chiếu cấu hình: [Prometheus configuration](https://prometheus.io/docs/prometheus/latest/configuration/configuration/), [alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/).

## Backup và phục hồi

**Render + Neon + Cloudinary:** dùng [SCHEDULED_BACKUP.md](SCHEDULED_BACKUP.md) để bật GitHub Actions backup mã hóa lúc 03:37 giờ Việt Nam, không cần worker cloud. Mặc định lịch tắt đến khi cấu hình secrets/variables. `/api/ops/status` có `backupInProgress`; bộ email không báo worker/queue mất heartbeat trong lúc lấy bản sao. Backup systemd bên dưới dành cho VPS và vẫn yêu cầu cửa sổ bảo trì offline.

Backup mới giữ rolling export counter; không lưu auth token ngắn hạn, operator secret, `.env`, hàng đợi xóa tài khoản, sổ object hoặc metrics render. Media usage được đối soát lại từ dữ liệu phục hồi. Các yêu cầu xóa cần được đối chiếu riêng khi phục hồi backup cũ.

```powershell
# Kiểm tra backup trước, chưa phục hồi:
npm run backup:drill -- --from backups/manual

# Restore sang thư mục thử mới + backup lại để so checksum:
npm run backup:drill -- --from backups/manual --execute

# Liệt kê backup tự động đủ cũ; không xóa:
npm run backup:prune -- --root backups --days 14

# Chỉ xóa archive auto-* cũ, đầy đủ và kiểm chứng checksum:
npm run backup:prune -- --root backups --days 14 --execute
```

Drill mặc định dùng SQLite mới trong `test-results/restore-drill/<UUID>`. Nếu đặt `DRILL_DATABASE_URL`, đó phải là PostgreSQL trống riêng, khác `DATABASE_URL`. Không tự xóa database đích sau drill. Archive thiếu/hỏng, backup thủ công và symlink không bị prune. Chi tiết backup nguồn: [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

`deploy/backup.sh` và cặp systemd service/timer tạo backup mỗi ngày trong cửa sổ bảo trì: dừng API/worker, đợi heartbeat, backup, verify, prune rồi khởi động lại kể cả khi lỗi. Có gián đoạn dịch vụ; chưa có hot backup khi người dùng tiếp tục sửa. Mặc định giữ 14 ngày, chỉ prune sau backup mới verify thành công. Lưu thêm một bản ở đích độc lập và kiểm tra quyền truy cập theo quy trình của hạ tầng.
