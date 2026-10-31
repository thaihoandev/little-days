import type { Repository } from './database.js';
import type { Asset } from '../../../packages/domain/index.js';
export type StoredProfile = { displayName: string; avatar?: Asset; revision: number };
export async function profileView(db: Repository, owner: string, fallback = 'Bạn') {
  const profile = await db.get<StoredProfile>('profile', owner);
  return {
    displayName: profile?.displayName || fallback,
    profileRevision: profile?.revision ?? -1,
    ...(profile?.avatar
      ? { avatarUrl: `/api/profiles/${owner}/avatar?v=${profile.avatar.id}` }
      : {}),
  };
}
