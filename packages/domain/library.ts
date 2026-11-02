import type { Album, Asset } from './index.js';
import type { JournalEntry } from './journal.js';
export type AlbumSummary = Album & { pageCount?: number };
export type FeedEntry = JournalEntry & { albumId?: string };
export type LibraryPhoto = {
  key: string;
  asset: Asset;
  context: string;
  kind: 'album' | 'milestone';
  date: string;
  albumId?: string;
};
export type LibraryPage<T> = {
  items: T[];
  total: number;
  nextCursor: string | null;
  stats?: { milestones: number; photos: number; upcoming: number };
};
