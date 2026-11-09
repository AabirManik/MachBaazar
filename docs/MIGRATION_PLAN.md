# Pixa — Migration Plan (Sui × x402 × Tatum × Walrus)

> **Phase Zero deliverable.** Companion to `REVERSE_ENGINEERING_REPORT.md`.
> Covers: file-by-file migration, dependency migration, test strategy, risk/blocker list,
> and phase order.
>
> **Execution status:** each section carries a ✅/⏳ marker as it is completed; live status
> lives in `IMPLEMENTATION_PROGRESS.md`.

---

## 1. File-by-File Migration Plan

### 1.1 Phase 1 — Remove Algorand/AVM (active runtime only)

| Action     | Path                                                                                                                   | Notes                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DELETE     | `src/nfd.ts`                                                                                                           | NFDomains is Algorand-only                                                                                                                                                        |
| DELETE     | `src/tools/transfer-algo.ts`                                                                                           | native ALGO transfer                                                                                                                                                              |
| DELETE     | `src/tools/transfer-usdc.ts`                                                                                           | ASA transfer + NFD                                                                                                                                                                |
| DELETE     | `src/tools/tinyman-swap.ts`                                                                                            | 378 lines, Algorand DEX                                                                                                                                                           |
| DELETE     | `src/tools/create-token.ts`                                                                                            | ASA creation                                                                                                                                                                      |
| DELETE     | `src/tools/request-funding.ts`                                                                                         | `algorand://` deep links                                                                                                                                                          |
| REWRITE    | `src/clients.ts`                                                                                                       | → chain-adapter interface (`createHttpClient`, `getWalletAddress`, `getUsdcBalance`). Keep signatures, swap bodies. Add `isSuiNetwork`.                                           |
| REWRITE    | `src/types.ts`                                                                                                         | `PaymentNetwork` → `'sui' \| 'sui-testnet'` (+ any retained chains). Drop `algorandMnemonic`, `canPayAlgorand`. Fix `WalletFileConfig` (add `suiPrivateKey`, fix the TS2339 bug). |
| REWRITE    | `src/config.ts`                                                                                                        | Replace `ALGORAND_MNEMONIC` with `SUI_PRIVATE_KEY`; replace `NETWORK` with `SUI_NETWORK`; add env validation; print explicit network banner.                                      |
| REWRITE    | `src/tools/check-balance.ts`                                                                                           | drop ALGO branch; SUI + USDC via Tatum                                                                                                                                            |
| REWRITE    | `src/tools/pay.ts`                                                                                                     | network enum, `getAssetAddress`, `getExtra` → Sui                                                                                                                                 |
| REWRITE    | `src/tools/x402-fetch.ts`                                                                                              | `CAIP2_TO_NETWORK` → Sui CAIP-2; add settlement-verification hook                                                                                                                 |
| REWRITE    | `src/server.ts`                                                                                                        | drop 6 registrations, add new ones                                                                                                                                                |
| REWRITE    | `README.md`, `manifest.json`, `scripts/build-mcpb.*`                                                                   | Algorand framing out; fix `assets/PIXA-LOGO.PNG` path bug                                                                                                                         |
| ADD        | `.env.example`                                                                                                         | placeholders only                                                                                                                                                                 |
| ADD        | `.gitignore` entry                                                                                                     | `.env` (currently missing)                                                                                                                                                        |
| ADD        | `.gitattributes`                                                                                                       | `* text=auto eol=lf` → fixes the 2,311 CRLF lint errors                                                                                                                           |
| KEEP       | `src/index.ts`, `src/spending.ts`, `src/wallet-store.ts`, `src/tools/spending-report.ts`, `src/tools/bazaar-search.ts` | extend later, don't rewrite now                                                                                                                                                   |
| QUARANTINE | `pixa-hub-microservices-code/`, `example-apis/`                                                                        | not in active runtime; leave untouched this phase                                                                                                                                 |

**Acceptance gate (Phase 1):** `grep -ri "algosdk\|algorand\|@x402-avm\|tinyman\|algonode" src/`
returns zero hits in active code; `npm test` green; `tsc --noEmit` green; build green.

