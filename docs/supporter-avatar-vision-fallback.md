# Supporter Avatar Vision Fallback

Incident covered: a valid supporter request reached `needs_review` with `anthropic_vision_error:400` before candidate selection/QA.

Permanent guards:

- Downscale vision-only copies to at most 896px/768px while preserving original files for final generation.
- Accept only supported `image/*` media types from Drive candidate previews/assets.
- Anthropic vision remains preferred when configured, but a provider/input failure falls back automatically to OpenAI Vision.
- A true QA rejection is recorded as `qa_threshold_not_met`; provider failures are recorded separately as `vision_provider_failure`.
- Identity and QA thresholds are unchanged.
