// The single build stamp. Shown on the landing screen and used by the service worker
// to tell one release from the next. Change it once per release, then run `node tools/stamp.mjs` so build.json (which devices check for updates) matches.
export const VERSION = '1.0.0-rebuild.18';
export const BUILD_DATE = '2026-10-04';
