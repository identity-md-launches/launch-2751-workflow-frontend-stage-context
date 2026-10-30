# Hamster Mining Reserve design

## Overview

This is a working reserve dashboard for Squeek NFT contributors, share holders, the strategist and owner. The inferred visual direction is a quiet, warm utility: an off-white canvas, dark olive text, flat surfaces and a small hamster-wheel illustration. It is an implementation choice, not a requester-supplied brand system.

The first screen prioritizes the product name, wallet, live reserve status and NFT inspection. The permanent-custody warning belongs beside the contribution control. Reserve statistics follow the contribution form on a phone. Rewards, share management, inventory, operations and contract transparency follow in that order. The separate “How it works” view uses the same header and tokens.

This file is in `docs/` because the assignment's explicit write budget protects repository-root files.

## Colors

Canonical definitions live in `web/src/style.css` under `:root`. Components consume the semantic tokens below. The site intentionally ships one light theme and no theme toggle.

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `#f8f7f2` | Page and input background |
| `--color-surface` | `#ffffff` | Working panels, dialogs and neutral controls |
| `--color-surface-soft` | `#eeeee4` | At-a-glance statistics, hover and disabled control fills |
| `--color-ink` | `#292f27` | Main text and headings |
| `--color-muted` | `#63695f` | Explanations, labels and secondary data |
| `--color-border` | `#d9dcd2` | Structural separators and control outlines |
| `--color-accent` | `#a43d1f` | Primary contribution/review action fill |
| `--color-accent-hover` | `#843019` | Primary hover fill |
| `--color-on-accent` | `#ffffff` | Primary action text |
| `--color-success` | `#3a5933` | Confirmed/running status with text |
| `--color-warning` | `#744923` | Permanent-custody and prerequisite notices |
| `--color-error` | `#9b2929` | Failed/rejected requests with explanatory text |
| `--color-focus` | `#284e87` | 3px focus-visible outline with 3px offset |

Status always has words, not just color. Warning notices use an inline leading rule rather than another card. The logo and illustration have their own flat artwork colors; those are not additional UI status tokens. The production probe measured all tested text pairs above the required contrast threshold; its lowest measured ratio was 4.84:1 for muted text on `--color-surface-soft`. The modal's blue focus outline was also visually inspected. This is not a claim of every possible composited state being audited.

## Typography

The system stack is `'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif`; no font download is needed. Available faces depend on the visitor's platform. Implemented weights are 400 (prose), 600 (controls/section headings/data) and 700 (brand and main heading).

The five CSS type tokens are 14px small UI text, 16px body/inputs, 20px section headings, 28px numeric summaries/phone title, and 40px desktop title. Body line height is 1.5; headings use 1.15 and balance wrapping. Headline letter spacing is -0.035em on desktop and -0.025em on phone; 20px headings use -0.015em. Prose has natural spacing and a 70ch measure. Inputs stay 16px on phones.

Changing data use tabular numerals. Addresses, long numeric amounts and review text wrap instead of being clipped. Compact summaries use up to four decimals, with `<0.0001` for tiny positive amounts; exact figures are available through their title. Transaction reviews and deposit minimums use exact `formatUnits` values. Unit labels remain smaller than amounts. Preserve decimal handling in `web/src/format.ts`; never format a base-unit amount directly.

## Layout

`web/src/style.css` defines a maximum 1248px shell including 24px inline padding. Desktop header and main content share their alignment edges. The main workspace uses a `1.2fr / 1fr` grid with 24px gaps, and later pairs use equal columns. Panels use 28px padding. Spacing generally moves in 4px steps, with 8–12px within controls and 20–40px between groups.

At 960px, panels use 24px padding, the primary grid gap becomes 20px, and compact statistics temporarily stack. At 740px, content becomes one column, shell insets become 16px, panel padding becomes 20px, the title becomes 28px, and the decorative wheel disappears. Mobile navigation moves to its own row; the wallet remains beside the brand. At 360px, panel padding becomes 16px and small paired controls stack where needed. These content-driven breakpoints were checked at 320, 390, 740 and 1440px.

