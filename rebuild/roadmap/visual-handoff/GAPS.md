# Visual reskin: gap inventory (read-only audit)

Checkout: branch `wt/visual`, build 1.0.0-rebuild.113 (handoff pinned to build 110). Deck Builder files not re-versioned (deck/version.json not checked).
Method: layout-map `source`/element names extracted by script; app read via grep in `src/ui`, `styles/app.css`, `deck/ui`, `deck/cc-theme.css`.
Map `source` paths are the handoff author's guess; two are wrong or stale (noted). Evidence is `file:line` as of this checkout; lines drift.

## 1. Route map (51 handoff routes to app)

Routing: `registerScreen` in `src/main.js:28-39` (12 full screens). Everything else is `openModal` (`src/ui/modal.js:25`), so most "routes" are dialogs.

| Route | App location (file · function) | Status |
|---|---|---|
| landing | src/ui/screens/landing.js · landingScreen | exists (already image buttons) |
| welcome | src/ui/screens/welcome.js · welcomeScreen | exists |
| sign-in | src/ui/account-ui.js · openSignIn / signInForm (L133/L80) | exists |
| create-account | account-ui.js · signInForm (same form, "Sign up" toggle) | partial: one form, two modes |
| mode-select | screens/mode-select.js · modeSelectScreen | exists |
| play-options | mode-select.js · openModal at L42 (data-play) | exists (dialog) |
| free-play-options | same dialog as play-options (map source identical, same 8 elements) | duplicate of play-options; app has one dialog |
| tracker-options | mode-select.js · openModal at L29 (data-track) | exists |
| player-setup | screens/player-setup.js · playerSetupScreen | exists |
| saved-decks | seat-form.js · handleSeatAction (L65-105) | exists (dialog) |
| precon-catalog | seat-form.js · openPreconPicker (L105) | exists |
| import-deck | seat-form.js · handleSeatAction "Paste a deck list" | exists |
| host-room | screens/lobby.js · lobbyScreen (host with a seat) | exists |
| host-device | screens/lobby.js · lobbyScreen (host without seat) | exists, same screen, mode flag |
| join-room | screens/join.js · joinScreen | exists |
| online-games | screens/online.js · onlineScreen (list) | exists |
| online-room | screens/online.js · onlineScreen (seat pick, data-act pick-seat/take-seat) | exists, same screen |
| tracker-setup | screens/tracker-setup.js · trackerSetupScreen | exists |
| tracker-join | screens/tracker-join.js · trackerJoinScreen | exists |
| gameplay | screens/game.js · gameScreen render (L105-270) | exists, needs rework (section 3) |
| game-table | game.js · "Table" screen (`openTable` card-modals.js:225, `tableHtml` L218; judge branch L197) | partial: table is a modal for players, a screen for judge |
| game-judge | game.js · screen 'judge' / `judgePanelHtml` (L79-102) | exists |
| tracker | screens/tracker.js · trackerScreen | exists |
| tracker-judge | tracker.js · Table Menu (L704), Players (L735), Game Log; judge screen | partial: modals, no dedicated screen found |
| opening-hand | panels.js · openOpeningHand (L22) | exists |
| combat | combat-ui.js · openAttack (L8), openBlocks (L65) | exists (two dialogs, map shows attackers only) |
| confirm | modal.js · confirmDialog (L100) | exists (one shared dialog) |
| game-log | panels.js · openLog (L250) | exists |
| stack | panels.js · openStack (L263) | exists |
| host-tools | host-tools.js · openHostTools (L15) | exists |
| chat | panels.js · openChat (L281) | exists |
| card-id | panels.js · openCardId (L348) | exists |
| card-detail | card-modals.js · openCardDetail (L21) | exists |
| zone-detail | card-modals.js · openZone (L165) | exists |
| profile | screens/profile.js · profileScreen | exists |
| playmats | profile.js · openPlaymats (L143) | exists (upload slots; no built-in mat set) |
| profile-history | profile.js · case 'history' openModal (L98) | exists |
| achievements | profile.js · openAchievements (L123) | exists |
| settings | settings-modal.js · openSettings (L17) | exists |
| rules | rules-editor.js · rulesEditorHtml / bindRulesEditor (embedded in lobby/table-defaults, not its own dialog) | partial: editor is a fragment, map source name is right |
| help | judge-modal.js · openJudge (L7) "Ask the Judge" | exists |
| deck-home | deck/ui/views.js · viewHome (L114) | exists |
| deck-list | deck/ui/views.js · viewDecks (L160) | exists |
| deck-builder | deck/ui/deck.js · viewDeck (L908) with new-deck / generate (`gen-go` events.js) | exists |
| deck-open | deck/ui/deck.js · viewDeck (open deck, tabs) | exists |
| deck-upgrades | deck/ui/upgrades.js · Upgrades tab (S.tab 'up') | exists |
| deck-stats | deck/ui/views.js (Stats tab) | exists (not re-verified in detail) |
| deck-search | deck/ui/deck.js · viewSearch (L1138) | exists |
| deck-buy | deck/ui/library.js · viewBuy (L443) | exists |
| deck-library | deck/ui/library.js · viewLibrary (L514) | exists |
| deck-profile | deck/ui/cards.js · viewProfile (L1) | exists |

