# V0.8 HN — Menu scaling candidate (not yet live or visually verified)

Date: 2026-09-25
Base: V0.8 HM, commit 296f5de.

## Mission and boundaries
Resize utility and setup menus to readable, single-screen landscape layouts.
Do not redesign landing, Game Mode, Player Setup, or gameplay screens.
Landing version text and resource cache tokens advance to HN; its layout is unchanged.

## Live inspection completed on HM
Browser: available cloud Chrome at its default desktop landscape viewport.
Actual Safari/WebKit and iPhone viewport verification have NOT been performed.

- Settings: large fixed header/footer consume space.
- My Account: button text overlaps text baked into button artwork.
- Profile Editor: five stacked fields waste landscape width; save action is visually missing.
- Deck Editor: very small labels, nested scrolling, footer actions visually missing.
- Precon Catalog: names wrap into a narrow column; list uses little available space.
- Help / Player Rescue: long stacked sections require scrolling.
- Freeplay Rules: one narrow scrollable column leaves most of the screen unused.
- Freeplay Device Setup: inspected content and navigation.
- Player Stats: inspected rendered DOM; populated histories still need review.

## Candidate changes
- Explicit menu allowlist isolates new sizing from game dialogs and protected pages.
- Compact fixed header/footer, readable controls and text, visible action labels.
- Profile form uses landscape columns.
- Deck Editor uses Details / Cards / Analysis tabs while preserving existing inputs and callbacks.
- Rules use four columns; existing rule input IDs and values are preserved.
- Help sections use navigation tabs.
- Precon / saved deck / card results use pages; precons beyond the old 150-result cutoff remain reachable.
- A review-only page at tests/menu-review.html embeds the real app at selected landscape dimensions (including 852x393 and 1024x768). This does not emulate Safari.

## Verification completed
- JavaScript syntax checks passed for app.js and menu-fit.js.
- Protected Game Mode and Player Setup dialog markup matches HM exactly.
- Landing / game screen markup matches HM except version/cache strings and the scoped CSS link.
- Existing menu-landscape.css, styles-v0739.css, game-threefix.css, ui-landscape-masters.css and ui-render.js are byte-identical to HM.

## Blocker and remaining work
Automatic approval review rejected pushing this candidate directly to public GitHub main: publishing was not considered explicitly authorized. No alternate publishing path was attempted.
Local browser preview was blocked by the cloud browser (ERR_BLOCKED_BY_CLIENT).

The mission is NOT complete. After explicit publishing authorization:
1. Check main has not advanced; preserve any newer changes.
2. Publish candidate and verify matching live version.
3. Use the review frame to inspect phone landscape dimensions and correct visible issues.
4. Finish remaining setup/network/opening-hand/utility menu routes; verify inputs and navigation.
5. Check all protected pages still match; provide final screenshot evidence and a verified build archive.

Do not label HN a safe baseline until visual checks pass. HM remains the rollback point.
