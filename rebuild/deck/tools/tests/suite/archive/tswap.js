const path = require('path'); process.argv = [process.argv[0], 'x', path.resolve('../candidate'), 'g', 'tuneall', '--quiet']; const B = require('./bench.js'), H = B.H, X = H.ctx, run = H.run;
const d = H.retail('avengers-assemble'); H.edh(d.commander); X.__d = d; X.__b = run('evaluateDeck(__d, {games:300})');
const t0 = Date.now(); for (let i = 0; i < 20; i++) run("swapScore(__d, __b, null, 'Hero\\'s Blade', 'Path to Exile', 1)"); console.log('ms per swapScore', (Date.now() - t0) / 20);
