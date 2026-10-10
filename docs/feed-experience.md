# Feed experience

The feed keeps its original order and original posts. The filter adds reversible omissions and a separate appearance choice. Each category uses the same Hide, Highlight, Label and Off actions, with its own strict score-above-threshold rule. Any applying Hide rule takes precedence.

The feed uses one Native appearance that keeps familiar LinkedIn cards. Individual hidden rows show category names and a compact Show post control. Once the post is visible, one Categories menu combines correction checkboxes, model scores and current rules. Cancel or Escape discards unsaved edits and returns focus to the menu control; re-hiding removes the menu. Consecutive hidden posts can be grouped separately; a visible post always breaks a group.

Show reveals one original post in place. Hide again reverses that action. Show everything temporarily reveals the current feed without changing saved rules. Disabling filtering pauses scoring and restores posts. Corrections are explicit local records, separate from ordinary reveals.

Current results above a Hide category’s threshold fold immediately, including visible, hovered and keyboard-focused cards. Explicitly revealed posts and temporary Show everything remain open. When a focused card folds, focus moves to Show post. Offscreen layout changes and deliberate reveals keep the reading position stable. The Categories menu shows actual model scores, thresholds and actions, including missing answers; they do not invent model explanations or establish AI authorship.

## Release checks

Issue [#92](https://github.com/sighmoan1/linkedin-slop-filter/issues/92) removes result deferral: a current applying Hide result folds immediately. The full local `npm test` suite and `npm run verify:release` passed, including visible/hovered/focused folding, keyboard recovery, strict thresholds, stale and invalid results, never-hide people, reveal/re-hide and temporary recovery. The unpacked-extension check reported zero provider calls, console errors and failed extension resources. The tested branch was loaded into the existing Brave installation and its signed-in For You feed reloaded. The popup reported Feed connected with three posts; temporary Show everything and restoration, and the live category menu with unchanged rules, were checked without saving corrections. The configured local Ollama service returned HTTP 403, so live successful-result folding and hidden-post reveal/re-hide remain unverified; failed posts correctly stayed visible. No provider settings, credentials or saved rules were changed. PR #93 has not been merged.

Issue [#88](https://github.com/sighmoan1/linkedin-slop-filter/issues/88) replaces the oversized hidden row and separate score/correction panels. The full local `npm test` suite and `npm run verify:release` passed for this change, including compact rows and a shared category panel at 320px, unsaved-edit cancellation, focus and scroll recovery, actual unpacked-extension reload, popup recovery and correction privacy. The release check made zero provider requests and reported zero console errors or failed extension resources. At initial PR readiness, the owner’s signed-in Brave session was available, but native automation twice refused the reload because it detected active user interaction. Subsequent installation and signed-in verification are tracked on issue #88.

The release review checks the combined implementation, rather than relying on the design prototype. Required checks include the full npm test suite, a real unpacked extension in a temporary Chromium profile, feed and settings layouts at 320px and desktop widths, Native appearance, keyboard access, correction privacy, temporary overrides, slow/error/partial results, and stable scrolling.

Synthetic cards and mocked scores cannot establish signed-in LinkedIn compatibility, cloud access or representative classification accuracy. Version 2.0.1 received a limited signed-in Brave/OpenAI For You check, documented in [the readable-feed repair evidence](readable-feed.md); wider compatibility and representative accuracy remain separate verification work.

After installing test dependencies, run `npm test` for the offline checks. `npm run verify:release` additionally loads the actual unpacked extension in a fresh temporary Chromium profile. It serves authored synthetic feed cards, seeds hash-only scores, and uses no provider credentials. It verifies the worker, feed, options and popup together; first folds and reveals, Native appearance, reversible grouping and original order, multi-label corrections, temporary Show everything, missing-key failures, and 320px/dark layouts. The profile is deleted when the check exits.

Set `QA_OUTPUT_DIR` to a local directory when running that command to retain screenshots. Those screenshots are synthetic previews, not captures from a signed-in account. The optional verification is separate from CI's offline suite so its unpacked-extension browser requirements are explicit.

On 10 October 2026, the combined `npm test` suite and `npm run verify:release` both passed. The unpacked-extension check used the actual service worker, content script, settings and popup with seven authored posts and seeded scores. It made zero provider requests. Desktop and 320px layouts, Native/Punchy/Reader, dark mode, reduced motion, multi-label correction storage, temporary recovery, missing-key failure and feed-only scope passed. The popup recovered the feed using the existing permissions even when Chrome supplied a tab id without its URL.

The simulated-feed suite passed reading-position checks within 2px with native browser anchoring enabled and disabled, keyboard reveal/re-hide, immediate visible/hovered/focused result folding, recycled cards, partial answers and reversible groups. LinkedIn's own overflow containers can prevent a revealed post's header from sticking; long posts therefore also have a Hide again control at their end. These checks cover authored browser fixtures, not every current LinkedIn layout.

Version 2.0.1 repeated both complete checks successfully after the readability and route fixes. The unpacked check additionally exercised For You/Network routes and loaded both bundled font faces. The signed-in check confirmed feed discovery, live OpenAI scoring and folding on the owner's current For You feed. Its observations are recorded without real post bodies or screenshots.

## Design references

- [The owner's whenisbins stylesheet](https://whenisbins.com/styles-new.css) informed the larger Lexend Deca type, warm paper, dark ink, teal controls and two-tone keyboard focus in 2.0.1.
- [Reddit Enhancement Suite placeholders](https://redditenhancementsuite.com/releases/5.14.2/) informed visible, reversible omissions.
- [uBlacklist's temporary recovery control](https://ublacklist.github.io/docs/getting-started) informed separating Show everything from permanent rules.
- [Control Panel for Twitter](https://soitis.dev/control-panel-for-twitter) informed independent feed appearance preferences.
- [News Feed Eradicator](https://github.com/jordwest/news-feed-eradicator) informed limiting the extension's scope to the feed.
- [Browser scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_anchoring/Overview) informed measuring native compensation and correcting only the remaining displacement.

Category research and synthetic model evidence are documented in the [category-rubric notes](category-rubrics.md).
