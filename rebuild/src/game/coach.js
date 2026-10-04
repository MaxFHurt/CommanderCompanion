// Plain-language guidance for the player whose device this is. The screen decides how much of it
// to show (coach / assist / rules-only) from the device settings.

import { playerById } from './helpers.js';

const TIPS = {
  'precombat-main': [
    'You can play one land each turn. Lands are how you pay for everything else.',
    'Creatures you cast this turn cannot attack until your next turn (summoning sickness).',
    'Sorceries and creatures can only be cast in your own main phase while the stack is empty.',
    'Your commander can be cast from the command zone. Each time it returns there, it costs {2} more.'
  ],
  combat: [
    'Tapped creatures cannot block. Attacking taps a creature unless it has vigilance.',
    'In Commander you choose which opponent each creature attacks.',
    'Flying creatures can only be blocked by creatures with flying or reach.',
    '21 combat damage from a single commander eliminates a player, whatever their life total.'
  ],
  'postcombat-main': [
    'Second main phase: a good time to cast creatures you held back so your opponents had less information.',
    'If you still have a land drop, use it before ending the turn.'
  ],
  priority: [
    'Spells and abilities wait on the stack. The last one added resolves first.',
    'Only instants, flash cards and abilities can be used while something is on the stack.',
    'Passing means "I do not respond". When everyone passes, the top of the stack resolves.'
  ],
  blocks: [
    'Each of your untapped creatures can block one attacker. Several creatures may block the same attacker.',
    'Unblocked attackers deal their damage to you.',
    'A creature with deathtouch destroys anything it damages.'
  ],
  opening: [
    'A good opening hand usually has 3 or 4 lands and a few cheap spells.',
    'In Commander your first mulligan is free.'
  ]
};

function tip(game, key) {
  const list = TIPS[key] || [];
  return list.length ? list[(Number(game.turnNumber || 0) + (game.log?.length || 0)) % list.length] : '';
}


