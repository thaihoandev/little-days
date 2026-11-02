# Little Days — Quy tắc cho agent

## Phạm vi và nguồn chuẩn

Little Days là ứng dụng scrapbook cho cặp đôi: lịch, timeline cộng tác, ảnh riêng tư, thiết kế sổ và video kỉ niệm. Ưu tiên trải nghiệm tiếng Việt, dữ liệu người dùng và hạ tầng miễn phí hiện có.

| Khu vực | Nguồn cần đọc khi thay đổi khu vực đó |
| --- | --- |
| Frontend React/TypeScript | `apps/web/src/`; editor/autosave: [skill editor](skills/couple-scrapbook-editor/SKILL.md) |
| API NestJS, quyền và dữ liệu | `apps/api/src/`; [skill backend](skills/couple-scrapbook-backend/SKILL.md) |
| Hợp đồng dùng chung | Zod/types trong `packages/domain/`; giữ import ESM với đuôi `.js` theo mã hiện có |
| Canvas, viewer, MP4 | `apps/web/src/CanvasEditor.tsx`, `packages/scrapbook-renderer/`, `packages/video/`; [skill video](skills/couple-scrapbook-video/SKILL.md) |
| Hướng dẫn và kế hoạch | [Mục lục](docs/README.md), [trạng thái](docs/IMPLEMENTATION_STATUS.md), [roadmap](docs/DELIVERY_ROADMAP.md) |

Chỉ đọc tài liệu/skill liên quan đến tác vụ. Khi kế hoạch hoặc báo cáo cũ khác mã hiện tại, kiểm tra mã và kiểm thử; không coi mục dự kiến là tính năng đã có.

## Cách thực hiện

- Xem `git status` và diff trước khi sửa; giữ các thay đổi của người dùng. Thực hiện trọn phạm vi đã được giao, tiếp tục các bước sửa/kiểm thử/commit/push đã được ủy quyền trong phiên, không hỏi lại cùng một việc.
- Giải quyết lỗi và rủi ro cụ thể của thay đổi. Ghi đề xuất ngoài phạm vi vào tài liệu/báo cáo thay vì liên tục thêm tính năng khi đang nghiệm thu.
- Khi bàn giao, nêu thay đổi, kiểm thử thực sự đã chạy và giới hạn còn lại. Phân biệt code đã viết, kiểm thử fixture, CI, deploy và xác nhận bằng dữ liệu thật; không ghi nhận pilot người thật đã hoàn thành khi chỉ chạy QA tự động.

## Tài liệu

- Đặt toàn bộ tài liệu hướng dẫn sử dụng, cài đặt, triển khai, vận hành, kế hoạch và báo cáo trong thư mục `docs/`. Khi cần, tạo thư mục con trong `docs/` để tổ chức nội dung.
- Khi thêm hoặc di chuyển tài liệu, cập nhật mục lục `docs/README.md` và các liên kết liên quan. Liên kết trong tài liệu phải dùng đường dẫn tương đối đúng với vị trí mới.
- `README.md` ở thư mục gốc chỉ giữ phần giới thiệu, cách chạy nhanh và liên kết đến hướng dẫn chi tiết trong `docs/`.
- Giữ `AGENTS.md`, các file giấy phép và thông báo bản quyền ở vị trí tiêu chuẩn hiện có. Các file `SKILL.md` tiếp tục nằm trong thư mục skill tương ứng.

## Dữ liệu riêng tư và cấu hình

