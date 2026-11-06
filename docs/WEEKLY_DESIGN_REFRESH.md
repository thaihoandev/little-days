# Recap tuần, khung ảnh và thiệp dài

## Tuần của chúng mình

Mở **Hôm nay → Tuần của chúng mình**. Chọn không gian chung nếu bạn tham gia nhiều không gian; dùng mũi tên để xem tuần trước. Dải ảnh có bảy ngày từ thứ Hai đến Chủ nhật theo giờ Việt Nam. Bấm ngày chưa có ảnh để thêm dấu mốc; các ngày tương lai chưa cho thêm từ dải này.

**Tạo recap tuần** mở ba bước **Ảnh → Thiết kế → Xem trước**. Chọn 1–9 ảnh; thẻ ảnh có tên/avatar người đăng và số thứ tự. Mở **Sắp xếp … ảnh đã chọn** để xem ảnh nhỏ, đưa ảnh lên/xuống hoặc bỏ ảnh. Khi đủ chín ảnh, bỏ một ảnh để chọn ảnh khác. Không cần có ảnh đủ bảy ngày.

Ở bước Thiết kế, nhập tiêu đề/lời nhắn rồi chọn một trong ba thẻ bố cục Ô ảnh, Thước phim, Nhật ký ảnh và bốn màu giấy. Có thể quay lại từng bước mà không mất các lựa chọn trong phiên. Bước Xem trước hiển thị toàn bộ trang 720 × 900, co theo cả chiều rộng và chiều cao vùng nhìn, kể cả khi xoay điện thoại. Trên desktop bản nháp còn xuất hiện cạnh bảng tùy chọn. Chỉ vùng tùy chọn cuộn; header, các bước và nút tiếp tục/lưu giữ trong khung.

Giao diện theo chiều cao `visualViewport` khi bàn phím làm hẹp vùng nhìn, giữ chữ nhập mobile từ 16px và không chặn pinch zoom. Chromium kiểm tra vùng nhìn ngắn/màn hình ngang; bàn phím và Safari/iPhone thật chưa được nghiệm thu. ID của phần tử trong bản nháp giữ ổn định khi gõ, tránh remount ảnh chỉ vì sửa tiêu đề hoặc lời nhắn. Các ID này không thay ID/nội dung do server tạo khi lưu sổ.

Chọn **Lưu và mở trong editor** để tạo sổ cá nhân. Ảnh được sao chép qua media store, tính quota của người lưu và vẫn sửa/thay/crop được. Recap không nhân bản dấu mốc nguồn vào mục kỉ niệm của album; ngày bắt đầu sổ là thứ Hai của tuần. Sổ không tự công khai. Người dùng bật chia sẻ như album thường, hoặc **Tải trang PNG** để lưu một ảnh collage 720 × 900. Trong **Album → Recap tuần**, các sổ đã lưu được lọc riêng; một tuần có thể có nhiều bản thiết kế theo chủ ý người dùng.

Recap chỉ lấy ảnh từ dấu mốc đang được chia sẻ trong không gian đã chọn, đúng tuần và không thuộc tương lai. Kế hoạch chưa hoàn thành, ghi chú/ảnh riêng và nội dung kín trong Góc chúng mình không được đưa vào bộ chọn. Bản đầu này không tự tổng hợp câu trả lời, lời trong lọ hoặc gửi email recap. Không có điểm, phạt hay chuỗi bắt buộc.

API kiểm tra quyền khi liệt kê và khi lưu, kiểm tra revision trước/sau sao chép ảnh; retry cùng request ID không tạo sổ/quota trùng. Quyền bị thu hồi chặn yêu cầu tiếp theo. Bản sao cá nhân đã lưu trước đó vẫn độc lập; thao tác thu hồi không xóa các sổ đã được lưu hợp lệ.

Bản nháp chọn ảnh/lời nhắn vẫn giữ khi dữ liệu nền của cùng không gian cập nhật. Đổi tuần/không gian hoặc mất quyền sẽ đóng bản nháp. Đóng composer chủ động chưa có phục hồi bản nháp qua lần mở khác; autosave trong editor vẫn hoạt động như trước.

## Khung ảnh

Trong editor, chọn **Ảnh** để xem gallery khung, hoặc chọn ảnh đang có rồi đổi kiểu ở bảng thuộc tính: Polaroid, viền triển lãm, góc mềm, tròn/oval, cửa vòm, thước phim, tem, tràn khung và ảnh tự do/tách nền. Có màu viền tùy chỉnh. Đổi kiểu giữ asset và vị trí khung, đưa crop về ban đầu để dễ căn lại; chọn **Chỉnh / thay ảnh trong khung** để kéo/phóng vùng ảnh. Có thể hoàn tác các thay đổi.

Canvas, viewer và video dùng chung hình dáng/viewport crop. PNG xuất trang hiện tại ở kích thước thiết kế, bỏ khung chọn và đường căn. Nút báo lỗi nếu ảnh chưa tải xong; PNG là ảnh tĩnh, không chứa nhạc hoặc animation. PNG không tự lưu vào server.

