import { Heart, LockKeyhole, CalendarDays } from 'lucide-react';

/** Decorative paper counts are bounded; the visible total is the actual server count. */
export function LoveJar({ total }: { total: number }) {
  const count = Math.min(36, Math.max(0, total));
  return (
    <figure className="love-jar-scene" aria-label={`Lọ có ${total} lời thương`}>
      <div className="love-jar-shadow" aria-hidden="true" />
      <div className="love-jar" key={total} aria-hidden="true">
        <div className="love-jar-lid" />
        <div className="love-jar-neck" />
        <div className="love-jar-glass">
          <div className="love-jar-papers">
            {Array.from({ length: count }, (_, i) => (
              <span
                className={'folded-love-paper tone-' + (i % 5)}
                key={i}
                style={{
                  left: 12 + ((i * 37) % 62) + '%',
                  bottom: 13 + Math.floor(i / 6) * 12 + 'px',
                  transform: `rotate(${((i * 29) % 100) - 50}deg)`,
                  animationDelay: Math.min(i * 15, 300) + 'ms',
                }}
              >
                <Heart size={10} />
              </span>
            ))}
          </div>
          <div className="love-jar-reflection" />
          <span className="love-jar-label">
            <Heart size={20} />
            <b>{total.toLocaleString('vi-VN')}</b>
            <small>điều thương</small>
          </span>
        </div>
      </div>
      <figcaption className="jar-rule-icons">
        <span title="Đến ngày hẹn sẽ mở">
          <CalendarDays size={15} />
          Đến hẹn
        </span>
        <i>hoặc</i>
        <span title="Tất cả thành viên phải chủ động đồng ý để mở sớm">
          <LockKeyhole size={15} />
          Cùng đồng ý
        </span>
      </figcaption>
    </figure>
  );
}
