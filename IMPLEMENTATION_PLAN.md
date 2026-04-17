# Regents iOS Implementation Plan

This document is the implementation handoff for combining the Coinbase mobile demo shell with selected Happy app patterns for Regents Mobile.

Status: this plan assumes Coinbase is the app shell, Happy is the terminal UX donor, and Regents contracts remain the source of truth for shared business behavior.

## 1. Build direction

Use `coinbase/onramp-v2-mobile-demo` as the base repo and integrate selected Happy features into it. Do not embed the Coinbase demo inside Happy. The Coinbase demo is already an Expo Router + TypeScript mobile app with a Node/Express backend proxy, embedded wallet flows, token transfer support, push notifications, and Coinbase onramp/offramp features. Happy is a broader `pnpm` monorepo with separate app, CLI, agent, and server packages built around remote control of Claude/Codex sessions from mobile. That makes Coinbase the right shell and Happy the right donor for terminal/session UX patterns.

The mobile app should therefore be framed as “Regents Mobile” = Coinbase wallet rails + Regents agent surfaces + Happy-style terminal UX. Keep branding minimal and neutral for now. No custom visual system, no advanced animation pass, no visual polish work beyond basic hierarchy, spacing, and readable defaults.

## 2. Non-negotiable platform rule

The uploaded Regents planning note says `/web` is the live source of truth for platform behavior, and any API or CLI surface changes must start in the YAML contract layer first, then flow into backend and `/regents-cli`. It also explicitly says protected work like deploys, billing, auth boundaries, and money movement should stay visibly separated. That means the iOS repo can own UI, local mobile composition, and the Coinbase proxy server, but durable Regents business logic should remain in the Regents platform/backend and contract files, not in ad hoc mobile-only logic.

## 3. Product scope for v1

The wallet portion of the app should inherit the Coinbase demo’s capabilities and reframe them for stablecoin-first Regents use:

- Buy stablecoins with fiat using the existing onramp flow.
- Move between fiat and stablecoins using onramp + offramp.
- Transfer fiat to bank through Coinbase Offramp, which is a Coinbase-hosted sell flow followed by an onchain send from the embedded wallet to Coinbase. Offramp supports fiat payout to a bank account (ACH) or Coinbase account.

Use Base + USDC as the default happy path in Regents Mobile, because the Coinbase demo already supports Base and supports gasless transfers on Base for supported assets such as USDC via Paymaster, while still keeping Ethereum and Solana available under more advanced paths.

Beyond wallet rails, add three Regents-native surfaces:

- Agents: list the user’s Regents agents and let the user move stablecoins between the mobile wallet and agent wallets.
- Terminal: Happy-style live terminal/chat surface to communicate with Hermes agents running on Sprites.
- Learn/Launch surfaces: one tab for Techtree and one tab for Autolaunch, each with simple explanatory copy and CTA paths to the web surface and `@regentslabs/cli`. Regents already describes Techtree as the shared research/eval tree and Autolaunch as the capital-raising surface, and its CLI page documents `pnpm add -g @regentslabs/cli` and `regent techtree start` as the starting path.

## 4. Auth and wallet strategy

This requirement splits into two separate problems:

- Same user identity across website and mobile.
- Same wallet address across website and mobile.

Treat those as different workstreams.

### Recommended v1: same user, not necessarily same wallet

Use Privy as the canonical cross-platform identity layer. Privy supports mobile app clients, issues signed access tokens, and supports account linking so the same account can be used across multiple platforms. The mobile app should log the user in with the same Privy app/client family as the website, then send the Privy access token to the Regents backend. The backend verifies the Privy token and maps it to the canonical Regents user. Privy access tokens are JWTs and include a stable user `sub`/DID that can serve as the canonical user key.

Then add CDP Embedded Wallet custom auth in the mobile app. Coinbase’s embedded wallets support custom JWT-based authentication, and the RN-compatible SDK surface supports `customAuth.getJwt`. The backend should mint a short-lived Regents/CDP auth JWT for the already-authenticated user, and the mobile app should initialize CDP with `customAuth.getJwt` so the Coinbase wallet session is bound to the same Regents user identity. All CDP React hooks are RN-compatible, and the customAuth type explicitly shows a React Native pattern for retrieving a JWT.