## Thiệp dài

Khi tạo **Thiệp mời**, chọn **Thiệp dài · cuộn dọc**. Mẫu khởi tạo có ba phần: bìa, câu chuyện và lời hẹn; sửa ảnh/chữ/địa điểm theo sự kiện. Không có chức năng RSVP thu thập thông tin khách ở đợt này.

Trong editor, các phần xếp dọc. Bấm **Sửa phần…** để chuyển phần đang sửa; chỉ một canvas tương tác chạy cùng lúc. Thêm/xóa/đổi thứ tự phần qua mục Trang sổ, giữ autosave, bản nháp và undo/redo hiện có. Mỗi phần vẫn theo hệ tọa độ 720 × 900; đây là thiệp nhiều phần liên tục, chưa phải một canvas có chiều cao tùy ý.

Trong **Thiết lập → Cách đọc**, đổi giữa lật trang và cuộn liên tục mà không mất nội dung. Bản chia sẻ cuộn ngay trong trang, chỉ xem và bật/tắt nhạc; không có chọn kiểu/gáy/hiệu ứng cho khách. Hiệu ứng của từng phần chỉ chạy khi phần đó đi vào vùng nhìn, tôn trọng reduced motion và trạng thái tab. Preview tự thử phát đoạn nhạc đã chọn; nếu trình duyệt chặn autoplay có tiếng, người xem bấm **Bật nhạc**. Xem [hướng dẫn nhạc và thiệp](INVITATIONS_AND_SHARED_PREVIEW.md).

Video vẫn xuất các phần được chọn theo thứ tự cảnh, chưa tạo chuyển động camera cuộn một tờ thiệp dài. Worker cloud vẫn chưa được triển khai; kiểm tra MP4 dùng worker fixture cô lập.

## Bố cục ứng dụng

- Hôm nay ưu tiên tóm tắt ngày, dải ảnh tuần, lối vào Góc chúng mình và lịch. Bỏ thư viện album bị lặp ở cuối trang.
- Album có bộ lọc Tất cả/Sổ/Thiệp/Recap; timeline giữ cách gom ngày và bản đồ hiện có.
- Chuẩn hóa khoảng cách, nền, tiêu đề, thẻ và nút trên các trang; rút gọn tổng quan và lịch ở Hôm nay. Không thay quyền hoặc chuyển dữ liệu giữa các không gian chỉ vì đổi giao diện.

## Kiểm chứng

Các bài kiểm tra dùng tài khoản, database, mail và ảnh fixture; không tương đương xác nhận pilot người dùng thật hoặc chứng minh production đã deploy.

- `tests/weekly-recap.test.ts`: bố cục 1–9 ảnh, phần thiệp hợp lệ, quyền riêng/chung, tác giả, sai tuần/revision, retry, thu hồi quyền và dọn bản sao chưa commit khi nguồn đổi.
- `node --import tsx scripts/pilot-qa.ts weekly-experience`: desktop 1600 px, mobile 390/320 px; 10 ảnh nguồn/giới hạn 9, bỏ/chọn/sắp xếp, ba bước, focus/nhập giữa câu, ảnh không remount khi gõ, preview vừa khung ở vùng nhìn ngắn và màn hình ngang. Tiếp tục kiểm tra PNG, gallery, một canvas, thiệp share chỉ xem/cuộn, reduced motion và MP4 thật. Kết quả thực tế đối chiếu log của lượt chạy.
- Runner PostgreSQL có thêm bài recap để kiểm tra SQL JSON/window/keyset trên driver thực tế; không dùng database production.

CI và trạng thái triển khai của đúng commit cần được kiểm tra riêng khi bàn giao.

Kiểm tra cục bộ ngày 04/11/2026: 150/150 unit; 23/23 ca PostgreSQL nhập sổ/quyền/recap và 5/5 ca recap sau chỉnh metadata; build/typecheck, smoke API và production đạt. Suite recap cuối đạt ở 1600/390/320 px trong Chromium headless, có giữ nháp khi cập nhật nền, cập nhật ảnh sau lưu, tải PNG và tải MP4 H.264/AAC 1080 × 1920 khoảng 15 giây. Đây là fixture cục bộ; hồi quy toàn bộ, CI và deploy không được suy ra từ các kết quả này.

## Hướng tiếp theo có trọng tâm

Ưu tiên quan sát người dùng có lưu lại recap và quay lại xem tuần cũ hay không trước khi thêm nhắc tuần/chuỗi. Các cải tiến hợp lý sau đó: tiếp tục bản nháp chọn ảnh nếu đóng composer, chia sẻ trực tiếp PNG qua Web Share khi trình duyệt hỗ trợ, mẫu thiệp dài theo dịp. Không tự thêm thông báo hằng ngày, feed công khai hoặc hệ nhiệm vụ/điểm thưởng.
