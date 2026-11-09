# Những dấu riêng của Little Days

Phạm vi cập nhật ngày 09/11/2026: lối tắt tách nền, mẫu nổi bật, Story bản đồ, gợi ý recap, PIN thiết bị/WebAuthn, QR kết đôi, trang trí Việt/khung 35mm/nhạc và nhập ZIP cá nhân.

## Sử dụng

- Chọn ảnh đã tải vào sổ → **Tách nền sticker** trên thanh Thiết kế nhanh. Tách nền tự bắt đầu trong cửa sổ chỉnh ảnh, mặc định có viền trắng/bóng nhẹ; bấm Áp dụng để lưu bản mới. Có thể hủy xử lý hoặc đóng mà không thay ảnh gốc. Mô hình vẫn chạy trên thiết bị, lần đầu tải khoảng 56 MB.
- **Tạo album** hoặc thêm trang: Photobooth 4 ô, Dây kẹp gỗ và Cuống vé được xếp trước, có nhãn Nổi bật. Trang vẫn chỉnh ảnh/chữ/bố cục như trước.
- Bản đồ kỉ niệm → Dấu chân Việt Nam → **Xuất ảnh Story (1080×1920)**. Ảnh chứa bản đồ tô màu theo các dấu mốc đang có quyền xem, số tỉnh đã đi và tối đa bốn kỉ niệm gần nhất. Vẫn giữ bản đồ 34 tỉnh thành, Hoàng Sa/Trường Sa minh họa và ghi nguồn hình học. Tệp tải về có thể chứa tên kỉ niệm riêng; chỉ chia sẻ khi bạn chủ động chọn.
- Hôm nay: khi tuần hiện tại có ảnh và đã cuối tuần hoặc có ít nhất ba dấu mốc đủ điều kiện trong không gian chung, hiện **Tạo trang sổ tuần**. Không tính kế hoạch chưa hoàn thành hoặc nội dung riêng. Không tự tạo sổ hoặc gửi thông báo/email mới.
- Trang trí có nhóm **Đời thường Việt** và **Washi lời thương**. Chữ washi là đường nét vector từ Patrick Hand có tiếng Việt, không phụ thuộc font trên máy người xem. Khung **Dải phim 35mm** có lỗ hai cạnh và nhãn khung; hai nhạc nền mới là Bưu thiếp ngày nắng và Chủ nhật bên nhau, đều không lời, tổng hợp bằng mã nguồn dự án.

## Khóa trên thiết bị

Tài khoản → Bảo mật → Khóa ứng dụng trên thiết bị. Đặt PIN bốn số và nhập lại để bật. Muốn tắt phải nhập PIN hiện tại. Có thể đăng ký **Mở khóa thiết bị** nếu trình duyệt hỗ trợ.

Khóa khi mở lại ứng dụng, ẩn tab/chuyển app, quay lại từ back-forward cache hoặc sau hai phút không hoạt động. Nội dung phía sau bị ẩn và không tương tác; nhạc/video HTML được tạm dừng. Sau mở khóa, editor vẫn giữ trạng thái đang làm, không bị unmount chỉ vì khóa.

PIN dùng PBKDF2/SHA-256, 600.000 vòng, salt ngẫu nhiên theo tài khoản/thiết bị. Không lưu PIN thuần hoặc gửi PIN lên API. Sau năm lần sai, thời gian chờ tăng dần từ 30 giây đến 15 phút và được giữ khi tải lại. Quên PIN: trên màn hình khóa chọn **Quên mã PIN?**, nhập mật khẩu tài khoản để xác nhận qua API; máy chủ kiểm tra đúng tài khoản hiện tại và giới hạn sáu lần/15 phút.

Đây là khóa hiển thị cục bộ, không phải mã hóa nội dung hay yếu tố đăng nhập thứ hai. Không bảo vệ trước người có quyền sửa storage/mã JavaScript của trình duyệt hoặc thiết bị bị xâm nhập; PIN bốn số có không gian tìm kiếm nhỏ. Quyền dữ liệu thực tế vẫn do session và API quyết định. Mã trên trình duyệt này không tự đồng bộ sang thiết bị khác.

