import { useState } from 'react';
export function FirstMemory({ actor, onCreate }: { actor: string; onCreate: () => void }) {
  const key = 'little-days:first-memory:' + actor;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(key) === 'hidden';
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  return (
    <section className="first-memory" aria-label="Kỉ niệm đầu tiên">
      <div>
        <span className="eyebrow">BẮT ĐẦU BẰNG MỘT ĐIỀU THẬT</span>
        <h2>Hôm nay có điều gì bạn muốn giữ?</h2>
        <p>
          Một câu ngắn cũng đủ. Bạn có thể giữ riêng, mời người thương sau và ghép thành trang sổ
          khi đã có ảnh.
        </p>
      </div>
      <div className="row">
        <button className="button primary" onClick={onCreate}>
          Giữ kỉ niệm đầu tiên
        </button>
        <button
          className="button quiet"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(key, 'hidden');
            } catch {}
          }}
        >
          Để sau
        </button>
      </div>
    </section>
  );
}
