import React from 'react';
import { decoration } from '../domain/decorations.js';
import { counterAppearance } from '../domain/counter.js';
import { photoGeometry } from '../domain/photo-edit.js';
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
  const art = e.type === 'sticker' && decoration(e.decorationId);
  if (art)
    return (
      <ImageComponent
        src={art.src}
        alt={art.name}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
      />
    );
  if (e.type === 'image') {
    const src = (e.assetId && assetData[e.assetId]) || assetUrl(e.assetId, album);
    const metadata = album.assets.find((a) => a.id === e.assetId);
    if (e.photoStyle === 'cutout') {
      const g = photoGeometry(e, metadata),
        size = { width: metadata?.width || 600, height: metadata?.height || 650 };
      return (
        <div
          data-photo-style="cutout"
          style={{
            position: 'absolute',
            left: g.x,
            top: g.y,
            width: g.width,
            height: g.height,
            overflow: 'hidden',
          }}
        >
          {src && (
            <ImageComponent
              src={src}
              alt={e.text || 'Ảnh đã tách nền'}
              draggable={false}
              style={{
                position: 'absolute',
                maxWidth: 'none',
                width: `${(size.width / g.crop.width) * 100}%`,
                height: `${(size.height / g.crop.height) * 100}%`,
                left: `${(-g.crop.x / g.crop.width) * 100}%`,
                top: `${(-g.crop.y / g.crop.height) * 100}%`,
              }}
            />
          )}
        </div>
      );
    }
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
  const counter = e.type === 'anniversary' && counterAppearance(e.counterStyle);
  if (counter)
    return (
      <div
        data-counter-style={e.counterStyle}
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          position: 'relative',
          overflow: 'hidden',
          background: counter.fill,
          border: `1px ${counter.dash.length ? 'dashed' : 'solid'} ${counter.stroke}`,
          borderRadius: counter.radius,
          padding: counter.padding,
          paddingTop: counter.padding + counter.header,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: e.color,
          fontFamily: fonts[e.font],
          fontSize: e.fontSize,
          lineHeight: 1.3,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {counter.header > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: counter.header,
              background: '#ad7b6b',
            }}
          />
        )}
        {displayedText(e, album, referenceDate)}
      </div>
    );
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
