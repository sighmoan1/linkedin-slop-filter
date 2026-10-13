# Scrolling latency experiment

Run from the repository root, with Node 20 or later. This standalone script does not change the extension or saved settings. Its five synthetic posts contain no live feed data. It uses the current five-category default rubric and identical text (maximum 2,000 characters) for each variant. It sends one request per post containing every category. No extension score cache is used.

```sh
node tests/scroll-benchmark.mjs
node scripts/benchmark-scroll.mjs ollama,tev1 10 > /tmp/scroll-local.json
# Set OPENAI_API_KEY and OPENROUTER_API_KEY locally first; never paste keys into chat.
node scripts/benchmark-scroll.mjs jev,openai,responses 10 > /tmp/scroll-cloud.json
```

Cloud invocation explicitly makes billed requests; the second command sends only synthetic inputs. Maximum total attempts per invocation is 100; default is 10 attempts per variant. Missing requested cloud credentials abort before any calls. Errors consume attempts and are retained as errors. Provider error bodies and exception text are never printed. Requests time out at 20 seconds for cloud Decisions and 30 seconds for local models and Responses. No retries are made. Output contains scores and timing, never post text, raw provider responses or keys.

Variants: `ollama` uses the extension's Qwen structured chat request; `tev1` uses Ollama `/v1/systemone`; `jev` and `openai` use the extension's Decisions requests; `responses` uses the regular OpenAI Responses generation API, structured scores and the same system/user messages as Qwen. Responses defaults to `gpt-6-astra`, reasoning `low`, `store:false`, and a 2,048 output-token cap including reasoning. An incomplete response is an error, never a successful fast classification. Adjust `OPENAI_MODEL` and `OPENAI_REASONING` explicitly and preserve the report. A useful additional control is `OPENAI_MODEL=gpt-6-luna OPENAI_REASONING=none`: comparing Luna Responses with Luna Decisions reduces the model-family confound, although internal serving remains different.

Local overrides: `OLLAMA_ENDPOINT` (validated loopback HTTP origin), `OLLAMA_MODEL`, and `TEV_MODEL`. Run variants sequentially so local models do not compete concurrently for the GPU. Model residency can still affect loading; the first request is not guaranteed cold. Ollama's reported load, prompt and generation durations are recorded where present, but a System One response may not expose these fields. Repeated synthetic cases and shared prefixes can benefit from provider prompt caches. Rubric/corpus hashes identify matching evidence; retain the entire report.

Reports distinguish complete, partial and unsuccessful attempts. p50/p95 request latency includes only complete answers; queue replay includes time spent on failures as well. The replay schedules a fresh uncached post every 500, 1,000 or 2,000 ms into one sequential queue, matching the extension's current concurrency of one. Its deadline is the arrival interval. It reports complete decisions by deadline, p95 delay including queue wait, and remaining backlog. This is a timing estimate, not a measured browser scroll trace. It excludes browser discovery, settings/storage, network retries and fold rendering; cached feed posts may be faster.

