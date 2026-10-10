# Optional local Ollama provider

Development is tracked in [#22](https://github.com/sighmoan1/linkedin-slop-filter/issues/22) on `feat/22-local-ollama`. Jev remains the default. The installable Jev baseline is main commit `510f199d2e4e2d995b85c54c3eecaa789180d657`; use a separate clone so experimental work cannot affect that installation.

The initial model is the official [qwen3.5:4b-q4_K_M](https://ollama.com/library/qwen3.5/tags), a 4-bit GGUF model. The lighter option is `qwen3.5:2b-q4_K_M`. Feed and playground requests go directly from the extension worker to loopback Ollama. The explicit connection test runs on the trusted settings page. Neither a tunnel nor an API key is needed.

## Try it on either Mac

1. Install the macOS application from [Ollama](https://ollama.com/download/mac) and open it, or start its CLI service with `ollama serve`. If it is already running, do not start a second server on the same port.
2. In Terminal, download the explicitly quantised official model:

   ```sh
   ollama pull qwen3.5:4b-q4_K_M
   ollama show qwen3.5:4b-q4_K_M
   ```

   Confirm `Q4_K_M` in the model details. For less memory use, pull `qwen3.5:2b-q4_K_M` and use that exact name in settings. The official [tag list](https://ollama.com/library/qwen3.5/tags) was checked on 9 October 2026. Explicit tags avoid an unqualified `latest` selecting a larger model. Model weights stay in Ollama's model store, outside this repository.
   The installed 4B tag reports that it requires Ollama **0.30.0 or newer**; upgrade an older Ollama installation before trying it. Development used 0.35.1.
3. Clone the feature separately, preserving your Jev installation:

   ```sh
   git clone --branch feat/22-local-ollama git@github.com:sighmoan1/linkedin-slop-filter.git linkedin-slop-filter-local
   ```

4. At `chrome://extensions`, enable Developer mode, choose Load unpacked and select `linkedin-slop-filter-local` (its root contains `manifest.json`). Open the extension, select **Local Ollama**, leave endpoint `http://127.0.0.1:11434` and model `qwen3.5:4b-q4_K_M`, enable filtering and save. Reload `/feed/` on LinkedIn. No API key is required; existing cloud keys are neither used nor sent to Ollama.
5. If origin access is denied, copy this extension's ID from `chrome://extensions`, quit the existing Ollama application/service, and run a loopback-only service for this extension:

   ```sh
   OLLAMA_HOST=127.0.0.1:11434 OLLAMA_NO_CLOUD=1 OLLAMA_ORIGINS='chrome-extension://YOUR_EXTENSION_ID' ollama serve
   ```

   Replace `YOUR_EXTENSION_ID` locally. Keep this terminal running. Prefer this exact origin over a wildcard. This follows the [official origin/service configuration](https://docs.ollama.com/faq). No adapter or tunnel is involved. On macOS the app can instead receive these environment variables through `launchctl setenv` before restarting it, as described in the FAQ. `OLLAMA_NO_CLOUD=1` ensures Ollama itself cannot offload to its cloud features. Never bind to `0.0.0.0` for this use case.

The configurable endpoint accepts only HTTP origins on `127.0.0.1` or `localhost`, with no credentials, path or query. Manifest permissions allow those two loopback hosts only, alongside the existing cloud API hosts. Chrome match patterns do not restrict ports; runtime validation restricts hosts and the worker appends only `/api/chat`. The configurable port allows an alternate local service. IPv6 and remote endpoints are intentionally unsupported.

## Test local Ollama in settings

In **Settings → Provider**, choose **Local Ollama**, enter your HTTP loopback endpoint and exact downloaded model name, then press **Test local Ollama**. You can test unsaved values with filtering paused. The test makes one fixed synthetic classification with one built-in question, uses no API key, and does not save settings, corrections or a test result, or count against the feed/playground request cap. It uses the same chat request and answer validation as local classification. Editing the endpoint/model or switching provider clears the result and discards an older in-flight result.

A pass verifies connectivity and a valid answer format, not accuracy or the full category context budget. Save settings and open **Try a post** to classify your own example against the saved category definitions. You can leave filtering paused for both steps. A denied origin, missing model, unreachable service, timeout or invalid answer gets an actionable status message; follow the origin setup above if needed. The request blocks redirects and sends no credentials. The test uses Ollama's documented [chat API](https://docs.ollama.com/api/chat) and [origin configuration](https://docs.ollama.com/faq).

## Request and score behaviour

Requests use Ollama's documented [`/api/chat`](https://docs.ollama.com/api/chat) with a JSON schema in [`format`](https://docs.ollama.com/capabilities/structured-outputs), `stream:false`, `think:false`, temperature 0, 4,096 context tokens and at most 16 + 12 output tokens per category. Only one classification runs at a time. Post text is a separate JSON user message treated as untrusted evidence; every switched-on category's definition is in the system message. This reduces instruction confusion but does not establish immunity to prompt injection.

The schema is generated from the switched-on categories: one required number from 0 to 1 per category id, nothing else. Each number is the model's self-reported confidence that the post belongs to that category; the UI calls it local self-reported confidence. A category applies only when its number is **strictly above** that category's threshold (80% initially). It is distinct from Jev's returned Noul probability. Neither score implies measured accuracy or calibration on LinkedIn. A synthetic smoke on 9 October 2026 (Qwen3.5 4B, five default categories) returned all five numbers with 810 prompt tokens and 27 output tokens.

Thresholds belong to categories, not providers. Local classification cache entries include provider, model, endpoint, the switched-on definitions and bounded text; changing only a threshold, action or name reuses scores. Local scores stay in session storage; cloud scores preserve main's 30-day persistent cache. Clear score cache clears both without resetting request counts. Changing a provider/model/endpoint/definition discards stale queued/in-flight results and reclassifies cards. Show anyway remains effective for the same card text. Existing cloud behaviour, score badges, key tests, setup guide and credentials are preserved. The browser-session request limit also counts local attempts.

Unavailable Ollama, a missing model (often HTTP 404), HTTP errors, timeouts (30 seconds for local), invalid JSON, unfinished/truncated output and an answer with no valid number leave posts visible. Categories with a missing, mistyped or out-of-range number never apply. Settings show the last error. Warm a cold model with `ollama run qwen3.5:4b-q4_K_M ""` and retry if loading exceeds the deadline. Cold-start performance is not guaranteed; long or multilingual posts may exceed the chosen context even with character bounds and then fail open. Local definitions longer than 6,000 characters in total are rejected rather than silently truncated.

## Memory and performance

The development MacBook Pro is **M4 Max with 48 GB unified memory**, confirmed with `system_profiler SPHardwareDataType`. This is installed capacity, not a promise that all of it is currently free. The M5 MacBook Air target is **16 GB**, supplied by the owner; that machine has not been inspected or measured here.

Planning estimates, pending measurement: allow roughly **4–7 GB** for the 4B model plus runtime and short-context buffers, and roughly **2–4 GB** for 2B. Leave headroom for Chrome, macOS and other apps; inspect Activity Monitor memory pressure and `ollama ps`. Both targets should be plausible for 4B at this short context; 2B is the fallback for pressure or poor responsiveness. This is an estimate, not a measured peak-memory guarantee. Do not use the model's advertised 256K context for feed classification. The Air's sustained latency and thermals remain unmeasured. No token-per-second or accuracy claim is made.

## Verification

```sh
cd linkedin-slop-filter-local
npm ci
npx playwright install chromium
npm test
npm run smoke:ollama
npm run smoke:extension
```

`npm test` is deterministic and mocked. `smoke:ollama` sends one synthetic post to the real local API and reports numeric score and latency. `smoke:extension` loads an unpacked extension in an isolated Chromium profile, intercepts LinkedIn navigation with a synthetic feed, and checks an actual background-worker request to the local model. Its ephemeral extension ID may need its own `OLLAMA_ORIGINS` entry if the service denies access. A successful result demonstrates direct worker-to-Ollama access; it is **not live LinkedIn verification** or a quality evaluation. No key or signed-in account is used. `OLLAMA_MODEL` and `OLLAMA_ENDPOINT` can override the smoke defaults in your local terminal.

To discover the smoke extension's origin before configuring the service, run `npm run smoke:extension -- --origin-only`. Its ID is determined by the unpacked extension path, so moving or recloning the folder can change it. You can run a second service on another loopback port with that exact origin instead of restarting an existing service, then pass the matching `OLLAMA_ENDPOINT` to the smoke command.

Use the [manual-label workflow](evaluation.md) before deciding a local threshold. Live LinkedIn selectors remain tracked in #1; real Jev/OpenAI calls in #2. Kev through its MLX runtime remains a possible later provider and is not implemented.

### Evidence from 9 October 2026

- Full deterministic suite passed: core/cloud handling, mocked service worker, local schema/queue/cache/switching/fail-open, evaluation metrics, syntax, Chromium synthetic feed and settings.
- Real API smoke on M4 Max 48 GB / Ollama 0.35.1 / `qwen3.5:4b-q4_K_M`: a synthetic technical post was judged useful (internal slop score 0), 264 prompt tokens and 13 output tokens. Total 3,927 ms, including 3,085 ms model load. One observation, not a benchmark.
- The unpacked worker initially received HTTP 403 from the default server because its extension origin was not allowed. It left the card visible. A separate server on `127.0.0.1:11435` with `OLLAMA_NO_CLOUD=1` and the exact smoke extension origin allowed returned a valid real classification (score 0), one request, 4,243 ms from navigation to result. The synthetic LinkedIn URL was intercepted; no signed-in feed was accessed. This proves the direct path works after origin configuration. The temporary server was stopped; the original service was preserved.
- Q4_K_M and `think:false` support were confirmed by the installed model metadata. Peak memory, warm throughput, M5 Air behaviour, calibration, false-positive rates on manually labelled real posts, real Jev/OpenAI calls and signed-in LinkedIn selectors remain unmeasured or unverified.
- The evaluation command completed a two-row **synthetic** corpus: one technical useful example stayed visible and one formulaic example folded with local confidence 0.95. Calls took 963 ms and 1,254 ms in that run. This checks the runner and metrics only; two constructed examples do not measure real-feed accuracy or comparative Jev performance.
- After integrating main's key tests, setup guide, per-post badges and persistent cloud cache, the full combined suite passed. The real unpacked-worker synthetic smoke passed again with one request and score 0 in 3,861 ms. Cloud cache storage and old cache keys are preserved; local cache entries remain session-only.

### Connection-test evidence from 10 October 2026

The new `verifyOllama` helper passed a real synthetic request to the existing service on `127.0.0.1:11434` using the downloaded `qwen3.5:4b-q4_K_M` model in 4,126 ms. This was a direct Node API check; it does not verify browser-origin access. The deterministic tests cover the Provider button with unsaved values and filtering paused, no credential header or settings/session writes, service errors, and rejection of stale results. The installed Brave extension and signed-in feed have not been updated or verified for this change.

### Installed Brave connection repair, issue #96

On 10 October 2026, the existing signed-in Brave installation’s local origin denial was repaired with macOS `launchctl` environment configuration: the exact installed extension origin, `OLLAMA_HOST=127.0.0.1:11434` and `OLLAMA_NO_CLOUD=1`. The existing Ollama application restarted with those values; no models were downloaded or removed. The allowed-origin tags check returned HTTP 200, an unrelated web origin returned HTTP 403, and the service listened only on 127.0.0.1. A synthetic request carrying the installed origin passed response validation, and the installed settings button displayed “Local Ollama works.”

A per-user login job, `~/Library/LaunchAgents/com.linkedin-slop-filter.ollama.plist`, runs `~/Library/Application Support/LinkedIn Slop Filter/configure-ollama.zsh` to restore this configuration at login. It leaves a healthy configured service running and restarts the existing macOS application when origin access is missing. The plist and shell syntax checks passed; the loaded job exited successfully. A subsequent full logout/login has not been exercised. This setup is local to the owner’s machine and does not grant wildcard origin or network access.

The signed-in For You feed then scored real posts through local Ollama and applied the merged immediate Hide behavior. Live reveal/re-hide, popup temporary recovery/restoration and feed discovery were verified; saved rules, credentials, selected people and corrections were preserved. See [feed release evidence](feed-experience.md) for the checks and their limits.