> **✅ EXECUTED 2026-11-08 — scope adjusted to Option A (D12).** See
> `IMPLEMENTATION_PROGRESS.md` § Phase 1.
>
> The table above assumed Sui would land in the same pass. Per D12, Phase 1 removed
> **Algorand/AVM only**, keeping Stellar and EVM functional so `check_balance` / `pay` /
> `x402_fetch` never became non-functional stubs. Concretely:
>
> - **Done here:** all 6 `DELETE` rows; Algorand paths stripped from `clients.ts`,
>   `types.ts`, `config.ts`, `check-balance.ts`, `pay.ts`, `x402-fetch.ts`, `server.ts`;
>   the 4 Algorand deps removed; `README.md` + `manifest.json` + `.env.example` +
>   `scripts/build-mcpb.*` (R13 logo bug fixed).
> - **Deferred to Phase 2** (the Sui rows): `isSuiNetwork`, `PaymentNetwork` → Sui,
>   `SUI_PRIVATE_KEY` / `SUI_NETWORK`, Sui CAIP-2, Tatum-backed balance, settlement hook.
> - **Deferred to Phase 2.5** (new, post-Sui): drop Stellar + EVM + `@x402/stellar` +
>   `@x402/evm` + the undeclared `viem` phantom dependency.
> - **Done in Phase 0.5** (the two `ADD` rows above): `.gitattributes` and the `.env`
>   `.gitignore` entry.
> - **Acceptance gate: PASSED** — zero hits across `src/`, `__tests__/`, `package-lock.json`
>   and the built `dist/index.js`; `npm run check` exits 0 with 59/59 tests.

### 1.2 Phase 2 — Sui adapter (new files, plan §4 layout)

```
src/blockchain/sui/
├── suiClient.ts        # SuiClient, network selection from SUI_NETWORK
├── suiWallet.ts        # key handling, address derivation — the ONLY key holder
├── suiBalance.ts       # SUI + USDC coin balances, coin objects
├── suiTransfer.ts      # PTB transfer construction
├── suiTransaction.ts   # sign / execute / digest / effects / failure handling
└── suiCoinUtils.ts     # decimals, atomic conversion, USDC type args
```

Separation enforced: **construct → sign → submit → verify** are four functions; no LLM
input reaches `suiWallet` beyond "which configured key".

### 1.3 Phase 4 — Tatum (new files, plan §6 layout)

```
src/blockchain/tatum/
├── tatumClient.ts        # API key auth, mainnet/testnet endpoints, timeout/retry/rate-limit
├── balanceService.ts     # SUI + token balances
├── transactionService.ts # tx info, effects, balance changes, events
├── coinService.ts        # coin metadata/objects
└── paymentVerifier.ts    # digest → status → recipient/token/amount match → boolean verdict
```

`paymentVerifier.ts` is the component the rest of the system trusts: it is the only thing
allowed to move a payment to `SETTLED`.

### 1.4 Phase 5 — Walrus Memory (new files, plan §7 layout)

```
src/memory/
├── walrusClient.ts       # MemWal client init from MEMWAL_* env
├── memoryWriter.ts       # event → sanitized structured memory → remember() → job id
├── memoryRecall.ts       # query → recall() → rank → context slice
├── memoryExtractor.ts    # raw event → memory record (5 categories: preferences,
│                         #   transaction, provider reputation, spending, agent decisions)
├── memoryLifecycle.ts    # write states, failure handling, never claim unconfirmed writes
├── memoryContext.ts      # namespaces, redaction (never store keys/tokens/secrets)
├── providerReputation.ts # success rate / avg price from REAL stored data only
└── spendingLearning.ts   # budget trends, approval history
```

### 1.5 Phase 6 — Commerce engine (new files, plan §8 layout)

```
src/commerce/
├── providerSelector.ts
├── decisionEngine.ts
├── spendingPolicy.ts        # LLM-independent policy layer (limits, blocklist, thresholds)
├── approvalEngine.ts        # AWAITING_APPROVAL state + approval records
├── providerScoring.ts       # transparent, explainable, computed from stored data
└── memoryDecisionContext.ts # ranks recalled memories into a decision context
```

