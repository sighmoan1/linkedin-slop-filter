# LinkedIn Slop Filter

A Chrome Manifest V3 extension with no runtime dependencies. Jev via OpenRouter is the default; OpenAI Decisions and optional Local Ollama are selectable. Local development is separate from the installable Jev baseline on main; see the [local setup and verification guide](docs/local-ollama.md).

## Install

1. Clone this repository or download and unzip it into a permanent folder.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked**, then select the **linkedin-slop-filter** folder containing `manifest.json`.
4. Click the extension icon. Add an OpenRouter API key for Jev, or select OpenAI Decisions and add an OpenAI API key. The settings page links to a built-in **setup guide** (`setup.html`) that walks through getting a key from each provider and what to do if the key test fails.
5. Press **Test key** under the key you entered. It tells you whether the key works, or why not (rejected key, no credit, no access to the model, rate limit, network problem).
6. Enable filtering, save, and reload your LinkedIn feed.

Get keys at https://openrouter.ai/settings/keys or https://platform.openai.com/api-keys. API billing is separate from ChatGPT subscriptions. No key is included in this download.

### Install the Jev baseline while local development continues

Use `main` in its own folder, separate from feature branches:

```sh
git clone --branch main git@github.com:sighmoan1/linkedin-slop-filter.git linkedin-slop-filter-jev
```

