# Commander Companion — Work Mode Handoff
## Current build: V0.8 DC
Date: 2026-09-20

## Mission
Take this exact 229-file build as the working payload, correct the remaining DC deployment/version issue, and deploy the COMPLETE build to GitHub repository `MaxFHurt/CommanderCompanion` on `main`. Do not selectively patch an older DB build. Do not omit assets. The user explicitly requires the entire build to be pushed with no shortcuts.

### Immediate UI target
The Game Mode chooser was the page being edited. Required result:
- Back button is on the LEFT.
- Back button is substantially larger.
- Remove the weird/broken extra border around the Back control.
- Do not redesign unrelated UI.
- Menus overall are being handled ONE MENU AT A TIME; do not broaden the task unless Aaron asks.

The DC back-button CSS correction is already present at the end of `styles-v0739.css` under:
`/* V0.8 DC — Game Mode back control correction */`

## CRITICAL pre-deployment correction
The payload's `index.html` has `<title>Commander Companion V0.8 DC</title>` and loads `styles-v0739.css?v=080-dc`, BUT the visible landing footer currently reads `V0.8 CZ`.
Before deployment, change ONLY that visible build suffix to `V0.8 DC` unless another required reference is found during a literal version-string check. Do not turn this into a redesign.

## Deployment requirement
- Repository: `MaxFHurt/CommanderCompanion`
- Branch: `main`
- Deploy the FULL payload, not three patched files.
- This payload contains 229 files before this handoff note was added.
- If the upload interface has a 99-file limit, split the payload into groups of <=99 and upload sequentially while preserving paths.
- Ensure the build's own `index.html` replaces the repository root `index.html`.
- After deployment, verify the repository/root index and the live GitHub Pages page show V0.8 DC.
- Do not claim the deployment is complete until the complete payload is committed and the live page is verified.

## Current GitHub state before Work Mode handoff
The last known `main` commit from this chat was:
`689217a425116b71e70490cc4185496118ef60ac`
That commit was only a partial correction to the old DB deployment and MUST NOT be treated as the full DC deployment.

## Locked workflow / user direction
- Aaron directs testing. Do not invent broad stress tests.
- Keep changes narrow and literal.
- One menu/page at a time for this UI pass.
- Do not report work as done until it is actually done and verified.
- Preserve existing gameplay and visual work unless the requested page requires a change.

## Important visual/master assets INCLUDED in this package
These are part of the build and should remain with it:
- `game-visual-master-reference.jpg` — Guided/game visual reference.
- `landing-master-v0739.png` — landing master asset/reference.
- `ref-landing-reference.png`
- `ref-game-reference.png`
- `ref-profile-reference.png`
- `ref-deck-reference.png`
- `game-battlefield-master.jpg`
- `guided-header-master.webp`
- `ui-landscape-masters.css`
- `cc-master-guided-data.css`
- `VISUAL-REBUILD-NOTES.md` / `.html`
- `tests/visual-routing.spec.js`
- `tests/landscape-master.spec.js`
- `tests/master-match-flow.spec.js`

### Visual rules to preserve
- Purple metallic / silver-chrome / black theme; white lettering; no orange.
- Confirm = green themed control; Cancel = red themed control; Back/Close never commits.
- Guided/Freeplay: one continuous background through the entire player-card area inside the purple glow border.
- Commander art preserves aspect ratio; do not crop/stretch it.
- iPad Guided layout uses the approved Guided/Freeplay composition scaled proportionally, not a separate redesign.
- Table Tracker has its own locked final master composition; do not casually redesign it.

## Project-state/support files INCLUDED
The package also contains the current-state, build reports, handoffs, QA notes, future-work notes, guided-resolution list, workflow lock, and version notes. Use them for context, but the immediate mission above takes priority.

## Important current behavior/version observation
At handoff creation:
- `index.html` title = V0.8 DC.
- main stylesheet query = `styles-v0739.css?v=080-dc`.
- Game Mode Back markup exists as `#gameModeClose.dialog-back`.
- DC Game Mode Back CSS patch exists in `styles-v0739.css`.
- Visible landing footer is incorrectly `V0.8 CZ` and needs to become `V0.8 DC` before live deployment.

## Definition of done for this handoff
1. Correct the visible landing build suffix to DC.
2. Preserve the DC Game Mode Back fix.
3. Deploy every build file to `main` (using <=99-file groups if necessary).
4. Verify GitHub repository root is the DC payload, especially `index.html` and `styles-v0739.css`.
5. Verify the live GitHub Pages landing page displays V0.8 DC.
6. Stop there and return control to Aaron for the next menu/test instruction.
