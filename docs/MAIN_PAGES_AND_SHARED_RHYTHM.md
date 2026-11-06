# Trang chính, thông báo cộng tác và nhịp yêu thương

Cập nhật ngày 06/11/2026. Phạm vi là frontend/API hiện có, không thêm dịch vụ hoặc biến môi trường.

## Mỗi trang có một vai trò

| Trang | Nội dung chính |
| --- | --- |
| Hôm nay | Một việc nhỏ để trao nhau, nhịp tuần, tối đa bốn thẻ của đúng hôm nay và các cuộc hẹn tương lai. Xem thêm mở đúng ngày trong Lịch. Recap tuần chỉ mở khi chọn “Nhìn lại tuần này”. |
| Dòng thời gian | Không gian riêng/chung, tìm/lọc, lịch sử/thùng rác và bản đồ kỉ niệm. Banner được thu thành số liệu; mở rộng bản đồ từ đây hoặc chạm địa điểm trên dấu mốc. |
| Lịch của mình | Lịch tháng, ngày lễ, ghi chú/ngày đang chọn và chuẩn bị kế hoạch. |
| Album của mình | Sổ, thiệp, recap và nút **Ảnh đã lưu**. Đường dẫn `/photos` được giữ; thanh điều hướng vẫn đánh dấu Album khi xem ảnh. |

Thanh điều hướng có bốn mục. Trên mobile, đường nhấn active nằm dưới nút. Các hộp thoại vẫn ở trên thanh điều hướng.

## Thông báo có liên quan

Chuông gom lời nhắc hiện có cùng lời mời/chấp nhận, dấu mốc mới, ảnh mới và lời bỏ vào lọ của thành viên khác. Ảnh tải nhiều lần trên cùng dấu mốc trong một ngày Việt Nam được gom một thông báo. Thông báo dấu mốc mở đầy đủ bản ghi đúng không gian, kể cả khi người nhận đã ẩn không gian đó khỏi lịch cá nhân. Đóng/lưu sẽ dọn tham số mở popup khỏi URL. Lời mời mở bảng cộng tác; lời trong lọ mở đúng lọ.

- Chỉ dùng metadata, tên thành viên hiện tại và liên kết nội bộ do server tạo. Nội dung/ảnh kín, chú thích và tên ảnh không xuất hiện trong feed thông báo.
- Mỗi request lấy lại quyền hiện tại. Rời/thu hồi, xóa dấu mốc/lời hoặc thay thành viên sẽ loại những mục không còn hợp lệ. Lượt mời lại có phạm vi mới; không phát lại hoạt động trước khi chấp nhận lượt mời hiện tại.
- Feed hoạt động xem tối đa 30 ngày và trả tối đa 200 mục; query chọn metadata và giới hạn số dòng ở SQL. Phần lời nhắc giữ chính sách hiện có. Trạng thái đọc lưu bằng record `activity-read` theo tài khoản, khóa/idempotency hiện có, tối đa 200 record còn liên quan sau khi đánh dấu đọc. Backup/xóa tài khoản xử lý như các record thuộc tài khoản khác.
- Cập nhật khi mở chuông, focus, thao tác liên quan và mỗi 30 giây khi tab đang hiển thị; bỏ phản hồi cũ. Đây là thông báo trong ứng dụng, không phải Web Push. Đợt này không tự bật email hoặc gửi marketing.

## Nhịp yêu thương và đồng hồ cát

Ngày chung sáng lên khi mọi thành viên hiện tại có ít nhất một đóng góp trong cùng ngày: gửi câu trả lời, bỏ lời vào lọ, tạo dấu mốc/ghi chú/kế hoạch chung hoặc thêm ảnh vào dấu mốc chung. Mỗi thành viên tính một lần/ngày; mở web, xem ảnh, retry, cron và autosave không tạo thêm ngày.

Ngày tính bằng giờ Việt Nam từ timestamp server, không lấy ngày sự kiện do client nhập để cộng chuỗi. Bảy ngày tuần hiện tại giữ các ngày đã làm dù có một ngày nghỉ. Badge chuỗi gần đây tính tối đa 60 ngày, hiện `60+` nếu đạt giới hạn đọc. Khi hôm nay chưa hoàn tất, chuỗi của hôm qua vẫn được hiển thị. Không có bảng so sánh hai người, phần thưởng mở lọ sớm hoặc phạt khi nghỉ.

