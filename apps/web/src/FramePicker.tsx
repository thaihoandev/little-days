import { element, type Album, type ScrapElement } from '../../../packages/domain/index.js';
import { photoStyleIds, photoStyleNames } from '../../../packages/domain/photo-frames.js';
import { ElementContent } from '../../../packages/scrapbook-renderer/index.js';
import { thumbnailUrl } from './thumbnail.js';
import { signatureFeaturesAvailable } from './signature-features.js';
export function FramePicker({
  album,
  selected,
  onChange,
}: {
  album: Album;
  selected?: ScrapElement;
  onChange: (style: NonNullable<ScrapElement['photoStyle']>) => void;
}) {
  return (
    <div className="frame-picker" role="group" aria-label="Bộ khung ảnh">
      {photoStyleIds
        .filter((id) => id !== 'cutout' && (id !== 'film-35' || signatureFeaturesAvailable()))
        .map((id) => (
          <button
            key={id}
            type="button"
            aria-label={photoStyleNames[id]}
            aria-pressed={(selected?.photoStyle || 'polaroid') === id}
            onClick={() => onChange(id)}
          >
            <span className="frame-sample">
              <span>
                <ElementContent
                  element={element('image', {
                    ...(selected || {}),
                    width: 210,
                    height: 245,
                    photoStyle: id,
                    assetId: selected?.assetId || album.assets[0]?.id || 'demo-1',
                    rotation: 0,
                    frameColor: undefined,
                    text: 'ngày nhỏ',
                    crop: { x: 0, y: 0, width: 1, height: 1 },
                  })}
                  album={{
                    ...album,
                    assets: album.assets.map((a) => ({ ...a, url: thumbnailUrl(a.url) })),
                  }}
                  referenceDate={album.startDate}
                />
              </span>
            </span>
            <small>{photoStyleNames[id]}</small>
          </button>
        ))}
    </div>
  );
}
