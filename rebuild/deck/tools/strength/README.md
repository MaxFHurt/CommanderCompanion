# Card strength data (roadmap 6.1, "smarter deck score"; owner, 8 Nov 2026)

What `engine/strength.js` reads (off unless `UP.str` is set). Built from EDHREC's commander pages, every bracket
(exhibition, core, upgraded, optimized, cEDH), for the top ~950 commanders of the past year plus the test commanders.

    python3 -I fetch.py <work>            # ~5,700 requests at about 4 a second (four workers); resumes where it stopped
    RW='{"exhibition": 0, "core": 0.5, "upgraded": 1, "optimized": 3, "cedh": 4}' OUT=<work>/r_new.json python3 -I rate.py <work> <scryfall oracle cards.json>
    RW='{"exhibition": 0, "core": 0.5, "upgraded": 1, "optimized": 3, "cedh": 0}' OUT=<work>/r_casual.json python3 -I rate.py <work> <scryfall oracle cards.json>
    python3 -I pack.py <work> <date>      # writes <work>/strength.json.gz: {v, date, cards: {name: [with cEDH, without]}, cmd: {slug: {u|o|c: [decks, {name: %}]}}}

A card's rating: across commanders whose colour identity allows it, how often each bracket's decks play it (each commander
weighted by the square root of its deck count), weighted toward the strong brackets, plus credit for being played more as
the bracket rises; scaled so the 99.9th percentile is 100. Cards in no list rate 0 (no evidence strong decks play them);
cards first printed in the last two months with no rating are read as new by the engine instead.
