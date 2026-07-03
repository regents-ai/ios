# Regents Mobile

Regents Mobile is the iPhone wallet for Regent users. The live path is the wallet: open a wallet, add funds, send, receive, cash out, and review history with Base USDC as the happy path.

The app also contains preview surfaces for connecting to a hosted Regent, Regent Manager, Talk, Paperclip, and terminal-style work. Treat those as preview until the related product status is marked live.

## What You Can Do Today

- Open a mobile wallet after signing in.
- Add USDC on Base, with Apple Pay shown when it is available for the user and region.
- Send funds to another wallet or fund an agent working balance.
- Receive funds by copying the Base and Ethereum wallet address.
- Cash out supported balances through the Coinbase cash-out flow.
- Review wallet history and failed transaction support details.
- Check $REGENT staking and reward actions from the mobile staking screen.

Base USDC is the primary route for agent funding. Other balances may appear in the wallet detail view, but Base USDC remains the recommended path.

## Preview Regent Surfaces

The Agents, Message, Regent Manager, and voice screens let the app connect to Regent work records and agent conversations. These screens are present, but the founder status ledger marks live hosted Regent connection, Paperclip, and terminal as preview.

Preview surfaces can help test agent funding, replies, approvals, and work updates. They should not be described as the same level of availability as wallet opening, buy, cash-out, send, receive, or history.

## Run Locally

Install dependencies:

```sh
npm install
cd server && npm install
```

Run the local backend in one terminal:

```sh
cd server
npm run dev
```

Run the Expo app in another terminal:

```sh
npm run start
```

Use `npm run ios` for an iOS simulator build, `npm run android` for Android, and `npm run web` for the web target when needed.

### Native builds (adding native modules)

When you add a native module (for example `npx expo install expo-blur`), the iOS
dev client must be rebuilt so CocoaPods links it. Run `pod install` with a UTF-8
locale — otherwise CocoaPods crashes on some Ruby versions with an
`Encoding::CompatibilityError` / `ASCII-8BIT` error before it does any work:

```sh
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install
```

Then rebuild the dev client (`npm run ios`, or drive `xcodebuild` against a
simulator directly if `expo run:ios` routes to a physical-device signing path).

## Checks

The app-level checks are:

```sh
npm run check:app
npm run test:app
cd server && npm test
```

`eas.json` defines development, preview, and production EAS build profiles.

## Agent Orientation

Start with `AGENTS.md`, `repo.yaml`, and `layer2.md` before editing. The app uses Expo Router under `app/`, shared UI under `components/`, wallet and Regent API helpers under `hooks/` and `utils/`, and the local mobile backend under `server/`.

The in-repo API source of truth is `api-contract.openapiv3.yaml`. `mobile-services-contract.openapiv3.yaml` currently documents that there are no separate shipped shared mobile service routes.

When changing wallet behavior, remember that mobile wallet opening and wallet actions are production-data work. Keep value movement user-signed, keep backend secrets out of the app, and verify Base USDC flows before treating a change as complete.
