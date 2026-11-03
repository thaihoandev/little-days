# Không gian chung và kế hoạch dành cho hai người

Cập nhật 03/11/2026. FE/API cần cùng phiên bản hỗ trợ `sharedPlansVersion: 1`; frontend cũ vẫn lưu dấu mốc được, backend giữ checklist khi client cũ không gửi trường này.

## Không gian và người đăng

- Không gian riêng nay có ID và phạm vi dữ liệu tách khỏi không gian chung. Mời người khác không công bố dấu mốc chưa từng chia sẻ; chủ dữ liệu có thể chủ động đổi đích lưu khi sửa. Chi tiết dữ liệu cũ, quyền ảnh/lịch sử và giới hạn chuyển sở hữu: [DESIGN_SPACES_REFRESH.md](DESIGN_SPACES_REFRESH.md).
- Sau khi chấp nhận lời mời, hai người mở cùng một không gian có ID ổn định, tên **Không gian chung** và danh sách thành viên giống nhau. Timeline ưu tiên mở không gian chung; bộ chọn vẫn cho xem tất cả hoặc không gian riêng có quyền truy cập.
- Tạo dấu mốc từ không gian đang chọn mặc định lưu vào không gian đó. Form hiện đích lưu trước khi tạo; dấu mốc đã lưu không tự bị di chuyển khi chỉnh sửa. Album cá nhân không tự chia sẻ hoặc xuất hiện trong feed của không gian chung.
- Mỗi thẻ dấu mốc có tên/avatar người đăng. `createdBy` được server ghi từ phiên tạo, không nhận từ client; người cùng chỉnh sửa không trở thành người đăng. Dữ liệu cũ lấy người tạo từ checkpoint `create` nếu còn, không suy đoán người đăng từ tài khoản đang giữ storage. Nếu không còn bằng chứng, hiển thị tên chung; thành viên đã rời không gian không tiếp tục lộ hồ sơ riêng.
- Lời mời, chấp nhận, rời/thu hồi giữ cơ chế hiện có. Không gian dùng record `timeline-space` và grant hiện có, không sao chép nội dung thành hai timeline. Anchor kỹ thuật cho quota/media và quyền quản trị vẫn gắn với tài khoản khởi tạo; đây chưa phải tính năng chuyển người thanh toán/chuyển sở hữu hoặc giữ không gian độc lập sau khi tài khoản neo bị xóa. Xóa tài khoản vẫn theo chính sách đang có; không tự chuyển dữ liệu sang người khác.

## Chuẩn bị kế hoạch

1. Thêm dấu mốc, chọn **Hẹn cùng nhau**.
2. Trong **Cùng chuẩn bị**, thêm tối đa 50 công việc, nhập nội dung và chọn người phụ trách hoặc để cùng nhau/chưa phân công.
3. Hai người đều có thể mở **Chuẩn bị**, đánh dấu từng việc và đổi trạng thái **Dự định / Đã hoàn thành**. Trạng thái toàn kế hoạch và từng công việc là hai lựa chọn riêng, không ép hoàn thành mọi việc chỉ vì đổi trạng thái.
4. Sau sự kiện, chọn **Thêm ảnh & lưu thành kỉ niệm**, bổ sung lời nhắn/ảnh và lưu. Dấu mốc đổi từ `plan` sang `memory`, có trạng thái hoàn thành; giữ ID, người đăng, checklist, ảnh, lịch sử, bình luận và quyền cộng tác. Không tạo bản sao tính quota lần nữa.

Assignee phải là thành viên hiện tại, đã chấp nhận lời mời. Khi một thành viên rời, phân công lịch sử vẫn giữ ID để tránh mất thông tin, nhưng không cấp lại quyền hoặc cho phân công mới đến tài khoản đó. Nhãn hiển thị sẽ không lấy hồ sơ đã mất quyền xem.

Nếu hai người cùng sửa, CAS/revision trả 409 cho lượt lưu cũ, giữ nội dung đang nhập để xử lý; không âm thầm ghi đè. Checklist nằm trong payload dấu mốc, dùng chung backup/restore, phiên bản, thùng rác và quy trình xóa tài khoản hiện có. Hoàn thành và chuyển thành kỉ niệm không mở rộng quyền truy cập media.

## Quay lại ứng dụng

Trước đây, focus và bộ đếm 30 giây tải lại toàn bộ journal/sharing/feed/map, đồng thời refresh hook xóa danh sách đang xem. Bản mới gọi `GET /api/journal-state` trả fingerprint phiên bản/quyền và phiên bản album cá nhân; dữ liệu không đổi thì không tải lại các danh sách đó. Album thay đổi ở tab khác vẫn làm cập nhật summary của chính tài khoản, không đưa thay đổi album riêng của thành viên khác vào fingerprint. Refresh có thay đổi giữ nội dung trong lúc chờ, chỉ reset khi đổi bộ lọc hoặc scope quyền thay đổi.

Snapshot journal/sharing gần đây chỉ nằm trong bộ nhớ, tối đa bốn snapshot và chỉ tái sử dụng trong hai phút sau khi server xác nhận phiên bản/quyền còn khớp. Không lưu ảnh/binary hoặc journal vào localStorage để né kiểm tra quyền. Thay đổi thành viên/quyền làm bỏ cache; mọi API đọc/ghi/media vẫn kiểm tra quyền hiện tại. Chuông thông báo và những request kiểm tra trạng thái nhỏ vẫn có thể chạy khi trở lại ứng dụng; đây không phải chế độ offline.

## Kiểm chứng

- Unit timeline-sharing: danh tính không gian chung, người đăng không bị client giả mạo hoặc ghi đè khi người khác sửa, fingerprint thay đổi theo nội dung/quyền; checklist/assignee/CAS, ảnh/chuyển kỉ niệm và lịch sử.
- UI `node --import tsx scripts/pilot-qa.ts shared-plans`: hai tài khoản, desktop/mobile, nhập checklist giữ focus, phân công, hoàn thành, chuyển kỉ niệm có ảnh, reload giữ dữ liệu, focus không đổi không gọi lại feed/journal/sharing/map và thu hồi chặn ảnh.
- SQL và quyền tiếp tục nằm trong bộ PostgreSQL QA; không dùng ảnh/email/database thật để kiểm thử. Tất cả hướng dẫn ở đây mô tả mã, không tự xác nhận API production đã deploy hoặc pilot người thật đã chạy.

Kết quả local 03/11/2026: 123 unit đạt; 21 suite UI hồi quy đạt, sau đó chạy lại suite shared-plans trên desktop/mobile cho các sửa cuối (đích lưu riêng tư, fallback API cũ và album sửa ở tab khác). Các suite API, PostgreSQL/API/load/backup, build, production smoke, typecheck và format đạt; 11 test quyền/feed/checklist/fingerprint cuối cũng đạt trên PostgreSQL QA. Không gửi mail thật hoặc dùng dữ liệu production.
