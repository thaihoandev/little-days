# Tài khoản, xác minh email và khôi phục mật khẩu

Xóa tài khoản vĩnh viễn đã có trong **Tài khoản → Xóa tài khoản**: xác nhận mật khẩu, câu xác nhận và thu hồi phiên/link ngay trước khi dọn dữ liệu nền. Xem [ACCOUNT_DELETION.md](ACCOUNT_DELETION.md) về phạm vi, retry và backup cũ.

## Các luồng trên giao diện

- **Đăng ký** trong Tài khoản giữ lại album của phiên khách hiện tại, đăng nhập và gửi email xác minh.
- **Tài khoản → Gửi lại email xác minh** gửi liên kết mới tới email đã đăng ký. Mở liên kết rồi bấm **Xác minh email**; thao tác không tự đăng nhập tài khoản từ liên kết.
- **Tài khoản → Đổi mật khẩu** yêu cầu mật khẩu hiện tại và xác nhận mật khẩu mới. Phiên đang thao tác được cấp cookie mới; các phiên khác phải đăng nhập lại.
- **Đăng nhập → Quên mật khẩu?** gửi liên kết đặt lại. Mở email, nhập/xác nhận mật khẩu mới, sau đó đăng nhập lại. Album vẫn thuộc tài khoản cũ, không chuyển sang phiên khách khác.

Mật khẩu dài 10–200 ký tự. Xác minh email hiện là trạng thái tài khoản; chưa khóa chức năng album hoặc đăng nhập đối với email chưa xác minh, để các tài khoản đã có tiếp tục dùng được. Chưa có magic link hoặc đổi email; xóa tài khoản đã có trong hướng dẫn riêng.

## Bật mail trên Render Free: dùng Brevo HTTPS

Chỉ cập nhật **Render → service API → Environment**. Không cần tạo thêm file `.env`; không cần cấu hình mail cho worker hoặc Vercel frontend.

