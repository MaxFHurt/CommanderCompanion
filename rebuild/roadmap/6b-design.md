# 6b. Game-plan aware Deck Builder: design (for the owner's approval; nothing built yet)

Owner (13 Nov): "The app needs to be gameplan aware for decks also. Some functions such as web-slinging instigate reactions
from other effects. If I keep putting cards into my hand I'm either trying to force a discard OR I'm using spells that have an
entering trigger ... a lot of actions and interactions are just looking for keywords and not actual gameplay aware."

## 0. Where we are today

| Part | How it reads plans now | File · function |
|---|---|---|
| Plans list (suggested plans) | EDHREC theme pages first; else text patterns (`THEMES` regexes, 4+ cards) | engine/reading.js · buildThemes |
| Card fits a plan | EDHREC theme inclusion, or `tags(c).th` (regex) | engine/library.js · matchAim; core.js · ownAim (`OWN_RE`) |
| Commander's engine | regexes over the commander's text (makes tokens / counters / sacrifices, 12 trigger words) | core.js · commanderEngine, engineFit (reason only) |
| "Works with" | 9 give/want pairs, regex both sides (dies, enters, life, draw, counters, lands, spells, graveyard, sacrifice) | library.js · IX, ixOf, ixDeckMatches, worksWith (reason only, build 81) |
| Synergy with commander | the Deck Builder's own structured reader (makes/uses words) | rules.js · rrRead; functions.js · fnOf, fnSynergy (UP.syn) |
| Deck score synergy | EDHREC synergy + plan fit through matchAim | score.js · evaluateDeck |
| Game engine readings used | only `ENGINE_ROLES` (cards the reader gives no role), a static list | lists.js; tools/role-compare.mjs |

Gaps the owner describes: nothing links *what a card does* (returns a creature to hand, fills the hand, sacrifices) to *what
another card waits for* (an enters trigger, a discard payoff, a death trigger) except 9 regex pairs; returning to hand,
hand size, discard outlets, madness, "no maximum hand size", ninjutsu and web-slinging are not in any pair; "mine vs theirs"
is not checked (a trigger on an opponent's creature dying is counted as fed by your sacrifice outlet).

## 1. Model: enabler → payoff chains from the game engine's readings

### 1.1 Plan facts per card (built once per card, not per deck)
Each card gets two short lists, **gives** (game events it causes or resources it produces) and **wants** (events it waits
for or resources it spends), in one shared vocabulary that follows the game engine's own event names (triggers.js
PROBE_EVENTS, effect kinds in effects*.js):

```
fact = {ev, side, what, rep, src}
  ev   : enters | leaves | to-hand | cast | dies | sacrificed | discard | draw | hand-size | token | counter | life |
         landfall | to-graveyard | from-graveyard | attacks | combat-damage | tapped | untapped | copy-spell | ...  (~25)
  side : self ("when THIS enters") | mine | theirs | any
  what : creature | nontoken creature | token | artifact | land | instant/sorcery | noncreature spell | card | -
  rep  : 1 repeatable (static, activated, triggered, keyword cost) | 0.5 once (an instant, sorcery or one-off enters effect)
  src  : engine | reader | text   (which reading produced it; kept for measurement)
```

Examples. Mulldrifter: wants `enters/self`. Cloudshift: gives `leaves+enters/mine/creature` (once). Kaho-style bounce:
gives `to-hand/mine/creature`. Ninjutsu card: wants `attacks/mine` (an unblocked attacker), gives `to-hand/mine/creature`
and `enters/self`. Web-slinging card: wants `attacks/mine` (a tapped creature), gives `to-hand/mine/creature` and
`cast/self/creature`. Reliquary Tower: gives `hand-size` (no maximum). Anje's madness card: wants `discard/self`.
Bone Splinters: gives `sacrificed+dies/mine/creature` (once). Blood Artist: wants `dies/any/creature`. Viscera Seer:
gives `sacrificed+dies/mine/creature` (rep). Raise the Alarm: gives `token+enters/mine/creature`.

