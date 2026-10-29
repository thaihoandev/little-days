import React from 'react';
import {
  type Album,
  type Page,
  type ScrapElement,
  fonts,
  assetUrl,
  displayedText,
  imageCrop,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from '../domain/index.js';

export function ElementContent({
  element: e,
  album,
  referenceDate,
  assetData = {},
  imageComponent: ImageComponent = 'img',
}: {
  element: ScrapElement;
  album: Album;
  referenceDate: string;
  assetData?: Record<string, string>;
  imageComponent?: React.ElementType;
}) {
  if (e.type === 'image') {
    const src = (e.assetId && assetData[e.assetId]) || assetUrl(e.assetId, album);
    const metadata = album.assets.find((a) => a.id === e.assetId);
    const naturalWidth = metadata?.width || 600,
      naturalHeight = metadata?.height || 650;
    const crop = imageCrop(
      naturalWidth,
      naturalHeight,
      e.width - 24,
      Math.max(1, e.height - 50),
      e.crop,
    );
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: 12,
          paddingBottom: 38,
          background: '#fffdf8',
          boxShadow: '0 6px 18px #392d2526',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -9,
            left: '30%',
            width: '40%',
            height: 23,
            background: '#c6b68a88',
            transform: 'rotate(-3deg)',
            zIndex: 2,
          }}
        />
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            position: 'relative',
            background: '#ded8c8',
          }}
        >
          {src && (
            <ImageComponent
              src={src}
              alt={e.text || 'Ảnh kỉ niệm'}
              draggable={false}
              style={{
                position: 'absolute',
                maxWidth: 'none',
                width: `${(naturalWidth / crop.width) * 100}%`,
                height: `${(naturalHeight / crop.height) * 100}%`,
                left: `${(-crop.x / crop.width) * 100}%`,
                top: `${(-crop.y / crop.height) * 100}%`,
              }}
            />
          )}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 6,
            right: 6,
            textAlign: 'center',
            fontFamily: 'Patrick Hand',
            fontSize: 21,
            color: '#655c50',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {e.text}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        fontFamily: fonts[e.font],
        fontSize: e.fontSize,
        lineHeight: 1.3,
        color: e.color,
        textAlign: e.align,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: e.type === 'sticker' ? 'flex' : undefined,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {displayedText(e, album, referenceDate)}
    </div>
  );
}

export function PageArtwork({
  page,
  album,
  referenceDate,
  assetData,
  imageComponent,
  elementStyle,
}: {
  page: Page;
  album: Album;
  referenceDate: string;
  assetData?: Record<string, string>;
  imageComponent?: React.ElementType;
  elementStyle?: (e: ScrapElement, index: number) => React.CSSProperties;
}) {
  return (
    <div
      style={{
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        position: 'relative',
        backgroundColor: page.background,
        backgroundImage: 'radial-gradient(#8e79551c .7px, transparent .7px)',
        backgroundSize: '7px 7px',
        overflow: 'hidden',
        boxShadow: '0 8px 35px #42342418',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 22,
          border: '1px solid #9f895622',
          pointerEvents: 'none',
        }}
      />
      {page.elements
        .filter((e) => e.visible !== false)
        .map((e, i) => (
          <div
            key={e.id}
            style={{
              position: 'absolute',
              left: e.x,
              top: e.y,
              width: e.width,
              height: e.height,
              transform: `rotate(${e.rotation}deg)`,
              transformOrigin: '0 0',
              opacity: e.opacity,
              ...elementStyle?.(e, i),
            }}
          >
            <ElementContent
              element={e}
              album={album}
              referenceDate={referenceDate}
              assetData={assetData}
              imageComponent={imageComponent}
            />
          </div>
        ))}
    </div>
  );
}