Missing outright: none. Partial: create-account, free-play-options (duplicate), game-table, tracker-judge, rules.

### App screens and dialogs NOT in the handoff (must keep working, themed)
| Item | Where |
|---|---|
| Declare blockers | combat-ui.js:65 |
| Decision / choice prompts (targets, modes, costs) | game/decision.js · openDecision (L20), 7 dialogs |
| Discard, guided resolve, vote, proposal, veto, correction | panels.js openDiscard L59, openGuided L98, openVote L162, openProposal L179, Veto L274, openCorrection L197 |
| Post-game ("Game complete") | panels.js openPostGame L212 |
| Game settings, Concede | panels.js openGameSettings L306 |
| Player info (life, poison, commander damage) | panels.js openPlayerInfo L425 |
| Player board / full table of one opponent | card-modals.js openPlayerBoard L192 |
| Pick one / text / number | card-modals.js L129-153 |
| Host tools sub-dialogs: edit player, create token, add any card, rules edit, end game, move hosting | host-tools.js L94-189, L81 |
| Tracker modals: Edit Decks, Game Stats, Reset Game/Table, Track a Card, Table Menu, Players, End Game, Game Complete, Reverse change, Leave table, Clear Log | tracker.js L386-845 |
| Share/QR/scan/pair dialogs, Show this to the host, Table rules (join) | share-code.js L75,109,149; join.js L89 |
| Online profile: Load/Save/Advanced/Saved-from-another-device/Stop saving; Which profile to keep; Sign out | backup-section.js; account-ui.js L31 |
| Dev report, store-outcome ruling | settings-modal.js L81; ruling-modal.js |
| Start-game checks (setup incomplete, loading decks, deck check, setup check), "Continue your game?" | app/start-game.js L17-59; online-profile.js L109 |
| Pass-device curtain | game.js L267 |
| Rotate gate (portrait) | index.html:20, app.css:78 |
| Toasts, confirmDialog | toast.js, modal.js:100 |
| Deck Builder sheets/modals (regen, compare, history, share link, etc.) | deck/ui/*.js (~hundreds of sheets, not enumerated) |
| Tracker "Table Menu" and tracker table view already match handoff `tracker` map, but tracker has its own life-total UI (`.tp__life-value`, app.css section 8-9) that the handoff does not show for gameplay |

## 2. Controls per route (map elements vs app controls)

Only differences are listed. "Map only" = no app control found; "App only" = app control with no map element (keep as themed control).

| Route | Map only | App only |
|---|---|---|
| landing | none | `.landing__foot` version line; app already uses art images for all 6 buttons; Continue is a `disabled` attribute set from `latestSave()` (landing.js:46) |
| welcome | none (4 elements: title, Sign in, Create an account, Continue without account) | map has no "Skip" wording; app labels "Sign up", "Sign in", "Skip - save on this device only" (welcome.js:15-17): label mismatch only |
| sign-in / create-account | none | code-entry steps: "Send code", "Send a new code", "Use another email", "Confirm" (account-ui.js) |
| mode-select | none | none (3 mode buttons + Back) |
| play-options / free-play-options | "Online games" present in both; map shows 4 options | app has 5th row `data-play="online"` ("Online games - play over time") and a "How many players?" remote-count picker (mode-select.js:5) |
| tracker-options | none | none |
| player-setup | none (15 elements incl. fields) | per-seat Remove, Advice, Paste list, tabs (data-act tab), remote seat toggle |
| saved-decks, precon-catalog, import-deck | none | none |
| host-room / host-device | "Pair device" label in map is a section title | app: "Change rules", "Pair a nearby device (no internet)", Kick/Remove, "Start now?" confirm |
| join-room | none | "Rejoin room", "Table rules" accept/decline dialog |
| online-games | none | "Join with this code", Scan QR |
| online-room | none | Remove game confirm |
| tracker-setup | none | Remove per seat; playmat picker (`data-act mat`) |
| tracker-join | none | none |
| gameplay | see section 3 | many: Counters, Sort, View Full, coach tip, phase-info, jewel, correction/challenge, rail zones (graveyard, exile, tokens, attachments) |
| game-table | map has per-seat "Counters / Graveyard / Exile" and Board/Table/Game Log tabs | app Table is a modal for players; screen-switch tabs (Board/Table/Judge) only built for judge/host (game.js:72-78, 235) |
| game-judge | none | Reverse per play (game.js:96), Stack chip |
| tracker | Home, Game Log, Ask the Judge present in app too | table menu, reset, track a card |
| tracker-judge | "Devices", "Full Log", "Clear Log" | covered by Table Menu / Players / Clear Log modals (tracker.js:704,735,845) |
| opening-hand | none | Discard-to-seven (separate dialog) |
| combat | blockers not in map | Declare blockers dialog |
| confirm | none | danger variant |
| game-log | none | none |
| stack | none | Veto (panels.js:274) |
| host-tools | map: Edit Life, Draw, Mill, Move Card, Add Counter, Change Phase, Correction | app also: Create token, Add any card, Rules edit, End game, Move hosting (host-tools.js) |
| chat, card-id, card-detail, zone-detail | none | scan card (card-id) |
| profile | none | Online section (openOnlineProfile), Players |
| playmats | map shows 3 installed mats + upload/delete/dim | app: default mat + locked/unlocked upload slots, Tint cycle, Replace; no built-in eight mats |
| profile-history, achievements | none | none |
| settings | none | Backup/Restore section, Advanced, Dev report, account section |
| rules | 35 elements | editor is shared fragment; no standalone dialog |
| help | none | category chips ("All") |
| deck-home | "Commander Companion" brand | continue-tile (phone-only), Buy shortcut |
| deck-list, deck-open, deck-upgrades, deck-search, deck-buy, deck-library, deck-profile, deck-stats, deck-builder | not individually reconciled (Deck Builder HTML is string-built with `data-act` attributes, `deck/ui/*.js`; a per-control pass belongs to the Deck phase) | Compare, History, Share link, Regenerate (`regen-go`) |

## 3. Features the handoff assumes

| Feature | Status | Evidence |
|---|---|---|
| Centre-opponent rotation (tap side seat, centre it, old centre goes to a side slot) | MISSING for players. Opponent tap opens `openPlayerBoard` modal (a full-screen dialog); `onFocus` re-focus exists only for the judge (`view.you ? null : ...`). Layout is one focus player (left rail + centre) and a right-hand list; no left/centre/right opponent slots | game.js:253,408; game.js:116-117 |
| Opponents show hand counts only | OK data-wise: `p.handCount` shown, hand cards rendered only for local (`focus.hand ?` else backs) | game.js:256,221-222; card-modals boardHtml (privacy of opponent board modal not re-checked) |
| Life on a die, amber status light, calls `openPlayerInfo(ctx, playerId)` | PARTIAL. `data-act="player-info"` on the life button already calls `openPlayerInfo(ctx, el.dataset.id)`; no die art, life is plain text `.rail-life__value`. Status = chips (poison, statuses) and a `status-light` dot meaning active turn, not amber/poison. No separate status button, no per-opponent die | game.js:173,176-178,161,409; panels.js:425 |
| Mana well, 7 colour cells + total | PARTIAL. `manaPoolHtml` renders cells for W U B R G C (filtered by colour identity, zero cells dimmed) plus one cell per flexible group; total in heading "Available Mana". Count not fixed at 7; art exists for W,U,B,R,G,C,any and 15 split pairs | game.js:182-185; card-view.js:113-123; assets/img/mana |
| Turn/phase heading + contextual Draw / Attack / next phase / End Turn | PARTIAL. Heading "Turn N - phase" in `.phase-box` (opens judge help) with 7-dot phase track. One contextual `jewel` button (label from coach: Draw, Attack...) plus one next-phase/End Turn art button; End Turn confirm exists (L389). Handoff shows separate jewel controls; app has one jewel + one next button | game.js:137,230-243,365-367,389-390 |
| iPhone log: last 3 entries, heading opens full log | PARTIAL. Log shows `view.log.slice(0,14)`, same on every device; heading is a `link-btn` `data-act="log"` opening `openLog`. No 3-entry phone variant, no device-class switch in JS | game.js:261-263,427; panels.js:250 |
| Stack / Undo / Board / Table / Host Tools buttons | PARTIAL. Stack chip (`data-act=stack`, L262), Undo art button with confirm/ask-undo rules (L264,430), Host Tools (L192 rail, L236 judge footer, role gated by `view.canEdit`). Board/Table only as judge tabs (L72-78); players reach Table via "View Full" (`openTable`, L204) | game.js |
| Eight playmats named in palettes.json (Amethyst, Dark-Alley, Night-Flight, Ember, Frost, Gold, Forge, Emerald) and a picker | MISSING. App has one built-in `DEFAULT_MAT` (background.webp) plus user-uploaded slots with unlock achievements. No palette concept; no mat art for 8 playmats in `assets/` (they ship in separate archive parts) | playmats.js:12,38; profile.js:143-190 |
| Eight life dice, independent selection, default match-playmat | MISSING. Grep for life-dice/spindown finds nothing; no setting, no assets | grep src,styles |
| Continue Game disabled state | EXISTS functionally: `disabled` attribute until `latestSave()` finds an unfinished game or tracker. Needs a disabled art variant (`art/phase/*-disabled.png` in map) and CSS `[disabled]` look | landing.js:32,46-48 |
| Landscape vs portrait | Landscape only: manifest `orientation: landscape`, `screen.orientation.lock` (main.js:47), CSS `.rotate-gate` for portrait (app.css:78). Sizing: `html{font-size:min(100vw/84.4,100dvh/39)}` (1rem = 0.1 design px on 844x390), safe-area vars `--safe-l/r/t/b` defined (app.css:32-35). Two tiers: iPad `min 1000x700` and phone via `not all and ...`. Handoff viewBoxes are 1160x535 (phone) and 1180x760 (iPad) and menus 1200x554; none match the 844x390 base, so a new scaling model is needed | app.css:1-60,525,1112 |
| Theme/CSS structure | One game stylesheet `styles/app.css` (1533 lines, 29 `--` tokens in `:root`, ~221 raw colour literals), tokens: `--bg --panel --line --accent --accent-strong --accent-glow --gold --good --bad`; fixed purple scheme. Deck Builder has a second theme `deck/cc-theme.css` (200 lines, ~39 colour literals, own tokens `--violet --glow --void --panel`, `--cc-frame` PNG frames), loaded after inline `<style>` in deck/index.html:15,433, pixel-sized not rem. UI built as JS template strings, so class/DOM hooks are stable but everything is hand-placed in CSS (no component layer). Existing art: `assets/img/{landing,ui,game,mana,mode,frames}` | styles/app.css; deck/cc-theme.css |

### How hard is a theme swap?
- Colours: medium. Tokens exist and are used, but ~221 literals in app.css (rgba of the purple) bypass them. Palettes need `--accent` family set from `palettes.json` primary/secondary at one root attribute plus a literal-to-token pass.
- Backgrounds: easy to medium. `matStyle(mat)` and `.game__mat` already take a background image per player; built-in mats would be added as entries (but `listPlaymats` only holds uploads).
- Chrome/art (headers, nine-slice panels, steel buttons): hard. Buttons are mixed CSS `.btn`, `.chip`, `.btn-pill`, `.btn-art` (img), `.jewel`; modals share `.modal`. Headers are not art-based except landing and mode-select. Needs a shared component pass first (the handoff's own step 1).
- Gameplay layout: hard. Current structure is left rail + centre + right rail on a flow layout; handoff is absolutely placed regions in a fixed viewBox with a content transform (iPad scale 1.242). Needs a rebuild of the render block (game.js:140-270) and a new grid or scaled-stage approach.
- Deck Builder: separate, keeps its own layout; reskin limited to `cc-theme.css` plus string-built markup.
- Persisted state to add: playmat choice, die choice, both in settings/profile; save migration is out of scope per the handoff.

## 4. Gaps needing owner decision
1. Opponent rotation (side seat to centre) does not exist; today an opponent tap opens a board dialog. Build it as new gameplay feature (the handoff says new features need separate scope), or keep the dialog and only skin it?
2. Life dice and eight selectable dice: no feature exists. Include (settings, profile storage, assets) or defer?
3. Eight playmats: only one built-in mat and uploaded slots exist. Add the eight as built-ins (where selected: Profile, Settings, Table Defaults, tracker setup, per player?), and does it replace or sit beside the upload/unlock slots?
4. Palette switching: one global palette, or one per game derived from the chosen playmat? Needs a setting and storage.
5. Amber status light replaces chips and the current turn dot; confirm that the active-turn indicator should move elsewhere (the dot at game.js:161 currently means active turn).
6. Draw / Attack / phase / End Turn: app has one coach-driven jewel plus one next button. Show handoff's separate controls (each disabled when not allowed), or keep the single jewel in the new art?
7. iPhone log of three entries and iPad log: confirm one JS device test (e.g. min 1000x700, same as the CSS tier) decides it.
8. Scaling model: the app scales by rem from an 844x390 base, the handoff uses 1160x535 / 1180x760 / 1200x554 stages. Pick fixed-stage-scaled or reflowing layout (handoff asks for reflow inside safe areas on narrow phones).
9. Routes without a distinct app screen: free-play-options (duplicate of play-options), create-account (same form as sign-in), host-device (lobby mode), online-room, tracker-judge, rules (fragment), game-table. Confirm these share one themed implementation with route-specific layout classes.
10. Dialogs and screens not in the handoff (list in section 1): themed with the shared panel kit and no per-route maps. Confirm acceptable, and that assets for Deck Companion routes (10 maps, string-built HTML) come in a separate phase.
11. Assets are in separate archive parts (the repo holds only layout JSON, palettes, README). Check where archive parts are to be placed before work starts; asset gaps cannot be assessed until extracted (e.g. disabled/pressed state art, 15 split-mana pairs vs the handoff's "flexible or split" art).
12. Welcome and sign-in wording differ from the maps (Skip label, Sign up vs Create an account). Use app wording or map wording?
