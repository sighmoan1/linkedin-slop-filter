# LinkedIn Slop Filter

A Chrome extension that makes low-value feed posts easy to skip and easy to recover. Every category has its own action and threshold. Original posts stay in their original order; the extension does not generate summaries or claim to detect AI authorship.

Jev through OpenRouter is the default provider. OpenAI Decisions and downloaded local Ollama models are selectable. There is no build step or runtime dependency, and all styles and assets ship locally.

## Install or update

1. Keep this repository in a permanent folder.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`.
3. Open the extension popup, then **Settings**. In **Provider**, enter your own key or configure local Ollama. The built-in [setup guide](setup.html) explains cloud keys and key-test failures; the [local guide](docs/local-ollama.md) explains Ollama.
4. Choose your category actions, enable filtering, and save. Open or reload your LinkedIn feed.

After updating an unpacked installation, press **Reload** on its card in `chrome://extensions`, then reload the feed. Chrome does not automatically reload an extension when Git changes its files.

From 2.0.2, an invalidated feed script stops its polling, observers and requests, removes its controls and restores original posts. Reload the feed to reconnect. Late results from the old script cannot fold posts. Ordinary provider failures still leave posts visible and allow recovery; they do not permanently disconnect the script.

The popup reports **Feed connected** and the number of readable posts found. Home, **For you** and **Network** feed routes are supported; individual post pages are excluded. If you navigate to the feed from another LinkedIn page and controls are missing, reload the feed. A disconnected popup offers **Reload current tab** when it can safely identify a candidate tab.

Existing category definitions are preserved. To adopt revised built-in prompts, use **Review revised definitions** in Post rules, review, apply and save. This keeps custom categories, names, actions, thresholds and order. **Restore defaults** is a separate, deliberate reset of the whole category draft.

Cloud API billing is separate from ChatGPT subscriptions. No key is included. Key tests make one tiny real request using the key as entered; they do not count against the feed/playground session limit. Their result verifies access, not filtering quality. **Test local Ollama** checks the endpoint and downloaded model entered in Provider with one fixed synthetic classification, before saving and while filtering is paused. It uses no key, saves nothing and does not count against the feed/playground cap. After a pass, save settings and use **Try a post** to check your category rules.

## Choose what happens

A category applies only when its score is **strictly greater** than its own threshold. Exactly 80% does not apply to an 80% threshold. Default cutoffs are uncalibrated model estimates, not measured accuracy.

| Action | Result |
| --- | --- |
| Hide | A compact row replaces the post, with category names and a Show post control. |
| Highlight | The original post stays open with a subtle accent and matching label. |
| Label | The original post stays open with a matching category label. |
| Off | The category is not requested or applied. |

Slop, Brainrot, Advert, Opportunity, Good post and custom categories all have the same controls. Each can be edited, reordered, removed or switched off. Up to 12 categories are supported. A post can match several; **any applying Hide rule wins**, including when another category says Highlight. The Review scores panel on visible posts combines available scores, thresholds, actions and correction checkboxes. Missing answers never apply, and Off categories are not requested.

Default actions hide Slop, label Brainrot and Advert, and highlight Opportunity and Good post. The explicit **Preview hiding more posts** preset hides Slop, Brainrot and Advert and keeps positive categories on Highlight. Presets preview changes, preserve custom categories and can be undone before saving. They change actions only.

An empty category list or all categories Off can be saved while filtering is disabled. Enabling filtering requires an active category. Defaults are never silently restored after removing everything.

## Feed appearance and recovery

The feed uses LinkedIn’s native post typography and surfaces, with compact hidden rows. Original links and controls stay in place. **Group consecutive hidden posts** is a separate option, off by default. Groups show a count and category composition, retain individual reveal controls and never span a visible post. Labels on visible posts can be switched off independently.

The interface uses system sans-serif fonts, neutral white/grey surfaces and blue controls to fit alongside LinkedIn. Settings use 16px body text, with compact 14px supporting text and popup/feed controls. Keyboard focus stays visible and action targets remain at least 44px tall. No fonts or styles are fetched at runtime.

