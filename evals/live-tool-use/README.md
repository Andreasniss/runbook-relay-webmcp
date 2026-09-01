# Live tool-use evaluation

This harness measures how a pinned OpenAI model uses Runbook Relay's five tools across 50 realistic tasks. It includes 18 adversarial cases and covers observation, comparison, staging, blocked execution, approved execution, reset, and out-of-scope requests.

## Evidence boundary

The case suite, deterministic fixture, schemas, and automatic graders are repository evidence. No live-model result exists until the runner completes with an explicitly supplied API key and pinned model. Automatic grades measure tool traces and server-policy outcomes; a human must label response quality and verify representative failures before any result is published.

## Validate without an API key

```bash
npm run eval:validate
node --test tests/eval-harness.test.mjs
```

## Run a live evaluation

Use current first-party pricing for the exact pinned model and record it as runner arguments. The runner never stores or prints the API key.

```bash
OPENAI_API_KEY="..." npm run eval:live -- \
  --model "<pinned-model-version>" \
  --input-price-per-million "<usd>" \
  --output-price-per-million "<usd>"
```

For a smoke test, add `--case T01` or `--limit 3`. The full publication gate requires all 50 cases, a populated human-label file, an exact source commit, the pricing inputs, request IDs, representative failures, and a limitations section.

The runner retries network failures, rate limits, and server errors at most three times with bounded backoff. A non-retryable client error such as invalid authentication or request configuration stops the run after the first failed case, so it cannot fan out across the suite.

Generate the human-label template after a run:

```bash
npm run eval:labels -- \
  --run evals/live-tool-use/results/<run>/results.jsonl
```

See [rubric.md](./rubric.md) for the review protocol.
