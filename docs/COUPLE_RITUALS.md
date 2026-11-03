# Góc chúng mình: câu hỏi mỗi ngày và Lọ điều thương

Cập nhật 03/11/2026. Đường dẫn `/together`, có lối vào ở menu và trang Hôm nay. FE/API dùng capability `coupleRitualsVersion: 1`; frontend không gọi các API mới khi máy chủ chưa hỗ trợ. Không thêm env, dịch vụ trả phí, worker cloud hoặc thư gửi thật.

## Bắt đầu

Hai người đăng nhập, xác minh email và chấp nhận lời mời tại **Dòng thời gian → Chia sẻ dòng thời gian**. Mở **Góc chúng mình**, chọn không gian chung ở đầu trang, rồi chọn **Câu hỏi mỗi ngày** hoặc **Lọ điều thương**. Không gian riêng và album cá nhân không tự xuất hiện tại đây.

## Câu hỏi mỗi ngày

- Mỗi ngày theo giờ Việt Nam có một câu hỏi ổn định trong không gian hai thành viên. Danh mục gồm 60 câu hỏi tự biên soạn, luân phiên; không gọi AI hoặc dịch vụ ngoài.
- Mỗi người viết một câu trả lời tối đa 1.200 ký tự và chọn **Gửi câu trả lời riêng**. Người kia chỉ thấy trạng thái đã gửi, chưa nhận nội dung qua API.
- Có thể rút lại câu trả lời trước khi cùng mở. Khi cả hai đã gửi, server mở hai câu trả lời trong cùng transaction; từ đó không sửa/rút câu trả lời đã công bố.
- Chọn **Lưu thành dấu mốc** để giữ câu hỏi và hai câu trả lời trong timeline chung. Retry hoặc hai người cùng bấm không tạo hai dấu mốc. Có thể mở timeline để thêm ảnh và chỉnh dấu mốc bằng editor dấu mốc hiện có.
- Câu hỏi cũ có lịch sử, phân trang 12 câu; lượt chưa đủ câu trả lời có thể hoàn thành sau nếu thành viên không thay đổi. Không ép chuỗi ngày hoặc phạt ngày bỏ lỡ.
- Hoạt động câu hỏi dành cho đúng hai thành viên; không gian nhiều người vẫn sử dụng được Lọ điều thương.

## Lọ điều thương — quy tắc được người dùng chọn

Mỗi người được gửi nhiều lời nhắn vào bất kỳ lúc nào. Mỗi lần gửi là một lời nhắn độc lập, kể cả khi nội dung giống nhau.

1. Viết lời cảm ơn hoặc chuyện nhỏ, tối đa 1.200 ký tự.
2. Chọn **Cuối tháng này** hoặc **Chọn một ngày**. Form hiển thị ngày cụ thể trước khi gửi; mở lúc 00:00 theo giờ Việt Nam. Cuối tháng là ngày cuối cùng của tháng, không phải ngày đầu tháng sau.
3. Chọn **Bỏ lời thương vào lọ**. Khi gửi, tác giả đồng ý mở sớm; điều này được giải thích ngay trên form. Có thể rút lại sự đồng ý trước khi lời nhắn mở.
4. Người khác chưa thấy nội dung. Lời nhắn chỉ mở khi **đến ngày hẹn HOẶC tất cả thành viên tại thời điểm gửi đã đồng ý mở sớm**. Server kiểm tra ngày, thành viên và biểu quyết; đổi đồng hồ trình duyệt hoặc gửi `openedAt` giả không mở được nội dung.
5. **Rút một điều thương đã mở** chỉ chọn trong các lời đã đến ngày hoặc đã đủ đồng thuận. Rút ngẫu nhiên không phải cách vượt điều kiện mở; có thể rút lại một lời đã xem trước đó.

Tác giả luôn xem được lời mình viết và là người duy nhất được xóa lời đó, với popup xác nhận trong ứng dụng. Xóa không thu hồi được bản người khác đã đọc/tải trước đó. Không sửa ngày hay nội dung của lời đã gửi để tránh thay đổi điều kiện mở mà người khác không biết; muốn thay đổi, tác giả xóa và gửi một lời mới.

## Quyền, thành viên và dữ liệu

