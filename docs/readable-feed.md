# Readable interface and current feed routes

Current styling follows [#65](https://github.com/sighmoan1/linkedin-slop-filter/issues/65): system sans-serif fonts, neutral surfaces, blue actions and compact spacing. The extension no longer loads or exposes the bundled font. The observations below record the earlier 2.0.1 design and route verification.

Issue [#58](https://github.com/sighmoan1/linkedin-slop-filter/issues/58) addresses the owner's unreadable interface and missing feed controls.

The installed Brave extension was observed on 10 October 2026 with filtering on and zero requests. Its popup rejected the signed-in `/feed/foryou/` page as a feed. LinkedIn's Network tab uses `/feed/network/`. Both are legitimate feeds and must be distinguished from `/feed/update/…` post detail pages.

The owner's [stylesheet reference](https://whenisbins.com/styles-new.css) uses Lexend Deca, warm paper, dark ink, teal primary buttons, substantial borders and a two-tone focus indicator. Version 2.0.1 adopts that visual direction with a locally shipped font, 19px settings text, 17px feed/popup controls and at least 16px supporting text. Primary controls have 48px targets. Reader now uses larger sans-serif post text. Narrow and dark layouts retain strong contrast and visible focus. The unmodified font and SIL license ship in `assets/fonts/`; no remote assets load at runtime.

The content script, worker and popup accept Home, For You and Network feed routes consistently. Nested post-detail paths, messages, profiles and search remain excluded. The popup probes the actual content-script connection before offering temporary recovery, reports the detected post count, and offers an explicit current-tab reload if it cannot connect. Navigation from an initially uninjected LinkedIn page still requires a feed reload. No additional browser permissions were added; only the public bundled font is web-accessible to LinkedIn.

## Verification on 10 October 2026

- Full `npm test` passed, covering route allowlists across the worker/content/popup, private-route cleanup, safe settings replies, readable fonts/contrast/targets, responsive settings and popup, all category actions and existing scroll/focus protections.
- `npm run verify:release` passed with the actual unpacked extension in a temporary Chromium profile. It exercised For You and Network routes, actual local font loading, seven authored posts with seeded scores, all themes, recovery, grouping, corrections, missing-key behavior, 320px and dark layouts. It made zero provider requests; screenshots contain only synthetic posts.
- The owner's existing Brave installation was confirmed to load from `~/linkedin-slop-filter`, reloaded to 2.0.1, and its signed-in `/feed/foryou/` feed reloaded. The popup reported **Feed connected · 3 posts found**, OpenAI **3 requests**, **2 folded** and **1 cached**. The feed displayed its toolbar and a combined Advert/Slop hidden row. An arriving result left an on-screen post open with the explicit Hide now choice. This verifies the current selectors and that account's live scoring path.
- The signed-in Network route was observed, but its filtering behavior was tested with synthetic fixtures only. Other accounts, providers, billing details, extended signed-in scrolling, and representative real-post classification accuracy were not verified. These remain separate evidence work; a successful live request does not establish model accuracy.

No real post bodies, credentials or signed-in screenshots are saved in this repository or posted to issues. Category definitions, keys and scoring contracts were not changed by this repair. Native, Punchy and Reader keep identical category rules, reversible reveals and deferred folding for visible, hovered or focused posts.

That signed-in check established connection, scoring and folding only. It did not establish sustained console/resource health. The owner's subsequent console screenshot prompted [#60 and the resource/lifecycle diagnosis](resource-lifecycle.md); release QA now covers those additional signals and actual extension reloads.
