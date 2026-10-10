# Feed experience

The feed keeps its original order and original posts. The filter adds reversible omissions and a separate appearance choice. Each category uses the same Hide, Highlight, Label and Off actions, with its own strict score-above-threshold rule. Any applying Hide rule takes precedence.

Native keeps familiar feed cards. Punchy makes hidden-category names more prominent. Reader uses a quiet paper-like surface and serif post text. A theme never changes categories, definitions, thresholds or scoring requests. Consecutive hidden posts can be grouped separately; a visible post always breaks a group.

Show reveals one original post in place. Hide again reverses that action. Show everything temporarily reveals the current feed without changing saved rules. Disabling filtering pauses scoring and restores posts. Corrections are explicit local records, separate from ordinary reveals.

New results must leave a visible, hovered or keyboard-focused card open until it leaves view or the reader chooses Hide now. Offscreen layout changes and deliberate reveals keep the reading position stable. Details show actual model scores, thresholds and actions, including missing answers; they do not invent model explanations or establish AI authorship.

## Release checks

The release review checks the combined implementation, rather than relying on the design prototype. Required checks include the full npm test suite, a real unpacked extension in a temporary Chromium profile, feed and settings layouts at 320px and desktop widths, all three themes, keyboard access, correction privacy, temporary overrides, slow/error/partial results, and stable scrolling.

Signed-in LinkedIn DOM compatibility, cloud API contracts and representative classification accuracy remain separate verification work. Synthetic cards and mocked scores cannot establish those claims.

## Design references

- [Reddit Enhancement Suite placeholders](https://redditenhancementsuite.com/releases/5.14.2/) informed visible, reversible omissions.
- [uBlacklist's temporary recovery control](https://ublacklist.github.io/docs/getting-started) informed separating Show everything from permanent rules.
- [Control Panel for Twitter](https://soitis.dev/control-panel-for-twitter) informed independent feed appearance preferences.
- [News Feed Eradicator](https://github.com/jordwest/news-feed-eradicator) informed limiting the extension's scope to the feed.
- [Browser scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_anchoring/Overview) informed measuring native compensation and correcting only the remaining displacement.

Category research and synthetic model evidence are documented in the category-rubric notes.
