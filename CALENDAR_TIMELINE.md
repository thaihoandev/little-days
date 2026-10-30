# Lịch, timeline, mẫu scrapbook và thư viện nhạc

Cập nhật 30/10/2026. Trang **Hôm nay** mở mặc định: lịch tháng, ngày sắp tới và kỉ niệm/ghi chú xuất hiện trước danh sách album. Giữ phong cách giấy màu kem, xanh sage và điểm nhấn hồng; bố cục thích ứng điện thoại.

## Lịch và dòng thời gian

- Chọn ngày trên lịch, bấm **Thêm dấu mốc** hoặc **Ghi chú cho ngày…**.
- Nhập tên, ngày, lời nhắn và loại: kỉ niệm, ngày đặc biệt, kế hoạch hoặc ghi chú. Có thể đánh dấu lặp hằng năm; ngày 29/2 hiện vào 28/2 trong năm không nhuận.
- Mỗi dấu mốc có tối đa **6 ảnh**, JPEG/PNG/WebP, **20 MB/ảnh**, tối đa 40 megapixel. Backend xoay ảnh đúng chiều, chuẩn hóa cạnh dài tối đa **1600px**, không phóng ảnh nhỏ, bỏ metadata và lưu JPEG. Ảnh album dùng WebP với cùng quy trình chuẩn hóa.
- Bấm **Lưu dấu mốc** để lưu trên backend. Ghi chú tối đa 5.000 ký tự; tối đa 500 dấu mốc/ghi chú mỗi tài khoản. Đóng biểu mẫu trước khi lưu sẽ bỏ phần đang nhập.
- **Dòng thời gian** có tìm theo tên/nội dung và lọc loại. **Lịch của mình** xem từng ngày; **Sắp đến những ngày đẹp** hiển thị bốn mốc gần nhất và số ngày còn lại.
- **Sửa tiêu đề và mô tả** ở đầu timeline đổi nội dung giới thiệu riêng của tài khoản. Lưu trên backend và giữ sau reload/đổi thiết bị; xung đột giữ nội dung đang nhập, yêu cầu tải lại. Tiêu đề tối đa 160 ký tự, mô tả 600 ký tự.
- Ảnh trên thẻ timeline dùng cụm nhỏ: một ảnh có chiều cao tối đa 165px trên desktop/145px trên mobile; nhiều ảnh xếp mosaic, chỉ hiện ba thumbnail và số ảnh còn lại. Popup vẫn xem đủ toàn bộ ảnh.
- Ngày bắt đầu và kỉ niệm đã có trong album cũng xuất hiện. Bấm **Xem album** để sửa các mục này trong album nguồn.
- Timeline có mốc tháng, đường nối hành trình, thẻ giấy và ảnh lớn; desktop xếp xen kẽ, mobile chuyển về một cột. Các con số ở đầu trang tính từ dữ liệu thật của tài khoản.

Lịch dùng ngày trên múi giờ thiết bị; ngày trong album giữ nguyên giá trị đã lưu. Bản này quản lý ngày, chưa có đặt giờ hay email nhắc lịch tự động. Có thể chọn mốc để tạo scrapbook rồi xuất video từ các trang album được chọn.

## Mẫu có sẵn

Mười bốn mẫu nằm trong hộp tạo album và **Trang sổ → Mẫu có sẵn**:

1. Nhật ký Polaroid.
2. Thư gửi người thương.
3. Những ngày bên nhau.
4. Bưu thiếp chuyến đi.
5. Thước phim nhỏ.
6. Vườn hoa của mình.
7. Một ngày đặc biệt.
8. Chút bình yên.
9. Gom từng chút nhớ.
10. Hoàng hôn rực rỡ — cam đào, hai khung ảnh.
11. Hẹn dưới trời tím — lilac, ảnh và lá thư cạnh nhau.
12. Ngày xanh biển — xanh biển, ba khung ảnh theo hành trình.
13. Bầu trời hai đứa — xanh đêm, chữ vàng và ảnh lớn.
14. Yêu thật nhiều màu — vàng pop, collage vui tươi.

Mỗi mẫu có ảnh xem trước và layout chỉnh sửa được bằng editor hiện có. Khi thêm trang, mẫu nhận ảnh của album đích; không sao chép ảnh riêng của người khác. Mẫu cá nhân vẫn lưu riêng theo tài khoản. Các thiết kế dùng ba theme nền hiện tại, màu giấy riêng và cùng renderer cho editor/viewer/video.

