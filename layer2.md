# iOS Layer 2

This file is the repo contract for Regents Mobile.

## Purpose

Regents Mobile is the iPhone entry path for Regent. It owns the iOS app, the mobile wallet experience, the mobile-only backend support needed for that wallet path, and the mobile presentation of Regent agent and terminal work.

## Canonical Identity

- Repo: `ios`
- Product name: Regents Mobile
- Runtime shape: Expo iOS app plus a repo-local Express backend
- Main contracts: `api-contract.openapiv3.yaml` and `regent-services-contract.openapiv3.yaml`

## Owned Surface

- Mobile sign-in with Privy and wallet bootstrap into Coinbase
- The live wallet flows: wallet opening, buy, cash-out, send, receive, and wallet history
- Token balance reads, Coinbase proxy requests, and wallet support routes used by the app
- Push-token registration, push delivery support, and Coinbase onramp webhook handling for the mobile wallet path
- The mobile Regent, Regent Manager, Talk, and review screens plus their mobile backend routes
- Mobile-specific navigation, design system pieces, and device setup needed to run the app on iPhone or simulator

## Source-Of-Truth Files

- `/Users/sean/Documents/regent/ios/api-contract.openapiv3.yaml`
- `/Users/sean/Documents/regent/ios/regent-services-contract.openapiv3.yaml`
- `/Users/sean/Documents/regent/ios/README.md`
- `/Users/sean/Documents/regent/ios/IMPLEMENTATION_PLAN.md`

## Inputs

- Mobile sign-in actions, wallet actions, and screen navigation from the iPhone app
- Privy access tokens and linked identity details
- Coinbase wallet, onramp, offramp, and balance responses
- Device push tokens and webhook payloads from Coinbase
- Public mobile configuration for the app and secret-bearing server configuration for the backend

## Outputs

- Native mobile wallet screens and actions
- Backend JSON for wallet support, mobile Regent data, mobile Talk data, push registration, and wallet support endpoints
- Push notifications for supported wallet events
- Mobile Regent views for agents, Regent Manager, and Talk through the current mobile route family

## Persistent State

- On-device sign-in and wallet state managed by the app's mobile auth and wallet libraries
- App-side local state for flow progress, review sessions, wallet runtime state, and notification setup
- Backend-side push token records stored in Redis when configured, or in memory for local development
- iOS-owned mobile facade records, Talk sessions, funding intents, return requests, wallet actions, and review state stored by the backend in its durable mobile state directory

## Auth And Trust

- Privy is the user sign-in authority for the mobile app
- The backend verifies Privy access tokens before serving protected routes
- The backend issues short-lived Coinbase custom sign-in tokens so the app can open the wallet path
- Health, JWKS, webhook, and push debug ping routes are public by design. The rest of the backend assumes an authenticated mobile user
- The current mobile Regent and Talk route family is live. Regent records come from Platform projection, Talk records come from Platform Regent Work Runtime, and the iOS backend owns only mobile wallet intent and receipt state.

## External Dependencies

- Privy mobile auth
- Coinbase CDP, onramp, offramp, and wallet services
- Platform projection API for formation, name, billing, and runtime state
- Platform Regent Work Runtime API for Talk work items, runs, events, and approvals
- Base, Ethereum, and Solana balance rails used by the wallet experience
- APNs or Expo push delivery, depending on the environment
- Redis when configured for production push-token storage

## Secret Boundary

- The iPhone app should hold only public mobile configuration values
- The backend may hold CDP API keys, Privy verification keys, JWT signing keys, webhook secrets, push delivery secrets, and Redis connection details
- This repo must not own Platform billing secrets, Autolaunch deploy secrets, or shared SIWA signing keys

## Boundary Lines

- This repo owns the mobile wallet experience and the mobile presentation of Regent work
- This repo does not own live Regent agent, Regent Manager, or Talk business logic. The current mobile routes read the owning product records and keep mobile wallet intent and receipt state here.
- Mobile Talk uses Platform Regent Work Runtime records through mobile routes. It does not create or own XMTP room ids today.
- `api-contract.openapiv3.yaml` is the current formal mobile product contract and covers the mobile Regent routes that the app exposes today
- `regent-services-contract.openapiv3.yaml` is empty on purpose for Phase 0 because this repo does not yet ship any shared mobile service routes
- `vendor/happy-app/` is donor material for future mobile ideas. It is not the current product surface or source of truth

## Acceptance Checks

- `npm run test:app`
- `npm run check:app`
- `cd server && npm test`
- The live wallet path works for sign-in, wallet opening, buy, cash-out, send, receive, and history
- The Regent, Regent Manager, and Talk tabs use the current mobile route family
