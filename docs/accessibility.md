# Accessibility verification

The extension targets [WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/). This scope covers extension-owned feed controls, settings, popup and setup guide. LinkedIn's own content and controls are outside the extension's control.

Issue #110 fixes a hover cascade that combined white text with a pale background on Show post. Folded and revealed row buttons now specify both foreground and background for hover/active states in either feed theme. Category reorder buttons also have an explicit readable foreground. Form boundaries have at least 3:1 contrast against their surfaces, placeholders retain full opacity, and hidden labels wrap instead of truncating. The popup error disclosure has a 44px minimum height.

Hidden rows summarize only the highest-confidence matching Hide category, followed by confidence and the optional author. Equal scores retain category order. Saved corrections still determine membership; their summary never presents original model scores as confidence in the correction. Review scores and the revealed view retain all matches.

## Regression checks

`npm test` runs the accessibility checks locally, with axe-core as a development dependency only. No audit script ships as extension runtime code.

- Axe WCAG 2.0/2.1/2.2 A/AA rules check feed controls, all six settings sections, popup and setup guide, including light/dark themes and narrow/desktop views.
- Button text is checked against the actual computed surface at a minimum 4.5:1 in normal, hover, active and keyboard-focus states. Keyboard focus must retain a visible outline.
- Settings, popup and feed controls are checked for reflow at 320 CSS pixels, with additional desktop/intermediate widths. Text-spacing overrides exercise 1.5 line height, .12em letter spacing, .16em word spacing and 2em paragraph spacing without clipping button text or introducing horizontal scrolling.
- Existing tests cover keyboard access, focus transfer when posts fold, reveal/re-hide, Escape cancellation, score-review checkbox labels, settings navigation, and keeping focused fields above the fixed save footer. Category decisions continue to use every applicable rule.

## Installed Brave check (2026-10-10)

The existing unpacked installation was reloaded from this repository and the signed-in feed refreshed. A real post with multiple matches displayed one highest-confidence category. Reveal/re-hide worked with both the controls and keyboard Enter, returning focus to the appropriate control. Popup recovery/restoration and settings/category controls were checked without saving category changes or corrections.

These checks passed for #110. They are evidence for the tested states, not a claim that automated testing proves every WCAG criterion. A complete assistive-technology audit with VoiceOver/NVDA and every transient/error state has not been performed. Keep that limitation explicit in any conformance statement; do not label the entire LinkedIn page WCAG conformant on the basis of this extension's checks.
