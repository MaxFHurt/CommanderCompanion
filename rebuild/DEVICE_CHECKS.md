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

Reply with the numbers that failed and a screenshot.
