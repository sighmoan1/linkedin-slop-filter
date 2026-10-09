# LinkedIn Slop Filter

A Chrome Manifest V3 extension with no runtime dependencies. Jev via OpenRouter is the default; OpenAI Decisions is selectable.

## Install

1. Clone this repository or download and unzip it into a permanent folder.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked**, then select the **linkedin-slop-filter** folder containing `manifest.json`.
4. Click the extension icon. Add an OpenRouter API key for Jev, or select OpenAI Decisions and add an OpenAI API key.
5. Enable filtering, save, and reload your LinkedIn feed.

Get keys at https://openrouter.ai/settings/keys or https://platform.openai.com/api-keys. API billing is separate from ChatGPT subscriptions. No key is included in this download.

## Behaviour

- Watches dynamically loaded feed cards. Checks posts entering the viewport or within 300px of it.
- Sends extracted post text (up to 12,000 characters) for a yes/no judgement using an editable rubric.
- Folds a post only when the model's probability of slop is **strictly greater than 0.80** by default. Exactly 0.80 stays visible.
- A folded post displays its estimated probability and **Show anyway**. Revealing lasts for that card's lifetime.
- API errors, refusals, timeouts and invalid results leave posts visible. The last error appears in settings.
- Requests are sequential, identical classifications are cached for the browser session, and the default limit is 100 API attempts per browser session across tabs. Reloads do not reset this limit. Restart Chrome or raise the limit to continue.
- Disable filtering to restore folded posts within five seconds. Reload the feed after changing provider or rubric.

## Privacy and credentials

Only extracted feed post text is sent, including any personal information the author puts in that text. The extension does not collect messages, comment threads, profile metadata or cookies, and does not click, like, post or scroll on your behalf. It reads the post text currently provided by LinkedIn; it does not automatically expand “see more” or analyse images.

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

`npm test` runs core request-schema, response-validation and strict threshold checks; mocked service-worker checks for credentials, caching, errors and request limits; JavaScript syntax checks; and a Chromium simulated-feed test. The browser test uses synthetic cards and mocked API responses, with no LinkedIn login, credentials or live provider calls. Playwright is a development dependency only.

Run individual checks with `npm run test:core`, `npm run test:background`, `npm run test:syntax` or `npm run test:feed`. GitHub Actions runs all four checks on pushes to `main` and pull requests.

LinkedIn's DOM changes frequently. Supported card selectors are in `content.js`; if filtering stops finding posts, update those selectors. The content script runs on `/feed/` URLs; if you arrive there through LinkedIn navigation from another page, reload the feed. It deliberately does not scan profiles or search results.

No live API or signed-in LinkedIn verification has been performed: setup needs your API credentials, and live DOM compatibility needs checking on your account.
Local core, mocked background, JavaScript syntax and Chromium simulated-feed checks passed on 9 October 2026. Track live verification and provider comparison in issues [#1](https://github.com/sighmoan1/linkedin-slop-filter/issues/1), [#2](https://github.com/sighmoan1/linkedin-slop-filter/issues/2) and [#3](https://github.com/sighmoan1/linkedin-slop-filter/issues/3).