### 1.2 Where the facts come from (in this order)
1. **Game engine (src = engine)**, at build time in Node, the way tools/role-compare.mjs already loads it:
   - **wants:** each triggered ability from `parseTriggeredAbilities`; the game's own matcher (`triggerMatches`, as used
     by `probeTrigger`) is probed **one event type at a time** and with the source as self / mine / theirs, so the fact
     says exactly which events fire the trigger in a real game and from whose side. No regex on our side.
   - **gives:** `compileEffectText` on each spell, trigger effect and activated effect; effect kinds map to events
     (create-token → token+enters; bounce / return-self-hand / to-hand-ids on your own permanent → to-hand; sacrifice and
     sacrifice costs → sacrificed+dies; discard / discard-hand / wheel → discard; draw → draw; mill / surveil →
     to-graveyard; no-max-hand-size → hand-size; move-zone and graveyard-to-battlefield → enters …). Keyword costs the engine
     already plays (ninjutsu, web-slinging in game/ops.js · legal.js; madness, flashback …) map to fixed facts.
2. **The Deck Builder's own structured reader (src = reader)** for cards the engine does not compile (about 30%: 22,630 of
   32,300 cards are automatic, build 103): rules.js `rrRead` already gives trigger events (RR_TRIGGERS) and effect verbs;
   functions.js `fnOf` turns them into the same facts.
3. **Text (src = text)**: today's IX regexes, only for what neither reader covers. Shown in measurement as its own column so
   the share that is still keyword-based is visible and shrinks as the long tail is automated.

The facts are a **generated table** (`tools/plan-facts.mjs <cards.json.gz>` → `deck/plan-facts.js`, about 2-3 short codes a
card; size and run time not measured yet, batch A reports both; lists.js is 58 KB for comparison). It is regenerated
with each build, so a new mechanic the rules long tail adds reaches the Deck Builder by re-running the script, with no
Deck Builder rework (this is why it fits "judgement last": the model does not change when mechanics are added).

### 1.3 Chains (the plans)
A **chain template** pairs an enabler side and a payoff side; ~14 templates, each with a label and reason wording:

| Chain | Enablers give | Payoffs want |
|---|---|---|
| Re-cast / re-enter | to-hand (own creature or permanent), blink, ninjutsu, web-slinging | enters/self, enters/mine, cast creature |
| Blink | leaves+enters on own permanent | enters/self, enters/mine |
| Full hand → discard | draw (rep), to-hand, hand-size | discard outlets (rep), discard/self (madness), discard payoffs |
| Full hand → hand size | draw, to-hand, hand-size | "for each card in your hand", hand-size counts |
| Aristocrats | sacrificed/dies (outlets, fodder: tokens) | dies (mine or any), sacrificed |
| Tokens → enters | token, enters (mine) | enters/mine creature, token created |
| Spells | cast instant/sorcery, copy-spell, cascade | cast noncreature / instant-sorcery (mine) |
| Landfall | landfall (fetch, extra land, lands back to hand) | landfall |
| Counters | counter (mine) | counter put, counters on |
| Life gain | life | life gained |
| Graveyard | to-graveyard (mill, discard, dies) | from-graveyard (cast, return, count) |
| Draw punish | draw (opponents or each player) | draw/theirs |
| Attackers | attacks enablers (evasion, extra combat, untap) | attacks, combat-damage |
| Tapping | tapped / untapped | tapped, untapped |

Sides must match (a `theirs` payoff is not fed by your own outlet). A card can sit in several chains, and on both sides
of one (Viscera Seer). One step only in the first build; two-step chains (bounce → re-cast → enters → token → death) come
out naturally as several detected chains sharing cards.