- Danh sách người tham gia được chốt theo từng lượt/lời nhắn. Thành viên mới không nhận nội dung cũ; người bị thu hồi/rời không gian bị chặn ở request tiếp theo.
- Đổi thành viên hoặc mời lại tạo phạm vi đồng thuận mới. Câu hỏi kín cũ không tự mở; người còn quyền vẫn xem/rút câu trả lời của chính mình. Lời trong lọ không được biểu quyết sớm khi nhóm đã thay đổi, nhưng vẫn mở đúng ngày cho người tham gia ban đầu còn quyền truy cập.
- Chỉ lưu câu hỏi thành dấu mốc khi đã mở và thành viên không đổi. Dấu mốc sau khi tạo theo quyền timeline chung hiện có, khác với phạm vi kín ban đầu của câu hỏi.
- Câu trả lời/lời trong lọ gốc thuộc người viết; khi xóa tài khoản, các record đóng góp này của người đó bị xóa ngay. Bản đã chủ động lưu thành dấu mốc theo chính sách dữ liệu chung của timeline, không tự xóa bản sao trong timeline của người khác. Khi xóa tài khoản neo không gian, các câu trả lời/lời trong lọ thuộc không gian đó cũng được dọn dù tác giả là thành viên khác. Không tự chuyển sở hữu không gian.
- `couple-round`, `couple-answer`, `love-note` nằm trong repository chung và backup/restore hiện có. Không tạo ảnh/media mới hoặc thay storage. Lịch sử giữ tối đa 2.000 lượt hỏi/không gian, 2.000 câu trả lời/tài khoản; lọ tối đa 500 lời/tài khoản và 1.000 lời/không gian. Không giới hạn một lời mỗi ngày; không tự xóa lời đã giữ theo thời gian.

## Bản nháp và xử lý lỗi

Bản đang viết được khôi phục trong vòng bảy ngày trên thiết bị theo tài khoản/không gian/câu hỏi. Đăng xuất, xóa tài khoản hoặc mất quyền không gian xóa bản nháp tương ứng. Không dùng bản nháp làm cache câu trả lời của người khác; nội dung kín luôn do server quyết định trả về. Mã gửi lời vào lọ được giữ cùng bản nháp để retry sau mất phản hồi/reload không nhân đôi; một lần gửi mới thành công dùng mã mới.

Không tự refresh khi đang gõ trong textarea. Nếu gửi câu trả lời qua mốc nửa đêm, server vẫn nhận đúng câu hỏi gốc trong hạn bảy ngày khi thành viên không đổi; không gán nội dung vào câu hỏi mới.

Xung đột revision không tự ghi đè. Form giữ bản đang nhập và thông báo để người dùng kiểm tra rồi gửi lại. Trang có loading/error/empty state riêng; phản hồi cũ không được cập nhật khi đã đổi không gian. Cập nhật trạng thái khi quay lại trang và mỗi 30 giây khi đang xem; đây chưa phải cộng tác qua WebSocket.

## Danh mục trang trí

Tile trang trí dùng khung ảnh và padding đồng nhất. Thumbnail cắt khoảng trong suốt của SVG rồi căn giữa trong cache tối đa 64 ảnh mẫu; không xử lý ảnh người dùng, không upload và không thay SVG gốc. Bộ đếm xem trước tự co theo cả chiều ngang và cao thay vì dùng một tỉ lệ cố định cho mọi kiểu. Canvas/viewer/MP4 và tài liệu 720 × 900 giữ artwork/kích thước gốc.

## Kiểm chứng

`tests/couple-rituals.test.ts` kiểm tra nội dung kín trên response, retry/CAS/rollback, đồng thuận, ngày mở theo giờ server, phân trang/quota, thay thành viên và xóa tài khoản. Bộ PostgreSQL QA chạy cùng các test này; không dùng Neon thật. Suite `node --import tsx scripts/pilot-qa.ts couple-rituals` dùng hai tài khoản giả tại 1600/390/320px, kiểm tra IME/bản nháp, lưu dấu mốc, nhiều lần gửi, mở sớm, rút ngẫu nhiên, popup xóa, thu hồi quyền và vùng ảnh thật trong thumbnail.

CI/deploy và dữ liệu thật phải được xác nhận riêng khi bàn giao; kiểm thử tự động không là pilot người thật.

Kết quả local 03/11/2026: 140 unit đạt; API và PostgreSQL/API/load/backup đạt, sau đó các ca mới được kiểm tra lại trên schema PostgreSQL riêng (9 đạt, 1 ca backup SQLite được bỏ qua có lý do). Suite Góc chúng mình đạt tại 1600/390/320px, gồm mất phản hồi rồi reload/gửi lại không nhân đôi. Các suite hồi quy design, shared-plans và journal đạt; typecheck, build, production smoke và format đạt. Container/service QA do agent tạo đã được dọn; không gửi mail thật hoặc dùng database/ảnh người dùng thật.

