// Face-down permanents (morph, megamorph, disguise, manifest): a nameless 2/2 creature with no
// abilities. The card keeps its real definition in `realDefinitionId` until it is turned face up.

export const FACE_DOWN_ID = 'face-down-2-2';

export function faceDownDefinition(kind = 'morph') {
  return {
    definitionId: FACE_DOWN_ID, name: 'Face-down creature', combinedName: 'Face-down creature', manaCost: '', manaValue: 0,
    typeLine: 'Creature', oracleText: kind === 'disguise' ? 'Ward {2}' : '', power: '2', toughness: '2', keywords: kind === 'disguise' ? ['Ward'] : [],
    colors: [], colorIdentity: [], cardFaces: [], imageUris: null, hydrationStatus: 'complete', layout: 'normal', faceDown: true
  };
}
