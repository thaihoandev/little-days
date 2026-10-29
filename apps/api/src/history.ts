import type { Album, AlbumVersionSummary } from '../../../packages/domain/index.js';
import { Repository } from './database.js';

export const VERSION_LIMIT = 50;
/** Capture the old album in the same DB statement as its conditional update. */
export class AlbumHistory {
  constructor(private db: Repository) {}
  async init() {
    await this.db.migrate(async () => {
      await this.db.query(`CREATE TABLE IF NOT EXISTS album_versions (
        album_id TEXT NOT NULL, revision INTEGER NOT NULL, owner TEXT NOT NULL,
        payload TEXT NOT NULL, title TEXT NOT NULL, page_count INTEGER NOT NULL,
        captured_at BIGINT NOT NULL, label TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(album_id,revision)
      )`);
      await this.db.query(
        'CREATE INDEX IF NOT EXISTS album_version_owner ON album_versions(owner,album_id,revision)',
      );
      if (this.db.driver === 'sqlite') {
        await this.db
          .query(`CREATE TRIGGER IF NOT EXISTS capture_album_version AFTER UPDATE OF payload ON records
          WHEN OLD.kind='album' AND OLD.payload<>NEW.payload
          BEGIN
            INSERT INTO album_versions(album_id,revision,owner,payload,title,page_count,captured_at)
            VALUES(OLD.id,OLD.revision,OLD.owner,OLD.payload,json_extract(OLD.payload,'$.title'),json_array_length(OLD.payload,'$.pages'),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
            ON CONFLICT(album_id,revision) DO NOTHING;
            DELETE FROM album_versions WHERE album_id=OLD.id AND revision NOT IN
              (SELECT revision FROM album_versions WHERE album_id=OLD.id ORDER BY revision DESC LIMIT ${VERSION_LIMIT});
          END`);
        await this.db
          .query(`CREATE TRIGGER IF NOT EXISTS delete_album_versions AFTER DELETE ON records
          WHEN OLD.kind='album' BEGIN DELETE FROM album_versions WHERE album_id=OLD.id; END`);
      } else {
        await this.db
          .query(`CREATE OR REPLACE FUNCTION little_days_capture_album_version() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF TG_OP='DELETE' THEN
              IF OLD.kind='album' THEN DELETE FROM album_versions WHERE album_id=OLD.id; END IF;
              RETURN OLD;
            END IF;
            IF OLD.kind='album' AND OLD.payload<>NEW.payload THEN
              INSERT INTO album_versions(album_id,revision,owner,payload,title,page_count,captured_at)
              VALUES(OLD.id,OLD.revision,OLD.owner,OLD.payload,OLD.payload::jsonb->>'title',jsonb_array_length(OLD.payload::jsonb->'pages'),CAST(EXTRACT(EPOCH FROM clock_timestamp())*1000 AS BIGINT))
              ON CONFLICT(album_id,revision) DO NOTHING;
              DELETE FROM album_versions WHERE album_id=OLD.id AND revision NOT IN
                (SELECT revision FROM album_versions WHERE album_id=OLD.id ORDER BY revision DESC LIMIT ${VERSION_LIMIT});
            END IF;
            RETURN NEW;
          END $$`);
        await this.db.query('DROP TRIGGER IF EXISTS capture_album_version ON records');
        await this.db.query(
          'CREATE TRIGGER capture_album_version AFTER UPDATE OR DELETE ON records FOR EACH ROW EXECUTE FUNCTION little_days_capture_album_version()',
        );
      }
    });
  }
  async list(albumId: string, owner: string): Promise<AlbumVersionSummary[]> {
    const rows = await this.db.query(
      'SELECT revision,title,page_count,captured_at,label FROM album_versions WHERE album_id=? AND owner=? ORDER BY revision DESC LIMIT ?',
      [albumId, owner, VERSION_LIMIT],
    );
    return rows.map((r) => ({
      revision: Number(r.revision),
      title: String(r.title),
      pageCount: Number(r.page_count),
      capturedAt: new Date(Number(r.captured_at)).toISOString(),
      label: String(r.label),
    }));
  }
  async get(albumId: string, revision: number, owner: string): Promise<Album | undefined> {
    const rows = await this.db.query(
      'SELECT payload FROM album_versions WHERE album_id=? AND revision=? AND owner=?',
      [albumId, revision, owner],
    );
    return rows[0] ? (JSON.parse(String(rows[0].payload)) as Album) : undefined;
  }
  async checkpoint(albumId: string, owner: string, expectedRevision: number, label: string) {
    const title =
      this.db.driver === 'sqlite' ? "json_extract(payload,'$.title')" : "payload::jsonb->>'title'";
    const pages =
      this.db.driver === 'sqlite'
        ? "json_array_length(payload,'$.pages')"
        : "jsonb_array_length(payload::jsonb->'pages')";
    const rows = await this.db.query(
      `INSERT INTO album_versions(album_id,revision,owner,payload,title,page_count,captured_at,label)
      SELECT id,revision,owner,payload,${title},${pages},?,? FROM records WHERE kind='album' AND id=? AND owner=? AND revision=?
      ON CONFLICT(album_id,revision) DO UPDATE SET label=excluded.label RETURNING revision`,
      [await this.db.now(), label, albumId, owner, expectedRevision],
    );
    if (!rows.length) return false;
    await this.db.query(
      `DELETE FROM album_versions WHERE album_id=? AND revision NOT IN
      (SELECT revision FROM album_versions WHERE album_id=? ORDER BY revision DESC LIMIT ?)`,
      [albumId, albumId, VERSION_LIMIT],
    );
    return true;
  }
}
