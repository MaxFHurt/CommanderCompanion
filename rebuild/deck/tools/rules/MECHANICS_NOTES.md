# Mechanics notes for the engine

What the upgrade engine needs to understand about Magic to judge a card *for a particular commander*, not
just in general. Rule numbers refer to the Comprehensive Rules saved next to this file
(`MagicCompRules-20260925.txt`, effective 25 September 2026). `keywords.json` holds every keyword action
(rule 701), keyword ability (rule 702), ability word (207.2c) and glossary term, with the rules text.

## 1. Reading a commander

Every commander is an engine. Before judging any card, work out four things from its rules text:

| Question | What to look for | Example |
|---|---|---|
| **What does it make?** (outputs) | `create … token` (which token: creature type, Treasure, Food, Clue, Blood, Map, Incubator, Powerstone…), counters it puts, cards it draws, mana, life, damage | Ghired makes creature token copies; Chatterfang makes Squirrel tokens |
| **What sets it off?** (triggers) | `whenever you cast …`, `whenever … attacks`, `whenever … enters`, `whenever … dies`, `whenever you sacrifice`, `whenever you gain life`, landfall, `whenever you draw`, `whenever … is put into a graveyard`, `at the beginning of …`, `whenever you create a token`, counters being put | Veyran: instant/sorcery triggers; Teysa Karlov: death triggers |
| **What does it care about?** (counts, types) | `for each …`, `… you control get …`, creature types, card types, `power`, `+1/+1 counters`, `cards in your graveyard` | Edgar Markov: Vampires; Muldrotha: permanent cards in your graveyard |
| **What does it need to survive / be cast?** | cost, colours, whether it must attack, whether it is a lightning rod | Voltron commanders want protection and evasion |

A card then fits the commander in one of five ways, strongest first:

1. **Doubler**: multiplies what the commander makes or how often it triggers (token, counter and trigger
   doublers, extra combats, untap effects). Usually the best card for the slot.
2. **Payoff for its output**: uses what the commander makes (sacrifice outlets and "whenever a creature dies"
   for token makers; "whenever you create a Treasure" for Treasure makers; anthems for go-wide makers).
3. **Enabler of its trigger**: makes the commander trigger more (cheap instants for a cast trigger, evasion
   for a combat-damage trigger, sacrifice outlets for a death trigger, fetch lands and extra land drops for
   landfall, self-mill for graveyard counts).
4. **Shares its type or theme**: creature type, card type, keyword (a Rat for a Rat commander).
5. **Protects it**: hexproof/indestructible/blink for a commander the deck cannot work without.

Generic staples (ramp, draw, removal, wipes) still come first for the skeleton; the commander decides which
version (a token deck wants Skullclamp and Idol of Oblivion over Rhystic Study).

## 2. Tokens (rule 111)

* A token is a permanent that isn't a card. When it leaves the battlefield it ceases to exist (111.7, 111.8),
  so it can't be recurred from the graveyard; "dies" triggers still happen (it goes to the graveyard briefly).
* **Predefined tokens** (111.10) have fixed abilities: Treasure (sacrifice: add one mana of any colour),
  Food (2, sacrifice: gain 3 life), Clue (2, sacrifice: draw), Blood (1, discard, sacrifice: draw), Gold,
  Powerstone (mana for non-artifact spells only), Map (explore), Incubator (pay to transform into a
  Phyrexian), Junk, Shard, Walker, Role and others. They are artifacts (except Role, an Aura), so artifact
  payoffs count them.
* **Doublers** are replacement effects (614.1): "twice that many tokens" (Doubling Season, Parallel Lives,
  Anointed Procession, Mondrak), "that many plus one" (Adrix and Nev, Ojer Taq triples creature tokens),
  Primal Vigor (both players). Several doublers multiply each other.
* **Payoffs**: go-wide anthems, "whenever one or more tokens enter", populate (701.36), convoke,
  improvise for artifact tokens, sacrifice outlets plus death drain (Blood Artist, Zulaport Cutthroat),
  Skullclamp, Idol of Oblivion, Tergrid-style "whenever a token is created".
* The **token's own type** matters: a Rat token maker wants Rat lords and "Rats you control"; a Treasure
  maker wants "whenever you sacrifice a Treasure" and artifact-count cards; a Food maker wants Food payoffs.

## 3. Triggers and how to multiply them

