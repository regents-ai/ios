# Regents Mobile

Regents Mobile is the iOS workstream for combining the existing wallet rails from the Coinbase mobile demo with the future Regents agent experience. This repo is the working Phase 0 baseline: the wallet flows remain intact, Happy app source is present as donor material for later terminal work, and the implementation plan lives in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).

## Current Scope

This baseline currently preserves:

- buy and cash-out rails
- wallet creation and sign-in flow
- transfer and history screens
- push notification support
- sandbox testing support

This baseline does not yet include the Regents agent terminal, Paperclip mobile views, or the Techtree and Autolaunch tabs.

## Repo Shape

- `app/`: mobile screens and routes
- `components/`: shared mobile UI pieces
- `constants/`, `hooks/`, `utils/`: supporting app logic
- `server/`: local backend for secret-bearing wallet and money-flow operations
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
- optional webhook and push settings if those flows are being tested

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

For a native iOS build instead of Expo Go:

```bash
npx expo run:ios
```

## Local Testing Without Sign-In

If you only want to test the app shell and the wallet screens, you can skip sign-in and open the built-in test wallet instead.

Set this in your local `.env`:

```bash
EXPO_PUBLIC_ENABLE_TEST_SESSION=true
```

Then restart the app. This opens Regents Mobile with the built-in test wallet and bypasses the sign-in screen.

This is only for local development. Turn it back off when you want to test the real mobile sign-in path.

## Testing Notes

- The wallet rails still rely on Coinbase-hosted purchase and cash-out surfaces where expected.
- Push notifications should be checked on a physical iPhone. They do not work on the iOS simulator.
- Sandbox mode remains available for safer test runs.

## Planning

The implementation handoff for the Regents iOS build is in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). That document is the source for what Phase 1 and beyond should add next.

### Cashing Out (Offramp)

Convert crypto in your mainnet wallet back to fiat:

1. Go to **Profile Tab** → scroll to your mainnet balances
2. Tap **Cash Out (Offramp)** on any balance row (Base, Ethereum, or Solana)
3. Complete the Coinbase-hosted sell flow in the browser — select amount, payment method, and confirm
4. After tapping "Cash out now", the app reopens automatically
5. Review the locked amount and destination address (set by Coinbase)
6. Tap **Send Now** to execute the on-chain transfer from your embedded wallet to Coinbase

> **Note**: You have 30 minutes to complete the on-chain send after confirming in the Coinbase widget. Offramp is mainnet-only and requires a real wallet balance.

#### Offramp Cash Out Demo
https://github.com/user-attachments/assets/445e487d-50f6-443b-8072-e4e178668ac7

## Project Structure

```
/app/                 # Expo Router pages
  ├─ (tabs)/          # Bottom tab navigation
  │   ├─ index.tsx    # Home: Onramp form
  │   ├─ profile.tsx  # Settings & wallet
  │   └─ history.tsx  # Transaction history
  ├─ auth/            # Email/phone verification
  └─ transfer.tsx     # Token transfer

/components/          # React components
  ├─ onramp/          # Onramp-specific UI
  └─ ui/              # Reusable UI components

/hooks/               # Custom hooks
  └─ useOnramp.ts     # Onramp logic & API calls

/utils/               # Helper functions
  ├─ sharedState.ts   # Global state
  ├─ create*.ts       # Onramp v2 API
  └─ fetch*.ts        # Onramp v1 API

/server/              # Backend proxy
  └─ src/app.ts       # Express server
```

## Architecture Diagram
<img width="3041" height="5992" alt="Onramp Mobile Demo Architecture" src="https://github.com/user-attachments/assets/10a726f1-c031-481c-a3cb-f334c6f80cc2" />


## Key Concepts

### Smart Account vs EOA

The app creates two wallet types:
- **EOA**: Standard wallet (externally owned account)
- **Smart Account**: ERC-4337 account abstraction

**Important**: The app displays **Smart Account balances** only. All EVM onramp funds automatically go to the Smart Account.

### Security Model
#### Backend Proxy Pattern

For security, API keys are **never exposed** to the client. Backend signs short‑lived ES256 JWTs with CDP API keys; only the backend ever sees API secrets.

```
Client App → Backend Proxy → Coinbase API
              (has API keys)
```

This prevents API key theft if someone inspects your app.

#### User authentication

Mobile client obtains a user access token from the CDP RN SDK and sends it to the backend; backend validates with the CDP End User API before calling Onramp or wallet APIs. 


#### Webhook security 

Onramp webhooks are HMAC‑signed; backend verifies signatures before processing events and sending push notifications. 

#### Key & data handling 

Wallet keys are managed via the CDP SDK and stored in secure device storage; transport is TLS‑only. 


### Gasless Transfers

On Base network, transfers of USDC, EURC, or BTC are **gasless** (no ETH needed for gas) thanks to Coinbase Paymaster.

## Troubleshooting

### "Wallet not creating"
- Verify `EXPO_PUBLIC_CDP_PROJECT_ID` is correct
- Check CDP Portal for project status

### "Push notifications not working"
- **iOS Simulator**: Push notifications do not work on iOS Simulator. Use a physical device.
- Should work automatically in Expo Go on physical devices (uses Expo Push Service)
- For webhooks, verify your backend has a public URL (localhost won't work)
- Check `.env` has correct `EXPO_PUBLIC_BASE_URL`
- Verify webhook subscription is created in CDP Portal
- Restart Expo after updating `.env`

### "Transaction failing"
- Enable **Sandbox Mode** for testing
- Verify phone verification is complete (for Apple Pay)
- Check backend logs: `cd server && npm run dev`

## Development Tips

### Testing Without Real Money

1. Enable **Sandbox Mode** in Profile tab
2. All transactions will be simulated
3. No real blockchain interaction

### Viewing Backend Logs

```bash
cd server
npm run dev
# Watch console for API requests/responses
```

### Debugging Push Notifications

Check Expo logs:
```bash
# In Expo terminal (Terminal 2)
# Look for lines with [PUSH] prefix
```

### Resetting App State

1. Sign out from Profile tab
2. Force close app
3. Relaunch

## Environment Variables

### Required (Root `.env`)

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_CDP_PROJECT_ID` | Your CDP project ID |
| `EXPO_PUBLIC_BASE_URL` | Backend server URL (public URL for webhooks, or `http://localhost:3000` for local testing) |
| `EXPO_PUBLIC_USE_EXPO_CRYPTO` | `true` for Expo Go (`npx expo start`), `false` for dev builds (`npx expo run:ios`) |

### Required (Server `.env`)

| Variable | Description |
|----------|-------------|
| `CDP_API_KEY_ID` | CDP API key ID |
| `CDP_API_KEY_SECRET` | CDP API private key |

### Optional (Server `.env`)

| Variable | Description |
|----------|-------------|
| `WEBHOOK_SECRET` | Webhook signing secret from CDP Portal (required for push notifications) |
| `APNS_KEY_ID` | Apple Push Notification service key ID (for production iOS notifications) |
| `APNS_TEAM_ID` | Apple Developer Team ID |
| `APNS_KEY` | APNs private key (.p8 file content) |
| `DATABASE_URL` | Database URL for production deployment (supports Redis, MongoDB, etc. - uses in-memory storage if not set) |

## Documentation

- [CDP Documentation](https://docs.cdp.coinbase.com/)
- [Onramp API](https://docs.cdp.coinbase.com/onramp-&-offramp/introduction/quickstart)
- [CDP React Native SDK](https://docs.cdp.coinbase.com/embedded-wallets/react-native/quickstart)
- [Expo Documentation](https://docs.expo.dev/)

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.
