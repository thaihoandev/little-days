# Ping Render bằng cron-job.org

Cập nhật 04/11/2026. Endpoint cố định: `https://little-days-api.onrender.com/legal-info.json`.

## Vì sao chuyển lịch

Cron GitHub trên `main` đúng mỗi 10 phút, workflow vẫn active, nhưng ngày 04/11 (giờ Việt Nam) các lượt schedule thực tế là [00:42](https://github.com/thaihoandev/little-days/actions/runs/41686824074), [05:32](https://github.com/thaihoandev/little-days/actions/runs/41731623417), [09:38](https://github.com/thaihoandev/little-days/actions/runs/41762097796). Cả ba thành công, khoảng cách hơn 4 giờ. [GitHub có thể trì hoãn/bỏ lượt](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule); [Render Free ngủ sau 15 phút](https://render.com/docs/free). Đây là quan sát của repo này, không phải cam kết về mọi lịch GitHub.

## Tạo job trong dashboard

1. Đăng nhập/đăng ký tại [console.cron-job.org](https://console.cron-job.org/), xác minh email nếu được yêu cầu.
2. Chọn **Create cronjob**, điền:

   | Trường | Giá trị |
   | --- | --- |
   | Title | `Little Days - Render keep-alive` |
   | URL | `https://little-days-api.onrender.com/legal-info.json` |
   | Enabled | Bật |
   | Schedule | Every 5 minutes, mọi giờ/ngày/tháng |
   | Timezone | `Asia/Ho_Chi_Minh` |
   | Request method | GET |
   | Timeout | 30 giây theo gói miễn phí |
   | Save responses | Tắt |
   | HTTP authentication | Tắt, không nhập token/session của Little Days |
   | Header tùy chọn | `Cache-Control: no-cache` |

3. Lưu job. Nếu Render đang ngủ, mở URL và chờ khởi động xong trước khi dùng **Test run**: cold start có thể dài hơn timeout 30 giây của cron-job.org.
4. Xem History, xác nhận HTTP 200 và ít nhất ba lượt schedule thực tế cách khoảng 5 phút. Một lượt Test run xanh chưa xác nhận lịch chạy đều.
5. Chỉ khi lịch mới đã chạy đạt, tắt lịch GitHub cũ ở **Actions → Render keep-alive → ⋯ → Disable workflow**, hoặc đặt repository variable `RENDER_KEEPALIVE_ENABLED=false`. Giữ lịch dự phòng đến khi cron-job.org thực sự hoạt động.

[cron-job.org](https://cron-job.org/en/) cung cấp lịch miễn phí; [FAQ](https://cron-job.org/en/faq/) nêu timeout 30 giây và tối đa 64 KB response. Metadata nhỏ, không tạo session hoặc truy vấn database trực tiếp. Startup và tác vụ nền của API vẫn có thể sử dụng Neon.

## API: không tạo thêm `.env`

Cấu hình công khai: [deploy/render-keepalive.cron-job.json](../deploy/render-keepalive.cron-job.json). Từ thư mục dự án, xem trước mà chưa gọi API/tạo job:

```powershell
node scripts/setup-render-cron.mjs --dry-run
```

Nếu đã có tài khoản, tạo API key trong Settings của cron-job.org. Nhập bằng prompt ẩn ở terminal cá nhân; không gửi key vào chat/Git/frontend:

```powershell
$cronSetupSecret = Read-Host 'cron-job.org API key' -AsSecureString
try {
  $env:CRON_JOB_API_KEY = [System.Net.NetworkCredential]::new('', $cronSetupSecret).Password
  node scripts/setup-render-cron.mjs --apply
  if ($LASTEXITCODE -eq 0) {
    node scripts/setup-render-cron.mjs --status
  }
} finally {
  Remove-Item Env:CRON_JOB_API_KEY -ErrorAction SilentlyContinue
  $cronSetupSecret.Dispose()
}
```

`--apply` đối chiếu danh sách đầy đủ rồi tạo/cập nhật đúng job theo tên và URL; không xóa job khác. Chạy tuần tự, không nhiều phiên setup đồng thời. Nếu PUT mất phản hồi, không tự retry; lần chạy sau đối chiếu lại. Trùng tên/URL hoặc danh sách không đầy đủ thì dừng để kiểm tra dashboard. Key chỉ gửi tới `https://api.cron-job.org`, không đi theo redirect hoặc in phản hồi có headers/password riêng tư. Cấu hình tắt notification, không tự gửi thư thử.

`--status` kiểm tra enabled/lịch 5 phút và tối đa ba kết quả đã chạy. `executions` rỗng nghĩa là chưa có bằng chứng lịch chạy. API quota quản trị (mặc định 100 request/ngày) khác số lần ping theo lịch; không gọi API quản trị mỗi 5 phút. Tham khảo [REST API chính thức](https://docs.cron-job.org/rest-api.html).

## Trạng thái và giới hạn

Ngày 04/11/2026, người dùng xác nhận đã tạo/lưu job GET mỗi 5 phút và bật Enabled trong cron-job.org. Agent chưa truy cập được lịch sử tài khoản để kiểm chứng các lượt schedule, nên vẫn giữ GitHub dự phòng. Không đồng nhất xác nhận cấu hình với ba lượt HTTP 200 đều; không ghi kiểm chứng thành công chỉ từ fixture/dry-run.

Không đổi `.env`, Render plan hoặc database/media. Giữ API thức vẫn tiêu 750 giờ Free Instance dùng chung workspace, có thể tăng usage Neon; không tăng CPU/RAM. Dịch vụ lịch và Render có thể gián đoạn/restart, không bảo đảm uptime 24/7.
