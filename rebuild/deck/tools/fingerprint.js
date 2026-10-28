// The fingerprint of a list of source files, as tools/build.sh writes it into each bundle's first line (and the tests compare):
// the first 16 hex digits of the SHA-256 of the files joined in order. node tools/fingerprint.js <file>...
// As a module: require('./fingerprint.js')(files, baseDir), and .bundle(path) reads the fingerprint a bundle was made from.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
function fingerprint(files, base){ const h = crypto.createHash('sha256'); for (const f of files) h.update(fs.readFileSync(path.join(base || '.', f))); return h.digest('hex').slice(0, 16); }
fingerprint.bundle = file => { try { const m = /sources ([0-9a-f]{16})/.exec(fs.readFileSync(file, 'utf8').slice(0, 300)); return m ? m[1] : null; } catch (e) { return null; } };
module.exports = fingerprint;
if (require.main === module) process.stdout.write(fingerprint(process.argv.slice(2)));