**Deck reading** (`planOf(d)`, cached per deck list like `ixDeckMatches`'s IXD):
`E_k = Σ enabler qty × rep`, `P_k = Σ payoff qty × rep`, the commander and partner counting ×3 on either side.
A chain is **detected** when `E_k ≥ 3 and P_k ≥ 2` (or the commander is on one side and the other side has ≥ 2);
strength `min(E_k, P_k)`; it reports enablers, payoffs and which side is **thin**. Thresholds are set on the check set
(section 3), not on the benchmark.
**Card against deck** (`chainFit(d, c)`): which detected chains the card joins, on which side, and how many deck cards it
connects to (a few set lookups, like ixDeckMatches).

**Where it runs and cost.** Facts: build time only (Node). `planOf`: one pass over 100 cards, well under 1 ms; runs in the
same engine files on the page, in the builder worker (work.js) and its helpers, so generated decks see the same plans.
`chainFit` per candidate is O(number of facts), the same order as ixDeckMatches today. No extra worker needed. The table is
loaded with lists.js (helpers that hold only part of the library get the facts of the cards they hold).

## 2. What each part uses it for

| Part | Use | Changes results? |
|---|---|---|
| **Game plan read-out** (new, Build stats / deck page) | "Re-cast for enters triggers: 6 cards return creatures to hand → 9 cards with enters triggers. Thin: payoffs." Lists the cards each side. | No (display only) |
| **Card window "Works with"** | worksWith from chains instead of IX, with the chain named ("returns Mulldrifter to hand for its enters trigger") | No (text only) |
| **Upgrade reasons** (whyOrder) | "Fills your hand for Anje's madness cards (adds a payoff to a thin chain)", replaces "Works with N cards" | No (text and order of reasons only) |
| **Fix menus** (mana.js fixSwaps) | plan-aware picks: wipes that spare / hit your own card type, discard outlets for a full-hand deck, sacrifice outlets for death triggers, the thin side first; plus the approved-but-parked items in wip/README (lifegain as a way to win, Vandalblast as a wipe) | **Yes**: approval 1 |
| **Plans list** (buildThemes suggest) | detected chains offered as plans next to EDHREC themes; used when the commander has little or no play data; never replaces EDHREC themes for well-known commanders | **Yes** (aims drive scores): approval 2 |
| **Upgrade value** (baseScore) | a small bonus for a card that fills the thin side of a detected chain (not for joining a full one) | **Yes**: approval 3 |
| **Deck score synergy** (evaluateDeck) | part of synergy from chain strength (connected enabler + payoff pairs), so a deck that "does the thing" scores higher than one that has the keywords | **Yes**: approval 4 |
| **Generator** (buildPlan / genDeck) | keeps chains complete when cutting (does not drop the last payoffs); fills a thin side | **Yes**: approval 5 |

Past attempts to put interactions into the value (UP.kwB, ixDeckMatches at 0.1-1 per card, UP.syn) lowered agreement with
the expert lists. Two differences now: the bonus goes only to the *thin side* of a detected chain (not "works with many"),
and sides/what are checked by the engine. It may still not pass the benchmark; then 3-5 stay off and the reasons stay.

## 3. Measurement

Every batch reports all of these, before and after:
1. **Plan detection check set** (new, `deck/tools/tests/suite/plans/`, script `plancheck.js`): frozen decklists, each with
   the chains it **must** detect and the ones it **must not** (keyword traps). Reports hits, misses, false plans, and the
   share of facts from engine / reader / text.
2. **Owner's decks**: the 5 workbook decks (workbook.json, played.js): detected plans and the upgrade picks before/after,
   for the owner to judge.
3. **Upgrade benchmark** bench.js `tune`, `tuneall`, `test` (must not drop; `holdout` stays sealed until the last result
   batch, as BENCHMARK_PLAN.md says).
4. **Tournament match** tourney.js (match, core, raise, mid).
5. **Deck-test suite** (UI tests) and time per deck opened / per generated deck.
6. Optional, display batch only: in practice games (5.3) count which payoffs actually fired per game, as a sanity check
   that a detected chain happens in play (not used in any score: too slow and noisy).

Proposed check set (15 decks; EDHREC average deck or a fixed Archidekt list, frozen):

| # | Commander | Must detect | Must not detect |
|---|---|---|---|
| 1-5 | Owner's workbook decks: Captain America, Team Leader; Doctor Doom, King of Latveria; Ghalta, Primal Hunger; Leonardo (Turtle Power); T'Challa, the Black Panther | owner labels each (I propose a first label to correct) | owner labels |
| 6 | a web-slinging Spider-Man commander (owner picks the deck) | Re-cast / re-enter (web-slinging → enters and cast triggers); Attackers | Blink |
| 7 | Yuriko, the Tiger's Shadow | Re-cast / re-enter (ninjutsu); Attackers | Spells |
| 8 | Brago, King Eternal | Blink | Tokens → enters |
| 9 | Anje Falkenrath | Full hand → discard (madness, outlets); Graveyard | Draw punish |
| 10 | Nekusar, the Mindrazer | Draw punish; Full hand → discard (wheels) | Re-cast |
| 11 | Teysa Karlov | Aristocrats; Tokens → enters | Life gain as the main plan |
| 12 | Purphoros, God of the Forge | Tokens → enters | Aristocrats (no outlets) |
| 13 | Veyran, Voice of Duality | Spells | Re-cast |
| 14 | Tatyova, Benthic Druid | Landfall (incl. bounce lands back to hand) | Re-cast creatures |
| 15 | Meren of Clan Nel Toth | Aristocrats; Graveyard | Spells |

Pass mark for the detection batch (proposal): every "must detect" found, at most one "must not" per deck, and each
detected chain lists at least the enablers and payoffs a player would name.

## 4. Batches (smallest useful first; each measured as in section 3)

| Batch | Contents | Result change | Gate |
|---|---|---|---|
| **A. Facts + read-out** | plan-facts.mjs and table, planOf/chainFit, the check set, the Game plan read-out, chain-based "Works with" and upgrade reasons | none (benchmark and tourney must be **identical**) | check set pass mark; owner looks at the 5 decks |
| **B. Fix menus** | plan-aware Fix picks (+ the parked wip items) | Fix picks | owner's approval 1; bench/tourney not lower |
| **C. Plans list** | chains as suggested plans for commanders with thin play data | aims → scores | approval 2; bench not lower |
| **D. Upgrade value** | thin-side bonus, one weight, switch `UP.chain` | upgrade picks | approval 3; bench tune/tuneall/test not lower, tourney not lower |
| **E. Score + generator** | synergy from chains; generator keeps chains whole | scores, generated decks | approvals 4-5; holdout opened once at the end |

Each result batch has its own `UP` switch (0 = today's answers), so it can be shipped off and turned on after approval.

**Risks.** Engine misreads (5.1 found wrong wipe/protect readings): facts only use effect kinds and trigger probes, not the
engine's role guesses, and the check set catches the rest. The probe is permissive (built to find *any* way a trigger
fires): probing one event at a time with the side recorded narrows it; misfires go in a small exceptions list. About 30% of
cards fall back to the Deck Builder's reader or text; the share is reported every batch. A deck can show chains that are
not its main plan (a few incidental tokens): strength and the thin-side rule keep those out of the plans list. Benchmark
risk as in section 2: if D/E do not pass, they stay off.

**What stays keyword- or data-based.** EDHREC theme pages and their popularity (still the main signal for known
commanders); creature-type tribal; roles from reading.js (ramp, draw, removal, wipes, with ENGINE_ROLES); themes with no
event chain (voltron, stax, pillow fort, flying, X spells, legends); combos (Commander Spellbook); bracket and price rules.

## 5. Questions for the owner

1. Order of work: batch A changes no results; may it be built now (as a feature), with B-E waiting for step 3 (judgement)?
2. Facts from the game engine first, the Deck Builder's own reader as fallback: agreed? (The other way round is possible.)
3. The check set: are the 15 decks right, and will you label your 5 decks (I send a first guess to correct)? Which
   web-slinging deck?
4. Where the Game plan read-out goes: Build stats (next to Practice games) or the top of the deck page?
5. Which result uses do you want at all (B Fix menus, C plans list, D upgrade value, E score and generator), and is "the
   benchmark must not drop" still the bar for each, or may a plan-aware change that lowers it slightly come to you?
6. Should the facts table be regenerated with each app build, or added to the daily card-data job (4b) so new cards get
   facts the day they appear?
