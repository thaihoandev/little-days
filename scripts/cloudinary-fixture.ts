import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';

/** Signed Upload/Admin/Download HTTP contract fixture. It does not emulate media transforms. */
export async function startCloudinaryFixture() {
  const cloud = 'fixture-cloud',
    apiKey = 'fixture-key',
    secret = 'fixture-secret';
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  const chunks = new Map<string, Buffer[]>();
  const requests: {
    method: string;
    path: string;
    signed: boolean;
    chunked?: boolean;
    publicId?: string;
  }[] = [];
  function signature(params: Record<string, string>) {
    const canonical = Object.keys(params)
      .filter(
        (k) =>
          !['api_key', 'signature', 'file', 'resource_type', 'cloud_name'].includes(k) &&
          params[k] !== '',
      )
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return createHash(params.signature?.length === 40 ? 'sha1' : 'sha256')
      .update(canonical + secret)
      .digest('hex');
  }
  function verify(params: Record<string, string>) {
    const supplied = params.signature || '',
      expected = signature(params);
    return (
      params.api_key === apiKey &&
      supplied.length === expected.length &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    );
  }
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || '/', 'http://localhost');
      const pathname = url.pathname;
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (pathname === `/v1_1/${cloud}/ping`) {
        const signed =
          req.headers.authorization ===
          `Basic ${Buffer.from(`${apiKey}:${secret}`).toString('base64')}`;
        requests.push({ method: req.method || '', path: pathname, signed });
        json(
          signed ? 200 : 401,
          signed ? { status: 'ok' } : { error: { message: 'Unauthorized' } },
        );
        return;
      }
      const route = pathname.match(
        new RegExp(`^/v1_1/${cloud}/(image|video)/(upload|destroy|download)$`),
      );
      if (!route) {
        json(404, { error: { message: 'Not found' } });
        return;
      }
      const [, resourceType, action] = route;
      let params: Record<string, string>;
      let file: Blob | undefined;
      if (req.method === 'GET') {
        params = Object.fromEntries(url.searchParams);
      } else {
        const body: Buffer[] = [];
        for await (const chunk of req) body.push(Buffer.from(chunk));
        const form = await new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': String(req.headers['content-type']) },
          body: Buffer.concat(body),
        }).formData();
        params = {};
        for (const [key, value] of form) {
          if (typeof value === 'string') params[key] = value;
          else if (key === 'file') file = value;
        }
      }
      const signed = verify(params);
      requests.push({
        method: req.method || '',
        path: pathname,
        signed,
        chunked: !!req.headers['content-range'],
        publicId: params.public_id,
      });
      if (!signed || params.type !== 'authenticated') {
        json(401, { error: { message: 'Authenticated, signed requests required' } });
        return;
      }
      const format =
        action === 'download'
          ? params.format
          : params.public_id?.includes('/journal/')
            ? 'jpg'
            : params.public_id?.includes('/audio/')
              ? 'mp3'
              : resourceType === 'video'
                ? 'mp4'
                : 'webp';
      const key = `${params.public_id}.${format}`;
      if (action === 'upload') {
        if (!file) {
          json(400, { error: { message: 'File missing' } });
          return;
        }
        let bytes = Buffer.from(await file.arrayBuffer());
        const range = String(req.headers['content-range'] || '').match(
          /^bytes (\d+)-(\d+)\/(-?\d+)$/,
        );
        if (range) {
          const uploadId = String(req.headers['x-unique-upload-id']);
          const parts = chunks.get(uploadId) || [];
          parts.push(bytes);
          chunks.set(uploadId, parts);
          if (Number(range[3]) === -1) {
            json(200, { done: false });
            return;
          }
          bytes = Buffer.concat(parts);
          chunks.delete(uploadId);
        }
        if (!objects.has(key) || params.overwrite !== 'false')
          objects.set(key, {
            bytes,
            type:
              format === 'mp3'
                ? 'audio/mpeg'
                : resourceType === 'video'
                  ? 'video/mp4'
                  : format === 'jpg'
                    ? 'image/jpeg'
                    : 'image/webp',
          });
        json(200, {
          public_id: params.public_id,
          resource_type: resourceType,
          type: 'authenticated',
          format,
          bytes: objects.get(key)!.bytes.length,
          version: 1,
          done: true,
        });
        return;
      }
      if (action === 'destroy') {
        const existed = objects.delete(key);
        json(200, { result: existed ? 'ok' : 'not found' });
        return;
      }
      if (Number(params.expires_at) <= Date.now() / 1000) {
        json(401, { error: { message: 'Expired' } });
        return;
      }
      const object = objects.get(key);
      if (!object) {
        json(404, { error: { message: 'Resource not found' } });
        return;
      }
      res.writeHead(200, { 'Content-Type': object.type, 'Content-Length': object.bytes.length });
      res.end(object.bytes);
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
    objects,
    requests,
    env: {
      STORAGE_DRIVER: 'cloudinary',
      CLOUDINARY_CLOUD_NAME: cloud,
      CLOUDINARY_API_KEY: apiKey,
      CLOUDINARY_API_SECRET: secret,
      CLOUDINARY_FOLDER: 'contract-test',
      CLOUDINARY_API_BASE_URL: endpoint,
      // The SDK selects its Node HTTP module at import time; scoped to fixture child processes only.
      CLOUDINARY_URL: `cloudinary://${apiKey}:${secret}@${cloud}?upload_prefix=${encodeURIComponent(endpoint)}`,
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