WebAuthn dùng authenticator nền tảng và `userVerification: required`; kiểm tra challenge, origin, RP ID, cờ UP/UV, chữ ký ES256 và bộ đếm khi có. Hệ điều hành quyết định dùng khuôn mặt, vân tay hay mã khóa thiết bị; Little Days không nhận dữ liệu sinh trắc. Trình duyệt không hỗ trợ hoặc hủy xác thực vẫn dùng PIN. Đây là mở khóa màn hình cục bộ, không đăng ký passkey đăng nhập tài khoản trên server. Tham khảo [giao thức WebAuthn](https://www.w3.org/TR/webauthn-3/).

## QR kết đôi

Dòng thời gian → Chia sẻ dòng thời gian → **Mã QR kết đôi** → Tạo mã. Người nhận dùng camera điện thoại mở liên kết, đăng nhập/xác minh email và bấm **Chấp nhận và cùng viết**. Không cần cấp quyền camera cho Little Days, không tự ghép khi chỉ mở link.

Mã dùng một lần, hết hạn sau 15 phút. Tạo mã mới làm mã trước mất hiệu lực; có nút Thu hồi mã. API lưu hash token; liên kết dùng fragment để token không nằm trong đường dẫn request hoặc Referer. Chỉ người có mã mới xem được thông tin lời mời tối thiểu. Retry của đúng người đã chấp nhận không tạo grant mới, nhưng không khôi phục quyền đã bị thu hồi. Mã có quyền mời vào không gian do người tạo sở hữu; không mở album/không gian riêng hoặc quyền tự mời vào không gian của người khác.

## Khôi phục ZIP

Tài khoản → **Khôi phục dữ liệu từ ZIP** → chọn ZIP gốc từ Mang kỉ niệm theo mình → xem số sổ/dấu mốc/tệp → **Khôi phục vào tài khoản này**. Cần đăng nhập. Không tự gửi dữ liệu lên server ở bước kiểm tra ZIP.

Chỉ nhận định dạng ZIP STORE nguyên gốc do trình xuất hiện tại tạo. Không nén lại, đặt mật khẩu hoặc sửa tệp bên trong. Worker kiểm tra đường dẫn, giới hạn 96 MiB nội dung, 1.500 media, 500 bản ghi, CRC và toàn bộ SHA-256 trước khi cho nhập. Từ chối ZIP nén/ZIP64/chia phần/symlink/đường dẫn vượt thư mục để giới hạn tài nguyên trước khi dùng [JSZip](https://stuk.github.io/jszip/documentation/api_jszip/load_async.html).

Ảnh và nhạc được kiểm tra/chuẩn hóa như tải lên mới. Sổ và dấu mốc được tạo dưới ID mới, chỉ thuộc tài khoản đích; giữ ngày nội dung, bố cục và loại recap, không ghi đè bản gốc. Không nhập quyền cộng tác, link share, session, nội dung lọ kín, lịch sử, thùng rác hoặc nháp thiết bị. Chỉ giữ phân công cho chính tài khoản đích, bỏ phân công cho người khác. Thông tin tuần/không gian nguồn của recap chỉ là metadata, không cấp quyền truy cập hoặc khôi phục membership.

Mỗi bản ghi được công bố nguyên tử sau khi media đủ và quota còn cho phép. CAS/claim theo tài khoản, hash ZIP và bản ghi nguồn ngăn hai lượt đồng thời công bố hai bản sao. Thử lại cùng ZIP bỏ qua kết quả đã hoàn tất, kể cả khi người dùng đã sửa bản sao; bản sao đã xóa không tự được tạo lại. Không gộp hai ảnh nguồn khác nhau chỉ vì cùng bytes.

Nhập theo từng bản ghi, không phải giao dịch cho cả ZIP. Khi lỗi hoặc dừng, các bản ghi trước đã thành công vẫn còn. Một request máy chủ đã nhận có thể hoàn tất sau khi client dừng; thử lại cùng ZIP để đối soát. Giới hạn hiện tại: một request nhập trên mỗi tiến trình API, bộ đệm multipart tổng 96 MiB, tối đa 110 tệp/bản ghi, nhận tệp trong 180 giây và chuẩn bị media trong 180 giây. Tiếp tục giữ MediaStore, quota, backup lock, lease thao tác và xóa tài khoản; không dùng disk tạm làm kho media trên cloud.

## Kiểm chứng và phát hành

Các phép kiểm tra dùng tài khoản, ảnh, mail và storage fixture. Không gửi mail thật hoặc nhập ZIP vào tài khoản production để QA.

- `tests/signature-features.test.ts`: PIN/salt/giới hạn sai, QR/thu hồi/hết hạn/đồng thuận, ZIP checksum/đường dẫn/nén, bản sao riêng, quota, history, retry/CAS/commit không rõ kết quả và nhạc riêng.
- `node --import tsx scripts/pilot-qa.ts signature-features`: luồng thực trên desktop/mobile, tải Story/ZIP, nhập lại, PIN/reset và WebAuthn bằng authenticator giả lập. Không tương đương nghiệm thu Face ID hoặc Safari/iPhone thật.
- `weekly-experience`: PNG và MP4 có các khung ảnh, nhạc piano mới, viewer/thiệp và quyền chia sẻ. `background-removal`: mô hình AI và lưu cutout thực bằng fixture.
- Runner PostgreSQL có thêm unit của các luồng mới. Build, unit đầy đủ, API, production và các suite bị ảnh hưởng phải đối chiếu log của bản chốt; CI/deploy cần xác minh đúng commit.

Kiểm chứng cục bộ ngày 09/11/2026: `npm test` đạt 186/186; `npm run build`, `npm run format:check`, API SQLite và production smoke đạt. Runner PostgreSQL đạt 114 kiểm thử, hai trường hợp chỉ dành cho driver khác được bỏ qua có chủ đích; sau bổ sung giữ checklist khi nhập kỉ niệm cũ, chín kiểm thử mới được chạy lại và đạt trên cả hai driver. Các suite `signature-features`, `weekly-experience`, `background-removal` và `main-pages` đã đạt với dữ liệu cô lập. Đã tải PNG/MP4 thật, xem frame mở đầu/trang/kết thúc để đối chiếu khung 35mm và sticker Việt. Đây là QA tự động, chưa phải pilot người thật hoặc xác nhận Face ID/Safari trên iPhone thật. Kết quả CI và phiên bản triển khai phải kiểm tra theo SHA phát hành, không suy từ những kết quả cục bộ này.

Frontend dùng capability `signatureFeaturesVersion` để tránh gửi hợp đồng mới tới backend cũ. Worker công bố music/photo catalog version 2; API từ chối xuất nội dung/nhạc mới nếu worker cũ còn hoạt động. Không thêm biến môi trường hoặc provision worker cloud. Video preview và PNG vẫn hoạt động độc lập với worker cloud; xuất MP4 production cần worker phù hợp như trước.

Session ban đầu của màn khóa chỉ được dùng lại ở lần mở giao diện đầu tiên. Sau xác minh email, đổi tài khoản hoặc refresh chủ động, frontend lấy session mới và giữ màn xác minh nếu máy chủ đang lỗi. Luồng `auth` đã được chạy lại sau sửa này, gồm lỗi 503, chờ phản hồi, đổi/reset mật khẩu và thu hồi session cũ.

Dependency mới: JSZip (MIT hoặc GPL-3.0), qrcode (MIT), type QR và fontkit (MIT, chỉ công cụ build). Nhạc/vector gốc nằm trong nguồn dự án, chữ Patrick Hand giữ thông báo OFL. Inventory/notices được tạo bằng công cụ hiện có; không thay AGPL-3.0-only và ngoại lệ Remotion.
