# Bố cục Little Days — hành trình, lịch và bàn thiết kế

Phạm vi 06/11/2026: tiếp nối [Photo Journal](DESIGN_SYSTEM.md), dùng nội dung và quyền hiện có. Không thêm dịch vụ, biến môi trường, migration hay dữ liệu mẫu vào tài khoản thật.

## Nét nhận diện

Dải ảnh như tờ ảnh tiếp xúc, dấu ngày nhỏ, đường chỉ cherry nối các ngày, cạnh gáy của thẻ album và chi tiết viền đứt được dùng có chọn lọc. Bề mặt sản phẩm trắng xám, chữ Plus Jakarta Sans; hình người dùng giữ vai trò chính. Giấy, font và màu trong tài liệu scrapbook vẫn thuộc lựa chọn đã lưu của người dùng.

Token bổ sung ở `apps/web/src/little-days-layout.css`: `--surface-soft`, `--rose-line`, `--mint-ink`, `--card-radius`, `--control-radius`. File này chỉ điều chỉnh product chrome, không thay primitive trong Canvas/DOM/MP4.

## Hôm nay

- Header giữ tên, ngày và hành động thêm; bỏ tổng số album/dấu mốc không liên quan đến việc hôm nay.
- Dải tuần thấp hơn. Khi nhận dữ liệu, vùng cuộn ngang đưa ngày có ảnh gần nhất trong tuần vào khung, hoặc hôm nay nếu tuần chưa có ảnh. Chỉ cuộn dải, không cuộn cả trang.
- Một gợi ý hành động: ưu tiên kế hoạch trong bảy ngày tới; nếu không có thì mở câu hỏi của không gian chung, hoặc thêm kỉ niệm nếu chưa cộng tác. Không tạo thêm lượt gọi API hoặc giả định người dùng chưa trả lời.
- Ban đầu hiển thị hai thẻ đúng hôm nay. **Xem thêm hôm nay** mở tối đa bốn; nhiều hơn có lối sang đúng ngày trong Lịch. Nhịp chung/đồng hồ và cuộc hẹn vẫn ở cột phụ desktop, xuống dưới trên mobile.

## Dòng thời gian

- Tiêu đề/chọn không gian được thu về một vùng đầu trang; thống kê là dòng nhỏ. Tìm kiếm/lọc và thao tác quản lý ở thanh công cụ.
- **Chọn để tạo sổ** mới bật checkbox và thanh tạo scrapbook. Thoát chế độ sẽ bỏ chọn; vẫn giữ giới hạn 20 mốc, source revision và quyền tạo album hiện có.
- Các ngày nằm hai bên đường chỉ khi vùng feed đủ rộng. Mỗi ngày ban đầu tối đa ba thẻ; mở thêm trong ngày, thu gọn lại hoặc bật chế độ chọn để xem mọi thẻ đã tải. Việc này không thay đổi phân trang, tìm kiếm hoặc tập nội dung phía API.
- Bản đồ hiện sẵn: cột phụ desktop, bản xem trước thấp trên màn hình nhỏ. Dialog mở rộng và hai vùng cuộn độc lập giữ nguyên.
- Card giữ nút bình luận và chỉnh sửa/mở album. Nhắc ngày, lịch sử và xóa nằm trong nút **Tùy chọn …**. Menu nổi ngoài vùng cắt của ảnh, giới hạn theo viewport, đóng khi Escape/click ngoài/đổi focus/cuộn. Escape trả focus về nút; thao tác xóa vẫn dùng xác nhận của app.

## Lịch của mình

- Desktop giữ khoảng 3:1, nhưng thẻ tháng không kéo cao theo cột bên phải. Nội dung ngày chọn nằm dưới lịch; cột phụ bắt đầu bằng ghi chú của ngày chọn.
- Một danh sách **Sắp tới** gộp ngày riêng và ngày lễ, sắp theo ngày, tối đa năm mục. Chỉ lấy sau ngày chọn để tránh lặp lại nội dung đang xem; mỗi dòng có dấu ngày, nhãn loại và icon. Chạm dòng chuyển đến ngày đó; chạm ngày lễ trên lịch vẫn có hành động lên kế hoạch.
- Mobile: lịch → nội dung ngày → ghi chú/sắp tới. Không chuyển sang dialog lồng nhau để đọc nội dung thường ngày.

## Thông tin cá nhân và trạng thái điều khiển

Thẻ danh tính có nền giấy hồng nhẹ, avatar viền trắng, tên và nút đổi ảnh. Form, tab bảo mật, progress dung lượng, select đang chọn, loading/error/success và menu dùng cùng palette. Font nhập mobile tối thiểu 16px vẫn được giữ để tránh tự zoom khi focus; người dùng vẫn có thể pinch zoom.

## Editor

Thanh công cụ chính, thư viện, canvas và thuộc tính tách rõ. Hai nút ở thanh tên trang cho phép thu/mở thư viện và bảng thuộc tính; bấm tab công cụ sẽ mở lại thư viện. Vùng ẩn giữ DOM, không khởi tạo lại form hay tài liệu.

Đây là trạng thái xem trong phiên: không ghi trạng thái thu/mở hay zoom vào album, không đổi tọa độ, crop, font, lịch sử hoặc revision. Thanh thêm nhanh ưu tiên chữ/khung/sticker; các thao tác ít dùng nhẹ hơn. Mobile giữ luồng thư viện → canvas → thuộc tính, công cụ active gạch dưới.

## Kiểm chứng

Tham khảo cách [Penpot phân vùng workspace và thuộc tính](https://help.penpot.app/user-guide/first-steps/the-interface/) cùng [các vùng tương tác của Figma](https://help.figma.com/hc/en-us/articles/360039831974-Explore-the-navigation-bar-and-left-sidebar). Little Days áp dụng nguyên tắc tách công cụ khỏi nội dung và cho thu/mở vùng phụ; dấu ngày, đường chỉ và giấy ảnh được thiết kế riêng cho nhật ký cặp đôi.

- `main-pages`: hai/bốn thẻ Hôm nay, mở/thu nhóm ngày, không có checkbox ngoài chế độ chọn, menu nằm trong viewport, Escape và hủy xác nhận xóa trả focus; responsive 1440/390/320px, đồng hồ/bản đồ/quyền cộng tác.
- `daily-polish`: ảnh/cache khi đổi trang và popup, cùng kiểu card giữa Hôm nay/Lịch, ngày lặp và bố cục ngày chọn.
- `editor`: thu/mở hai dock làm tăng diện tích bàn mà không ghi vào API; tiếp tục gõ tiếng Việt, undo/redo và reload. Ở 320px, kiểm tra khi cuộn rằng thanh công cụ nằm dưới header hai hàng, sáu tab vừa chiều ngang và trang không tràn viewport.
- `journal-album`, `community`, `reminders-holidays`: vào chế độ chọn và menu mới rồi chạy các kiểm tra dữ liệu, history, xóa/khôi phục, lời nhắc hiện có.
- `test:pilot`, build/typecheck và CI cần đối chiếu log của commit phát hành; ảnh QA không phải nghiệm thu người dùng thật hay Safari/iPhone vật lý.