That gives same person/account continuity across the Privy website and the mobile app. It does not automatically give the same wallet address.

### Important caveat: same identity is not same wallet

CDP custom auth gives SSO-style identity continuity; it does not mean a Privy-generated embedded wallet and a CDP-generated embedded wallet are the same keypair. If the product requirement is literally “the user must control the exact same onchain address on web and mobile,” treat that as a separate wallet-migration feature, not the default path.

### If same wallet address is mandatory

Make this an advanced, explicit migration flow. Privy’s export path for client-created embedded wallets is only available via the React/web SDK and, on mobile, is intended to run through a hosted web page inside a WebView. Coinbase can import existing private keys into embedded wallets when there is already access to those keys. Because this is a full private-key-control operation, do not make it the default signup or account-linking path, and do not ask users to casually paste seed phrases/private keys into a normal native text field. Ship it later as a dedicated “Migrate existing wallet” flow with clear warnings and explicit user consent, or defer it entirely.

### What to do about “paste in the address of their mobile app wallet”

Allow that only as metadata convenience, not as proof of control. A pasted address can help the platform know where to show balances or where an agent should pay out, but it is not authentication. Real linking should be backed by either the shared Privy identity session or a signed challenge flow. Coinbase’s SIWE flow is the model for proof-of-wallet-ownership when address-based auth is needed.

### Onramp verification constraint

Keep in mind that Coinbase’s native headless onramp flow requires the app developer to collect and verify the user’s email address and phone number, and it is currently US-only for users with valid US mobile phone numbers. Keep the Coinbase Widget/browser fallback available for users who are not eligible for the full native Apple Pay path.

## 5. Architecture

Use a four-layer architecture:

### A. Mobile app repo (new Regents Mobile repo)

This is the renamed Coinbase demo shell plus transplanted Happy-style UI modules. Keep Expo Router, keep TypeScript, keep the lightweight server folder pattern, and keep package management simple. Do not convert the whole project into Happy’s `pnpm` monorepo just to mirror Happy. Coinbase is already a standard Expo app; Happy is a four-package `pnpm` workspace.

### B. Coinbase proxy server

Keep the `server/` responsibility narrow: CDP API key handling, onramp/offramp session-token creation, webhooks, and other Coinbase-secret-bearing operations. The Coinbase demo already uses a backend proxy pattern where API keys never touch the client, and the mobile client sends a user access token to the backend for validation before backend Coinbase calls. Keep that pattern intact. Also keep Paymaster security rules intact and never expose raw Paymaster URLs in client code.

### C. Regents platform/backend

This should own agent lists, agent wallet metadata, Paperclip summaries, terminal session metadata, entitlement/gating, and any durable user-agent relationship. That matches the uploaded plan that `/web` owns live platform behavior and `/regents-cli` must align through contracts.

### D. Terminal gateway / Sprites-Hermes bridge

Do not try to reuse `happy-cli` or `happy-server` as-is. Happy’s stack is built around its own app/CLI/agent/server system for controlling Claude/Codex sessions from mobile, with remote-mode switching and secure sync. For Regents, the right move is to reuse UX patterns from Happy—session list, streaming renderer, input composer, permission banners, notifications—not its exact transport/backend assumptions. Replace transport with a Regents-authenticated websocket/SSE gateway to Hermes agents on Sprites.

## 6. Repo shape and folder plan

Start from the Coinbase repo shape (`/app`, `/components`, `/hooks`, `/utils`, `/server`) and add feature modules instead of scattering Regents logic across legacy wallet files.

Use this target structure:

