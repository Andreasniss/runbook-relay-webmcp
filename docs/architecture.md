# Architecture

Runbook Relay is deliberately small: one deterministic state model powers the human interface, the browser-native WebMCP tools, and the labeled simulator.

```mermaid
flowchart LR
  A[Browser agent] -->|WebMCP tool call| B[Bounded tool contract]
  H[Human operator] -->|UI action| C[Shared React state]
  B --> C
  C --> D[Decision log and receipts]
  C --> G{Approval recorded?}
  G -->|No| X[Execution blocked]
  G -->|Yes| E[Simulated mitigation]
  E --> D
```

## Design decisions

- **One state model:** Human controls, native tool calls, and simulator calls use the same application state and audit surfaces.
- **Narrow tools:** Five operations separate reading, comparing, staging, executing, and resetting.
- **Fail-closed execution:** The execution tool cannot create approval. It checks approval recorded through the page.
- **Deterministic fixtures:** The incident, three mitigations, projected outcomes, and recovered telemetry are stable and resettable.
- **Visible evidence:** Tool receipts show caller, input, policy outcome, structured result, and timestamp.
- **Bounded agent surface:** A deterministic fixture budgets tool-definition size, structured-result size, and calls for the blocked-before-approval workflow.
- **No backend dependency:** The public demo changes no external system and uses no credentials.

The [agent interface efficiency note](agent-efficiency.md) documents the structural measurement and its limits. It reports UTF-8 bytes so the regression gate remains provider-independent. A model evaluation must add actual token usage, latency, retries, and verified outcomes.

## Production boundary

This is a browser-side reference implementation, not a production operations console. A production design would move authorization and execution server-side, bind actions to scoped identities, persist tamper-evident audit records, enforce idempotency, and validate live infrastructure state immediately before execution.
