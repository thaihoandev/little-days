import React from 'react';
import { decoration } from '../domain/decorations.js';
import { counterAppearance, counterMotif } from '../domain/counter.js';
import { visualMotion } from '../domain/visual-effects.js';
import { photoGeometry } from '../domain/photo-edit.js';
import { photoFrame, photoFramePath, filmHoles, film35Holes } from '../domain/photo-frames.js';
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
  if (e.type === 'image')
    return (
      <PhotoArtwork
        element={e}
        album={album}
        assetData={assetData}
        imageComponent={ImageComponent}
      />
    );
  const counter = e.type === 'anniversary' && counterAppearance(e.counterStyle, e);
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
              background: counter.accent,
            }}
          />
        )}
        {counterMotif(e.counterStyle, e.width, e.height, counter.accent) && (
          <ImageComponent
            src={counterMotif(e.counterStyle, e.width, e.height, counter.accent)}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          />
        )}
        <span style={{ position: 'relative' }}>{displayedText(e, album, referenceDate)}</span>
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
  effectTime = 0,
}: {
  page: Page;
  album: Album;
  referenceDate: string;
  assetData?: Record<string, string>;
  imageComponent?: React.ElementType;
  elementStyle?: (e: ScrapElement, index: number) => React.CSSProperties;
  effectTime?: number;
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
        boxShadow: album.presentation?.readingMode === 'scroll' ? 'none' : '0 8px 35px #42342418',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 22,
          border: album.presentation?.readingMode === 'scroll' ? 'none' : '1px solid #9f895622',
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
            <div
              data-visual-effect={e.visualEffect || 'none'}
              style={{
                width: '100%',
                height: '100%',
                transform: `translateY(${visualMotion(e.visualEffect, effectTime).y}px) rotate(${visualMotion(e.visualEffect, effectTime).rotation}deg) scale(${visualMotion(e.visualEffect, effectTime).scale})`,
                transformOrigin: 'center',
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
          </div>
        ))}
    </div>
  );
}

export function PhotoArtwork({
  element: e,
  album,
  assetData = {},
  imageComponent: ImageComponent = 'img',
}: {
  element: ScrapElement;
  album: Album;
  assetData?: Record<string, string>;
  imageComponent?: React.ElementType;
}) {
  const src = (e.assetId && assetData[e.assetId]) || assetUrl(e.assetId, album),
    metadata = album.assets.find((a) => a.id === e.assetId),
    size = { width: metadata?.width || 600, height: metadata?.height || 650 },
    g = photoGeometry(e, metadata),
    f = photoFrame(e);
  const innerShape = f.shape === 'stamp' ? 'rect' : f.shape;
  return (
    <div
      data-photo-style={f.style}
      style={{
        width: e.width,
        height: e.height,
        position: 'relative',
        filter:
          f.style === 'minimal' || f.style === 'cutout'
            ? undefined
            : 'drop-shadow(0 6px 8px #392d2526)',
      }}
    >
      {f.style !== 'cutout' && f.style !== 'minimal' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: f.color,
            clipPath: `path("${photoFramePath(e.width, e.height, f.shape)}")`,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: g.x,
          top: g.y,
          width: g.width,
          height: g.height,
          overflow: 'hidden',
          background: f.style === 'cutout' ? undefined : '#ded8c8',
          clipPath:
            f.style === 'cutout'
              ? undefined
              : `path("${photoFramePath(g.width, g.height, innerShape)}")`,
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
              width: `${(size.width / g.crop.width) * 100}%`,
              height: `${(size.height / g.crop.height) * 100}%`,
              left: `${(-g.crop.x / g.crop.width) * 100}%`,
              top: `${(-g.crop.y / g.crop.height) * 100}%`,
            }}
          />
        )}
      </div>
      {f.tape && (
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
      )}
      {f.caption && (
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
      )}
      {f.style === 'film' &&
        filmHoles(e.width, e.height).map((h, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: h.x,
              top: h.y,
              width: h.width,
              height: h.height,
              borderRadius: 2,
              background: '#f7f0dc',
            }}
          />
        ))}
      {f.style === 'film-35' && (
        <>
          {film35Holes(e.width, e.height).map((h, i) => (
            <span
              key={'35-' + i}
              style={{
                position: 'absolute',
                left: h.x,
                top: h.y,
                width: h.width,
                height: h.height,
                borderRadius: 2,
                background: '#f7f0dc',
              }}
            />
          ))}
          <span
            style={{
              position: 'absolute',
              left: 30,
              bottom: 2,
              width: Math.max(1, e.width - 60),
              height: 12,
              font: '9px "Be Vietnam Pro"',
              lineHeight: '12px',
              color: '#e3c98e',
            }}
          >
            35mm · 01 ▷
          </span>
        </>
      )}
    </div>
  );
}
