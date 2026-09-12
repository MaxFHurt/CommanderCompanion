# Commander Companion — V0.8.0 Batch 2 Update Report

Checkpoint: `V0.8.0-B2-MENU-DOCK`
Baseline: verified working `V0.8.0-B1-CORE-STABLE`
Scope: Batch 2 only — Menu System / Button Binding

## Implemented

1. **Contextual Back moved to the existing top Back control**
   - Generic action menus already had a permanent top Back row.
   - When a menu action list contains `BACK`, that action is now assigned to the top Back control instead of creating a second footer Back button.
   - Menus without a special contextual Back action keep the normal top Back behavior, which closes the modal.
   - This removes duplicate Back controls without changing menu destinations.

2. **Footer action ordering standardized**
   - `CANCEL` is normalized to the left side of the footer.
   - The current/final action is marked as the right-side action.
   - Other custom actions remain between those anchors in their original relative order.
   - Button labels and callbacks are not rewritten.

3. **Approved action PNGs applied to known actions**
   - Back → `ui-back.png`
   - Cancel → `ui-cancel.png` (approved red Cancel)
   - Confirm → `ui-confirm.png`
   - Save → `ui-save.png`
   - Delete → `ui-delete.png`
   - Undo → `ui-undo.png`
   - Home → `ui-home.png`
   - Profile → `ui-profile.png`
   - Settings → `ui-settings.png`
   - Game Log → `ui-game-log.png`
   - Help → `ui-help.png`
   - Custom actions use `ref-button-blank.png` so the exact live action text remains visible.

4. **Bottom dock binding hardened against rerenders**
   - Removed per-render `.onclick` assignment for `[data-hub]` controls.
   - Added one persistent delegated click listener on `#gameScreen`.
   - The listener resolves whichever current `[data-hub]` button exists after a render.
   - Covered dock destinations:
     - Home
     - Card ID
     - Game Chat
     - Player Rescue
     - Settings
     - Profile
   - Existing destination functions are unchanged.

5. **Deployment cache-bust references only**
   - `index.html` and `ipad.html` now request the Batch 2 `app.js` and `game-threefix.css` revisions.
   - No startup, service-worker, cache lifecycle, or resume logic was changed.

## Files changed from Batch 1

- `Uploaded 1st/app.js`
- `Uploaded 1st/game-threefix.css`
- `Uploaded 1st/index.html` — query/version reference only
- `Uploaded 1st/ipad.html` — query/version reference only

No rules-engine, combat, mana, persistence, deck, trigger, priority, network, phase, or state-engine source file was changed.

## Automated validation

- All 34 JavaScript files pass `node --check`.
- All 4 CSS files have balanced braces.
- Batch 2 source assertions pass:
  - persistent dock delegation exists;
  - old per-render dock `.onclick` binding is removed;
  - contextual Back is consumed by the top Back control;
  - contextual Back is not duplicated in the footer;
  - Cancel is ordered first;
  - current/final action receives the right-side role;
  - neutral custom button asset is present;
  - approved Back/Cancel/Confirm assets are present.
- All referenced Batch 2 PNG assets exist in the merged repository root.
- Compared against B1, only the four source/deployment files listed above changed before this report was added.

## GitHub upload split

- `Uploaded 1st`: 99 files
- `Uploaded 2nd`: 73 files including this report

Upload the **contents** of both folders into the same repository root. Do not create `Uploaded 1st` or `Uploaded 2nd` directories in the repository.

## Required manual regression test before Batch 3

1. Launch the same working 2-player Guided game path used to approve Batch 1.
2. Open several nested action menus and confirm only one Back control is visible and it is at the top.
3. Confirm Cancel appears on the lower-left when present.
4. Confirm the final/current action appears on the lower-right.
5. Confirm custom action labels remain readable and unchanged.
6. Exercise all six bottom dock destinations, then trigger game rerenders (phase progression, opening/closing a card or zone, player inspection where applicable) and exercise all six again.
7. Confirm Home still asks for confirmation and returns to landing correctly.
8. Confirm the landing page and main game geometry are otherwise unchanged from the approved B1 checkpoint.
9. Confirm Continue Game still works.

Do not begin Batch 3 unless this checkpoint passes.
