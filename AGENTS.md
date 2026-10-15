<!-- BEGIN REGENT META GENERATED -->
## Repo Contract

Generated from `/Users/sean/Documents/regent/control/stack.yaml` and this repo's `repo.yaml`. Local notes may live outside this block.

- Repo contract: `ios/repo.yaml`
- Owner: `ios`
- Release group: `public_beta`
- Owned areas: `mobile_wallet`, `mobile_action_signing`, `mobile_regent_records`.
- Change API or CLI behavior in the owning YAML contract before changing code.
<!-- END REGENT META GENERATED -->
# Regents Mobile Agent Guide

This repo owns the iOS app and the repo-local backend for the mobile wallet path.

## Source Of Truth

- `layer2.md` defines this repo's ownership, boundaries, secret rules, and acceptance checks.
- `api-contract.openapiv3.yaml` is the source of truth for the mobile backend surface.
- `mobile-services-contract.openapiv3.yaml` records shared mobile service routes.
- `README.md` explains local setup and the current product reality.

## Core Rules

- The app may hold only public mobile configuration.
- Backend secrets stay in `server/` runtime configuration and must not move into the app bundle.
- Live wallet state, Platform state, product state, and chain state outrank preview Regent data.
- Push tokens, wallet tokens, access tokens, signing keys, and webhook secrets must stay out of logs and app bundles.
- Passkey work must account for native platform entitlement and domain requirements.
- Use `uv` for Python work if any is added.
- Never read `.env` files. `.env.example` is allowed.

## Validation

```bash
npm run test:app
npm run check:app
cd server && npm test
```

<!-- BEGIN REGENT ROLLOUT REVIEW -->
## Code Review Rules

### Human and agent guidance drift

For every code review, read `.agents/skills/rollout-guidance-check/SKILL.md` and assess the diff's guidance
impact, even when no prose files changed. Trace affected behavior into public docs,
product/developer Skills, human-to-agent prompts, tooltips and other UI copy,
WebMCP/MCP schemas and descriptions, CLI help/errors/examples, OpenAPI, manifests
and generated or bundled copies. Shared behavior starts in ash-template and its
libraries; inspect affected consumers when available.

Report concrete mismatches introduced or made relevant by this change, with the
failing user/agent action and exact source locations. Distinguish source, packaged,
published and deployed versions; name missing cross-repository or live evidence.
Preserve dated history and avoid cosmetic findings. Do not inflate severity or
claim that no findings proves complete coverage. This is read-only review: never
sign, pay, activate earnings, publish or deploy to test an instruction.
<!-- END REGENT ROLLOUT REVIEW -->