Tiến độ được tính từ nội dung còn tồn tại/còn quyền: rút câu trả lời, xóa nội dung hoặc thay phạm vi thành viên có thể giảm tiến độ tương ứng. Câu trả lời/lời trong lọ dùng đúng epoch thành viên; dấu mốc và ảnh phải đang ở không gian chung, do thành viên hiện tại đóng góp sau khi bắt đầu lượt cộng tác. Chưa có một sổ điểm độc lập giữ công sau khi xóa nội dung. Chưa có mục tiêu tuần do cả hai opt-in hay chế độ cứu chuỗi; đây là nhịp mô tả hoạt động thực tế. Người dùng có thể ẩn nhịp trên thiết bị theo tài khoản.

Đồng hồ cát là mesh WebGL 3D với kính truyền sáng, cát, đế và cột đỡ. Mức cát phản ánh số ngày chung trong tuần; không có đồng hồ đếm ngược làm cạn “tình yêu”. Mô hình và ảnh dự phòng được dựng từ `apps/web/src/hourglass-scene.ts`, không tải model/texture từ bên ngoài. Three.js được tải khi vùng đồng hồ sắp xuất hiện; giới hạn DPR 1.5, 24 fps, giảm resolution truyền sáng và dừng render khi ra ngoài viewport/ẩn tab. Reduced motion giữ cảnh đứng yên. Thiết bị thiếu WebGL dùng ảnh kết xuất từ cùng mô hình và vẫn xem tiến độ thật.

API chỉ tính metadata; không dùng GPU/worker cloud để dựng đồng hồ. Session `coupleRhythmVersion: 1` cho phép frontend bật request mới khi API đã hỗ trợ. Cache nhỏ theo tài khoản/không gian/version được vô hiệu hóa khi có thao tác liên quan; refresh nền không xóa nội dung đang xem.

## Bản đồ vừa khung

Khung dialog, bản đồ, thống kê, tiêu đề tỉnh, tìm kiếm, vùng miền và nút thêm được giữ nguyên vị trí. Chỉ **danh sách tỉnh** và **danh sách kỉ niệm của tỉnh đang chọn** có vùng cuộn riêng, hỗ trợ focus bàn phím. Dữ liệu/giới hạn địa giới và đảo minh họa xem [nguồn bản đồ](VIETNAM_MAP_DATA.md).

## Cơ sở lựa chọn

- [Nghiên cứu Paired trên JMIR](https://mhealth.jmir.org/2025/1/e55433/) ghi nhận hoạt động ngắn có thể tạo lý do trò chuyện, đồng thời chuỗi có thể tạo áp lực trong quan hệ. Vì vậy nhịp giữ dữ liệu đã làm, cho ẩn và không xếp hạng tình cảm. Nghiên cứu này không chứng minh cơ chế của Little Days sẽ tăng retention.
- [Duolingo về tính linh hoạt của chuỗi](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) là tham khảo thiết kế thói quen; bối cảnh học tập khác ứng dụng cặp đôi, không dùng số liệu của họ dự báo kết quả dự án.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer) và [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial) là nguồn kỹ thuật cho cảnh kính và giới hạn chi phí render.

## Kiểm chứng

`shared-activity.test.ts` kiểm tra quyền, trạng thái đọc, upload/nhóm ảnh, nội dung kín, VN midnight, retry và mời lại trên SQLite/PostgreSQL. Suite `main-pages` dùng tài khoản/mail/tile fixture để kiểm tra 1440/390/320px, canvas 3D thực, reduced motion, thiếu WebGL, bốn mục điều hướng, phân vai trang, hai vùng cuộn và link thông báo. Các suite lịch/timeline/ảnh/recap/editor được đổi lối truy cập theo bố cục mới, giữ các assertion dữ liệu/quyền.

QA tự động không thay thế quan sát người dùng thật hoặc bảo đảm hiệu năng trên mọi GPU điện thoại. CI và revision đang deploy được xác minh riêng khi phát hành.
