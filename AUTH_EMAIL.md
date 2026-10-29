# Tài khoản, xác minh email và khôi phục mật khẩu

Xóa tài khoản vĩnh viễn đã có trong **Tài khoản → Xóa tài khoản**: xác nhận mật khẩu, câu xác nhận và thu hồi phiên/link ngay trước khi dọn dữ liệu nền. Xem [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md) về phạm vi, retry và backup cũ.

## Các luồng trên giao diện

- **Đăng ký** trong Tài khoản giữ lại album của phiên khách hiện tại, đăng nhập và gửi email xác minh.
- **Tài khoản → Gửi lại email xác minh** gửi liên kết mới tới email đã đăng ký. Mở liên kết rồi bấm **Xác minh email**; thao tác không tự đăng nhập tài khoản từ liên kết.
- **Tài khoản → Đổi mật khẩu** yêu cầu mật khẩu hiện tại và xác nhận mật khẩu mới. Phiên đang thao tác được cấp cookie mới; các phiên khác phải đăng nhập lại.
- **Đăng nhập → Quên mật khẩu?** gửi liên kết đặt lại. Mở email, nhập/xác nhận mật khẩu mới, sau đó đăng nhập lại. Album vẫn thuộc tài khoản cũ, không chuyển sang phiên khách khác.

Mật khẩu dài 10–200 ký tự. Xác minh email hiện là trạng thái tài khoản; chưa khóa chức năng album hoặc đăng nhập đối với email chưa xác minh, để các tài khoản đã có tiếp tục dùng được. Chưa có đăng nhập magic link, thay đổi email hay xóa tài khoản trong phần triển khai này.

## Chạy thử không cần SMTP

Trong development, nếu `.env` chưa có `MAIL_DRIVER`, ứng dụng mặc định ghi email vào `DATA_DIR/mail/`. File không được đưa ra bằng API hoặc phục vụ như tài nguyên web. Không sửa `.env` hiện tại để bật mặc định này.

```powershell
npm run dev

# Terminal khác, cùng thư mục dự án và DATA_DIR:
npm run mail:outbox
npm run mail:outbox -- --latest
```

Lệnh đầu liệt kê metadata; `--latest` in nội dung thư mới nhất, gồm link để mở trên trình duyệt. Có thể chọn thư bằng `--id <id-từ-danh-sách>`. Hộp thư này chỉ dành cho phát triển, người vận hành được đọc các liên kết. Không sử dụng nó làm dịch vụ email cho người dùng thật.

Không gửi được email xác minh không làm mất tài khoản vừa tạo: giao diện thông báo và cho gửi lại trong Tài khoản.

## Cấu hình email thật

Thêm hoặc cập nhật các biến trong `.env` theo dịch vụ SMTP bạn sử dụng; các tên biến cũng có trong `.env.example`. Không đưa chúng vào biến có tiền tố `VITE_`.

```dotenv
MAIL_DRIVER=smtp
MAIL_FROM=Little Days <noreply@example.com>
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
APP_ORIGIN=https://your-app.example
```

Điền sender đã được nhà cung cấp chấp nhận, host, tài khoản và mật khẩu SMTP. Cổng 587 với `SMTP_SECURE=false` **bắt buộc STARTTLS** trước khi đăng nhập/gửi thư. Nếu nhà cung cấp dùng TLS trực tiếp ở cổng 465, đặt `SMTP_PORT=465` và `SMTP_SECURE=true`. Không có chế độ hạ xuống SMTP không mã hóa và không tắt kiểm tra chứng chỉ TLS.

`APP_ORIGIN` phải là origin frontend chính xác, không có path/query/hash. HTTPS được dùng cho domain thật; HTTP chỉ chấp nhận localhost/127.0.0.1/::1. Link được tạo từ cấu hình này, không lấy Host header từ yêu cầu của người dùng.

Khởi động lại API sau khi đổi biến môi trường. Credentials Cloudinary không thay đổi và không liên quan cấu hình email.

