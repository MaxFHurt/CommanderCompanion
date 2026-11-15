# Phone and iPad checks (kept up to date with every build; the owner runs it once, at the end of the roadmap)

## Settings → Backup (recovery email)
1. ☐ Settings → Backup → Online, link an email to your profile key → expect a message that the email is linked.
2. ☐ Open the recovery link from that email on the phone or iPad → expect the app opens and offers to bring back your profile key.
3. ☐ Ask for a recovery email a third time within an hour → expect a clear "try again later" message, no crash.

## Generate panel (Deck Builder)
4. ☐ Open Generate on a deck, pick a price level other than Mid, close Generate and open it again → expect the same price level is still picked.
5. ☐ Pick a different mode, leave the deck and come back to Generate → expect the mode you chose last is still picked.
6. ☐ Create a new empty deck and let the setup pop-up appear → expect Theme first is switched on.
7. ☐ Generate a deck from a theme at a price level other than Apex → expect the new deck keeps that price level and the theme (not Apex).
8. ☐ Generate a second deck straight after the first → expect the same theme and price level carry through.

## Decklist pictures
9. ☐ Open a long deck on mobile data and scroll down the list → expect pictures fill in within a few seconds per screen, no long blank rows.
10. ☐ Scroll fast to the bottom of a long deck and back to the top → expect the page stays responsive and the pictures are still there.

## Power bar and Build stats
11. ☐ On Upgrades, tap the power bar → expect its pop-up to give the deck score and the Apex build's score, and that deck score to match Build stats.
12. ☐ Swap one card, then check the power bar and Build stats again → expect both to move the same way (both up or both down), by a similar small amount.
13. ☐ Open and close the card window, or change the sort, and look at the pictures → expect pictures stay on screen and do not go blank or reload.

## Layout (build 108)
14. ☐ iPad held upright, Deck Builder → expect the logo and "Deck Builder" title never overlap the buttons at the top.
15. ☐ iPhone held sideways, open a deck → expect one row of deck buttons that scrolls sideways, with the last button faded at the edge.
16. ☐ iPhone held sideways, Deck Builder → expect nothing hidden under the notch or the rounded corners.
17. ☐ Open a card's window from an upgrade → expect Take out and Put in tiles the same height.
18. ☐ A deck with a long card name (e.g. a card with two names) → expect the name ends in "…" instead of running off the row.

## Card rules (build 108)
19. ☐ Play a card that connives → expect the draw first, then a question asking which card to discard (the new card included).

## Any player may activate (build 110)
20. ☐ Two players: one controls Feral Hydra (or Warmonger, Xantcha), the other taps the permanent on their own phone → expect an ability button on the opponent's permanent, and using it asks the activating player (not the controller) for mana and choices.

