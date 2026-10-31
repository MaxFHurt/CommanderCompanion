// More trigger wordings (build 43), read before the older readers in triggers.js. Each returns true / false when the
// wording is understood for this event, or undefined to let the older readers decide.
export function catalogTriggerMatch(game, row, t, event, H) {
  let m;
  const me = row.player.playerId, self = row.card.instanceId;
  // The spell's own cast trigger is put on the stack by ops.js as the spell is cast (castTriggers); never from here.
  if (/^When you cast this spell\b/i.test(t)) return event.type === 'spell-cast' && event.sourceId === self && row.zone === 'stack';
  switch (event.type) {
    case 'class-level':
      if ((m = t.match(/^When this Class becomes level (\d+)/i))) return event.sourceId === self && Number(event.level ?? event.to) === Number(m[1]);
      return undefined;
    case 'turned-face-up':
      if ((m = t.match(/^(?:When|Whenever) (.+?) (?:is|are) turned face up/i))) return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'cycled':
      if (/cycle or discard|cycles or discards/i.test(t)) return false;   // read from the discard event instead
      if (/^When(?:ever)? you cycle (?:this card|~|this creature)/i.test(t) || (H.selfName(row) && new RegExp(`^When(?:ever)? you cycle ${H.selfName(row)}`, 'i').test(t))) return event.sourceId === self;
      if ((m = t.match(/^Whenever (you|a player|an opponent|another player) cycles? (?:a card|another card|one or more cards)/i))) return H.whoMatches(m[1], event.playerId, row) && (!/another card/i.test(t) || event.sourceId !== self);
      return undefined;
    case 'discard':
      if ((m = t.match(/^Whenever (you|a player|an opponent) cycles? or discards? (?:a card|another card|one or more cards)/i))) return H.whoMatches(m[1], event.playerId, row) && (!/another card/i.test(t) || event.sourceId !== self);
      if (/^When(?:ever)? you cycle or discard (?:this card|~)/i.test(t)) return event.sourceId === self;
      return undefined;
    case 'becomes-monstrous':
      if ((m = t.match(/^When(?:ever)? (.+?) becomes monstrous/i))) return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'untapped':
      if ((m = t.match(/^Whenever (.+?) becomes untapped/i))) return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'tapped':
      if ((m = t.match(/^When(?:ever)? (enchanted|equipped) (creature|land|permanent|artifact) (?:becomes tapped|is tapped(?! for mana))/i))) return event.sourceId === row.card.attachedTo;
      if ((m = t.match(/^Whenever (.+?) becomes tapped/i))) return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'postcombat-main-start':
      if ((m = t.match(/^At the beginning of (your|each|each player's|each opponent's) (?:second main phase|postcombat main phase)|^At the beginning of each of your postcombat main phases/i))) {
        const whose = String(m[1] || 'your').toLowerCase();
        return whose === 'your' ? event.playerId === me : /opponent/.test(whose) ? event.playerId !== me : true;
      }
      return undefined;
    case 'scry':
      if (/^Whenever you scry(?: or surveil)?\b/i.test(t)) return event.playerId === me;
      return undefined;
    case 'surveil':
      if (/^Whenever you (?:scry or )?surveil\b/i.test(t)) return event.playerId === me;
      return undefined;
    case 'ring-tempts':
      if (/^Whenever the Ring tempts you/i.test(t)) return event.playerId === me;
      return undefined;
    case 'crime':
      if (/^Whenever you commit a crime/i.test(t)) return event.playerId === me;
      if (/^Whenever an opponent commits a crime/i.test(t)) return event.playerId !== me;
      return undefined;
    case 'explores':
      if ((m = t.match(/^Whenever (.+?) explores/i))) return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'becomes-target': {
      m = t.match(/^(?:When|Whenever) (.+?) becomes the target of (?:a|an) (spell or ability|spell|ability|Aura spell|instant or sorcery spell)(?: (you control|an opponent controls|your opponents control))?( for the first time each turn)?/i);
      if (!m) return undefined;
      const subject = /^enchanted creature$/i.test(m[1]) ? event.sourceId === row.card.attachedTo : H.subjectEvent(game, row, m[1], event);
      if (!subject) return subject;
      if (/^spell$/i.test(m[2]) && event.byKind !== 'spell') return false;
      if (/^ability$/i.test(m[2]) && event.byKind === 'spell') return false;
      if (m[3] && (/you control/i.test(m[3]) ? event.byPlayerId !== me : event.byPlayerId === me)) return false;
      if (m[4] && !event.firstThisTurn) return false;
      return true;
    }
    case 'attackers-declared':
      if ((m = t.match(/^Whenever (.+?) and at least (one|two|three|four) other creatures attack/i))) {
        const n = { one: 1, two: 2, three: 3, four: 4 }[m[2].toLowerCase()];
        return (event.attackers || []).includes(self) && (event.attackers || []).length >= n + 1;
      }
      return undefined;
    case 'attacks':
      if ((m = t.match(/^Whenever (a creature|one or more creatures|a creature an opponent controls) attacks? you(?: or a planeswalker you control)?\b/i))) {
        const target = event.targetId && event.targetId !== event.sourceId ? (game.players || []).flatMap(p => p.deck?.battlefield || []).find(c => c.instanceId === event.targetId) : null;
        return event.defenderId === me && (!target || /planeswalker you control/i.test(t));
      }
      return undefined;
    case 'transformed':
      if ((m = t.match(/^When(?:ever)? (.+?) transforms(?: into .+)?$/i))) return H.subjectEvent(game, row, m[1].replace(/ transforms into .+$/i, ''), event);
      return undefined;
    case 'crewed':
      if (/^Whenever (?:this creature|~) crews a Vehicle/i.test(t)) return (event.crewIds || []).includes(self);
      if ((m = t.match(/^Whenever (.+?) becomes crewed/i))) return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'tapped-for-mana':
      if ((m = t.match(/^Whenever (a player|you|an opponent) taps? (a land|a [A-Z][a-z]+|a creature|a permanent|an untapped creature) for mana/i))) {
        if (!H.whoMatches(m[1], event.controllerId, row)) return false;
        const what = m[2].toLowerCase().replace(/^an? /, '');
        return what === 'land' ? !!event.land : what === 'permanent' ? true : what === 'creature' ? !!event.creature : new RegExp(`\\b${m[2].replace(/^an? /i, '')}\\b`).test(event.typeLine || '');
      }
      return undefined;
    case 'blocks':
      if ((m = t.match(/^Whenever (.+?) becomes blocked\b/i)) && !/^this creature$|^~$/i.test(m[1])) return H.subjectEvent(game, row, m[1], event, event.attackerId);
      return undefined;
    case 'zone-change':
      if ((m = t.match(/^When(?:ever)? (.+?) is put into (?:a|your) graveyard from anywhere/i)) && event.to === 'graveyard') return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'damage-player': case 'combat-damage-player': {
      if (/^Whenever you(?:'re| are) dealt damage/i.test(t)) return event.playerId === me;
      if ((m = t.match(/^Whenever (a source|a creature|a source an opponent controls|a creature an opponent controls) deals (combat )?damage to you\b/i))) {
        if (m[2] && event.type !== 'combat-damage-player') return false;
        return event.playerId === me && (!/opponent controls/i.test(m[1]) || event.controllerId !== me);
      }
      if ((m = t.match(/^Whenever (.+?) deals noncombat damage to (an opponent|a player|one or more opponents)/i))) {
        if (event.type !== 'damage-player' || event.combat) return false;
        if (/opponent/i.test(m[2]) && event.playerId === me) return false;
        return H.subjectEvent(game, row, m[1], event);
      }
      if ((m = t.match(/^Whenever (.+?) deals damage(?:,|$)/i)) && event.type === 'damage-player' && !event.combat) return H.subjectEvent(game, row, m[1], event);
      return undefined;
    }
    case 'damage-permanent': case 'combat-damage-creature':
      if (/^Whenever a source deals damage to (?:this creature|~)/i.test(t)) return event.targetId === self;
      if ((m = t.match(/^Whenever (.+?) deals (combat )?damage to a creature/i))) { if (m[2] && event.type !== 'combat-damage-creature') return false; return H.subjectEvent(game, row, m[1], event); }
      if ((m = t.match(/^Whenever (.+?) is dealt combat damage/i))) return event.type === 'combat-damage-creature' && H.subjectEvent(game, row, m[1], event, event.targetId);
      if ((m = t.match(/^Whenever (.+?) deals damage(?:,|$)/i)) && event.type === 'damage-permanent') return H.subjectEvent(game, row, m[1], event);
      return undefined;
    case 'combat-damage-dealt':
      if ((m = t.match(/^Whenever (.+?) deals damage(?:,|$)/i))) return H.subjectEvent(game, row, m[1], event);
      if ((m = t.match(/^Whenever (enchanted|equipped) creature deals (?:combat )?damage(?:,|$)/i))) return event.sourceId === row.card.attachedTo;
      return undefined;
  }
  return undefined;
}

/** Extra probe settings for the audit: tried only when the usual probe never fires the trigger. */
export const PROBE_EXTRA_EVENTS = ['transformed', 'crewed', 'tapped-for-mana', 'class-level', 'turned-face-up', 'cycled', 'becomes-monstrous', 'untapped', 'postcombat-main-start', 'scry', 'surveil', 'ring-tempts', 'crime', 'explores', 'becomes-target', 'zone-change'];
