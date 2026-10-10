# Image-led filtering proposal

Tracked in [#87](https://github.com/sighmoan1/linkedin-slop-filter/issues/87). This is a design proposal, not an implemented feature. The owner's choice of image handling is pending.

## Problem

Classification currently sees only extracted post body text. A useful-sounding caption can receive Good post even when its attached illustration is low-value visual filler. Text prompt changes cannot inspect missing pixels. Image presence or a cartoon style alone cannot establish AI authorship.

## Recommended implementation

Offer **Analyse attached post images**, off by default, initially for the existing OpenAI Decisions provider. Send bounded, resized copies of actual post attachments alongside the caption in one classification request. Do not send page screenshots, profile pictures, reactions, comments or messages. Keep keys and category definitions in the worker. Do not silently switch providers for unsupported image input.

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

## Required verification before delivery

- Synthetic extraction checks exclude avatars, comments, previews and unrelated images; lazy loading and attachment replacement invalidate stale results.
- Provider/schema checks cover opt-in isolation, payload limits, strict thresholds, cache identity and fail-open behavior.
- Full local test suite passes before the PR leaves draft.
- When merging and installation are authorized, verify the installed Brave feed, hide/reveal/re-hide, popup recovery and settings. Do not substitute fixture screenshots for live evidence.

The current [repository privacy rule](../AGENTS.md) permits only extracted post text in automatic provider requests. Image transmission requires the owner's explicit choice and an accompanying update to that rule and privacy documentation. No image requests or live provider checks have been made for this proposal.
