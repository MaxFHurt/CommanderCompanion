// Cards whose role set changed between two engine files. node roles_diff.js <oldEngine.js> <newDir>
const path = require('path'), fs = require('fs'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-')); const nd = path.resolve(process.argv[3]);
['data.js', 'lists.js'].forEach(f => fs.copyFileSync(path.join(nd, f), path.join(tmp, f))); fs.copyFileSync(path.resolve(process.argv[2]), path.join(tmp, 'engine.js'));
const A = require('./h.js')(tmp), B = require('./h.js')(nd);
const la = A.run('LIB.filter(c => c.cmd && !tags(c).land && c.r && c.r < 6000)'), out = [];
for (const c of la){ const b = B.ctx.find(c.n); const ra = [...A.run('tags')(c).roles].sort().join('/'), rb = [...B.run('tags')(b).roles].sort().join('/'); if (ra !== rb) out.push([c.r, c.n, ra, rb, (c.o || '').replace(/\n/g, ' ').slice(0, 140)]); }
out.sort((a, b) => a[0] - b[0]).forEach(x => console.log(String(x[0]).padStart(5), x[1].padEnd(34), (x[2] || '-').padEnd(16), '→', (x[3] || '-').padEnd(16), x[4]));
console.log(out.length, 'changed among the top-6000 cards');