* Triggered abilities (603) trigger once per event; "triggers an additional time" effects (Panharmonicon for
  ETB, Teysa Karlov for death, Isshin for attacks, Veyran for cast/landfall-style triggers, Elesh Norn,
  Mother of Machines) multiply a commander's engine.
* ETB/blink (603.6): flicker effects (exile and return) re-trigger enter abilities; the returned object is a
  new object (400.7).
* Death (700.4 "dies" = battlefield to graveyard): sacrifice outlets enable it; persist/undying
  (702.79, 702.93) return creatures with counters.
* Combat: extra combats, untap, haste and evasion (flying, menace, trample, "can't be blocked") make attack
  and damage triggers reliable.
* Cast triggers: copying a spell is not casting it (707.10); storm (702.40), magecraft (207.2c) and prowess
  (702.108) count casts.
* Landfall: fetch lands and Evolving Wilds give two land entries; extra land drops and land recursion.

## 4. Counters (rule 122)

* +1/+1 and -1/-1 counters annihilate (704.5q). Doublers: Doubling Season, Hardened Scales (+1), Branching
  Evolution, Corpsejack Menace, Vorinclex. Proliferate (701.34) adds one of each kind already there.
* Other counters matter too: loyalty, poison (toxic, infect), shield, stun, oil, energy (players), time
  (suspend, vanishing).

## 5. Graveyard

* Enablers: mill (701.13), surveil (701.25), discard/loot, connive (701.50), dredge (702.52), self-sacrifice.
* Payoffs: reanimation ("return … from your graveyard to the battlefield"), flashback (702.34), escape
  (702.138), unearth (702.84), embalm/eternalize, disturb, retrace, jump-start, delve, threshold/delirium,
  "for each card in your graveyard". Harness (701.64) plus ∞ abilities (702.186): The Soul Stone, once
  harnessed, reanimates every upkeep, a recursion engine for a graveyard deck, not just a mana rock.
* Graveyard hate (Bojuka Bog, Rest in Peace) works against these decks.

## 6. Combos and loops

The app reads complete and one-card-short combos from Commander Spellbook. Common patterns worth knowing:

* **Untap loops**: a mana source that untaps the permanent that untaps it (Dramatic Reversal + Isochron
  Scepter with 3+ mana from rocks; Basalt Monolith + Rings of Brighthearth).
* **Persist/undying loops**: a creature with persist + a sac outlet + a way to remove the counter (Melira,
  Solemnity, Vizier of Remedies or a +1/+1 counter cancelling it).
* **Copy loops**: Kiki-Jiki or Splinter Twin effects + an untapper ETB (Zealous Conscripts, Pestermite).
* **Life loops**: Sanguine Bond + Exquisite Blood.
* **Library wins**: Thassa's Oracle or Laboratory Maniac + Demonic Consultation / Tainted Pact.
* **Mana engines**: Food Chain + an exile-castable creature; Ashnod's Altar + Nim Deathmantle + an ETB token
  maker.
A deck that holds most of a combo should value the missing piece and tutors highly; a deck far from any combo
should not.

## 7. Rules that change deck building

* **Colour identity** (903.4): every mana symbol in the commander's and the card's text counts, including
  reminder-free costs; hybrid counts as both colours.
* **Commander tax and zone change** (903.8, 903.9): a commander that dies a lot wants cheap protection.
* **Legend rule** (704.5j): copies of legendary permanents die; token copies of a legendary commander need
  "isn't legendary" effects.
* **Replacement effects** (614): doublers apply once each; the affected player orders them (616.1).
* **Designations**: harnessed, goaded (701.15), monarch, initiative, suspected, the Ring: markers the engine
  must treat as game resources.
* **Summoning sickness** (302.6): mana creatures and tap abilities need a turn unless the creature has haste.
* **Split second, ward, hexproof, shroud** decide which interaction is reliable.

## 8. How the engine uses this (plan, Build 139+)

1. `keywords.json` gives every keyword and ability word; `KW_THEMES` in engine.js maps them to the app's
   themes (graveyard, tokens, counters, sacrifice, spells, artifacts, enchantments, lifegain, lands,
   voltron, blink, burn, aggro, draw).
2. `commanderEngine(cmd)` reads the commander's outputs, triggers and cares-about types (sections 1–5);
   each candidate card gets an engine fit (doubler, payoff, enabler, type, protection) that counts like the
   commander's own strategy in the score, with the benchmark deciding the weights.
3. Card reading gains the patterns above (Harness/∞ recursion, token types, trigger doublers) so cards like
   The Soul Stone are seen for what they do in the deck.