1. Tạo tài khoản tại [Brevo](https://www.brevo.com/), xác nhận email tài khoản và hoàn tất bước kích hoạt transactional email nếu được yêu cầu.
2. Trong phần **Senders, Domains & Dedicated IPs → Senders**, thêm địa chỉ gửi bạn sở hữu và xác minh bằng mã gửi tới hộp thư. Tên hiển thị có thể là **Little Days**. `MAIL_FROM` phải dùng sender đã được Brevo chấp nhận. Xem [hướng dẫn sender](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email).
3. Trong phần **SMTP & API → API Keys**, tạo API key. Dùng **API key**, không dùng SMTP key. Không gửi khóa vào chat/Git hoặc biến `VITE_*`.
4. Thêm/sửa ba biến sau trên Render, thay phần ví dụ bằng thông tin thật:

```dotenv
MAIL_DRIVER=brevo
BREVO_API_KEY=your-api-key
MAIL_FROM=Little Days <your-verified-sender@example.com>
```

Giữ `APP_ORIGIN` bằng URL HTTPS frontend bạn đang dùng (Render hoặc Vercel), không thêm dấu `/` hoặc path phía sau. Lưu biến và redeploy API sau khi mã nguồn mới đã được cập nhật. Blueprint không ép ghi đè `MAIL_DRIVER` về disabled ở các lần sync sau.

5. Trên web, mở **Tài khoản → Gửi lại email xác minh**, kiểm tra Inbox/Spam, mở liên kết rồi bấm xác minh. Sau đó dùng **Đăng nhập → Quên mật khẩu?** và thử đặt mật khẩu mới trên tài khoản thử. Người sở hữu chủ động thực hiện các thao tác này để kiểm chứng gửi thật; agent chỉ gửi tới fixture localhost trong kiểm thử.

Brevo gửi transactional email qua `https://api.brevo.com/v3/smtp/email`; không cần SMTP port. [API chính thức](https://developers.brevo.com/docs/send-a-transactional-email). Gói Free có giới hạn gửi/ngày, dùng chung với các loại email khác trong tài khoản; xem [giới hạn Brevo Free](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans).

Nếu chưa có domain riêng, làm theo yêu cầu xác minh sender hiện tại của Brevo. Địa chỉ Gmail/Yahoo không thể xác thực domain như domain của chính bạn; Brevo có thể thay phần domain gửi thành `brevosend.com`. Không thể cấu hình domain `onrender.com`/`vercel.app` làm domain email của bạn. [Giải thích của Brevo](https://help.brevo.com/hc/en-us/articles/16045394674066-Troubleshooting-Domain-authentication).

### Khi chưa nhận được thư

API chấp nhận thư chưa đồng nghĩa thư đã vào Inbox. Kiểm tra Transactional Logs của Brevo để xem delivered/bounced/blocked và trạng thái sender/account. Không thêm chức năng public để đọc log thư hoặc trả token reset.

Log Render có event `mail_delivery_accepted` hoặc `mail_delivery_failed`, chỉ chứa provider/mã lỗi, không ghi email, nội dung, token hoặc API key:

| Reason/status | Cần kiểm tra |
| --- | --- |
| `unauthorized`, 401 | API key đúng loại, còn hiệu lực và đã được đặt trên API Render |
| `sender_or_permission`, 403 | Sender đã xác minh, quyền API và tài khoản transactional đã được kích hoạt |
| `rate_limited`, 429 | Hạn mức/tốc độ gửi của provider |
| `provider_error`, 400/5xx | Cấu hình sender/tài khoản hoặc trạng thái dịch vụ; xem dashboard provider |
| `unavailable_or_invalid_response` | Kết nối/timeout/phản hồi provider; thử gửi lại từ UI sau khi kiểm tra |

Gửi HTTP có timeout 15 giây, không theo redirect và không tự gửi lại khi kết quả chưa rõ để tránh thư trùng. Nếu thất bại, token của lần đó được thu hồi. Yêu cầu quên mật khẩu vẫn trả thông báo chung cho tài khoản có/không tồn tại; xem log vận hành để biết gửi bị lỗi. Rate-limit của app vẫn áp dụng.

### Nếu đã có Resend

Có adapter HTTPS tùy chọn `MAIL_DRIVER=resend`, `RESEND_API_KEY` và cùng `MAIL_FROM`. Cần sender/domain hợp lệ theo [hướng dẫn Resend](https://resend.com/docs/api-reference/emails/send-email). Chọn một driver; không tự fallback sang dịch vụ khác nếu gửi lỗi. Phương án đang hướng dẫn cho chủ dự án là Brevo.

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

Phần SMTP bên dưới dành cho máy chủ cho phép các cổng đó. Render Free chặn 25/465/587; dùng Brevo HTTPS ở trên cho triển khai hiện tại.

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

Trong production, nếu không cấu hình `MAIL_DRIVER`, email mặc định là `disabled`: ứng dụng vẫn chạy nhưng yêu cầu gửi mail báo chưa khả dụng. Đặt rõ `brevo`, `resend` hoặc `smtp` theo provider. `MAIL_DRIVER=local` bị từ chối trong production. Nếu dùng file `.env` tạo từ example, đổi giá trị `local` trước khi bật `NODE_ENV=production`.

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
npm run test:mail

# Web/API development với MAIL_DRIVER=local và DATA_DIR=test-results/auth-ui-data:
npm run test:auth-ui
```

`test:auth` tự chạy API riêng ở localhost, kiểm tra đăng ký giữ album, xác minh/reset, dùng lại link, mật khẩu cũ/mới, vô hiệu hóa phiên và persistence sau restart. `test:smtp` dùng TLS/SMTP fixture localhost với sender/recipient `.test`; không gửi email tới dịch vụ bên ngoài. Khóa/chứng chỉ trong `tests/fixtures/smtp-test-*` công khai, chỉ dùng cho fixture, không dùng cho triển khai.

`test:auth-ui` dùng Chromium và đọc hộp thư local, không kết nối SMTP. Có thể đổi URL bằng `SMOKE_UI_ORIGIN` và thư mục dữ liệu bằng `AUTH_UI_DATA_DIR`. Đã kiểm tra desktop/mobile, link fragment được xóa, xác minh, đổi/quên/reset, đăng nhập lại và từ chối dùng lại link.

`test:mail` chạy toàn bộ auth API với Brevo và Resend qua HTTP fixture localhost, key giả và địa chỉ `.test`, không gửi thư thật. Unit test có timeout/abort, lỗi provider/response, chặn redirect, kiểm tra cấu hình và thu hồi token khi gửi lỗi. PostgreSQL đã được kiểm chứng ở bộ QA riêng; tài khoản mail/sender thật vẫn cần được người sở hữu cấu hình và kiểm tra nhận thư trên Render.
