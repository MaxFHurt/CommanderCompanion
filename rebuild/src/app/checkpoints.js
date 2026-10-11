// Restore points for the judge's Reverse, kept in IndexedDB so they survive an app restart.
// Only the current game's points are kept: starting another game clears the old ones.
// Each point is a full game snapshot (tens of KB), so they never go to localStorage.

import { durableGet, durableSet, durableDelete } from '../data/userdata-db.js';

const INDEX_KEY = 'cc-checkpoints-index';
const pointKey = id => `cc-checkpoint:${id}`;

export function checkpointStore(gameId) {
  let chain = Promise.resolve();
  let index = null;   // { gameId, ids: [] }
  const queue = job => { chain = chain.then(job).catch(error => console.warn('Restore point not saved', error)); return chain; };
  async function readIndex() {
    if (index) return index;
    const saved = await durableGet(INDEX_KEY).catch(() => null);
    if (saved?.gameId === gameId) index = { gameId, ids: [...saved.ids] };
    else {
      for (const id of saved?.ids || []) await durableDelete(pointKey(id)).catch(() => {});
      index = { gameId, ids: [] };
    }
    return index;
  }
  return {
    put(playId, snap) {
      queue(async () => {
        const ix = await readIndex();
        await durableSet(pointKey(playId), snap);
        ix.ids.push(playId);
        await durableSet(INDEX_KEY, ix);
      });
    },
    remove(playIds) {
      if (!playIds.length) return;
      queue(async () => {
        const ix = await readIndex();
        const gone = new Set(playIds);
        for (const id of playIds) await durableDelete(pointKey(id)).catch(() => {});
        ix.ids = ix.ids.filter(id => !gone.has(id));
        await durableSet(INDEX_KEY, ix);
      });
    },
    /** Every saved restore point of this game: Map playId → snapshot. */
    async load() {
      await chain;
      const ix = await readIndex();
      const out = new Map();
      for (const id of ix.ids) {
        const snap = await durableGet(pointKey(id)).catch(() => null);
        if (snap) out.set(id, snap);
      }
      return out;
    },
    flush: () => chain
  };
}
