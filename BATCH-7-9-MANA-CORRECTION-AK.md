# Commander Companion V0.8 AK — Mana / Turn Flow / Smart Priority Correction

Focused correction from AJ. No new subsystem was started.

- Restores the `AVAILABLE MANA` heading while continuing to hide zero-value mana entries.
- Replaces clipped/overlapped flexible-mana rendering with dedicated diagonal split-circle assets for all two-option combinations.
- Keeps flexible sources in the same Available Mana row; any-color sources remain distinct.
- Cards with exactly one legal activated ability now bypass the redundant ability-selection page and open the Cost / Effect / Use Ability screen directly.
- Multiple-ability cards still show a chooser, renamed `AVAILABLE ABILITIES`.
- Cleanup remains an internal rules step. Advancing from End Step routes through End Turn rather than exposing Cleanup as a normal player phase.
- Smart priority no longer promotes routine library-search/resource abilities such as fetch lands as responses to unrelated stack objects.
- Priority ability selection also bypasses the chooser when only one relevant ability exists.
- Reinforces centered red/green footer labels without changing already-correct action semantics.

Validation: JavaScript syntax, CSS brace balance, HTML version/cache tags, generated split assets, ZIP integrity, and GitHub upload-folder counts.