Các mẫu đã được làm lại bằng giấy xé, washi tape, hoa lá, tem, dấu sáp và khung ảnh. Mẫu **Những ngày bên nhau** có ba cột mốc riêng; các mẫu khác có bố cục bưu thiếp, filmstrip, vườn hoa, sinh nhật, tối giản và collage. Gallery hiển thị hình xem trước; **Thêm trang trống** dành cho thiết kế từ đầu. Mẫu mới áp dụng khi tạo album hoặc thêm trang, không sửa layout đã lưu của người dùng.

**Trang trí** có 18 hình vector trong 5 bộ: Giấy & washi, Khu vườn, Lời thương, Chuyến đi và Ngày đặc biệt; giữ lại 6 ký hiệu cũ. Chọn bộ, bấm hình để thêm, rồi kéo/xoay/resize/đổi độ trong và thứ tự lớp. Giấy nền trong mẫu được khóa để tránh kéo nhầm; mở khóa tại **Lớp** khi cần. SVG do mã nguồn tạo, tự chứa toàn bộ đường nét, không tải ảnh từ dịch vụ khác. Chúng được lưu bằng `decorationId` trong phần tử sticker và dùng chung trong canvas/viewer/Remotion; album cũ không có trường này vẫn mở được.

## Thao tác thiết kế nhanh

- Bấm tên sổ trên header để đổi tên; Enter hoặc rời ô để lưu, Escape để hủy. Tên trống không thay thế tên đang có.
- Chọn khung ảnh rồi **Chỉnh / thay ảnh trong khung**, hoặc nhấp/chạm hai lần vào ảnh: kéo ảnh bên trong, phóng 1–8×, dịch ngang/dọc, đặt lại crop, chọn ảnh có sẵn hoặc tải ảnh mới. **Áp dụng ảnh** giữ nguyên vị trí/góc xoay/kích thước khung; **Hủy** bỏ thay đổi crop/ảnh. Ảnh đã upload vẫn được giữ trong thư viện nếu hủy.
- **Giữ tỉ lệ khi kéo khung** bật các tay nắm góc để resize đồng đều; bỏ chọn để kéo riêng ngang/dọc. Khung ảnh có kích thước tối thiểu khi kéo để tránh mất vùng ảnh. Giấy/trang trí đã khóa không chặn thao tác chọn ảnh nằm bên dưới; mở khóa qua panel **Lớp**.
- Khi chưa chọn phần tử, panel trang có tám bảng **Phối màu** để đổi giấy và chữ cùng nhau: kem, đào, tím, biển, đêm, hồng, vàng pop, xanh vườn. Màu chữ trên giấy trang trí sáng được giữ tối; ảnh và SVG giữ nguyên. Có thể hoàn tác toàn bộ phối màu bằng một lần Undo.

Tiêu đề/mô tả timeline được lưu trong `records`, `kind = 'timeline-heading'`, theo owner và revision. Không thêm bảng, biến môi trường hoặc migration riêng. Backup và xóa tài khoản dùng cơ chế records hiện có.

Panel **Trang trí** có 6 mẫu chữ: tiêu đề trang sách, lời nhắn viết tay, trích dẫn, chú thích ảnh, nhãn nhỏ và lá thư ngắn. Mỗi mẫu là phần tử chỉnh được, có font/kích thước/màu/bố cục ban đầu riêng.

Bộ đếm có 6 mẫu bấm thêm nhanh, dùng 5 giao diện **Dòng chữ tối giản / Thẻ giấy / Vé bên nhau / Dấu tròn / Tờ lịch**. Chọn một bộ đếm để đổi **Giao diện bộ đếm** hoặc **Kiểu ngày kỉ niệm** độc lập: số ngày đã bên nhau, đếm ngược hằng năm hoặc mốc số ngày tùy chỉnh. Khi chuyển sang giao diện có khung, editor tăng kích thước tối thiểu để nội dung không bị ép vào khung cũ quá nhỏ. Bộ đếm cũ không có `counterStyle` vẫn dùng cách hiển thị cũ; schema thêm trường tùy chọn, không cần migration.

