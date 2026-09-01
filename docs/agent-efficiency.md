# Agent interface efficiency

Runbook Relay keeps a deterministic budget for the agent-facing contract used by its blocked-before-approval proof. The measurement covers the five tool definitions plus the inputs and structured results of the four-call workflow.

Run it with:

```bash
npm run measure:agent
```

The gate verifies three things:

- the measured tool catalog still matches the application;
- the workflow still reaches the expected safe outcome; and
- definitions, results, and call count remain inside explicit structural budgets.

The script reports UTF-8 bytes, not model tokens. Token counts vary by provider, model, tokenizer, and message wrapper. A production evaluation should record provider-reported input and output tokens, latency, retries, and the verified task outcome for every run.

This fixture is a regression guard for interface growth. It is not a model benchmark and does not prove that a browser agent will select the right tools. Native agent trials remain necessary to measure selection accuracy, retries, latency, and tokens per verified outcome.
