# Regents Mobile Implementation Plan

This document describes the next build after the mobile Regent route cutover.

## Current Reality

Today the app has two live mobile groups:

- Wallet flows: sign-in, wallet opening, buy, cash-out, wallet send, receive, and history.
- Regent mobile surfaces: Regents, Regent Manager, Talk, and explicit wallet review steps.

The old preview route family has been removed from the app, backend, and contract.

The mobile routes now read product-backed records where the owning product exposes them:

- Regent list, detail, and Regent Manager summaries come from Platform projection.
- Talk sessions, messages, events, and approvals come from Platform Regent Work Runtime.
- The iOS backend owns only wallet intent and receipt state needed by the phone wallet rails.

## What The Next Build Should Do

The next build should connect the current mobile routes to a person’s Regent account while keeping the wallet side intact.

That next build should:

1. keep the current mobile contract as the source of truth
2. keep those routes connected to the owning product records
3. keep only wallet intent and receipt state in backend storage
4. keep wallet review steps explicit and user-confirmed

## Product Direction

Keep the existing foundation:

- Coinbase remains the wallet base for buy, cash-out, wallet send, and wallet identity support.
- Happy remains donor material for future terminal interaction patterns and mobile presentation ideas.
- Base and USDC remain the main happy path for the money side of the app.

## Next Build Scope

### 1. Live Regent list and detail

- Keep loading the signed-in person’s Regents from Platform projection.
- Show current balances, status, latest updates, and wallet addresses from live backend data.
- Keep the `/mobile/regents` route family as the only mobile Regent entry point.

### 2. Live Regent Manager summary

- Keep Regent Manager summaries attached to Platform projection.
- Keep the mobile summary focused on the most useful phone-sized information first.
- Add a larger view only when it points to the person’s real destination.

### 3. Live Talk

- Keep mobile Talk attached to Platform Regent Work Runtime records.
- Keep message sending and review handling attached to the current mobile contract.
- Restore local notifications only when they reflect real account activity.

### 4. Live money movement between wallet and agent

- Add real wallet-to-Regent funding only after the live Regent wallet contract is in place.
- Add real Regent-to-wallet returns only after the live backend can safely create and track them.
- Keep the money and review steps explicit and easy to understand from the phone.

## Delivery Order

Recommended order:

1. contract updates
2. stronger Platform-backed empty/error states
3. iOS app checks against real records
4. richer Talk actions
5. live money movement

## Acceptance For The Next Build

The next build is done when:

- a signed-in person sees their real Regents from Platform projection
- Regent Manager shows Platform-backed account summaries
- Talk sessions reflect Platform Regent Work Runtime activity
- wallet-to-Regent and Regent-to-wallet steps work against live backend data
- old preview route names remain absent