- Mỗi thumbnail trong **Trang sổ** có icon nhân bản và thùng rác. Xóa cần xác nhận; **Hoàn tác** phục hồi trang. Trang cuối cùng không thể xóa. Xóa trang khác vẫn giữ trang đang xem; xóa trang đang xem chuyển sang trang bên cạnh.
- Xác nhận xóa trang dùng popup trong ứng dụng, mặc định focus **Giữ lại**, có Escape để hủy; không dùng confirm của trình duyệt cho thao tác này.
- Thanh phía trên canvas thêm nhanh chữ, khung ảnh, sticker và tải ảnh. Khung ảnh dùng ảnh đầu tiên đã tải; có thể đổi ảnh trong thuộc tính. Khi chưa có ảnh, tạo khung trống để điền sau.
- Chọn một hoặc nhiều phần tử rồi bấm **Nhân bản**, hoặc **Ctrl/⌘ D**. Bản sao có ID/nhóm mới và lệch 20 đơn vị để dễ nhận ra; tài nguyên ảnh dùng lại cùng album. Giới hạn 50 phần tử/trang vẫn áp dụng.
- **Căn giữa** đặt lựa chọn vào giữa trang; phần tử khóa được bảo vệ. Mỗi thao tác là một bước undo/redo và được autosave như chỉnh sửa thông thường. Phím tắt không chạy khi đang nhập trong form.
- Dropdown có popup màu giấy, bo góc, trạng thái chọn/hover và vùng bấm lớn trên trình duyệt hỗ trợ `appearance: base-select`; trình duyệt khác giữ menu native. Bàn phím và label của select được giữ nguyên.

**Xem album** tự tính kích thước trang từ cả chiều rộng và chiều cao còn lại, giữ nút chuyển trang trong một màn hình, kể cả màn hình ngang thấp. Chọn **Sổ khâu chỉ / Sổ gáy xoắn / Sổ bìa vải** và **Lật trang sổ / Trượt giấy / Mờ nhẹ**. Có thể vuốt ngang, dùng nút hoặc phím mũi tên để chuyển trang; Escape để đóng. Khi hệ điều hành yêu cầu giảm chuyển động, hiệu ứng được tắt. Đây là tùy chọn cách xem, không ghi đè layout hay hiệu ứng xuất video. Nền phía sau được khóa tương tác/cuộn khi xem. Thanh cuộn ở các khu vực cần cuộn dùng tông sage, mảnh và bo tròn.

Ảnh trong timeline và **Ảnh đã lưu** mở bằng popup ngay trên trang. Có tên ảnh, số thứ tự, nút trước/sau, phím mũi tên và Escape; không mở tab mới. Ảnh vẫn đọc từ API riêng tư, không tạo URL chia sẻ công khai.

Ảnh mới được mã hóa ở chất lượng 80, cạnh tối đa 1600px; nếu còn lớn hơn mục tiêu 700 KiB, backend thử 1280px/chất lượng 72, sau đó 1024px/chất lượng 66. Giới hạn tối đa ba lượt mã hóa, không xử lý lặp vô hạn. JPEG được flatten lên nền kem; WebP giữ alpha. Mục đích là giảm dung lượng lưu và tải xuống; file đầu vào vẫn có giới hạn 20 MB/40 MP. Ảnh đã lưu trước bản cập nhật được giữ nguyên; không tự tái nén dữ liệu cũ.

Kiểm tra riêng editor: `npm run test:design`; kiểm tra và chụp cả 9 mẫu: `npm run test:templates`. Runner dùng dữ liệu giả để kiểm tra Ctrl+D, thêm ảnh/chữ/sticker/vector, căn giữa/undo, popup xóa trang, viewer desktop/mobile/landscape, reload và bố cục mobile. `npm run test:pilot` hiện bao gồm 11 luồng QA tự động; pilot người thật vẫn được bỏ qua theo yêu cầu.

## Thư viện nhạc

Trong **Tạo video → Nhạc nền**, chọn và nghe thử bốn bản:

| Bản nhạc | Sắc thái | File nguồn |
| --- | --- | --- |
| Chuông gió dịu dàng | Nhẹ nhàng | `gentle.wav` |
| Nắng qua ô cửa | Ấm áp, phím đàn | `warm-piano.wav` |
| Điệu nhảy của hai đứa | Vui tươi, nhịp ba | `little-waltz.wav` |
| Một chiều bình yên | Êm dịu, ambient | `evening.wav` |

Ba bản bổ sung dài 32 giây được tổng hợp từ nốt nhạc bằng mã trong `scripts/generate-music.mjs`; chạy `npm run music:generate` để tái tạo. Không tải nhạc từ dịch vụ bên ngoài. Track chuông gió có sẵn được giữ lại. Nhạc nền lặp theo thời lượng video, dùng âm lượng và fade của cấu hình video. Bấm **Lưu tùy chọn video** để giữ lựa chọn. Upload nhạc riêng, trim và loop vẫn hoạt động.

Worker chỉ lấy file nhạc từ catalog cố định và đưa bytes vào render; không tải URL nhạc tùy ý. Preview và MP4 dùng chung cấu hình/Remotion composition. API từ chối xuất ba track mới khi chưa thấy worker hỗ trợ catalog mới; chọn Chuông gió hoặc cập nhật worker rồi thử lại.

