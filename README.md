# Regents Mobile

Regents Mobile is the iOS workstream built on top of the Coinbase mobile wallet demo.

## Current Reality

What is real today:

- sign-in and wallet opening
- buy flow
- cash-out flow
- wallet send and receive
- wallet history
- Regents, Regent Manager, and Talk screens through the mobile backend

## Repo Story

- Coinbase provides the wallet base: sign-in, wallet creation, onramp, offramp, transfer, history, and the local proxy for secret-bearing wallet work.
- Happy is kept only as a short donor note for future terminal UX ideas.
- Mobile Regent routes now use the live route family in the app and backend contract.

## Repo Shape

- `app/`: mobile screens and routes
- `components/`: shared mobile UI pieces
- `constants/`, `hooks/`, `utils/`: app support code
- `server/`: local backend for wallet and mobile Regent routes
- `vendor/happy-app/`: short note about donor ideas that should be rebuilt inside Regents Mobile

## Setup

### Prerequisites

- Node.js 20 or newer
- an iPhone or iOS simulator
- a CDP project and credentials

### Install dependencies

```bash
npm install
cd server
npm install
```

### Configure local environment

Copy the example files and fill in real values:

```bash
cp .env.example .env
cp server/.env.example server/.env
```

The mobile app needs:

- `EXPO_PUBLIC_CDP_PROJECT_ID`
- `EXPO_PUBLIC_PRIVY_APP_ID`
- `EXPO_PUBLIC_PRIVY_CLIENT_ID`
- `EXPO_PUBLIC_BASE_URL`
- `EXPO_PUBLIC_USE_EXPO_CRYPTO`

The local backend needs:

- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `BASE_RPC_URL`
- `PLATFORM_API_BASE_URL`
- `PRIVY_APP_ID`
- `PRIVY_VERIFICATION_KEY`
- `REGENTS_CDP_JWT_ISSUER`
- `REGENTS_CDP_JWT_AUDIENCE`
- `REGENTS_CDP_JWT_KID`
- `REGENTS_CDP_JWT_ALG`
- `REGENTS_CDP_JWT_PRIVATE_KEY`

Keep database secrets on the backend. A Neon Postgres URL must not be placed in the mobile app environment. This app currently uses `REDIS_URL` on the backend for push-token storage. Regent records come from Platform’s `/api/agent-platform/projection` endpoint, and Talk records come from Platform Regent Work Runtime routes. The mobile backend stores only wallet intent and receipt state under `.regents-mobile-state` unless `REGENTS_MOBILE_STATE_DIR` points to another backend-owned directory.

## Run Locally

Start the backend:

```bash
cd server
npm run dev
```

Start the mobile app in a second terminal:

```bash
npx expo start
```

For an installed iPhone build:

```bash
flowdeck context --project /Users/sean/Documents/regent/ios --json
flowdeck build --project /Users/sean/Documents/regent/ios --scheme RegentsMobile
```

## App Checks

Run the app-side checks from the repo root:

```bash
npm run test:app
npm run check:app
```

Run the server tests from `server/`:

```bash
npm test
```

## Testing Notes

- The wallet rails still rely on Coinbase-hosted purchase and cash-out surfaces where expected.
- Apple Pay is part of the Coinbase-based wallet path where the account and region are eligible.
- Base and USDC remain the main happy path for the wallet side of the product.
- Push notifications should be checked on a physical iPhone. They do not work on the iOS simulator.
- Regent money actions stay explicit and require wallet confirmation.

## Contracts And Planning

- [`api-contract.openapiv3.yaml`](./api-contract.openapiv3.yaml) is the source of truth for the current mobile backend surface.
- [`regent-services-contract.openapiv3.yaml`](./regent-services-contract.openapiv3.yaml) records that there are no shipped shared mobile service routes yet.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) tracks the next live-account work after this mobile route cutover.