```text
/app
  /(tabs)
    wallet.tsx
    agents.tsx
    terminal.tsx
    techtree.tsx
    autolaunch.tsx
  /agent/[id].tsx
  /agent/[id]/paperclip.tsx
  /wallet/send.tsx
  /wallet/cashout.tsx
  /wallet/history.tsx
  /settings.tsx
  /auth/*
/components
  /wallet/*
  /agents/*
  /terminal/*
  /paperclip/*
  /learn/*
  /ui/*
/features
  /auth
  /wallet
  /agents
  /terminal
  /paperclip
  /techtree
  /autolaunch
/services
  /privy
  /cdp
  /regents-api
  /terminal-gateway
  /notifications
  /deep-links
/state
  /session
  /wallet
  /agents
  /terminal
/server
  /src
    /coinbase
    /webhooks
    /health
```

Keep the old Coinbase profile and history concepts, but move them out of the bottom tab bar. The tab bar should stay focused on the user’s five core surfaces.

## 7. Tab and screen map

Use five bottom tabs:

### 1. Wallet

This is the money surface. It owns:

- Buy USDC/stablecoins.
- Cash out to fiat/bank.
- Send stablecoins.
- Receive address / copy address.
- Wallet balances.
- Transfer history.

The Coinbase demo already ships the relevant primitives: onramp form, transfer screen, history, smart account handling, and cash-out flow. Offramp remains Coinbase-hosted and then returns to the app for the final onchain send.

### 2. Agents

This tab lists the user’s Regents agents. Each agent card should show:

- Agent name.
- Status.
- Sprite/Hermes runtime status.
- Wallet address.
- Stablecoin balance.
- Buttons: Fund, Withdraw, Open Terminal, Open Paperclip.

The source of truth for this list should be the Regents platform, not direct client calls into Sprites. That follows the `/web` ownership rule in the plan.

### 3. Terminal

This is the main Happy adaptation. It should feel like a stripped-down Happy remote session surface, but pointed at Hermes agents. Requirements:

- Session list.
- Session detail.
- Live streaming output.
- Input composer.
- Pending approval / tool request banners.
- Notification hooks for task completed, error, approval needed.

Happy’s core value proposition is mobile access to remote AI sessions, push notifications, and switching control between devices; that is the behavioral model to borrow here.

### 4. Techtree

Simple informational tab for now:

- What Techtree is.
- Why an agent operator would use it.
- CTA to open Techtree on web.
- CTA to install `@regentslabs/cli`.
- Suggested starting command: `regent techtree start`.

Regents describes Techtree as the shared research/eval tree and the CLI page documents the install and guided start flow.

### 5. Autolaunch

Simple informational tab for now:

- What Autolaunch is.
- Why an agent operator would use it.
- CTA to open Autolaunch on web.
- CTA to install `@regentslabs/cli`.
- Example command family: `regent autolaunch ...`.

Regents describes Autolaunch as the capital-raising surface for agents, and the CLI page shows it as part of the same binary surface.

### Paperclip UI placement

Do not make Paperclip its own bottom tab in v1. Put it under Agent detail. The first pass should be:

- Read-only mobile cards for org/company summary.
- Goals.
- Active tasks.
- Recent events.
- Team/agent roster.
- “Open full dashboard” fallback.

Sprites explicitly documents Paperclip as a web dashboard reachable on a Sprite URL and notes it can be used “from your phone.” That makes a responsive WebView fallback a valid first implementation while native summaries are being built. Regents also positions its services surface as “Paperclip + Hermes + Regents system.”

## 8. Detailed feature behavior

### A. Buy stablecoins with fiat

- Default asset: USDC.
- Default network: Base.
- Default payment path: native Apple Pay / headless onramp when the user is eligible.
- Fallback: Coinbase Widget / hosted flow.
- Keep region, phone, and mode selection under a simple advanced/settings path rather than front-loading them in the main happy path.

The Coinbase demo already supports Apple Pay and Coinbase Widget paths, plus multi-network assets. Headless onramp requires verified user email and phone data from the app.

### B. Stablecoins ↔ fiat

Interpret this as:

- Fiat → stablecoin = onramp.
- Stablecoin → fiat = offramp.

Do not build a separate conversion engine. Use Coinbase’s onramp/offramp rails that are already designed for this. Coinbase’s docs explicitly frame Onramp + Offramp as the bidirectional movement between fiat and crypto.

