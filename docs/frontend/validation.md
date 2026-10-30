# Frontend validation and interface review

Worker-side evidence for the delivered Hamster Mining Reserve frontend and static export. These are self-checks, not independent certification. The assignment verifier checks paths and bytes; publication checks and hosted behavior are separate later stages.

## Delivered scope

| Requirement | Result |
| --- | --- |
| Frontend source, exact lockfile and build configuration in `web/` | Implemented with Vite, React, TypeScript, wagmi and viem |
| Relative static export in repository-root `dist/` | Built; all local runtime assets and ABIs included |
| Attested runtime configuration | The app fetches `imd-deployment.json` and its referenced vault ABI; no independent deployment map |
| Exact deployed contract set, identifiers, ABI hash, network and add-chain parameters | Verified against supplied handoff; no pool key exists in this plain-contract handoff |
| Deposit, NFT approval, harvest, claim, share transfer/approval/delegated transfer/burn | Implemented and exercised with synthetic wallet/RPC responses |
| Mining checkpoint, strategist merge, owner activation/settings and two-step ownership | Implemented and exercised with synthetic authorized roles |
| Live reserve and Graph A reads | Public-RPC snapshot and actual browser reads completed; block and unavailable/stale states are visible |
| Browser wallets, phone open-in links and Coinbase | EIP-6963 discovery, mobile rows, connection rejection and chain fallback tested; real app/passkey handoffs unperformed |
| First phone screen, reflow, metadata and share image | Product, wallet and NFT inspection visible at 390×844; no sideways overflow at 320/390; local favicon and PNG share image present |
| Better Interface review and final design record | All six domains reviewed; design probe 16/16; design system documented in `docs/DESIGN.md` |
| Source/export/evidence inside allowed paths | Scope verified; root configuration and deployed Solidity preserved; Git commit unavailable |
| Site publishing / IPFS naming | Publisher stage; not a prerequisite or claim of this delivery |

The explicit path restriction protects repository-root files, so the requested design record is delivered as `docs/DESIGN.md` rather than writing a root file. The plain-contract workflow excludes swaps, new tokens, pools and liquidity actions; none were added. hmSQUEEK remains an internal accounting share, with permanent NFT custody.

## Commands and outcomes

| Check | Outcome |
| --- | --- |
| `npm --prefix web run build` | Exit 0; runs TypeScript `tsc --noEmit`, Vite production build and manifest generation |
| `npm --prefix web run typecheck` | Exit 0 |
| `npm --prefix web run verify` | Exit 0; canonical vault ABI hash and every exported asset hash match |
| `node web/scripts/verify-handoff.mjs` | Exit 0; identifiers, entire contract set, network, add-chain parameters, pool-key presence, allowed top-level keys and all four pinned ABI byte sequences match |
| `npm --prefix web test` | Exit 0; 30 grouped interaction/accessibility checks passed, zero failed, one WebKit limitation |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 0 with task-local Playwright configuration; all 16 checks passed on the production export |
| `node web/scripts/validate-live.mjs` | Exit 0; read-only Sepolia validation, no transactions broadcast |
| Development manifest middleware smoke check | Generated manifest and vault ABI served byte-for-byte; production export is the browser-tested delivery |

Final machine-readable results are in `interaction-results.json`, `design-checks.json` and `export-evidence.json` beside this document. The export inventory contains 13 assets totaling 1,538,979 bytes, excluding the manifest. Every file is below 8 MiB, with substantial room under the 128-asset and publication HTTP budgets. Git submission size is measured separately, including source, lockfile and evidence.

## Interaction coverage

The suite serves the actual export beneath `/preview/`. No server rewrite is needed, and all ABI/configuration fetches use that subpath. A test-only EIP-6963 provider and ABI-encoded JSON-RPC fixtures exercise:

- Disconnected controls, missing extension error, native wallet-sheet keyboard close/focus return, phone wallet links and Coinbase Smart Wallet presence.
- Named provider discovery without a duplicate generic row; wrong-chain disabled actions; error 4902; exact add-chain parameters; a second switch after addition.
- Wallet-specific reads, role-specific controls, invalid NFT IDs, deposit preview, permanent-custody consent, wallet rejection/retry and approval locked while the receipt is withheld.
- Approval of one NFT to the actual deployed vault; fresh approval read before deposit; contract custom-error translation before signing; protected deposit arguments with 1% share tolerance and a nonzero `minShares`.
- Separate harvest and claim; invalid recipient handling; share decimals; merge survivor/donor IDs and observed `maxSupply`; checkpoint and strategist update.
- Current share allowance, zero allowance revocation, approved-spender transfer, voluntary burn, ownership proposal/cancellation, pending-owner acceptance, and explicit ownership renunciation.
- Unactivated owner setup, unavailable Graph A while accounted claims remain available, missing deployed code, RPC errors without fabricated zero values, runtime ABI mismatch, and guide navigation.
- Reflow at 320, 390, 740 and 1440px; expanded disclosures, full addresses and very large balances; 320/390px transaction-review overflow and Escape/focus return.
- Axe scans with WCAG 2 A/AA, 2.1 AA and 2.2 AA tags on the disconnected reserve, connected expanded controls and wallet sheet: zero reported violations. No browser JavaScript errors or missing local resources in the exercised app flows.

Mocked amounts, roles and receipts validate frontend behavior only. They are confined to `web/tests/` and are not imported into the production app. They do not establish on-chain economic correctness or the success of a funded transaction.

## Live read evidence

`live-evidence.json` records the consistent read-only snapshot at Sepolia block 12029622 using the public endpoint from the network table. The deployed reserve had 15,200 bytes of code, was not activated, and had no reserve NFTs or outstanding shares. Owner/strategist and dependency addresses were read from the vault. Graph A reported Mining v6, Core v3, the pinned Mining implementation, 8,888 public minted NFTs and 6,910 NFT supply.

The workflow's introductory Core-v6 wording differs from the deployed implementation and handoff notes: the pinned reserve actually requires **Mining v6 and Core v3**. The frontend follows those deployed guards, and the live reads matched them. Graph A addresses come from the reserve's getters. No Graph B API, remembered address or fabricated statistic is used.

The assigned browser was used on the real public-RPC export at 390×844 and 1440×1000, plus a 320px reflow check. It showed “Awaiting activation” and the owner-activation notice. The wallet sheet's keyboard focus outline was visually inspected; Escape restored focus to the header control. No warning or error console messages were reported in that inspection. Screenshot blocks may be later than the independent JSON snapshot because the browser refreshes live.

- `live-390.png`: final production first phone screen, real unactivated reserve.
- `live-1440.png`: final production desktop screen, real reserve reads.
- `mock-review-320.png`: explicitly synthetic transaction review used to check full recipient wrapping at narrow width; no transaction was signed from this review.

## Better Interface: consolidated six-domain coverage

| Domain | Checked | Limits |
| --- | --- | --- |
| Accessibility | Native controls and labels; status/error live regions; native dialog modality; Tab, Enter, Escape and focus return; visible 3px ring; automated accessibility scans; target sizes | No assistive-technology screen-reader session or physical-device accessibility audit |
| Layout | DOM/visual order; primary phone control; responsive grids; expanded states; long balances/addresses; narrow review dialogs; probe overlap/clipping checks | Browser-native 200% zoom and an RTL localization were not verified |
| Writing | Permanent contribution and burn consequences; explicit action labels; unavailable/stale states; actionable errors; distinct funded/unharvested/accounted rewards | No localization beyond English |
| Typography | Five-size scale, three weights, heading hierarchy, tabular numbers, long-value wrapping, 16px inputs and measured first-screen text | Platform system fonts vary; no downloaded-font claim |
| Colors | Semantic token roles; actual rendered probe text contrast; warning/success/error text cues; focused wallet row visually inspected | One intentional light theme; artwork/backdrop contrast is not a comprehensive compositing audit |
| UI | Flat surfaces; no nested warning cards; shared transaction states; neutral utility actions; reduced-motion spinner/press behavior; local SVG/PNG assets | No physical mobile-app/passkey test or animation-panel slow replay |

