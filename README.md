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

Existing category definitions are preserved. To adopt revised built-in prompts, use **Review revised definitions** in Categories, review, apply and save. This keeps custom categories, names, actions, thresholds and order. **Restore defaults** is a separate, deliberate reset of the whole category draft.

Cloud API billing is separate from ChatGPT subscriptions. No key is included. Key tests make one tiny real request using the key as entered; they do not count against the feed/playground session limit. Their result verifies access, not filtering quality.

## Choose what happens

A category applies only when its score is **strictly greater** than its own threshold. Exactly 80% does not apply to an 80% threshold. Default cutoffs are uncalibrated model estimates, not measured accuracy.

| Action | Result |
| --- | --- |
| Hide | A compact row replaces the post, with Show, Details and Correct controls. |
| Highlight | The original post stays open with a subtle accent and matching label. |
| Label | The original post stays open with a quiet matching label. |
| Off | The category is not requested or applied. |

Slop, Brainrot, Advert, Opportunity, Nourishment and custom categories all have the same controls. Each can be edited, reordered, removed or switched off. Up to 12 categories are supported. A post can match several; **any applying Hide rule wins**, including when another category says Highlight. Details show available scores, thresholds and actions. Missing answers never apply, and Off categories are not requested.

Default actions hide Slop, label Brainrot and Advert, and highlight Opportunity and Nourishment. The explicit **Less noise** preset hides Slop, Brainrot and Advert and keeps positive categories on Highlight. Presets preview changes, preserve custom categories and can be undone before saving. They change actions only.

An empty category list or all categories Off can be saved while filtering is disabled. Enabling filtering requires an active category. Defaults are never silently restored after removing everything.

## Feed appearance and recovery

The feed uses LinkedIn’s native post typography and surfaces, with compact hidden rows. Original links and controls stay in place. **Group consecutive hidden posts** is a separate option, off by default. Groups show a count and category composition, retain individual reveal controls and never span a visible post. Labels on visible posts can be switched off independently.

The interface uses system sans-serif fonts, neutral white/grey surfaces and blue controls to fit alongside LinkedIn. Settings use 16px body text, with compact 14px supporting text and popup/feed controls. Keyboard focus stays visible and action targets remain at least 44px tall. No fonts or styles are fetched at runtime.

- **Show** reveals one original post in place for that card's lifetime. **Hide again** reverses it. Neither makes another request or saves a correction.
- **Show everything** temporarily reveals the current feed without modifying saved rules. **Restore filtering** ends that override.
- **Disable filtering** restores posts and pauses classification. It is separate from Show everything.
- **Correct** lets you choose every applicable active category, or none, and explicitly save a local correction. That post stays visible. Corrections do not automatically train the model or rewrite prompts.

New scores do not automatically collapse a card that is visible, hovered or has keyboard focus. **Hide now** offers immediate control; otherwise the fold waits until the card is out of view and disengaged. Scoring and deliberate reveal/collapse use measured anchoring to preserve reading position. There are no animated post-height transitions or automatic feed scrolling. See [the feed design and release checks](docs/feed-experience.md).

## Requests, failures and storage

Only extracted post body text is sent: at most 12,000 characters for cloud providers or 2,000 for local Ollama. Line and paragraph boundaries are preserved. Messages, comments, profile metadata, cookies and extension controls are excluded. The extension does not expand “see more”, analyse images, click, like or post for you. Cards without extractable body text stay visible and are not scored.

Requests are sequential with a bounded feed prefetch queue; upcoming cards are prioritized. The default cap is 100 API attempts per browser session across tabs. **Try a post** shares that cap. Reloading a feed, changing settings, clearing scores or deleting corrections does not reset it. Restart Chrome or raise the cap to continue. The popup and Provider panel show session usage and a quiet error summary; the toolbar marks service failures.

Network errors, refusals, timeouts, invalid answers, a missing key and the request cap leave unscored posts visible. Partial answers use only their valid scores and are marked partly scored. Details report actual scores/rules, not invented explanations. If a provider refuses several questions (HTTP 400/422), the worker retries only Hide categories and reports the fallback; a scoring-configuration change retries all categories. Live multi-question billing and fallback behavior are unverified.

Cloud score caches contain a hash, scores and time, never post text. They last up to 30 days, with a 2,000-entry cap. Local scores last for the browser session. **Clear score cache** removes both. Changing a definition, active questions, provider, local model or endpoint starts fresh scores. Names, actions, thresholds, order and appearance reuse scores. Obsolete results cannot hide a recycled or differently configured post.

Only **explicitly saved corrections** retain post text, locally in trusted extension storage. At most 200 are kept. They also include chosen category ids, safe score metadata, provider/configuration and time; author/profile metadata is not collected. In Corrections you can inspect, remove, clear or export JSON, including the saved text. A reveal never stores text here.

Corrections also show per-category false matches and misses against saved rules, plus combined false/missed Hide predictions on posts with every Hide score. Analysis uses the latest correction for each identical post and only the current provider/scoring configuration; missing scores and excluded records are reported. This selected corpus is not representative feed accuracy or a record of actual folds.