### 1.6 Phase 7 — MCP tool surface

Restructure `src/tools/` toward the 17 target tools (plan §9), each thin over the backends
above. Keep existing names where they already match (`check_balance`, `pay`, `x402_fetch`,
`spending_report`, `search_bazaar`).

---

## 2. Dependency Migration Plan

### 2.1 Remove

`algosdk`, `@x402-avm/avm`, `@x402-avm/core`, `@x402-avm/fetch` (declared but never imported).

### 2.2 Add (high confidence — verified 2026-11-08)

| Package                     | Version | Purpose                 | Evidence                                    |
| --------------------------- | ------- | ----------------------- | ------------------------------------------- |
| `@mysten/sui`               | ^2.39.1 | Sui client, signer, PTB | official MystenLabs, 2.26M weekly downloads |
| `@mysten-incubation/memwal` | latest  | Walrus Memory SDK       | docs.wal.app SDK overview                   |

### 2.3 Add (pending Phase 3 research — see §4.3)

| Package              | Candidate                                                                  | Risk                                               |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| Sui x402 scheme      | `@t2000/sui-x402` **or** self-implemented `exact` scheme over `@x402/core` | third-party payment code vs. implementation effort |
| Sui x402 facilitator | TBD — no known Sui facilitator confirmed                                   | may force the labelled-mock fallback               |

### 2.4 Keep / decide

| Package         | Current        | Recommendation                                                                                      |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `@x402/core`    | ^2.8.0         | **Keep** — protocol core, scheme interface                                                          |
| `@x402/evm`     | ^2.8.0         | Decision point A (§4.1)                                                                             |
| `@x402/stellar` | ^2.8.0         | Decision point A (§4.1)                                                                             |
| `viem`          | **undeclared** | Remove if EVM/Stellar are dropped; otherwise **declare it explicitly** (fixes phantom-dep risk 7.9) |

### 2.5 Tooling

Add `prettier` `endOfLine` already `lf` + new `.gitattributes` (fixes lint baseline).
No framework changes: **Vitest stays** (already in use, matches your choice).

---

## 3. Test Strategy (plan §9)

### 3.1 Baseline repair — **do this first, before Phase 1**

The repo does not typecheck and 8 tests fail on arrival. Establishing green _before_
removing Algorand means every subsequent phase has a trustworthy signal.

1. Fix `WalletFileConfig` missing `algorandMnemonic` (TS2339) — root-cause type bug.
2. Repair the 8 mock-drift failures (add `isAlgorandNetwork` to the `clients.js` mock,
   update `config.test.ts` default-network expectation, align `check-balance`/`pay` mocks).
3. Add `.gitattributes` (`eol=lf`) → clears 2,311 CRLF lint errors without mass reformatting.
4. Declare `viem` or remove its usage.
5. **Gate:** `npm test` + `tsc --noEmit` + `eslint src/` + `npm run build` all exit 0.

> Note: these repairs touch tests and types only — no behavioural source changes — so they
> are safe on a clean branch and do not weaken the "no destructive edits before review" rule.

### 3.2 Unit tests (per phase)

| Area                 | Tests                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| Budget/policy        | limits, daily rollover, category caps, blocklist, threshold→approval  |
| Approval             | state transitions, expiry, rejection, LLM cannot self-approve         |
| Provider scoring     | weighting, explanation string, "no invented scores" guard             |
| Memory extraction    | 5 categories, redaction (assert no key/secret patterns ever stored)   |
| Payment requirements | network/token/amount/recipient validation, malformed 402, hostile 402 |
| Payment states       | full transition matrix incl. illegal transitions                      |
| Tatum parsing        | balance, effects, balance-changes, status mapping, error/429/timeout  |

### 3.3 Integration tests (per phase, Testnet)

