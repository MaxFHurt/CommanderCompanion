// PAR=n (testing speed, 9 Nov): a check that goes deck by deck splits its decks across n processes (the machine's spare
// cores) and merges what they found, so the result is the same as one process. A child runs with PART=k/n and takes the
// decks whose position in the list is k modulo n; it prints its findings as one 'PART <json>' line.
const {spawn} = require('child_process');
const ARGV = process.argv.slice(1), PART = process.env.PART ? process.env.PART.split('/').map(Number) : null;
module.exports = {
  part: PART,
  mine: i => !PART || i % PART[1] === PART[0],
  first: () => !PART || PART[0] === 0,
  emit: o => console.log('PART ' + JSON.stringify(o)),
  // in the parent with PAR=n: start the n children, hand their findings to merge, and tell the caller to stop (true)
  fan(merge) {
    const n = +process.env.PAR || 1;
    if (PART || n < 2) return false;
    Promise.all([...Array(n)].map((_, k) => new Promise((res, rej) => {
      const p = spawn(process.execPath, ARGV, {env: Object.assign({}, process.env, {PART: k + '/' + n, PAR: ''})});
      let o = '', e = '';
      p.stdout.on('data', d => (o += d));
      p.stderr.on('data', d => (e += d));
      p.on('close', c => { const l = o.split('\n').find(x => x.startsWith('PART ')); l ? res(JSON.parse(l.slice(5))) : rej(new Error('part ' + k + ' failed (' + c + '): ' + e.slice(-400))); });
    }))).then(merge, err => { console.error(String(err.message || err)); process.exit(1); });
    return true;
  }
};
