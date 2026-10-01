// Assemble src/ (modules ES) + CodeMirror en un seul script classique : dist/app.js.
// Un script classique fonctionne aussi en ouvrant index.html par double-clic (file://),
// contrairement aux modules ES que les navigateurs bloquent dans ce cas.
//
//   node tools/build.mjs           build de production (minifié)
//   node tools/build.mjs --watch   reconstruit à chaque modification (non minifié, avec sourcemap)

import { build, context } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeSourceHash } from './source-hash.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const outfile = join(root, 'dist', 'app.js');

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const { APP_VERSION } = await import(join(root, 'src', 'version.js'));
if (APP_VERSION !== pkg.version) {
  console.error(`Version incohérente : src/version.js (${APP_VERSION}) ≠ package.json (${pkg.version}).`);
  process.exit(1);
}

const sourceHash = await computeSourceHash(root);
const options = {
  entryPoints: [join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
  outfile,
  charset: 'utf8',
  legalComments: 'eof',
  metafile: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  banner: {
    js: `/* L-ISO-CPC ${pkg.version} — fichier généré par tools/build.mjs, ne pas modifier à la main.\n   sources: ${sourceHash} */`,
  },
  logLevel: 'info',
};

await mkdir(join(root, 'dist'), { recursive: true });
await rm(join(root, 'dist', 'app.js.map'), { force: true });

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Surveillance active (Ctrl+C pour arrêter).');
} else {
  const result = await build(options);
  await writeThirdPartyLicenses(result.metafile);
}

/** Écrit dist/THIRD_PARTY_LICENSES.txt avec la licence de chaque paquet embarqué. */
async function writeThirdPartyLicenses(metafile) {
  const packages = new Map();
  for (const input of Object.keys(metafile.inputs)) {
    const parts = relative(root, join(root, input)).split(sep);
    const index = parts.lastIndexOf('node_modules');
    if (index === -1) continue;
    const nameParts = parts[index + 1].startsWith('@') ? parts.slice(index + 1, index + 3) : [parts[index + 1]];
    const dir = join(root, ...parts.slice(0, index + 1), ...nameParts);
    packages.set(nameParts.join('/'), dir);
  }

  const sections = [];
  for (const [name, dir] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const meta = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    let text = '';
    for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license']) {
      try {
        text = await readFile(join(dir, file), 'utf8');
        break;
      } catch {
        // essayer le nom suivant
      }
    }
    sections.push(`${name}@${meta.version} — ${meta.license}\n\n${text.trim() || '(texte de licence non fourni par le paquet)'}`);
  }

  const header =
    'Licences des bibliothèques tierces embarquées dans dist/app.js\n' +
    '==============================================================\n\n';
  await writeFile(join(root, 'dist', 'THIRD_PARTY_LICENSES.txt'), header + sections.join('\n\n' + '-'.repeat(70) + '\n\n') + '\n');
}