Trong production, nếu không cấu hình `MAIL_DRIVER`, email mặc định là `disabled`: ứng dụng vẫn chạy, nhưng yêu cầu gửi email báo chưa khả dụng. Đặt rõ `MAIL_DRIVER=smtp` để gửi thật. `MAIL_DRIVER=local` bị từ chối trong production. Nếu dùng file `.env` tạo mới từ example, cần đổi giá trị `local` trước khi bật `NODE_ENV=production`.

## Liên kết, phiên và giới hạn gửi

- Xác minh email: hạn **24 giờ**. Reset mật khẩu: hạn **15 phút**. Token ngẫu nhiên 256 bit, chỉ lưu hash trong bảng token, chỉ dùng một lần và không dùng lẫn hai mục đích.
- Token nằm trong fragment của link email; giao diện xóa fragment khỏi thanh địa chỉ khi mở. Không có endpoint trả token hoặc đọc hộp thư local qua HTTP.
- Cập nhật tài khoản và đánh dấu dùng token chạy trong cùng transaction. Nếu cập nhật lỗi, token chưa bị tiêu thụ.
- Đổi/reset mật khẩu tăng phiên bản thông tin đăng nhập. Các cookie cũ bị từ chối ở yêu cầu mới; các link reset/xác minh còn chờ thuộc phiên bản mật khẩu cũ cũng không dùng được.
- Câu trả lời yêu cầu quên mật khẩu có cùng nội dung cho email có hoặc không có tài khoản; không trả trạng thái tồn tại hay token trong response.
- Mặc định **30 yêu cầu auth/phút/IP**, cấu hình qua `AUTH_RATE_LIMIT_PER_MINUTE` (1–1000). Mỗi tài khoản tối đa 3 lần gửi xác minh/15 phút; mỗi email tối đa 3 yêu cầu reset/15 phút; đổi mật khẩu tối đa 5 lần/phút/tài khoản. Bộ đếm nằm trong database, giữ qua restart.

API mặc định dùng địa chỉ IP kết nối trực tiếp. Chỉ đặt `TRUST_PROXY_HOPS` thành số proxy tin cậy (0–5) khi triển khai API sau các reverse proxy đã kiểm soát; giữ `0` khi truy cập trực tiếp. Không để client truy cập API trực tiếp rồi tin số hop proxy tùy ý.

Hộp thư local và token/rate-limit tạm không được backup. Khi restore database, trạng thái token/rate-limit cũ ở đích được xóa trong transaction import; người dùng cần yêu cầu link mới. Dữ liệu tài khoản, trạng thái xác minh và phiên bản mật khẩu được giữ trong backup.

## Kiểm thử

```powershell
npm test
npm run test:auth
npm run test:smtp

# Web/API development với MAIL_DRIVER=local và DATA_DIR=test-results/auth-ui-data:
npm run test:auth-ui
```

`test:auth` tự chạy API riêng ở localhost, kiểm tra đăng ký giữ album, xác minh/reset, dùng lại link, mật khẩu cũ/mới, vô hiệu hóa phiên và persistence sau restart. `test:smtp` dùng TLS/SMTP fixture localhost với sender/recipient `.test`; không gửi email tới dịch vụ bên ngoài. Khóa/chứng chỉ trong `tests/fixtures/smtp-test-*` công khai, chỉ dùng cho fixture, không dùng cho triển khai.

`test:auth-ui` dùng Chromium và đọc hộp thư local, không kết nối SMTP. Có thể đổi URL bằng `SMOKE_UI_ORIGIN` và thư mục dữ liệu bằng `AUTH_UI_DATA_DIR`. Đã kiểm tra desktop/mobile, link fragment được xóa, xác minh, đổi/quên/reset, đăng nhập lại và từ chối dùng lại link.

Các kiểm thử cục bộ xác minh SQLite và SMTP/TLS fixture. PostgreSQL có nhánh triển khai và workflow CI riêng; cần kiểm chứng trên database và nhà cung cấp SMTP của môi trường triển khai trước khi phát hành rộng.
