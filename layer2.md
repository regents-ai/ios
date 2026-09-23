<!-- BEGIN REGENT META GENERATED -->
## Layer 2 Generated View

Summary of this repo's `repo.yaml`. Local notes may live outside this block.

- Owner: `ios`
- Release group: `public_beta`
- Required for public beta: `true`
- Owned areas: `mobile_wallet`, `mobile_action_signing`.

Contracts:
- `ios_api` (api, owner `ios`): `api-contract.openapiv3.yaml`
- `ios_mobile_services_api` (api, owner `ios`): `mobile-services-contract.openapiv3.yaml`

Acceptance checks:
- `ios`: `npm run check:app`
- `ios`: `npm run test:app`
- `ios/server`: `npm test`
<!-- END REGENT META GENERATED -->
# iOS Layer 2

This file is the repo contract for Regents Mobile.

## Purpose

Regents Mobile is the iPhone entry path for Regent. It owns the iOS app, the mobile wallet experience, the mobile-only backend support needed for that wallet path, and the person's list of agents to fund.

## Canonical Identity

- Repo: `ios`
- Product name: Regents Mobile
- Runtime shape: Expo iOS app plus a repo-local Express backend
- Main contracts: `api-contract.openapiv3.yaml` and `mobile-services-contract.openapiv3.yaml`

## Owned Surface

- Mobile sign-in with Privy and wallet bootstrap into Coinbase
- The live wallet flows: wallet opening, buy, cash-out, send, receive, and wallet history
- Token balance reads, Coinbase proxy requests, and wallet support routes used by the app
- Push-token registration, push delivery support, and Coinbase onramp webhook handling for the mobile wallet path
- The "My agents" list, agent pairing codes, and the `POST /agent/pair` route agents call with a SIWA-signed request
- Mobile-specific navigation, design system pieces, and device setup needed to run the app on iPhone or simulator

## Source-Of-Truth Files

- `/Users/sean/Documents/regent/repos/ios/api-contract.openapiv3.yaml`
- `/Users/sean/Documents/regent/repos/ios/mobile-services-contract.openapiv3.yaml`
- `/Users/sean/Documents/regent/repos/ios/README.md`
- `/Users/sean/Documents/regent/repos/ios/IMPLEMENTATION_PLAN.md`

## Inputs

- Mobile sign-in actions, wallet actions, and screen navigation from the iPhone app
- Privy access tokens and linked identity details
- Coinbase wallet, onramp, offramp, and balance responses
- Device push tokens and webhook payloads from Coinbase
- Public mobile configuration for the app and secret-bearing server configuration for the backend

## Outputs

- Native mobile wallet screens and actions
- Backend JSON for wallet support, the agents list with live Base USDC balances, pairing codes, push registration, and wallet support endpoints
- Push notifications for supported wallet events
- Mobile screens for listing, adding, pairing, renaming, removing, and funding agents

## Persistent State

- On-device sign-in and wallet state managed by the app's mobile auth and wallet libraries
- App-side local state for flow progress, review sessions, wallet runtime state, and notification setup
- Backend-side push token records stored in Redis when configured, or in memory for local development
- Backend-side per-user agent lists and unspent pairing codes, stored in Redis when configured, or in memory for local development

## Auth And Trust

- Privy is the user sign-in authority for the mobile app
- The backend verifies Privy access tokens before serving protected routes
- The backend issues short-lived Coinbase custom sign-in tokens so the app can open the wallet path
- Health, JWKS, webhook, and push debug ping routes are public by design. `POST /agent/pair` is public to bearer auth but requires a SIWA-signed request verified by the SIWA server for the `regents-mobile` audience. The rest of the backend assumes an authenticated mobile user

## External Dependencies

- Privy mobile auth
- Coinbase CDP, onramp, offramp, and wallet services
- The SIWA server (`SIWA_SERVER_URL`) for verifying signed agent pairing requests
- A Base RPC endpoint (`BASE_RPC_URL`) for live USDC balance reads
- Base, Ethereum, and Solana balance rails used by the wallet experience
- APNs or Expo push delivery, depending on the environment
- Redis when configured for production push-token storage

## Secret Boundary

- The iPhone app should hold only public mobile configuration values
- The backend may hold CDP API keys, Privy verification keys, JWT signing keys, webhook secrets, push delivery secrets, and Redis connection details
- This repo must not own Platform billing secrets, Autolaunch deploy secrets, or shared SIWA signing keys

## Boundary Lines

- This repo owns the mobile wallet experience and the person's agents list
- This repo does not own any agent's conversations, work records, or runtime. It keeps only the list entries a person adds and the pairing codes they create.
- `api-contract.openapiv3.yaml` is the current formal mobile product contract and covers the portfolio, agents, staking, and pairing routes that the app exposes today
- `mobile-services-contract.openapiv3.yaml` is empty on purpose for Phase 0 because this repo does not yet ship any shared mobile service routes
- `vendor/happy-app/` is donor material for future mobile ideas. It is not the current product surface or source of truth

## Acceptance Checks

- `npm run test:app`
- `npm run check:app`
- `cd server && npm test`
- The live wallet path works for sign-in, wallet opening, buy, cash-out, send, receive, and history
- Wallet sends reject invalid amounts, missing token details, bad recipients, and unsupported networks with clear messages
- Network-specific balances and funding choices refresh when the user changes networks
- A pairing code works once, expires after ten minutes, and links only the SIWA-verified wallet to the person who created it
- A person cannot list, rename, or remove another person's agents
