# Regents Mobile

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-lightgrey)](LICENSE)
[![Expo SDK 54](https://img.shields.io/badge/expo-SDK%2054-lightgrey)](https://expo.dev)
[![React Native 0.81](https://img.shields.io/badge/react%20native-0.81-lightgrey)](https://reactnative.dev)
[![Platform: iOS](https://img.shields.io/badge/platform-iOS-lightgrey)](https://www.apple.com/ios/)
[![Chain: Base](https://img.shields.io/badge/chain-base-lightgrey)](https://base.org)

Regents Mobile, built by Regents Labs, is the iPhone wallet for Regent users. The live path is the wallet: open a wallet, add funds, send, receive, cash out, and review history with Base USDC as the happy path.

The app also keeps "My agents": the list of agents a person funds. An agent is added by pasting its Base wallet address or by giving it a pairing code, and every listed agent shows its live Base USDC balance.

> [!IMPORTANT]
> The wallet is the live path and moves real money on Base. Funding an agent is a wallet
> send that the person reviews and signs on the phone.

## Where this sits

```text
  client surfaces
    ios                               mobile app, wallet, action signing   ◀ this repository
    regents-cli                       operator control surface
    regents-techtree-hermes-plugin    Hermes mission-control tab
                    │
                    ▼
  platform
    ash-platform                      Phoenix, LiveView, Ash: web, API, product domains
                    │
                    ▼
  services and chain
    siwa-server                       agent request signing, nonce and replay state
    media-web                         hosted card images and video
    fly-sentinel                      operator health checks
    regent-contracts                  canonical Solidity, ABIs, deployment records
    autolaunch-contracts              frozen Autolaunch V1 Solidity

  shared libraries and standalone tools
    elixir-utils                      SIWA, ENS, XMTP, cache, Credo checks
    design-system                     tokens and regent_ui components
    python-cli                        offline Techtree skill-tree inspection
    videocontrol                      video project and timeline workflows
```

## What You Can Do Today

- Open a mobile wallet after signing in.
- Add USDC on Base, with Apple Pay shown when it is available for the user and region.
- Send funds to another wallet or fund one of your agents.
- Keep a list of your agents: add one by wallet address or pair it with a code, and see its Base USDC balance.
- Receive funds by copying the Base and Ethereum wallet address.
- Cash out supported balances through the Coinbase cash-out flow.
- Review wallet history and failed transaction support details.
- Check $REGENT staking and reward actions from the mobile staking screen.

Base USDC is the primary route for agent funding. Other balances may appear in the wallet detail view, but Base USDC remains the recommended path.

## My Agents

The agents list is owned by the phone backend under `server/`. Pasting a wallet address lists an agent straight away. A pairing code (single-use, ten minutes) lets an agent that can run commands prove it holds its wallet key: it sends a signed request to `POST /agent/pair`, the backend checks the signature with the SIWA server for the `regents-mobile` audience and records the verified address as waiting. The pairing screen shows the exact instructions to paste to the agent, then asks the person to confirm the address the agent signed in with; only a confirmed address is listed as paired. If balances cannot be read, the list still loads and says so.

Funding an agent opens the wallet send flow prefilled with Base USDC and the agent's address. Balances shown in the list are live Base USDC reads.

## Run locally

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

> [!NOTE]
> Signing in and using the wallet touches production data and real balances. What stays on
> the device: the user's keys and anything the OS keychain holds. What leaves it: calls to
> the Regent platform API, the local mobile backend under `server/`, and the funding and
> cash-out providers the flows use. Backend secrets never belong in the app bundle.

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

One command must pass before a change is proposed:

```sh
npm run check:app
```

It runs the Expo lint pass, the app test suite, and the component tests. The local backend
has its own suite:

| Command | What it does |
| --- | --- |
| `npm run check:app` | Lint, app tests, and component tests together. |
| `npm run test:app` | The app test suite on its own. |
| `npm run test:components` | The Jest component tests on their own. |
| `cd server && npm test` | The local mobile backend suite. |
| `npm run check:advisory` | `expo-doctor`. Advisory, not required. |

`eas.json` defines development, preview, and production EAS build profiles.

## Agent Orientation

Start with `AGENTS.md`, `repo.yaml`, and `layer2.md` before editing. The app uses Expo Router under `app/`, shared UI under `components/`, wallet and mobile API helpers under `hooks/` and `utils/`, and the local mobile backend under `server/` (agents list in `server/src/mobileAgents.ts`, routes in `server/src/routes/mobileAgents.ts`).

The in-repo API source of truth is `api-contract.openapiv3.yaml`. `mobile-services-contract.openapiv3.yaml` currently documents that there are no separate shipped shared mobile service routes.

> [!WARNING]
> Mobile wallet opening and wallet actions are production-data work. Keep value movement
> user-signed, keep backend secrets out of the app, and verify Base USDC flows before
> treating a change as complete.

## The other repositories

| Repository | What it is | What it deliberately does not do |
| --- | --- | --- |
| `ash-platform` | The Phoenix, LiveView, and Ash application: public web pages, the HTTP API, product domains, human identity, billing, and the Techtree and Autolaunch product areas. | It does not hold Solidity source or user signing keys; wallet actions remain browser-signed. |
| `autolaunch-contracts` | A clean-room Solidity implementation of the founder-frozen Autolaunch V1 system, controlled by its own `SPEC.md`. | It authorises no deployment, signature, or value movement; the older Autolaunch code in `regent-contracts` is historical reference only. |
| `design-system` | The shared Regent visual language: the style guide, design tokens, logos, fonts, and the `regent_ui` Phoenix component library. | Shared components never own product workflow state, authorisation decisions, money movement, or product database behaviour. |
| `elixir-utils` | A collection of standalone Elixir libraries used across the family: SIWA, ENS, XMTP, a cache, agentbook helpers, and the in-house `credo_ash` lint checks. | Each package is a library only; none of them runs a service or holds product behaviour. |
| `fly-sentinel` | A small Phoenix service that reports Fly.io observability and operator preview checks. | It observes and reports; it does not deploy, scale, or change any other application. |
| `media-web` | A standalone Phoenix service that serves hosted Regents card images and video files from `media.regents.sh`. | It only serves bytes over HTTP; it holds no identity, database, or product logic. |
| `python-cli` | The installable `regents-techtree` Python package, whose shipped surface is a deterministic offline inspection of one champion/challenger skill-tree pair. | It does not evaluate or execute an agent, and it makes no network calls once its locked dependencies are installed. |
| `regent-contracts` | The canonical home for Regent Solidity source, Foundry tests, deployment scripts, verified deployment records, ABIs, and the chain-contract manifest. | It holds no HTTP or CLI contracts, Ash resources, workflow logic, UI, or projection workers. |
| `regents-cli` | The operator control surface: the `regents` command line tool, its generated bindings, and its local runtime. | It drives the platform over published contracts and owns no product database or on-chain authority. |
| `regents-techtree-hermes-plugin` | The Hermes plugin that presents Techtree mission control across Forge, Techtree Verify, and Uplift. | It is presentation only: no second task store, no private Verify database, no identity model, no payment system, and no Hermes runtime of its own. |
| `siwa-server` | The shared Sign-In With Anything service for signed agent requests, nonce and replay state, and internal keyring endpoints. | It owns no product data or product authorization policy. |
| `videocontrol` | A separate product: video project workflows, timeline editing, preview rendering, and Codex plugin media control. | It shares the house style but no runtime, database, or contract with the Regent platform. |

## License

Apache 2.0 — see [LICENSE](LICENSE).