A fast first token is insufficient: folding requires the completed usable category scores. A useful frontier test therefore asks only for scores, not prose. [OpenAI's latency guide](https://developers.openai.com/api/docs/guides/latency-optimization) describes output length, model speed and request parallelism as separate contributors. [Structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs) supplies the Responses JSON contract. [Ollama's decision guide](https://github.com/ollama/ollama/blob/main/docs/capabilities/decision.mdx) documents the local System One contract.

## Using keys saved in Brave

Generate credential-free console code with `node scripts/benchmark-brave-console.mjs > .local-data/brave-console.js`, then paste its contents into DevTools Console on the installed extension’s `options.html` page. The runner reads only the saved provider keys and Ollama configuration inside that trusted extension context, makes 10 synthetic calls for each of Qwen, Jev Decisions, OpenAI Decisions, Astra Responses (low reasoning) and Luna Responses (none), and prints safe summaries. It bypasses the extension’s ordinary cache and session counter, with its own fixed 50-attempt cap. It changes no saved settings. `window.__lsfBench130.report` contains only safe scores, timing and provenance; keys remain in the asynchronous function’s local scope. The generator reuses the benchmark core, so request and result handling match the CLI. No browser profile file access or exporting keys is required. Do not run this code on a LinkedIn page or another website.

## Initial local evidence, 13 October 2026

Five attempts per model on the owner's Mac, all five default categories, all complete. Qwen `qwen3.5:4b-q4_K_M`: first 6,280 ms, subsequent median 2,292 ms, overall median 2,360 ms, p95 6,280 ms. Tev1 `tev1:latest`: first 11,729 ms, subsequent median 3,622 ms, overall median 3,650 ms, p95 11,729 ms. These nearest-rank percentiles on five samples are exploratory; p95 is simply the maximum. First attempts include model loading and must not be described as steady-state latency.

Neither local configuration met even the 2,000 ms replay deadline on any attempt in this short run. That does not establish that decision models are slower: the local models differ in weights and quantization (Qwen Q4 versus Tev1 Q8), and the endpoint implementations differ. This run cannot establish frontier performance, accuracy, false hides, causality, or installed Brave behavior. Cloud credentials were initially unavailable in the shell; the installed-Brave comparison below subsequently used the saved keys successfully. No live LinkedIn data was collected. Issue #128 separately tracks labelled quality comparison.

## Installed-Brave synthetic API comparison, 13 October 2026

The owner authorized all four provider comparisons using keys saved in Brave. Requests ran directly in the installed extension’s trusted options-page context; keys never left that context except as authentication to their own provider. Five synthetic posts were repeated twice, all five default categories were asked on every request, and the full report’s corpus/rubric hashes match the initial local run. No settings, correction records, provider selection or saved credentials were changed. There were 50 attempts including the extra Luna Responses control, all complete with five valid scores; no partial answers or errors. This tests real provider calls from installed Brave, not live LinkedIn scrolling or filtering quality.

| Configuration | Median complete request | p95 (10 samples) | On time at 1 post/second | On time at 1 post/2 seconds |
| --- | ---: | ---: | ---: | ---: |
| Jev Decisions (`typesafe/jev-1.13`) | 255 ms | 419 ms | 10/10 | 10/10 |
| OpenAI Decisions (`gpt-6-luna`) | 379 ms | 1,876 ms | 5/10 | 10/10 |
| Luna Responses, reasoning none | 1,420 ms | 1,786 ms | 0/10 | 10/10 |
| Local Qwen (`qwen3.5:4b-q4_K_M`) | 2,301 ms | 3,657 ms | 0/10 | 1/10 |
| Astra Responses, reasoning low | 2,804 ms | 3,824 ms | 0/10 | 0/10 |

On-time counts are sequential queue replays with a deadline equal to the arrival interval. They include the first attempt, not just warm requests. Jev also met all 10 deadlines at a 500 ms arrival interval. OpenAI Decisions met none of those 500 ms deadlines: its initial slow requests caused a backlog despite a 379 ms median. This is why median latency alone does not establish scrolling speed. Qwen was already resident (reported initial load 7 ms), while the initial local-only run included seconds of loading.

For this configuration, the ordinary frontier generation API did not keep up with one new uncached post every two seconds. The hosted decision APIs were faster than the local chat model, so locality is not necessary for the observed speed. Luna Decisions’ median was about 3.7 times faster than Luna Responses; this reduces the model-family confound and supports the decision serving path as a contributor. It does not isolate network, prompt structure, model variant, scheduling, precision or inference implementation. Decisions and generation scores are also not calibrated equivalently. No quality ranking follows from the timings.

A frontier model might keep up with slower arrival, prefetching or parallel requests, but those conditions were not tested and the extension currently runs requests sequentially. Ten samples per configuration, repeated inputs, shared prefixes, unknown server prompt-cache state, and ordinary activity on the owner’s Mac limit generalization. At n=10, nearest-rank p95 is the observed maximum. The full safe report is retained locally in the worktree at `.local-data/scroll-brave-20261013.json`; no private feed text or credentials appear in it.
