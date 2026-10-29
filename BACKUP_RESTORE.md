# Lịch sử phiên bản và backup/restore

## Khôi phục một album bằng giao diện

1. Mở album, bấm biểu tượng **Lịch sử phiên bản** cạnh nút hoàn tác/làm lại.
2. Nếu đang có chỉnh sửa, ứng dụng lưu xong trước khi mở lịch sử. Xung đột revision phải được giải quyết trước.
3. Chọn phiên bản để xem trước từng trang. Có thể đặt tên và **Lưu mốc hiện tại** trước khi thay đổi lớn.
4. Bấm **Khôi phục bản…**, kiểm tra thông báo rồi **Xác nhận khôi phục**.
5. Bản khôi phục có revision mới. Bản ngay trước đó vẫn nằm trong lịch sử; chọn bản đó để quay lại.

Mỗi album giữ **50 revision gần nhất**, gồm cả mốc có tên. Mốc có tên không được ghim vĩnh viễn. Các lần upload ảnh cũng tăng revision và giữ lại bản trước. Lịch sử chỉ bắt đầu ghi từ khi tính năng này được triển khai; không thể tạo lại các bản đã bị sửa trước đó.

Khôi phục nội dung album gồm trang, chữ, layout, tên hai người, ngày bắt đầu, theme và kỉ niệm. Thư viện ảnh hiện tại được giữ lại. Thư viện nhạc và tùy chọn video là tài nguyên riêng, không bị thay đổi bởi thao tác này. Các video đã xuất và tác vụ đang chạy vẫn dùng snapshot ban đầu của chúng.

Lưu lịch sử và cập nhật album chạy trong cùng câu lệnh database qua trigger: nếu ghi lịch sử thất bại, cập nhật album cũng thất bại. Restore dùng expectedRevision, không ghi đè thay đổi mới từ phiên khác. Sau restore, undo/redo trong trình duyệt được đặt lại; dùng lịch sử server để quay về bản trước.

## Tạo backup toàn bộ dữ liệu

Backup dành cho người vận hành ứng dụng, không nằm trong giao diện người dùng.

1. Đợi các video xuất xong hoặc hủy chúng.
2. Dừng API và toàn bộ worker. Lệnh sẽ từ chối nếu còn heartbeat worker mới hoặc job chưa kết thúc. API chưa có maintenance lock, vì vậy vẫn cần tự dừng API để tránh dữ liệu đổi trong lúc sao lưu.
3. Chạy trong thư mục dự án, với cấu hình database/storage hiện tại:

```powershell
npm run backup:create
```

Lệnh tạo thư mục mới trong `backups/` và in đường dẫn. Hoặc đặt đường dẫn cụ thể chưa tồn tại:

```powershell
npm run backup:create -- --out backups/manual-2026-10-29
npm run backup:verify -- --from backups/manual-2026-10-29
```

Backup gồm:

- Database logic: album, tài khoản/phiên đăng nhập, kỉ niệm, mẫu cá nhân, cấu hình video, lịch sử phiên bản, link chia sẻ và lịch sử export.
- Ảnh, nhạc và video hoàn tất được database tham chiếu, tải qua adapter local/S3/Cloudinary.
- Manifest SHA-256 và kích thước từng file. `manifest.json` chỉ xuất hiện khi ghi backup thành công; thư mục thiếu manifest là backup chưa hoàn tất.

Không đưa `.env`, API secret, hộp thư development local, token xác minh/reset tạm, rate-limit, tiến trình worker, cache hay file staging vào backup. Các token/rate-limit cũ ở database đích được xóa trong transaction restore; cần yêu cầu link xác minh/reset mới sau phục hồi. Dữ liệu tài khoản và media cá nhân vẫn là dữ liệu riêng tư: giữ thư mục backup ở nơi chỉ người vận hành được truy cập. `backups/` được loại khỏi Git và Docker build context; chỉ thư mục backup mặc định này được ignore tự động.

Backup hiện không nén/mã hóa và chưa tự chạy theo lịch. `database.json` được giới hạn 512 MB; media được stream riêng. Không chạy đồng thời nhiều lệnh restore hoặc khởi động dịch vụ giữa quá trình restore.

## Restore vào bộ dữ liệu mới