Load that folder in Chrome as above. Keep Jev selected, enter an OpenRouter key, ensure the account has credit and access to `typesafe/jev-1.13`, enable filtering and save. The default cutoff is strictly above 80%; exactly 80% stays visible. The pinned baseline predates the newer Test key/setup-guide UI; enter the key and save there, or use smoke:jev. No npm installation or build is needed to use the extension. The audited baseline is `510f199d2e4e2d995b85c54c3eecaa789180d657` from [PR #19](https://github.com/sighmoan1/linkedin-slop-filter/pull/19); run `git checkout 510f199d2e4e2d995b85c54c3eecaa789180d657` in that folder to pin it.

The Jev endpoint, model and Noul response match the [official OpenRouter examples](https://openrouter.ai/blog/insights/what-is-jev/) checked on 9 October 2026. Mocked tests do not establish that your key, billing or model access works. For an optional real call using synthetic text, in a local terminal (zsh):

```sh
read -rs 'OPENROUTER_API_KEY?OpenRouter key (hidden): '; echo
export OPENROUTER_API_KEY
npm run smoke:jev
unset OPENROUTER_API_KEY
```

This command makes one billed provider request and prints only the numeric result. It never writes the key or post text to a file. Missing credentials exit with a prerequisite message. A successful smoke call verifies the API path, not signed-in LinkedIn selectors or filtering quality. Enter the key separately in the extension settings. HTTP 401 suggests a rejected key; 402 billing; 403/404 access or endpoint; 429 rate limits. Errors leave posts visible.

## Behaviour

- Watches dynamically loaded feed cards. Checks posts entering the viewport or within 300px of it.
- Sends extracted post text for a judgement using an editable rubric: up to 12,000 characters for cloud providers or 2,000 for local Ollama. Local rubric length is capped at 1,200 characters for a 4,096-token context.
- Folds a post only when the model's probability of slop is **strictly greater than 0.80** by default. Exactly 0.80 stays visible.
- A folded post displays its cloud provider probability or explicitly labelled local self-reported confidence and **Show anyway**. Revealing lasts for that card's lifetime, including provider changes.
- Thresholds are independent: Jev probability, OpenAI probability, and local confidence each default to a strict `> 0.80` comparison. Existing cloud threshold settings migrate to OpenAI until an explicit OpenAI threshold is saved. Local scores are generated numbers, not calibrated probabilities. A local `slop:false` result stays visible at any confidence.
- Every post that is **not** folded shows a small chip with the model's estimate, for example **Slop likelihood: 23%**. The number is always printed; the chip is green below 35%, amber from 35% to 64% and red from 65%, as a secondary cue. A revealed post keeps its chip. Posts are scored as they come within 300px of the screen, so posts further down first read **Slop score: waiting**, then **Scoring…**. If scoring fails the chip reads **Not scored: no API key**, **request limit reached**, **API error 401** and so on, with the full reason on hover; the post stays visible and is retried after a minute. Posts with no extractable text (for example image-only posts) are not scored and get no chip. There are no chips while filtering is off.
- **Categories.** Each post is scored against every category in one request: Slop, Brainrot, Advert, Opportunity and Nourishment by default, plus any you add in settings (up to 12). Each definition is a yes/no question the model answers with a probability, so a post can fit several. Only Slop folds by default. Tick **Fold** on a category in settings to fold posts above the threshold in it; the fold bar then names the category, for example **Possible Advert · 90% model estimate**. Categories the model rates 50% or more are added to the chip, for example **Slop likelihood: 10% · Nourishment 97%**, and the tooltip lists every score. Slop's definition stays in the field above the category list. Editing a definition or adding a category rescores posts. More questions per request may cost more per post: billing for multi-question requests has **not** been checked against a live provider. If a provider rejects several questions at once (HTTP 400 or 422) the extension falls back to the slop question alone for the rest of the browser session. The four non-slop definitions are first drafts and have not been tested on real posts.
- API errors, refusals, timeouts and invalid results leave posts visible. The last error appears in settings.
- Requests are sequential, cloud classifications are cached on this computer for up to 30 days (at most 2,000 posts, oldest dropped first) and survive Chrome restarts, only a hash and the score are stored, never the post text, **Clear score cache** in settings empties it, and the default limit is 100 API attempts per browser session across tabs. Reloads do not reset this limit. Restart Chrome or raise the limit to continue.
- Local Ollama scores are cached for the browser session only, with provider/model/endpoint/rubric separation. Clear score cache also removes these scores.
- Disable filtering to restore folded posts within five seconds. Reload the feed after changing provider or rubric.
- **Test key** sends one small request in the same format as real classification, using the key as typed (saved or not). A pass means the key, your credit and access to the model all work. It does not use the per-session request limit. The result and time are remembered while that same key is entered. The key and the provider's raw error text are never shown or stored in the result.

## Privacy and credentials

Only extracted feed post text is sent, including any personal information the author puts in that text. With Local Ollama selected and a downloaded local model, this goes to the laptop's loopback service; no key, tunnel or hosted backend is needed. Cloud providers send it to their API. The extension does not collect messages, comment threads, profile metadata or cookies, and does not click, like, post or scroll on your behalf. It reads the post text currently provided by LinkedIn; it does not automatically expand “see more” or analyse images.

Keys are entered by you and stored in `chrome.storage.local`, restricted to trusted extension contexts. They are not synced or passed to the LinkedIn content script. This is a personal, unpacked extension: storage is not an encrypted credential vault. Use a dedicated key with a spending limit. Delete keys with the settings button.

For distribution to other people, put provider credentials behind an authenticated backend rather than embedding or sharing a key.

## Provider recommendation

Start with Jev for this text-only use case. OpenAI Decisions provides the same probability-based interface and can also accept images, though this extension sends text only. No claim is made that either is more accurate for LinkedIn slop. Compare them on posts you have labelled yourself and choose the provider that hides fewer useful posts. A reported 80% probability is not measured 80% accuracy or proof of AI authorship.

### API contracts supplied with the source (9 October 2026)

- Jev: `POST https://openrouter.ai/api/alpha/decisions`, model `typesafe/jev-1.13`, named `noul` question; read `answers.slop.noul`.
- OpenAI: `POST https://api.openai.com/v1/decisions`, model `gpt-6-luna`, named `predicate` question; read the matching answer's `probability`. Public beta.
- https://openrouter.ai/blog/insights/what-is-jev/
- https://developers.openai.com/api/docs/guides/decisions

## Development and limitations

No build step. All runtime code is bundled; no remote scripts or dependencies.

From the repository root:

```sh
npm ci
npx playwright install chromium
npm test
```

`npm test` runs core request-schema, response-validation and strict threshold checks; mocked service-worker checks; local schema, queue, switching, cache and fail-open checks; evaluation metric checks; JavaScript syntax; and Chromium simulated-feed and settings tests, including the merged key verification/setup guide/cache UI checks. Browser tests use synthetic cards and mocked responses, with no LinkedIn login, credentials or live provider calls. Playwright is a development dependency only. Real local checks are opt-in: `npm run smoke:ollama` and `npm run smoke:extension`.

Run individual checks with `npm run test:core`, `test:verify`, `test:cache`, `test:background`, `test:syntax`, `test:feed`, `test:options`, `test:setup`, `test:cacheui`, `test:local` or `test:localui`. GitHub Actions runs the suite on pushes to `main` and pull requests. See the [manual-label evaluation workflow](docs/evaluation.md) for comparing local inference with Jev, especially useful posts wrongly hidden.

LinkedIn's DOM changes frequently. Supported card selectors are in `content.js`; if filtering stops finding posts, update those selectors. As of 9 October 2026, a signed-in feed (`/feed/foryou/`) uses hashed class names, so posts are found through `role="listitem"` cards whose `componentkey` starts `update-card` and text in `data-testid="expandable-text-box"`; the older class-based selectors remain as a fallback. The content script runs on `/feed/` URLs; if you arrive there through LinkedIn navigation from another page, reload the feed. It deliberately does not scan profiles or search results.

No live cloud API or signed-in LinkedIn verification has been performed: cloud setup needs your API credentials, and live DOM compatibility needs checking on your account. A real local Qwen3.5 4B synthetic smoke and direct unpacked-extension smoke passed on the M4 Max; see [local verification evidence](docs/local-ollama.md). These are not live LinkedIn tests or model quality measurements.
Local core, mocked background, JavaScript syntax and Chromium simulated-feed checks passed on 9 October 2026. Track live verification and provider comparison in issues [#1](https://github.com/sighmoan1/linkedin-slop-filter/issues/1), [#2](https://github.com/sighmoan1/linkedin-slop-filter/issues/2) and [#3](https://github.com/sighmoan1/linkedin-slop-filter/issues/3).
