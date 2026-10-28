const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), run = H.run;
console.log(run('JSON.stringify({canLead:canLead(find("Karn, Living Legacy")), kozilek:canLead(find("Kozilek, the Great Distortion"))})'));
