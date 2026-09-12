// Commander Companion V0.7.27 capability classifier.
// No supported player-facing action may resolve as a no-op.
import { parseActivatedAbilities } from './rules-v0725.js?v=0727';
import { compileEffectText } from './effect-engine.js?v=0727';
import { auditTriggers, parseTriggeredAbilities } from './trigger-engine.js?v=0727';

const COLOR={white:'W',blue:'U',black:'B',red:'R',green:'G'};
function oracle(definition){return String(definition?.oracleText||'').replace(/\r/g,'')}
export function asEntersChoiceSpec(definition){
  const text=oracle(definition);let m;
  if((m=text.match(/As (?:~|this [^,]+|[^,]+) enters(?: the battlefield)?, choose a color other than (white|blue|black|red|green)\.?/i)))return{kind:'color',exclude:[COLOR[m[1].toLowerCase()]],prompt:`Choose a color other than ${m[1].toLowerCase()}.`};
  if(/As (?:~|this [^,]+|[^,]+) enters(?: the battlefield)?, choose a color\.?/i.test(text))return{kind:'color',exclude:[],prompt:'Choose a color.'};
  if(/As (?:~|this [^,]+|[^,]+) enters(?: the battlefield)?, choose a creature type\.?/i.test(text))return{kind:'creature-type',prompt:'Choose a creature type.'};
  if(/As (?:~|this [^,]+|[^,]+) enters(?: the battlefield)?, choose a card name\.?/i.test(text))return{kind:'card-name',prompt:'Choose a card name.'};
  if(/As (?:~|this [^,]+|[^,]+) enters(?: the battlefield)?, choose an opponent\.?/i.test(text))return{kind:'opponent',prompt:'Choose an opponent.'};
  return null;
}
export function entersWithCountersSpec(definition){
  const text=oracle(definition);const m=text.match(/enters(?: the battlefield)? with (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|X) ([A-Za-z+\-/ ]+) counters? on it/i);if(!m)return null;const words={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};return{counter:m[2].trim(),amount:/^\d+$/.test(m[1])?Number(m[1]):(words[m[1].toLowerCase()]??m[1].toUpperCase())};
}
export function modalSpellSpec(definition){
  const text=oracle(definition).trim();const m=text.match(/^Choose\s+(one|two|three|four|five|\d+)\s*[—-]\s*([\s\S]+)$/i);if(!m)return null;const words={one:1,two:2,three:3,four:4,five:5};const count=Number(m[1])||words[m[1].toLowerCase()]||1;const modes=[...text.matchAll(/(?:^|\n)•\s*([^\n]+)/g)].map(x=>x[1].trim());if(!modes.length){const tail=m[2].split(/\s*[;•]\s*/).map(x=>x.trim()).filter(Boolean);modes.push(...tail)}return{count,modes,compiledModes:modes.map(mode=>compileEffectText(mode,{sourceName:definition?.name||'Modal spell'}))};
}
export function activatedAbilitySupport(definition,ability){
  if(!ability)return{supported:false,reasons:['Ability is unavailable.']};
  if(ability.manaAbility){
    const chosen=/chosen color/i.test(ability.effect||'');if(ability.manaOptions?.length||chosen||/mana of any (?:color|type)/i.test(ability.effect||''))return{supported:true,kind:'mana',compiled:null,reasons:[]};
    return{supported:false,kind:'mana',reasons:['Mana output could not be determined from this Oracle text.'],guidedFallback:true};
  }
  if(/search your library/i.test(ability.effect||''))return{supported:true,kind:'search',compiled:null,reasons:[]};
  const compiled=compileEffectText(ability.effect,{sourceName:definition?.name||'Ability'});return compiled.supported?{supported:true,kind:'effect',compiled,reasons:[]}:{supported:false,kind:'effect',compiled,reasons:[`Effect resolver needs guided resolution for: ${(compiled.unsupported||[]).join(' | ')||ability.effect}`],guidedFallback:true};
}
export function spellSupport(definition){
  const type=String(definition?.typeLine||'');if(!/Instant|Sorcery/i.test(type))return{supported:true,kind:'permanent',compiled:null,reasons:[]};const text=oracle(definition).trim();if(!text)return{supported:true,kind:'spell',compiled:{supported:true,effects:[],requirements:[],unsupported:[]},reasons:[]};
  const modal=modalSpellSpec(definition);if(modal){const bad=modal.compiledModes.filter(x=>!x.supported);return bad.length?{supported:false,kind:'modal',compiled:null,modal,reasons:[`One or more modes need guided resolution: ${bad.flatMap(x=>x.unsupported).join(' | ')}`],guidedFallback:true}:{supported:true,kind:'modal',compiled:null,modal,reasons:[]}}
  if(/search your library/i.test(text))return{supported:true,kind:'search-spell',compiled:null,reasons:[]};
  const compiled=compileEffectText(text,{sourceName:definition?.name||'Spell'});return compiled.supported?{supported:true,kind:'effect',compiled,reasons:[]}:{supported:false,kind:'effect',compiled,reasons:[`Effect resolver needs guided resolution for: ${(compiled.unsupported||[]).join(' | ')||text}`],guidedFallback:true};
}
function staticLines(definition){
  const triggered=new Set(parseTriggeredAbilities(definition).map(x=>x.text));const activated=new Set(parseActivatedAbilities(definition).map(x=>x.text));return oracle(definition).split('\n').map(x=>x.trim()).filter(Boolean).filter(line=>!triggered.has(line)&&!activated.has(line)&&!/^\([^)]*\)$/.test(line));
}
export function staticAbilitySupport(definition){
  const rows=[];for(const line of staticLines(definition)){
    if(/^As .* enters/i.test(line)||/enters(?: the battlefield)? tapped/i.test(line)||/enters(?: the battlefield)? with .* counters? on it/i.test(line)){rows.push({text:line,supported:true,family:'replacement/entry'});continue}
    if(/^(Flying|Reach|Trample|Deathtouch|Lifelink|Vigilance|Haste|Menace|First strike|Double strike|Indestructible|Hexproof|Ward|Defender|Flash|Fear|Shadow|Infect|Wither|Toxic\s+\d+)(?:\b|$)/i.test(line)){rows.push({text:line,supported:true,family:'keyword/combat'});continue}
    if(/(?:creatures?|artifacts?|tokens?) you control (?:get [+-]\d+\/[+-]\d+|have |gain )/i.test(line)||/gets [+-]\d+\/[+-]\d+ for each/i.test(line)){rows.push({text:line,supported:true,family:'continuous'});continue}
    if(/can be your commander|Partner|Friends forever|Choose a Background|Doctor's companion/i.test(line)){rows.push({text:line,supported:true,family:'commander-deck-rule'});continue}
    // Rules text that changes permissions/restrictions may still require rule-specific support.
    rows.push({text:line,supported:false,family:'static/permission',guidedFallback:true});
  }return rows;
}
export function analyzeDefinitionSupport(definition){
  const activated=parseActivatedAbilities(definition).map(a=>({ability:a,...activatedAbilitySupport(definition,a)}));const triggers=auditTriggers(definition);const spell=spellSupport(definition);const asEnters=asEntersChoiceSpec(definition),entersCounters=entersWithCountersSpec(definition),statics=staticAbilitySupport(definition);const unsupported=[];
  for(const a of activated)if(!a.supported)unsupported.push(`Activated: ${a.ability.text}`);for(const t of triggers)if(!t.supported)unsupported.push(`Trigger: ${t.text}`);if(!spell.supported)unsupported.push(`Spell: ${(spell.reasons||[]).join(' ')}`);for(const s of statics)if(!s.supported)unsupported.push(`Static: ${s.text}`);
  return{name:definition?.name||'',definitionId:definition?.definitionId||'',spell,activated,triggers,statics,asEnters,entersCounters,unsupported,fullyAutomated:unsupported.length===0,guidedFallbackAvailable:unsupported.length>0};
}
export function auditDefinitions(definitions){
  const values=definitions instanceof Map?[...definitions.values()]:Array.isArray(definitions)?definitions:Object.values(definitions||{});const rows=values.filter(Boolean).map(analyzeDefinitionSupport);const unsupported=rows.filter(r=>r.unsupported.length);const families={};for(const r of rows){for(const a of r.activated)families[`activated:${a.kind||'unknown'}`]=(families[`activated:${a.kind||'unknown'}`]||0)+1;for(const t of r.triggers)families['trigger']=(families.trigger||0)+1;for(const s of r.statics)families[`static:${s.family}`]=(families[`static:${s.family}`]||0)+1;if(r.spell?.kind)families[`spell:${r.spell.kind}`]=(families[`spell:${r.spell.kind}`]||0)+1}
  return{total:rows.length,fullyAutomated:rows.length-unsupported.length,unsupportedCount:unsupported.length,coverage:rows.length?((rows.length-unsupported.length)/rows.length):1,rows,unsupported,families};
}