## Land types, colours, optional damage, cost choice (build 110, batch 4 review)
21. ☐ Activate a card that makes a land "the basic land type of your choice" (Reef Shaman, Mystic Compass) → expect a question for the land and one for the type; the land then taps for that colour only until end of turn, and for its own colour again next turn.
22. ☐ Play Urborg, Tomb of Yawgmoth (or Blanket of Night) → expect every land (yours and the opponent's) to tap for {B} as well as its own colour.
23. ☐ Cast a creature with "you may have this creature deal 3 damage to target creature" (Sand Strangler) with a Desert on the battlefield → expect a yes/no question, then a target; with no Desert, expect no question at all.
24. ☐ Opponent activates your Tidal Control ("Pay 2 life or {2}") → expect them to be asked which cost to pay when they can pay either; with no lands they pay life, with 1 life they pay mana.
25. ☐ Cast Flame Spill (4 damage) on a 2/2 → expect the creature to die and its controller to lose 2 life.
26. ☐ Cast Touch of Darkness (or Sway of Illusion) on several creatures → expect them to show as black (or the colour you picked) until end of turn.

## Library searches for several cards, instead-sentences, colour keywords, Treasure mana (build 110, batch 4 sent-back fixes)
27. ☐ Play Tiamat (or Omenpath Journey, Oreskos Explorer) → expect one choose-many question listing the matching cards (several, up to the limit), names that repeat are refused, the chosen cards go to hand (or exile for Omenpath), and the library is shuffled.
28. ☐ Play Burning-Rune Demon → expect "search?" then two cards of different names; the opponent's phone is asked which one goes to your hand (the other goes to your graveyard).
29. ☐ Composer of Spring / Court of Bounty: with fewer than six enchantments (or not the monarch) expect one question offering lands only; with six enchantments (or as the monarch) one question offering creatures and lands.
30. ☐ Scion of Draco with a white, a blue and a green creature → expect vigilance on the white one, hexproof on the blue one, trample on the green one (Scion itself has none).
31. ☐ Alchemist's Talent at level 3: sacrifice a Treasure for mana, cast a spell with it → each opponent takes damage equal to its mana value; cast the same spell with lands only → no damage.
## Rules long tail, batch 5 (build 111): alternative costs, prevention, reveal-X, control-while
32. ☐ Hand holds Gush (or Daze, Fireblast, Foil, Snag) → expect an extra "Return two Islands / Sacrifice two Mountains / Discard an Island card … instead" cast option, then a question to pick the lands or cards; no mana is paid.
33. ☐ Hand holds Blazing Shoal (or another Shoal) and a red card → expect "Exile a red card (mana value X) from your hand instead"; X is that card's mana value.
34. ☐ With a Plains: Angelic Favor / Ramosian Rally offer "Tap an untapped creature you control instead"; Angelic Favor is refused outside combat.
35. ☐ Cast Scent of Ivy (or a Seer's ability) → expect a choose-many of your green cards to reveal (none allowed); the pump equals the number chosen.
36. ☐ Cleave card (Fierce Retribution): two cast options (normal, Cleave); with Cleave the bracketed word ("attacking") no longer limits the target.
37. ☐ Forfend / Thwart the Enemy / Vine Snare / Defend the Hearth: damage that should be prevented is prevented for the rest of the turn.
38. ☐ Mind Flayer, Helm of Possession, Sower of Temptation: the stolen creature returns when the condition ends (source leaves, untaps, or stops being controlled); Helm's ability is offered with an opposing creature in play.
39. ☐ Valiant creature (Heartfire Hero): targeting it with your spell gives one counter the first time each turn only.
## Rules long tail, batch 5 part B (build 112): prepared
40. ☐ A prepare creature that "enters prepared" (Spellbook Seeker // Careful Study): once it is on the battlefield its details say "Prepared", and a card named after its spell (Careful Study) appears in your exile, castable for its own cost.
41. ☐ Cast that exile copy → it resolves, the creature is no longer prepared, and the copy is gone (not in the graveyard). In hand, the card offers only its creature face.
42. ☐ Grave Researcher (or any "becomes prepared" trigger) → after the trigger the creature shows "Prepared" and the copy appears in exile; if the creature leaves the battlefield the copy disappears.
43. ☐ Empower Jace (Countersculpt, Theorist's Sanctum): a blue "Jace" planeswalker token appears with the loyalty given; a second empower adds to the same token; its −1 (surveil) and −3 (draw) abilities can be used.
44. ☐ Endure (Fortress Kin-Guard): as the ability resolves you are asked "+1/+1 counters on it" or "a white Spirit token" of that size.
45. ☐ Cipher (Hidden Strings, Last Thoughts): after the spell resolves you may pick a creature; the card goes to exile, and when that creature deals combat damage to a player you are offered a free copy.
46. ☐ Harmonize (Wild Ride): the card in your graveyard offers "Harmonize"; casting it asks which untapped creature to tap (or none) and the cost drops by its power; afterwards the card is in exile.
47. ☐ Day and night: with a daybound werewolf in play the turn header shows "· Day"; after a turn with no spells it shows "· Night" and the werewolf shows its back face.
48. ☐ Thoughtlace-style "target spell or permanent" and Unsubstantiate / Venser: spells on the stack are offered as targets.
49. ☐ "Gains your choice of …" (Butcher of the Horde, Steel Seraph): you are asked to pick one keyword, and only that one is granted. "+1/-1 or -1/+1" (Endling): a yes/no picks which.
50. ☐ Hero of Bladehold / Leonin Warleader attacking: the new tokens appear tapped and already in the attack (shown attacking the same player); Fire Navy Trebuchet's token is named Ballistic Boulder.
## Accounts (build 110)
A1. ☐ First open after the update → expect Sign up / Sign in / Skip. Choose Sign up with your email → a 6-digit code arrives (check spam) → type it in → your decks, stats and playmats are all still there.
A2. ☐ Close and reopen the app → expect no sign-in again.
A3. ☐ On a second device: Sign in with the same email → expect your profile loads by itself, no key asked.
A4. ☐ Settings → Backup → Account shows your email; Sign out → the profile stays on the device.

## Gameplay screen: seats, status light, turn buttons, log (visual rebuild, structure before the art)
G1. ☐ 4-player game on iPhone (landscape): the opponent across the table is in the centre above your battlefield with their cards; the other two are small seats left and right of it. Your board, lands and hand stay visible.
G2. ☐ Tap a left or right seat → that player moves to the centre and the old centre player takes that side slot. Tap the centre player's name → their board opens.
G3. ☐ The round light beside each life total: green normally, yellow while a "this turn" / "until your next turn" effect is on that player, red with poison. Tapping the light opens that player's details and never moves the seats; it is easy to hit with a thumb.
G4. ☐ Your turn: only the buttons you can use show (Main 1: Combat and End Turn; combat with attackers: Attack, Next Phase, End Turn; Main 2: End Turn). Someone else's turn: none, unless you can respond (Pass). End Turn early still asks to confirm.
G5. ☐ iPhone: the log shows the 3 newest lines; tapping "Game Log" opens the full log. iPad: the longer log stays.
G6. ☐ Stack, Undo, Board, Table and Host Tools / Edit Game / Challenge sit under the log and open as before.
G7. ☐ Same checks on iPad (landscape), and on iPhone in portrait if the game is played that way.
## Playmats, palette and life dice (visual rebuild, step 1)
M1. ☐ Profile → Playmats and Dice → expect 33 playmats and 33 dice (plus Match playmat); the Amethyst mat and die are open, every other one is locked and reads "Earned at random from achievements and games/wins". The picker also says "Next playmat in N games, next die in N wins". No upload button anywhere.
M2. ☐ Rewards are drawn at random, once, and kept: every achievement earned gives the next reward, alternating playmat, die, playmat, die …; every 3 games played a random locked playmat; every 2 wins a random locked die. Nothing repeats. Earn one, close and reopen the app → the same reward is still there; on a second device with the same profile → the same rewards, and nothing is taken away. Tap an unlocked one → "In use"; the menus take it. Reopen the app → still selected.
M3. ☐ Life dice: pick an unlocked die → it stays when you change the playmat. Match playmat is the default and shows the die of the playmat's palette even while that die is still locked. Profile → Achievements shows "Level N of 29", a progress bar, "Next achievement: a playmat" (or a die), "Next playmat in N games, next die in N wins", and the rewards the achievements have drawn so far ("Achievement 1: Ember playmat").
M8. ☐ The 25 reward playmats and 25 reward dice: their pictures show in the picker (they load when the picker opens, not at install; check with Wi-Fi off once after installing that the first eight still work). A reward playmat shows its own picture behind the menus: the wide iPhone picture on an iPhone held sideways, the iPad one on an iPad; turning the device switches. Its buttons and header take the nearest of the eight palettes (list in the report).
M4. ☐ A profile that had an uploaded playmat before this build opens with Amethyst and nothing missing. Player setup and Table Tracker setup list only unlocked mats.
M5. ☐ Phone and iPad: the picker fits without sideways scrolling and the thumbnails are easy to tap.
M6. ☐ Reward pop-up: finish a game that earns a mat or die → back on the main menu a pop-up names it with its colour; "Equip now" opens Profile → Playmats and Dice, "Later" closes it. It never shows during a game, and not again afterwards, also on a second device with the same profile. Several at once → one pop-up listing them. An existing player opening this build gets no flood of pop-ups for rewards they already had.
M7. ☐ Achievements: play a 4-player game, an online game (host and join), a Table Tracker game, a game as judge; win by commander damage / poison in Table Tracker; build, import and upgrade a deck in the Deck Builder, load a precon and play it → each earns its achievement (open Achievements to check; the Deck Builder ones show after going Home). Win 2 games in a row, and play on 3 days in a row.

## Theme and headers (visual rebuild, stage 1)
V1. ☐ iPhone and iPad (landscape): Landing shows the title plate "Commander Companion", the crest, Start Game and Continue Game jewels, then Profile, Deck Builder, Settings, Help and a small ornament, all centred, nothing under the notch or home bar.
V2. ☐ No saved game: Continue Game shows the grey (disabled) jewel and does nothing. Start a game, go Home → Continue Game lights up and resumes it.
V3. ☐ Every small button (Back, Profile, Settings, Help, dialog buttons) is easy to hit with a thumb and none overlap.
V4. ☐ First launch (or a fresh install): Welcome shows a "Welcome" plate and one panel with Sign up, Sign in and Skip; signing in opens in the same panel.
V5. ☐ Start Game: Choose Game Mode shows three panels (Guided Play, Free Play, Table Tracker) and Back; each opens the same options as before.
V6. ☐ Profile, Settings, Help (Ask the Judge), Playmats and Dice and every other dialog: the title sits in the metal plate at the top, long titles shrink or end in "…" inside the plate, Back is a steel button with the word Back.
V7. ☐ Settings: Learning tips and Send rule corrections show a metal switch that flips when tapped.
V8. ☐ Buttons look pressed while held; a selected choice (e.g. the current guidance level) is lit.
V9. ☐ Change the playmat (Profile → Playmats and Dice) → menus show that playmat behind them and its colour on buttons, plates and panels. Open the app offline afterwards → the chosen palette still shows (first open of a new palette needs internet once).
V10. ☐ The game and Table Tracker screens look as before apart from the buttons and dialogs.
V11. ☐ Turn the phone to portrait on the Landing → the rotate message shows as before.

## Gameplay screen (visual rebuild, stage 2)
V12. ☐ iPhone, a game in progress, held sideways with the notch on the left, then on the right → the metal frame and playmat reach all four screen edges; no button or text sits under the notch, in the rounded corners or on the home bar.
V13. ☐ iPhone and iPad: your commander, name, "Commander · Tax", the die with your life, the status light and Lib sit at the bottom left; Grave, Exile, Tokens and Attach. below them each open that zone.
V14. ☐ Lose or gain life → the number on your die changes at once; an opponent's die does the same on their seat. Choose a different die (Profile → Playmats and Dice) → every die changes, the playmat does not.
V15. ☐ Status lights: green when healthy; give a player poison (Host Tools) → their light turns red; a "can't play lands this turn" effect → yellow. Tapping a light opens that player's details and does not move the seats.
V16. ☐ Tap a side opponent → they move to the centre with their battlefield; the old centre player goes to the side. Your own battlefield and hand stay put.
V17. ☐ Add mana (tap lands) → the mana well shows the count beside each symbol and the total; a two-colour choice shows its split symbol in the last cell; Board shows the whole pool.
V18. ☐ Turn controls on the two jewels: in main 1 Combat and End Turn; in combat Attack, Next Phase and End Turn (three: the left jewel splits in two); only legal ones show, empty jewels stay dark.
V19. ☐ Phone: the log shows the three newest lines, tapping Game Log opens the full log. iPad: the log shows more lines. Stack, Undo, Board, Table and Host Tools (or Challenge) work as before.
V20. ☐ A crowded board (10+ lands, many creatures, tokens) and a big hand → each area scrolls sideways; tapped cards lie sideways; counters and attachment marks stay on their cards.
V21. ☐ Five or six players → two opponents share each side slot, each with name, life and its own status light.
V22. ☐ Change the playmat to Ember and Frost → the gameplay frame, jewels and buttons change colour; the status light colours do not.
V23. ☐ Hosted game: the host's Table and Judge screens, and the Table Tracker, look and work as before.
V24. ☐ Battlefields (yours and the centre opponent's): no zone labels; creatures always take the widest part with the biggest cards; with no artifacts or planeswalkers those spaces vanish and the others grow.
V25. ☐ Lands show as piles of like lands ("Forest ×6", ready / tapped counts); tap a pile → its cards open, tap one → its detail and actions (tap for mana, abilities) work as before.
V26. ☐ Artifacts, lands (and enchantments when space is short) show as small tiles with art, name, counters and a tapped mark; tapping one opens the card.
V27. ☐ Both orientations: ATTACK / NEXT PHASE sit in the middle of their gem housings; HOME … PROFILE and COMMANDER COMPANION sit in the middle of their plates.

## Setup, rooms, online and account routes (visual rebuild, stage 3a)
V24. ☐ Guided Play / Free Play options: two panels ("Play on one device", "Play on separate devices"), a Back button under them; every row opens what it did before. Table Tracker options: "Local table" and "Shared table". On the iPhone the rows scroll inside the panel if they do not all fit; every row is easy to hit.
V25. ☐ Player Setup: a Players panel (one button per player, Add player, Remove, remote count) and a panel for the chosen player (name, deck, Saved decks / Precon catalog / Paste list, commanders, Advice, Playmat). Back, Deck Builder and Continue sit under them. Typing a name updates the player button and the panel title; the keyboard does not push the plate off screen.
V26. ☐ Saved decks, Precon catalog (search + list), Paste a deck list and View deck open as panels with Close (or Cancel and Use this list); a very long deck name ends in "..." and fits its button.
V27. ☐ Host Room and Host Device: Room code panel (code, Pair a nearby device, share QR) and Players panel (open seats, Remove); Start game is dim until two players are in. Join a Room: Room panel (code, Rejoin, Just watch, Scan QR, Paste pairing code) and Seat panel; the Join button still works.
V28. ☐ Online Games: your games on the left (Remove asks first), Join by code on the right, New online game under them. Online waiting room: Game code (with QR) and Players. A device that opens a game for the first time: "Which player are you?".
V29. ☐ Table Tracker setup (names, commander, playmat per player; Starting life in the Table panel), Join a Table (code and name; the seats appear after joining).
V30. ☐ Sign in / Sign up (from Settings or Welcome): "Your account" panel with Email then the code step; Send code / Confirm / Send a new code still work; Close returns.
V31. ☐ Change the playmat to Ember and Frost: all these routes take the colour; on the iPad the same screens are centred and larger.

## Profile, playmats, history, achievements, settings, rules, help (visual rebuild, stage 3b)
V32. ☐ Player Profile: two panels ("Your profile": avatar with upload, name, Most Played Deck, Achievements, Game History; "Profile tools": games / wins / win rate / decks, Playmats and Dice, Table Defaults) and Back. Editing the name still saves; the panel scrolls from the top if it is taller than the screen.
V33. ☐ Playmats and Dice: Playmats panel (thumbnails of all 33 mats, locked ones dim with a lock and how to earn them) and Life dice panel (Match playmat plus 33 dice); tap an unlocked one → it shows "In use" and the app colours change; the "Next playmat in N games" line sits under the thumbnails; Done closes.
V34. ☐ Game History (Recent games panel, Close) and Achievements (Level panel with bar, next reward, drawn rewards, game awards; "All achievements" list with Earned / Not yet; Close). Long lists scroll from the top.
V35. ☐ Settings: Guidance level (Coach / Assist / Rules only) and Preferences (Learning tips and Send rule corrections switches, Account, Backup, Dev report); Close. Switches show on/off art.
V36. ☐ Rules (Table rules before a game, Table Defaults, host Rules edit): Commander panel and Table options panel with switches, House rule chips still appear, and Who goes first? sits at the bottom of Table options. Cancel/Back and Save/Start still work. Table Defaults: Players on the left, house rules on the right.
V37. ☐ Help (Ask the Judge): Search rules panel (search box and topic chips) and Result panel; the dialog has the plain panel background, no striped judge background. Searching filters the results.
V38. ☐ Change the playmat to Ember and Frost: all these routes take the colour; on the iPad the panels are taller and centred.

## In-game dialogs, Table Tracker, host Table View and Judge View (visual rebuild, stage 3d)
V39. ☐ Every popup of a game has the plate, one or two recessed panels and steel buttons (no old Back pill, no grey frame): opening hand, Discard, game log, stack, chat, Card ID (Find a card / Card), card detail (Card art / Rules text, abilities and Host tools still there), zone lists, land pile, player info (status light), your options, Cast / Play prompts, Are-you-sure questions, number and text pickers. Back is "Close" or Cancel; a prompt that must be answered has no Close.
V40. ☐ Choices during play (choose one / many / number / text / arrange / yes-no), table votes and requests, Declare attackers (creatures on the left with their own target chips, "All" buttons on the right) and Declare blockers: every control still works, tap targets are comfortable, long lists scroll from the top and card art and mana colours are unchanged.
V41. ☐ Host tools / Edit game: Players panel (life steppers, More...) and Game panel (turn, stack, cards tools); the sub-dialogs (player adjust, token, add any card, rules) match.
V42. ☐ Table Tracker: title plate, one framed card per player (name, life with - / +, status, counters, mana, tax, tracked cards), Game Log panel, steel buttons for Home / Next Turn / Undo / Settings / Profile and the bottom row; every popup (life, status, counters, Edit Players / Decks, Game Stats, Track a Card, Table Menu, End Game) uses the same frame. The host's Table / Judge switch works and the Judge panel keeps Reverse, Undo Last, Devices.
V43. ☐ Host device: Table View (one panel per player: name, life, commander, Counters / Graveyard / Exile / Command zone buttons, battlefield and lands cards that open their detail) and Judge View (Players panel, Plays panel with Reverse, Stack, Undo Last, Full Log); bottom row has Table / Judge, Game Log, Stack, Undo, Host Tools.
V44. ☐ All of V39-V43 on the iPad (panels taller, centred) and in Ember and Frost.
## Deck Builder (visual rebuild, stage 3c)
V32. ☐ Open the Deck Builder from the game side after choosing a playmat: the Deck Builder shows the same playmat behind it and the same palette (try Amethyst, Ember, Emerald); a reward mat shows its own picture.
V33. ☐ Header plate: the title reads Deck Builder on home, then Decks, Builder, Card Search, Buy List, Library, Profile, and the deck's name with a deck open; a very long deck name ends in "..." on the plate (full name in the deck's name box). Tapping the plate still goes to the Deck Builder home.
V34. ☐ Every button is a steel key and stays easy to tap (no key under about 36 px tall); the current page's top key and the chosen tab are lit; Delete keeps its red label; disabled keys are dimmed.
V35. ☐ iPhone held sideways: one header line (plate on the left, Home and icon keys on the right); upright: the plate on top, the keys four to a row with their labels. iPad portrait and landscape: plate in the middle, keys either side; nothing runs under the notch, rounded corners or home bar.
V36. ☐ Panels, the card window and pop-ups (Show all details, Fix, Export) have the metal frame with the crystal; text fields and pickers sit in recessed wells and the chosen value stays readable in the Card search filters.
V37. ☐ Upgrades: the power bar fills in the palette colour with the Budget / Mid / Apex marks where they were; Build stats bars, numbers and the bracket line read as before (no number changes).

## Deck Builder V3 skin (ChatGPT's V3 masters, installed over the stage 3c look)
V40. ☐ iPad and iPhone held sideways: Deck Builder header is the crest with the screen title (DECK BUILDER, Decks, Builder, a deck's name), steel nav keys, and a Home key with the house in the palette colour; the open page's key has a lit underline. Long deck names are cut short with ...; nothing overlaps the keys.
V41. ☐ Builder: all seven ways to start a deck (Generate from a commander, Decks you can build, Generate from cards, Load a precon, Import a text list, Empty Commander deck, Empty Standard deck) show flat recessed tiles with uppercase titles; each of the first five opens a dialog with the cut-steel frame, steel keys and square fields.
V42. ☐ Open deck: Duplicate, Share link, Compare, History, Delete deck and (after an edit) Undo are steel keys, Delete in rose; the Share link, Compare and History dialogs read cleanly and every key is at least 36 px tall.
V43. ☐ iPad Build sidebar and iPhone Build tab: fields are square wells, Regenerate upgrades is the lit (palette) key, the Group / Sort / Role choices are steel keys with the chosen one lit; the open tab is a lit recessed box with its count under the name.
V44. ☐ iPhone upright (390 wide): header keys four to a row with Home fully readable; tabs wrap to two rows; no sideways scroll.
V45. ☐ Choose Ember, then Gold: frames, keys and the lit key take the palette colour (no leftover purple), under Amethyst they match the V3 masters.

## Monster Siege (/test)

S1. ☐ Open the test page in landscape on iPhone and iPad. The monster climbs with one hand on the frame as the other reaches, braces its feet, and carries a panel until throwing it.
S2. ☐ Watch the entire fight. Strikes meet their targets, the hero can drop and recover, and the battlefield restores after the speech bubble and leaves the hero’s note. Tap the battlefield mid-encounter to restore it immediately.
S3. ☐ Watch smash, bite and stomp on the bottom row. The monster never starts climbing until all nine bottom targets have broken. Watch the knees bend as the creature transfers weight between footholds.
S4. ☐ Watch the arms during overhead smash, claw swipe, a ledge grab and a hero strike. Shoulders and elbows rotate with constant limb lengths. A held panel rides in the monster’s claw until it flies, and the hero’s weapon stays in hand through the swing.
S5. ☐ Watch two lizard encounters for bites and tail contacts. Marsh Stalker and Frost Drake plant their front and rear feet, Ember Raptor stays on its rear legs, and Ironback plants its knuckles. Ogre, orc and troll encounters open with a punch and a kick. The back plates follow the body through each move.
S6. ☐ Let the encounter finish. The battlefield restores underneath the hero’s note. Refresh to verify the note stays, then dismiss it or start a new encounter to clear it.

Reply with the numbers that failed and a screenshot.
