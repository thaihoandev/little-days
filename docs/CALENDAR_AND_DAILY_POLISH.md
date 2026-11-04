# Lịch đúng năm, Lọ điều thương và bố cục Hôm nay

## Sự kiện không lặp bị hiện như ở năm sau

Hai đường hiển thị đã được sửa:

- Ngày bắt đầu album trước đây luôn được tự coi là ngày kỉ niệm hằng năm, gồm cả sổ được tạo từ dấu mốc một lần, recap và thiệp. Giờ mặc định không lặp. Muốn lặp, mở album → **Thiết lập → Lặp ngày bắt đầu trên lịch hằng năm**. Tùy chọn lưu cùng revision/autosave/undo của album; checkbox của dấu mốc tiếp tục điều khiển chính dấu mốc đó.
- Danh sách **Sắp đến** trong trang Lịch trước đây luôn tính từ hôm nay dù đang xem năm khác, và thiếu năm trong nhãn ngày. Giờ danh sách tính từ ngày đang chọn, ghi đủ năm và phân biệt **Ngày chọn** với **Hôm nay**. Ở `/today`, danh sách vẫn tính từ hôm nay.

Sổ cũ chưa có lựa chọn rõ ràng dùng mặc định không lặp; có thể chủ động bật lại trong Thiết lập. Reminder dùng cùng cờ này khi xác định lần xuất hiện tiếp theo. SQLite/PostgreSQL đều trả boolean đúng cho summary/feed/map. Không cần migration hoặc thay ngày gốc của dữ liệu đã lưu.

Mục **Ngày này năm trước** là phần nhìn lại lịch sử riêng ở Hôm nay, tiếp tục cho xem kỉ niệm cũ; không biến chúng thành sự kiện lặp trong ô ngày của lịch. Timeline vẫn giữ các mốc theo ngày/năm gốc.

## Lọ điều thương

Lọ có thân kính, nắp, phản chiếu, bóng và các mảnh giấy gấp. Con số trên nhãn lấy từ tổng lời thương thực tế, không phải số lời của riêng trang đang tải. Hình minh họa dùng tối đa 36 mảnh giấy để giữ số phần tử hữu hạn. Giấy không chứa nội dung lời nhắn kín.

Ngày hẹn và đồng thuận thể hiện bằng icon/ngắn gọn. Mỗi lời chưa mở có các dấu đồng ý và số `n/tổng`; người gửi vẫn phải chủ động đồng ý nếu muốn mở sớm. Lời mình viết có thể mở rộng ngay trong thẻ để đọc, giúp danh sách gọn hơn. Việc gửi thêm, bỏ đồng ý, rút ngẫu nhiên và quyền đọc vẫn do API kiểm tra.

Hiệu ứng nhẹ khi số lời thay đổi; tắt với reduced motion. Không cần tải model 3D, ảnh mới hoặc thư viện đồ họa bên ngoài.

## Hôm nay và popup

Khung nội dung dùng hết chiều rộng khả dụng, giữ khoảng đệm hai bên. Thẻ **Những điều mình đã giữ** dùng hai cột trên desktop và một cột ở màn hẹp, ảnh nhỏ cạnh nội dung, bìa riêng cho album, hàng thao tác tách rõ. Nội dung dài có **Xem thêm** ngay trong thẻ.

Popup giữ tiêu đề/nút đóng và thao tác chính ở ngoài vùng cuộn nội dung. Form tạo album cuộn phần chọn mẫu, recap cuộn phần nội dung và popup đọc lời dài cuộn lời nhắn. Với màn hình thấp hoặc nội dung dài, vẫn cần cuộn vùng nội dung để đọc đầy đủ; không cắt nội dung để làm mất thanh cuộn.

Tải trang PNG đợi cả ảnh, sticker và họa tiết bộ đếm tải xong. Fixture trì hoãn đúng các tài nguyên SVG để kiểm tra nút đang chờ và pixel trang trí trong ảnh tải xuống; không xuất một trang thiếu hình.

## Kiểm chứng

- `tests/weekly-recap.test.ts`: journal một lần/hằng năm, album mặc định/tắt/bật và boolean của summary/feed; chạy trên SQLite và PostgreSQL fixture.
- `tests/reminders-holidays.test.ts`: reminder dùng lựa chọn hằng năm rõ ràng.
- `node --import tsx scripts/pilot-qa.ts daily-polish`: lịch năm sau, opt-in trong editor, cạnh phải trên màn 1920 px, thẻ Hôm nay, popup, số giấy/số đồng ý, gõ tiếng Việt, reduced motion và overflow 390/320 px.
- Hồi quy Góc chúng mình, lịch, thiết kế/thiệp và tải PNG chạy bằng fixture; CI/deploy của đúng commit phải được đối chiếu riêng.

Kết quả cục bộ 04/11/2026: 151/151 unit, 14/14 ca PostgreSQL liên quan, typecheck/build, smoke API và production đạt. Suite daily-polish đạt ở 1920/390/320 px; suite recap/PNG/MP4 đạt sau khi sửa fixture trì hoãn SVG. Các phép đo là Chromium headless và dữ liệu giả, không phải pilot người thật hoặc xác nhận deploy.
