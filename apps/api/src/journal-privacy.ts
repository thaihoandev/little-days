import { createHash } from 'node:crypto';
import type { Repository } from './database.js';
import type { JournalEntry } from '../../../packages/domain/journal.js';
import { ConflictException } from '@nestjs/common';
export function privateSpaceId(owner: string) {
  const value = createHash('sha256')
    .update('little-days:private-space:' + owner)
    .digest('hex')
    .slice(0, 32)
    .split('');
  value[12] = '5';
  value[16] = '8';
  const id = value.join('');
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}
export async function hasSharedHistory(db: Repository, owner: string) {
  return (
    (
      await db.query(
        "SELECT id FROM records WHERE owner=? AND kind IN ('timeline-space','timeline-grant') LIMIT 1",
        [owner],
      )
    ).length > 0
  );
}
export async function freezeLegacyPrivate(db: Repository, owner: string, excludeId?: string) {
  if (await hasSharedHistory(db, owner)) return;
  for (const entry of await db.list<JournalEntry>('journal', owner))
    if (!entry.visibility && entry.id !== excludeId) {
      if (
        !(await db.compareAndSwap('journal', entry.id, owner, entry.revision, {
          ...entry,
          visibility: 'private',
          revision: entry.revision + 1,
        }))
      )
        throw new ConflictException('Dấu mốc vừa thay đổi. Hãy thử lại.');
    }
}
export async function privateEntry(
  db: Repository,
  owner: string,
  entry: Pick<JournalEntry, 'visibility'>,
) {
  return entry.visibility ? entry.visibility === 'private' : !(await hasSharedHistory(db, owner));
}
export function sharedJournalSql(driver: string, alias = 'r') {
  const visibility =
    driver === 'postgresql'
      ? `${alias}.payload::jsonb->>'visibility'`
      : `json_extract(${alias}.payload,'$.visibility')`;
  return `(COALESCE(${visibility}='shared',${driver === 'postgresql' ? 'false' : '0'}) OR (${visibility} IS NULL AND EXISTS(SELECT 1 FROM records privacy_scope WHERE privacy_scope.owner=${alias}.owner AND privacy_scope.kind IN ('timeline-space','timeline-grant'))))`;
}
