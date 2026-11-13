# Working rules (owner, 13 Nov 2026) — apply every session

1. **Orchestrator + sub agents.** The main session orchestrates: plans, decides, reviews, reports. It delegates
   self-contained work (searches, test runs, batch edits, research) to sub agents (Agent tool).
2. **Cheapest model that can do the job.** Pick per task: `haiku` for searching, reading, running tests, mechanical
   edits; `sonnet` for normal coding/debugging; `opus` only for hard design or reasoning. Default to the lowest.
   Don't spawn an agent when one direct tool call is cheaper.
3. **Repetition becomes a skill.** Any action repeated across sessions or several times in one goes into
   `.claude/skills/<name>/SKILL.md` (or a script under `rebuild/tools/`). Existing: `ship-build`, `run-checks`.
4. **Compact** when context grows long or the same files/output keep being re-read.
5. **Look things up via `RESOURCE_MAP.md`** — go straight to the file/section/line it names; grep before reading;
   read line ranges, never whole large files (HANDOFF/PROGRESS/ROADMAP are 350-540 lines; *.min.js, keywords.json,
   CompRules, *.gz are huge — never read them). Update the map when you learn where something lives.
6. **Concise answers.** Short and to the point unless the owner asks for detail.

Owner's project rules (never push `main` without a yes, update PROGRESS.md every push, art rules…):
`rebuild/HANDOFF.md` §2 (lines ~162-193).
