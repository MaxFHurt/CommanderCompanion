# Commander Companion — Batch 2.3 Dock Router Fix — AA

Visible landing build annotation: `V0.8 AA`

## Reproduced defect
Bottom game-screen controls showed the pressed/touched visual state but no action opened.

## Root cause
The shared dock dispatcher constructed an action map containing `rescue: openRescue`, but no `openRescue` function exists in the application. Because object-literal values are evaluated before the selected key is invoked, tapping any dock control raised a `ReferenceError` while constructing the map. This prevented all six bottom dock actions from dispatching.

The existing Player Rescue implementation is `openHelp()`, which opens the `PLAYER RESCUE` interface.

## Correction
Changed only the invalid dispatch target:

- `rescue: openRescue` -> `rescue: openHelp`

The existing per-render click binding introduced in B2.2 is retained.

## Dock routes verified statically
- Home -> Return Home confirmation
- Card ID -> `openGlobalPicker()`
- Game Chat -> `openChat()`
- Player Rescue -> `openHelp()`
- Settings -> `openSettings()`
- Profile -> `openProfile()`

## Iteration identification
The landing footer now displays `V0.8 AA`. The annotation uses the existing footer styling; no font-size or layout scaling was added.

`index.html` and `ipad.html` module/style query strings were changed to the AA identifier so browsers request this iteration rather than reusing the prior B2.2 module response.

## Scope
No combat, mana, persistence, deck/profile behavior, card rules, multiplayer rules, startup/service-worker logic, Freeplay, or Table Tracker behavior was changed.
