// Writes build.json from src/version.js, and precache.json (every app file the service worker caches as it installs,
// so the app works offline after the first launch). Run before publishing a release.
import { writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION, BUILD_DATE } from '../src/version.js';
const root = fileURLToPath(new URL('..', import.meta.url));
writeFileSync(join(root, 'build.json'), JSON.stringify({ version: VERSION, date: BUILD_DATE }) + '\n');
// The app: the page, its code, styles, art and the Deck Builder. Not tests, tools, reports, notes or original art.
const SKIP_DIR = new Set(['tests', 'tools', 'reports', 'orig', 'node_modules', '.git', '--json']);
const SKIP_FILE = /\.(md|txt|py|mjs\.map)$|^\.|^--/;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name), rel = relative(root, full).split('\\').join('/');
    if (statSync(full).isDirectory()) { if (!SKIP_DIR.has(name) && rel !== 'deck/tools') walk(full); continue; }
    if (SKIP_FILE.test(name) || rel === 'precache.json' || rel === 'sw.js') continue;
    files.push(rel);
  }
})(root);
files.sort();
writeFileSync(join(root, 'precache.json'), JSON.stringify(['./', ...files]) + '\n');
console.log('build.json →', VERSION, `· precache.json → ${files.length} files`);