### C. Fiat to bank

Implement this strictly as Coinbase Offramp. Flow:

1. Create session token on backend.
2. Generate Offramp URL with `partnerUserRef`.
3. Open Coinbase-hosted sell flow.
4. Deep-link back to app.
5. Show locked amount and destination address.
6. User confirms onchain transfer from wallet to Coinbase.
7. Poll status/history using `partnerUserRef`.

Offramp session tokens are backend-created, single-use, and short-lived; the status/history APIs are keyed by `partnerUserRef`.

### D. Mobile wallet → agent wallet transfer

Flow:

1. User selects agent.
2. App loads canonical agent treasury/wallet address from Regents platform.
3. App builds ERC-20 transfer for Base USDC by default.
4. User confirms send from mobile CDP smart account.
5. App tracks tx hash and updates both wallet and agent detail screens.

Token transfers are supported for EVM smart accounts, and Base smart-account flows can use Paymaster/gas sponsorship patterns.

### E. Agent wallet → mobile wallet transfer

Make this a request/intent flow, not a naive instant transfer assumption. Flow:

1. User selects agent.
2. User taps Withdraw.
3. App calls Regents platform to create withdrawal intent.
4. Platform/gateway either:
   - auto-executes through the agent runtime if policy allows, or
   - queues approval if operator/agent confirmation is required.
5. App shows states: requested, approved, broadcasting, confirmed, failed.

This keeps money movement aligned with the uploaded rule that auth and money boundaries remain explicit and protected.

## 9. Happy-to-Regents adaptation spec

Port from Happy:

- Session list UX.
- Streaming transcript renderer.
- Mobile-first remote control paradigm.
- Notification model.
- “Active session” state and optimistic local caching.
- Reusable terminal input components.

Do not port from Happy:

- `happy-cli` wrappers around Claude/Codex.
- `happy-server` as the authoritative backend.
- Desktop/Tauri/macOS paths.
- Provider-specific Claude/Codex assumptions.

Happy explicitly describes itself as a mobile/web client plus CLI/agent/server stack for remote control of Claude Code and Codex sessions, so only the interaction model should survive the transplant.

Use this event model for the Regents terminal gateway:

```ts
type TerminalEvent =
  | { type: "session.started"; sessionId: string; agentId: string; ts: string }
  | { type: "message.delta"; sessionId: string; chunk: string; stream: "stdout" | "stderr" | "markdown" }
  | { type: "message.done"; sessionId: string; messageId: string; ts: string }
  | { type: "tool.request"; sessionId: string; requestId: string; label: string; details?: string }
  | { type: "tool.resolved"; sessionId: string; requestId: string; result: "approved" | "denied" | "timed_out" }
  | { type: "session.status"; sessionId: string; status: "idle" | "running" | "waiting" | "failed" }
  | { type: "session.error"; sessionId: string; message: string }
  | { type: "session.ended"; sessionId: string; ts: string };
```

Support websocket first, SSE second, polling last.

## 10. Contract-first API plan

Anything that affects live Regents APIs or CLI surfaces should start in contracts first, exactly per the planning note.

### `api-contract.openapiv3.yaml`

Use this for product-owned platform endpoints:

- `GET /mobile/me`
- `GET /mobile/agents`
- `GET /mobile/agents/{id}`
- `GET /mobile/agents/{id}/paperclip`
- `GET /mobile/discovery/techtree`
- `GET /mobile/discovery/autolaunch`
- `POST /mobile/agents/{id}/withdrawals`
- `GET /mobile/agents/{id}/withdrawals/{withdrawal_id}`

### `regent-services-contract.openapiv3.yaml`

Use this for shared runtime/service endpoints:

- `POST /terminal/sessions`
- `GET /terminal/sessions`
- `GET /terminal/sessions/{id}`
- `GET /terminal/sessions/{id}/events`
- `POST /terminal/sessions/{id}/messages`
- `POST /terminal/sessions/{id}/approvals/{request_id}`

### `cli-contract.yaml`

