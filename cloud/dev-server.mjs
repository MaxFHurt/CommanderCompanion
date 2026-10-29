// Runs worker.js on this computer for tests: node cloud/dev-server.mjs [port]
// The Durable Objects are kept in memory, so every restart starts with no games.
// Open the app with ?online=http://127.0.0.1:8787 to use it.

import http from 'node:http';
import worker, { GameStore } from './worker.js';

const port = Number(process.argv[2] || 8787);

function memoryStorage() {
  const data = new Map();
  return {
    async get(key) {
      if (Array.isArray(key)) return new Map(key.filter(k => data.has(k)).map(k => [k, structuredClone(data.get(k))]));
      return data.has(key) ? structuredClone(data.get(key)) : undefined;
    },
    async put(entries) { for (const [k, v] of Object.entries(entries)) data.set(k, structuredClone(v)); },
    async delete(keys) { for (const k of [].concat(keys)) data.delete(k); },
    async deleteAll() { data.clear(); },
    async setAlarm() {}
  };
}

const objects = new Map();
// Like Cloudflare, one object handles one request at a time.
const queues = new Map();
const env = {
  GAMES: {
    idFromName: name => name,
    get(id) {
      if (!objects.has(id)) objects.set(id, new GameStore({ storage: memoryStorage() }));
      const obj = objects.get(id);
      return {
        fetch(input, init) {
          const run = () => obj.fetch(new Request(input, init));
          const next = (queues.get(id) || Promise.resolve()).then(run, run);
          queues.set(id, next.catch(() => {}));
          return next;
        }
      };
    }
  }
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  const out = await worker.fetch(request, env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Online games test server on http://127.0.0.1:${port}`));
