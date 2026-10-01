// Empreinte des sources (src/ + package-lock.json), inscrite dans dist/app.js par le build.
// Le test tests/unit/build-fresh.test.js la recalcule pour détecter un dist/ périmé.

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

export async function computeSourceHash(root) {
  const files = [...(await listFiles(join(root, 'src'))), join(root, 'package-lock.json')];
  const hash = createHash('sha256');
  for (const file of files.map((f) => relative(root, f).split(sep).join('/')).sort()) {
    const content = (await readFile(join(root, file), 'utf8')).replace(/\r\n/g, '\n');
    hash.update(file + '\0' + content + '\0');
  }
  return hash.digest('hex').slice(0, 16);
}
