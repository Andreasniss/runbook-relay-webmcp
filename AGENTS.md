# Public contribution instructions

Read `PRIVACY.md` before preparing any public commit or PR. Keep private authoring outside this repository. Run the staged and outgoing-commit privacy checks before Git or API uploads, and preserve intentionally public upstream examples and engineering evidence.

## Reusable delivery skill

For implementation and review work, read [AI SDLC Skill](skills/ai-sdlc-skill/SKILL.md). Preserve the requirements above and existing authorization; the skill adds no merge or deployment authority. Repository-specific checks are in `delivery-checks.json`.

## Route the task

| Change | Load next | Evidence boundary |
| --- | --- | --- |
| Local setup or contribution | README.md, CONTRIBUTING.md | Use the declared package scripts; a running page is not a control-plane test |
| Tool or policy behavior | docs/architecture.md, docs/threat-model.md, [control-plane evals](evals/control-plane/README.md), [live-tool evals](evals/live-tool-use/README.md) | Keep native discovery, simulator behavior and server policy evidence distinct |
| Agent-efficiency claims | docs/agent-efficiency.md | Preserve the named tasks, baselines and measured limits |
| Hosting | docs/hosting.md | Confirm the actual target and live checks; repository edits alone do not deploy |
| Dependency security | docs/dependency-security.md, SECURITY.md | Preserve the declared threat and disclosure boundaries |

For guide changes, apply the [shared standard](https://github.com/Andreasniss/ai-sdlc-skill/blob/316d33686aa9bd89324078ed02cc0d2e4bcc87b2/CONTRIBUTING.md#maintain-guides)
and update the owning document instead of copying its procedure here.
