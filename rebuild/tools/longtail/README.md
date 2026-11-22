# Long-tail tools (build 101)

Which wordings keep cards "by hand", grouped so a batch of rules can be chosen. Set `LT` to a work folder (default
`/tmp/longtail`) with `data/` and `out/` inside it; run from `rebuild/`.

    curl -s https://api.scryfall.com/bulk-data/oracle-cards        # take jsonl_download_uri -> $LT/data/oracle.jsonl.gz
    node tools/longtail/prep.mjs $LT/data/oracle.jsonl.gz $LT/data  # Commander-legal cards by EDHREC rank, 4 chunks
    sh tools/longtail/audit.sh base                                 # full audit (about 8 minutes) -> $LT/out/base.json
    sh tools/longtail/cl.sh base                                    # failing sentences -> base.patterns.txt, base.clauses.txt
    sh tools/longtail/sub.sh names.txt tag                          # audit only the named cards (seconds)
    node tools/longtail/p.mjs "Sentence." "Another."                # how a sentence compiles
    node tools/longtail/review.mjs fixed.txt base                   # how each newly automatic card's sentences compile

After a change: run `audit.sh` again and compare with the baseline both ways (newly automatic, and cards that went back to
by hand). Read the compiled effects of every newly automatic card (`review.mjs`) before counting it.
    node tools/longtail/cardfx.mjs names.txt                        # every trigger/ability/spell of each card as compiled

Batch 2 review checks that found real misreads (worth repeating each batch): "its power" / "that creature's power"
(whose power?), "that player" inside "each player …" (per player, not once), "it" after a token is made, counts
that compiled to a fixed number, and spells whose "it" fell back to the spell itself.

Ledger (22 Nov): `node tools/longtail/ledger.mjs --audit $LT/out/base.json --clauses $LT/out/base --oracle $LT/data/oracle.jsonl.gz`
(after audit.sh and the clauses step of cl.sh) writes ledger.jsonl.gz (tier a verified / b unverified / c by hand per card),
ledger-summary.json and GROUPS.md; groups come from ledger-rules.mjs. After a batch, append its newly passing cards (read) with
`ledger.mjs --make-reviewed old-audit.json new-audit.json`.
