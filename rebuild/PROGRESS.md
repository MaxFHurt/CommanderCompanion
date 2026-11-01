# Card automation progress

Updated with every push (owner's rule, 1 Nov 2026). Newest first. Counts come from `tools/rules-audit.mjs`: the top 1,000 from
`tests/fixtures/top-commander-cards.json.gz`, the whole catalog from the Scryfall Commander-legal list (31,770 cards, split into
4 chunks and run in parallel). New wordings live mainly in `src/engine/effects-b49.js` and `src/engine/keyword-triggers-b49.js`;
tests are in `tests/node/catalog.mjs`. See HANDOFF.md for architecture and release steps.

## Where it stands

- **Live build:** 1.0.0-rebuild.51
- **Top 1,000:** 1,000 run by themselves (all done).
- **Whole catalog:** 21,001 of 31,770 (about 66%); about 10,770 still need something done by hand. It is a long tail: the
  commonest remaining wordings cover only a few dozen cards each.
- **Next:** keep going in batches, stopping every 100 newly automated cards to check in with the owner.

## Known limits

- Moraug: the extra combat comes after the second main phase, not straight after the phase it triggered in.
- Kardur: goads the opponents' creatures it sees as it enters; creatures they get later are not affected.
- A land that becomes a copy (Thespian's Stage …) keeps the mana it made before.
- Dredge is offered in the draw step and for the controller's own draws from a resolving spell or ability; not for draws another
  player's effect gives them ("target player draws").
- Cumulative upkeep and Echo are automatic only for mana costs (and "Pay N life" upkeep).
- Still by hand: Mutate, Banding, Haunt, Assist, Companion, Forecast, and most of the long tail.

## Log

### Build 51 — 1 Nov 2026 — the top 1,000 complete
- Top 1,000: 969 → 1,000. Whole catalog: 20,892 → 21,001.
- The last 31 top cards: copy lands (Thespian's Stage, Shifting Woodland, Mycosynth Gardens), Dauthi Voidwalker (void counters),
  Kutzil, Ripples of Undeath, Return the Favor, Conduit of Worlds, Culling Ritual, Puresteel Paladin and Danitha (equip costs),
  Tibalt's Trickery, Hydroelectric Specimen, Trouble in Pairs, Archdruid's Charm, Springheart Nantuko, Life from the Loam (Dredge),
  Bloodchief Ascension and The Gitrog Monster (a "put into a graveyard" event for every way a card gets there), Inkshield,
  Buster Sword, The Soul Stone (harness, ∞), Ripples of Potential, Breach the Multiverse, Throne of Eldraine, Promise of Loyalty,
  Desperate Ritual (Splice onto Arcane), Cut a Deal, Moraug, Mechanized Production, Kardur.

### Build 50 — 1 Nov 2026 — batch 2
- Audit made honest: keyword lines are read without reminder text, so about 580 cards with by-hand keywords are no longer counted
  as automatic. Honest build 49 figure: 20,226. Build 50: 20,892 (+666). Top 1,000: 944 → 969.
- Engine bug fixed: "Target creature gets +X/+X and gains …" dropped the +X/+X (about 140 cards).
- Keywords: Bushido, Rampage, Afflict, Flanking, Battle cry, Annihilator, Dethrone, Melee, Mentor, Training, Evolve, Fabricate,
  Living weapon, Renown, Soulshift, Extort, Echo, Cumulative upkeep, Ingest, Backup, Myriad, Enlist, Provoke, Champion, Umbra armor,
  Outlast, Embalm, Eternalize, Transmute, Reconfigure, Craft, Disturb, More Than Meets the Eye, Prototype, Bestow, Surge, Strive,
  Read ahead, Amplify, Tribute, Ascend, Split second; plus many top-list wordings.

### Build 49 — 1 Nov 2026 — batch 1
- Known bugs fixed: extra mana of another colour (Utopia Sprawl, Wild Growth on a non-Forest, Fertile Ground); "you may tap or
  untap" no longer offers "Neither" after the yes/no.
- Gift, Hideaway, Imprint, casting copies, abilities granted until end of turn, Entwine, Escalate, Spree, Replicate, Casualty,
  Bargain, Offspring, Squad, and top cards (The Ozolith, Etali, Braids, Sevinne's Reclamation …). Top 1,000: 924 → 944.
