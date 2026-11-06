import type { RhythmView } from '../../../packages/domain/rhythm.js';
export const rhythmCache = new Map<string, { at: number; data: RhythmView }>();
export const clearRhythmMemory = () => rhythmCache.clear();