## Tạo scrapbook từ các dấu mốc

Trong timeline, chọn tối đa 20 mốc rồi bấm **Tạo scrapbook**. Chọn một trong chín mẫu, nhập tên sổ/hai tên và xem trước trước khi lưu. Album mới giữ ngày, toàn bộ lời nhắn và bản sao riêng của ảnh; xóa nguồn không làm mất ảnh trong sổ. Nội dung dài được chia trang, tối đa 20 trang, và vẫn sửa layout/xuất video theo luồng hiện có. Chi tiết: [TIMELINE_SCRAPBOOK.md](TIMELINE_SCRAPBOOK.md).

Không cần migration hay biến môi trường mới. API/frontend cần cùng commit; worker hiện có dùng cùng phiên bản khi xuất video.

## Dữ liệu và quyền riêng tư

Dấu mốc/ghi chú lưu trong bảng **`records`**, `kind = 'journal'`, `owner` là UUID tài khoản/phiên khách. Payload gồm ngày, loại, lời nhắn, lặp hằng năm và metadata ảnh; cột revision kiểm soát cập nhật đồng thời. Không cần migration riêng hoặc biến môi trường mới.

Ảnh nằm tại **`journal/<asset-uuid>.jpg`** trong MediaStore hiện tại (Cloudinary authenticated, S3 hoặc local). API kiểm tra chủ sở hữu trước khi đọc/sửa/xóa; tài khoản khác nhận 404. Link chia sẻ album không mở quyền xem journal. Byte ảnh được tính vào quota tài khoản và được bảo vệ khỏi cleanup khi còn tham chiếu.

Backup toàn bộ bao gồm bản ghi journal và bytes ảnh, có checksum và phục hồi qua MediaStore. Xóa dấu mốc dọn ảnh; xóa tài khoản dọn journal cùng các dữ liệu riêng khác. Sửa/xóa dùng revision; nếu xung đột, biểu mẫu giữ nội dung đang nhập và yêu cầu tải lại. Nếu upload một số ảnh thất bại, phần đã lưu được giữ, thử lại tiếp tục với ảnh còn lại.

## Cập nhật hệ thống đang chạy

Không đổi `.env` và không tạo worker cloud. Cần cập nhật **cả API lẫn worker hiện có** vì cleanup/backup cũng cần hiểu ảnh journal và catalog nhạc mới. Không vận hành lâu dài với API/worker khác phiên bản.

Bản trang trí vector cũng cần API/worker cùng commit: API phải lưu trường `decorationId`, worker phải có catalog SVG và renderer tương ứng. Không cần biến môi trường hay migration database mới.

Bản bộ đếm mới cũng cần API/worker cùng commit để giữ trường `counterStyle` và hiển thị đúng khung của bộ đếm trong MP4. Canvas, viewer và video dùng chung thông số giao diện/cách tính ngày.

1. Dừng worker cũ và các lệnh cleanup/backup offline trong lúc cập nhật.
2. Deploy API trên Render từ commit mới; giữ nguyên Neon, Cloudinary và cấu hình mail. Nếu frontend ở Vercel riêng, deploy frontend cùng commit.
3. Tại nơi đang chạy worker cũ, cập nhật repo và build:

   ```powershell
   git pull --ff-only
   npm ci
   npm run build
   npm run worker:cloud
   ```

   Lệnh cuối dùng `.env.cloud` hiện có, chỉ dành cho worker kết nối database/storage cloud. Với môi trường local dùng `.env`, chạy `npm run worker` sau build hoặc `npm run dev` khi phát triển.
4. Kiểm tra lịch/ghi chú/ảnh sau reload, tạo album từ mẫu mới, nghe thử và xuất video một bản nhạc mới. Chỉ dùng dịch vụ đã có; không thêm tài nguyên tính phí.

Kiểm thử tự động dùng database/storage/mail fixture riêng: `npm test`, `npm run test:journal`, `npm run test:pilot`, `npm run test:api`, `npm run test:backup`, `npm run test:postgres`. Để kiểm tra MP4 nhạc mới qua Cloudinary fixture:

```powershell
$env:SMOKE_STORAGE = 'cloudinary'
$env:SMOKE_MUSIC_ID = 'warm-piano'
npm run test:workers
```

Runner kiểm tra hai worker nhận job một lần, snapshot bất biến và đối chiếu tín hiệu nhạc đã chọn với âm thanh AAC giải mã tại ba vị trí của MP4. Đây là QA cô lập, không phải xác nhận đã deploy hay pilot người thật.
