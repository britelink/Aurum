# Aurum rails — how money moves

Aurum is a gaming platform sitting on SGX/Chessa's money rails. It is a child of
SGX and shares its engine, not its deployment: every environment variable has to
be set on Aurum's own Convex, and nothing is inherited automatically.

**Money enters only as crypto. Money leaves as crypto or as EcoCash.** There is
no fiat on-ramp — card, Zimswitch and the hosted EcoCash widget never settled a
live payment, and the code that offered them has been retired rather than left
switched off.

```
                 ┌─────────────────────────── AGENT WALLET ───────────────────────────┐
                 │   one BEP-20 wallet: deposits land in it, payouts sign from it     │
                 └───────────────────────────────────────────────────────────────────┘
                        ▲                                    │              │
          USDT / USDC   │                                    │ USDT         │ USDT
          from anyone   │                                    ▼              ▼
                 ┌──────┴───────┐                    ┌──────────────┐  ┌──────────────┐
  player  ──────▶│ deposit quote│                    │ crypto payout│  │ Chessa order │
                 │ exact amount │                    │ player wallet│  │  → EcoCash   │
                 └──────┬───────┘                    └──────────────┘  └──────────────┘
                        │ watcher matches                    ▲              ▲
                        ▼ 6 confirmations                    │              │
                 users.balance  ◀────── game ──────▶  withdrawal (low fee)──┘
                   (custodial USD)
```

Inbound is free. Outbound carries a low fee (default 1.5%, floor $0.25).

---

## Inbound — crypto deposits

Ported from SGX Pay (`chessa/convex/merchantDeposits.ts` +
`merchantWatcherNode.ts`), with the merchant replaced by a player and the
merchant balance replaced by `users.balance`.

1. Player asks for a deposit at `/wallet`. `deposits.createDeposit` quotes the
   agent wallet address and an **exact payable amount** — the figure they asked
   for plus a five-decimal tag between `0.00001` and `0.09999`.
2. They send exactly that amount.
3. `depositWatcherNode.watchInboundDeposits` (cron, 1 min) reads ERC-20
   `Transfer` logs into the wallet, matches the amount to one open quote, and
   moves it to `detected`.
4. After 6 confirmations the deposit is `confirmed`, the player's balance is
   credited and a `transactions` row is written.

### Why the exact amount

Every player's money lands in the **same** wallet. The tag is what tells one
player's transfer from another's — it is a routing device, not a charge, and the
player is credited the whole of it (the inbound fee is zero, so what arrives is
what lands in the balance).

It stops at five decimals deliberately. Adjacent tags are then `1e-5` apart, ten
times the `1e-6` tolerance the watcher matches within. At six decimals two
neighbouring quotes would sit exactly one epsilon apart and a transfer could
match either.

### When a payer rounds

Matching only the exact figure is right for deciding *which* quote a transfer
belongs to and wrong for deciding whether it belongs to one at all. People
round. So:

- Exact match (±`1e-6`) → that quote.
- Otherwise, anything within **20 cents** → that quote, **unless more than one
  open quote falls in the band**, in which case *none* is credited and the
  transfer is filed in `unclaimedDeposits` for a person to resolve. Crediting
  either would be a coin toss with one player's money against another's quote.
- Under by ≤2 cents still settles in full. More than that is `underpaid`, and
  the player can top up — the second transfer completes the same quote.

### Late money

A quote expires after an hour, which frees its tag and stops advertising it. It
does **not** refuse the player's money: a transfer arriving within seven days
still matches, revives the quote, credits it normally and is flagged
`claimedAfterExpiry`.

### Things the watcher is built to survive

Each of these is a production incident in SGX, carried over deliberately:

- **The cursor is written before scanning and after every complete chunk.** A
  tick that dies partway resumes where it stopped. Without it, a persistently
  failing RPC meant the cursor was never written at all, every tick re-scanned
  the same recent blocks, and no deposit older than two minutes could ever be
  seen.
- **A chunk only advances the cursor once *every* token has been read.** One
  token rate-limiting cannot skip a range for the others.
- **Every address ever quoted stays watched.** When a treasury moves, money sent
  to the old one becomes invisible otherwise. SGX had 695 USDT stranded at a
  retired address when this rule was written.
- **Endpoints have a 6-second deadline.** A degraded provider that accepts the
  connection and never replies held every tick open until the platform killed
  it — indistinguishable from a cron that was not running.

**`AURUM_BSC_RPC_URL` is not optional in practice.** Measured against this exact
query, the Binance dataseeds refuse `eth_getLogs` for a range of one block and
meowrpc does not implement it. On those endpoints the watcher makes no progress
and no deposit is ever credited.

---

## Outbound — crypto

`cryptoWithdrawals.requestCryptoWithdrawal` debits the gross, books the ledger
row and schedules `cryptoPayoutNode.sendCryptoPayout`.

- **Claim before send.** `queued → sending` is a compare-and-set won by exactly
  one run, so a retry or an overlapping invocation cannot broadcast twice. There
  is no undo on chain.
- **The float is checked before broadcasting.** "The house is short" is a
  sentence an operator can act on; a revert is gas spent telling the player
  nothing.
- **Only a payout that definitely did not go out is failed and refunded.**
  Anything after the transaction is on the wire stays `sending` with the hash
  attached, for a person to reconcile. Refunding a payout that landed pays twice.

---

## Outbound — EcoCash, via Chessa

`withdrawals.requestEcocashWithdrawal` → `chessaBridge.runCryptoToEcocashForPayout`
→ Chessa's own `v0public:cryptoToEcocash`, called **directly on Chessa's Convex**
— no HTTP hop through sgxremit.com.

