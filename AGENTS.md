<!-- BEGIN REGENT META GENERATED -->
## Repo Contract

Generated from `meta/stack.yaml` and repo `repo.yaml` files. Local notes may live outside this block.

- Repo contract: `ios/repo.yaml`
- Owner: `ios`
- Release group: `public_beta`
- Owned areas: `mobile_wallet`, `mobile_action_signing`, `mobile_regent_records`.
- Change API or CLI behavior in the owning YAML contract before changing code.
- Use `bd` only for execution state: tickets, claims, blockers, dependencies, and closure evidence.
<!-- END REGENT META GENERATED -->
# Regents Mobile Agent Guide

This repo owns the iOS app and the repo-local backend for the mobile wallet path.

## Regent Dependency Skills

The Regent dependency skills are installed in `/Users/sean/Documents/regent/.agents/skills` and `/Users/sean/.codex/skills`. Open the matching skill before touching these areas:

- `ios-wallet-stack`: Expo, Expo Router, Privy Expo, Coinbase CDP, passkeys, Redis, APNs/Expo notifications, mobile wallet flows, and mobile live/preview boundaries.
- `privy-auth-boundary`: mobile sign-in, Privy token verification, authenticated backend routes, and human-vs-agent auth boundaries.
- `safe-viem-wallet-actions`: viem, prepared wallet actions, chain reads/writes, ERC-20 calldata, and transaction confirmation.
- `contract-first-cli-api`: `api-contract.openapiv3.yaml`, `mobile-services-contract.openapiv3.yaml`, backend route shape, and generated clients.
- `observability-promex-sentry`: logs, health checks, private-data redaction, and push or wallet event diagnostics.

## Source Of Truth

- `layer2.md` defines this repo's ownership, boundaries, secret rules, and acceptance checks.
- `api-contract.openapiv3.yaml` is the source of truth for the mobile backend surface.
- `mobile-services-contract.openapiv3.yaml` records shared mobile service routes.
- `README.md` explains local setup and the current product reality.
- `/Users/sean/Documents/regent/docs/dependency-surfaces/mobile-wallet-stack.md` is the shared internal guide for the mobile wallet dependency surface.
- `/Users/sean/Documents/regent/docs/shared-agent-dependency-map.md` is the cross-repo dependency map.

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