The production probe passed render, layout, targets, contrast, casing, tracking, eyebrows, type sizes, type faces, glyphs, slogans, repetition, copy budget, chrome, motion and share metadata. Final first-screen prose was 54 words at 390px (limit 60) and 69 at 1440px (limit 90). Lowest measured text contrast was 4.84:1. These measurements cover the probe's rendered states, not every possible wallet, RPC or transaction state.

## Findings, fixes and rechecks

| Finding | Evidence and source | Fix / recheck |
| --- | --- | --- |
| High, fixed: warning cards nested in the first-screen contribution panel | Initial probe flagged two nested surfaces at 390px. `web/src/style.css:341` and `:360` own the warning styles. | Removed nested backgrounds/radii and used leading rules. Final chrome probe passes; first-screen screenshot inspected. |
| High, fixed: phone copy exceeded the probe's first-screen budget | Initial probe counted 63 words against 60. `web/src/App.tsx:294` and `:303` contain connection/activation instructions. | Shortened instructions while preserving the permanent-custody warning. Final count 54; primary control remains on screen. |
| Medium, fixed: deposit form reset could discard its local transaction feedback | Source review of conditional contribution actions in `web/src/App.tsx` and per-action state in `web/src/Action.tsx`. | Added `TransactionsProvider` / `WalletActivity` (`web/src/Transactions.tsx:15`). Interaction test verifies a confirmed contribution remains observable after form reset. |
| Medium, fixed: long recipient text needed an explicit narrow-dialog wrapping rule | Defensive source review of transaction descriptions in `web/src/Action.tsx`; long recipient is consequential text. | `.review-dialog` wrapping at `web/src/style.css:1168`; 320/390px reviews measured without internal or page overflow, and Escape/focus return checked. |
| Medium, fixed: approval action needed to remain locked through receipt and fresh approval read | Pending/refresh source review in `web/src/Action.tsx`, contribution approval refresh in `web/src/App.tsx`. | Shared action remains pending through receipt/refetch; test withholds the receipt, checks disabled state, then verifies the contribution step appears after confirmed approval. |

A final narrow transaction-review test also reproduced a high accessibility finding: Escape attempted to focus the trigger while React still rendered it disabled (`web/src/Action.tsx`, focus restoration). The fix restores focus in a post-render effect; an action that becomes unavailable after completion instead focuses its status group. The 320/390px Escape and focus-return checks were rerun after this change.

No confirmed high or medium finding remains in the tested scope. No screenshot, contrast ratio or live transaction success is claimed from source inspection alone.

## Limitations and completion

Implementation and validation are complete for the frontend worker scope, with the explicit design-document path adaptation and verification limits above. Git staging was refused with “Read-only file system” for the repository metadata, so no worker commit could be created. Source, export and evidence remain available as workspace deliverables. WebKit could not launch in the available runtime, so its rendered checks were not performed. Chromium tests and the assigned browser inspection completed. This is not a claim of full accessibility compliance or cross-browser certification.

The reserve still requires its actual owner to activate it through their wallet. That control is implemented and tested with a synthetic owner; no owner action was performed on the deployed reserve. Rabby link encoding was additionally checked against its [official universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts), which expects the `open-dapp` command and `dapp` query parameter; native app behavior remains unperformed. Real NFT approval/deposit, merges, reward harvest/claims, share movements, passkey setup, wallet-app deep links, receipt timeout/replacement branches and live gas behavior were not exercised with funds. The timeout/replacement behavior is implemented but its uncommon branches were reviewed in source rather than scenario-tested.

IPFS pinning, naming, absolute domain-specific Open Graph metadata and control-plane publication checks remain publisher responsibilities. No publication result, CID or independent authority is claimed by this worker evidence.
