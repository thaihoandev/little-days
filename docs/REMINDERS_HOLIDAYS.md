# Lời nhắc và ngày lễ trên lịch — đợt 2

## Người dùng sử dụng thế nào?

- Bấm icon **chuông trên thẻ dấu mốc/kỉ niệm** để chọn nhắc đúng ngày hoặc trước 1, 3, 7 ngày. Mỗi người có lời nhắc riêng, kể cả với dấu mốc trên timeline cộng tác. Tối đa 100 lời nhắc/tài khoản.
- Chuông ở đầu trang mở **Thông báo / Lời nhắc / Cài đặt**. Có trạng thái chưa đọc, đánh dấu tất cả đã đọc, sửa/xóa lời nhắc và mở đúng ngày trên lịch. Trang Hôm nay hiển thị tối đa ba thông báo chưa đọc cần chú ý.
- Cài đặt giờ bắt đầu nhắc và múi giờ, mặc định 09:00 `Asia/Ho_Chi_Minh`. Thông báo trong app được tạo khi mở trang sau giờ đó; không phải push notification của hệ điều hành. Khi trang đang mở, chuông kiểm tra lại mỗi phút và khi cửa sổ nhận focus.
- Email mặc định tắt. Để nhận thư, cần email tài khoản đã xác minh, bật **Tôi muốn nhận email cho những lời nhắc đã chọn**, đồng thời chọn **Nhận thêm email** tại từng lời nhắc. Quản trị viên còn phải bật lịch tự động bên dưới.
- Dấu mốc lặp hằng năm theo lịch hiện có; ngày 29/2 rơi vào 28/2 trong năm không nhuận. Kỉ niệm album và ngày bắt đầu của sổ cũng có icon tạo lời nhắc. Nội dung trong sổ không tự bị thay đổi.
- Email chỉ chứa lời nhắc chung, ngày và liên kết về lịch riêng tư; không chứa tên dấu mốc, ghi chú hoặc ảnh. `Email đã được dịch vụ tiếp nhận` không bảo đảm thư đã tới hộp thư đến.

## Ngày lễ và các dịp được gợi ý

| Nhóm | Các dịp |
| --- | --- |
| Ngày lễ trên lịch | Tết Dương lịch, mùng 1 Tết Nguyên đán, Giỗ Tổ Hùng Vương, 30/4, 1/5, Quốc khánh 2/9 |
| Dịp truyền thống | Giao thừa, mùng 2–3 Tết, Rằm tháng Giêng, Đoan Ngọ, Thất Tịch, Vu Lan, Trung thu, Ông Công Ông Táo |
| Dịp kỷ niệm phổ biến tại Việt Nam | Valentine, 8/3, 1/6, Ngày Gia đình Việt Nam 28/6, 20/10, Halloween, 20/11, đêm Giáng sinh, Giáng sinh, đêm cuối năm |

Mỗi dịp có icon, tên, nhóm và gợi ý chuẩn bị. Bấm ngày để xem tên đầy đủ, bấm **Lên kế hoạch** để mở form có sẵn tiêu đề/ngày/ghi chú; người dùng phải lưu mới tạo dấu mốc của mình. Ngày lễ không tự tạo lời nhắc hoặc gửi email. Có thể ẩn toàn bộ gợi ý lễ tại Chuông → Cài đặt, không làm mất kế hoạch đã lưu.

Kế hoạch tạo từ ngày lễ mặc định dành cho một ngày cụ thể trong năm đã chọn. Tùy chọn lặp hằng năm của dấu mốc vẫn là lặp ngày dương lịch; với Tết hoặc lễ âm lịch, tạo kế hoạch từ lịch năm tiếp theo để lấy đúng ngày, không tự coi ngày dương đã lưu là lịch âm lặp lại.

Ngày âm lịch được tính ở API bằng `CalendarVietnamese` của `date-chinese`, dùng múi giờ Việt Nam; không gửi thư viện thiên văn xuống browser. Kết quả công khai được cache tối đa tám năm ở server/client. Lịch hỗ trợ khoảng năm 1900–2200; danh sách là các dịp hiện đại để lên kế hoạch, không phải hồ sơ lịch sử chế độ nghỉ phép.

