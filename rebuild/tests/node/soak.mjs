// Random play-through: bots take legal actions for many turns. The game must never throw,
// never get stuck waiting on nobody, and never refuse an action the view offered.
import { newGame } from './harness.mjs';

const GAMES = Number(process.argv[2] || 25), TURNS = Number(process.argv[3] || 30);
const pick = a => a[Math.floor(Math.random() * a.length)];
let problems = 0, actions = 0, finished = 0, guided = 0;

function answerFor(d) {
  const open = (d.options || []).filter(o => !o.disabled);
  switch (d.kind) {
    case 'choose-one': return open.length ? pick(open).id : null;
    case 'choose-many': { const n = Math.max(d.min || 0, Math.min(d.max ?? open.length, Math.floor(Math.random() * (open.length + 1)))); return [...open].sort(() => Math.random() - 0.5).slice(0, n).map(o => o.id); }
    case 'number': return d.min || 0;
    case 'text': return (d.suggestions || ['Elf'])[0];
    case 'confirm': return Math.random() < 0.7;
    case 'arrange': return Math.random() < 0.5 ? { top: d.cards.map(c => c.id), other: [] } : { top: [], other: d.cards.map(c => c.id) };
    default: return null;
  }
}

for (let g = 0; g < GAMES; g++) {
  const decks = [...['white', 'simic', 'rakdos', 'red']].sort(() => Math.random() - 0.5).slice(0, 2 + (g % 3));
  const t = newGame(decks, { keepHands: true, autoPass: false, mode: g % 5 === 4 ? 'freeplay' : 'fully-tracked' });
  const game = t.game;
  const report = (what, extra = '') => { problems++; console.log(`PROBLEM game ${g} turn ${game.turnNumber}: ${what} ${extra}`.slice(0, 600)); };
  let idle = 0;
  for (let step = 0; step < 4000 && game.status !== 'complete' && game.turnNumber <= TURNS; step++) {
    const actor = t.ctl.actorId();
    const i = game.players.findIndex(p => p.playerId === actor);
    const view = t.view(i), p = view.prompt, me = view.players[i];
    let intent = null;
    if (p.kind === 'opening') intent = p.bottom ? { type: 'keep', bottom: me.hand.slice(0, p.bottom).map(c => c.id) } : (Math.random() < 0.15 && p.canMulligan ? { type: 'mulligan' } : { type: 'keep', bottom: [] });
    else if (p.kind === 'decision') intent = { type: 'answer', key: p.decision.key, value: answerFor(p.decision) };
    else if (p.kind === 'guided') { intent = { type: 'guided-done' }; guided++; }
    else if (p.kind === 'priority') {
      const ids = view.actions.respond.cards;
      intent = ids.length && Math.random() < 0.5 ? { type: 'play', instanceId: pick(ids) } : { type: 'pass' };
    } else if (p.kind === 'blocks') {
      const used = new Set(), assignments = [];
      for (const row of p.rows) { const b = row.blockers.find(x => !used.has(x.instanceId)); if (b && Math.random() < 0.5) { used.add(b.instanceId); assignments.push({ attackerId: row.attackerId, blockerId: b.instanceId }); } }
      intent = { type: 'block', assignments };
    } else if (p.kind === 'discard') intent = { type: 'discard', ids: me.hand.slice(0, p.need).map(c => c.id) };
    else if (p.kind === 'turn') {
      const playable = [...me.hand.filter(c => c.playable), ...me.command.filter(c => c.playable)];
      const abilities = me.battlefield.flatMap(c => (c.abilities || []).filter(a => a.legal && !a.mana).map(a => ({ c, a })));
      if (view.actions.attack?.length && Math.random() < 0.8) {
        const foes = view.players.filter(q => q.playerId !== me.playerId && !q.eliminated);
        intent = { type: 'attack', attacks: view.actions.attack.filter(() => Math.random() < 0.7).map(a => ({ instanceId: a.instanceId, defenderId: pick(a.defenders.filter(d => foes.some(f => f.playerId === d))) })) };
        if (!intent.attacks.length) intent = { type: 'next-phase' };
      } else if (playable.length && Math.random() < 0.85) intent = { type: 'play', instanceId: (playable.find(c => c.land) || pick(playable)).id };
      else if (abilities.length && Math.random() < 0.3) { const x = pick(abilities); intent = { type: 'activate', instanceId: x.c.id, abilityId: x.a.id }; }
      else intent = { type: 'next-phase' };
    } else if (p.kind === 'vote') intent = { type: 'vote', approve: true };
    else { report('nobody can act', JSON.stringify({ kind: p.kind, flow: { ...game.flow, op: game.flow.op?.type } })); break; }
    let r;
    try { r = t.ctl.dispatch(intent, t.as(i)); actions++; } catch (e) { report('threw', `${intent.type} ${e.stack}`); break; }
    if (!r.ok) {
      // Offered actions should work. A cancelled multi-step play is fine (target ran out) — cancel and move on.
      if (game.flow.op?.decision?.cancellable) t.ctl.dispatch({ type: 'cancel' }, t.as(i));
      else if (intent.type === 'answer' && p.decision.cancellable !== false) t.ctl.dispatch({ type: 'cancel' }, t.as(i));
      else if (!/no legal|no .* to|cannot|not enough|No legal/i.test(r.error)) report(`refused ${intent.type}`, `${r.error} | ${JSON.stringify(intent).slice(0, 200)}`);
      if (++idle > 25) { t.ctl.dispatch({ type: 'next-phase' }, t.as(i)); if (idle > 60) { report('stuck after refusals', r.error); break; } }
    } else idle = 0;
    // Invariants: every card instance exists exactly once.
    if (step % 25 === 0) {
      const ids = [];
      for (const q of game.players) for (const z of ['remainingLibrary', 'hand', 'battlefield', 'graveyard', 'exile', 'commandZone']) for (const c of q.deck[z]) ids.push(c.instanceId);
      for (const s of game.stack) if (s.card) ids.push(s.card.instanceId);
      if (new Set(ids).size !== ids.length) { report('duplicate card instance'); break; }
      const nonToken = ids.filter(id => !/token:/.test(id)).length;
      if (nonToken !== game.players.length * 100) { report('card count changed', String(nonToken)); break; }
    }
  }
  if (game.status === 'complete') finished++;
}
console.log(`${GAMES} games, ${actions} actions, ${finished} finished, ${guided} by-hand resolutions, ${problems} problems`);
process.exit(problems ? 1 : 0);
