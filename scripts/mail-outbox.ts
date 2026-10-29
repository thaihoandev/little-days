import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.env.DATA_DIR || 'data', 'mail');
let files: string[] = [];
try {
  files = (await readdir(root)).filter((file) => /^[a-f0-9-]{36}\.json$/.test(file));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const messages = await Promise.all(
  files.map(
    async (file) =>
      JSON.parse(await readFile(path.join(root, file), 'utf8')) as {
        id: string;
        createdAt: string;
        to: string;
        subject: string;
        text: string;
      },
  ),
);
messages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const idIndex = process.argv.indexOf('--id'),
  selected = process.argv.includes('--latest')
    ? messages[0]
    : idIndex >= 0
      ? messages.find((message) => message.id === process.argv[idIndex + 1])
      : undefined;
if (selected) console.log(selected.subject + '\nTo: ' + selected.to + '\n\n' + selected.text);
else
  console.log(
    JSON.stringify(
      messages.map(({ id, createdAt, to, subject }) => ({ id, createdAt, to, subject })),
      null,
      2,
    ),
  );
