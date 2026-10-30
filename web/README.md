# Hamster Mining Reserve frontend

A static Vite, React and TypeScript application for the deployed Sepolia reserve. It contains no signing key, backend, swap, token sale or liquidity flow. hmSQUEEK is an internal accounting share. Contributions put Genesis Squeek NFTs into permanent custody; shares carry future funded SQK reward rights.

## Install, build and preview

Use Node.js 22.12+ (or 24) and npm. Run from the repository root:

```sh
npm ci --prefix web
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run verify
npm --prefix web run preview
```

The build writes repository-root `dist/` and then generates `dist/imd-deployment.json`. Serve **all of `dist/`**, including its `abi/` folder and manifest, through any static HTTP host. Vite uses `base: './'`; the app uses one page and relative assets, so gateway subpaths need no server rewrites. For local development, `npm --prefix web run dev` builds once, then starts Vite. Its development-only middleware serves the same generated deployment and ABI JSON from `dist/`; it creates no second configuration map. The publisher can commit and host this export without rebuilding it.

`npm run build` includes typecheck. `npm run verify` independently recomputes every asset SHA-256 and verifies the canonical Keccak ABI binding. Rebuild after any asset change, including metadata or social images. Never edit an exported file without regenerating the manifest.

## One deployment configuration

`web/deployment.json` is the build input copied from the validated handoff and network table. `web/scripts/manifest.mjs` emits it as the runtime manifest and appends the final asset inventory. The application fetches **that same `imd-deployment.json`**, then fetches the vault ABI at its `abiPath`; it does not bundle a separate deployment address or chain map. ABI mismatch blocks startup. The network and optional wallet-add-chain parameters are preserved unchanged. This plain-contract handoff has no pool key and creates no pool.

All four `web/abi/*.json` files are byte-for-byte copies of implementation-derived `docs/abi/*.json` at source commit `9298b65d1bd1955995dda9ba1c83aeca814ccfc7`. The attested vault ABI hash is checked during build and runtime. The three Graph A interface files are also exported and inventoried. The vault's `CORE()`, `MINING()`, `NFT()`, `MINING_IMPLEMENTATION()` and `rewardToken()` getters determine dependency addresses at runtime. Reward token symbol/decimals and share decimals are read, never guessed.

`web/src/config.ts` owns manifest loading, ABI loading, chain construction, RPC transports and wallet configuration. Its three public RPCs come only from the network block. Reads use intentional public-RPC fallback, with the connected wallet provider as a further snapshot fallback. A complete vault snapshot is pinned to one block. Background refresh runs every 15 seconds while the page is active, and reads refresh on focus and after receipts. A failed required read disables writes and marks values stale or unavailable; it never substitutes zero for a failure.

If the original handoff inputs are still available, run:

```sh
node web/scripts/verify-handoff.mjs
```

This additionally compares exact identifiers, complete contract set, network, wallet-add-chain parameters, pool-key presence, allowed top-level keys, and pinned ABI bytes. It is an assignment-time check; normal rebuilds do not depend on `.imd/reads/` remaining present.

## Wallet and transaction behavior

The single header control lists EIP-6963 browser wallets and Coinbase Wallet. Phone browsers also offer MetaMask, Coinbase, Rabby and Phantom open-in links, plus Coinbase Smart Wallet. The connector uses no WalletConnect relay or project ID. Wrong-chain users get one switch control; unknown-chain error 4902 triggers the exact `wallet_addEthereumChain` parameters followed by another switch.

Writes require a connected wallet on the configured chain, fresh verified vault state, nonempty deployed code and any action-specific role/eligibility conditions. Each action simulates, opens a consequence review, verifies the wallet network again, re-simulates the reviewed arguments, then asks the visitor's wallet to sign. Actions lock independently through submission, receipt and refetch. A receipt timeout retains an unresolved state and offers a receipt-status retry without another submission. Wallet replacements are distinguished from a confirmed original request.

- **Contribute:** inspect a wallet-owned, live, fully settled NFT; review shares and tolerance (0–5%); acknowledge permanent custody; approve only that NFT if needed; contribute with a nonzero minimum share amount. Previews expire after two minutes and invalidate when the NFT, wallet or network changes.
- **Rewards:** harvest funded reserve rewards separately from claiming a wallet's already-accounted SQK. Unharvested rewards are not added to a wallet's claimable balance.
- **Shares:** transfer to a willing recipient, read/set/revoke spender allowance, transfer as an approved spender, or explicitly burn shares. Burns return nothing and remain subject to the on-chain supply floor.
- **Mining:** anyone may advance a ready checkpoint; only the strategist sees merge controls. Merges use equal settled levels, Core-height cooldowns and the observed `totalSupply` as `maxSupply`.
- **Owner:** the connected owner sees activation, strategist and two-step ownership controls. A pending owner can accept. The zero address is used only for the protocol's explicit ownership-proposal cancellation, never as a missing configuration value. Renunciation requires activation and an explicit consequence review.

Addresses support explorer links and copy; address inputs validate and normalize checksums. ENS is not resolved on this Sepolia UI. Amounts use contract decimals; there is no configured USD source and the UI says so. Full deposit/protection amounts appear in reviews; compact statistics expose exact amounts through their title. Session activity tracks this page's requests only, not all chain history.

## Validation

```sh
# Install the test browser through the normal Playwright installer:
cd web
npx playwright install chromium
npm test
```

The included interaction harness serves the real `dist/` at `/preview/`, intercepts RPCs and injects a synthetic EIP-6963 wallet. It checks disconnected/wrong-chain states, unknown-chain setup, pending/rejected transactions, deposit protections, every primary action category, role controls, read failures, ABI mismatch, responsive overflow and accessibility. Its fixtures are confined to `web/tests/` and never enter the production app. Test output and screenshots go to `test/scratch/`, which is not required for building or running the app.

`node web/scripts/validate-live.mjs` performs read-only public-RPC checks and updates `docs/frontend/live-evidence.json`; it never signs or broadcasts. `node web/tests/preview.mjs` provides a bounded foreground preview for manual browser inspection.

The assignment's pinned design probe was run against the production export. Final review, evidence, limitations and exact results are in [validation.md](../docs/frontend/validation.md); the implemented design system is in [DESIGN.md](../docs/DESIGN.md). `docs/` is used because the assignment prohibits writing repository-root files.

## Sharing and scope

The favicon and 1200×630 PNG share image are local assets. The editable social SVG is `web/design/share.svg`; optionally regenerate the PNG with `node web/scripts/render-share.mjs` after installing Chromium, then rebuild. A published domain was not supplied, so Open Graph uses a relative image path. Domain-specific metadata, IPFS pinning, naming and publication checks belong to the publisher.

The live vault was unactivated during read-only validation. No owner activation, approval, deposit, merge, transfer or reward claim was broadcast. Real wallet passkeys, phone-app handoffs, receipt replacement/timeouts, and funded live-chain transactions remain unverified. WebKit rendered validation was unavailable; Chromium and the assigned browser were used. Existing Solidity source and root build configuration remain preserved.

The Rabby mobile open-in route uses its official app's [`open-dapp` handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts) and [release link prefix](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts). Route encoding was checked against this primary source; native app launch remains unperformed.
