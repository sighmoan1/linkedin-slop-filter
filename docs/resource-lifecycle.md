# Feed resource and lifecycle repair

Issue [#60](https://github.com/sighmoan1/linkedin-slop-filter/issues/60) investigates the owner's repeated `chrome-extension://invalid/` console failures after 2.0.1. A successful initial classification is insufficient evidence of sustained runtime health.

## Resource diagnosis

The screenshot attributes failures to `4j642gxwgan928vnbx21s18k0:12009`. The [matching public LinkedIn bundle](https://static.licdn.com/aero-v1/sc/h/4j642gxwgan928vnbx21s18k0) has SHA-256 `f5bb9da5de585dd9d0f412636e273fbcc0135265c3ad9de0b90043dec73b61c0`. Line 12009 calls the original fetch from LinkedIn's wrapper. Lines 9538–9545 fetch extension file paths from 4,934 signatures and gather successful ids. This supports attributing the pictured flood to LinkedIn's scan; the screenshot lacks the full initiating stack. The public bundle was inspected, never executed or committed.

A fresh actual unpacked installation loaded the bundled font and reported zero failed resource requests or page errors. The same isolated reproduction after an extension reload also reported zero failed requests. It did expose a separate defect: the old script retained a paused toolbar and kept polling its invalid runtime. That defect is fixed in 2.0.2. Site probing is not patched, intercepted or hidden.

## Lifecycle behavior

Every extension message uses a guarded bridge. A missing runtime id or the browser's context-invalidated error retires the old script: timers, frame work, mutation/intersection observers and global event listeners stop; extension controls, fold/group classes and Reader body styling are removed; original posts return. Late classifications, appearance replies and corrections cannot recreate disconnected controls or hide posts. The existing popup reports a missing connection and offers an explicit current-tab reload. A page reload injects a fresh script. Temporary messaging/provider failures retain the existing fail-visible recovery behavior.

## Verification

The feed regression checks passed for runtime-id disappearance, grouped-post restoration, no requests after the polling interval, a late classification reply and a synchronous context-invalidated error. Existing scrolling, focus, theme and category tests passed alongside them.

The unpacked release check now observes console errors and failed extension requests throughout its lifecycle. It enables Developer mode in its disposable profile, matching documented unpacked installation requirements, reloads the actual extension, checks restored posts and retired controls, waits past the former polling interval, then reloads the feed and verifies connection and local font loading. It uses only authored posts, seeded scores and no credentials/provider calls.

On 10 October 2026, the full `npm test` suite and this actual unpacked release check passed for 2.0.2. Across the release check and real extension/page reload, console errors, failed extension resources and provider calls were all zero. The old 2.0.1 reproduction left one stale control; the repaired reproduction removed all controls and restored original posts.

The repaired version has not yet received a sustained signed-in console trace. Native browser checks were interrupted by tab changes, and the owner was asked for a brief uninterrupted inspection window. No real feed text, credentials or signed-in screenshots are saved in this repository or published to issues. A successful synthetic check cannot establish that LinkedIn's own console will be empty.
