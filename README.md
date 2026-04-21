# Regents Mobile

Regents Mobile is the iOS workstream built on top of the Coinbase mobile wallet demo.

## Current Reality

What is real today:

- sign-in and wallet opening
- buy flow
- cash-out flow
- wallet send and receive
- wallet history

What is preview-only today:

- agents tab
- agent detail
- Paperclip summary
- terminal tab
- terminal session detail

Those preview screens use built-in sample data. They are here to show the shape of the future mobile Regent experience, not to show a person’s live Regent account yet.

## Repo Story

- Coinbase provides the wallet base: sign-in, wallet creation, onramp, offramp, transfer, history, and the local proxy for secret-bearing wallet work.
- Happy is included as donor material for future terminal UX ideas.
- Live Regent connection for agents, Paperclip, and terminal remains planned work. This repo does not claim that connection is complete today.

## Repo Shape

- `app/`: mobile screens and routes
- `components/`: shared mobile UI pieces
- `constants/`, `hooks/`, `utils/`: app support code
- `server/`: local backend for wallet and preview data routes
- `vendor/happy-app/`: imported Happy source kept separate as donor material

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
- `PRIVY_APP_ID`
- `PRIVY_VERIFICATION_KEY`
- `REGENTS_CDP_JWT_ISSUER`
- `REGENTS_CDP_JWT_AUDIENCE`
- `REGENTS_CDP_JWT_KID`
- `REGENTS_CDP_JWT_ALG`
- `REGENTS_CDP_JWT_PRIVATE_KEY`

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
npx expo run:ios
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
- The preview agent and terminal screens are intentionally read-only examples in this phase.

## Contracts And Planning

- [`api-contract.openapiv3.yaml`](./api-contract.openapiv3.yaml) is the source of truth for the current mobile backend surface, including the preview routes.
- [`regent-services-contract.openapiv3.yaml`](./regent-services-contract.openapiv3.yaml) records that there are no shipped shared mobile service routes in Phase 0.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) describes the next build needed to move from preview screens to a live Regent connection.
