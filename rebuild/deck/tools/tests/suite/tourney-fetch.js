// Downloads the tournament comparison data once (needs internet): for each commander, 20 top-16 lists from EDHTop16
// (events of 48+ players, last year; all time when fewer than 10) and the commander's EDHREC page. Writes ../tourney/<slug>.json and ../data2/edhrec/.
// node tourney-fetch.js
const fs = require('fs'), path = require('path');
const LIST = require('./tourney-list.js'), OUT = path.resolve(__dirname, '../tourney'), ED = path.resolve(__dirname, '../data2/edhrec');
const slug = n => String(n).split(' // ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 -]/g, '').trim().replace(/\s+/g, '-');
fs.mkdirSync(OUT, {recursive:true});
(async () => { for (const T of LIST){ for (const tp of ['ONE_YEAR', 'ALL_TIME']){
  const q = `{ commander(name:${JSON.stringify(T.top16)}) { entries(first:20, sortBy:TOP, filters:{minEventSize:48, maxStanding:16, timePeriod:${tp}}) { edges { node { standing tournament { name size tournamentDate } maindeck { name } } } } } }`;
  const j = await (await fetch('https://edhtop16.com/api/graphql', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({query:q})})).json();
  const lists = j.data.commander.entries.edges.map(e => ({standing:e.node.standing, event:e.node.tournament.name, size:e.node.tournament.size, date:e.node.tournament.tournamentDate.slice(0, 10), cards:(e.node.maindeck || []).map(c => c.name)})).filter(x => x.cards.length >= 90);
  if (lists.length < 10 && tp === 'ONE_YEAR') continue;   // too few last year (K'rrik): all time
  fs.writeFileSync(path.join(OUT, slug(T.commander) + '.json'), JSON.stringify({commander:T.commander, partner:T.partner || '', top16:T.top16, fetched:new Date().toISOString().slice(0, 10), lists}));
  const ef = path.join(ED, slug(T.commander) + '.json');
  if (!fs.existsSync(ef)){ const r = await fetch('https://json.edhrec.com/pages/commanders/' + slug(T.commander) + '.json'); if (r.ok) fs.writeFileSync(ef, await r.text()); else console.log('EDHREC missing', T.commander, r.status); }
  console.log(T.commander, lists.length, 'lists', tp); break;
} } })();
