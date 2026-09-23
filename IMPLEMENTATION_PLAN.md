# Regents Mobile Implementation Plan

This document describes the next build after the "My agents" cutover.

## Current Reality

Today the app has two live mobile groups:

- Wallet flows: sign-in, wallet opening, buy, cash-out, wallet send, receive, and history.
- My agents: the list of agents a person funds, kept by the phone backend.

An agent enters the list in one of two ways:

- The person pastes its Base wallet address. The agent is listed as "address only".
- The person gives the agent a pairing code. The agent sends a signed request to
  `POST /agent/pair`, the backend verifies the signature with the SIWA server for the
  `regents-mobile` audience, and the verified wallet address is listed as paired.

Every listed agent shows its live Base USDC balance, read by the backend in one call.
Funding an agent is the existing wallet send flow, prefilled with Base USDC and the
agent's address; the person reviews and signs on the phone and no server step sits in
between.

The backend keeps only the per-user agent list and unspent pairing codes (Redis in
release, memory locally). It holds no agent conversations, work records, voice
sessions, or funding receipts.

## What The Next Build Should Do

1. keep `api-contract.openapiv3.yaml` as the source of truth for the mobile routes
2. keep the agent list owned by the phone backend, never by another product
3. keep every money step user-signed from the phone wallet
4. keep pairing single-use and short-lived

## Product Direction

- Coinbase remains the wallet base for buy, cash-out, wallet send, and wallet identity support.
- Base USDC remains the main happy path for the money side of the app.
- Any agent with a Base wallet can be listed; Muse, Grok Bot, and Hermes are named kinds, everything else is "Other agent".

## Next Build Scope

### 1. Agent balance history

- Show recent USDC movement for a listed agent from chain reads, not from a product record.

### 2. Paired-agent actions

- Let a paired agent ask the phone for funds with a signed request, shown to the person as a plain payment request that they accept or ignore in the wallet.

## Acceptance For The Next Build

- a signed-in person sees only their own agents, with live Base USDC balances
- a pairing code links one verified wallet to the person who created it, once, within ten minutes
- funding an agent goes through the wallet review step and signs on the phone