With at least five chosen and five unchosen scored examples for a category, a whole-percent threshold can be suggested if it reduces disagreements without increasing false matches on those same examples. This minimum is a guard against tiny samples, not statistical validation. Copy a suggestion to the category draft, review and Save settings to apply it. Nothing changes automatically or makes a provider request. Durable exceptions, chosen prompt examples and AI-assisted rewriting remain separate follow-up work.

Keys stay in local browser storage restricted to trusted extension contexts. They are not synced, logged or sent to the LinkedIn content script. Definitions also stay in trusted extension contexts; feed replies carry only safe display metadata and a hashed configuration. This unpacked extension uses local browser storage, not an encrypted credential vault. **Delete keys & disable** removes cloud keys and pauses filtering, while keeping categories and corrections.

## Try and tune a rubric

**Try a post** makes an explicit request with saved provider settings and definitions. It works while feed filtering is disabled, reports scores/missing answers and resulting actions, and does not save the input as a correction. Unsaved definition edits are not used. Nothing is sent while typing. Local definitions must fit the 6,000-character serialized context budget, shown in Categories.

The [rubric notes](docs/category-rubrics.md) explain the five categories, protected counterexamples and sources including tropes.fyi. Stylistic tropes are supporting clues when they replace substance; punctuation, non-native phrasing, slang or mentioning AI are not sufficient.

Revised prompts matched all five authored labels on 22/24 development cases and 10/12 fresh synthetic cases with local Qwen3.5 4B; previous defaults matched 16/24 and 9/12. Development was tuned and the same author wrote the cases and labels. These small results do not establish representative accuracy or better Slop hiding; the same development Slop miss remained. No cloud performance is inferred.

```sh
npm run report:rubrics
```

This replays committed synthetic scores without model calls. The rubric notes document an explicitly invoked local-only evaluator and private-corpus workflow. Keep real labelled data in ignored `.local-data/`. Compare useful posts wrongly hidden under **all** active Hide rules, missing/error coverage and ambiguous examples, not only Slop scores.

## Development and verification

```sh
npm ci
npx playwright install chromium
npm test
```

The suite checks provider schemas, response validation, strict thresholds, migration, credential isolation, sequential queue/cache/limits, fail-open behavior, experience-message permissions, corrections, rubric fixtures and metrics, syntax, simulated-feed scrolling/recovery and settings/popup browser behavior. CI runs the same command. Browser fixtures use synthetic text and mocked responses; Playwright is a development dependency only.

`npm run verify:release` loads the actual unpacked extension in a temporary Chromium profile with synthetic posts and pre-seeded scores. It checks feed/settings/popup behavior together without provider calls or a LinkedIn login. Set `QA_OUTPUT_DIR` to retain local screenshots; the temporary profile is removed afterwards.

The release check now also records console errors and failed extension resources, reloads the actual extension, verifies old controls/folds are removed, and reconnects after a page reload. The owner's reported `chrome-extension://invalid/` flood was traced to a matching public LinkedIn script containing extension-file probes; see [the scoped diagnosis and lifecycle repair](docs/resource-lifecycle.md). This extension does not suppress site console errors or alter LinkedIn's probing code.

Optional provider checks are `npm run smoke:ollama`, `npm run smoke:extension` and `npm run smoke:jev`. The Jev smoke requires your `OPENROUTER_API_KEY` environment variable and makes one billed synthetic request; never put the key in a file, issue, log or commit. Local checks require the downloaded model/service. Neither establishes live-feed compatibility or accuracy.

Configured cloud contracts are Jev `typesafe/jev-1.13` through OpenRouter's alpha Decisions endpoint and OpenAI `gpt-6-luna` through `/v1/decisions`. On 10 October 2026, the owner's installed Brave extension successfully scored its signed-in For You feed with OpenAI: the popup reported three requests and two folded posts. This limited observation verifies that account's live path, not Jev access, billing details, fallback behavior or representative accuracy. Local Ollama uses an HTTP loopback origin and rejects cloud model tags.

LinkedIn's DOM and virtualization change frequently. Current selectors support older feed classes and `role="listitem"`/`componentkey="update-card…"` cards with expandable text boxes. If arriving through navigation from a page where the script was not injected, reload the feed. Profiles and search results are not scanned.

Release checks use synthetic Chromium feeds and a real unpacked extension in a temporary profile. Version 2.0.1 also received a limited signed-in Brave/OpenAI For You check; see [#58 and its evidence](docs/readable-feed.md). Wider signed-in compatibility, other cloud accounts/providers and representative real-post accuracy remain open verification work in [#1](https://github.com/sighmoan1/linkedin-slop-filter/issues/1), [#2](https://github.com/sighmoan1/linkedin-slop-filter/issues/2) and [#3](https://github.com/sighmoan1/linkedin-slop-filter/issues/3). A prior real local Qwen3.5 4B synthetic smoke passed; see [local evidence](docs/local-ollama.md).

Individual hidden rows show the model confidence for each matching Hide category. Manually corrected categories are labelled “corrected” instead; original model scores remain in Details.
