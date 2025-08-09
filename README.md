# 📽️ Demo

[Watch the full walkthrough »](https://github.com/user-attachments/assets/7a946a2e-6154-48b5-a651-f62ee8c0b52f)

> Prefer video? Skip straight to the 3-minute demo above.

---

# Token-2022 Transfer-Hook AMM ("Reel")

Trade real-world-asset (RWA) tokens on Solana – **with Transfer Hooks fully enforced**.

This repository is our submission to the **“Make Token-2022 with Transfer Hooks Tradable on Solana AMMs”** bounty.

- **Bounty page:** see description below
- **Live demo:** <https://rwa-amm-2wup.vercel.app/>

---

## 🌟 Why this matters

- **Token-2022** unlocks programmable and compliant asset transfers (KYC, whitelisting, fee collection, etc.).
- **AMMs** are the liquidity backbone of Solana DeFi.
- Today, no major AMM honours Transfer Hooks – breaking compliance for enterprise / RWA use-cases.

Our project closes that gap with **Reel – an AMM natively aware of Transfer Hooks** and built to evolve with Token-2022.

---

## 🚀 What we built

| Layer                | Description                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **On-chain program** | `anchor/programs/rwa_amm` – an Anchor-based constant-product AMM that **simulates and validates Transfer Hooks** on every swap & liquidity operation. Only hook programs in a _whitelist PDA_ are honoured, keeping execution deterministic and secure. |
| **SDK**              | `/src/lib/program.ts` exposes a typed TypeScript wrapper (`RwaAmmSdk`) for dApp integration, bundling extra account metas automatically.                                                                                                                |
| **Web UI**           | `/src/app/*` – a Next.js 13 app with **wallet-connect**, Tailwind UI and full workflow: 1) mint RWA token with hook, 2) create pool, 3) add liquidity, 4) trade, 5) view charts.                                                                        |
| **Cloud helpers**    | Helpers for off-chain KYC metadata storage (JSON Bin, Cloudinary) & charting.                                                                                                                                                                           |
| **Test-suite**       | Extensive Anchor & TypeScript tests covering pool maths, fees, hook enforcement & edge-cases.                                                                                                                                                           |

---

## ✨ Key features

1. **Token-2022 mint wizard**  
   • Choose supply, metadata, transfer fees and **attach any whitelisted Transfer Hook**.  
   • Optional KYC, geographic or time-based restrictions baked into on-chain config.
2. **Hook-aware AMM**  
   • Constant-product curve (like Uniswap V2).  
   • **Pre-transfer simulation** guarantees the hook programme will approve the swap before submitting the real transaction.  
   • Protocol & trading fees configurable per pool.
3. **Liquidity management**  
   • Create pools, add/remove liquidity, split/lock positions.
4. **Trading UI**  
   • Real-time quotes, slippage tolerance, interactive price chart.
5. **Compliance modules**  
   • On-chain whitelist & KYC PDAs.  
   • Tiered trading limits & fee discounts by KYC level.
6. **Permissionless-but-safe**  
   • Any user may propose a new hook contract; governance (or an operator) approves by adding to whitelist.

---

## 🗂️ Repository guide

```
Reel/
├── anchor/                # Rust / Anchor program
│   └── programs/rwa_amm   # 📦 on-chain AMM
├── src/                   # Next.js 13 web dApp
│   ├── hooks/             # React hooks inc. RwaAmmSdk
│   └── app/               # /create-mint, /create-pool, /trade …
└── tests/                 # Program & integration tests
```

---

## 🛠️ Local setup

```bash
# 1. Install deps
pnpm install            # frontend & workspace
cargo install --locked --git https://github.com/coral-xyz/anchor anchor-cli

# 2. Build & launch local validator with program
pnpm anchor-localnet    # alias for `anchor test -x`

# 3. Run web app on <http://localhost:3000>
pnpm dev
```

See `anchor/README.md` for advanced commands (build, deploy, test).

---

## 🧑‍💻 Architecture deep-dive

1. **Whitelisted hook registry** – PDA derived from `("hook_whitelist", mint_pubkey)` stores a BTree set of approved programs.
2. **Extra Account Meta list** – complies with Token-2022’s CPI-pull model so that hooks receive all needed accounts without user UX overhead.
3. **Fee maths** – fixed-point 128-bit arithmetic ensures zero precision loss across large RWA pools (see `math/*.rs`).
4. **SDK auto-discovery** – helper queries Solana for pool & vault PDAs from a single mint pair.

---

## 🛡️ Transfer Hook – how it works

The engine that enforces on-chain compliance lives in [`lib.rs`](anchor/programs/rwa_amm/src/lib.rs). Below is a human-readable tour so reviewers don’t need to dig through 1,400 lines of Rust.

1. **`initialize_extra_account_meta_list`**  
   • Creates a deterministic PDA (`extra-account-metas`) which stores **serialized `ExtraAccountMeta` structs** for: `user_kyc`, `fee_collector`, `transaction_log`, `whitelist` and system programs.  
   • The Token-2022 runtime automatically pre-pends these to every CPI into our program, giving the hook all the context it needs without bloating client UX.