Only update this when the mobile work introduces or changes a shared operator surface that must also exist in the CLI, for example:

- `regent terminal sessions list`
- `regent terminal attach`
- `regent agent fund`
- `regent agent withdraw`
- `regent mobile link-wallet`

Purely local UI layout changes in the iOS app do not need CLI contract changes. Shared business behavior does.

## 11. Implementation phases

### Phase 0: repo bootstrap

- Fork Coinbase repo.
- Rename package/app identifiers to Regents.
- Keep Expo Router and current server pattern.
- Keep npm-based workflow initially.
- Replace visual branding with neutral text labels only.
- Preserve current onramp/offramp/transfer paths before adding Regents features.

### Phase 1: wallet-first baseline

- Make Wallet tab the default landing tab.
- Default asset/network to Base/USDC.
- Keep existing transfer/history/profile flows working under new route names.
- Confirm onramp, transfer, and cash-out still work in sandbox/dev.
- Confirm smart-account balances still render correctly for EVM flows, since the demo displays smart-account balances and routes EVM onramp funds there.

### Phase 2: Privy identity bridge

- Add Privy mobile client and login flow.
- Add backend token verification.
- Add CDP custom-auth JWT issuance.
- Initialize CDP via `customAuth.getJwt`.
- Add internal `userId = RegentsUserId` mapping.
- Use that ID as `partnerUserRef` for Offramp history/status where appropriate.

### Phase 3: agents surface

- Add agent list screen.
- Add agent detail screen.
- Add fund-agent flow.
- Add withdraw-from-agent intent flow.
- Add agent wallet/balance snapshots.
- Add optimistic tx tracking and refresh.

### Phase 4: terminal integration

- Build terminal session list.
- Build session streaming screen.
- Add message composer.
- Add approval banners.
- Add notifications for approval needed / task complete.
- Connect to Regents terminal gateway instead of Happy backend.

Happy and Coinbase both emphasize push-notification patterns, so unify notifications under one mobile service. Also remember iOS simulator does not support push notifications in the Coinbase demo testing guidance; use a physical device for real push validation.

### Phase 5: Paperclip mobile surface

- Add Paperclip summary card in agent detail.
- Add read-only native cards for goals/tasks/team/events.
- Add WebView fallback to full dashboard.
- Add deep-link/open-in-browser fallback.
- No editing in v1 unless the API surface is already stable.

### Phase 6: Techtree + Autolaunch tabs

- Add simple explanatory screens.
- Add open-web CTA.
- Add CLI install CTA.
- Add copyable commands.
- Keep these informational-only in v1 unless contracts already exist for richer mobile workflows.

### Phase 7: hardening

- Add analytics only if explicitly desired later.
- Add device-level secure storage review.
- Add transaction replay protection and intent idempotency.
- Add error states for user-not-verified / unsupported-region / no-agent-wallet / runtime-offline.
- Add test matrix and release checklist.

## 12. Acceptance criteria

The feature is done when all of the following are true:

- A user can sign into Regents Mobile and remain tied to the same Regents/Privy user identity used on the website.
- A user can buy USDC with fiat in the wallet tab.
- A user can cash out supported crypto to fiat using Offramp and complete the onchain send back to Coinbase.
- A user can fund an agent from mobile wallet funds.
- A user can request withdrawal from an agent to the mobile wallet.
- A user can open a live Hermes terminal session from mobile.
- A user can view a Paperclip mobile surface for an agent.
- The app includes distinct Techtree and Autolaunch tabs with web + CLI CTAs.
- Any shared API/CLI changes were made contract-first and validated against `/regents-cli`, matching the Regents planning note.

## 13. Biggest decisions to lock early

The following product decisions are locked for implementation:

- Same user first.
- No durable Regents business logic in the mobile app.
- Paperclip v1 is hybrid: native summary + WebView fallback.
- Techtree and Autolaunch are informational + CTA first.

The single most important instruction for the coding agent is this: treat Coinbase as the wallet/money shell, treat Happy as the terminal UX donor, and treat Regents platform contracts as the business-system source of truth.
