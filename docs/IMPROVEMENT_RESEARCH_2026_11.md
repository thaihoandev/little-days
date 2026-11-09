# Cải tiến Little Days từ đối chiếu mã và nghiên cứu

Ngày khảo sát: **09/11/2026**. Phạm vi: đọc mã/tài liệu và nguồn chính thức bên ngoài; chưa triển khai runtime, chạy QA hoặc xác minh production. Mức công sức bên dưới là tương đối, chưa phải cam kết thời gian.

## Kết luận

Little Days đã có vòng sử dụng khá đầy đủ: lưu dấu mốc → trao điều nhỏ → nhìn lại tuần → thiết kế sổ. Nên củng cố độ tin cậy, sự thuận tiện và khả năng giữ kỉ niệm lâu dài trước khi thêm nhiều tab, trò chơi hoặc dịch vụ mới. Đề xuất này bổ sung cho [giữ chân người dùng](RETENTION_STRATEGY.md), không coi câu hỏi/lọ/recap/nhịp tuần là tính năng còn thiếu.

Giữ hạ tầng hiện có; không cần Redis, worker cloud mới hay SDK quảng cáo để thực hiện các đợt đầu. Không có thao tác với dữ liệu thật, env hoặc dịch vụ trả phí trong khảo sát này. Tài liệu membership đang soạn được giữ nguyên.

## 1. Ưu tiên độ tin cậy của lưu và bản nháp

**P1 · công sức nhỏ cho sửa lỗi, vừa cho nâng cấp bản nháp.**

Bằng chứng: [useDocument](../apps/web/src/useDocument.ts) đã có CAS, autosave, draft theo tài khoản, Undo/Redo và chặn 409. Tuy nhiên, `localStorage.removeItem(key)` sau PATCH thành công nằm trong cùng `try` với request. Nếu xóa draft ném lỗi, nhánh `catch` chuyển sang trạng thái lỗi dù server đã lưu. Đây là đường lỗi đọc thấy trong mã; chưa tái hiện bằng test.

Áp dụng trước: tách kết quả lưu server khỏi việc dọn draft; thông báo riêng “đã lưu máy chủ, chưa dọn được bản nháp”. Bao phủ trường hợp PATCH thành công nhưng storage ném lỗi bằng test fault injection.

Tiếp theo: đo chi phí serialize/ghi đồng bộ với album lớn trước khi chuyển sang IndexedDB. Khi chuyển, dùng envelope có `schemaVersion`, `baseRevision`, thời điểm cập nhật và tài khoản/album; chỉ xóa bản localStorage cũ sau khi ghi mới thành công. Hai tab phải giữ được hai nhánh nháp hoặc báo xung đột, tránh cùng ghi đè một key. Vẫn PATCH có `expectedRevision`; không tự phát lại bản cũ lên server.

[Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) khuyến nghị xử lý trạng thái hidden vì sự kiện đóng trang không đáng tin trên mobile. [Storage for the web](https://web.dev/articles/storage-for-the-web) giải thích dữ liệu trình duyệt mặc định có thể bị thu hồi. Suy luận áp dụng: lưu nháp đều trong phiên, bổ sung xử lý lifecycle, trạng thái lỗi dung lượng và cách cứu bản nháp; không hứa browser storage là backup. Đăng ký `beforeunload` khi còn thay đổi chưa lưu. Không phụ thuộc vào việc request mạng cuối cùng chắc chắn chạy xong.

Nghiệm thu: mất mạng/reload, storage bị chặn/đầy, hai tab, 409, đổi tài khoản, gõ IME và sửa trong khi request lưu đang chạy. Phân biệt rõ “trên thiết bị” và “đã lưu máy chủ”.

## 2. Trở lại đúng chỗ đang xem

**P1 · công sức vừa.**

Bằng chứng: [useAppRoute](../apps/web/src/useAppRoute.ts) gọi `window.scrollTo({ top: 0 })` khi điều hướng chủ động. [Tài liệu hiệu năng](PERFORMANCE.md) xác nhận cache hiện giữ payload từng trang, chưa giữ vị trí cuộn hoặc toàn bộ các trang đã mở rộng. Đây là khoảng trống trải nghiệm, không phải bằng chứng mọi trường hợp Back đều mất vị trí.

Áp dụng: giữ bộ lọc, ngày lịch, nhóm timeline mở và vị trí đọc theo từng history entry. Dùng ID card làm mốc phục hồi khi chiều cao ảnh thay đổi; bộ nhớ có giới hạn và tách theo tài khoản/phạm vi. Sau khi xác minh quyền mới phục hồi nội dung; nguồn bị xóa/thu hồi thì về vị trí hợp lệ gần nhất. Không tái sử dụng dữ liệu riêng tư cũ chỉ để cuộn nhanh.

[web.dev về bfcache](https://web.dev/articles/bfcache) mô tả khôi phục toàn trang và yêu cầu cập nhật dữ liệu nhạy cảm sau khôi phục. Bfcache khác điều hướng SPA: cần kiểm tra riêng `pageshow` sau Back từ trang khác và lịch sử nội bộ React.

Nghiệm thu: mở ảnh/editor rồi quay lại đúng card, giữ truy vấn khi Back/Forward; logout hoặc thu hồi ở tab khác không làm sống lại nội dung cũ. Không tăng request đọc tài liệu đầy đủ để phục hồi scroll.

## 3. Cho người dùng mang kỉ niệm ra khỏi ứng dụng

**P2 · công sức lớn; tách ZIP trước, PDF sau.**

Bằng chứng: có [xuất PNG](../apps/web/src/ShareImageModal.tsx), API video và backup vận hành. Trong các luồng được khảo sát chưa thấy chức năng tự tải toàn bộ dữ liệu tài khoản dưới dạng lưu trữ có cấu trúc. Backup toàn hệ thống không thay thế gói xuất dành cho từng người.

[Day One](https://dayoneapp.com/guides/tips-and-tutorials/exporting-entries/) phân biệt PDF để đọc/in và JSON kèm media để lưu trữ/tái nhập. Suy luận áp dụng:

- ZIP gồm manifest có phiên bản, JSON, ảnh đang lưu và bản Markdown/HTML đơn giản đọc được khi không còn ứng dụng. Bắt đầu với dữ liệu cá nhân đang có quyền, chốt riêng quy tắc xuất nội dung chung trước khi mở rộng. Không đưa lời kín/chưa mở, thông tin xác thực hoặc dữ liệu tài khoản khác vào gói.
- Job có snapshot/quota/lease/retention; kiểm tra lại quyền khi tạo, xử lý và tải, hủy hoặc từ chối nếu phạm vi quyền không còn hợp lệ. Dùng `MediaStore`, `ResourcePolicy`, backup lock và cơ chế xóa tài khoản hiện có.
- Sau đó thêm PDF từng trang từ cùng renderer 720 × 900; không ghép toàn sổ thành canvas khổng lồ. Giữ font tiếng Việt, crop và thứ tự lớp. Đợt đầu có thể là PDF ảnh, cần nói rõ chữ chưa tìm kiếm được và ảnh có giới hạn độ phân giải.

Lưu ý: [pipeline upload](../apps/web/src/image-upload.ts) có thể tối ưu ảnh trước khi gửi. Gói xuất chỉ đảm bảo bytes đang lưu, không hứa khôi phục file máy ảnh trước tối ưu. Không tự thay chính sách lưu ảnh trong đề xuất này.

Nghiệm thu: checksum media/manifest, giải nén và đọc được ngoại tuyến, phạm vi tài khoản, thu hồi giữa job, xóa tài khoản, album nhiều trang và xem trang PDF tiếng Việt. Việc thêm import lại là hạng mục riêng.

## 4. Làm mới câu hỏi nhưng giữ vòng mở nội dung ổn định

**P2 · công sức vừa, có cả biên tập nội dung.**

Bằng chứng: [catalog](../packages/domain/couple.ts) có 60 câu hỏi; [CoupleRituals](../apps/api/src/couple-rituals.ts) chọn theo ngày cộng offset của không gian, modulo độ dài catalog. Thêm câu vào mảng làm thay đổi lịch chọn mới; cần giữ nguyên nội dung vòng đã tạo.

[Paired FAQ](https://www.paired.com/frequently-asked-questions) mô tả hoạt động ngắn, trả lời để mở câu của đối tác và nội dung theo chủ đề. Đây là tham khảo thiết kế sản phẩm, không phải bằng chứng Little Days sẽ tăng retention.

Áp dụng: tự biên soạn bộ câu hỏi theo chủ đề nhẹ như biết ơn, kỉ niệm, hẹn hò và dự định; dùng ID/version ổn định và hạn chế lặp gần đây. Cho chọn tránh chủ đề nhạy cảm. Lựa chọn chủ đề phải thống nhất ở không gian, còn vòng đã có người trả lời không được đổi câu bên dưới. Giữ cơ chế ngày Việt Nam, quyền hiện tại và câu trả lời kín; không lấy lời riêng tư gửi AI để cá nhân hóa.

Nghiệm thu: vòng cũ không đổi sau cập nhật catalog; hai thành viên/thiết bị thấy cùng câu; retry/nửa đêm không tạo vòng trùng; việc bỏ chủ đề không làm lộ nội dung chưa mở. Không sao chép câu hỏi độc quyền.

## 5. Giúp lần sử dụng đầu tạo được một kỉ niệm

**P2 · công sức nhỏ đến vừa.**

Bằng chứng: [WeeklyRecap](../apps/web/src/WeeklyRecap.tsx) đã có trạng thái hướng dẫn khi chưa có không gian chung; [chiến lược retention](RETENTION_STRATEGY.md) đã đề xuất một hành động ngắn trên Hôm nay. Không cần thêm tour nhiều popup.

Áp dụng: mỗi trạng thái trống dẫn đến một kết quả thật: lưu dấu mốc đầu tiên → mời người thương khi muốn → tạo trang sau khi có dữ liệu. Cho tiếp tục dùng riêng; dữ liệu mẫu chỉ là preview tách biệt, không tự chèn vào timeline thật. Cho bỏ qua và tiếp tục sau.

Nghiệm thu: tài khoản mới và chưa ghép đôi đều lưu được dấu mốc; reload giữ tiến trình; UI không lặp lời mời đã bỏ qua; không nhận nhầm loading/error thành empty. Đo thời gian đến lần lưu thành công, không dùng số lần bấm tour làm kết quả.

## 6. Rà soát thao tác chạm theo WCAG 2.2

**P2 · công sức vừa; sửa theo kết quả kiểm tra cụ thể.**

Bằng chứng: editor có kéo/resize và recap đã có nút lên/xuống trong [RecapComposer](../apps/web/src/RecapComposer.tsx). Không kết luận toàn app thiếu bàn phím hoặc không đạt WCAG chỉ từ khảo sát mã.

[W3C về kéo thả](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) yêu cầu cách thao tác con trỏ đơn không cần kéo khi áp dụng; chỉ hỗ trợ phím chưa đủ cho người dùng cảm ứng. [WCAG 2.2](https://www.w3.org/TR/WCAG22/#target-size-minimum) quy định kích thước mục tiêu tối thiểu 24 × 24 CSS px với các ngoại lệ.

Áp dụng: kiểm tra nút đổi thứ tự, crop/zoom, căn chỉnh và chọn lớp; bổ sung nút hoặc ô nhập ở chỗ chỉ kéo mới làm được. Dùng 44 × 44 px làm mục tiêu thiết kế thuận tiện cho nút chạm quan trọng, không ghi nhầm đó là ngưỡng tối thiểu của tiêu chí 2.5.8. Kiểm tra focus sau đóng dialog, tên nút icon và trạng thái lưu được đọc bởi screen reader.

Nghiệm thu: desktop bàn phím, mobile 320/390 px, zoom trình duyệt, reduced motion; kiểm tra riêng Canvas/viewer khi có điều khiển tương ứng. Không hứa đạt toàn bộ WCAG khi mới kiểm tra một phần.

## 7. Đo trải nghiệm trước khi tối ưu thêm

**P1 cho benchmark fixture · P2 cho đo tổng hợp production khi có thiết kế dữ liệu.**

Bằng chứng: [observability API](../apps/api/src/observability.ts) có mã trạng thái/thời gian request; [PERFORMANCE.md](PERFORMANCE.md) đã có benchmark và bytes bundle. Tìm trong mã web chưa thấy `PerformanceObserver`/`onINP`/`onLCP`; đây là kết quả tìm kiếm, không chứng minh không có giám sát ngoài repository.

Áp dụng trước: benchmark tái lập các luồng mở Hôm nay, ảnh → quay lại, gõ chữ trong album lớn, lưu và recap; ghi số request, bytes, long task và bộ nhớ. Tách cold start API, mạng, xử lý server và render client.

Nếu thêm đo thực tế, chỉ thu bucket thiết bị/mạng và số đo cho phép; không gửi URL chứa ID, text, ảnh, email hoặc token. Giới hạn mẫu, retention và payload; thiết kế xóa dữ liệu phù hợp trước khi lưu định danh. [web.dev](https://web.dev/articles/optimize-inp) dùng INP tốt ≤ 200 ms tại phân vị 75, tách mobile/desktop; đây là mục tiêu tham chiếu, chưa phải kết quả Little Days.

Nghiệm thu: có phép đo trước/sau cùng fixture; không lấy gzip hoặc p95 API thay cho độ phản hồi giao diện. Với ít người dùng chỉ báo số mẫu, không suy ra kết luận retention/A/B.

## 8. Nối kế hoạch với lịch người dùng đang sử dụng

**P3 · công sức nhỏ đến vừa cho xuất sự kiện đơn; đồng bộ hai chiều lớn hơn nhiều.**

[Cupla](https://cupla.app/) cho thấy lịch chung đi cùng lịch thiết bị là một hướng sản phẩm phù hợp. Little Days đã có kế hoạch/checklist và nhắc ngày, nên thử nút tải `.ics` cho một sự kiện do người dùng chủ động chọn trước khi làm OAuth Google/Apple hoặc đồng bộ hai chiều.

Đây là ý tưởng sản phẩm, cần đọc đặc tả iCalendar và tài liệu calendar client khi triển khai. Xử lý đúng all-day, múi giờ, ngày lặp, ký tự/line folding và UID ổn định. Xác nhận nội dung sẽ ra ngoài Little Days; không tự xuất vị trí/ghi chú kín hoặc lịch chung hàng loạt. File đã tải không thể bị thu hồi theo quyền trong ứng dụng.

Nghiệm thu: nhập vào Google/Apple/Outlook bằng fixture, không lệch ngày và mô tả rõ đây là bản sao, chưa tự cập nhật. Không thêm cron hoặc gửi mail thật để thử.

## Thứ tự thực hiện và giới hạn

1. Sửa đường báo lỗi lưu do dọn draft; thiết lập benchmark cho album lớn và kiểm tra lifecycle/hai tab.
2. Phục hồi vị trí đọc và xử lý các thiếu sót thao tác chạm có bằng chứng. Chỉ chuyển IndexedDB sau khi đã chốt migration và xung đột bản nháp.
3. Làm ZIP dữ liệu cá nhân; PDF là đợt kế tiếp khi renderer và giới hạn bộ nhớ đã được kiểm chứng.
4. Bổ sung catalog câu hỏi và hướng dẫn lần đầu; thử `.ics` nếu nhu cầu nối lịch xuất hiện.

Chưa ưu tiên chat mới, feed công khai, AI suy đoán tình cảm, ads trong nội dung riêng tư hoặc hạ tầng hàng đợi mới. E2EE là hướng đáng nghiên cứu riêng, có thay đổi lớn về quản lý khóa, chia sẻ, khôi phục và render server; không thể thêm như một cờ cấu hình. Không gọi hệ thống hiện tại là E2EE chỉ vì có HTTPS và kiểm tra quyền.

Chưa chạy test/build vì lần này chỉ tạo tài liệu nghiên cứu. Chưa đo thiết bị thật, dữ liệu người dùng, CI/deploy hay xác nhận cải thiện retention. Backup thật đã được người dùng xác nhận theo hồ sơ hiện có; không đề nghị bật lại chỉ vì mục việc cũ trong tài liệu trạng thái chưa đồng bộ.
