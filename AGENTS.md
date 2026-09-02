<!-- BEGIN REGENT META GENERATED -->
## Repo Contract

Generated from `/Users/sean/Documents/regent/control/stack.yaml` and this repo's `repo.yaml`. Local notes may live outside this block.

- Repo contract: `ios/repo.yaml`
- Owner: `ios`
- Release group: `public_beta`
- Owned areas: `mobile_wallet`, `mobile_action_signing`, `mobile_regent_records`.
- Change API or CLI behavior in the owning YAML contract before changing code.
- Use `bd` only for execution state: tickets, claims, blockers, dependencies, and closure evidence.
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
