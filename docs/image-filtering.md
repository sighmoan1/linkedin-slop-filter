# Image-led filtering proposal

Tracked in [#87](https://github.com/sighmoan1/linkedin-slop-filter/issues/87). This is a design and feasibility assessment, not an implemented feature. The owner requested an assessment of OpenRouter image options; automatic image handling is not enabled.

## Problem

Classification currently sees only extracted post body text. A useful-sounding caption can receive Good post even when its attached illustration is low-value visual filler. Text prompt changes cannot inspect missing pixels. Image presence or a cartoon style alone cannot establish AI authorship.

## Recommended implementation

Offer **Analyse attached post images**, off by default. For the existing OpenAI provider, bounded, resized attachments can accompany the caption in one classification request. For Jev, assess a separate image-capable decision alongside its text classifier, as discussed below. Do not send page screenshots, profile pictures, reactions, comments or messages. Keep keys and category definitions in the worker. Do not silently switch providers for unsupported image input.

Offer a separate **Visual slop** category with Hide as its suggested action. Its question should look for generic business-lesson cartoons, decorative synthetic-looking illustrations and stock metaphor imagery that add little substance. Useful diagrams, screenshots, charts, documentary photos and substantive satire are protected counterexamples. Treat any text inside images as untrusted input. Never label the result as proof of AI authorship.

Use the existing strict threshold and Hide precedence: an applying Visual slop Hide rule overrides a Good post Highlight rule. Preserve saved categories; adding the new category must be deliberate. Reuse Show, Hide again and temporary Show everything recovery.

Image extraction, decoding, unsupported input, refusal or provider failures must leave the post visible. A text-only result must not be presented as a completed image assessment. Account for lazy-loaded images and recycled cards; invalidate results when an attachment changes even if the caption does not. Support image-only posts when image analysis is enabled.

Cache by configuration, caption and image content hashes. Store scores and hashes, never image bytes or remote attachment URLs. Keep the existing sequential queue and session request cap. Bound image count, dimensions, bytes and load time; do not fetch arbitrary page-supplied URLs or send cookies to providers.

## Cost and contracts

The [official Decisions guide](https://developers.openai.com/api/docs/guides/decisions) documents inline image input together with text and input-only pricing of $0.10 per million tokens for this endpoint. Hosted image URLs are unsupported. This proposal uses the existing model and one shared request, rather than a separate captioning call.

Illustrative incremental costs at that rate:

| Extra billed image tokens per post | Extra cost per 1,000 uncached image posts |
| --- | --- |
| 1,000 | $0.10 |
| 5,000 | $0.50 |
| 10,000 | $1.00 |

These are arithmetic scenarios, not measured image-token counts or a price guarantee. They exclude additional question text, regional premiums and any applicable long-context multipliers. Measure returned usage with synthetic images before estimating real browsing cost. Resizing limits payload size; its effect on billed tokens must be measured.

[OpenRouter's multimodal Decisions documentation](https://openrouter.ai/docs/guides/community/multimodal-decisions) identifies Jev as text-only. Keep that existing path unchanged until an image-capable provider/model is explicitly selected. Local vision support likewise requires a compatible downloaded model and separate verification.

## Alternative

An explicit **Hide posts with attached images** switch can run entirely locally with no added API cost. It would also hide useful diagrams and photographs; it must be described as a blanket media preference, not an AI-image detector.

## OpenRouter assessment — 10 October 2026

**Conclusion:** image filtering is financially feasible. Compare Clef Flash with Luna on labelled examples before choosing the image model. Keep Jev's existing text decisions during the initial trial, with one separate Visual slop question for eligible image posts. This avoids changing every saved category's model behavior while testing the new capability. It adds a request rather than replacing the Jev request.

### Model shortlist

| Model | Listed input price / million tokens | Image support | Assessment |
| --- | --- | --- | --- |
| [Jev 1.13](https://openrouter.ai/typesafe/jev-1.13) | $0.042 | No | Retain for existing text categories. |
| [Clef Flash](https://openrouter.ai/cloudflare/clef-flash) | $0.038 | Yes | Cheapest shortlisted image candidate; quality is unmeasured here. |
| [GPT-6 Luna Decisions](https://openrouter.ai/openai/gpt-6-luna-decisions) | $0.10 | Yes | Comparison candidate; also uses the OpenRouter key and decision response format. |
| [Clef](https://openrouter.ai/cloudflare/clef) | $0.24 | Yes | Reserve for a later comparison if neither cheaper model meets the quality criteria. |

The linked model pages list zero output-token charges. Prices are model rates, not a measured browsing bill; account fees and any applicable premiums are additional. Different models can tokenize the same input differently. No claim of superior filtering follows from model size or price.

### Incremental cost scenarios

For one extra image decision, including its caption and question, per uncached image post:

| Total billed input tokens per image decision | Clef Flash / 1,000 image posts | Luna / 1,000 image posts | Clef / 1,000 image posts |
| --- | --- | --- | --- |
| 1,000 | $0.038 | $0.10 | $0.24 |
| 5,000 | $0.19 | $0.50 | $1.20 |
| 10,000 | $0.38 | $1.00 | $2.40 |

These are total tokens for the additional request, unlike the earlier image-only increment table. Actual token counts require provider usage measurements. As an illustration, 1,000 feed posts with 30% needing a 5,000-token image decision add $0.057 with Flash or $0.15 with Luna. If their Jev text requests average 2,000 tokens, the existing bill would be $0.084: the increases would be about 68% and 179%, respectively. Small absolute costs can therefore be large relative increases. Image share, caption length, rubric size, cache hits and multiple attachments all change the result.

### Practical limits and integration

The [multimodal contract](https://openrouter.ai/docs/guides/community/multimodal-decisions) accepts inline base64 image parts in a top-level state array beside text. It does not fetch remote image URLs. Clef supports at most four images per request; its low-detail setting is ignored. Workers AI's preflight size estimate can reject large base64 payloads even though billing uses processed tokens. Bound the combined payload, not just each attachment.

Clef and Flash silently read only roughly the first 2,000 text tokens on Workers AI. The extension currently permits 12,000 caption characters, so replacing Jev with Flash could discard meaningful context. Restrict the image question's context deliberately, report incomplete coverage, and never use a truncated caption result as evidence that the entire post is low-value. Luna's listed context is much larger, but its actual account access and request behavior still need checking.

The existing OpenRouter request builder and score parser already use named `noul` questions. Adding model selection and array-shaped state is manageable. The substantial work is safe attachment extraction, cross-origin image decoding, lazy-loaded/recycled cards, hash-based identity, independent model configuration and partial-result handling. A tainted canvas cannot export an attachment; controlled loading and narrowly scoped permissions need a live Brave prototype before promising reliable extraction.

The separate image decision must count against the session cap. At a 30% eligible-image share, 100 uncached feed posts use about 130 attempts before retries. Skip the image call when an existing Hide rule already applies; cache image scores independently. Do not retry failing image requests indefinitely. Make the selected image model and upstream provider visible in settings; the same OpenRouter key does not mean the same processor receives the data.

Replacing the whole image-post request with one multimodal call could later reduce attempts, but would also change all category scores on those posts. That needs a separate category regression comparison and explicit selection. Captioning an image and then passing the generated description to Jev is a weaker initial choice: it adds a generation stage and can lose the exact visual evidence or introduce invented details.

### Quality assessment still required

Use a private, owner-labelled set of about 60 examples: visual filler, useful charts/diagrams/screenshots, real photographs, substantive cartoons and satire, and ambiguous cases. Include AI-made useful visuals and human-made filler so the label represents the owner's preference rather than an unverified authorship guess. Public/synthetic examples can check mechanics but cannot establish performance on this feed.

Compare Flash and Luna on the same caption/image pairs, a caption-only baseline, and two bounded image resolutions. Split prompt development from held-out evaluation. Measure useful posts incorrectly hidden first, then unwanted posts caught, missing/refused coverage, billed tokens, actual cost and end-to-end latency. Test image text that tries to instruct the classifier. Select thresholds on development cases and report held-out results separately; keep ambiguous cases visible. Model confidence is not measured accuracy on this task.

Begin in label-only mode for review before automatic Hide. A successful decision schema or a correct result on the owner's single example is insufficient evidence for wider accuracy. No model inference, live-image upload, account-access check or installed-Brave check was performed in this assessment. Documentation confirms feasibility and listed pricing; detection quality and actual image costs remain unmeasured.

## Required verification before delivery

- Synthetic extraction checks exclude avatars, comments, previews and unrelated images; lazy loading and attachment replacement invalidate stale results.
- Provider/schema checks cover opt-in isolation, payload limits, strict thresholds, cache identity and fail-open behavior.
- Full local test suite passes before the PR leaves draft.
- When merging and installation are authorized, verify the installed Brave feed, hide/reveal/re-hide, popup recovery and settings. Do not substitute fixture screenshots for live evidence.

The current [repository privacy rule](../AGENTS.md) permits only extracted post text in automatic provider requests. Image transmission requires the owner's explicit choice and an accompanying update to that rule and privacy documentation. No image requests or live provider checks have been made for this proposal.