2. **`fallback` handler**  
   • Token-2022 calls hooks via the [`TransferHookInstruction::Execute`](https://github.com/solana-labs/solana-program-library/blob/master/token/program-2022/src/extension/transfer_hook/mod.rs) CPI.  
   • The discriminator of that interface does NOT match Anchor’s auto-generated one, so we expose a **manual `fallback` entrypoint** that unmarshals the amount and dispatches to `transfer_hook`.  
   • This trick sidesteps Anchor’s constraint while keeping the rest of the codebase strictly in the Anchor framework.

3. **`transfer_hook` pipeline**
   - `validate_user_compliance` → reads the **`UserKYC` PDA**; rejects stale or insufficient KYC levels.
   - `validate_geographic_access` → parses the mint’s self-referential metadata (Token-2022 TLV) for allowed countries/states.
   - `validate_trading_hours` → enforces per-mint trading windows in local timezone.
   - `validate_trade_amount` → dynamic limits per KYC tier with rolling daily counters stored on the same `UserKYC` account.
   - `collect_trading_fees` → calculates trading + protocol fees in BPS, applies KYC-based discounts and (todo) transfers to `fee_collector`.
   - `record_transaction` → appends to a compact `TransactionLog` PDA for auditors.

All helpers are kept **outside** the `#[program]` module so they can be unit-tested without CPI boilerplate.

4. **Safety nets**  
   • Each arithmetic op uses 128-bit fixed-point helpers (`math::*`) with overflow checks.  
   • PDAs are bump-checked and size-bounded (`InitSpace`) to prevent account blow-ups.  
   • Transfer Hook is executed **before** token movement; any `err!` aborts the parent transaction – guaranteeing policy-compliant execution.

---

## ✅ Bounty requirement checklist

| Requirement                          | Delivered                                              | Proof                                                 |
| ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------- |
| Create Token-2022 with Transfer Hook | ✔️                                                     | `/src/app/create-mint` wizard & video @ 0:15          |
| Create LP pool (SOL-token)           | ✔️                                                     | `/src/app/create-pool` & tests `integration_tests.rs` |
| Enable trading on AMM                | ✔️                                                     | `/src/app/trade` screen & on-chain `swap` ix          |
| UI / UX                              | ✔️                                                     | Live site + responsive Tailwind components            |
| Video demo                           | ✔️                                                     | Link at top of README                                 |
| Live deployment (devnet)             | ✔️                                                     | <https://rwa-amm-2wup.vercel.app/>                    |
| Source code                          | ✔️                                                     | This repo                                             |
| Bonus: multiple hooks                | 🔄 Planned – registry allows many whitelisted programs |
| Bonus: permissionless safe approval  | ✔️                                                     | `init_hook_whitelist` + `add_hook_program` ix         |
| Bonus: integrate existing AMMs       | 🔄 Out-of-scope for MVP (roadmap section)              |

---

## 🏆 Bounty details

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Name**     | Make Token-2022 with Transfer Hooks Tradable on Solana AMMs |
| **Prizes**   | 1) $2,000 2) $1,000 3) $500                                 |
| **Deadline** | **31 July 2025**                                            |

Our submission targets **the first-prize criteria** with a complete, open-source, end-to-end solution.

---

## 📜 License

MIT © 2024 Reel contributors

### 🔍 Where to find each deliverable in the repo

| Bounty Item                        | File / Directory                                                                             | Notes                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Token-2022 mint + Transfer Hook UI | `src/app/create-mint/page.tsx`                                                               | React wizard that hits `useRwaAmmSdk.createRwaMint()`                |
| LP Pool creation UI                | `src/app/create-pool/page.tsx`                                                               | Uses `sdk.createPool()` on-chain ix                                  |
| Trading UI                         | `src/app/trade/page.tsx`                                                                     | Swap form & chart fetching on-chain quotes                           |
| On-chain AMM program               | `anchor/programs/rwa_amm/src/`                                                               | Rust / Anchor implementation inc. transfer hook logic in `lib.rs`    |
| SDK                                | `src/lib/program.ts`                                                                         | Provides `createRwaMint`, `createPool`, `addLiquidity`, `swap`, etc. |
| Tests (program)                    | `anchor/programs/rwa_amm/src/tests/`                                                         | Curve math, fee scheduler, hook enforcement                          |
| Tests (TypeScript)                 | `anchor/programs/rwa_amm/tests/*.test.ts`                                                    | End-to-end flows on devnet                                           |
| Hook whitelist admin               | `anchor/programs/rwa_amm/src/instructions/admin/`                                            | `ix_hook_whitelist_admin.rs`, `ix_create_static_config.rs`, etc.     |
| Multiple-hook support              | Same directory + `add_hook_program`, `remove_hook_program` instructions                      |
| Permissionless approval            | `init_hook_whitelist` + `add_hook_program` ixs allow anyone to propose; admin signs approval |

With these explicit pointers the judges can jump straight to the implementation for each criterion.

---