- MCP tool invocation over real stdio transport
- Sui Testnet balance lookup via Tatum
- Sui transaction construction + **signature-only** (no broadcast) assertion
- 402 challenge handling against a local labelled mock
- Tatum RPC queries (requires `TATUM_API_KEY`)
- MemWal **Testnet** memory write + recall round-trip (requires `MEMWAL_*`)

### 3.4 End-to-end scenario (plan §11 — 13 steps)

Implement as a scripted demo: request → discovery → recall → budget → 402 → validate →
approve → Testnet payment → Tatum verify → result → memory write → second request →
improved recommendation.

**Mock honesty rule:** any local 402/facilitator mock is labelled `LOCAL_MOCK` in output and
docs. Never present mock settlement as a real payment.

### 3.5 CI

Add `.github/workflows/ci.yml`: `npm ci` → `tsc --noEmit` → `eslint src/` → `prettier --check`
→ `vitest run` → `npm run build`. Live-network tests gated behind `RUN_LIVE_TESTS=1`.

---

## 4. Risk and Blocker List

| #       | Type         | Risk / Blocker                                                                                                                              | Impact                                                                    | Mitigation                                                                                                              |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **R1**  | **Critical** | **No official x402 Sui package.** Foundation ships EVM/SVM/Stellar only.                                                                    | Phase 3 cannot proceed without a decision                                 | Research `@t2000/sui-x402` vs. self-implement `exact` in Phase 3 Loop A; labelled local 402 mock as guaranteed fallback |
| **R2**  | **Critical** | **No confirmed Sui x402 facilitator.**                                                                                                      | Real settlement may be impossible within hackathon window                 | Fallback C: mock 402 flow + real Sui/Tatum/Walrus on-chain work; document honestly                                      |
| **R3**  | High         | **No credentials available yet** (Tatum, MemWal, Sui key).                                                                                  | Live integration tests blocked                                            | Build everything config-ready with `.env.example`; run live tests when keys arrive; all unit tests mock-based meanwhile |
| **R4**  | High         | **10 Mainnet Walrus Memory writes required**, account creation/delegate registration may cost money.                                        | Hackathon acceptance                                                      | Develop on Testnet first; budget for Mainnet account early; keep owner wallet and delegate credential separate          |
| **R5**  | High         | **Baseline is red** (typecheck fails, 8 tests fail).                                                                                        | Every phase's gate is meaningless until fixed                             | §3.1 baseline repair as the first engineering loop                                                                      |
| **R6**  | High         | **No persistence** — spending history is in-memory; daily budget resets on restart.                                                         | Budget controls are bypassable; hackathon "budget controls" claim weakens | Add durable spending store in Phase 6 (SQLite/JSON file at minimum)                                                     |
| **R7**  | Medium       | **Secrets model** — mnemonic via MCP `env` block + plaintext wallet JSON.                                                                   | Security review failure; key leakage                                      | Phase 8: OS keychain/`PAYMENT_SIGNER_MODE`, never log keys, `.env` gitignored, env validation                           |
| **R8**  | Medium       | **Tatum Sui method coverage unverified** — `unsafe_*` are excluded; `sui_executeTransactionBlock`/`sui_getBalance` whitelist not confirmed. | Phase 4 design may need to change                                         | Verify exact methods against Tatum docs in Phase 4 Loop A before writing client code                                    |
| **R9**  | Medium       | **Third-party payment code** (`@t2000/*`) would sit on the signing path.                                                                    | Supply-chain / fund risk                                                  | Security review, pin exact versions, prefer self-implemented scheme if review is negative                               |
| **R10** | Medium       | **CRLF/`core.autocrlf`** on Windows breaks prettier on every checkout.                                                                      | Lint gate permanently red                                                 | `.gitattributes` with `eol=lf`                                                                                          |
| **R11** | Medium       | **Subprojects are unmaintained** (mixed `x402@1` + `@x402/evm@2`, never built).                                                             | Dead weight, confusing for judges                                         | Quarantine in Phase 1; harvest idempotency pattern + resource-server reference; document status                         |
| **R12** | Low          | **Hardcoded discovery catalog** in `search_bazaar`.                                                                                         | "Discovery" is partly fake                                                | Re-point to a real registry in Phase 6 or clearly document the catalog as static                                        |
| **R13** | Low          | `build-mcpb.sh` copies logo from wrong path.                                                                                                | `.mcpb` bundle missing icon                                               | Fix in Phase 1 packaging pass                                                                                           |
| **R14** | Low          | Web search unavailable in this environment (search API returns HTTP 402).                                                                   | External research slower                                                  | Use direct doc/npm fetches instead (already done for Tatum, MemWal, x402)                                               |

