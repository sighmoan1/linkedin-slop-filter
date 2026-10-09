# Working on LinkedIn Slop Filter

Instructions for anyone, human or AI agent, changing this repository. Read this before you start.

## Coordination protocol

Several agents may work here at once. Everything below uses GitHub issues, labels and pull requests so that anyone can see what is being worked on.

1. **Look before you start.** List open issues with the `in-progress` label and open pull requests. If the work you have in mind is already claimed, pick something else or comment on that issue.
2. **Every change starts as an issue.** If none exists, open one first with the problem and acceptance criteria.
3. **Claim before you code.** Add the `in-progress` label to the issue and post a comment with your branch name and the files you expect to touch.
4. **Open a draft PR straight away**, with `Closes #N` in the description, so the branch and its changed files are visible.
5. **One issue, one branch, one PR.** Name branches `feat/<issue>-<slug>`, `fix/<issue>-<slug>` or `docs/<issue>-<slug>`.
6. **Release the claim.** Remove `in-progress` when the PR is ready for review, abandoned or merged, and say so in a comment.
7. **Suggestions need a go-ahead.** Issues labelled `suggestion` are ideas, not approved work. Do not start one without an explicit instruction from the repository owner. To propose something new, open an issue labelled `suggestion` and carry on with approved work.
8. **Overlapping files.** If your branch touches files that another open PR also changes, say so in your PR description and keep the overlap small.

Do not merge your own PR unless the owner has asked you to.

## Project basics

A Chrome Manifest V3 extension with no build step and no runtime dependencies.

| File | Role |
| --- | --- |
| `manifest.json` | Extension manifest and host permissions |
| `core.mjs` | Provider request and response handling, defaults, threshold rule |
| `background.js` | Service worker: holds API keys, queues and caches classification requests |
| `content.js`, `content.css` | Finds posts on the LinkedIn feed, folds them, reveals them |
| `options.html`, `options.js`, `options.css` | Settings page, also used as the toolbar popup |
| `tests/` | Core, background, syntax and simulated-feed browser tests |

Run the checks from the repository root:

```sh
npm ci
npx playwright install chromium
npm test
```

`npm test` must pass before a PR leaves draft. CI runs the same command.

## Rules that must keep holding

- API keys never reach the LinkedIn content script. Content scripts only get `enabled` and `threshold` from the service worker.
- A post folds only when its probability is **strictly greater** than the threshold.
- Any API error, refusal, timeout or invalid response leaves the post visible.
- Only extracted feed post text is sent to the provider. Do not collect messages, comments, profile data or cookies.
- No remote scripts, fonts or assets. Everything the extension runs ships in this repository.
- Keys and tokens must never be logged, written to the page, or committed.
- Be honest in the README about what has and has not been verified. No live provider or signed-in LinkedIn check has been done unless an issue says so (see #1 and #2).

## Commits and pull requests

Keep commits focused and describe why. Describe in the PR what was verified and how, and what was not.
