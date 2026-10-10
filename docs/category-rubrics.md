# Category rubric revision: 2026-10-10

The revised defaults judge the substance of extracted post text. They do not claim to detect AI authorship. Each category has an independent definition: an advert can also teach something useful, and a sincere personal update can match no category.

| Category | Positive evidence | Protected counterexamples |
| --- | --- | --- |
| Slop | Interchangeable platitudes, circular restatement, padded generic advice or a stock lesson without experience or an argument. Rhetorical tropes support the label only when they replace substance. | Useful explanations, evidence, grounded opinions, specific experiences, news, jobs, practical announcements, sincere milestones, grief and jokes. Punctuation, grammar, non-native phrasing, emojis or one trope are insufficient. |
| Brainrot | Empty reaction farming, coercive share/comment challenges, context-free meme repetition, unsupported outrage hooks or status rankings with little payoff. | Sincere humor, meaningful satire, celebrations, real news, supported criticism, substantive disagreement and relevant questions. Slang or strong emotion alone is insufficient. |
| Advert | A material commercial or promotional pitch, including free marketing lead magnets. | Neutral brand news, a brief incidental signature/link, job/grant openings and a purely charitable appeal. A useful tutorial with a material pitch can also be Nourishment. |
| Opportunity | A specific opening available to the reader, identifiable work and an application/contact route or deadline. Unpaid community contributions can qualify. | Closed/filled openings, the author's job celebration, paid-course sales, generic networking and vague future teasers. |
| Nourishment | A concrete explanation, usable method, supported argument, contextualised news or a transferable lesson shown in the post itself. | Sincerity, grief, celebrations, encouragement and job announcements alone. Absence of Nourishment never implies Slop or Brainrot. Short explanations and imperfect English can qualify. |

The complete frozen definitions are in [`tests/fixtures/rubrics/revised.json`](../tests/fixtures/rubrics/revised.json), matching `DEFAULT_CATEGORIES` and `DEFAULT_RUBRIC_VERSION` in `core/settings.mjs`. Every definition includes the untrusted-post guard. The five definitions fit both the 2,000-character per-category cap and the 6,000-character serialized local-rubric limit (5,349 characters). Custom categories share the same limits.

## Adoption and saved settings

Fresh installs and an explicit restore of default categories use revision `2026-10-10`. Existing saved definitions, including the previous unedited defaults, remain unchanged. Loading settings does not infer that an old definition should be replaced. Legacy Slop rules and custom category definitions remain intact during schema migration.

Restoring default categories is deliberate and can replace custom settings; review the settings-page preview before saving. Changing an instruction changes the scoring key, so scores from previous definitions are not reused. Actions and thresholds are unchanged by this rubric revision: Slop hides; Brainrot/Advert label; Opportunity/Nourishment highlight. Every category still supports every action, and a score must be **strictly greater** than its threshold. The default 80% cutoff has not been calibrated on the user's feed or any cloud provider.

## Recorded local evidence

The committed inputs are authored synthetic text, including useful text with a trope, non-native phrasing, harmless humor, grief, celebrations, job announcements, closed calls, useful promotions and prompt injection. No personal feed data, credentials, profile data or downloaded models are committed. The earlier and initial-draft definitions are archived alongside the final definitions so the recorded requests have identifiable rubrics.

The historical run used local Ollama `qwen3.5:4b-q4_K_M`, temperature 0, a 4,096-token context and the extension's same all-category schema and 2,000-character text limit. Development labels were authored before scoring. The draft was refined on those cases, then frozen before 12 fresh validation cases were authored and scored. No tuning followed validation. The author of the rubric also authored the cases and expected labels. The model tag is recorded; a model-weight fingerprint and hardware details were not recorded, so latency or a future live rerun is not guaranteed to reproduce exactly.

| Corpus | Previous defaults | Initial draft | Frozen revision |
| --- | --- | --- | --- |
| 24 development posts | 16 complete five-category matches | 19 matches | 22 matches |
| 12 fresh synthetic validation posts | 9 complete matches | Not run | 10 matches |

All 96 historical requests returned complete valid scores. These are small synthetic agreement counts, not representative or independent accuracy estimates. Slop false positives were zero under both previous and final definitions on these samples; the same development Slop miss remained. Most gains concerned Opportunity and Nourishment boundaries. Better Slop hiding, real-feed performance and Jev/OpenAI quality have not been established.

Remaining disagreements are retained in the row-level records:

