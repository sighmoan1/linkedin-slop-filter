# Optional local Ollama provider

Development is tracked in [#22](https://github.com/sighmoan1/linkedin-slop-filter/issues/22) on `feat/22-local-ollama`. Jev remains the default. The installable Jev baseline is main commit `510f199d2e4e2d995b85c54c3eecaa789180d657`; use a separate clone so experimental work cannot affect that installation.

The initial model is the official [qwen3.5:4b-q4_K_M](https://ollama.com/library/qwen3.5/tags), a 4-bit GGUF model. The lighter option is `qwen3.5:2b-q4_K_M`. Local requests go directly from the extension worker to loopback Ollama. Neither a tunnel nor an API key is needed.

Implementation and verification are in progress. Do not interpret mock tests as live LinkedIn verification or model accuracy measurements. Kev through its MLX runtime is a possible later provider; it is outside this implementation.
