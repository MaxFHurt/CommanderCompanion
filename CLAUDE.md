# Working rules (owner, 12 Nov 2026)

## How to work
- **One session is the orchestrator.** It plans, delegates, merges, tests and ships. Sub-agents do the work.
- **Delegate to the cheapest model that can do the task.** Haiku for searching, reading, running tests, mechanical edits;
  Sonnet for normal coding; Opus/Fable only for hard design or debugging. Give each agent a short, self-contained brief that
  points at exact files (see `rebuild/INDEX.md`), not "read the codebase".
- **Few agents at once.** Parallel agents share one usage limit; on 12 Nov eight agents hit it before writing any code.
  Two or three at most, each with a narrow task, and **keep two or three busy at all times** (owner, 13 Nov: "Multiple agents
  should be working all the time"): when one finishes, start the next roadmap task.
- **Repetition burns tokens.** A command or check run more than twice becomes a skill (`.claude/skills/`) or a script.
  Existing: `deck-test` (Deck Builder tests), `release` (shipping a build).
- **Compact** when the conversation is long and work is re-reading the same files.
- **Find things through `rebuild/INDEX.md`**, then read only the lines needed (grep, `sed -n a,bp`). Don't skim whole files
  or the long docs (HANDOFF.md, PROGRESS.md, deck/ROADMAP.md are logs; read only the section you need).
- **Answers: short and to the point**, unless the owner asks for more.

- **Roadmap items: decide wording and layout, ask on results** (owner, 13 Nov). Wording, layout and small UI choices inside a
  roadmap item: pick the sensible option, build it, report what you chose ("I don't want to make the decisions twice").
  Ask first (owner, 13 Nov: "I don't want you making the calls on your own") on anything that changes results or picks
  between approaches: scores, ratings, generator or upgrade picks, benchmark trade-offs, other chats' pending choices.
  Always ask before pushing `main` and for anything off the roadmap.

- **Batch releases** (owner, 13 Nov): group changes into one build so the full suite runs once per build, not per change, but
  keep batches small enough to pin a bug to its change: about 3-5 small items, or one large item on its own. Targeted tests
  per change while working; the full run once before the batch goes live. **Never ship finished items one at a time**
  (owner, 13 Nov: "Push build updates live in batches"): collect what the agents finish on the release branch and push one
  build when the batch is full (or the owner asks).

- **Order of work** (owner, 13 Nov; replaces "no card building for now"): (1) features and screens, (2) card rules and
  mechanics (long tail, Connive, Forage …), (3) judgement tools: deck score, card strength, mana rules, reasons, Fix picks,
  generator picks, game-plan awareness: last of the real changes, so new mechanics never force rework, (4) optimise all code.
  Judgement work in progress was parked in `rebuild/wip/` (see its README). See `rebuild/ROADMAP.md` "Order of work".
- **This session also runs the other chats' tasks** (owner, 13 Nov), including the rules long tail and `team/apex2`.

## Owner's rules (summary; full list in rebuild/HANDOFF.md section 2)
- Ship only fully tested batches; anything that makes something worse is discussed with the owner first.
- Never undo another session's work: `git fetch` and build on `origin/main` before pushing.
- Every push updates PROGRESS.md; release steps are in the `release` skill.
- The rules long tail (rebuild/src/engine, ~9,670 cards left): map in `rebuild/INDEX.md` "Rules long tail"; owner's rules for it:
  batches of 500 newly automated cards, check in after each; misread cards go back to by hand and must then be fixed.
