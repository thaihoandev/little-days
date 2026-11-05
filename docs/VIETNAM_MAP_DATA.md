# Nguồn bản đồ dấu chân

Danh mục dùng **34 tỉnh, thành phố hiện hành**, theo [Nghị quyết 202/2025/QH15](https://xaydungchinhsach.chinhphu.vn/quoc-hoi-thong-qua-nghi-quyet-sap-xep-don-vi-hanh-chinh-cap-tinh-119250612101356465.htm), hoạt động từ 01/07/2025. Địa danh cũ như Hội An, Phú Quốc, Yên Bái vẫn tìm được qua alias và tính vào tỉnh mới tương ứng.

Hình học là **bản tham khảo cho hành trình**, hợp nhất từ polygon cũ theo nhóm tỉnh 2025, chưa phải dữ liệu khảo sát địa giới 2025. Không dùng xác định địa giới pháp lý hoặc phạm vi biển.

- Nguồn: [geoBoundaries gbOpen VNM ADM1](https://www.geoboundaries.org/api/current/gbOpen/VNM/ADM1/), boundary ID `VNM-ADM1-63759600`.
- File cố định: [GeoJSON simplified tại commit 9469f09](https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/VNM/ADM1/geoBoundaries-VNM-ADM1_simplified.geojson).
- Metadata: năm đại diện 2008, build 12/12/2023, 64 vùng; nguồn geoBoundaries/Wikipedia, dữ liệu gốc Public Domain. Sản phẩm gbOpen yêu cầu attribution theo [geoBoundaries](https://www.geoboundaries.org/api.html), CC-BY-4.0.
- Côn Đảo được nhóm vào Bà Rịa–Vũng Tàu cũ rồi Thành phố Hồ Chí Minh hiện hành. `vietnam-province-groups.ts` giữ bảng hợp nhất; `scripts/build-vietnam-map.ts` dùng `polygon-clipping` (MIT) hợp nhất polygon và làm tròn tọa độ 4 chữ số thập phân. Chạy lại: `node --import tsx scripts/build-vietnam-map.ts <file-geojson-nguon>`. Script không tự tải mạng hoặc chạy khi build thường.
- Hoàng Sa và Trường Sa có hai cụm đảo **minh họa**, không theo tỉ lệ và không thể hiện đầy đủ từng đảo. Chọn Hoàng Sa mở Đà Nẵng; chọn Trường Sa mở Khánh Hòa. Hai quần đảo không làm tăng mẫu số 34. Tham khảo [Khánh Hòa và Trường Sa](https://khanhhoa.gov.vn/vi/gioi-thieu-tong-quan-789/lich-su-hinh-thanh).
- File dẫn xuất `packages/domain/vietnam-geometry.ts` được tải theo nhu cầu cùng bản đồ; không gọi dịch vụ geodata/tile khi xem dấu chân. Bản đồ địa điểm dùng tile theo cơ chế riêng hiện có.

Tô vùng dựa vào tọa độ nằm trong polygon. Nhãn địa điểm khớp chính xác alias có thể dùng dự phòng trong phạm vi Việt Nam khi đảo bị giản lược. Hoàng Sa/Trường Sa cần nhãn tương ứng và tọa độ trong vùng minh họa. Không suy tỉnh từ tiêu đề/nội dung hoặc chọn tỉnh gần nhất theo bán kính. Kế hoạch và mốc tương lai không tính là đã đi. Thống kê chỉ phản ánh dấu mốc đã tải và có quyền xem.

Modal giữ bản đồ vừa khung; chỉ danh sách tỉnh/kỉ niệm cuộn riêng. Chọn bằng chuột hoặc bàn phím tô viền theo polygon, không vẽ hộp focus chữ nhật.
