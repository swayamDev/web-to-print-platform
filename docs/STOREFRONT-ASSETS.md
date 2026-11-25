# Precision Commerce asset provenance

The local Phase 3 handover is the source of the approved Register geometry and original AI-generated product illustrations. The application versions are tracked here. Original artwork masters, archived concepts and prototype sources stay in the local handover.

| Application files                                                                                      | Source and placement                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/brand/register-*.svg`                                                                          | Original Register artwork from Phase 3. Horizontal and stacked lockups, symbols and outlined wordmarks in approved colour variants.                               |
| `public/brand/app-*.png`, `public/brand/app-icon.svg`, `src/app/{icon.svg,favicon.ico,apple-icon.png}` | Register application and browser icons. The ICO contains 16, 24, 32 and 48 px frames.                                                                             |
| `src/app/web-fonts/`                                                                                   | Local Instrument Sans, Special Gothic Expanded One and IBM Plex Mono web fonts with their upstream SIL OFL notices. Print-output fonts remain in `public/fonts/`. |

The Phase 6.3 illustration WebPs (`public/storefront/{hero,stickers,race,mtb,stamp,trophy,laser}-*.webp`) were removed once the Phase 6.4 photos replaced them, because no page referenced them. Their masters stay in the local handover. The app uses browser source selection and reserved aspect ratios. The dedicated hero is prioritised and catalogue tiles are lazy-loaded. Product photos are labelled illustrations. The gallery still uses the existing print-engine image routes and sample labels. No customer or production photography was added.

Register was selected in Phase 3 after a preliminary visual comparison. Trademark clearance and
physical reproduction testing remain pending. Chromium emulated touch resize passed in Phase 5.
The original mouse-only mobile skip remains, and physical touch is unverified. Real gallery examples or a waiver and fresh hosted verification remain open.

## Phase 6.4 photography

The current catalogue and homepage images live under `public/storefront/photos/`. All are original AI-generated samples. The current storefront places visible “AI-generated sample” captions below the photos. Social metadata on the homepage points to a dedicated 1200 × 630 JPEG and identifies it as an AI-generated sample in its alt text.

- Homepage hero uses a graphite workbench composition and separate mobile and desktop crops.
- Labels and Stickers uses an original cobalt and orange die-cut still life. Race and Event Numbers uses graphic-led treatment B for its card and tighter editorial treatment A for its division and configurator. The race division uses treatments C and D to show illustrative texture and sporting context.
- MTB Boards shows a generated three-hole board with number 28. Stamps shows a self-inking body and a red sample impression. Trophies shows a brushed award plate. Laser-Cut Work shows a clear acrylic sign with standoffs.
- Tile, standard, wide and race mobile WebPs are authored to the frame proportions. Browser width descriptors use the encoded width and derivatives are capped at the source crop width. Only the hero requests high fetch priority.
- Samples show representative forms and configurations. Surface appearance and hardware should never be treated as verified manufacturing specifications. Gallery images remain print-engine demonstrations. The local Phase 6.4 review package records the per-image provenance and exact derivative inventory.
