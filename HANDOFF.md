# Pixa — Handoff Document

**Purpose:** Resume work on a different computer/session starting from **Phase 3**.
**Branch:** `feature/sui-walrus-tatum-migration`  
**Repo:** `C:\Users\manik\Desktop\Pixa\Pixa`  
**Last commit:** `f7bc2f6` — Phase 2 + 2.5 (Sui-only end state) ✅  
**Working tree:** clean  
**Date:** 2026-11-09

---

## 1. Where We Are

### ✅ Completed

- **Phase Zero** — repo investigated, docs written, no source modified
- **Phase 0.5** — baseline repaired (typecheck + 59/59 tests + lint + build all green)
- **Phase 1** — Algorand/AVM removed from active runtime (6 files deleted, 7 rewritten)
- **Phase 2** — Sui blockchain adapter built (`src/blockchain/sui/`, 6 files)
- **Phase 2.5** — Stellar + EVM + `viem` phantom dep dropped → **Sui-only end state**

### Gate status (`npm run check`) — ✅ GREEN

```
40/40 tests pass   tsc clean   eslint 0 errors / 3 warnings   prettier clean   build 23.65 KB
```

### Chain scope: **Sui-only**

Zero references to `algorand|algosdk|@x402-avm|tinyman|stellar|evm|base` in `src/`, `__tests__/`, `package-lock.json`, or `dist/index.js`.

### What works now

| Tool              | Status                                                         |
| ----------------- | -------------------------------------------------------------- |
| `check_balance`   | ✅ Reads SUI + USDC balance on Sui testnet/mainnet             |
| `spending_report` | ✅ Session + daily budget usage                                |
| `search_bazaar`   | ✅ Discovers x402-gated AI services                            |
| `pay`             | ⚠️ Throws clear "Phase 3" error (Sui x402 not implemented yet) |
| `x402_fetch`      | ⚠️ Same Phase 3 placeholder on payment path                    |

**No mock settlement is ever presented as real payment.** The placeholder errors are intentional and honest.

---

## 2. How to Resume on a New Computer

### Step 1 — Clone / open the repo

```
cd C:\Users\manik\Desktop\Pixa
# The repo is already at Pixa\. Open it.
cd Pixa
git checkout feature/sui-walrus-tatum-migration
git status          # should be clean
git log --oneline -3
```

### Step 2 — Install dependencies

```
npm ci --no-audit --no-fund
```

### Step 3 — Verify the gate is green

```
npm run check
```

Expected: exit 0, 40/40 tests, build ~23 KB.

> If `npm run check` is not green, **do not start Phase 3** — fix the gate first.

### Step 4 — Read these files before coding

1. `docs/IMPLEMENTATION_PROGRESS.md` — resume state, decision log D1–D13, changed files
2. `docs/MIGRATION_PLAN.md` — file-by-file plan, phase order, risks R1–R14
3. `docs/REVERSE_ENGINEERING_REPORT.md` — Phase Zero findings, 15 security issues

---

## 3. Phase 3 — Next Immediate Work

### Goal

Wire a real Sui x402 payment scheme into `pay()` and `x402_fetch()` so Sui payments actually sign and settle (not placeholder errors).

### Decision D9 — must be made first (choose one)

| Option | Package                                                         | Pros                                                     | Cons                                     |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| **A**  | `@t2000/sui-x402` (~1.4k weekly DL)                             | Fastest, has digest replay store, verify/settle built-in | Third-party payment code on signing path |
| **B**  | Self-implement `exact` scheme over `@x402/core` + `@mysten/sui` | Full control, no third-party payment code                | Most implementation effort               |
| **C**  | Labelled local 402 mock                                         | Guaranteed fallback for demo                             | Not real settlement                      |

**Recommendation:** Investigate A vs B during Phase 3 Loop A, with C as guaranteed fallback. Do not commit before that investigation.

### Files to touch in Phase 3

- `src/clients.ts` — replace the Sui `createHttpClient` placeholder with real scheme registration
- `src/tools/pay.ts` — replace the Phase 3 throw with real signing
- `src/tools/x402-fetch.ts` — replace the Phase 3 throw with real signing + retry
- `src/blockchain/sui/` — may need additions (scheme registration helper)
- `__tests__/pay.test.ts`, `__tests__/x402-fetch.test.ts` — update mocks

### Phase 3 gate

`npm run check` → exit 0, plus a real Sui testnet payment signs correctly (mocked x402 server acceptable for unit tests).

---

## 4. Remaining Phases (after Phase 3)

| Phase  | Scope                                          | Depends on           | Effort           |
| ------ | ---------------------------------------------- | -------------------- | ---------------- |
| **3**  | Sui x402 payment integration                   | Phase 2 + D9         | Large + research |
| **4**  | Tatum Sui RPC (reads + verify only)            | Phase 2              | Medium           |
| **5**  | Walrus Memory (MemWal)                         | none (can start now) | Medium           |
| **6**  | Memory-driven commerce engine                  | Phase 5              | Large            |
| **7**  | MCP server → 17 target tools                   | Phases 3,4,5,6       | Medium           |
| **8**  | Configuration & security                       | Phase 2              | Medium           |
| **9**  | Testing & validation + E2E demo                | all                  | Large            |
| **10** | Hackathon readiness (10 Mainnet memory writes) | Phase 9              | Medium           |
| **11** | Documentation (11 docs)                        | all                  | Medium           |

**Critical path:** 3 → 4 → 7 → 9 → 10  
**Parallelisable:** Phase 5 (Walrus) can start anytime after Phase 0.5.