- **Show post** reveals one original post in place for that card's lifetime. **Hide post again** reverses it. Neither makes another request or saves a correction.
- **Show everything** temporarily reveals the current feed without modifying saved rules. **Restore filtering** ends that override.
- **Disable filtering** restores posts and pauses classification. It is separate from Show everything.
- **Review scores** lets you choose every applicable active category, or none, and explicitly save a local correction. That post stays visible. Corrections do not automatically train the model or rewrite prompts.

A current result above a Hide category’s threshold collapses the post immediately, including posts on screen, hovered or keyboard focused. **Show post** keeps an explicitly revealed post open until you choose **Hide post again**; temporary **Show everything** also keeps posts visible. If a focused post folds, focus moves to Show post. Scoring and deliberate reveal/collapse use measured anchoring to preserve reading position. There are no animated post-height transitions. See [the feed design and release checks](docs/feed-experience.md).

Hidden rows show the strongest matching Hide category, its confidence, and the optional author name. Review scores retains all categories. The extension targets WCAG 2.2 AA; see [accessibility checks and verification limits](docs/accessibility.md).

## Requests, failures and storage

By default, only extracted post body text is sent: at most 12,000 characters for cloud providers or 2,000 for local Ollama. Line and paragraph boundaries are preserved. Messages, comments, profile metadata, cookies and extension controls are excluded. The extension does not expand “see more”, click, like or post for you. With image checks off, cards without extractable body text stay visible and are not scored.

Requests are sequential with a bounded feed prefetch queue; upcoming cards are prioritized. The default cap is 100 API attempts per browser session across tabs. **Try a post** shares that cap. Reloading a feed, changing settings, clearing scores or deleting corrections does not reset it. Use **Reset counters** in the popup or Provider panel to clear the current session count and service-error badge without changing saved settings, keys, corrections or scores. The popup and Provider panel show session usage and a quiet error summary; the toolbar marks service failures.

Network errors, refusals, timeouts, invalid answers, a missing key and the request cap leave unscored posts visible. Partial answers use only their valid scores and are marked partly scored. The Review scores panel reports actual scores/rules, not invented explanations. If a provider refuses several questions (HTTP 400/422), the worker retries only Hide categories and reports the fallback; a scoring-configuration change retries all categories. Live multi-question billing and fallback behavior are unverified.

Cloud score caches contain a hash, scores and time, never post text. They last up to 30 days, with a 2,000-entry cap. Local scores last for the browser session. **Delete saved scores** removes both. Changing a definition, active questions, provider, local model or endpoint starts fresh scores. Names, actions, thresholds, order and appearance reuse scores. Obsolete results cannot hide a recycled or differently configured post.

