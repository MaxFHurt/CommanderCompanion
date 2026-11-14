# Commander Companion visual rebuild · Claude integration handoff

## Start here

The split downloads include all artwork, placement maps, controls, and the indexed screen review. Extract all the parts into a single folder and retain their directory structure. Open the Page Review part linked in [the download index](visual-rebuild-handoff.md) for the iPhone and iPad previews and `START-HERE.md` inside the Integration and Controls part for additional asset notes.

The audit in `audit/Counts.json` is pinned to build 110 and Deck Companion 0.9.71 build 216. Check the current checkout before applying the skin. Source line numbers in the audit are reference points. The running app is the functional source of truth. [Commander Companion repository](https://github.com/MaxFHurt/CommanderCompanion)

## Scope and ownership

Claude installs and places the supplied artwork, renders live content, and connects controls to existing behavior. Keep gameplay, rules enforcement, saved games, multiplayer, Deck Companion, accessibility, and role permissions intact. Keep existing functionality available when the preview shows only one state or omits a newer control. Flag asset or placement gaps for the owner and retain a functional themed control in the meantime. Any new feature, gameplay change, save migration, or deployment needs separate scope. The visual handoff itself made no repository changes.

## Asset map

| Path in ZIP | Use |
| --- | --- |
| `screens/<route>/<device>.layout.json` | Menu, dialog and screen placement. Read `viewport`, `header`, `footer`, `elements`, `titleBox`, `liveContentRect`, `textRect` and `slice` where supplied. |
| `screens/<route>/<device>.jpg` | Static composition reference. Card art, sample names, labels and values illustrate layout. |
| `surfaces/<route>/LAYERS.json` and `*-foreground.svg` | Route-level foreground, background and placement references. Resolve legacy aliases through the manifest. |
| `layout/iPhone.json`, `layout/iPad.json` | Gameplay maps. Use `viewBox`, `contentTransform`, `regions`, and the readout and alignment fields. Apply the content transform once. |
| `masters/<device>-<palette>.svg`, `*-Overlay.svg` and `*.jpg` | Gameplay placement proofs. Overlay compositions include sample interface content. Assemble the production view from the individual assets and live data. |
| `Landing-Header.png` and `Landing-Header.svg` | Dedicated one-piece landing header. |
| `art/screen-header/`, `art/chassis/` and other `art/` families | Individual foregrounds, recessed panels, buttons, state variants, and light masks. |
| `audit/Control-Inventory.csv`, `audit/Control-Inventory.json`, `individual-controls/` | 784 audited source control records and separately named SVG references. Related records share artwork. |
| `palettes.json`, `playmats/`, `life-dice/options.json`, `mana/`, `art/status/` | Theme mapping, swappable playmats, independently selectable dice, source mana artwork, and status indicator. |

SVG compositions and wrappers can include raster assets and relative references. Preserve their aspect ratios and native detail. Keep photos, cards, labels, values and logs in independently rendered layers.

## Device layout and typography

- Landscape only. Use the separate iPhone and iPad gameplay maps. The iPhone gameplay map uses a **1160 × 535** viewBox. The iPad map uses **1180 × 760** and includes a content transform. Verify both landscape orientations on physical devices or simulators.
- Run the iPhone playmat and chassis to all four edges. Use `art/chassis/iPhone-{playmat}-edge.png`. Account for the notch, rounded corners, and home indicator in interactive and text placement, reflowing clusters within the supported width. Preserve aspect ratios for cards, dice, icons, and lettering.
- Center menu and dialog compositions horizontally and vertically within the safe area. Align the visible header ornament, panel crown, labels, and action rows to the appropriate shared axes. Use the corrected artwork and the maps’ nine-slice caps. Center short lists vertically. Anchor longer lists at the top of their scrollable well.
- Render titles, names, status, numbers, and other live text inside their recessed faces. Use the map’s text bounds. Wrap or scroll prose and logs as needed. Constrain dynamic names and give the user access to the full value. Keep labels readable, consistent, and fully inside their controls. Put explanations in the panel outside the button.
- Use one header from `art/screen-header/` on the applicable menu and dialog routes. Use the dedicated Landing header on Landing. Place the continuous foreground art or its listed pieces once. Draw the live title in `titleBox`.

## Controls, palettes and layering

- Use the faceted steel text-button family for navigation, utilities, tabs, and log controls. The dedicated folders have matched faces sized for their roles. Use jewel faces for primary gameplay actions, and dedicated art for icon keys, toggles, checkboxes and sliders. Connect normal, pressed, selected, disabled, and available states to the existing control state.
- Match the sheet palette through `palettes.json`. Layer the playmat behind the art, using the matching palette assets and masks above it. Preserve the owner-approved silver steel, charcoal recesses, and purple LEDs in the default palette. Night Flight and Frost also use purple LED accents. Other playmat kits keep authored accents. The approved green palette is a playmat option and uses clean lighting.
- Keep card artwork and mana colors true to their source. Keep the amber status indicator consistent across palettes. Keep the eight die colors selectable independently with match-playmat as the supplied default.
- Use native or semantic interactive controls and accessible names. Give small art faces comfortable, non-overlapping touch targets. Preserve tap, focus, and scroll behavior and any role-based or disabled states.
- On Landing, bind Start Game, Profile, Deck Builder, Settings and Help to existing destinations. Bind Continue Game to the existing resumable state. The kit supplies a disabled treatment where the control is shown without a resumable game. Preserve the app’s established visibility and restore behavior.

## Gameplay integration

1. Anchor the local identity, life, mana, zones, full battlefield and face-up hand along the bottom. Place the center opponent and their battlefield above it. Keep the left and right opponent cards compact. Selecting a side seat moves it into the center and returns the previously focused opponent to a side slot. Keep the local board and hand visible during the change.
2. Read every player’s own data. Opponents show only hand counts. Keep battlefield, commander and tax, graveyard, exile, hand, library, life and status tied to the correct player. Keep commander access when the card is in play. Preserve relevant counters and zone actions.
3. Keep lands, creatures, artifacts, enchantments, planeswalkers and tokens reachable within their respective battlefield areas. Keep counters, tokens, attachment relationships and tapped state tied to the relevant cards. Support crowded boards and large hands through the app’s existing scrolling and inspection paths.
4. Draw the life total as live text on the spindown die face. Show the amber lens beside the correct player’s life die when that player has poison or an active status. Use a separate accessible tap target. Route it to the existing `player-info` action and `openPlayerInfo(ctx, playerId)`. Show that player’s poison, statuses, counters, and commander damage through the existing details view. Suppress opponent rotation on the status tap. Rebind seat IDs after any rotation.
5. Render available mana in the recessed well with its icon/count cells and total. Use actual white, blue, black, red, green, colorless and flexible or split mana artwork. Keep the values live and the full pool inspectable through the existing player board detail when the visible groups need more space.
6. Keep turn and phase live in the recessed battlefield heading row. Use the contextual jewel controls for Draw, Attack / Combat, phase progression, and End Turn as permitted by the current state. Keep existing prompts, response windows, legality and confirmations wired.
7. On iPhone show the three most recent log entries. The log heading opens the existing full log. Keep Stack, Undo, Board, Table and Host Tools accessible with existing role restrictions. Retain the larger iPad log.

## Route coverage

Use the PDF index and the per-route maps for these 51 reviewed screens and dialogs. Reconcile any additional routes and controls with the current app.

- **Start and setup** · Landing, Welcome, Sign In, Create Account, Mode Select, Play Options, Free Play Options, Tracker Options, Player Setup, Saved Decks, Precon Catalog, Import Deck.
- **Rooms and online** · Host Room, Host Device, Join Room, Online Games, Online Room, Tracker Setup, Tracker Join.
- **In game** · Gameplay, Game Table, Game Judge, Tracker, Tracker Judge, Opening Hand, Combat, Confirm, Game Log, Stack, Host Tools, Chat, Card ID, Card Detail, Zone Detail.
- **Profile, settings and help** · Profile, Playmats, Profile History, Achievements, Settings, Rules, Help.
- **Deck Companion** · Deck Home, Deck List, Deck Builder, Deck Open, Deck Upgrades, Deck Stats, Deck Search, Deck Buy, Deck Library, Deck Profile.

## Implementation and acceptance

1. Confirm the branch and route inventory. Map existing controls to supplied art and note genuine gaps. Integrate the shared theme, one-piece headers, and screen alignment before applying route-specific layouts.
2. Implement gameplay on both devices. Compare the live screenshots against the matching masters. Confirm the iPhone fills the screen, and verify the artwork’s visible centers, labels, and hit regions in both landscape orientations.
3. Exercise opponent rotation, private hands, each player’s individual zones, life and status taps, flexible mana, card counters and attachments, gameplay state transitions, and phone versus tablet log behavior.
4. Exercise Landing and resume, player setup, guided and free play, online host and join flows, tracker and judge views, card search and identification, profile, rules, deck tools, and every confirmation action represented. Check unavailable controls, empty and long lists, long names, larger text, touch targets, all eight playmats, and dice chosen independently of the playmat.
5. Capture paired iPhone and iPad screenshots for owner review. Report missing assets, layouts that need adjustment, and functional regressions separately. Include the iPhone edge-to-edge gameplay and the Welcome centerline.

The 51 screen previews were visually reviewed on both device layouts. The PDF screenshots were checked against the reviewed images. That review covered the static visual deliverables. Live interaction and device behavior are acceptance work for the implementation.
