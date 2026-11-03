import type { ScrapElement } from './index.js';
export type ElementDesign = Pick<
  ScrapElement,
  | 'type'
  | 'color'
  | 'font'
  | 'fontSize'
  | 'align'
  | 'opacity'
  | 'animation'
  | 'visualEffect'
  | 'counterStyle'
  | 'counterFill'
  | 'counterStroke'
  | 'counterAccent'
>;
export function captureDesign(e: ScrapElement): ElementDesign {
  const {
    type,
    color,
    font,
    fontSize,
    align,
    opacity,
    animation,
    visualEffect,
    counterStyle,
    counterFill,
    counterStroke,
    counterAccent,
  } = e;
  return {
    type,
    color,
    font,
    fontSize,
    align,
    opacity,
    animation,
    visualEffect,
    counterStyle,
    counterFill,
    counterStroke,
    counterAccent,
  };
}
export function applyDesign(elements: ScrapElement[], ids: string[], style: ElementDesign) {
  if (elements.some((e) => ids.includes(e.id) && e.locked)) return elements;
  return elements.map((e) =>
    !ids.includes(e.id)
      ? e
      : {
          ...e,
          color: style.color,
          font: style.font,
          fontSize: style.fontSize,
          align: style.align,
          opacity: style.opacity,
          animation: style.animation,
          visualEffect: style.visualEffect,
          ...(e.type === 'anniversary' && style.type === 'anniversary'
            ? {
                counterStyle: style.counterStyle,
                counterFill: style.counterFill,
                counterStroke: style.counterStroke,
                counterAccent: style.counterAccent,
              }
            : {}),
        },
  );
}
