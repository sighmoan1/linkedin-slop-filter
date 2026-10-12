# Compare rubric candidates

Run the same **held-out, independently labelled** local cases separately against a baseline rubric and a candidate rubric. The existing `evaluate:categories` command calls only a downloaded local Ollama model; the offline comparison command never contacts a provider.

This feature compares **fresh, independent** scores for each rubric. Reusing baseline scores after editing prompt definitions is invalid. It compares the same frozen case content using a content hash, labels, provider and model, and rejects incomparable runs.

## Record and compare

Keep real or consented, redacted cases in the git-ignored `.local-data/` folder. Do not commit these files, real post text or credentials.

```sh
npm run evaluate:categories -- .local-data/heldout.json .local-data/baseline-rubric.json > .local-data/baseline.ndjson
npm run evaluate:categories -- .local-data/heldout.json .local-data/candidate-rubric.json > .local-data/candidate.ndjson
npm run compare:rubrics -- .local-data/baseline.ndjson .local-data/candidate.ndjson .local-data/baseline-rubric.json .local-data/candidate-rubric.json
```

A candidate can be marked **eligible for human review**, never auto-applied. Reported scores are uncalibrated model estimates. Missing answers, failed requests, incomplete runs, fewer than 20 cases and too few explicit usefulness labels block a positive recommendation. The comparison rejects increased false hides or worsened protection of useful posts, including when total category accuracy increases.

A comparison of a small, chosen or synthetically authored corpus is not an estimate of actual LinkedIn performance. Freeze the corpus and its labels *before* inspecting candidate predictions; do not repeatedly tune against the held-out set. Keep a distinct development set for improving prompts. The metrics describe the selected cases and model, not all users or all providers.

**Privacy:** The comparison runs offline and writes aggregate results only. Evaluator output includes opaque case IDs, scores and configuration hashes, never source post text. Running either local evaluation deliberately sends the supplied post text to the configured loopback Ollama endpoint. It does not involve Jev or OpenAI, and does not change extension settings.
