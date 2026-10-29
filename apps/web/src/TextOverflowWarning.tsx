import { useEffect, useRef, useState } from 'react';
import {
  type Album,
  type ScrapElement,
  fonts,
  displayedText,
  todayIn,
} from '../../../packages/domain/index.js';
export function TextOverflowWarning({
  element: e,
  album,
}: {
  element: ScrapElement;
  album: Album;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [overflow, setOverflow] = useState(false);
  const text = displayedText(e, album, todayIn(album.timezone));
  useEffect(() => {
    let active = true;
    const check = () => {
      if (!active || !ref.current) return;
      const node = ref.current;
      setOverflow(
        node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1,
      );
    };
    check();
    void document.fonts.ready.then(check);
    return () => {
      active = false;
    };
  }, [text, e.width, e.height, e.font, e.fontSize, e.type]);
  if (!['text', 'anniversary', 'image'].includes(e.type)) return null;
  return (
    <>
      <div
        ref={ref}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          pointerEvents: 'none',
          visibility: 'hidden',
          width: e.type === 'image' ? e.width - 12 : e.width,
          height: e.type === 'image' ? 28 : e.height,
          overflow: 'hidden',
          whiteSpace: e.type === 'image' ? 'nowrap' : 'pre-wrap',
          overflowWrap: 'anywhere',
          fontFamily: e.type === 'image' ? 'Patrick Hand' : fonts[e.font],
          fontSize: e.type === 'image' ? 21 : e.fontSize,
          lineHeight: 1.3,
        }}
      >
        {e.type === 'image' ? e.text : text}
      </div>
      {overflow && (
        <p className="overflow-warning" role="status">
          Nội dung có thể bị cắt trong khung. Hãy tăng kích thước khung, giảm cỡ chữ hoặc rút gọn
          lời nhắn; kiểm tra lại ở Xem album.
        </p>
      )}
    </>
  );
}