Lệnh không hỗ trợ ghi đè database đang có dữ liệu. Kiểm tra file trước:

```powershell
npm run backup:verify -- --from backups/manual-2026-10-29
```

Ví dụ phục hồi SQLite và media local vào thư mục mới. Các biến PowerShell dưới đây chỉ có hiệu lực trong terminal hiện tại, không sửa `.env`:

```powershell
$env:DATA_DIR='data-restored'
$env:DATABASE_URL=''
$env:STORAGE_DRIVER='local'

# Chỉ kiểm tra backup và database đích, chưa copy media hoặc nhập bản ghi:
npm run backup:restore -- --from backups/manual-2026-10-29

# Thực hiện phục hồi:
npm run backup:restore -- --from backups/manual-2026-10-29 --execute

# Chạy ứng dụng trên bộ dữ liệu vừa phục hồi:
npm run dev
```

Trong chế độ kiểm tra, schema database đích có thể được khởi tạo nhưng không nhập dữ liệu người dùng hoặc gọi cloud storage. Chỉ đổi cấu hình `.env` lâu dài sau khi đã kiểm tra bộ dữ liệu phục hồi bằng giao diện. Giữ nguyên dữ liệu nguồn và backup để có thể quay lại.

Muốn phục hồi vào PostgreSQL, đặt `DATABASE_URL` tới database mới, trống. Muốn dùng Cloudinary, đặt `STORAGE_DRIVER=cloudinary` cùng credentials hiện có và nên chọn `CLOUDINARY_FOLDER` riêng; S3 dùng bucket/prefix riêng qua `S3_PREFIX`. Media chỉ được bỏ qua khi file đích có checksum giống hệt; khác nội dung thì lệnh từ chối ghi đè.

Media được copy và kiểm tra trước khi nhập database. Toàn bộ bản ghi được nhập trong một transaction. Nếu bị ngắt giữa chừng trước khi transaction thành công, có thể còn media ở đích; chạy lại với database vẫn trống sẽ kiểm tra và dùng lại các file giống checksum. Không tự xóa file đang có ở đích.

Sau restore cần kiểm tra: đăng nhập/phiên khách, mở album, lịch sử và khôi phục phiên bản, ảnh/nhạc, link chia sẻ, tải video đã xuất; sau đó mới bật worker. `.env`, domain, HTTPS và lịch backup không được khôi phục tự động.

## Kiểm thử

Backup/restore từ chối chạy khi có yêu cầu xóa tài khoản chưa hoàn tất hoặc upload/email đang xử lý. Đợi hàng đợi xóa hoàn tất trước khi dừng dịch vụ và backup. Xem [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md) để kiểm tra trạng thái.

Backup cũ không được tự động sửa/xóa khi tài khoản yêu cầu xóa. Restore vào database mới có thể đưa tài khoản đó trở lại; cần đối chiếu yêu cầu xóa và áp dụng chính sách lưu trữ trước khi mở dịch vụ. Backup không chứa hàng đợi xóa, sổ media hoặc dấu chặn tài khoản; đừng dùng nó làm nhật ký yêu cầu xóa.

```powershell
npm test
npm run test:api
npm run test:backup

# Cần web/API đang chạy:
npm run test:history-ui
```

`test:backup` dùng SQLite và Cloudinary HTTP fixture: backup local, restore vào database/storage khác, backup lại từ cloud fixture, kiểm tra checksum, từ chối database không trống và xác minh lại quyền tải media/lịch sử/share qua API. Video ở bài kiểm thử này được xem như dữ liệu nhị phân; kiểm thử render MP4 thực tế nằm trong `test:video`.

Trigger/transaction, history và backup/restore đã được kiểm chứng trên PostgreSQL 17 thật trong QA; nguồn PostgreSQL được phục hồi vào PostgreSQL riêng và container QA cũng kiểm tra PostgreSQL → SQLite. Hạ tầng triển khai vẫn cần restore drill riêng.

Backup mới giữ counter xuất video trong cửa sổ 24 giờ. Counter không có trong backup cũ được xem là rỗng rồi đối soát từ các job còn lại khi khởi động. Xem [OPERATIONS.md](OPERATIONS.md) về `backup:drill`, prune có dry-run và lịch backup trong cửa sổ bảo trì.
