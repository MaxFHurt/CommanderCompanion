import { createCardDefinition, createCardInstance, isCardDefinitionComplete } from './schema.js?v=0722';

export class CardRegistry {
  constructor({ resolver } = {}) { this.definitions = new Map(); this.resolver = resolver; }
  put(raw) { const def=createCardDefinition(raw); this.definitions.set(def.definitionId, def); return def; }
  get(id) { return this.definitions.get(id) || null; }
  async hydrate(seed) {
    const initial=createCardDefinition(seed);
    if (isCardDefinitionComplete(initial)) return this.put(initial);
    if (!this.resolver) return this.put({...initial, hydrationStatus:'unresolved'});
    try {
      const raw=await this.resolver(seed);
      const hydrated=createCardDefinition({...seed,...raw,hydrationStatus:'complete'});
      return this.put(isCardDefinitionComplete(hydrated)?hydrated:{...hydrated,hydrationStatus:'unresolved'});
    } catch { return this.put({...initial,hydrationStatus:'unresolved'}); }
  }
}

export function expandManifest(entries, ownerId) {
  const out=[];
  for (const entry of entries) {
    const qty=Math.max(0, Number(entry.quantity ?? entry.qty ?? 1));
    for(let n=0;n<qty;n++) out.push(createCardInstance({
      instanceId:`${ownerId}:${entry.definitionId}:${n+1}`,
      definitionId:entry.definitionId, ownerId, controllerId:ownerId, zone:'library', sourceDeckSlot:`${entry.definitionId}:${n+1}`
    }));
  }
  return out;
}
