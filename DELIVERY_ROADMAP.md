# Triển khai phần còn lại

Phạm vi được yêu cầu: quota → retention/cleanup → giám sát → staging/PostgreSQL → load test và pilot, cùng cải thiện editor/video và quy trình backup.

- [x] Quota dung lượng và xuất video nguyên tử, API mức sử dụng và giao diện.
- [x] Retention video, dọn object được ghi nhận và workspace mồ côi; dry-run và lease.
- [x] Log cấu trúc, metrics có bảo vệ và rules cảnh báo vận hành.
- [x] Cấu hình staging HTTPS, PostgreSQL, healthcheck, SMTP, backup và hướng dẫn rollback.
- [x] Công cụ/lịch backup, checksum và drill local/PostgreSQL/container.
- [x] Load smoke ba người dùng/job, đo thời gian và báo cáo SQLite/PostgreSQL.
- [x] Cảnh báo chữ tràn, waveform/trim kéo thả, kiểm tra mobile.
- [x] Checklist pilot, tài liệu và giới hạn kiểm chứng.
- [x] Bổ sung phương án free theo yêu cầu: Render Blueprint, mẫu worker cloud riêng, generator Vercel và hướng dẫn.
- [x] App công khai trên Render, PostgreSQL Neon và Cloudinary; người dùng xác nhận Brevo HTTPS gửi email thật thành công.
- [x] Mã cảnh báo email opt-in, lưu trạng thái chống gửi trùng qua restart, grace/cooldown và CLI kiểm tra.
- [x] Mã backup GitHub Actions theo lịch, snapshot nhất quán có maintenance lease/table locks, AES-256-GCM và restore drill độc lập trước khi upload artifact.
- [ ] Bật receiver cảnh báo trên Render bằng email của người vận hành; xác nhận nhận mail cảnh báo thật.
- [ ] Điền GitHub Secrets/Variables, bật lịch backup và xác nhận run/restore thật theo SCHEDULED_BACKUP.md; đo công suất trên hạ tầng đích.
- [ ] Pilot 3–5 người thật; đối chiếu license và nghiệm thu phát hành.

Worker cloud đã được người dùng hủy; giữ worker hiện tại và không tạo tài nguyên Northflank hoặc dịch vụ tính phí. App đã chạy tại https://little-days-api.onrender.com. Email thật hoàn tất theo xác nhận của người dùng; giám sát/backup/pilot thật vẫn cần kết quả riêng. Chi tiết: OPERATIONS.md, STAGING.md và PILOT.md.
