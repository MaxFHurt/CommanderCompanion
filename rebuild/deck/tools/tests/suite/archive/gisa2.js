const path = require('path'), H = require('./h.js')(path.resolve(process.argv[2])), X = H.ctx, run = H.run;
const pd = H.retail('wretched-ranks'); H.edh(pd.commander);
console.log(run(`JSON.stringify({decks:EDH.decks, tags:EDH.tags.slice(0, 4).map(t => [t.slug, t.count]), tmapKeys:Object.keys(EDH.tmap), war:['Undead Warchief', 'Champion of the Perished'].map(n => { const c = find(n); return [n, edhOf(EDH.map, c), EDH.tmap.zombies && edhOf(EDH.tmap.zombies, c)]; })})`));
