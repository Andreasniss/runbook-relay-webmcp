# Deterministic control-plane evidence

Run the production execution policy and SQL against a fresh, transactional local SQLite database. Each scenario starts with the real migrations and calls `db/control-plane.ts`; this suite does not reproduce its approval rules in a second fixture.

```bash
# Node 22.16+ or Node 24; no npm install, credentials, server or network needed
node --experimental-transform-types evals/control-plane/run.mjs
# After npm setup, equivalent command with an optional machine-readable report
npm run eval:control-plane -- --output outputs/control-plane.json
```

Create the output directory first if it does not exist. JSON goes to stdout by default; a failed assertion produces a nonzero exit. The report identifies the exact source Git blobs and SHA-256 hashes, dirty-tree status, runtime, case results and limitations. `checkoutAtRun.commit` is informational: squash merges can rewrite it, so it is not a durable source reference. For a committed candidate, run from a clean working tree and save output outside the repository or under an ignored output directory. The checked-in [verification snapshot](verification.json) identifies its exact evaluated source hashes; use a fresh run to verify a changed revision.

## Verify after a squash merge

```bash
node evals/control-plane/verify-snapshot.mjs
# Or resolve the source from a retained historical commit
node evals/control-plane/verify-snapshot.mjs <retained-commit>
```

The verifier includes every SQL migration loaded by the adapter, detects migration-set changes, and reads each required source file from the selected commit and compares both its Git blob ID and SHA-256 with the snapshot. These blobs remain reachable from the merged tree even when the original PR commit disappears. It never needs `checkoutAtRun.commit`, and fails for changed or incomplete source sets. The snapshot excludes itself from its source set to avoid a self-referential hash. A match establishes source identity; re-running the scenarios still provides the behavior check.

## Claim to check

| Case | Observable assertion |
|---|---|
| C01 | No approval: blocked receipt, zero executions |
| C02 | Changed proposal: earlier approval rejected, new proposal unapproved |
| C03 | Old execution request: rejected even after approving the new proposal |
| C04 | Exact approval expiry: rejected |
| C05 | Separate session: cannot reuse another session's approved request |
| C06 | Exact approval: one execution, approval consumed |
| C07 | Same key with conflicting version: rejected |
| C08 | Response lost after commit: snapshot locates prior request; retry returns stored result; one execution |
| C09 | Partial failure: replay preserves recovery-required result |
| C10 | Action applied: synthetic health still outside target, monitoring continues |
| C11 | Concurrent identical calls: one execution row, a replay receipt |

Every case also verifies the resulting receipt contents and chain. The local adapter's rollback behavior has a separate test. Run both through `node --test tests/control-plane-integration.test.mjs`; they also run in the normal `npm test` gate.

## What this adds

The existing [50-task model harness](../live-tool-use/README.md) has its own deterministic fixture. Its traces can evaluate model tool selection, but cannot establish that production SQL enforces the same policy. This suite exercises that implementation directly, including durable execution rows and atomic approval consumption. It closes a specific evidence gap without turning deterministic checks into a model benchmark.

The response-loss scenario discards the response **after** the operation commits, then reads the stored replay binding. This verifies reconciliation for an unknown client outcome in that precise failure window. It does not simulate an interrupted transaction, an external service timing out before commit, or exactly-once effects across two systems. Never infer that retrying an arbitrary external action is safe from this result.

## Limits

- SQLite executes real SQL, with transactions and foreign keys. The small D1 adapter is not a complete D1 emulator; network behavior, multi-region concurrency and deployed Cloudflare behavior remain untested here.
- The route, origin checks, cookies, browser UI and native WebMCP discovery are outside this runner. The production application uses them, but these results do not verify them.
- The approval helper represents a synthetic human event in test setup. No agent tool gains approval capability. The demo's session identity still does not authenticate a human or an enterprise role.
- External actions and health are synthetic. “Executed” and “service recovered” remain distinct. No live model, independent recovery probe or production infrastructure was invoked.
- Source hashes bind the report to inspected code; they are not an independently signed attestation.

## Attribution

The extension follows the tool-and-memory learning path in Maarten Grootendorst and Jay Alammar's [An Illustrated Guide to AI Agents companion repository](https://github.com/HandsOnLLM/An-Illustrated-Guide-To-AI-Agents). Its original contribution here is reproducible evidence for Runbook Relay's existing execution boundary. No companion code or artwork was copied. Andreas owns the requirements and evaluation criteria; AI tools assisted implementation and documentation.