- A reaction-bait development case expected to overlap Slop was labelled Brainrot only.
- A vague job teaser was still marked Opportunity.
- The fresh validation run missed Nourishment on a simple useful recommendation and on an explanation with a paid pitch.

The original annotations contain independent category decisions only, with no separate usefulness judgement. The report therefore shows usefulness metrics as unavailable rather than calling every non-Slop post useful. Under default Slop-only hiding, there were zero incorrectly hidden posts and one expected fold left visible in development for both previous/final rubrics; there were no fold disagreements in validation. Applying the explicit Less noise actions to the same archived scores produces no fold disagreements in either corpus for either rubric, because the missed Slop example still matches Brainrot. That observation is limited to these samples and chosen actions.

No cloud requests or signed-in LinkedIn checks were made for this change. Provider-request tests confirm that all three providers receive the same frozen definitions, which checks request construction rather than model quality.

## Reproduce the report without model calls

Run from the repository root:

```sh
npm run report:rubrics
```

This only reads the committed synthetic score archives. It prints per-category true/false positives/negatives, missing-score coverage, complete/partial/error counts and fold errors under the default and Less noise actions. Ambiguous cases are reported separately and excluded from quality counts. A failed or partial answer is never treated as a complete negative response. Missing scores never apply; service failures are reported separately from scored model misses.

The full archive is under [`tests/fixtures/rubrics/`](../tests/fixtures/rubrics/). `npm test` validates fixture integrity, frozen default compatibility, preserved saved definitions, strict threshold behaviour, action-based errors, and local-only evaluation boundaries. Tests replay evidence; they do not assert that a live model will achieve these agreement counts.

## Optional new local evaluation

The explicit local-only evaluator accepts a JSON corpus with a `cases` array. Label each case before seeing scores. Use opaque unique IDs and the same first 2,000 characters the model will see. Choose every applicable category independently, including an empty `yes` array when none applies. Optional `useful` annotations ask whether the post is worth retaining; optional `ambiguous` annotations keep unsettled cases out of quality counts.

```json
{
  "cases": [
    {
      "id": "sample-001",
      "text": "Synthetic: A tenant ID belongs in the cache key because two tenants can reuse the same user ID.",
      "yes": ["nourishment"],
      "useful": true
    }
  ]
}
```

Keep real or consented, redacted text in `.local-data/` (ignored by Git). Do not copy personal feed data into the committed fixtures. A rubric snapshot has the same `{ "version": "...", "categories": [...] }` format as the archived snapshots, including the user's actual actions and per-category thresholds.

```sh
npm run evaluate:categories -- .local-data/cases.json
npm run evaluate:categories -- .local-data/cases.json .local-data/rubric.json
```

The command only contacts a validated HTTP loopback Ollama endpoint with a downloaded local model. It rejects remote endpoints, cloud model tags, malformed corpora and oversized rubrics before sending anything. `OLLAMA_MODEL` and `OLLAMA_ENDPOINT` can select a different local setup. Calls are sequential, uncached and explicitly invoked; no extension feed collection or automatic learning occurs. Output includes opaque IDs, labels, scores, timing and a rubric hash, but no post text, keys, request bodies or raw provider errors. Request failures leave posts visible, are counted separately, and yield exit code 1. Invalid inputs yield exit code 2 before requests.

Compare wrongly hidden useful posts under the actual Hide actions, per-category errors, ambiguous cases and request coverage. Useful posts hidden by a category the annotation also matches are reported separately from incorrect folds. Freeze proposed definitions, actions and annotation policy before evaluating. Use a development subset for revision and a separate held-out subset once. Retain errors and disagreements. Test each provider/model separately at justified thresholds; local self-reported confidence is not a calibrated probability and cannot establish cloud performance. The older Slop-only cross-provider workflow remains documented in [`evaluation.md`](evaluation.md).

## Sources and interpretation

- [tropes.fyi](https://tropes.fyi/tropes-md) catalogs rhetorical patterns used here as supporting editorial clues, never a keyword blacklist or validated authorship classifier.
- [Merriam-Webster's Slop discussion](https://www.merriam-webster.com/wordplay/word-of-the-year) informs the focus on low-quality content. The extension cannot establish provenance.
- [Oxford's Brain rot discussion](https://corp.oup.com/news/brain-rot-named-oxford-word-of-the-year-2024/) informs the cultural sense of trivial online content; this operational feed rubric makes no medical claim.
- [Liang et al., *GPT detectors are biased against non-native English writers*](https://arxiv.org/abs/2304.02819) supports avoiding authorship claims based on style or linguistic fluency.
