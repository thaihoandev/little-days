import { useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import {
  Check,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';
import { albumContentSchema, type Album, type Page } from '../../../packages/domain/index.js';
import { Modal } from './Modal.js';
import { downloadFile, imagePdf } from './portable-files.js';
import { api } from './api.js';

export type ExportFormat = 'standard' | 'story' | 'photobooth-strip' | 'album-long' | 'pdf';

const formatOptions: {
  id: ExportFormat;
  title: string;
  badge: string;
  ratio: string;
  size: string;
  description: string;
  icon: typeof Smartphone;
}[] = [
  {
    id: 'pdf',
    title: 'Cuốn sổ PDF',
    badge: 'Tối đa 20 trang',
    ratio: '4:5',
    size: 'Mỗi trang 720 × 900',
    description:
      'Giữ từng trang riêng để đọc và in. PDF dạng ảnh, chưa tìm kiếm được chữ; không kèm nhạc hoặc chuyển động.',
    icon: ImageIcon,
  },
  {
    id: 'album-long',
    title: 'Toàn bộ sổ · ảnh dài',
    badge: 'Tối đa 10 trang',
    ratio: 'Dọc liên tục',
    size: '720 × (900 × số trang)',
    description: 'Ghép các trang theo đúng thứ tự, giữ toàn bộ nội dung và kiểu chữ.',
    icon: ImageIcon,
  },
  {
    id: 'story',
    title: 'Ảnh Story 9:16',
    badge: 'Khuyên dùng cho MXH',
    ratio: '9:16',
    size: '1080 × 1920 px',
    description:
      'Căn giữa chuẩn tỉ lệ Story cho Instagram, Facebook, Zalo, TikTok mà không bị cắt xén lề.',
    icon: Smartphone,
  },
  {
    id: 'standard',
    title: 'Ảnh chuẩn sắc nét',
    badge: 'Khổ gốc 720 × 900',
    ratio: '4:5',
    size: '1080 × 1350 px',
    description: 'Trang thiết kế gốc với độ phân giải cao, phù hợp gửi qua Messenger hoặc in ảnh.',
    icon: ImageIcon,
  },
  {
    id: 'photobooth-strip',
    title: 'Ảnh dài của trang',
    badge: 'Trào lưu 4 ô',
    ratio: '1:2.5',
    size: '720 × 1800 px',
    description: 'Giữ trọn trang hiện tại trên khổ dọc 720 × 1800; không cắt mất chữ hoặc ảnh.',
    icon: Sparkles,
  },
];

export function ShareImageModal({
  album,
  page,
  stageRef,
  onClose,
  ensureReady,
  renderPage,
}: {
  album: Album;
  page: Page;
  stageRef: React.RefObject<Konva.Stage | null>;
  onClose: () => void;
  ensureReady: () => Promise<void>;
  renderPage: (page: Page) => Promise<string>;
}) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('story');
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  // Generate PNG data URL from the Konva stage
  const renderImage = async (format: ExportFormat): Promise<string> => {
    await document.fonts.ready;
    if (format === 'album-long') {
      if (album.pages.length > 10)
        throw Error('Ảnh dài hỗ trợ tối đa 10 trang mỗi lần để bảo vệ bộ nhớ thiết bị.');
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 900 * album.pages.length;
      const context = canvas.getContext('2d');
      if (!context) throw Error('Thiết bị chưa hỗ trợ xuất ảnh.');
      for (let i = 0; i < album.pages.length; i++) {
        const url = await renderPage(album.pages[i]);
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(Error('Chưa đọc được trang ảnh.'));
          image.src = url;
        });
        context.drawImage(image, 0, 900 * i, 720, 900);
      }
      return canvas.toDataURL('image/png');
    }
    if (!stageRef.current) throw new Error('Khung vẽ chưa sẵn sàng.');

    await ensureReady();
    const sourceLayer = stageRef.current.getLayers()[0];
    if (!sourceLayer) throw new Error('Chưa tải được lớp ảnh.');

    const layer = sourceLayer.clone() as Konva.Layer;
    layer.find('Transformer,.editor-overlay').forEach((node) => node.destroy());

    let outputStage: Konva.Stage;

    if (format === 'story') {
      // 720 x 1280 (9:16 Story format)
      outputStage = new Konva.Stage({
        container: document.createElement('div'),
        width: 720,
        height: 1280,
      });

      const bgLayer = new Konva.Layer();
      // Background rect matching page background
      bgLayer.add(
        new Konva.Rect({
          x: 0,
          y: 0,
          width: 720,
          height: 1280,
          fill: page.background || '#fbf9f2',
        }),
      );

      // Header Title
      bgLayer.add(
        new Konva.Text({
          x: 20,
          y: 65,
          width: 680,
          text: '♡ ' + (album.title || 'Ngày mình bên nhau').toUpperCase() + ' ♡',
          fontSize: 20,
          fontFamily: 'serif',
          fill: '#4a4338',
          align: 'center',
          letterSpacing: 2,
        }),
      );

      // Center the page layer vertically: y = (1280 - 900) / 2 = 190
      layer.y(190);

      // Subtle shadow/border around page
      bgLayer.add(
        new Konva.Rect({
          x: 8,
          y: 184,
          width: 704,
          height: 912,
          stroke: 'rgba(0,0,0,0.06)',
          strokeWidth: 2,
          cornerRadius: 6,
        }),
      );

      // Footer Watermark
      const footerLayer = new Konva.Layer();
      footerLayer.add(
        new Konva.Text({
          x: 0,
          y: 1200,
          width: 720,
          text: 'OUR LITTLE DAYS · GIỮ LẠI MỘT CHÚT THƯƠNG',
          fontSize: 12,
          fontFamily: 'sans-serif',
          letterSpacing: 2,
          fill: '#867f70',
          align: 'center',
        }),
      );

      outputStage.add(bgLayer);
      outputStage.add(layer);
      outputStage.add(footerLayer);
      outputStage.draw();
      const dataUrl = outputStage.toDataURL({ pixelRatio: 1.5 });
      outputStage.destroy();
      return dataUrl;
    } else if (format === 'photobooth-strip') {
      outputStage = new Konva.Stage({
        container: document.createElement('div'),
        width: 720,
        height: 1800,
      });
      const bgLayer = new Konva.Layer();
      bgLayer.add(new Konva.Rect({ width: 720, height: 1800, fill: page.background }));
      layer.y(450);
      outputStage.add(bgLayer);
      outputStage.add(layer);
      outputStage.draw();
      const dataUrl = outputStage.toDataURL({ pixelRatio: 1 });
      outputStage.destroy();
      return dataUrl;
    } else {
      // Standard 720 x 900 (pixelRatio: 1.5 = 1080 x 1350)
      outputStage = new Konva.Stage({
        container: document.createElement('div'),
        width: 720,
        height: 900,
      });
      outputStage.add(layer);
      outputStage.draw();
      const dataUrl = outputStage.toDataURL({ pixelRatio: 1.5 });
      outputStage.destroy();
      return dataUrl;
    }
  };

  const handleAction = async (share = false) => {
    try {
      setExporting(true);
      setError('');
      setDownloaded(false);

      if (selectedFormat === 'pdf') {
        await ensureReady();
        await document.fonts.ready;
        const before = await api<Album>('/albums/' + album.id);
        if (
          JSON.stringify(albumContentSchema.parse(before)) !==
          JSON.stringify(albumContentSchema.parse(album))
        )
          throw Error(
            'Cuốn sổ đã có phiên bản mới trên máy chủ. Hãy tải bản mới trước khi xuất PDF.',
          );
        const pages: { jpeg: Uint8Array; width: number; height: number }[] = [];
        let bytes = 0;
        for (const page of album.pages) {
          if (!alive.current) return;
          const url = await renderPage(page),
            image = new Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(Error('Chưa tải được một trang PDF.'));
            image.src = url;
          });
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext('2d');
          if (!context) throw Error('Thiết bị chưa hỗ trợ xuất PDF.');
          context.fillStyle = page.background;
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.94),
          );
          if (!blob) throw Error('Chưa tạo được ảnh trang PDF.');
          const jpeg = new Uint8Array(await blob.arrayBuffer());
          bytes += jpeg.length;
          if (bytes > 32 * 1024 * 1024) throw Error('PDF vượt 32 MiB. Hãy xuất từng trang PNG.');
          pages.push({ jpeg, width: canvas.width, height: canvas.height });
          canvas.width = canvas.height = 1;
        }
        const current = await api<Album>('/albums/' + album.id);
        if (!alive.current) return;
        if (current.revision !== before.revision)
          throw Error('Cuốn sổ vừa thay đổi. Hãy xuất PDF lại.');
        downloadFile(await imagePdf(pages), `little-days-${album.id}.pdf`);
        setDownloaded(true);
        return;
      }

      const dataUrl = await renderImage(selectedFormat);
      if (!alive.current) return;
      const filename = `little-days-${album.id}-${selectedFormat}.png`;

      // If mobile sharing requested and supported
      if (share && navigator.canShare) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'image/png' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: album.title,
            text: 'Một chút thương lưu giữ tại Our Little Days ♡',
          });
          setDownloaded(true);
          return;
        }
      }

      // Default: Direct file download
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setDownloaded(true);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message || 'Chưa thể tạo ảnh lúc này. Vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal title="Chia sẻ trang kỉ niệm" onClose={onClose} className="share-image-modal">
      <div className="share-modal-content">
        <p className="share-modal-intro">
          Xuất ảnh chất lượng cao để chia sẻ lên Story Instagram / Facebook hoặc gửi cho nhau qua
          Messenger:
        </p>

        {/* Format Selector Cards */}
        <div className="share-format-cards" role="radiogroup" aria-label="Chọn định dạng xuất ảnh">
          {formatOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selectedFormat === opt.id;

            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`share-format-card ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedFormat(opt.id);
                  setDownloaded(false);
                }}
              >
                <div className="format-card-header">
                  <div className="format-card-icon">
                    <Icon size={18} />
                  </div>
                  <div>
                    <strong>{opt.title}</strong>
                    <span className="format-card-size">{opt.size}</span>
                  </div>
                  {isSelected && <Check size={18} className="format-card-check" />}
                </div>

                <p className="format-card-desc">{opt.description}</p>
                <span className="format-card-badge">{opt.badge}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {downloaded && (
          <p className="success-banner" role="status">
            ✓ Đã tạo tệp thành công! Bạn có thể lưu hoặc chia sẻ ngay.
          </p>
        )}

        {/* Actions */}
        <div className="share-modal-actions">
          {selectedFormat !== 'pdf' && typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              type="button"
              className="button quiet"
              disabled={exporting}
              onClick={() => void handleAction(true)}
            >
              <Share2 size={16} />
              Chia sẻ nhanh (Story / MXH)
            </button>
          )}

          <button
            type="button"
            className="button primary"
            disabled={exporting}
            onClick={() => void handleAction(false)}
          >
            {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
            {exporting
              ? 'Đang kết xuất…'
              : selectedFormat === 'pdf'
                ? 'Tải cuốn sổ PDF'
                : 'Tải ảnh PNG'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
