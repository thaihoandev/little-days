import { startS3Fixture } from './s3-fixture.js';
import { startCloudinaryFixture } from './cloudinary-fixture.js';
export async function startStorageFixture(driver = process.env.SMOKE_STORAGE || 's3') {
  if (driver === 'cloudinary')
    return { ...(await startCloudinaryFixture()), driver: 'cloudinary' as const };
  if (driver === 's3') return { ...(await startS3Fixture()), driver: 's3' as const };
  throw new Error('SMOKE_STORAGE must be s3 or cloudinary.');
}
