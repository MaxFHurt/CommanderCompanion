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

export function coachFor(game, view, me, active) {
  const prompt = view.prompt;
  const out = { headline: '', detail: '', tip: '', jewel: null };
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
      const hand = me?.hand ? view.players.find(p => p.playerId === view.you)?.hand || [] : [];
      const land = hand.find(c => c.playable && c.land);
      const spells = hand.filter(c => c.playable && !c.land);
      const commander = view.players.find(p => p.playerId === view.you)?.command.find(c => c.playable);
      if (view.phase === 'combat' || view.phase === 'begin-combat') {
        const n = view.actions.attack?.length || 0;
        out.headline = n ? 'Combat: choose attackers' : 'Combat';
        out.detail = n ? `${n} of your creatures can attack. Pick who each one attacks, or skip combat.` : 'None of your creatures can attack. Move to your second main phase.';
        out.tip = tip(game, 'combat');
        out.jewel = n ? { label: 'ATTACK', act: 'attack' } : { label: 'NEXT', act: 'next-phase' };
      } else if (land) {
        out.headline = 'Play a land';
        out.detail = `${land.name} is in your hand. One land each turn.`;
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'LAND', act: 'suggest', ids: [land.id] };
      } else if (spells.length || commander) {
        const names = [...(commander ? [commander] : []), ...spells].slice(0, 3).map(c => c.name).join(', ');
        out.headline = 'Cast a spell';
        out.detail = `Ready: ${names}${spells.length + (commander ? 1 : 0) > 3 ? '…' : ''}. Tap a glowing card.`;
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'CAST', act: 'suggest', ids: [...(commander ? [commander.id] : []), ...spells.map(c => c.id)] };
      } else if (view.phase === 'precombat-main') {
        out.headline = 'Nothing more to play';
        out.detail = 'Move to combat when you are ready.';
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'COMBAT', act: 'next-phase' };
      } else {
        out.headline = 'End your turn';
        out.detail = 'You have nothing else to do this turn.';
        out.tip = tip(game, view.phase);
        out.jewel = { label: 'END', act: 'end-turn' };
      }
      break;
    }
    default:
      out.headline = prompt.text || 'Waiting';
      out.detail = active && view.you && active.playerId !== view.you ? 'You can still use instants and abilities when you get the chance to respond.' : '';
  }
  return out;
}