---

## 5. Key Decisions (D1–D13)

| ID  | Decision                                                               | Status                   |
| --- | ---------------------------------------------------------------------- | ------------------------ |
| D1  | Clone location = `Desktop\Pixa\Pixa`                                   | ✅ decided               |
| D2  | Branch created after investigation; `main` pristine                    | ✅ decided               |
| D3  | No credentials yet — config-ready `.env.example`                       | ✅ decided               |
| D4  | x402 facilitator: research first, decide in Phase 3                    | ✅ decided               |
| D5  | Test framework = Vitest                                                | ✅ decided               |
| D6  | Scope = Phase Zero fully, then review                                  | ✅ done                  |
| D7  | **Sui-only end state** — drop Stellar & EVM too                        | ✅ decided               |
| D8  | Phase Zero findings approved                                           | ✅ decided               |
| D9  | Phase 3 x402×Sui path (A/B/C)                                          | ⏳ **OPEN — decide now** |
| D10 | Full baseline repair (type bug + 8 tests + gitattributes + env ignore) | ✅ done                  |
| D11 | Fix broken `npm run format` on Windows (single→double quotes)          | ✅ done                  |
| D12 | Phase 1 = Algorand/AVM only (Option A)                                 | ✅ decided               |
| D13 | Phase 2.5 = drop Stellar/EVM for Sui-only                              | ✅ decided               |

---

## 6. Command Reference

```bash
# Full phase gate (run before and after every change)
npm run check

# Individual gates
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
npm run format:check # prettier --check
npm test             # vitest run
npm run build        # tsup bundle → dist/index.js

# Format (fixed for Windows — uses double quotes)
npm run format

# Build desktop extension
npm run build:mcpb

# Check for any Algorand/Stellar/EVM leakage (should be zero)
grep -ri "algorand\|algosdk\|@x402-avm\|tinyman\|stellar\|evm\|base" src/ __tests__
```

---

## 7. File Structure (active runtime)

```
src/
├── index.ts                    # stdio entry, console→stderr guard
├── server.ts                   # McpServer factory, 5 tools registered
├── config.ts                   # SUI_PRIVATE_KEY, NETWORK, budgets
├── types.ts                    # PaymentNetwork = sui-testnet\|sui-mainnet
├── wallet-store.ts             # ~/.x402/wallet.json persistence
├── spending.ts                 # SpendingTracker (in-process)
├── clients.ts                  # createHttpClient, getWalletAddress, getUsdcBalance (Sui)
└── tools/
    ├── check-balance.ts
    ├── pay.ts                  # Sui x402 — Phase 3 placeholder
    ├── x402-fetch.ts           # Sui x402 — Phase 3 placeholder
    ├── spending-report.ts
    └── bazaar-search.ts
src/blockchain/sui/             # NEW — Sui adapter
    ├── suiClient.ts
    ├── suiWallet.ts            # ONLY key holder
    ├── suiBalance.ts
    ├── suiCoinUtils.ts
    ├── suiTransfer.ts
    └── suiTransaction.ts
```

**Quarantined (do not touch, not in active runtime):**

- `pixa-hub-microservices-code/` — harvest idempotent payment-ledger pattern later
- `example-apis/pizza-api-coinbase/` — harvest x402 resource-server reference later

---

## 8. Blockers / Open Items

| Blocker                                           | Impact                                                | Workaround                                             |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| **D9 open** — no Sui x402 scheme chosen           | Phase 3 cannot start                                  | Decide A/B/C, then implement                           |
| No credentials (Sui key, Tatum, MemWal)           | Live integration tests blocked                        | All unit tests are mock-based; run when keys arrive    |
| R1 — no official `@x402/sui` from x402 Foundation | Must use community package or self-implement          | Research in Phase 3 Loop A                             |
| R2 — no confirmed Sui x402 facilitator            | Real settlement may be impossible in hackathon window | Labelled local mock as fallback (C)                    |
| R3 — 10 Mainnet Walrus Memory writes required     | Hackathon acceptance                                  | Develop on Testnet first, budget Mainnet account early |

---

## 9. Credentials to Obtain (before live tests)

Add to `.env` (gitignored — never commit):

```
SUI_PRIVATE_KEY=suiprivkey1...          # Sui testnet key
NETWORK=sui-testnet
MAX_PER_CALL=0.10
MAX_PER_DAY=20.00

TATUM_API_KEY=                          # Phase 4
TATUM_SUI_TESTNET_URL=                  # Phase 4
MEMWAL_KEY=                             # Phase 5
MEMWAL_ACCOUNT_ID=                      # Phase 5
MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz
MEMWAL_NAMESPACE=
```

Template already exists at `.env.example`.

---

## 10. Git Identity (repo-local, already set)

```
git config user.name  → AabirManik
git config user.email → manikaabir6@gmail.com
```

`main` is preserved at `a06fae5` as rollback. All work is on `feature/sui-walrus-tatum-migration`.

---

## 11. First Actions for Next Session

1. `cd C:\Users\manik\Desktop\Pixa\Pixa`
2. `git checkout feature/sui-walrus-tatum-migration`
3. `npm ci --no-audit --no-fund`
4. `npm run check` → confirm green (40/40)
5. Read `docs/MIGRATION_PLAN.md` §10.4 (x402×Sui options A/B/C)
6. Make D9 decision, then begin Phase 3 implementation

---

**Rule from the plan:** Never present mock settlement as real payment. If a phase can't be completed due to a blocker, document it and continue with independent work — don't stop.
