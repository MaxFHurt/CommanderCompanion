# Commander Companion — Visual Rebuild Notes

Current visual rebuild line: **V0.8 CY**

This file is the running screen-by-screen visual QA record. The approved visual masters supplied by the user are the authority. Historical 0.8.4.4-era styling is not a visual source for this rebuild.

## Screen 1 — Landing

### Target
- Landscape-only app experience.
- Portrait does not render the app; it shows only: “Please rotate your device to landscape orientation to continue”.
- Use the approved Commander Companion purple/chrome master language.
- Use horizontal space intentionally.
- Keep text readable at iPhone landscape size.
- Preserve current landing button routing.

### Defects observed before CV
- Opaque fallback panel covered/obscured the real landing artwork.
- Landing was too dark.
- Generic responsive rules redistributed the layout and broke proportions.
- Too much unused horizontal space.
- Utility buttons were stacked vertically and visually undersized.
- Outer chassis lacked the polished purple/metal edge treatment from the approved visual language.

### CV changes
- Locked landing to one 1536×709 logical canvas.
- Kept one outer device-scale pass only.
- Enlarged the Commander Companion brand block.
- Enlarged the primary Start/Continue action artwork.
- Moved Profile / Deck Builder / Settings / Help into one full-width horizontal utility row.
- Added approved forged side rails and brighter purple edge lighting.
- Raised artwork brightness/contrast while preserving black/purple theme.
- Enlarged landing copy/footer text.
- Continue Game remains conditional.
- Portrait remains unsupported.

### Local visual check
- Rendered at a 932×430 iPhone-landscape-equivalent viewport.
- Landing filled the visible stage without inner double-scaling.
- Main controls remained within viewport bounds.
- Text/artwork was materially more readable than CU.

### Still to verify on live Pages
- Exact live Safari placement after cache/deployment.
- Landing button tap routing after CV.
- Continue Game conditional state.
- iPad proportional scaling.

### Lock rule
Do not move on to the next screen until the live CV landing capture is checked against the approved landing visual target and any remaining landing defects are corrected.

## Next screen after Landing locks
**Choose Game Mode** — rebuild as a deliberate three-column landscape menu with large readable text and approved graphical frames.


## CW landing correction

### Confirmed root cause
The black lower half was **not** a portrait warning overlay image. A legacy high-specificity device rule was forcing the landing root to `100dvh` before the outer 1536×709 stage scale. The child shell remained full-size, but its parent clipped at roughly 60% height on an iPhone-landscape viewport.

### CW correction
- Override all iPhone/iPad/other-phone landing-root device rules at equal/higher specificity.
- Landing root is now locked to 1536×709 before the single outer stage scale.
- Portrait still hides the app and shows only the rotate message.
- Keep the newer/wider landing composition.
- Restore the heavier metallic outer-border treatment from the earlier visual reference.
- Landing utility controls remain **Profile / Deck Builder / Settings / Help** only. No Home, Game Chat, or Card ID on the Home screen.

### Local verification
At 932×430:
- `#landing.offsetWidth = 1536`
- `#landing.offsetHeight = 709`
- rendered landing rectangle fills the full visible ~430px height after scaling
- lower controls are no longer clipped
- no black half-screen remains


## CX landing state cleanup
- Disabled Continue Game is now hidden entirely, matching the requirement that Continue appears only for an actual saved game.
- With a save present, Start/Continue use a compact two-action stack that stays above the bottom utility rail.
- Landing utility rail remains Profile / Deck Builder / Settings / Help.
- Heavy metal outer border from the earlier landing visual is retained with the newer wide composition.


## Screen 2 — Choose Game Mode (CY)

### Defects observed
- Existing horizontal button artwork was stretched vertically into oversized card frames.
- Too much dead vertical space.
- Back control was visually undersized.
- Mode descriptions were smaller than the landscape space allowed.

### CY changes
- Rebuilt as three true landscape cards across the full-width modal.
- Restored heavier metal edging around the modal and each card.
- Horizontal title plates use the correct button art without vertical stretching.
- Increased title and description sizes.
- Added a clear SELECT MODE footer on each card.
- Enlarged and left-aligned Back control.
- Preserved all existing mode routing.
