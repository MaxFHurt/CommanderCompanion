export const SCHEMA_VERSION = 7;

export const GAME_MODES = Object.freeze({
  FULLY_TRACKED: 'fully-tracked',
  FREEPLAY: 'freeplay',
  TABLE_TRACKER: 'table-tracker',
  TABLETOP: 'tabletop'
});

export const DEVICE_MODES = Object.freeze({
  SINGLE: 'single-device',
  MULTI: 'multi-device'
});

export const ZONES = Object.freeze({
  LIBRARY: 'library',
  HAND: 'hand',
  BATTLEFIELD: 'battlefield',
  GRAVEYARD: 'graveyard',
  EXILE: 'exile',
  TOKENS: 'tokens',
  ATTACHMENTS: 'attachments',
  COMMAND: 'command',
  STACK: 'stack'
});

export const PHASES = Object.freeze([
  'untap','upkeep','draw','precombat-main','begin-combat','declare-attackers','declare-blockers','combat-damage','end-combat','postcombat-main','end-step','cleanup'
]);

export function createGameState(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    gameId: null,
    mode: GAME_MODES.FULLY_TRACKED,
    deviceMode: DEVICE_MODES.SINGLE,
    playerCount: 0,
    players: [],
    activePlayerId: null,
    turnNumber: 1,
    roundNumber: 1,
    phase: 'untap',
    phaseGates: {},
    log: [],
    undoHistory: [],
    status: 'setup',
    winner: null,
    postGame: null,
    rulesConfig: {},
    multiplayer: null,
    cardDefinitions: {},
    pendingTransaction: null,
    priorityState: null,
    stack: [],
    pendingTriggers: [],
    rulesEngineBlocked: null,
    ...overrides
  };
}

export function createPlayerState(overrides = {}) {
  return {
    playerId: null,
    displayName: '',
    seat: null,
    ownership: { local: true, clientId: null },
    guidanceLevel: null,
    life: 40,
    poison: 0,
    commanderDamage: {},
    statuses: [],
    counters: {},
    mana: { total: {W:0,U:0,B:0,R:0,G:0,C:0}, available: {W:0,U:0,B:0,R:0,G:0,C:0} },
    commanders: [],
    deck: createDeckState(),
    zones: { authority: 'deck' },
    privateHandOwnership: null,
    confirmations: {},
    settings: {},
    ...overrides
  };
}

export function createCommanderState(overrides = {}) {
  return {
    id: null,
    cardId: null,
    card: null,
    commandZone: true,
    castCount: 0,
    commanderTax: 0,
    zone: ZONES.COMMAND,
    status: {},
    ...overrides
  };
}

export function createDeckState(overrides = {}) {
  return {
    sourceType: null,
    sourceId: null,
    sourceName: null,
    complete: false,
    expectedSize: 100,
    fullManifest: [],
    remainingLibrary: [],
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    tokens: [],
    attachments: [],
    commandZone: [],
    zoneAccounting: {},
    virtualDrawEnabled: false,
    ...overrides
  };
}

export function createCardDefinition(overrides = {}) {
  return {
    definitionId: null,
    name: '',
    manaCost: null,
    typeLine: null,
    oracleText: null,
    power: null,
    toughness: null,
    keywords: [],
    colorIdentity: [],
    colors: [],
    imageUris: null,
    set: null,
    language: null,
    collectorNumber: null,
    printing: null,
    legalities: null,
    hydrationStatus: 'unresolved',
    ...overrides
  };
}

export function isCardDefinitionComplete(card) {
  if (!card || typeof card !== 'object') return false;
  return Boolean(
    card.definitionId &&
    card.name &&
    card.typeLine &&
    card.oracleText !== null &&
    Array.isArray(card.colorIdentity) &&
    Array.isArray(card.colors) &&
    card.hydrationStatus === 'complete'
  );
}

export function createCardInstance(overrides = {}) {
  return {
    instanceId: null,
    definitionId: null,
    ownerId: null,
    controllerId: null,
    zone: null,
    tapped: false,
    counters: {},
    attachments: [],
    temporaryEffects: [],
    sourceDeckSlot: null,
    ...overrides
  };
}
