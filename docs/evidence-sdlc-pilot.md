# Evidence SDLC pilot

Status: local repository pilot passed, 2026-09-06. Hosted CI and publication are tracked by the delivery PR.

Andreas authorized a reusable delivery skill and pilots in 7DayFocus and Runbook Relay. This pilot adopts the independently written `skills/evidence-sdlc` bundle from 7DayFocus with repository-owned commands. No third-party community skill implementation is included.

Intent: preserve Runbook Relay's lighter planning process, CI and privacy checks while making verification and review evidence explicit. The skill's material-change path applies to this integration; a future small reversible edit can use the quick path where repository rules permit.

Design and plan: add the portable bundle, link it from existing instructions and README, run its behavior tests in existing CI, and configure lint, types, eval-structure validation, application tests and build. Existing deployment workflows and application approval behavior are unchanged. Do not run credentialed model evaluations or deploy as part of this pilot.

Observed local result at `31748492e82c73d2c1a1018964f3b6cf1032d49a`: 12 skill tests, lint, type checking, eval structure, application tests and production build passed, with a clean revision before and after each configured command. The final documentation commit is verified separately in hosted CI. This pilot tests repository integration and deterministic helper behavior, not measured delivery speed or live-model quality. A copied bundle is not proof of automatic runtime discovery; read the adoption guide before installing it in Claude Code or Codex.

## Review and limitations

Independent agent review ran the 12 helper tests and additional isolated probes. It found one wording overclaim about continuous cleanliness; the guide now explicitly limits observation to command endpoints. The reviewer confirmed the correction. Workflow-depth and approval scenarios were textual walkthroughs, not measured autonomous agent runs. No outstanding findings from that review remained.

The two pilots establish repository integration and deterministic behavior only. They do not establish fewer interruptions, faster delivery, lower defect rates, or live Claude Code/Codex invocation compatibility. A future bounded feature change can measure those outcomes before broader rollout.
