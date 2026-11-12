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
