# Bộ rule agent của Little Days

Cập nhật ngày 02/11/2026. Quy tắc thực thi nằm tại [AGENTS.md](../AGENTS.md) ở thư mục gốc; tài liệu này giải thích nguồn và cách duy trì.

## Cách tổ chức

- Root `AGENTS.md` giữ bản đồ mã, các ràng buộc dùng chung và cách chọn kiểm thử. Chi tiết editor/backend/video tiếp tục ở skill tương ứng, được đọc theo phạm vi tác vụ.
- Không đưa lịch sử hội thoại, số lượng test cố định, commit “mới nhất”, secret hay hướng dẫn dài vào rule. Trạng thái triển khai phải được kiểm tra khi cần; roadmap/bằng chứng nằm trong `docs/`.
- Nếu cần rule chỉ áp dụng một thư mục, cân nhắc `AGENTS.md` tại thư mục đó và giữ tương thích với rule gốc. Hiện dự án chỉ cần file gốc; không tạo thêm nhiều file hướng dẫn khi chưa có nhu cầu.
- Giữ mục `Code Review Rules` cho các lỗi dự án cần bắt: quyền riêng tư, mất dữ liệu, upload trùng, sai preview/video và rollout hợp đồng. Không biến code review thành danh sách yêu cầu định dạng đã có trong CI.

## Các quyết định riêng của dự án

| Chủ đề | Nguồn trong repository |
| --- | --- |
| Cấu trúc và schema thực tế | `apps/`, `packages/domain/`, `package.json` |
| Canvas/autosave/undo và font | [Skill editor](../skills/couple-scrapbook-editor/SKILL.md), [giao diện và font](INTERFACE_REFINEMENT.md) |
| Quyền, CAS, quota, backup, xóa tài khoản | [Skill backend](../skills/couple-scrapbook-backend/SKILL.md), [cộng tác](TIMELINE_COLLABORATION.md), [xóa tài khoản](ACCOUNT_DELETION.md) |
| Snapshot, lease và MP4 | [Skill video](../skills/couple-scrapbook-video/SKILL.md) |
| Receipt, cursor, thumbnail và đo hiệu năng | [PERFORMANCE.md](PERFORMANCE.md) |
| Hạ tầng miễn phí, mail, backup và CI | [Hosting](FREE_HOSTING.md), [mail](AUTH_EMAIL.md), [backup](SCHEDULED_BACKUP.md), `.github/workflows/checks.yml`, `render.yaml` |
| Quyền cấp phép đã chọn | [LICENSE.md](../LICENSE.md), [ngoại lệ Remotion](../LICENSE-REMOTION-EXCEPTION.md), [notices](../THIRD_PARTY_NOTICES.md) |

Các lựa chọn đã có cần được tôn trọng: dùng Cloudinary, ưu tiên miễn phí, không tự tạo lại worker cloud và không yêu cầu pilot thật như điều kiện phát triển. Các test tự động và worker/container QA vẫn dùng để kiểm chứng khi phù hợp.

## Cơ sở nghiên cứu

- [OpenAI: Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md): mô tả việc ghép chỉ dẫn từ thư mục gốc tới thư mục con, giới hạn dung lượng và hướng dẫn viết rule review cụ thể. File gốc được giữ làm điểm vào, không thay cấu hình global của người dùng.
- [OpenAI: Rethinking skills and prompts](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): khuyến nghị đọc tài liệu theo nhu cầu, dùng skill làm nơi hướng dẫn chuyên sâu và tránh quy trình/test không cần thiết. Các nguyên tắc được áp dụng cho cấu trúc rule, không buộc dự án dùng một model cụ thể.

## Khi cập nhật tiếp

1. Xác minh rule còn đúng với mã, script và lựa chọn hiện tại của người dùng.
2. Chuyển hướng dẫn dài hoặc bằng chứng theo đợt sang `docs/`; cập nhật mục lục và liên kết.
3. Giữ yêu cầu có thể kiểm tra được; bỏ rule trùng hoặc mâu thuẫn với nguồn chuyên sâu.
4. Với thay đổi chỉ ở rule/tài liệu, kiểm tra diff và liên kết. Không chạy ứng dụng, gửi email hay khởi động worker chỉ để xác nhận một file Markdown.
