// The four dungeons (venture into the dungeon, the initiative). Each room has its ability text
// (resolved like any triggered ability) and the rooms you may move to next.

export const DUNGEONS = {
  'Lost Mine of Phandelver': {
    start: 'Cave Entrance',
    rooms: {
      'Cave Entrance': { text: 'Scry 1.', next: ['Goblin Lair', 'Mine Tunnels'] },
      'Goblin Lair': { text: 'Create a 1/1 red Goblin creature token.', next: ['Storeroom', 'Dark Pool'] },
      'Mine Tunnels': { text: 'Create a Treasure token.', next: ['Dark Pool', 'Fungi Cavern'] },
      Storeroom: { text: 'Put a +1/+1 counter on target creature.', next: ['Temple of Dumathoin'] },
      'Dark Pool': { text: 'Each opponent loses 1 life and you gain 1 life.', next: ['Temple of Dumathoin'] },
      'Fungi Cavern': { text: 'Target creature gets -4/-0 until your next turn.', next: ['Temple of Dumathoin'] },
      'Temple of Dumathoin': { text: 'Draw a card.', next: [] }
    }
  },
  'Dungeon of the Mad Mage': {
    start: 'Yawning Portal',
    rooms: {
      'Yawning Portal': { text: 'You gain 1 life.', next: ['Dungeon Level'] },
      'Dungeon Level': { text: 'Scry 1.', next: ['Goblin Bazaar', 'Twisted Caverns'] },
      'Goblin Bazaar': { text: 'Create a Treasure token.', next: ['Lost Level'] },
      'Twisted Caverns': { text: 'Target creature can’t attack until your next turn.', next: ['Lost Level'] },
      'Lost Level': { text: 'Scry 2.', next: ['Runestone Caverns', 'Muiral’s Graveyard'] },
      'Runestone Caverns': { text: 'Exile the top two cards of your library. You may play them.', next: ['Deep Mines'] },
      'Muiral’s Graveyard': { text: 'Create two 1/1 black Skeleton creature tokens.', next: ['Deep Mines'] },
      'Deep Mines': { text: 'Scry 3.', next: ['Mad Wizard’s Lair'] },
      'Mad Wizard’s Lair': { text: 'Draw three cards and reveal them. You may cast one of them without paying its mana cost.', next: [] }
    }
  },
  'Tomb of Annihilation': {
    start: 'Trapped Entry',
    rooms: {
      'Trapped Entry': { text: 'Each player loses 1 life.', next: ['Veils of Fear', 'Oubliette'] },
      'Veils of Fear': { text: 'Each player loses 2 life unless they discard a card.', next: ['Sandfall Cell'] },
      'Sandfall Cell': { text: 'Each player loses 2 life unless they sacrifice an artifact, a creature, or a land.', next: ['Cradle of the Death God'] },
      Oubliette: { text: 'Discard a card and sacrifice an artifact, a creature, and a land.', next: ['Cradle of the Death God'] },
      'Cradle of the Death God': { text: 'Create a 4/4 black God Horror creature token with deathtouch.', next: [] }
    }
  },
  Undercity: {
    start: 'Secret Entrance',
    initiativeOnly: true,
    rooms: {
      'Secret Entrance': { text: 'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.', next: ['Forge', 'Lost Well'] },
      Forge: { text: 'Put two +1/+1 counters on target creature.', next: ['Trap!', 'Arena'] },
      'Lost Well': { text: 'Scry 2.', next: ['Arena', 'Stash'] },
      'Trap!': { text: 'Target player loses 5 life.', next: ['Archives'] },
      Arena: { text: 'Goad target creature.', next: ['Archives', 'Catacombs'] },
      Stash: { text: 'Create a Treasure token.', next: ['Catacombs'] },
      Archives: { text: 'Draw a card.', next: ['Throne of the Dead Three'] },
      Catacombs: { text: 'Create a 4/1 black Skeleton creature token with menace.', next: ['Throne of the Dead Three'] },
      'Throne of the Dead Three': { text: 'Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle.', next: [] }
    }
  }
};
