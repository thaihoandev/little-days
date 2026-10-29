import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
/** A local HTTP contract fixture, not a replacement for a provider integration test. */
export async function startS3Fixture() {
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  const requests: { method: string; path: string; signed: boolean }[] = [];
  const bucket = 'scrapbook-test';
  const server = createServer((req, res) => {
    void (async () => {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      const signed = String(req.headers.authorization || '').startsWith('AWS4-HMAC-SHA256 ');
      requests.push({ method: req.method || '', path: pathname, signed });
      if (!signed) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (req.method === 'HEAD' && pathname.replace(/\/$/, '') === `/${bucket}`) {
        res.writeHead(200);
        res.end();
        return;
      }
      if (!pathname.startsWith(`/${bucket}/`)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const key = decodeURIComponent(pathname.slice(bucket.length + 2));
      if (req.method === 'PUT') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        objects.set(key, {
          bytes: Buffer.concat(chunks),
          type: String(req.headers['content-type'] || 'application/octet-stream'),
        });
        res.writeHead(200, { ETag: '"test-etag"' });
        res.end();
        return;
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        res.writeHead(204);
        res.end();
        return;
      }
      const object = objects.get(key);
      if (req.method === 'GET' && object) {
        res.writeHead(200, { 'Content-Type': object.type, 'Content-Length': object.bytes.length });
        res.end(object.bytes);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/xml' });
      res.end('<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>');
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    endpoint,
    bucket,
    objects,
    requests,
    env: {
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: endpoint,
      S3_BUCKET: bucket,
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'fixture-access-key',
      S3_SECRET_ACCESS_KEY: 'fixture-secret-key',
      S3_FORCE_PATH_STYLE: 'true',
      S3_PREFIX: 'contract-test',
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
