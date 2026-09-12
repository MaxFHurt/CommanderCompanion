export function guidanceFor({game,player}){
  if(player.playerId!==game.activePlayerId)return `Wait for the active player's turn unless you receive a response opportunity.`;
  switch(game.phase){
    case'untap':return'Untap your permanents, then advance to upkeep.';
    case'upkeep':return'Resolve upkeep triggers and effects, then advance to draw.';
    case'draw':return'Confirm the required draw. In tracked mode the exact next library card is used.';
    case'precombat-main':return'Play a land or cast a legal spell if you have the mana.';
    case'begin-combat':return'Resolve beginning-of-combat triggers before declaring attackers.';
    case'declare-attackers':return'Declare legal attackers and choose defenders.';
    case'declare-blockers':return'Wait for defender block confirmation before combat damage.';
    case'combat-damage':return'Resolve combat damage and resulting state changes.';
    case'end-combat':return'Resolve end-of-combat triggers, then advance to Main 2.';
    case'postcombat-main':return'Use your second main phase before the end step.';
    case'end-step':return'Resolve end-step triggers before cleanup.';
    case'cleanup':return'Discard to maximum hand size if required, clear turn effects, then end the turn.';
    default:return'Follow the current phase and resolve required confirmations before advancing.';
  }
}
