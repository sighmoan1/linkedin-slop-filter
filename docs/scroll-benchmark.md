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

## Initial local evidence, 13 October 2026

Five attempts per model on the owner's Mac, all five default categories, all complete. Qwen `qwen3.5:4b-q4_K_M`: first 6,280 ms, subsequent median 2,292 ms, overall median 2,360 ms, p95 6,280 ms. Tev1 `tev1:latest`: first 11,729 ms, subsequent median 3,622 ms, overall median 3,650 ms, p95 11,729 ms. These nearest-rank percentiles on five samples are exploratory; p95 is simply the maximum. First attempts include model loading and must not be described as steady-state latency.

Neither local configuration met even the 2,000 ms replay deadline on any attempt in this short run. That does not establish that decision models are slower: the local models differ in weights and quantization (Qwen Q4 versus Tev1 Q8), and the endpoint implementations differ. This run cannot establish frontier performance, accuracy, false hides, causality, or installed Brave behavior. Cloud credentials were unavailable in the shell; Jev, OpenAI Decisions and frontier Responses have not been run by this experiment. No live LinkedIn data was collected. Issue #128 separately tracks labelled quality comparison.
