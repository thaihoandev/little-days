# Backup mã hóa theo lịch trên GitHub Actions

Ngày cập nhật: 30/10/2026. Dùng repository hiện có, PostgreSQL Neon và Cloudinary hiện có. Không cần VPS, worker cloud hoặc máy cá nhân chạy ban đêm. Workflow mặc định **chưa bật**; không tạo thêm file `.env`.

## 1. Cập nhật ứng dụng trước

1. Chờ Render deploy commit có tính năng backup này.
2. Tại `https://little-days-api.onrender.com/api/health`, kiểm tra có `backupProtocol: 1`.
3. Cập nhật **worker local hiện tại** bằng mã mới, build và khởi động lại như trước. Đây là cập nhật khả năng tạm nghỉ khi backup, không triển khai worker lên cloud. Nếu không cần xuất video thì có thể dừng worker.

Job từ chối API chưa hỗ trợ backup, worker đang online dùng phiên bản cũ, đích Cloudinary khác fingerprint database, video queued/running, cleanup đang hoạt động hoặc yêu cầu xóa tài khoản chưa hoàn tất. Không tự hủy video hoặc bỏ qua yêu cầu xóa để ép backup.

## 2. Điền GitHub Secrets và Variables

Mở [Settings → Secrets and variables → Actions](https://github.com/thaihoandev/little-days/settings/secrets/actions). Điền tại GitHub, không gửi giá trị secret qua chat và không commit chúng.

**Repository secrets:**

| Tên | Giá trị |
| --- | --- |
| `BACKUP_DATABASE_URL` | Cùng PostgreSQL connection string TLS mà API đang dùng |
| `BACKUP_CLOUDINARY_CLOUD_NAME` | Cùng cloud name của API |
| `BACKUP_CLOUDINARY_API_KEY` | Cùng API key Cloudinary của API |
| `BACKUP_CLOUDINARY_API_SECRET` | Cùng API secret Cloudinary của API |
| `BACKUP_ENCRYPTION_KEY` | Khóa 32 byte ngẫu nhiên dạng hex, 64 ký tự |

Tạo khóa một lần trên terminal của bạn bằng `npm run backup:key`. Lưu khóa trong password manager hoặc nơi riêng an toàn, ngoài GitHub; sau đó nhập vào secret. Không cần chạy lại mỗi ngày. Mất khóa thì không giải mã được archive; đổi khóa chỉ ảnh hưởng các bản tạo sau đó, bản cũ vẫn cần khóa cũ.

**Repository variables** (tab Variables bên cạnh Secrets):

| Tên | Giá trị |
| --- | --- |
| `BACKUP_API_ORIGIN` | `https://little-days-api.onrender.com` |
| `BACKUP_CLOUDINARY_FOLDER` | Chính xác folder API đang dùng; blueprint hiện tại là `little-days-cloud` |
| `BACKUP_SCHEDULE_ENABLED` | `true`, chỉ đặt sau khi hoàn tất bước 1 và secrets |

Không thêm các biến này vào Vercel/frontend. Job không cần khóa Brevo hoặc địa chỉ mail. Secrets chỉ được cấp cho bước backup, không cấp cho bước cài dependencies.

## 3. Chạy thử và bật lịch

Vào [Actions](https://github.com/thaihoandev/little-days/actions) → **Encrypted data backup** → **Run workflow**, chọn `main`. Sau lượt xanh đầu tiên, mở phần Artifacts và tải `little-days-backup-<run_id>` về một nơi riêng để xác minh quy trình khôi phục bên dưới.

Lịch dự kiến mỗi ngày **03:37 giờ Việt Nam** (`20:37 UTC` ngày trước). GitHub có thể chạy trễ hoặc bỏ lượt khi tải cao; public repository không hoạt động 60 ngày có thể bị vô hiệu hóa lịch. Kiểm tra lịch sử Actions và thông báo lỗi workflow. Đây không phải cam kết backup vào đúng phút. [Tài liệu lịch GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Khi cần dừng lịch, đổi `BACKUP_SCHEDULE_ENABLED=false`; không cần sửa source hoặc thu hồi mail đã cấu hình.

## Job làm gì

1. Kiểm tra API/worker và storage target, nhận lease PostgreSQL duy nhất.
2. API tạm trả `503 BACKUP_IN_PROGRESS` với `Retry-After: 15` cho thao tác ghi, tạo phiên và auth. Worker/cleanup tạm ngừng nhận việc mới. Không đóng trình duyệt khi còn thay đổi chưa lưu; đợi backup kết thúc rồi lưu lại nếu giao diện báo lỗi.
3. Giữ SHARE locks trên các bảng snapshot/lifecycle trong khi copy database và media; mọi thao tác xóa media qua API/worker mới phải chờ khóa trước khi chạm storage. Nhờ đó file trong bản sao không bị xóa giữa lúc copy.
4. Mở ghi trở lại ngay sau copy, trước giai đoạn mã hóa/kiểm tra. Lease có TTL 120 giây và được gia hạn; runner bị dừng sẽ tự hết chế độ tạm nghỉ. Kết nối PostgreSQL đóng sẽ nhả table locks.
5. Kiểm manifest SHA-256, đóng gói/mã hóa streaming bằng AES-256-GCM với nonce ngẫu nhiên và header được xác thực.
6. Giải mã vào workspace riêng, kiểm SHA-256, phục hồi vào SQLite trống trên runner rồi backup lại để so sánh database logic và toàn bộ media. Không restore vào Neon đang chạy.
7. Chỉ upload `little-days-backup.enc` sau khi mọi kiểm tra qua. Dọn workspace plaintext/database thử cả khi thất bại. Log chỉ chứa giai đoạn lỗi và thống kê, không in connection string, khóa, email hay nội dung scrapbook.

Giới hạn bản nguồn là **100 MiB** cho database JSON và media; vượt giới hạn thì dừng và không upload archive chưa kiểm chứng. Không bỏ bớt ảnh/video để làm bản backup trông như thành công. GitHub giữ artifact **3 ngày**, kể cả khi các lượt sau thất bại; tải thêm một bản mã hóa ra nơi độc lập nếu cần giữ lâu hơn. Không tự xóa bản tốt trong lượt thất bại, nhưng thời hạn artifact của GitHub vẫn áp dụng.

Workflow dùng runner Linux tiêu chuẩn. Public repo có compute tiêu chuẩn miễn phí, còn storage vẫn có hạn mức tài khoản; GitHub Free hiện công bố 500 MB. Các artifact CI khác cũng dùng quota. Trước khi bật, kiểm tra Billing/Budgets và đặt chặn sử dụng vượt ngân sách để giữ yêu cầu không trả phí. Repository không thể tự xác nhận quota còn lại trên tài khoản của bạn. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [hạn mức theo gói](https://docs.github.com/en/billing/reference/product-usage-included).

## 4. Phục hồi từ artifact

Tải và giải nén ZIP artifact của GitHub để lấy `little-days-backup.enc`. Chỉ file `.enc` được upload; ZIP không chứa khóa hoặc database plaintext.

Trong terminal riêng, đặt khóa của archive vào biến `BACKUP_ENCRYPTION_KEY` của phiên terminal. Không nhập khóa vào command được chia sẻ hoặc commit. Sau đó:

```powershell
# NEW_DIRECTORY phải chưa tồn tại. Sai khóa/file hỏng không công bố bản giải mã.
npm run backup:open -- backups/little-days-backup.enc backups/recovered-2026-10-30

# Kiểm archive đã giải mã, chưa nhập vào app đang chạy:
npm run backup:verify -- --from backups/recovered-2026-10-30

# Drill sang SQLite/media mới trong test-results; không dùng database production:
npm run backup:drill -- --from backups/recovered-2026-10-30 --execute
```

`backup:open` xác thực GCM xong mới tạo thư mục đầu ra, từ chối ghi đè và đường dẫn thoát root. File hợp lệ về mã hóa nhưng sai manifest/checksum vẫn bị từ chối; thư mục giải mã lỗi chưa hoàn tất cần dọn riêng trước khi chạy lại với tên đó. Giữ thư mục plaintext ở nơi riêng tư, không commit hoặc upload nó. Để đưa dữ liệu trở lại ứng dụng, theo quy trình restore đích trống trong [BACKUP_RESTORE.md](BACKUP_RESTORE.md); đối chiếu yêu cầu xóa tài khoản phát sinh sau thời điểm backup trước khi mở dịch vụ.

## Kiểm chứng tự động và giới hạn

`npm test` kiểm tra roundtrip media nhiều MB, sai khóa/tamper, traversal, duplicate paths, giới hạn kích thước và lease fencing. `TEST_DATABASE_URL=... npm run test:scheduled-backup` tạo schema PostgreSQL QA riêng, dùng Cloudinary HTTP fixture, kiểm tra xóa media bị table lock chặn, chạy CLI như workflow và so sánh restore. `test:ops` kiểm tra API trả 503 khi pause và health vẫn đọc được. Các kiểm thử không dùng ảnh, credential hoặc database thật của người dùng. Lượt GitHub/Neon/Cloudinary thật chỉ được xem là hoàn tất sau khi cấu hình và có run thành công thực tế.
