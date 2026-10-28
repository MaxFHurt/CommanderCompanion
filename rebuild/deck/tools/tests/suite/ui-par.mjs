// Runs the UI suite as N groups side by side (owner's plan, speedup 4, 20 Oct): each group is its own browser on the same test
// server, running the deck-making tests and then its share of the others, balanced by ui-times.json. Same tests, same checks.
// Usage: PW=<playwright> node ui-par.mjs <port> <label> [groups=3]     (FAST=1 passes through)
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const here = path.dirname(new URL(import.meta.url).pathname), port = process.argv[2] || '8765', label = process.argv[3] || 'par', N = +(process.argv[4] || process.env.PAR || 3);
const groups = JSON.parse(fs.readFileSync(path.join(here, 'ui-test.groups.json'), 'utf8')), times = JSON.parse(fs.readFileSync(path.join(here, 'ui-times.json'), 'utf8')).t;
const ALWAYS = new Set(['UI-ID-01', 'UI-AIM-01']), cost = g => g.reduce((a, id) => a + (ALWAYS.has(id) ? 0 : (times[id] != null ? times[id] : 5)), 0);
const plan = Array.from({length:N}, () => []), load = Array(N).fill(0);
// kept apart (ROADMAP, 0.9.3 open finding): after UI-PLAN-02 in the same browser, UI-B81-02's "generate twice gives the same deck"
// fails; in the single-line run other tests sit between them. Not reproduced outside the suite yet.
const APART = [['UI-PLAN-02', 'UI-B81-02']], clash = (k, g) => APART.some(([a, b]) => (g.includes(a) && plan[k].includes(b)) || (g.includes(b) && plan[k].includes(a)));
groups.slice().sort((a, b) => cost(b) - cost(a)).forEach(g => { const ks = load.map((x, k) => k).filter(k => !clash(k, g)).sort((a, b) => load[a] - load[b]), k = ks.length ? ks[0] : load.indexOf(Math.min(...load)); plan[k].push(...g.filter(id => !ALWAYS.has(id))); load[k] += cost(g); });
const OUT = path.resolve(here, '../out'); fs.mkdirSync(OUT, {recursive:true}); const planFile = path.join(OUT, label + '-plan.json'); fs.writeFileSync(planFile, JSON.stringify(plan));
const t0 = Date.now(), lines = Array.from({length:N}, () => []);
const runs = plan.map((_, k) => new Promise(res => { const p = spawn(process.execPath, [path.join(here, 'ui-test.mjs'), port, label + '-g' + k], {env:Object.assign({}, process.env, {SHARD:k + '/' + N, SHARDPLAN:planFile}), cwd:here});
  let buf = ''; const take = d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0){ lines[k].push(buf.slice(0, i)); buf = buf.slice(i + 1); } };
  p.stdout.on('data', take); p.stderr.on('data', take); p.on('close', code => { if (buf) lines[k].push(buf); res(code); }); }));
const codes = await Promise.all(runs), res = new Map(), crash = [];
lines.forEach((L, k) => { L.forEach(l => { const m = /^(PASS|FAIL) (\S+)/.exec(l); if (!m) return; const old = res.get(m[2]); if (!old || m[1] === 'FAIL') res.set(m[2], {pass:m[1] === 'PASS', line:l, k}); });
  if (codes[k] !== 0 || !L.some(l => /passed,/.test(l))) crash.push('group ' + k + ' stopped early: ' + L.slice(-4).join(' / ').slice(0, 400)); });
const fails = [...res.values()].filter(r => !r.pass);
fails.forEach(r => console.log('[group ' + r.k + '] ' + r.line.slice(0, 600))); crash.forEach(c => console.log(c));
const sk = lines.flatMap(L => L.filter(l => /^FAST=1/.test(l))).slice(0, 1); sk.forEach(l => console.log(l));
console.log('\nbuild', (lines[0].find(l => /^build /.test(l)) || 'build ?').split(' ')[1], '|', [...res.values()].filter(r => r.pass).length, 'passed,', fails.length, 'failed in', Math.round((Date.now() - t0) / 1000), 's (' + N + ' groups side by side; planned', load.map(x => Math.round(x)).join(' / '), 's)');
process.exitCode = fails.length || crash.length ? 1 : 0;