The 390×844 production view places the NFT ID and inspection button on the first screen, including the live unactivated state. No sideways page overflow was measured at 320 or 390px, including expanded controls, full contract addresses and very large balances in the mocked session. Text remains selectable. Logical spacing properties support natural flow; an RTL localization and browser-native 200% zoom were not verified.

## Elevation & Depth

The interface is flat: panel borders establish structure, the reserve summary uses a tonal layer, and there are no panel shadows. Dialogs use a translucent neutral backdrop and native top-layer modality. The background becomes inert through native `dialog.showModal()`. Avoid adding shadows to bordered panels or placing decorative cards within these working panels.

## Shapes

Panels and dialogs use 16px radii on desktop, with working panels reduced to 12px on phones. Controls use 8px radii. The phone wallet sheet spans the viewport width, keeps rounded upper corners and square lower corners, and accounts for bottom safe-area padding. Status dots are circular and never the only status cue. The hamster mark and wheel are local SVG artwork; the social card is a locally rendered 1200×630 PNG.

## Components

| Component or pattern | Source | Reuse and behavior |
| --- | --- | --- |
| Application shell / workspace / panel | `web/src/App.tsx`, `web/src/style.css` | Shared gutters, heading order and responsive grids. Start another view inside `.main`; retain the header wallet control. |
| `Wallet` | `web/src/Wallet.tsx` | One connection control; discovered provider rows, phone app links, Coinbase, chain switch, copy/explorer and disconnect. Native dialog handles modality; Escape/backdrop/close restore trigger focus. Rows are at least 48px on phone. |
| `Action` | `web/src/Action.tsx` | Named contract action with a prerequisite disable flag, typed call builder and refresh callback. Supports checking, review, signing, confirmation, refresh, success, rejection and unresolved-receipt states. Keep simulation, confirmation and signing in this shared component. |
| Deposit | `web/src/App.tsx` (`Deposit`) | Ownership/position preview, exact share protection, per-NFT approval and permanent-custody checkbox. Only one approval/contribution step is presented at a time. |
| `AddressLink` | `web/src/App.tsx` | Full checksummed address, explorer destination, copy control and a selectable fallback on copy failure. |
| `TransactionsProvider` / `WalletActivity` | `web/src/Transactions.tsx` | Last ten requests for this page session, with status and explorer links. Does not imply a global activity index. |
| Ledger / inventory / disclosure | `web/src/style.css`, `web/src/App.tsx` | Definition lists for label/value data, readable inventory rows, native details/summary for advanced controls. Do not hide the primary action in a disclosure. |
| Notices / errors / focus | `web/src/style.css` | Persistent nearby explanatory text, live regions for state, explicit recovery suggestions and a visible focus perimeter. |

Buttons have a comfortable 44px base target. Links remain links; actions remain buttons. Each input has a real label. The only continuous motion is the pending spinner. Under `prefers-reduced-motion`, it stops; ordinary press feedback uses `scale(0.96)` and 150ms transitions only when motion is allowed. Forced-color controls and focus use system colors. No theme-switch or page-load animation exists.

## Do's and Don'ts

- Reuse the existing shell, panel, ledger, notices and `Action` flow when adding a view. Keep the main task above secondary explanation on phone.
- Use the filled accent for the current contribution/review action. Keep peer utility controls neutral.
- Keep immutable deployment data in the manifest pipeline. New components obtain the `Runtime`, ABI and live reads rather than introducing addresses or RPC strings.
- Keep full addresses and consequential amounts reachable. Preserve long-value wrapping in dialogs as well as panels.
- Keep unfunded work, reserve-wide pending SQK and wallet-accounted rewards distinct. Do not introduce an APY, price, swap or withdrawal promise.
- Add another page by reusing the header and `.main`, using an `h1`, a restrained panel/ledger layout and the existing five type sizes. Recheck 320/390px, focus, transaction states and the final manifest after any exported-asset change.

## Attribution

Design/review guidance was applied from Jakub Krehel's Better Interface (MIT), with the pinned documentation adaptation from Paul Bakaus's Impeccable (Apache-2.0), and Austin Griffith's Ethereum frontend UX guide (MIT). Notices and licenses are preserved in `docs/frontend/licenses/`. See `docs/frontend/validation.md` for evidence and unperformed checks.
