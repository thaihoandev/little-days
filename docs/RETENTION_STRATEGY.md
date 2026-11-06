# Giữ chân người dùng Little Days

Nghiên cứu 04/11/2026; cập nhật trạng thái 06/11/2026. Recap ảnh theo tuần đã có mã theo [phạm vi triển khai](WEEKLY_DESIGN_REFRESH.md). Nhịp tuần mô tả đóng góp thực tế, chuỗi gần đây và đồng hồ cát 3D đã có theo [phạm vi hiện tại](MAIN_PAGES_AND_SHARED_RHYTHM.md): áp dụng cho mọi thành viên của không gian chung, cho ẩn trên thiết bị, không có mục tiêu bắt buộc hoặc cứu chuỗi. Mục tiêu 3 ngày do cả hai chấp nhận, nhắc thói quen và đo retention dưới đây vẫn là đề xuất. Chưa có kết quả retention hoặc pilot người thật từ QA tự động.

## Chốt hướng

Một vòng lặp: **mở Hôm nay → làm một việc trong 1–2 phút → đón điều người thương gửi → cuối tuần giữ lại một trang kỉ niệm**.

Chỉ ưu tiên ba phần: **một việc nhỏ hôm nay**, **nhịp chung 3 ngày/tuần**, **trang nhìn lại tuần**. Dùng câu hỏi, lọ, timeline và editor sẵn có. Chưa xây trò chơi, tiền xu, bảng xếp hạng hoặc một tab mới cho mỗi hoạt động.

## Cơ sở nghiên cứu

