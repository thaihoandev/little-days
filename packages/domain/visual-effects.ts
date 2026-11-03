export const visualEffects = {
  none: 'Không lặp',
  float: 'Lơ lửng',
  pulse: 'Nhịp thương',
  swing: 'Đung đưa',
} as const;
export function visualMotion(effect: keyof typeof visualEffects | undefined, seconds: number) {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return {
    y: effect === 'float' ? -Math.sin((t * Math.PI) / 2) * 6 || 0 : 0,
    rotation: effect === 'swing' ? Math.sin((t * Math.PI) / 2) * 2.5 : 0,
    scale: effect === 'pulse' ? 1 + Math.sin((t * Math.PI * 2) / 3) * 0.035 : 1,
  };
}