### Documented blockers

None yet. If a credential or service prevents completion of a phase, that phase's loop will
record it here and continue with independent work (plan §14, Loop G).

---

## 5. Estimated Phase Order

| Order   | Phase                         | Scope                                          | Depends on | Est. relative effort                                                                  |
| ------- | ----------------------------- | ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| **0**   | Repository investigation      | ✅ **DONE** — this report + plan               | —          | —                                                                                     |
| **0.5** | **Baseline repair**           | ✅ **DONE** — green typecheck/tests/lint/build | 0          | **S** (unplanned in original plan; added because R5 makes all later gates unreliable) |
| **1**   | Remove Algorand/AVM           | ✅ **DONE** — Option A scope (D12), §1.1       | 0.5        | **M**                                                                                 |
| **2**   | Sui blockchain adapter        | ✅ **DONE** — §1.2, `src/blockchain/sui/`      | 1          | **L**                                                                                 |
| **2.5** | Drop Stellar + EVM            | ✅ **DONE** — Sui-only end state (D13)         | 2          | **S**                                                                                 |
| **3**   | Sui x402 payment integration  | research → choose R1/R2 path                   | 2          | **L + research**                                                                      |
| **4**   | Tatum Sui RPC                 | §1.3 (verify R8 first)                         | 2          | **M**                                                                                 |
| **5**   | Walrus Memory                 | §1.4 (Testnet first)                           | 0          | **M**                                                                                 |
| **6**   | Memory-driven commerce engine | §1.5 (+ durable store, R6)                     | 5          | **L**                                                                                 |
| **7**   | MCP server upgrade            | §1.6 → 17 tools                                | 3,4,5,6    | **M**                                                                                 |
| **8**   | Configuration & security      | env validation, signer modes, keychain         | 2          | **M**                                                                                 |
| **9**   | Testing & validation          | §3.2–3.4, E2E demo                             | all        | **L**                                                                                 |
| **10**  | Hackathon readiness           | 10 Mainnet memory writes, demo, repo polish    | 9          | **M**                                                                                 |
| **11**  | Documentation                 | 11 docs from plan §13                          | all        | **M**                                                                                 |

**Parallelisable:** Phase 5 (Walrus) has no dependency on Phases 2–4 and can start after 0.5.
Phase 4 (Tatum) only needs Phase 2 for the wallet address it verifies.

**Critical path:** 1 → 2 → 3 → 7 → 9 → 10.

---

## 6. Acceptance Criteria Mapping

| Plan §15 criterion                              | Where it gets satisfied                           |
| ----------------------------------------------- | ------------------------------------------------- |
| Algorand/AVM removed from active runtime        | ✅ **SATISFIED** — Phase 1 gate passed 2026-11-08 |
| Sui is active blockchain                        | ✅ **SATISFIED** — Phases 2 + 2.5 gates passed    |
| x402 integrated with compatible Sui flow        | Phase 3 gate (or documented mock fallback)        |
| Tatum used for real reads + tx verification     | Phase 4 gate                                      |
| Walrus Memory integrated                        | Phase 5 gate                                      |
| Pixa recalls experience + improves decisions    | Phase 6 gate                                      |
| Spending controls and approval work             | Phase 6 gate (+ durable store)                    |
| Project builds / tests pass / secrets protected | Phases 0.5, 8, 9                                  |
| 10 Mainnet memory writes confirmed              | Phase 10                                          |
| E2E demo, public repo, docs, blog, video        | Phases 10–11                                      |
