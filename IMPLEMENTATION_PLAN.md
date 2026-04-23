# Regents Mobile Implementation Plan

This document describes the next build after the current Phase 0 truth pass.

## Current Reality

Today the app is split into two groups:

- Real wallet flows: sign-in, wallet opening, buy, cash-out, wallet send, receive, and history.
- Preview-only Regent surfaces: agents, Regent Manager, and terminal.

The preview screens use built-in sample data so the mobile product can show the intended shape of the future experience without claiming that a live Regent connection already exists.

This means the app does **not** yet do these things for a signed-in person:

- load live agents from Regent
- load a live Regent Manager summary from Regent
- open a live Regent terminal session
- move funds between the mobile wallet and a live agent wallet

## What The Next Build Should Do

The next build should make the app truly connect to a person’s Regent account for agents, Regent Manager, and terminal while keeping the wallet side intact.

That next build should:

1. add real Regent-backed agent, Regent Manager, and terminal routes in the contract layer first
2. build those routes in the Regent platform
3. replace the preview data routes in this iOS repo with the real connected routes
4. turn the read-only preview controls into live mobile actions only after the backend is ready

## Product Direction

Keep the existing foundation:

- Coinbase remains the wallet base for buy, cash-out, wallet send, and wallet identity support.
- Happy remains donor material for future terminal interaction patterns and mobile presentation ideas.
- Base and USDC remain the main happy path for the money side of the app.

## Next Build Scope

### 1. Live agent list and detail

- Load the signed-in person’s agents from Regent.
- Show current balances, status, latest updates, and wallet addresses from live backend data.
- Remove the built-in sample agent store and preview route names once live routes exist.

### 2. Live Regent Manager summary

- Replace the sample Regent Manager summary with live Regent-backed content.
- Keep the mobile summary focused on the most useful phone-sized information first.
- Add a larger view only when it points to the person’s real destination.

### 3. Live terminal

- Replace sample sessions and sample event history with live Regent sessions.
- Add real message sending and real review handling only when the backend is ready for them.
- Restore local notifications only when they reflect real account activity.

### 4. Live money movement between wallet and agent

- Add real wallet-to-agent funding only after the live agent wallet contract is in place.
- Add real agent-to-wallet returns only after the live backend can safely create and track them.
- Keep the money and review steps explicit and easy to understand from the phone.

## Delivery Order

Recommended order:

1. contract updates
2. Regent backend routes
3. iOS app wiring
4. terminal actions
5. live money movement

## Acceptance For The Next Build

The next build is done when:

- a signed-in person sees their real agents instead of sample cards
- Regent Manager shows live account summaries instead of sample content
- terminal sessions reflect real Regent activity
- wallet-to-agent and agent-to-wallet steps work against live backend data
- preview-only wording is removed because it is no longer needed
