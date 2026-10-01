import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { computeSourceHash } from '../../tools/source-hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('dist/app.js est à jour par rapport à src/ (sinon : npm run build)', async () => {
  const bundle = await readFile(join(root, 'dist', 'app.js'), 'utf8');
  const stamped = bundle.match(/sources: ([0-9a-f]+)/)?.[1];
  assert.equal(stamped, await computeSourceHash(root), 'dist/app.js est périmé : lancez « npm run build ».');
});
