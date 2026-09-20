# Commander Companion — Visual Rebuild Notes

Current visual rebuild line: **V0.8 CV**

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