Nhãn `Dịp kỷ niệm` không có nghĩa được nghỉ làm. Không suy diễn ngày nghỉ bù, ngày nghỉ thêm liền kề Quốc khánh hoặc lịch nghỉ dài của từng cơ quan. Ví dụ [thông báo nghỉ Tết/Quốc khánh năm 2026](https://baochinhphu.vn/bo-noi-vu-thong-bao-lich-nghi-tet-am-lich-va-nghi-le-quoc-khanh-nam-2026-102251017095507785.htm) còn phân biệt lịch áp dụng cho công chức và lựa chọn của đơn vị sử dụng lao động.

## Bật email theo lịch trên Render + GitHub Actions

Lịch và thông báo trong app hoạt động ngay sau khi deploy FE/API cùng phiên bản. Chỉ email chủ động khi người dùng đóng trang mới cần các bước này. Không cần máy cá nhân, worker MP4, VPS hoặc dịch vụ mới; vẫn dùng Brevo HTTPS đã cấu hình. GitHub Actions phụ thuộc quota/chính sách tài khoản, không phải cam kết chạy đúng phút.

1. Tạo token riêng trên máy bằng lệnh dưới đây; tự copy giá trị, không gửi token vào chat hoặc commit:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Render → **little-days-api → Environment**: thêm `REMINDER_CRON_TOKEN` bằng token vừa tạo, lưu và deploy bản mới. Giữ nguyên `MAIL_DRIVER=brevo`, `BREVO_API_KEY`, `MAIL_FROM` và `APP_ORIGIN` của Vercel. Token phải có 32–256 ký tự chữ/số/`_`/`-`. Không thêm token vào Vercel hoặc biến `VITE_*`.
3. GitHub repo → **Settings → Secrets and variables → Actions**:

   | Loại | Tên | Giá trị |
   | --- | --- | --- |
   | Repository secret | `REMINDER_CRON_TOKEN` | Cùng token với Render |
   | Repository variable | `REMINDER_API_ORIGIN` | `https://little-days-api.onrender.com` |
   | Repository variable | `REMINDERS_SCHEDULE_ENABLED` | `true` |

4. GitHub → **Actions → Anniversary reminders → Run workflow** trên `main`. Run xanh trả số `processed`, `attempted`, `busy`; không in email/nội dung riêng tư/token. Nếu chưa có lời nhắc đến hạn hoặc chưa opt-in, `attempted: 0` là bình thường. Lượt chạy này có thể gửi thư thật cho các lời nhắc người dùng đã chủ động bật; không bật email chỉ để thử khi chưa muốn nhận thư.
5. Vào Chuông → Cài đặt: hết thông báo chờ cấu hình/chưa chạy lần đầu. Nếu hơn 26 giờ chưa chạy lại, app hiện nhắc quản trị viên kiểm tra Actions. Giữ workflow có quyền chạy trong repo và kiểm tra run lỗi ở GitHub.

Workflow `.github/workflows/reminders.yml` mặc định **chưa chạy** khi variable bật lịch chưa được đặt. Cron `17 * * * *` kiểm tra mỗi giờ tại phút 17 UTC; sau giờ nhắc cá nhân, thư có thể tới muộn trong ngày do Render cold start hoặc GitHub trì hoãn. [GitHub ghi rõ lịch có thể bị trì hoãn/bỏ lượt, chạy trên nhánh mặc định và có thể bị vô hiệu hóa sau 60 ngày repo công khai không hoạt động](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Không hứa hẹn chính xác 09:00 hoặc backfill những ngày đã qua khi hệ thống ngừng hoạt động.

`npm run reminders:run` dùng hai biến trên, không tự đọc `.env`; tránh chạy thủ công vào production để QA. Scheduler gọi `POST /api/reminder-cron` với Bearer token riêng, không cần phiên đăng nhập/cookie, không chuyển hướng tới host khác. Thiếu cấu hình trả 503; token sai trả 401. Đổi token cần cập nhật cả Render và GitHub secret.

Để dừng email tự động: đặt variable `REMINDERS_SCHEDULE_ENABLED=false` hoặc disable workflow. Để vô hiệu hóa cả quyền gọi endpoint, xóa token ở Render và deploy lại. Thông báo trong app vẫn hoạt động. Mỗi người cũng có thể tắt email toàn cục hoặc tắt/xóa từng lời nhắc.

## Dữ liệu, quyền và chống trùng

- Dùng bảng `records` hiện có, các kind: `reminder-preferences`, `reminder-rule`, `reminder-notification`, `reminder-email-receipt`, `reminder-view-state`, `reminder-scheduler`; không tạo bảng người dùng mới. Account vẫn là record `account` và session hiện có.
- Settings/rule dùng revision/CAS. Quyền truy cập nguồn được kiểm tra lại khi đọc thông báo và trước khi gửi; thu hồi lời mời, đổi ngày, tắt/xóa nguồn hoặc đưa vào thùng rác ngừng nhắc tương ứng. Một lượt mời mới không tự bật lại lời nhắc của lượt chia sẻ đã bị thu hồi: người dùng cần lưu lại.
- Thông báo chỉ giữ tối đa 200 mục hiển thị/tài khoản. Dấu ghi nhận đã thử gửi email tách riêng và giữ tới khi xóa tài khoản để dọn lịch sử, restart hoặc xóa/tạo lại cùng lời nhắc không gửi trùng cho cùng ngày/lần nhắc/quyền chia sẻ.
- Trạng thái thử gửi được lưu trước khi gọi provider. Lỗi không rõ provider đã nhận hay chưa được ghi `unknown`; lỗi từ chối rõ ràng ghi `failed`. Không tự thử gửi lại trường hợp này để tránh thư trùng; trung tâm thông báo vẫn hiển thị trạng thái. Đây là lựa chọn ưu tiên không lặp thư, không phải bảo đảm giao thư đúng một lần.
- Cron có lease toàn cục 120 giây, khóa/fencing cho SQLite/PostgreSQL, tối đa 100 rule/lượt, 5 lần thử gửi/lượt, ngân sách xử lý 30 giây cộng thời gian request mail đang thực hiện. Cursor tiếp tục lượt sau; phù hợp quy mô cá nhân hiện tại. Nhiều tài khoản có thể phải chờ nhiều lượt; cần đo và nâng thiết kế trước khi hứa SLA lớn hơn.
- Backup/restore hiện có bao gồm các record này và dấu chống gửi trùng. Xóa tài khoản dọn rule, thiết lập, thông báo và receipt của chủ tài khoản, đồng thời dọn lời nhắc phụ thuộc timeline của họ ở tài khoản cộng tác. Không thêm secret vào payload người dùng/response.

## Kiểm chứng

- `tests/reminders-holidays.test.ts`: ngày âm lịch/biểu tượng, múi giờ và DST, CAS/quyền riêng tư, opt-in, hai scheduler cạnh tranh, gửi không trùng qua restart/dọn thông báo, lỗi provider, thu hồi/mời lại, sửa ngày/thùng rác/tắt, giới hạn batch, backup/restore và xóa tài khoản.
- `node --import tsx scripts/pilot-qa.ts reminders-holidays`: desktop/mobile, chuông/read state/deep link, chọn lời nhắc, email fixture local, token sai, tạo kế hoạch Giáng sinh, ẩn lễ vẫn giữ kế hoạch sau reload, popup xóa và không tràn ngang. Không gửi Brevo thật.
- Suite mới nằm trong `test:pilot` và `test:postgres`; typecheck/build/production/API tiếp tục qua CI. Không đồng nhất kiểm thử fixture với cấu hình cron production đã bật.

Kiểm tra local ngày 02/11/2026: 119 unit đã đạt; tám test lời nhắc/ngày lễ đạt trên SQLite và PostgreSQL (gồm receipt của thành viên bị dọn khi chủ timeline xóa tài khoản); API, typecheck, build, production smoke, bộ PostgreSQL/API/load/backup và backup theo lịch đều đạt bằng fixture. Toàn bộ 20 suite UI hồi quy đã đạt, gồm desktop/mobile và xuất MP4 thật từ dữ liệu giả. UI mới đã được xem trên desktop 1600px và mobile 390px. Trạng thái CI/deploy cần đối chiếu đúng commit phát hành, không suy ra từ kết quả local.

Nguồn kỹ thuật: [date-chinese và giấy phép MIT](https://github.com/commenthol/date-chinese), [CalendarVietnamese với múi giờ Việt Nam](https://github.com/commenthol/date-chinese/blob/master/src/Vietnamese.js). Inventory/notices của `date-chinese` và `astronomia` được cập nhật trong `licenses/`.
