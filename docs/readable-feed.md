# Readable interface and current feed routes

Issue [#58](https://github.com/sighmoan1/linkedin-slop-filter/issues/58) addresses the owner's unreadable interface and missing feed controls.

The installed Brave extension was observed on 10 October 2026 with filtering on and zero requests. Its popup rejected the signed-in `/feed/foryou/` page as a feed. LinkedIn's Network tab uses `/feed/network/`. Both are legitimate feeds and must be distinguished from `/feed/update/…` post detail pages.

The owner's [stylesheet reference](https://whenisbins.com/styles-new.css) uses Lexend Deca, warm paper, dark ink, teal primary buttons, substantial borders and a two-tone focus indicator. The extension will use that visual direction with locally shipped font files and readable sizes, adapting layouts to a narrow popup and feed cards.

Verification will distinguish actual signed-in route/DOM checks from synthetic scoring and cloud access. Real post text and credentials must not enter committed fixtures, screenshots or issue comments.