Chessa returns an order and a payment address; `treasuryPayout` then funds it
from the agent wallet (BEP-20 or Tron, depending on the address Chessa quotes).

The fee comes off **here**, not at Chessa. The gross leaves the player's balance,
the fee stays with the house, and Chessa is asked to deliver only `netUsd`.
Sending the gross and skimming afterwards would show the recipient a figure
nobody quoted them, and the refund path would have to know which of the two
numbers to return.

Terminal outcomes arrive at `POST /sgx/withdrawal-callback` when
`SGX_PENNY_CALLBACK_BEARER` is configured; otherwise the row sits in
`sgx_submitted` and is reconciled by hand.

---

## The game

`gameEngine.ts`. Rounds are 30s of betting then 30s of price, and the price curve
is a **pure function of the round's seed** (`gameLib.priceSeries`). The browser
draws it and the settlement mutation computes against it — the same function —
so the chart is the game rather than a decoration next to it.

Settlement is **one mutation**. Winners share the losing pool after an 8% rake;
a one-sided book or a price finishing on the axis voids the round and returns
every stake.

### What this replaced, and why it is worth knowing

The previous `session.ts` had three faults that the shape of `gameEngine.ts` is
the answer to:

| Was | Now |
| --- | --- |
| An action rescheduling itself **every second**, forever — 86,400 invocations a day whether or not anyone was playing | `scheduler.runAt` the two instants a round has: **two mutations a minute** while occupied, nothing when idle. A 5-minute cron is recovery only |
| `updateUserBalance`, `createTransaction`, `updateBetStatus`, `createSession` were **public** mutations — any browser could set any balance | Everything money-touching is `internalMutation` |
| `placeBet` never debited the stake; the **browser** decided who won and told the server what to credit | The stake is debited in the same transaction as the bet; settlement is server-side and the client is never asked |
| Settlement ran as an action issuing 3 mutations per player — a crash halfway paid some and not others | One transaction: all of it lands or none does |
| `createSession` read **every** session row to prune | Bounded walk of the oldest by index |

Those public mutations were survivable while the balance was play money. They
are not survivable next to a rail that sends real USDT, which is why they were
deleted rather than deprecated.

---

## Environment

Set on **Aurum's** Convex. `npm run env:plan` shows what is resolvable from
`.env.local` (and, with `--sgx <path>`, from SGX's); `npm run env:apply` sets it.

| Var | Required | Notes |
| --- | --- | --- |
| `AURUM_AGENT_PRIVATE_KEY` | **yes** | Signs payouts *and* derives the address deposits are watched on. Falls back to `PENNY_TREASURY_BEP20_PRIVATE_KEY` / `PRIVATE_KEY` |
| `AURUM_BSC_RPC_URL` | **yes, in practice** | Needs a real `eth_getLogs` allowance. Comma-separated list allowed; archive access not needed |
| `IS_LIVE` | **yes** | Mainnet vs testnet token contracts |
| `AURUM_AGENT_WALLET_ADDRESS` | recommended | Asserted against the key before any transfer |
| `AURUM_DEPOSIT_ADDRESS` | optional | If inbound should land somewhere other than the signing wallet. Also lets the first deposit be quoted before the watcher has run once |
| `AURUM_WITHDRAW_FEE_PERCENT` | optional | Default `1.5` |
| `AURUM_WITHDRAW_MIN_FEE_USD` | optional | Default `0.25` |
| `CHESSA_CONVEX_URL` | **yes** for EcoCash | Chessa's deployment URL |
| `CHESSA_V0_INTERNAL_SECRET` | **yes** for EcoCash | Must equal Chessa's `V0_API_INTERNAL_SECRET` |
| `PENNY_WITHDRAW_CHAIN` | recommended | Chessa's funding step defaults to Tron when omitted, whatever chain the order was made on |
| `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS` | **yes** | Convex Auth. The key pair must be generated **together** |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional | Password auth works without them |
| `ADMIN_EMAILS` / `ADMIN_USER_IDS` | optional | Admin allowlist for accounts without `role: admin` |
| `AURUM_SANDBOX_ENABLED` | **never on production** | Unlocks the rail drill, which can credit a balance from nothing |

---

## Drills

```bash
npm run rails:dryrun     # offline: the money maths, no network, no deployment
npm run rails:e2e        # the whole player journey against Convex (dry payouts)
node --no-warnings scripts/rails-dryrun.mjs --deployment --live-payout   # spends money
```

The offline half asserts against the real `railLib.ts` and `gameLib.ts` — tag
uniqueness and spacing, fee arithmetic that always sums to the gross, address and
phone validation, curve determinism, and that settlement neither mints nor
destroys money.

The live half needs `AURUM_SANDBOX_ENABLED=true` and walks: create a player →
quote a deposit → underpay it → top it up → watch the balance move → price a
crypto withdrawal to a throwaway address → try a Tron address and confirm it is
refused → price an EcoCash cash-out → reconcile the ledger against the balance.
Payouts are dry unless `--live-payout` is passed.

`railsSandbox.ts` is how it drives the real code: every drill function is a thin
wrapper over the same helper the player-facing mutation calls, differing only in
where the player id comes from. A drill with its own arithmetic would only prove
that the drill works.

---

## Retired

These are inert (410 / redirect) rather than deleted, so a stale client fails
loudly. Delete them once nothing points at them:

- `app/api/payment/*`, `app/api/withdrawal/*`, `app/api/house/*` — unauthenticated
  endpoints that credited and debited balances from a `userId` in the request body
- `lib/payment/*` — the fiat provider client
- `components/DepositModal.tsx` — the fiat deposit picker
- `convex/session.ts`, `convex/sessionManager.ts` — the old round engine
- `/game-payment`, `/withdraw`, `/withdraw/manual` — redirect to `/wallet`
