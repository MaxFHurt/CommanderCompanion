# Working rules (owner, 12 Nov 2026)

## How to work
- **One session is the orchestrator.** It plans, delegates, merges, tests and ships. Sub-agents do the work.
- **Delegate to the cheapest model that can do the task.** Haiku for searching, reading, running tests, mechanical edits;
  Sonnet for normal coding; Opus/Fable only for hard design or debugging. Give each agent a short, self-contained brief that
  points at exact files (see `rebuild/INDEX.md`), not "read the codebase".
- **Few agents at once.** Parallel agents share one usage limit; on 12 Nov eight agents hit it before writing any code.
  Two or three at most, each with a narrow task.
- **Repetition burns tokens.** A command or check run more than twice becomes a skill (`.claude/skills/`) or a script.
  Existing: `deck-test` (Deck Builder tests), `release` (shipping a build).
- **Compact** when the conversation is long and work is re-reading the same files.
- **Find things through `rebuild/INDEX.md`**, then read only the lines needed (grep, `sed -n a,bp`). Don't skim whole files
  or the long docs (HANDOFF.md, PROGRESS.md, deck/ROADMAP.md are logs; read only the section you need).
- **Answers: short and to the point**, unless the owner asks for more.

- **Roadmap items: decide, don't ask** (owner, 13 Nov: "I don't want to make the decisions twice; if it's on the roadmap I know
  it needs to change. Use your best judgement and we will adjust later"). For design/wording choices inside a roadmap item, pick
  the sensible option, build it, and report what you chose. Still ask before pushing `main` and for anything off the roadmap.

- **Batch releases** (owner, 13 Nov): group changes into one build so the full suite runs once per build, not per change, but
  keep batches small enough to pin a bug to its change: about 3-5 small items, or one large item on its own. Targeted tests
  per change while working; the full run once before the batch goes live.

## Owner's rules (summary; full list in rebuild/HANDOFF.md section 2)
- Ship only fully tested batches; anything that makes something worse is discussed with the owner first.
- Never undo another session's work: `git fetch` and build on `origin/main` before pushing.
- Every push updates PROGRESS.md; release steps are in the `release` skill.
- The rules long tail (rebuild/src/engine, ~9,670 cards left) has its own chat: stay out of it unless asked. Its map: `rebuild/INDEX.md` "Rules long tail".