| Nguồn | Điều học được | Giới hạn |
| --- | --- | --- |
| [Paired FAQ](https://www.paired.com/frequently-asked-questions) | Hoạt động ngắn mỗi ngày, trả lời để cùng mở tạo lý do quay lại cụ thể. | Mô tả sản phẩm của nhà cung cấp; không chứng minh hiệu quả của từng cơ chế cho dự án. |
| [Paired, nghiên cứu JMIR 2025](https://mhealth.jmir.org/2025/1/e55433) | Phỏng vấn ghi nhận chuỗi vừa thúc đẩy sử dụng, vừa khiến một số người xem chuỗi thấp của bạn đời như ít quan tâm. | Khảo sát/phỏng vấn có tự chọn người tham gia; không phải bằng chứng nhân quả cho Little Days. |
| [Duolingo về tính linh hoạt của chuỗi](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) | Cho phép nghỉ giúp tiếp tục sau ngày bận; đứt chuỗi có thể làm mất động lực. | Bối cảnh học tập khác quan hệ cặp đôi; không dùng tỉ lệ của họ để dự báo tăng trưởng dự án. |

Suy luận thiết kế: tạo điều thật để trao và giữ, kèm nhịp linh hoạt. Không dùng độ dài chuỗi làm thước đo tình cảm. Danh mục câu hỏi bổ sung phải tự biên soạn, không sao chép bộ câu hỏi độc quyền.

## Đối chiếu mã hiện tại

Đã có câu hỏi ổn định theo ngày, trả lời riêng rồi cùng mở; lọ nhiều lời nhắn với điều kiện ngày/đồng thuận; timeline chung, kế hoạch/checklist, lời nhắc opt-in, Ngày này năm trước và album/thiệp sửa được. Câu hỏi hiện có 60 nội dung luân phiên. Nhịp tuần và chuỗi gần đây tính từ metadata nội dung còn tồn tại/còn quyền; recap ảnh được người dùng chủ động mở/lưu, chưa tự xuất bản hay gửi hằng tuần. Các đợt dưới đây giữ nguyên bối cảnh đề xuất ban đầu; khi khác nhau, dùng phạm vi hiện tại được liên kết ở trên.

Thiếu chủ yếu là thứ tự ưu tiên khi mở web, cảm giác đã hoàn tất và cách biến những lần dùng rời rạc thành vật kỉ niệm. Vì vậy nối tính năng hiện có trước khi tạo hệ hoạt động mới.

## Đợt A — một việc nhỏ trên Hôm nay

Một thẻ gọn ở phần tổng quan ngày, giữ lịch là khu vực chính. Mỗi trạng thái chỉ có một CTA nổi bật:

| Trạng thái | Hiển thị và thao tác |
| --- | --- |
| Chưa ghép đôi | **Giữ một điều hôm nay** trong timeline riêng; mời người thương là lựa chọn phụ, không khóa toàn bộ trải nghiệm. |
| Chưa gửi câu trả lời | Hiện câu hỏi, **Viết một chút** mở đúng form. **Bỏ lời vào lọ** là lựa chọn phụ. |
| Mình đã gửi, còn chờ | **Bạn đã giữ lại một điều hôm nay**; có thể rời app, không phải gửi thêm mới hoàn tất. |
| Hai câu trả lời vừa mở | **Đọc lời của hai đứa**, sau đó **Giữ thành kỉ niệm** bằng luồng hiện có. |
| Có lời trong lọ được phép mở | **Mở một điều thương**, server kiểm tra lại quyền/ngày/đồng thuận. |
| Đã xong | Dấu hoàn tất nhỏ; không popup đòi làm tiếp hoặc nhắc trả lời lần nữa. |

Không thêm thao tác điểm danh rỗng. Một ngày đóng góp chỉ tính khi câu trả lời, lời trong lọ hoặc dấu mốc thật đã lưu thành công. Mở app, refresh, xem quảng cáo, autosave, retry và cron ping không được tính. Không bắt cả hai online cùng lúc.

## Đợt B — nhịp chung thay vì chuỗi cứng

Đề xuất mục tiêu tùy chọn **3 ngày chăm sóc/tuần**. Hai người chủ động chấp nhận; hiển thị bảy chấm ngày và tiến độ như “Tuần này mình đã có 2 ngày cùng giữ điều nhỏ”. Nghỉ một ngày không xóa thành quả. Tuần mới bắt đầu mục tiêu mới; lịch sử tuần trước vẫn còn.

Quy tắc cho implementation:

- Một ngày chung đạt khi mỗi người có ít nhất một đóng góp thành công trong cùng ngày, ở đúng không gian đang tham gia. Không buộc cùng loại hoạt động. Mỗi người tối đa một dấu/ngày dù gửi nhiều lần; vẫn cho gửi nhiều lời vào lọ.
- Không mở nội dung kín để chấm tiến độ. Chỉ dùng metadata đã được phép; không trả text kín hoặc thống kê nội dung cũ cho thành viên mới.
- Khi chưa đủ hai người, xác nhận việc của chính mình. Không đặt chuỗi từng người cạnh nhau, hiển thị giờ online hay lời trách móc; không có bảng “ai chăm hơn”.
- Ban đầu dùng ngày Việt Nam nhất quán với câu hỏi/lọ và thời gian server sau commit. Câu hỏi cũ vẫn giữ ngày nội dung gốc; đóng góp muộn được tính ngày gửi thành công, không âm thầm backdate chuỗi theo đồng hồ client.
- Chưa ghép đôi vẫn dùng được timeline riêng. Nhóm hơn hai thành viên dùng hoạt động hiện có; không gán cơ chế cặp đôi vào nhóm hoặc tạo đối tác giả.
- Rời/thu hồi/mời lại phải kiểm tra quyền và phạm vi thành viên hiện tại. Không tự chuyển tiến độ riêng sang không gian khác hoặc cho người mới xem lịch sử cũ. Xóa tài khoản dọn tiến độ theo cơ chế hiện có.

Chuỗi liên tiếp chỉ cân nhắc sau khi quan sát nhu cầu: opt-in, ẩn được, có chế độ nghỉ rõ ràng. Ngày nghỉ không được giả thành ngày đã làm. Không bán quyền cứu chuỗi, không trừ điểm tình cảm hoặc thưởng bằng cách mở lọ sớm. Ngày hệ thống gián đoạn cần xử lý riêng để không phạt người dùng.

## Đợt C — nhìn lại tuần thành một trang scrapbook

Cuối tuần có một thẻ tính khi mở Hôm nay; chưa cần cron mới hoặc render MP4. Gợi ý tối đa ba điều từ câu hỏi đã mở, dấu mốc chung và lời trong lọ đã được mở hợp lệ. Người dùng chọn/bỏ nội dung rồi **Tạo trang tuần của mình** bằng editor/template hiện có.

Kiểm tra quyền khi đọc và lúc tạo snapshot. Lời kín, câu trả lời chưa mở, ảnh riêng và dữ liệu đã bị thu hồi không được vào recap. Không tự công bố album hoặc tạo link share. Đích lưu cá nhân hay chung phải rõ trước khi xác nhận: album hiện có là dữ liệu cá nhân, không tự kế thừa quyền cộng tác của timeline.

Tuần ít dữ liệu thì hiện một điều hoặc gợi ý viết một dòng, không dựng kỉ niệm AI giả hoặc trang toàn số 0. Snapshot phải đầy đủ, không dùng album summary làm tài liệu editor. Retry/hai người cùng thao tác cần idempotency theo loại đích lưu, không tạo album trùng.

## Nhắc quay lại vừa đủ

Sau lần dùng có giá trị đầu tiên mới hỏi người dùng có muốn nhắc hay không. Mỗi người tự chọn giờ/kênh, tạm dừng/tắt được. Tối đa một nhắc thói quen/ngày/người, bỏ qua nếu đã hoàn tất. Lời nhắc sự kiện do người dùng đặt vẫn là nhóm riêng.

Chỉ nhắc lý do thật: có câu hỏi mới hoặc nội dung được phép mở. Không nói “người kia đang chờ bạn” chỉ vì chưa trả lời; không đưa nội dung kín vào email/notification. Không tự bật Brevo, Web Push hoặc marketing cho mọi tài khoản. Keep-alive không thay thế hệ gửi lời nhắc đúng giờ.

## Đo gì để biết có nên làm tiếp

Chưa thêm SDK theo dõi bên thứ ba. Khi triển khai, đo sự kiện tối thiểu sau thao tác server thành công, không log text/ảnh/email/token:

| Chỉ số | Định nghĩa |
| --- | --- |
| Kích hoạt cặp đôi | Chấp nhận lời mời; trong 7 ngày có câu hỏi cùng mở hoặc cả hai đã lưu đóng góp ở không gian chung. |
| Thời gian tới giá trị đầu | Từ lần đầu dùng đến lưu/đọc nội dung có giá trị thành công; tách cold start/lỗi mạng khỏi bỏ cuộc ở UI. |
| Quay lại tuần 2 | Trong ngày 8–14 sau kích hoạt, cả hai có hoạt động có giá trị ở không gian còn quyền. Mẫu số chỉ gồm cặp đã đủ thời gian quan sát. |
| Nhịp chung | Số không gian có cả hai đóng góp ít nhất 3 ngày/tuần; một lần/ngày/người, không dùng pageview/heartbeat. |
| Vật kỉ niệm | Tỉ lệ xem recap rồi lưu trang; theo dõi lỗi lưu/409/upload và bản trùng. |
| Áp lực/phiền | Tắt nhắc/tiến độ, bỏ form, phản hồi khó chịu; không chỉ nhìn số lần mở tăng. |

Loại cron, QA, worker, refresh nền và retry trùng khỏi số liệu. Đọc nội dung đã mở có thể là giá trị quay lại, nhưng không tính là đóng góp để giữ nhịp. Quy định mục đích/lưu giữ/xóa tài khoản trước khi thu thập; ưu tiên tổng hợp theo tuần, không dựng hồ sơ tâm lý. Mẫu ít thì báo số lượng và mẫu số; không gọi biến động nhỏ là kết quả A/B có ý nghĩa.

## Thứ tự và tiêu chí dừng

1. **A:** ổn định mở app, giữ draft/trạng thái; thêm thẻ một việc nhỏ và đo kích hoạt. Chưa cần chuỗi hay hệ notification mới.
2. **B:** nhịp chung opt-in; chốt ngày/quyền thành viên, CAS/idempotency, backup/xóa tài khoản. Kiểm tra SQLite/PostgreSQL, hai phiên, nửa đêm, retry/offline và thu hồi quyền.
3. **C:** recap dùng nội dung đã mở, cho lưu trong editor. Sau đó mới đánh giá chuỗi liên tiếp hoặc video tuần.

Mỗi đợt phát hành rồi quan sát trước khi mở rộng; không buộc người dùng tổ chức pilot mới. Chưa đủ dữ liệu thì ghi chưa đủ dữ liệu. Dừng mở rộng chuỗi nếu hoạt động đầu tiên chưa dễ hoặc dịch vụ thường xuyên lỗi.

## Chủ động bỏ khỏi giai đoạn này

- Xếp hạng tình cảm, so chuỗi hai người, phạt/bán quyền cứu chuỗi.
- Tiền xu/cửa hàng vật phẩm hoặc nhiệm vụ để mở tính năng cơ bản.
- Chat thay app nhắn tin, feed công khai, mini game không tạo kỉ niệm.
- AI chấm mức yêu nhau/đoán tâm lý từ lời riêng tư, tự viết chuyện như đã xảy ra.
- Mở lọ để thưởng chuỗi, bắt gửi nhiều lời/ngày, nhiều thông báo đòi quay lại.

Chỉ nhận ý tưởng giúp trao một điều thật hoặc giữ kỉ niệm, dùng được trong 1–2 phút và không cần hệ thống riêng quá lớn. Nếu không đạt, để ngoài roadmap hiện tại.