- `.env*` thật, `data/`, backup và media người dùng là dữ liệu riêng. Không in/commit secret, token, nội dung thư hoặc ảnh thật; không đưa secret vào `VITE_*`, client bundle, URL công khai hay log. Khi cần cấu hình, dùng file mẫu và generator hiện có; không ghi đè `.env` của người dùng.
- Test dùng dữ liệu giả trong `test-results/`, database/schema QA riêng và mail/storage/tile fixture. Đặt rõ `DATA_DIR`, `DATABASE_URL`/`TEST_DATABASE_URL` theo runner; tránh kế thừa cấu hình production. Không tự gửi mail thật, phục hồi backup hoặc chạy cleanup/migration lên dữ liệu thật chỉ để kiểm thử.
- API phải kiểm tra quyền hiện tại cho tài liệu, ảnh gốc/thumbnail/cache, history/trash, bình luận và video. Thu hồi/rời timeline phải chặn request tiếp theo; URL/ID do client gửi không phải bằng chứng quyền truy cập.
- Dùng `MediaStore`, `ResourcePolicy`, `AccountDeletion` và backup lock hiện có. Giữ quota, lịch sử, sổ object và cleanup nhất quán; không xóa media đã công bố khi kết quả commit chưa xác định. Chi tiết trong skill backend.

## Hợp đồng và lưu dữ liệu

- Kiểm tra input bằng schema dùng chung; duy trì tương thích tài liệu đã lưu và cả SQLite/PostgreSQL. SQL/migration mới phải được kiểm tra trên hai driver; không âm thầm đổi storage hoặc dùng local disk thay cho cloud trên host tạm thời.
- Giữ `expectedRevision`/CAS, transaction, lịch sử và fencing bằng lease. Không thay ghi có điều kiện bằng đọc rồi ghi vô điều kiện; không tự ghi đè khi gặp 409 hoặc reset job đang chạy khi khởi động API.
- Thêm loại record/media mới phải xét quyền, quota, backup/restore, retention và xóa tài khoản. Payload/lease credential của job không được đưa vào public response.
- FE/API có thể deploy lệch thời điểm: giữ capability gate của session khi thay hợp đồng. Album summary chỉ dùng để hiển thị; editor và export phải lấy tài liệu/snapshot đầy đủ.

## Giao diện và thiết kế sổ

- Giữ hệ tọa độ thiết kế 720 × 900; zoom là trạng thái xem. Crop, căn chữ, font, trang trí và hiệu ứng phải khớp Canvas/viewer/MP4. Sửa primitive cần đối chiếu cả ba nơi, không chỉ preview.
- Giữ autosave, bản nháp theo tài khoản và undo/redo. Kiểm tra gõ/chèn giữa câu và IME tiếng Việt; popup không được đặt lại focus theo mỗi lần gõ. Dùng thành phần dialog/lightbox trong app cho xác nhận/xem ảnh.
- Giữ phong cách scrapbook hiện có, responsive desktop/mobile, thao tác bàn phím, focus, nhãn cho icon và reduced motion. Có loading/error/empty state riêng; không hiện dữ liệu rỗng trước khi request hoàn tất.

## Hiệu năng và upload

- Theo [PERFORMANCE.md](docs/PERFORMANCE.md): dùng summary/phân trang API, tìm kiếm phía server, debounce và hủy/bỏ qua phản hồi cũ. Cursor phải sắp xếp ổn định, gắn với tài khoản/bộ lọc và tập quyền đã chuẩn hóa.
- Dùng upload receipt/đối soát hiện có; retry có giới hạn cho lỗi tạm thời, không tạo ảnh/quota/history trùng. Hai file được chọn riêng không được gộp chỉ vì cùng bytes. Giữ ảnh gốc; thumbnail có kiểm tra quyền và cache/độ song song hữu hạn.
- Đo điểm chậm trước/sau bằng fixture tái lập: payload, thời gian xử lý và request phù hợp. Nêu rõ khi phép đo không bao gồm mạng/cold start/production; không đổi tính đúng đắn lấy con số nhanh hơn hoặc thêm cache không có giới hạn/invalidation.

## Kiểm chứng theo phạm vi

Dùng Node.js 22.14+ và npm với `package-lock.json`; lệnh chuẩn nằm trong `package.json` và CI trong `.github/workflows/checks.yml`.