// ── land advice ───────────────────────────────────────────────────────────────
const COLOR_NAME = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colourless' };
const BASIC = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
const textOf = def => [def?.oracleText, ...(def?.faces || []).map(f => f.oracleText)].filter(Boolean).join('\n');
const mvOf = def => Number(def?.manaValue ?? def?.cmc ?? 0);
const list = xs => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`;

function landInfo(def, hand) {
  const text = textOf(def);
  const colors = new Set();
  for (const [type, c] of Object.entries(BASIC)) if (new RegExp(`\\b${type}\\b`).test(def?.typeLine || '')) colors.add(c);
  for (const line of text.split('\n')) if (/\badd\b/i.test(line)) for (const m of line.matchAll(/\{([WUBRGC])\}/g)) colors.add(m[1]);
  const any = /mana of any (one )?colou?r|any type/i.test(text);
  let tapped = /enters( the battlefield)? tapped/i.test(text) ? 'yes' : 'no';
  if (tapped === 'yes' && /unless|if you don't|if you do not/i.test(text)) {
    tapped = 'maybe';
    const reveal = text.match(/reveal an? (\w+) or (\w+) card/i);
    if (reveal) {
      const ok = hand.some(c => c.land && new RegExp(`\\b(${reveal[1]}|${reveal[2]})\\b`, 'i').test(c.type || ''));
      tapped = ok ? 'no' : 'yes';
    }
  }
  return { colors: [...colors], any, tapped };
}

/** Rank the playable lands and say why, in words a new player can follow. */
function adviseLands(view, row, lands, hand) {
  const info = new Map(lands.map(c => [c.id, landInfo(view.defs[c.def], hand)]));
  const have = new Set([...Object.entries(row.mana?.fixed || {}).filter(([, n]) => n > 0).map(([c]) => c), ...(row.mana?.flex || []).flatMap(g => g.colors)]);
  const manaNow = Number(row.mana?.total || 0);
  const spells = [...hand.filter(c => !c.land), ...(row.command || [])];
  const want = new Set();
  for (const c of spells) for (const m of String(view.defs[c.def]?.manaCost || '').matchAll(/\{([WUBRG])/g)) want.add(m[1]);
  // What one more untapped mana would let you cast right now.
  const unlock = spells.filter(c => !c.playable && mvOf(view.defs[c.def]) > 0 && mvOf(view.defs[c.def]) === manaNow + 1);
  const castNow = spells.some(c => c.playable) || unlock.length > 0;

  const seen = new Set();
  const rows = lands.filter(c => !seen.has(c.name) && seen.add(c.name)).map(c => {
    const i = info.get(c.id);
    const fresh = i.colors.filter(x => x !== 'C' && !have.has(x) && want.has(x));
    let score = 0; const why = [];
    const noMana = !i.any && !i.colors.length;
    if (noMana) {
      if (castNow) { score -= 3; why.push('It does not make mana by itself (read the card — it usually fetches another land), so it will not help you cast anything this turn.'); }
      else { score += 1; why.push('It does not make mana by itself (read the card — it usually fetches another land), and you have nothing to cast this turn, so now is a cheap moment to use it.'); }
    } else if (i.tapped !== 'no') {
      if (castNow) { score -= 3; why.push(`It ${i.tapped === 'maybe' ? 'may enter' : 'enters'} tapped, so it gives no mana this turn — and you have a spell you could cast with one more mana.`); }
      else { score += 2; why.push(`It enters tapped, but you have nothing to cast with one extra mana this turn, so the delay costs you nothing. Getting tapped lands out early keeps later turns smooth.`); }
    } else if (castNow && unlock.length) { score += 2; why.push(`It enters untapped, so you can use its mana right away — enough to cast ${unlock[0].name}.`); }
    else why.push('It enters untapped, so its mana is ready this turn.');
    if (i.any) { score += 2; why.push('It makes mana of any colour.'); }
    else if (fresh.length) { score += 1 + fresh.length; why.push(`It adds ${list(fresh.map(x => COLOR_NAME[x]))} mana, which spells in your hand need and you do not have yet.`); }
    else if (i.colors.length > 1) { score += 1; why.push(`It can make ${list(i.colors.map(x => COLOR_NAME[x]))} mana, giving you more choice later.`); }
    else if (i.colors.length === 1 && i.colors[0] !== 'C') why.push(`It makes ${COLOR_NAME[i.colors[0]]} mana.`);
    return { card: c, score, why: why.join(' ') };
  }).sort((a, b) => b.score - a.score);
  const tie = rows.length > 1 && rows[0].score === rows[1].score;
  return { rows, best: rows[0], tie };
}

export function coachFor(game, view, me, active) {
  const prompt = view.prompt;
  const out = { headline: '', detail: '', tip: '', jewel: null, options: [] };
  const name = id => playerById(game, id)?.displayName || 'another player';
  switch (prompt.kind) {
    case 'complete':
      out.headline = view.winner ? `${name(view.winner)} wins!` : 'Game over';
      break;
    case 'opening':
      out.headline = 'Keep this hand or mulligan?';
      out.detail = prompt.bottom ? `If you keep, put ${prompt.bottom} card${prompt.bottom === 1 ? '' : 's'} on the bottom of your library.` : 'Look for a mix of lands and spells you can cast early.';
      out.tip = tip(game, 'opening');
      break;
    case 'decision':
      out.headline = prompt.decision.title || 'Make a choice';
      out.detail = prompt.decision.prompt || '';
      out.jewel = { label: 'CHOOSE', act: 'decision' };
      break;
    case 'guided':
      out.headline = `Resolve ${prompt.name} by hand`;
      out.detail = 'This card is not automated. Read it, make the changes it asks for, then mark it done.';
      out.jewel = { label: 'RESOLVE', act: 'guided' };
      break;
    case 'vote':
      out.headline = `Vote: allow ${prompt.label}?`;
      out.jewel = { label: 'VOTE', act: 'vote' };
      break;
    case 'priority': {
      const top = view.stack.at(-1);
      out.headline = top ? `Respond to ${top.name}?` : `${prompt.reason || 'A step is ending'} — respond?`;
      out.detail = 'Highlighted cards can be used right now. Pass if you do not want to respond.';
      out.tip = tip(game, 'priority');
      out.jewel = { label: 'PASS', act: 'pass' };
      {
        const mine = view.players.find(p => p.playerId === view.you) || {};
        const ids = new Set([...(view.actions.respond?.cards || []), ...(view.actions.respond?.abilities || [])]);
        const cards = [...(mine.hand || []), ...(mine.battlefield || []), ...(mine.command || [])].filter(c => ids.has(c.id));
        out.options = [
          ...cards.map(c => ({ act: 'card', id: c.id, label: `Respond with ${c.name}`, sub: c.type })),
          { act: 'pass', label: 'Pass', sub: 'Do not respond. When everyone passes, the top of the stack resolves.', best: !cards.length }
        ];
      }
      break;
    }
    case 'blocks':
      out.headline = 'You are being attacked';
      out.detail = 'Choose which of your creatures block, or take the damage.';
      out.tip = tip(game, 'blocks');
      out.jewel = { label: 'BLOCK', act: 'blocks' };
      break;
    case 'discard':
      out.headline = `Discard ${prompt.need} card${prompt.need === 1 ? '' : 's'}`;
      out.detail = 'Your maximum hand size is seven at the end of your turn.';
      out.jewel = { label: 'DISCARD', act: 'discard' };
      break;
    case 'turn': {
      const row = view.players.find(p => p.playerId === view.you) || {};
      const hand = row.hand || [];
      const lands = hand.filter(c => c.playable && c.land);
      let landWhy = new Map(), bestId = null;
      const spells = hand.filter(c => c.playable && !c.land);
      const commander = view.players.find(p => p.playerId === view.you)?.command.find(c => c.playable);
      if (view.phase === 'combat' || view.phase === 'begin-combat') {
        const n = view.actions.attack?.length || 0;
        out.headline = n ? 'Combat: choose attackers' : 'Combat';
        out.detail = n ? `${n} of your creatures can attack. Pick who each one attacks, or skip combat.` : 'None of your creatures can attack. Move to your second main phase.';
        out.tip = tip(game, 'combat');
        out.jewel = n ? { label: 'ATTACK', act: 'attack' } : { label: 'NEXT PHASE', act: 'next-phase' };
      } else if (lands.length) {
        const advice = adviseLands(view, row, lands, hand);
        const best = advice.best;
        landWhy = new Map(advice.rows.map(r => [r.card.id, r.why]));
        bestId = best.card.id;
        const names = [...new Set(lands.map(c => c.name))];
        out.headline = 'Play a land';
        out.detail = names.length === 1
          ? `${best.card.name} is the only land you can play. You may play one land each turn. ${best.why}`
          : advice.tie
            ? `You can play ${list(names)} — one land each turn. They are about equal right now; ${best.card.name} is a fine pick. ${best.why}`
            : `You can play ${list(names)} — one land each turn. Suggested: ${best.card.name}. ${best.why}`;
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'PLAY LAND', act: 'suggest', ids: lands.map(c => c.id) };
      } else if (spells.length || commander) {
        const names = [...(commander ? [commander] : []), ...spells].slice(0, 3).map(c => c.name).join(', ');
        out.headline = 'Cast a spell';
        out.detail = `You have the mana for ${names}${spells.length + (commander ? 1 : 0) > 3 ? '…' : ''}. Tap a glowing card to read it and cast it.`;
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'CAST SPELL', act: 'suggest', ids: [...(commander ? [commander.id] : []), ...spells.map(c => c.id)] };
      } else if (view.phase === 'precombat-main') {
        out.headline = 'Nothing more to play';
        out.detail = 'Move to combat when you are ready.';
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'TO COMBAT', act: 'next-phase' };
      } else {
        out.headline = 'End your turn';
        out.detail = 'You have nothing else to do this turn.';
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'END TURN', act: 'end-turn' };
      }
      // Everything the player may do right now, best suggestion first.
      const opts = [];
      for (const c of lands.filter((c, i) => lands.findIndex(x => x.name === c.name) === i)) opts.push({ act: 'card', id: c.id, label: `Play ${c.name}`, sub: landWhy.get(c.id) || 'Land. One land each turn.', best: c.id === bestId });
      if (commander) opts.push({ act: 'card', id: commander.id, label: `Cast ${commander.name}`, sub: 'Your commander, from the command zone.' });
      for (const c of spells) opts.push({ act: 'card', id: c.id, label: `Cast ${c.name}`, sub: c.type });
      for (const c of row.battlefield || []) for (const a of c.abilities || []) if (a.legal && !a.mana) opts.push({ act: 'card', id: c.id, label: `Use ${c.name}`, sub: a.text });
      if (view.actions.attack?.length) opts.push({ act: 'attack', label: 'Attack', sub: `${view.actions.attack.length} of your creatures can attack.` });
      if (view.actions.nextPhase) opts.push({ act: 'next-phase', label: view.phase === 'precombat-main' ? 'Go to combat' : 'Next phase', sub: lands.length ? 'You have not played a land yet this turn.' : '' });
      if (view.actions.endTurn) opts.push({ act: 'end-turn', label: 'End turn', sub: 'Skip the rest of your turn.' });
      if (!opts.some(o => o.best)) { const o = opts.find(x => x.act === out.jewel?.act) || opts.find(x => x.act === 'card'); if (o) o.best = true; }
      out.options = opts.sort((a, b) => (b.best ? 1 : 0) - (a.best ? 1 : 0));
      break;
    }
    default:
      out.headline = prompt.text || 'Waiting';
      out.detail = active && view.you && active.playerId !== view.you ? 'You can still use instants and abilities when you get the chance to respond.' : '';
  }
  if (!out.detail) {
    out.detail = prompt.kind === 'vote' ? 'The table decides together. Say yes if the play looks fair to you.'
      : view.status === 'complete' ? 'Start a new game from the main menu when you are ready.'
      : 'Nothing for you to do yet. Watch the game log to follow what the other players do, and think about your next turn.';
  }
  return out;
}