**Rewrite with local Ollama**, under each category definition, sends only that draft definition (up to 2,000 characters) and your explicit guidance (up to 1,000) to the saved local model. It shares the sequential queue and session cap. Review the result, apply it to the draft, then Save settings yourself; no rules change automatically. Saved Local Ollama settings and a saved category are required. Cloud Decisions providers return scores and cannot generate these rewrites. The [Ollama chat contract](https://docs.ollama.com/api/chat) supports structured generation; this rewrite feature has not been checked with a live model or in installed Brave.

In a visible post’s **Review scores** panel, **Always keep this post visible** saves a durable exception and skips future automatic checks for that post, including after a reload. **Show post** stays temporary. Exceptions store only a SHA-256 hash of a stable LinkedIn post identifier and the save date, with a limit of 500. Posts without a recognized stable identifier cannot save this choice. Remove it in the post’s Review scores menu or manage individual choices under **Never hide → Posts kept visible**. The settings list shows dates and short hash identifiers because no text or post links are saved. This feature has automated synthetic coverage; installed Brave behavior has not yet been checked.

Only **explicitly saved corrections** retain post text, locally in trusted extension storage. At most 200 are kept. They also include chosen category ids, safe score metadata, provider/configuration and time; author/profile metadata is not collected. In Corrections you can inspect, remove, clear or export JSON, including the saved text. A reveal never stores text here. Select **Use as a prompt example** to share up to four chosen corrections with future text classification requests to your selected provider (including Try a post). Each example contains up to 600 sanitized text characters and category labels, with at most 3,000 serialized characters overall. Selection is off by default; removed corrections stop being examples. Category definition or membership changes disable old selections until reselected. Selection changes invalidate cached/in-flight text scores. Ollama refuses a request if combined definitions and examples exceed its existing 6,000-character context allowance; image checks and key verification do not send these examples.

Corrections also show per-category false matches and misses against saved rules, plus combined false/missed Hide predictions on posts with every Hide score. Analysis uses the latest correction for each identical post and only the current provider/scoring configuration; missing scores and excluded records are reported. This selected corpus is not representative feed accuracy or a record of actual folds.

With at least five chosen and five unchosen scored examples for a category, a whole-percent threshold can be suggested if it reduces disagreements without increasing false matches on those same examples. This minimum is a guard against tiny samples, not statistical validation. Copy a suggestion to the category draft, review and Save settings to apply it. Nothing changes automatically or makes a provider request.

Keys stay in local browser storage restricted to trusted extension contexts. They are not synced, logged or sent to the LinkedIn content script. Definitions also stay in trusted extension contexts; feed replies carry only safe display metadata and a hashed configuration. This unpacked extension uses local browser storage, not an encrypted credential vault. **Delete keys & disable** removes cloud keys and pauses filtering, while keeping categories and corrections.

## Try and tune a rubric

**Image checks (trial)** is off by default in Settings → Feed. Enabling it requests optional LinkedIn media access; Save settings starts the trial. It keeps the selected text provider and uses a saved OpenRouter key for a separate Clef Flash or Luna Visual slop decision. Label is the default action; an applying Visual slop label removes Good post praise without hiding the card. Hide is an explicit choice and uses the same strict threshold and recovery controls. This assesses visual filler, not proven AI authorship.

Only attached post images are eligible: up to four PNG/JPEG/WebP images, downloaded without cookies, resized to at most 768 pixels on the longest side and bounded to a combined 150,000-character inline payload. Avatars, comments and link previews are excluded. Flash captions over 2,000 UTF-8 bytes are left unchecked to avoid silent truncation. Failed or oversized checks do not create a Visual slop match; the feed marks them Image unchecked. Existing text Hide matches skip the image request. Each uncached image decision uses an additional session attempt. Scores are cached by caption, image content hash and model; no image bytes or attachment URLs are stored. Explicit corrections may retain an image hash alongside the saved caption.

**Compare image models**, in Try a post, sends your selected files and caption to Flash and Luna only when clicked, even while filtering is paused. It reports scores and returned input tokens/cost; cached results cannot supply fresh billing measurements. No files or captions are saved. Representative accuracy and browsing cost remain unmeasured; the [implementation and assessment](docs/image-filtering.md) includes the limited live comparison.

**Try a post** makes an explicit request with saved provider settings and definitions. It works while feed filtering is disabled, reports scores/missing answers and resulting actions, and does not save the input as a correction. Unsaved definition edits are not used. Nothing is sent while typing. Local definitions must fit the 6,000-character serialized context budget, shown in Post rules.

The [rubric notes](docs/category-rubrics.md) explain the five categories, protected counterexamples and sources including tropes.fyi. Stylistic tropes are supporting clues when they replace substance; punctuation, non-native phrasing, slang or mentioning AI are not sufficient.

Revised prompts matched all five authored labels on 22/24 development cases and 10/12 fresh synthetic cases with local Qwen3.5 4B; previous defaults matched 16/24 and 9/12. Development was tuned and the same author wrote the cases and labels. These small results do not establish representative accuracy or better Slop hiding; the same development Slop miss remained. No cloud performance is inferred.

```sh
npm run report:rubrics
```

This replays committed synthetic scores without model calls.

**Compare proposed prompt wording before adopting it:** the offline [rubric comparison guide](docs/rubric-comparison.md) explains how to score a separately frozen, held-out labelled corpus under two rubric versions and use `npm run compare:rubrics` to check false hides, errors and coverage. This does not apply any rule or call a model by itself. The rubric notes document an explicitly invoked local-only evaluator and private-corpus workflow. Keep real labelled data in ignored `.local-data/`. Compare useful posts wrongly hidden under **all** active Hide rules, missing/error coverage and ambiguous examples, not only Slop scores.

## Development and verification

```sh
npm ci
npx playwright install chromium
npm test
```

The suite checks provider schemas, response validation, strict thresholds, migration, credential isolation, sequential queue/cache/limits, fail-open behavior, experience-message permissions, corrections, rubric fixtures and metrics, syntax, simulated-feed scrolling/recovery and settings/popup browser behavior. Run these checks locally before merging. GitHub Actions is disabled; this repository has no automated Actions workflow. Browser fixtures use synthetic text and mocked responses; Playwright is a development dependency only.

`npm run verify:release` loads the actual unpacked extension in a temporary Chromium profile with synthetic posts and pre-seeded scores. It checks feed/settings/popup behavior together without provider calls or a LinkedIn login. Set `QA_OUTPUT_DIR` to retain local screenshots; the temporary profile is removed afterwards.

The release check now also records console errors and failed extension resources, reloads the actual extension, verifies old controls/folds are removed, and reconnects after a page reload. The owner's reported `chrome-extension://invalid/` flood was traced to a matching public LinkedIn script containing extension-file probes; see [the scoped diagnosis and lifecycle repair](docs/resource-lifecycle.md). This extension does not suppress site console errors or alter LinkedIn's probing code.

Optional provider checks are `npm run smoke:ollama`, `npm run smoke:extension` and `npm run smoke:jev`. The Jev smoke requires your `OPENROUTER_API_KEY` environment variable and makes one billed synthetic request; never put the key in a file, issue, log or commit. Local checks require the downloaded model/service. Neither establishes live-feed compatibility or accuracy.

Configured cloud contracts are Jev `typesafe/jev-1.13` through OpenRouter's alpha Decisions endpoint and OpenAI `gpt-6-luna` through `/v1/decisions`. On 10 October 2026, the owner's installed Brave extension successfully scored its signed-in For You feed with OpenAI: the popup reported three requests and two folded posts. This limited observation verifies that account's live path, not Jev access, billing details, fallback behavior or representative accuracy. Local Ollama uses an HTTP loopback origin and rejects cloud model tags.

LinkedIn's DOM and virtualization change frequently. Current selectors support older feed classes and `role="listitem"`/`componentkey="update-card…"` cards with expandable text boxes. If arriving through navigation from a page where the script was not injected, reload the feed. Profiles and search results are not scanned.

Release checks use synthetic Chromium feeds and a real unpacked extension in a temporary profile. Version 2.0.1 also received a limited signed-in Brave/OpenAI For You check; see [#58 and its evidence](docs/readable-feed.md). Wider signed-in compatibility, other cloud accounts/providers and representative real-post accuracy remain open verification work in [#1](https://github.com/sighmoan1/linkedin-slop-filter/issues/1), [#2](https://github.com/sighmoan1/linkedin-slop-filter/issues/2) and [#3](https://github.com/sighmoan1/linkedin-slop-filter/issues/3). A prior real local Qwen3.5 4B synthetic smoke passed; see [local evidence](docs/local-ollama.md).

The interface copy review in [#104](https://github.com/sighmoan1/linkedin-slop-filter/issues/104) passed `npm test`, including responsive light/dark layout checks and simulated reveal, corrections and popup recovery. This copy revision has not been installed or checked in the signed-in Brave feed.

Hidden rows show category names and Show post. Scores and corrections are available only while the post is visible, in one Review scores panel. Cancel or Escape discards unsaved edits; re-hiding closes the menu. Saved corrections retain the original model scores.

### Never hide selected people

In Settings → Never hide, open Connections or Following and use Never hide beside a person. Selections save immediately in this browser profile. You can also add a profile URL directly and remove selections in settings. Only selected names and profile links are stored locally; neither is sent to the classification provider. A recognized selected post author bypasses classification and stays visible, including when a cached score or correction would otherwise hide it. Changes reach open feed tabs on the next settings refresh.

Author matching uses the outer post’s actor profile link, not mentions or embedded repost authors. LinkedIn markup can change; an unrecognized actor is classified normally. This feature has not yet been verified on a signed-in Brave connections/following list or live feed.

The opt-in image trial has passed mocked provider/extraction, settings/feed and actual unpacked MV3 Chromium checks. It is installed in the owner’s signed-in Brave profile. Limited live checks verified feed discovery, reveal/re-hide, popup recovery, persisted settings, a real automatic Luna attachment score, and an explicit Flash/Luna comparison on the owner-supplied screenshot. Current direct-image and gallery figure markup is covered by a narrow extraction fix; videos, document assets, previews and nested/comment images are excluded. This is limited compatibility evidence, not representative accuracy or a browsing-cost benchmark. See [image verification](docs/image-filtering.md).
