// Fetches Scryfall community tags (Tagger "oracletag") for the engine redesign (owner: Scryfall tags yes, 20 Oct).
// For each tag: every card that carries it (oracle_id and name only). One request every 120 ms, as Scryfall asks; resumable.
// node tools/rules/fetch/scryfall-tags.js <out.json> [tag ...]   (no tags: the list below)
const fs = require('fs');
const TAGS = process.argv.slice(3).length ? process.argv.slice(3) : (`ramp mana-rock mana-dork land-ramp ritual cost-reducer card-advantage draw cantrip wheel impulse loot rummage tutor
removal spot-removal creature-removal artifact-removal enchantment-removal planeswalker-removal boardwipe sweeper counterspell bounce edict burn
hatebear protection protects-creature gives-indestructible gives-hexproof evasion unblockable gives-flying gives-haste anthem lord extra-combat extra-turn
repeatable-token-generator token-doubler counter-doubler gives-counters-to-all sacrifice-outlet death-trigger blink flicker recursion reanimate
reanimate-creature mass-reanimation self-mill mill discard-outlet discard lifegain life-drain gains-lifelink landfall extra-land untapper copy-spell clone
threaten theft-threaten win-condition fog group-hug cheat-into-play cast-from-graveyard power-matters toughness-matters
synergy-sacrifice synergy-token synergy-token-creature synergy-lifegain synergy-proliferate synergy-goad synergy-artifact synergy-enchantment synergy-equipment
synergy-aura synergy-instant synergy-discard synergy-mill synergy-treasure synergy-tapped synergy-flying synergy-defender typal`).split(/\s+/).filter(Boolean);
const out = process.argv[2], R = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {at:new Date().toISOString().slice(0, 10), tags:{}, names:{}};
const wait = ms => new Promise(r => setTimeout(r, ms));
async function get(url){ for (let k = 0; k < 4; k++){ const r = await fetch(url, {headers:{'User-Agent':'DeckCompanion/0.9 (engine redesign, offline)', Accept:'application/json'}}); if (r.status === 429){ await wait(2000 * (k + 1)); continue; } return r.json(); } throw new Error('429 ' + url); }
(async () => {
  for (const t of TAGS){ if (R.tags[t]) continue; const ids = []; let url = 'https://api.scryfall.com/cards/search?unique=cards&q=' + encodeURIComponent('oracletag:' + t);
    while (url){ await wait(120); const j = await get(url); if (j.object === 'error'){ console.log(t, 'error', j.details); break; }
      for (const c of j.data || []){ const id = c.oracle_id || (c.card_faces && c.card_faces[0].oracle_id); if (!id) continue; ids.push(id); R.names[id] = c.name; }
      url = j.has_more ? j.next_page : null; }
    R.tags[t] = ids; fs.writeFileSync(out, JSON.stringify(R)); console.log(t, ids.length); }
  console.log('done', Object.keys(R.tags).length, 'tags,', Object.keys(R.names).length, 'cards');
})();
