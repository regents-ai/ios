# Regents Mobile Agent Guide

This repo owns the iOS app and the repo-local backend for the mobile wallet path.

## Regent Dependency Skills

The Regent dependency skills are installed in `/Users/sean/Documents/regent/.agents/skills` and `/Users/sean/.codex/skills`. Open the matching skill before touching these areas:

- `ios-wallet-stack`: Expo, Expo Router, Privy Expo, Coinbase CDP, passkeys, Redis, APNs/Expo notifications, mobile wallet flows, and mobile live/preview boundaries.
- `privy-auth-boundary`: mobile sign-in, Privy token verification, authenticated backend routes, and human-vs-agent auth boundaries.
- `safe-viem-wallet-actions`: viem, prepared wallet actions, chain reads/writes, ERC-20 calldata, and transaction confirmation.
- `contract-first-cli-api`: `api-contract.openapiv3.yaml`, `regent-services-contract.openapiv3.yaml`, backend route shape, and generated clients.
- `observability-promex-sentry`: logs, health checks, private-data redaction, and push or wallet event diagnostics.

## Source Of Truth

- `layer2.md` defines this repo's ownership, boundaries, secret rules, and acceptance checks.
- `api-contract.openapiv3.yaml` is the source of truth for the mobile backend surface.
- `regent-services-contract.openapiv3.yaml` records shared mobile service routes.
- `README.md` explains local setup and the current product reality.

## Core Rules

- The app may hold only public mobile configuration.
- Backend secrets stay in `server/` runtime configuration and must not move into the app bundle.
- Live wallet state, Platform state, product state, and chain state outrank preview Regent data.
- Use `uv` for Python work if any is added.
- Never read `.env` files. `.env.example` is allowed.

## Validation

```bash
npm run test:app
npm run check:app
cd server && npm test
```
