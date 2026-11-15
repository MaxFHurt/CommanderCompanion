# Commander Companion visual rebuild

Build 110 · Deck Companion 0.9.71 build 216 · landscape iPhone and iPad.

## Start with the screen review

Open **Commander-Companion-Page-Review.pdf** and use its index. It shows 51 assembled screen and dialog previews on both devices. Use the current amethyst gameplay previews and layout maps for color and placement.

## Apply assets

- **Gameplay:** Use `layout/iPhone.json` and `layout/iPad.json` with `masters/`. The corrected placement maps put the log controls, lower-left controls, and hand title inside their artwork. The SVG overlays show the foreground and example content with a transparent playmat area. Treat sample text, cards, and dice numbers as placement references, and bind live values separately.
- **Landing and other screens:** For each folder in `screens/`, use the two device placement maps and its corresponding previews. `surfaces/` supplies route foregrounds. Use the foreground header and footer as a single composited layer or place the listed header and footer assets individually. Keep the panel content and buttons separate. Landing uses `Landing-Header.png` or its SVG wrapper. All other menu and dialog headers use a single title plate in `art/screen-header/`, with a lighting variant for every playmat. Center each live title inside the device map’s `titleBox`. Continue Game uses its disabled state when there is no resumable game.
- **Controls:** `audit/Control-Inventory.csv` references 784 source control records. `individual-controls/` contains separately named SVG references. Related controls share artwork. These SVGs link to the assets, so preserve folder paths. `art/` contains separate illustrated PNGs, state variants, and lighting masks. Preserve semantic controls and accessibility labels. Small printed faces can have larger, non-overlapping touch targets.
- **Playmats:** `palettes.json` maps eight palettes to their backgrounds and lighting colors. Use the matching art variants and keep the playmat underneath. `life-dice/options.json` supplies eight independently selectable life dice, defaulting to match the playmat. Keep printed mana symbols in their original colors.
- **Gameplay behavior:** Keep the local battlefield and hand visible. The selected opponent's battlefield appears at the top, and side opponents stay accessible in compact view. Keep opponent hands private and preserve individual commander, graveyard, exile, and status information. Preserve the existing actions, states, role permissions, and game logic.

The art is supplied as raster PNG/JPEG and editable SVG compositions containing raster artwork. The page previews are static. They show the visual assembly with sample content. Use the existing app for dynamic states and behavior.

## Gameplay player status light

Every player display has its own status light location beside the life die. Show the amber status lens only when that seat has poison counters or an active status. The number on the die remains the live life total. Put the turn and phase on the battlefield heading row. Keep name and commander tax in the identity area, library beside the die, and zone controls below.

Use the SVG or PNG in `art/status/` with the status positions in the device maps. The example renders show the local and centered seat lights. Bind the real view state, including on rotation. Use a separate accessible button with a comfortable touch target, reflowing the player cluster as needed, and call the existing `openPlayerInfo` action for that player's ID. The panel shows poison count, statuses, counters and commander damage. Suppress seat rotation when tapping the indicator. Keep the indicator amber across all playmats so its meaning stays consistent.

## Text and mana placement

Use the recessed name and zone readouts in the gameplay maps. The mana well contains the label, seven icon/count cells, and the total. Keep the mana symbols and values live. If the visible groups need more room, keep the full pool accessible through the existing player board detail.

Menu maps include inset title plates and safe text bounds for readout rows. Anchor each live label to its inset and measure it against its available width. Wrap or scroll long content inside the content area. Give short labels a fitted size and keep artwork clear of the text.

## Full-bleed iPhone gameplay

Use the iPhone-specific chassis `art/chassis/iPhone-{playmat}-edge.png` and the full-bleed placement map in `layout/iPhone.json`. The master is 1160 × 535 layout units. Fill the landscape viewport with the playmat and chassis. Anchor interactive targets and live text inside the device’s actual safe area in both landscape orientations. Reflow the sides and controls as needed for narrower devices and the home indicator. Preserve uniform scaling for cards, dice, icons and lettering. The phone log shows the three most recent events. Tapping its heading opens the existing full log. Keep Stack, Undo, Board, Table and Host Tools below it. Use the separate iPad master and map for tablets.

## Screen alignment

Center each screen's main stack in the landscape safe area on both axes. Center headers, panel groups and action rows on their shared axis. Center short lists vertically in their wells and start scrolling lists at the top when they fill the panel. Keep switches beside their labels. Gameplay uses the screen center for the wordmark and the center of each usable recess for the hand, phase and log. Keep the opponent, local player and side controls in their functional positions. The device maps specify these anchors.

## Button and lighting consistency

Use the faceted steel navigation face for regular text buttons, utilities, tabs and log controls. The utility, tab and log folders provide the same face fitted to those roles. Apply each control’s normal, pressed, selected or disabled state from the matching palette. Primary gameplay actions use jewel buttons. Switches and icon keys retain their dedicated shapes.

Tint lighting masks with the palette’s primary and secondary values. Both are purple in Amethyst, Night Flight and Frost. The other playmats retain their matching non-blue accent palettes. Mana symbols, card art, selectable die colors and the amber player-status indicator retain their own colors. Use the assembled masters as the current color reference.

The visible panel crowns, footer ornaments and phone gameplay crest are aligned in the supplied artwork. Use the existing placement maps and nine-slice settings.
