import { readPersonalArchive } from './archive-reader.js';
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const records = await readPersonalArchive(event.data);
    self.postMessage(
      { records },
      { transfer: records.flatMap((r) => r.files.map((f) => f.data.buffer)) },
    );
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
