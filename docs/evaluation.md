# Compare local filtering with Jev

Keep the labelled corpus and results in `.local-data/` (ignored by Git). Never commit personal feed data, keys or downloaded models. Use opaque IDs rather than names or links. Start with synthetic or consented, redacted posts; selecting Jev sends their text to OpenRouter.

1. Label posts **before** seeing provider scores. Use `useful` or `slop`; keep ambiguous cases separately. Include concrete technical explanations, specific experiences, jobs, news and substantive opinions alongside formulaic engagement bait. Record the label definition and adjudicate disagreements. Use the same first 2,000 characters for both providers; do not label information that was truncated away.
2. Save one JSON object per line in `.local-data/labels.jsonl`, for example:

   ```json
   {"id":"sample-001","label":"useful","text":"Synthetic: Adding a composite index reduced query time from 240 ms to 38 ms."}
   {"id":"sample-002","label":"slop","text":"Synthetic: Success is a mindset. Believe in yourself. Keep winning. Agree?"}
   ```

3. Freeze the same rubric and corpus for both runs. The default extension rubric is used unless `SLOP_RUBRIC_FILE=.local-data/rubric.txt` is set in the local environment. Custom local rubrics must fit the 1,200-character limit. Run sequentially:

   ```sh
   npm run evaluate -- ollama .local-data/labels.jsonl 80 > .local-data/local-results.txt
   read -rs 'OPENROUTER_API_KEY?OpenRouter key (hidden): '; echo
   export OPENROUTER_API_KEY
   npm run evaluate -- jev .local-data/labels.jsonl 80 > .local-data/jev-results.txt
   unset OPENROUTER_API_KEY
   ```

   The Jev run makes billed real calls. `OLLAMA_MODEL=qwen3.5:2b-q4_K_M` selects the lighter local model. Each run prints JSON result rows without post text, followed by a summary. No request bodies, keys or reasoning are logged. Calls are serial and uncached to measure each post. Errors are recorded as left visible and yield exit code 1; inspect coverage before comparing providers. Invalid dataset or missing key exits 2 before any request.
4. Compare **usefulWronglyHidden / useful** first. Also report the precision of hidden posts, slop left visible, total/valid/error counts, sample size, model/tag, rubric, cutoff, machine and cold/warm latency. `slopLeftVisible` includes service errors; separate those when interpreting model misses. Do not treat a provider that failed every request and hid nothing as accurate.
5. Explore thresholds on a development subset, then evaluate once on a held-out set. The same numeric cutoff is only an initial comparison: local self-reported confidence and Jev probability are different signals and need separate threshold choices. Retain strict **above** comparisons, so exactly 80% remains visible. Inspect useful false positives by category and prefer settings that preserve useful posts. A two-post synthetic smoke is not an accuracy estimate.

Keep corpus, row-level results and rubric private. Post aggregate counts and redacted error categories in issue #3, explicitly separating synthetic from real posts. No live evaluation or provider quality comparison has been performed by adding this workflow.
