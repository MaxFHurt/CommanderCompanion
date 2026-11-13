# Resource map — where to look (read this, not the codebase)

Line numbers drift; grep the heading if a range misses. Keep this file updated.

## Docs (read only the section you need)
| Need | Where |
|---|---|
| Owner's rules | `rebuild/HANDOFF.md` §2 `## 2. Owner's rules` (~L162) |
| Live build + recent builds | `rebuild/HANDOFF.md` §1 (~L6-160; newest first) · `rebuild/build.json` |
| Architecture | `rebuild/HANDOFF.md` §3 (~L194) |
| Feature map | `rebuild/HANDOFF.md` §4 (~L356) |
| Shipping steps | `rebuild/HANDOFF.md` §5 (~L429) → skill `ship-build` |
| Tests | `rebuild/HANDOFF.md` §6 (~L437) → skill `run-checks` |
| Known issues / roadmap | `rebuild/HANDOFF.md` §7-8 (~L476, ~L507) · `rebuild/ROADMAP.md` (grep `^## `) |
| Card automation counts + log | `rebuild/PROGRESS.md` top ~60 lines (`Where it stands`, `Paused`, `Known limits`) |
| Rules audit | `rebuild/RULES_AUDIT.md` |
| Deck Builder docs | `rebuild/deck/README.md` (Files table), `rebuild/deck/WORK_SESSION_HANDOFF.md`, `rebuild/deck/ROADMAP.md` |

## Code — game app (`rebuild/src/`)
| Area | Where |
|---|---|
| Entry / version | `src/main.js`, `src/version.js` |
| Game flow (DOM-free) | `src/game/controller.js` (dispatch) → `flow.js` (settle) → `view.js`; coach/tips `coach.js` |
| Choices / targets / legality | `src/game/ops.js`, `requirements.js`, `legal.js`, `sba.js` |
| Bot + practice matches | `src/game/bot.js`, `practice-match.js`, `practice-cards.js` |
| Rules text → effects | `src/engine/effects.js` (`compileEffectText`), long-tail wordings `effects-b49.js`, `effects-b101.js`, amounts `amounts-b101.js`, `effects-catalog.js` |
| Triggers | `src/engine/triggers.js` (`collectTriggers`), `triggers-catalog.js`, `keyword-triggers*.js` |
| Combat / mana / play legality | `src/engine/combat.js`, `rules.js`, `mana-extras.js`, `phase.js` |
| State changes | `src/engine/transactions.js` |
| Sessions / online | `src/app/session.js`, `online-session.js`, `checkpoints.js`; net `src/net/`; worker `cloud/worker.js` |
| Data (profile, decks, cards) | `src/data/` (`card-api.js`, `deck-store.js`, `profile.js`, `precons.js`) |
| UI | `src/ui/` (`card-view.js` mana pool, `screens/game.js`), CSS `rebuild/styles/app.css` |
| Long-tail batch tools | `rebuild/tools/longtail/` |

## Code — Deck Builder (`rebuild/deck/`)
| Area | Where |
|---|---|
| Script load order | `deck/files.json` |
| Engine | `deck/engine/` (core, practice, reading, rules, functions, score, library, upgrades, mana, generator, strength) |
| UI | `deck/ui/` (base, companion, storage, library, views, upgrades, deck, cards, events, boot) |
| Worker | `deck/work.js`, `deck/match-worker.js` |
| Build minified | `sh deck/tools/build.sh` (never edit `*.min.js`) |
| Tests | `deck/tools/tests/suite/` (`ui-test.mjs` is 320 KB — grep test ids, don't read) |

## Never read whole
`*.min.js`, `deck/tools/rules/keywords.json`, `MagicCompRules-*.txt`, `*.json.gz`, `ui-test.mjs`, `assets/`.

## Other repo
`MaxFHurt/Deck-Companion` is retired (forwards to `rebuild/deck/`); history and `test-data`/`card-data` branches only.