| Thay đổi | Kiểm chứng phù hợp |
| --- | --- |
| Chỉ tài liệu/rule agent | Diff, đường dẫn/liên kết và tính chính xác của hướng dẫn; không chạy build/API/render chỉ vì sửa Markdown |
| UI/editor | Typecheck khi sửa TypeScript/hợp đồng, format và suite liên quan qua `node --import tsx scripts/pilot-qa.ts <suite>`; xem desktop/mobile, focus/overflow khi đổi layout |
| API/quyền/upload | Unit liên quan và `npm run test:api`; thay SQL dùng PostgreSQL QA qua `npm run test:postgres` |
| Media/storage/backup | Các runner `test:cloudinary`, `test:s3`, `test:migration`, `test:backup` phù hợp; dùng fixture, không credential thật |
| Video/font/crop/timing | Skill video; runner worker/video liên quan, tải MP4 thật và xem frame khi đổi hình/timing |
| Runtime nhiều luồng hoặc chuẩn bị phát hành | `npm run build`, `npm run test:production`, các kiểm thử bị ảnh hưởng; `npm run test:pilot` cho hồi quy rộng |

- Sửa nguyên nhân khi test lỗi; không nới assertion hoặc bỏ kiểm tra quyền để làm xanh. Khi kiểm tra đã đạt, chỉ chạy lại/mở rộng vì thay đổi mới, lỗi mới hoặc vấn đề còn chưa xác minh.
- Chốt mã trước khi chạy suite dùng Vite/watch; không sửa module được test import giữa lượt chạy. Tránh chạy đồng thời nhiều bộ Chromium/Remotion nặng trên một máy. Dừng service/container QA do mình tạo sau kiểm tra; không ảnh hưởng tiến trình của người dùng.

## Deploy, dependency và giấy phép

- Hạ tầng hiện có: FE Vercel, API Render, PostgreSQL Neon, media Cloudinary và mail Brevo HTTPS. Giữ ưu tiên miễn phí; không tự provision dịch vụ tính phí hoặc worker cloud. Worker QA cô lập được phép; không đồng nhất việc worker cloud đã hủy với cấm kiểm thử video.
- Giữ Render `After CI Checks Pass`/`checksPass`. Khi tác vụ có deploy runtime, xác minh CI của đúng commit và phiên bản đang chạy; push thành công hoặc Vercel thành công không chứng minh API đã deploy. Nếu chỉ sửa tài liệu/rule, báo commit và trạng thái CI đã quan sát, không chờ hàng loạt render/deploy ngoài phạm vi.
- Thêm dependency/asset theo nhu cầu thực tế; giữ các gói Remotion cùng phiên bản. Font phải có tiếng Việt, được bundle cho web/video. Khi đổi dependency/font/nhạc, cập nhật inventory/notices bằng công cụ hiện có và giữ nguồn giấy phép.
- Giữ AGPL-3.0-only cùng ngoại lệ Remotion đã được chủ dự án chấp thuận, các notices và liên kết source. Thao tác phát sinh phí, phá hủy/di chuyển dữ liệu thật hoặc thay quyền cấp phép phải nằm trong phạm vi đã được người dùng ủy quyền. Khi thiếu ủy quyền, chuẩn bị phương án cụ thể và nêu rõ quyết định cần bổ sung trước khi hỏi.

## Code Review Rules

- Báo lỗi khi tài khoản khác/đã bị thu hồi quyền có thể đọc, sửa hoặc tải tài nguyên qua cache, URL cũ, history, trash hoặc export; đối chiếu đường kiểm tra quyền tương ứng.
- Báo lỗi khi thay đổi có thể mất bản nháp, ghi đè sửa đồng thời, nhân đôi upload/quota hoặc xóa ảnh/output đã được commit. Yêu cầu giữ CAS, receipt và lease theo đường ghi hiện có.
- Báo lỗi khi Canvas/viewer/MP4 thể hiện khác nhau, sửa summary như tài liệu đầy đủ, hoặc capability gate cho phép frontend mới gửi hợp đồng backend cũ chưa nhận được.
- Ưu tiên phát hiện lỗi hành vi có bằng chứng và vị trí sửa rõ. Để lint/format cho CI; phân biệt lỗi cần sửa với ý tưởng nâng cấp ngoài phạm vi.
