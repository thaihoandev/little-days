# Ping Render theo lịch

Workflow [Render keep-alive](../.github/workflows/render-keepalive.yml) ping API của Little Days theo lịch GitHub Actions, không phụ thuộc máy cá nhân. Lịch tự hoạt động khi workflow nằm trên nhánh mặc định `main` của repository `thaihoandev/little-days` và GitHub Actions được bật.

## Lịch và endpoint

- Cron: `7,17,27,37,47,57 * * * *`, tức mỗi 10 phút, vào phút 07/17/27/37/47/57 theo UTC. Phút chạy tại Việt Nam cũng tương ứng vì lệch UTC tròn 7 giờ.
- URL cố định: `https://little-days-api.onrender.com/legal-info.json`.
- Đây là file tĩnh do chính web service Render phục vụ; không tạo session, không truy vấn database trực tiếp, không gọi Cloudinary hoặc gửi mail. Startup và các tác vụ nền của API vẫn có thể sử dụng Neon khi service thức.
- Yêu cầu HTTPS, không đi theo redirect; có timeout, tối đa hai lần retry cho lỗi tạm thời, kiểm tra HTTP và JSON đúng ứng dụng. Job tối đa 4 phút. Không cần checkout, npm install, secret hay quyền ghi repository.
- Fork và nhánh khác không chạy ping đến ứng dụng thật. Repository variable `RENDER_KEEPALIVE_ENABLED=false` có thể tạm dừng job; mặc định bật khi không có variable này.

## Xem kết quả, chạy thử hoặc tắt

1. Mở GitHub repository → **Actions → Render keep-alive**.
2. Xem lần chạy gần nhất và step **Ping the Render web service**. Muốn chạy ngay: **Run workflow → main → Run workflow**.
3. Muốn tắt: **Actions → Render keep-alive → ⋯ → Disable workflow**. Có thể bật lại ở cùng trang, hoặc dùng repository variable phía trên để bỏ qua job.

Không sửa `.env`, không cần thay cấu hình Render hoặc nâng cấp dịch vụ. Không dùng empty commit để giữ lịch hoạt động.

## Giới hạn thực tế

[Render Free](https://render.com/docs/free) ngủ sau 15 phút không nhận traffic. Ping mỗi 10 phút giúp giảm khả năng ngủ, nhưng không bảo đảm uptime 24/7: [GitHub có thể chạy lịch trễ hoặc bỏ lượt khi tải cao](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule); workflow trong repo public có thể bị tắt sau 60 ngày không có hoạt động repository. Render cũng có thể restart service.

Thời gian thức vẫn tiêu hạn mức instance miễn phí của Render; ping không tăng CPU/RAM hay thay thế giám sát vận hành. Kiểm tra usage của Render/Neon nếu giữ API hoạt động thường xuyên. Workflow không tự nâng cấp plan hoặc provision dịch vụ trả phí.
