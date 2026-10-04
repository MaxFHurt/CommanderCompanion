// Writes build.json from src/version.js. Run before publishing a release.
import { writeFileSync } from 'node:fs';
import { VERSION, BUILD_DATE } from '../src/version.js';
writeFileSync(new URL('../build.json', import.meta.url), JSON.stringify({ version: VERSION, date: BUILD_DATE }) + '\n');
console.log('build.json →', VERSION);
