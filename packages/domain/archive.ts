import type { Album, AudioAsset } from './index.js';
import type { JournalEntry } from './journal.js';
export type ArchiveMedia = { path: string; url: string; bytes: number };
export type PersonalArchive = {
  version: 1;
  actor: string;
  fingerprint: string;
  generatedAt: string;
  albums: Album[];
  journal: JournalEntry[];
  audio: AudioAsset[];
  media: ArchiveMedia[];
};
export const ARCHIVE_MAX_BYTES = 96 * 1024 * 1024;
export const ARCHIVE_MAX_RECORDS = 500;
