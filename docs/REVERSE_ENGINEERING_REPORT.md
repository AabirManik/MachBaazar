# Pixa — Reverse Engineering Report

> **Phase Zero deliverable.** Produced from source inspection, dependency analysis, and
> execution of the existing build/test/lint/typecheck gates. No source files were modified.
>
> - Repository: `https://github.com/soumyacodes007/Pixa` (cloned at `a06fae5 "final fix"`)
> - Branch: `main` (pristine, working tree clean before this report was added)
> - Date of investigation: 2026-11-08
> - Investigation method: normal source analysis. **No REA runtime evidence was collected** —
>   this is an ordinary TypeScript source repository, so REA readiness checks were not run
>   (per plan §2). No claim in this report rests on REA evidence.

---

## 1. Current Architecture

### 1.1 Repository layout

```
Pixa/
├── src/                        # MCP server (2,082 lines TS) — the product
│   ├── index.ts                  # stdio entrypoint, redirects console.log → stderr
│   ├── server.ts                 # McpServer factory, registers 11 tools
│   ├── config.ts                 # env + wallet-file config loader
│   ├── types.ts                  # AppConfig / PaymentNetwork / BudgetConfig
│   ├── wallet-store.ts           # ~/.x402/wallet.json persistence
│   ├── spending.ts               # SpendingTracker (per-call + daily budget)
│   ├── clients.ts                # x402 HTTP client factory + balance/address reads
│   ├── nfd.ts                    # NFDomains (.algo/.nfd) name resolution
│   └── tools/                    # 11 MCP tool registrations
│       ├── check-balance.ts        transfer-usdc.ts     transfer-algo.ts
│       ├── pay.ts                  x402-fetch.ts        spending-report.ts
│       ├── request-funding.ts      tinyman-swap.ts      create-token.ts
│       └── bazaar-search.ts
├── __tests__/                  # 7 vitest files (1,084 lines TS) — unit tests w/ mocks
├── manifest.json               # Claude Desktop `.mcpb` extension manifest
├── scripts/build-mcpb.{sh,ps1} # bundles dist/ + prod deps + manifest into pixa.mcpb
├── pixa-hub-microservices-code/  # SEPARATE, unbuilt Hono+Postgres treasury service
├── example-apis/pizza-api-coinbase/  # SEPARATE, unbuilt x402 demo merchant API
├── tsup.config.ts              # ESM bundle → dist/index.js (2.04 MB)
├── tsconfig.json               # strict, path alias `@/*` → `./src/*`
├── vitest.config.ts            # same `@` alias
└── eslint.config.mjs + .prettierrc + .husky/pre-commit
```

Total TypeScript: **4,384 lines** (src 2,082 / tests 1,084 / subprojects 1,218).

### 1.2 Component diagram (as-built)

```
                 Claude Desktop / any MCP client
                            │ stdio (JSON-RPC)
                            ▼
                 ┌─────────────────────────┐
                 │  src/index.ts (entry)   │  console.log → stderr guard
                 └───────────┬─────────────┘
                             ▼
                 ┌─────────────────────────┐
                 │  src/server.ts          │  McpServer factory
                 │  + SpendingTracker      │
                 └───────────┬─────────────┘
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
  ┌───────────┐      ┌──────────────┐      ┌──────────────┐
  │ src/tools/│      │ src/clients.ts│      │ src/spending │
  │ 11 tools  │─────▶│ x402 client   │      │ Budget check │
  └───────────┘      │ factory       │      │ + history    │
        │            └──────┬───────┘      └──────────────┘
        │                   │
        │     ┌─────────────┼──────────────┬──────────────┐
        │     ▼             ▼              ▼              ▼
        │  @x402-avm/     @x402/core +   algod         NFD API
        │  core (AVM)     @x402/stellar  (algonode)    api.nf.domains
        │                 + @x402/evm    Algorand
        │                 + viem         RPC
        ▼
  Unified Agent Layer (hardcoded https://…railway.app) — discovery catalog
```

### 1.3 Data / persistence

| Store            | Location                           | Contents                                                                            | Durable?                 |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------- | ------------------------ |
| Wallet file      | `~/.x402/wallet.json` (mode 0600)  | `stellarSecret`, `evmPrivateKey`, `network` — **note: no `algorandMnemonic` field** | Yes                      |
| Spending history | in-process `SpendingTracker` array | last 10 payments, daily counter                                                     | **No — lost on restart** |
| Everything else  | —                                  | no DB, no cache, no memory layer                                                    | —                        |

There is **no persistence layer** in the root package. `pixa-hub` has Postgres/Drizzle but is
a separate, non-building subproject.

---

## 2. Existing Features (classified)

Legend: **W** = Implemented & working · **I** = Implemented but incomplete ·
**B** = Present but broken · **D** = Documented but missing · **N** = Not present

| #   | Feature                                                            | Status | Evidence                                                                                                                                               |
| --- | ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ | --------------------------------------------------------------------- |
| 1   | MCP server over stdio                                              | **W**  | `src/index.ts`, build succeeds, 11 tools register                                                                                                      |
| 2   | `check_balance` (USDC + native)                                    | **I**  | Works, but Algorand-only path; 1/4 unit tests fail                                                                                                     |
| 3   | `pay` — build x402 payment header                                  | **I**  | Signs and returns header; **never submits, never verifies settlement**, yet records spending                                                           |
| 4   | `x402_fetch` — 402 detect → sign → retry                           | **I**  | Full flow present; records spending regardless of paid-response status; 5/11 tests fail                                                                |
| 5   | `spending_report`                                                  | **W**  | Pure function over `SpendingTracker`; history not persisted                                                                                            |
| 6   | `search_bazaar` discovery                                          | **I**  | Service catalog is a **hardcoded array**; only the network/facilitator/payTo banner is fetched live                                                    |
| 7   | `transfer_usdc` / `transfer_algo`                                  | **W**  | Complete Algorand ASA/native transfer + confirmation wait                                                                                              |
| 8   | `request_funding`                                                  | **W**  | `algorand://` deep-link generation                                                                                                                     |
| 9   | `tinyman_swap_fixed_input/output`                                  | **W**  | 378 lines, complete Tinyman v2 swap implementation                                                                                                     |
| 10  | `create_token`                                                     | **W**  | ASA creation                                                                                                                                           |
| 11  | Budget limits (per-call / per-day)                                 | **W**  | `SpendingTracker`, 6 unit tests pass                                                                                                                   |
| 12  | NFD name resolution                                                | **W**  | `src/nfd.ts`                                                                                                                                           |
| 13  | Wallet config file                                                 | **B**  | `WalletFileConfig` **lacks `algorandMnemonic`**, so `config.ts:23` fails typecheck (TS2339) — the wallet-file mnemonic fallback has never type-checked |
| 14  | `.mcpb` one-click install                                          | **I**  | `scripts/build-mcpb.sh` exists; script has a bug (copies `$ROOT_DIR/PIXA-LOGO.PNG`, but logo is at `assets/PIXA-LOGO.PNG`)                             |
| 15  | Three autonomy modes (autonomous / session / human-in-the-loop)    | **D**  | README + 3 mermaid diagrams; **no session grants, no approval mechanism anywhere in `src/`**                                                           |
| 16  | "Mnemonics stored in OS keychain"                                  | **D**  | `wallet-store.ts` writes plain JSON with `0600`. **Not a keychain.** README claim is false.                                                            |
| 17  | "Transaction confirmation waits for on-chain finality" (x402 path) | **D**  | Only the _direct transfer_ tools wait for confirmation; `x402_fetch` does not                                                                          |
| 18  | Spending tracker persistence / audit trail across restarts         | **D**  | README claims "complete on-chain audit trail"; tracker is in-memory only                                                                               |
| 19  | Session-based time/amount grants                                   | **D**  | Not present                                                                                                                                            |
| 20  | Mudrex UPI onramp                                                  | **D**  | Roadmap only, zero code                                                                                                                                |
| 21  | Non-custodial treasury / multi-sig                                 | **D**  | Roadmap only                                                                                                                                           |
| 22  | Memory, learning, provider reputation                              | **N**  | Zero code, zero dependencies                                                                                                                           |
| 23  | User approval / policy engine                                      | **N**  | Zero code                                                                                                                                              |
| 24  | CI (`.github/`), `.env.example`, `.gitattributes`, `docs/`         | **N**  | None present                                                                                                                                           |
| 25  | Sui / Walrus / Tatum / MemWal                                      | **N**  | Repo-wide grep for `sui                                                                                                                                | walrus | memwal | tatum`→ **0 real matches** (only`package-lock.json` integrity hashes) |

---

## 3. Existing MCP Tool Inventory

11 tools registered in `src/server.ts`:

| Tool                        | File                       | Schema                                  | Algorand-specific?     |
| --------------------------- | -------------------------- | --------------------------------------- | ---------------------- |
| `check_balance`             | `tools/check-balance.ts`   | `{}`                                    | Yes (branch)           |
| `transfer_usdc`             | `tools/transfer-usdc.ts`   | `to, amount, network, note?`            | **Fully**              |
| `transfer_algo`             | `tools/transfer-algo.ts`   | `to, amount, network`                   | **Fully**              |
| `pay`                       | `tools/pay.ts`             | `amount, recipient, network, resource?` | Partial (network enum) |
| `x402_fetch`                | `tools/x402-fetch.ts`      | `url, method?, headers?, body?`         | Partial                |
| `spending_report`           | `tools/spending-report.ts` | `{}`                                    | No                     |
| `request_funding`           | `tools/request-funding.ts` | `currency, amount, note?, network`      | **Fully**              |
| `tinyman_swap_fixed_input`  | `tools/tinyman-swap.ts`    | swap params                             | **Fully**              |
| `tinyman_swap_fixed_output` | `tools/tinyman-swap.ts`    | swap params                             | **Fully**              |
| `create_token`              | `tools/create-token.ts`    | ASA params                              | **Fully**              |
| `search_bazaar`             | `tools/bazaar-search.ts`   | `query?`                                | No                     |

**Plan §9 target tools vs. reality:**

| Plan target                                                                    | Status                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| `search_bazaar`                                                                | exists (catalog hardcoded)                    |
| `discover_services`, `get_service_details`                                     | **missing**                                   |
| `check_balance`, `get_wallet_address`, `get_token_balance`                     | `check_balance` exists; other two **missing** |
| `pay`, `x402_fetch`                                                            | exist (unsafe, see §7)                        |
| `request_payment_approval`, `get_payment_status`, `get_transaction`            | **missing**                                   |
| `get_budget`, `set_budget`, `check_spending_limit`                             | **missing** (only `spending_report`)          |
| `remember`, `recall_memory`, `get_provider_reputation`, `get_user_preferences` | **missing** (no memory layer)                 |
| `spending_report`                                                              | exists                                        |

→ **Net: 4 of 17 target tools exist in usable form. 13 must be built.**

---

## 4. Algorand-Specific Dependencies and Files (removal inventory)

### 4.1 Dependencies (`package.json`)

| Package           | Version          | Role                                          | Action                        |
| ----------------- | ---------------- | --------------------------------------------- | ----------------------------- |
| `algosdk`         | ^3.5.2           | signing, algod RPC, ASA transfers, swaps      | **Remove**                    |
| `@x402-avm/avm`   | ^2.6.1           | AVM exact x402 scheme                         | **Remove**                    |
| `@x402-avm/core`  | ^2.6.1           | AVM x402 client                               | **Remove**                    |
| `@x402-avm/fetch` | ^2.6.1           | AVM x402 fetch (declared, **never imported**) | **Remove**                    |
| `@x402/core`      | ^2.8.0           | generic x402 client                           | Keep (protocol core)          |
| `@x402/evm`       | ^2.8.0           | EVM exact scheme                              | Decision point (§9)           |
| `@x402/stellar`   | ^2.8.0           | Stellar exact scheme                          | Decision point (§9)           |
| `viem`            | **not declared** | imported directly in `clients.ts`             | Phantom dependency — see §7.9 |

### 4.2 Files

**Delete outright (Algorand-only):**

- `src/nfd.ts`
- `src/tools/transfer-algo.ts`
- `src/tools/transfer-usdc.ts`
- `src/tools/tinyman-swap.ts`
- `src/tools/create-token.ts`
- `src/tools/request-funding.ts`

**Rewrite (mixed):**

- `src/clients.ts` — Algorand signer, AVM scheme registration, algod balance reads, CAIP-2 map, USDC ASA map
- `src/types.ts` — `PaymentNetwork` union, `algorandMnemonic`, `canPayAlgorand`, `mode`
- `src/config.ts` — `ALGORAND_MNEMONIC` / `NETWORK` handling, mode matrix
- `src/tools/check-balance.ts` — native ALGO branch
- `src/tools/pay.ts` — network enum, `getAssetAddress`, `getExtra`
- `src/tools/x402-fetch.ts` — `CAIP2_TO_NETWORK`, `isAlgorandNetwork` usage

**Rewrite (docs/packaging):**

- `README.md` — entire doc is Algorand-framed
- `manifest.json` — display name, description, `algorand_mnemonic` user config, tool list
- `scripts/build-mcpb.sh` / `build-mcpb.ps1` — logo path bug; Algorand framing

**Preserve unchanged:**

- `src/spending.ts` (extend, don't replace), `src/wallet-store.ts`, `src/server.ts` (registration pattern), `src/tools/spending-report.ts`, `src/tools/bazaar-search.ts` (re-point catalog), `src/index.ts` (stdout guard)

**Search terms verified repo-wide:** `algorand`, `algosdk`, `AVM`, `tinyman`, `@x402-avm`,
`nfd`, `algonode.cloud`, `ALGORAND_MNEMONIC`. Subprojects `pixa-hub` (algosdk dep + user
schema keyed on `algorand_addr`) and `manifest.json` also match.

---

## 5. Existing x402 Functionality

### 5.1 Client side (root package) — partial

- `createHttpClient()` (`clients.ts:54`) returns a `x402HTTPClient` bound to a network:
  - Algorand → `@x402-avm/core/client` + `registerExactAvmScheme`
  - Stellar/EVM → `@x402/core/client` + scheme registration
- `pay` builds a synthetic `PaymentRequired` body and returns the encoded signature header.
- `x402_fetch` implements the real loop: GET → 402 → parse (`Payment-Required` base64 header,
  fallback to body) → pick an acceptable network → budget check → sign → retry with
  `X-PAYMENT` / `PAYMENT-SIGNATURE` → return response.
- Handles both v1 (`X-PAYMENT`) and v2 (`PAYMENT-SIGNATURE`) header names.

### 5.2 Server side — only in unbuilt subprojects

- `example-apis/pizza-api-coinbase/` — a real x402 **resource server** (Hono
  `paymentMiddleware` + `x402ResourceServer` + `HTTPFacilitatorClient` pointing at Coinbase
  CDP, `ExactEvmScheme` on Base Sepolia, Bazaar discovery extension). Well-written, but:
  separate `package.json`, never built here, EVM-only.
- `pixa-hub-microservices-code/pixa-hub/` — a **custodial treasury** that signs x402
  payments on behalf of users against a Postgres ledger. Contains the _only_ idempotency /
  replay protection in the whole repo (`payment_attempts` unique on `correlation_id`,
  balance `FOR UPDATE`, refund-on-failure, audit `ledger_entries` + `treasury_records`).
  Also never built; mixed `x402@1` + `@x402/evm@2` dependency versions.

### 5.3 Facilitator

**The root package never contacts a facilitator.** It only _creates_ payment headers.
Settlement is assumed to happen server-side at the resource the agent fetches. There is no
`verify`/`settle` call, no receipt parsing, no transaction digest extraction anywhere in `src/`.

---

## 6. Existing Payment Flow (as-built, `x402_fetch`)

```
agent ──▶ x402_fetch(url)
           │
           ├─ 1. fetch(url)                       ← no allowlist, any URL
           ├─ 2. status ≠ 402 → return body       ← OK
           ├─ 3. status = 402 → parse Payment-Required (header base64 | body)
           ├─ 4. accepts[] → find first network we hold a key for
           ├─ 5. spending.check(amount)           ← per-call + daily limit
           ├─ 6. createPaymentPayload + encode    ← SIGN
           ├─ 7. fetch(url, X-PAYMENT)            ← SETTLE (by resource server)
           ├─ 8. spending.record(amount)          ← UNCONDITIONAL, even if step 7 ≠ 2xx
           └─ 9. return response                  ← no digest, no receipt, no verification
```

**Missing vs. plan §5:** network/token/recipient validation, approval gate, duplicate-payment
prevention, replay protection, explicit payment states, settlement verification, Tatum
verification, memory write.

---

## 7. Existing Security Problems

| #    | Severity     | Problem                                                                                                                                                 | Location                |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 7.1  | **Critical** | 25-word mnemonic supplied via MCP `env` block → visible in process environment of the MCP host, and to any child process                                | README, `manifest.json` |
| 7.2  | **High**     | Mnemonic fallback stored as **plaintext JSON** (`~/.x402/wallet.json`), while README claims "secure key storage — mnemonics stored in OS keychain"      | `wallet-store.ts`       |
| 7.3  | **High**     | `pay` records spending and returns success after _signing only_ — no settlement, no verification → false-success path                                   | `pay.ts:110`            |
| 7.4  | **High**     | `x402_fetch` records spending even when the paid response is 4xx/5xx → budget consumed with no service delivered                                        | `x402-fetch.ts:241`     |
| 7.5  | **High**     | No payment state machine, no idempotency key, no replay protection in the active runtime (the subproject that has it is not wired in)                   | `src/`                  |
| 7.6  | **High**     | No approval mechanism despite README advertising human-in-the-loop mode; the LLM can spend up to `MAX_PER_DAY` unattended                               | —                       |
| 7.7  | **Medium**   | No recipient validation/allowlist — `pay` will sign to any address the model supplies                                                                   | `pay.ts`                |
| 7.8  | **Medium**   | No environment validation: missing keys silently degrade to `READ_ONLY` with no warning at startup                                                      | `config.ts`             |
| 7.9  | **Medium**   | `viem` imported directly but **not a declared dependency** (resolved only via hoisting from `@x402/evm`) — a transitive upgrade can break the build     | `clients.ts:92-94`      |
| 7.10 | **Medium**   | `.gitignore` does **not** ignore `.env` → `.env` can be committed                                                                                       | `.gitignore`            |
| 7.11 | **Medium**   | Network is chosen per-call by the model (`pay.network` enum) while `config.network` governs `check_balance` → inconsistent, silently switchable network | `pay.ts`, `config.ts`   |
| 7.12 | **Medium**   | Spending history is in-memory only → daily budget resets to zero on every restart; daily cap is trivially bypassed by restarting the MCP server         | `spending.ts`           |
| 7.13 | **Low**      | `x402_fetch` fetches arbitrary caller-supplied URLs (SSRF surface) with no scheme/host allowlist                                                        | `x402-fetch.ts`         |
| 7.14 | **Low**      | 3 `@typescript-eslint/no-explicit-any` warnings; `createHttpClient` returns `any`                                                                       | `clients.ts`            |
| 7.15 | **Low**      | No `.gitattributes` → Windows checkout with `core.autocrlf=true` produces CRLF, breaking `prettier` (`endOfLine: "lf"`)                                 | repo root               |

---

## 8. Existing Tests and Their Results

### 8.1 Baseline gate results (run on pristine `a06fae5`)

| Gate       | Command                | Result                                                                                                                |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Install    | `npm ci`               | ✅ exit 0 (385 packages)                                                                                              |
| Unit tests | `npm test` (vitest)    | ❌ **8 failed / 51 passed (59 total)**, 4 of 7 files affected                                                         |
| Typecheck  | `tsc --noEmit`         | ❌ **exit 2** — `src/config.ts(23,46): TS2339: Property 'algorandMnemonic' does not exist on type 'WalletFileConfig'` |
| Lint       | `eslint src/`          | ❌ **2,311 errors + 3 warnings**                                                                                      |
| Build      | `npm run build` (tsup) | ✅ exit 0 — `dist/index.js` 2.04 MB                                                                                   |
| Format     | `prettier --check`     | ❌ (same CRLF cause as lint)                                                                                          |

### 8.2 The 8 failing tests

| File                    | Failing test                                                    | Root cause                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.test.ts`        | `uses default network stellar`                                  | Test written when default was `stellar`; `config.ts:26` now defaults to `algorand-testnet`                                                                                        |
| `check-balance.test.ts` | `returns balance and address on success`                        | Assertions predate the Algorand branch added to `check_balance`                                                                                                                   |
| `pay.test.ts`           | `includes EIP-712 domain params in extra for EVM networks`      | Mock of `../src/clients.js` no longer matches real module exports                                                                                                                 |
| `x402-fetch.test.ts`    | `returns response directly when status is not 402`              | mock drift (see below)                                                                                                                                                            |
| `x402-fetch.test.ts`    | `handles 402 and retries with payment header`                   | mock drift — returns error string instead of JSON                                                                                                                                 |
| `x402-fetch.test.ts`    | `parses payment info from base64 Payment-Required header`       | mock drift — `JSON.parse` on an error string                                                                                                                                      |
| `x402-fetch.test.ts`    | `returns error when wallet cannot fulfill any accepted network` | **`vi.mock('../src/clients.js')` does not export `isAlgorandNetwork`**, which `x402-fetch.ts:5` now imports → `SyntaxError: No "isAlgorandNetwork" export is defined on the mock` |
| `x402-fetch.test.ts`    | `records spending after successful paid fetch`                  | expected 0.05, got 0 (flow errored before `record`)                                                                                                                               |

**Diagnosis:** tests were written against the Stellar/EVM-era codebase; the Algorand feature
wave changed `config.ts` defaults, `clients.ts` exports, and tool behaviour **without updating
any test**. This is mock drift, not a deep logic failure — the 51 passing tests cover the
budget tracker, wallet store, network helpers and happy paths correctly.

### 8.3 Lint diagnosis

All 2,311 errors are `prettier/prettier: Delete ␍` (CRLF). `.prettierrc` sets
`endOfLine: "lf"`; `git config core.autocrlf` is `true` on this machine and the repo has no
`.gitattributes`, so every checked-out line is CRLF. **This is a Windows-checkout artifact,
not a source defect.** The only genuine lint findings are 3 `no-explicit-any` warnings.

### 8.4 Test architecture

All 7 files are **pure unit tests with `vi.mock`** — no network, no chain, no fixtures.
There are **no integration tests, no E2E tests, and no test for `search_bazaar`,
`transfer_*`, `tinyman_*`, `create_token`, `request_funding`, or `spending_report`**.

---

## 9. Missing Capabilities (vs. target product)

1. **Sui** — client, signer, balance, transfer, tx execution/verification. Nothing.
2. **Tatum** — no API key handling, no RPC client, no transaction verification. Nothing.
3. **Walrus/MemWal** — no memory write, recall, namespaces, or lifecycle. Nothing.
4. **Memory-driven commerce** — provider selector, decision engine, provider scoring,
   reputation, learning. Nothing.
5. **Spending policy engine** — only two numeric limits; no per-category limits, no
   recipient blocklist, no new-provider rule, no LLM-independent policy layer.
6. **Approval workflow** — no `AWAITING_APPROVAL` state, no approval tool, no approval UI.
7. **Payment state machine** — no explicit states, no idempotency, no replay guard.
8. **Settlement verification** — no facilitator interaction, no digest extraction.
9. **13 of 17 target MCP tools** (see §3).
10. **Configuration hygiene** — no `.env.example`, no env validation, no network banner.
11. **Engineering hygiene** — no CI, no `docs/`, no `.gitattributes`, no integration tests.
12. **Both required payment-path halves** — root package signs but never settles/verifies;
    `pixa-hub` settles but is not wired in and is EVM/Algorand-framed.

---

## 10. Recommended Migration Strategy

### 10.1 Strategy: **strangler migration on a preserved trunk**

Not a rewrite, not a delete-and-rebuild. The root MCP package has a clean registration
pattern, a tested budget tracker, and a working 402 orchestration loop — those are worth
keeping. The strategy is:

1. **Preserve first.** Create `feature/sui-walrus-tatum-migration` from pristine `main`
   before any edit. `main` remains the rollback.
2. **Fix the baseline before removing anything.** The repo does not typecheck and 8 tests
   fail on arrival. Establishing a green gate _first_ means every later phase has a
   meaningful signal. (Deliberately ordered before Phase 1 — see 10.3.)
3. **Strip Algorand along the seams already identified in §4**, replacing `clients.ts` with
   a chain-adapter interface so Sui slots in behind the same tool surface.
4. **Add new capability as new directories** (`server/blockchain/sui`,
   `server/blockchain/tatum`, `server/memory`, `server/commerce`) — the plan's prescribed
   layout — leaving `src/tools/*` as thin MCP adapters over them.
5. **Re-point, don't rewrite, the reusable parts:** `SpendingTracker` → policy engine,
   `x402_fetch` → payment state machine, `bazaar-search` → discovery.
6. **Gate every phase** with the loop A→G from plan §14 and a green `npm test`.

### 10.2 Subprojects: quarantine, don't delete

`pixa-hub` and `example-apis` are Algorand/EVM-framed and do not build as part of the root
package. They contain two things worth harvesting: **the idempotent payment-attempt ledger
pattern** (`pixa-hub/src/api/pay.ts`) and **a real x402 resource server** for local E2E
testing of the 402 flow (`example-apis/pizza-api-coinbase`).

**Recommendation:** leave both directories untouched in Phase 1 (they are not in the active
runtime, so they do not violate the "no Algorand in active runtime" gate), and decide in
Phase 3 whether to (a) adapt `pizza-api-coinbase` into a clearly-labelled local 402 mock
resource server for the E2E demo, or (b) build a fresh Sui-402 mock. Deleting them now
would discard the only working settlement reference in the repository.

### 10.3 Proposed target architecture

```
                        MCP client (Claude / agent runtime)
                                       │ stdio
                                       ▼
                    ┌────────────────────────────────────┐
                    │  src/server.ts — tool registry      │
                    └───────────────┬────────────────────┘
                                    │
     ┌──────────────┬───────────────┼───────────────┬──────────────┐
     ▼              ▼               ▼               ▼              ▼
 tools/discovery  tools/wallet   tools/payment   tools/budget   tools/memory
     │              │               │               │              │
     ▼              ▼               ▼               ▼              ▼
┌─────────┐   ┌───────────┐   ┌──────────────┐   ┌────────┐   ┌──────────────┐
│ bazaar  │   │ server/   │   │ server/      │   │server/ │   │ server/      │
│ catalog │   │blockchain/│   │commerce/     │   │commerce│   │ memory/      │
│         │   │  sui/     │   │ paymentState │   │spending│   │ walrusClient │
└─────────┘   │ suiClient │   │ approvalEngine│  │Policy  │   │ memoryRecall │
              │ suiWallet │   │ providerSelect│  └────────┘   │ memoryWriter │
              │ suiBalance│   │ providerScoring│              │ reputation   │
              │ suiTransfer│  └──────┬───────┘                │ spendingLearn│
              │ suiTx     │         │                        └──────┬───────┘
              └─────┬─────┘         │                               │
                    │               │                               │
                    ▼               ▼                               ▼
              ┌──────────┐   ┌──────────────┐                ┌─────────────┐
              │ blockchain/│  │ x402 client  │                │ MemWal SDK  │
              │  tatum/   │  │ (402 protocol)│                │ (relayer)   │
              │ payment-  │  └──────┬───────┘                └─────────────┘
              │ verifier  │         │
              └─────┬─────┘         ▼
                    │        HTTP 402 resource / facilitator
                    ▼
              Tatum Sui RPC (read + verify only — never signs, never settles)
```

**Hard boundaries (plan §4, §6, §7):**

- LLM never sees a key; signing happens in `blockchain/sui/suiWallet.ts` only.
- Tatum **reads/verifies only** — never signs, never acts as facilitator.
- Policy engine is independent of the LLM and cannot be overridden by it.
- Memory writes go through MemWal SDK only; no custom storage protocol.

### 10.4 Decision required before Phase 3 (x402 × Sui)

Evidence gathered from the npm registry (2026-11-08):

- The **x402 Foundation publishes no Sui package**. Official: `@x402/core`, `@x402/evm`,
  `@x402/svm` (Solana), `@x402/stellar`, `@x402/extensions`.
- Community Sui candidates:

| Package                  | Version | Weekly downloads | Notes                                                                                                                   |
| ------------------------ | ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@t2000/sui-x402`        | 11.7.0  | ~1,400           | Most complete description: exact scheme, sign-then-settle, requirements builder, **digest replay store**, verify/settle |
| `x402-sui`               | 2.0.1   | ~26              | Single maintainer, "x402 V2 for Sui"                                                                                    |
| `@altaga/x402-sui`       | 1.3.0   | ~12              | Sponsored-transaction focus                                                                                             |
| `@agentpay-sui/x402-sui` | 0.1.0   | ~9               | Adapter for a separate AgentPay flow                                                                                    |

**This is a genuine open risk** (plan §5 explicitly requires this research before selecting
dependencies). Options for Phase 3:

- **(A)** Adopt `@t2000/sui-x402` after a security/compat review — fastest, third-party trust.
- **(B)** Implement the `exact` scheme against `@x402/core`'s scheme interface ourselves, using
  `@mysten/sui` for signing — most control, most work, no third-party payment code.
- **(C)** Ship a **clearly labelled local 402 mock** for the demo flow (plan §11 explicitly
  permits this) while doing real Sui/Tatum/Walrus work on-chain, and treat real Sui-x402
  settlement as a stretch goal.

Recommendation: **investigate (A) vs (B) during Phase 3 Loop A, with (C) as the guaranteed
fallback.** Do not commit before that investigation.

### 10.5 Confirmed external facts (fetched, not assumed)

| Fact                                                                                                                                               | Source                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| MemWal TS SDK = `@mysten-incubation/memwal`, methods `remember / recall / analyze / ask / restore / health`                                        | docs.wal.app/walrus-memory/sdk/overview             |
| Config = `key` (Ed25519 delegate key, hex or `suiprivkey1…`), `account_id`, `server_url`, `namespace` → matches plan's `MEMWAL_*` env vars exactly | same                                                |
| Managed mainnet relayer = `https://relayer.memory.walrus.xyz`                                                                                      | same                                                |
| Walrus Memory is **Sui-only for ownership** — a natural fit for the Sui migration                                                                  | docs.wal.app/walrus-memory                          |
| Tatum runs **Sui RPC nodes**; `unsafe_*` Sui methods are **not supported**; use Programmable Transaction Builder (`pay_sui`, `moveCall`)           | docs.tatum.io/docs/sui-unsafe-methods-not-supported |
| `@mysten/sui` current version **2.39.1** (official, Apache-2.0)                                                                                    | npm registry 2026-11-08                             |
| No official `@x402/sui` exists                                                                                                                     | npm registry 2026-11-08                             |

**Not yet verified (Phase 3/4 research tasks):** whether Tatum's Sui endpoint whitelists
`sui_executeTransactionBlock` and `sui_getBalance`; which facilitator, if any, settles Sui.

---

## 11. Phase Zero Completion Gate

| Requirement                              | Status                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Existing features mapped                 | ✅ §2 (25 items classified)                                        |
| Existing architecture documented         | ✅ §1 (diagrams, data stores, LOC)                                 |
| Dependencies understood                  | ✅ §4.1, §10.5                                                     |
| Migration plan written                   | ✅ `docs/MIGRATION_PLAN.md`                                        |
| Original implementation preserved in Git | ✅ cloned at `a06fae5`, `main` untouched, no source files modified |

**Gate: OPEN.** Destructive migration may begin once the findings below are accepted.
