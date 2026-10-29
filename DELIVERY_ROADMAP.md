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
- [ ] Triển khai máy chủ/domain thật, xác minh SMTP và receiver cảnh báo.
- [ ] Bật lịch backup, restore drill và đo công suất trên hạ tầng đích.
- [ ] Pilot 3–5 người thật; đối chiếu license và nghiệm thu phát hành.

Docker đã hoạt động và PostgreSQL/container thật đã qua QA. Các bước hạ tầng/pilot thật cần domain, máy chủ và người thử; không thay thế bằng fixture. Chi tiết: OPERATIONS.md, STAGING.md và PILOT.md.
