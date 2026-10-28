// The whole benchmark in one command (testing speed, 24 Oct): all fifteen numbers (tuneall, test, holdout with the original
// player decks and with corpus5, and the wide set), the same numbers as running bench.js nine times, in about a third of the
// time. Wave 1 works out the engine's picks (old-corpus sets and wide, side by side); wave 2 judges the same picks with corpus5,
// reusing them (RCACHE). Settings such as UP pass through. node benchall.js <engineDir> <label>
const {spawn} = require('child_process'), path = require('path'), fs = require('fs');
const dir = process.argv[2], label = process.argv[3] || 'all', RC = path.resolve(__dirname, '../out/rcache/' + label + '-' + Date.now());
const job = (corpus, set) => new Promise(res => {
  const env = Object.assign({}, process.env, {SCORECHECK: process.env.SCORECHECK || '1', ALSOW: process.env.ALSOW || '3,6', RCACHE: RC});
  if (corpus) env.CORPUS = corpus; else delete env.CORPUS;
  const p = spawn(process.execPath, [path.join(__dirname, 'bench.js'), dir, label + (corpus || ''), set, '--quiet'], {env}), out = [];
  p.stdout.on('data', b => out.push(b)); p.stderr.on('data', b => out.push(b));
  p.on('close', () => { const t = Buffer.concat(out).toString(), m = l => (t.match(new RegExp('^' + l + '.*$', 'm')) || [''])[0];
    res({corpus: corpus || 'old', set, plain: m('MEAN agreement'), weighted: m('MEAN weighted'), err: /Error/.test(t) ? t.slice(-400) : ''}); }); });
const pool = async (jobs, n) => { const out = [], q = jobs.slice(); await Promise.all(Array.from({length: n}, async () => { while (q.length) { const j = q.shift(); out.push(await j()); } })); return out; };
(async () => {
  const t0 = Date.now(), n = Math.max(1, Math.min(4, require('os').cpus().length));
  const w1 = await pool([() => job('corpus5', 'wide'), () => job('', 'tuneall'), () => job('', 'holdout'), () => job('', 'test')], n);
  const w2 = await pool([() => job('corpus5', 'tuneall'), () => job('corpus5', 'holdout'), () => job('corpus5', 'test')], n);
  const all = w1.concat(w2), num = (s, k) => ((s.match(new RegExp(k + ' (-?[\\d.]+)')) || [])[1] || '?');
  const order = [['old', 'tuneall'], ['old', 'test'], ['old', 'holdout'], ['corpus5', 'tuneall'], ['corpus5', 'test'], ['corpus5', 'holdout'], ['corpus5', 'wide']];
  console.log('set                 agree@5 row@5  @10   | weighted agree@5 row@5  @10');
  for (const [c, s] of order) { const r = all.find(x => x.corpus === c && x.set === s); if (!r) continue;
    if (r.err) console.log(c + ' ' + s + ' FAILED: ' + r.err);
    console.log((c + ' ' + s).padEnd(20) + [num(r.plain, 'agreement@5'), num(r.plain, 'row@5'), num(r.plain, '@10')].map(x => x.padEnd(6)).join(' ') + '| ' +
      [num(r.weighted, 'agreement@5'), num(r.weighted, 'row@5'), num(r.weighted, '@10')].map(x => x.padEnd(6)).join(' ')); }
  console.log('done in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  fs.rmSync(RC, {recursive: true, force: true});
})();
