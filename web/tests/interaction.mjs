import { chromium, webkit } from "@playwright/test";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  serve,
  attach,
  state,
  scratch,
  root,
  deployment,
  USER,
  OTHER,
  VAULT,
  NFT,
} from "./harness.mjs";
const checks = [];
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    checks.push({ name, passed: false, error: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
    throw e;
  }
}
await mkdir(resolve(scratch, "interaction"), { recursive: true });
const server = await serve();
let browser;
const contexts = [];
const errors = [];
async function pageFor(s, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...opts.context,
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().startsWith(server.url) && r.status() >= 400)
      errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  await attach(page, s, opts);
  await page.goto(server.url);
  await expect(
    page.getByRole("heading", { name: "Hamster Mining Reserve", exact: true }),
  ).toBeVisible();
  return page;
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Test Browser Wallet" }).click();
}
async function confirm(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", {
      name: `Confirm ${label.toLowerCase()}`,
      exact: true,
    })
    .click();
  const activity = page
    .locator(".activity-list li")
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
  await expect(activity).toContainText("Confirmed", { timeout: 15000 });
  await expect(
    page.getByRole("button", {
      name: "Refreshing contract state…",
      exact: true,
    }),
  ).toHaveCount(0, { timeout: 15000 });
}
try {
  browser = await chromium.launch({ headless: true });
  const disconnected = await pageFor(state(), { wallet: false });
  await check(
    "static subpath, metadata and disconnected controls",
    async () => {
      await expect(
        disconnected.getByRole("button", { name: "Inspect NFT", exact: true }),
      ).toBeDisabled();
      await expect(
        disconnected.getByRole("button", {
          name: "Claim rewards",
          exact: true,
        }),
      ).toBeDisabled();
      expect(await disconnected.title()).toContain("Hamster Mining Reserve");
      for (const selector of [
        'link[rel="icon"]',
        'meta[name="description"]',
        'meta[property="og:title"]',
        'meta[property="og:image"]',
      ])
        await expect(disconnected.locator(selector)).toHaveCount(1);
    },
  );
  await check("320/390/740/1440 reflow and first phone action", async () => {
    for (const width of [320, 390, 740, 1440]) {
      await disconnected.setViewportSize({ width, height: 844 });
      expect(
        await disconnected.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390) {
        const box = await disconnected
          .getByRole("button", { name: "Inspect NFT", exact: true })
          .boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(844);
      }
      await disconnected.screenshot({
        path: resolve(scratch, `interaction/disconnected-${width}.png`),
        fullPage: width === 1440,
      });
    }
  });
  await disconnected.setViewportSize({ width: 390, height: 844 });
  await check("wallet sheet keyboard close and focus return", async () => {
    const trigger = disconnected.getByRole("button", {
      name: "Connect wallet",
      exact: true,
    });
    await trigger.focus();
    await disconnected.keyboard.press("Enter");
    await expect(disconnected.getByRole("dialog")).toBeVisible();
    await expect(
      disconnected.getByRole("button", { name: "Browser wallet", exact: true }),
    ).toBeVisible();
    await expect(
      disconnected.getByRole("button", {
        name: "Coinbase Wallet",
        exact: true,
      }),
    ).toBeVisible();
    await disconnected.keyboard.press("Escape");
    await expect(disconnected.getByRole("dialog")).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });
  await check("no extension connection error remains recoverable", async () => {
    await disconnected
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await disconnected
      .getByRole("button", { name: "Browser wallet", exact: true })
      .click();
    await expect(disconnected.getByRole("alert")).toBeVisible();
    await expect(
      disconnected.getByRole("button", { name: "Browser wallet", exact: true }),
    ).toBeEnabled();
    await disconnected.keyboard.press("Escape");
  });
  const mobile = await pageFor(state(), {
    wallet: false,
    context: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      isMobile: true,
      hasTouch: true,
    },
  });
  await check("phone open-in wallets and Coinbase Smart Wallet", async () => {
    await mobile
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    for (const n of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
      await expect(
        mobile.getByRole("link", { name: `Open in ${n}`, exact: false }),
      ).toBeVisible();
    const rabbyLink = new URL(
      await mobile
        .getByRole("link", { name: "Open in Rabby", exact: false })
        .getAttribute("href"),
    );
    expect(rabbyLink.pathname).toBe("/mobile/");
    expect(rabbyLink.searchParams.get("_cmd")).toBe("open-dapp");
    expect(rabbyLink.searchParams.get("dapp")).toBe(mobile.url());
    await expect(
      mobile.getByRole("button", {
        name: "Coinbase Smart Wallet",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mobile.screenshot({
      path: resolve(scratch, "interaction/mobile-wallet-sheet.png"),
    });
  });
  const s = state(),
    page = await pageFor(s);
  await check(
    "EIP-6963 wallet discovery without duplicate generic row",
    async () => {
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Test Browser Wallet", exact: false }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Browser wallet", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Test Browser Wallet", exact: false })
        .click();
    },
  );
  await check(
    "wrong chain and exact wallet_addEthereumChain fallback",
    async () => {
      await expect(
        page.getByRole("button", { name: "Switch to Sepolia", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Inspect NFT", exact: true }),
      ).toBeDisabled();
      await page
        .getByRole("button", { name: "Switch to Sepolia", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Inspect NFT", exact: true }),
      ).toBeEnabled();
      expect(
        s.requests.filter((x) => x.method === "wallet_switchEthereumChain"),
      ).toHaveLength(2);
      expect(
        s.requests.find((x) => x.method === "wallet_addEthereumChain")
          .params[0],
      ).toEqual(deployment.walletAddChain);
    },
  );
  await check("live wallet reads and owner/strategist controls", async () => {
    await expect(
      page.getByRole("heading", { name: "Owner setup" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Strategist merge" }),
    ).toBeVisible();
    await expect(page.locator(".share-balance")).toContainText("1,000");
    await expect(page.locator("#inventory")).toContainText("Squeek #12");
  });
  await check("invalid NFT ID has inline error and sends nothing", async () => {
    await page.getByLabel("Genesis NFT ID", { exact: true }).fill("0");
    await page
      .getByRole("button", { name: "Inspect NFT", exact: true })
      .click();
    await expect(
      page.getByText("Enter a whole NFT ID greater than zero."),
    ).toBeVisible();
    expect(s.writes).toHaveLength(0);
  });
  await check(
    "deposit preview shows shares and permanent consent",
    async () => {
      await page.getByLabel("Genesis NFT ID", { exact: true }).fill("21");
      await page
        .getByRole("button", { name: "Inspect NFT", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Approve this NFT", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Approve this NFT", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("I understand this NFT stays in the reserve permanently.")
        .check();
    },
  );
  await check(
    "wallet rejection unlocks the NFT approval for retry",
    async () => {
      s.rejected = true;
      await page
        .getByRole("button", { name: "Approve this NFT", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm approve this nft", exact: true })
        .click();
      await expect(
        page
          .getByText(
            "Request declined in your wallet. You can try again when ready.",
          )
          .first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Approve this NFT", exact: true }),
      ).toBeEnabled();
      expect(s.writes).toHaveLength(0);
    },
  );
  await check(
    "per-NFT approval uses deployed reserve and fresh approval state",
    async () => {
      s.holdReceipts = true;
      await page
        .getByRole("button", { name: "Approve this NFT", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Confirm approve this nft", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Waiting for confirmation…",
          exact: true,
        }),
      ).toBeDisabled();
      expect(s.writes).toHaveLength(1);
      s.holdReceipts = false;
      await expect(
        page.getByRole("button", { name: "Contribute NFT", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      expect(s.writes[0].tx.to.toLowerCase()).toBe(NFT.toLowerCase());
      expect(s.writes[0].args[0].toLowerCase()).toBe(VAULT.toLowerCase());
      expect(s.writes[0].args[1]).toBe(21n);
    },
  );
  await check(
    "simulation custom error prevents wallet transaction",
    async () => {
      s.simulationError = true;
      await page
        .getByRole("button", { name: "Contribute NFT", exact: true })
        .click();
      await expect(
        page
          .getByText(
            "Mining has a checkpoint backlog. Advance a checkpoint, refresh and retry.",
          )
          .first(),
      ).toBeVisible();
      expect(s.writes).toHaveLength(1);
      s.simulationError = false;
    },
  );
  await check(
    "deposit minShares is nonzero and contribution confirmed",
    async () => {
      await page
        .getByRole("button", { name: "Contribute NFT", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Permanently contribute Genesis NFT #21",
      );
      await page
        .getByRole("button", { name: "Confirm contribute nft", exact: true })
        .click();
      await expect(page.locator("#inventory")).toContainText("Squeek #21");
      expect(s.writes.find((x) => x.functionName === "deposit").args).toEqual([
        21n,
        990n * 10n ** 18n,
      ]);
      await expect(page.locator(".activity-section")).toContainText(
        "Contribute NFT",
      );
      await expect(page.locator(".activity-section")).toContainText(
        "Confirmed",
      );
    },
  );
  await check("harvest and claim are distinct simulated actions", async () => {
    await confirm(page, "Harvest reserve");
    expect(s.writes.at(-1).functionName).toBe("harvest");
    await confirm(page, "Claim rewards");
    expect(s.writes.at(-1).functionName).toBe("claimRewards");
    await expect(
      page.getByRole("button", { name: "Claim rewards", exact: true }),
    ).toBeDisabled();
  });
  await check(
    "share transfer rejects invalid recipients then encodes decimals",
    async () => {
      await page
        .getByLabel("Recipient address", { exact: true })
        .first()
        .fill("bad-address");
      await page
        .getByLabel("Shares to transfer (hmSQUEEK)", { exact: true })
        .fill("1.25");
      await page
        .getByRole("button", { name: "Transfer shares", exact: true })
        .click();
      await expect(
        page
          .getByText(
            "Enter a valid checksummed address. ENS names are not supported on this network.",
          )
          .first(),
      ).toBeVisible();
      await page
        .getByLabel("Recipient address", { exact: true })
        .first()
        .fill(OTHER);
      await confirm(page, "Transfer shares");
      expect(s.writes.at(-1).args).toEqual([OTHER, 125n * 10n ** 16n]);
    },
  );
  await check(
    "merge guard uses observed share supply and donor IDs",
    async () => {
      await page.getByLabel("Surviving NFT ID", { exact: true }).fill("12");
      await page
        .getByLabel("Donor NFT ID (burned)", { exact: true })
        .fill("13");
      await confirm(page, "Merge reserve NFTs");
      const write = s.writes.at(-1);
      expect(write.functionName).toBe("merge");
      expect(write.args).toEqual([12n, 13n, 3000n * 10n ** 18n]);
    },
  );
  await check("checkpoint and strategist configuration controls", async () => {
    await confirm(page, "Advance Mining checkpoint");
    expect(s.writes.at(-1).functionName).toBe("checkpoint");
    await page.getByLabel("Strategist address", { exact: true }).fill(OTHER);
    await confirm(page, "Set strategist");
    expect(s.writes.at(-1).args).toEqual([OTHER]);
    await expect(
      page.getByRole("heading", { name: "Strategist merge" }),
    ).toHaveCount(0);
  });
  await check(
    "share allowance, delegated transfer and voluntary burn controls",
    async () => {
      await page.locator("#shares summary").click();
      await page.getByLabel("Spender address", { exact: true }).fill(OTHER);
      await page
        .getByRole("button", { name: "Read current allowance", exact: true })
        .click();
      await expect(
        page.getByText("Current allowance: 250 hmSQUEEK"),
      ).toBeVisible();
      await page.getByLabel("Allowance (hmSQUEEK)", { exact: true }).fill("0");
      await confirm(page, "Set share allowance");
      expect(s.writes.at(-1).args).toEqual([OTHER, 0n]);
      await page.getByLabel("Share holder address", { exact: true }).fill(USER);
      await page
        .getByLabel("Recipient address", { exact: true })
        .last()
        .fill(OTHER);
      await page
        .getByLabel("Transfer amount (hmSQUEEK)", { exact: true })
        .fill("2");
      await confirm(page, "Transfer approved shares");
      expect(s.writes.at(-1).args).toEqual([USER, OTHER, 2n * 10n ** 18n]);
      await page
        .getByLabel("Shares to burn (hmSQUEEK)", { exact: true })
        .fill("0.5");
      await confirm(page, "Burn shares permanently");
      expect(s.writes.at(-1).args).toEqual([5n * 10n ** 17n]);
      await page.locator("#shares summary").click();
    },
  );
  await check("two-step ownership proposal and cancellation", async () => {
    await page.getByText("Ownership controls", { exact: true }).click();
    await page.getByLabel("New owner address", { exact: true }).fill(OTHER);
    await confirm(page, "Propose new owner");
    expect(s.writes.at(-1).functionName).toBe("transferOwnership");
    expect(s.writes.at(-1).args).toEqual([OTHER]);
    await confirm(page, "Cancel ownership proposal");
    expect(s.writes.at(-1).args).toEqual([
      "0x0000000000000000000000000000000000000000",
    ]);
  });
  await check(
    "long balances, full addresses and open advanced controls reflow",
    async () => {
      s.balance = 10n ** 70n;
      s.supply = 10n ** 71n;
      await page
        .getByRole("button", { name: "Refresh state", exact: true })
        .click();
      await page.locator("#shares summary").click();
      await page.locator(".integration summary").click();
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: resolve(scratch, `interaction/long-values-${width}.png`),
          fullPage: true,
        });
        if (width < 500) {
          await page
            .getByRole("button", { name: "Transfer shares", exact: true })
            .click();
          const review = page.getByRole("dialog", {
            name: "Review transfer shares",
            exact: true,
          });
          await expect(review).toBeVisible();
          expect(
            await review.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: resolve(scratch, `interaction/review-${width}.png`),
          });
          await page.keyboard.press("Escape");
          await expect(review).not.toBeVisible();
          await expect(
            page.getByRole("button", { name: "Transfer shares", exact: true }),
          ).toBeFocused();
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
    },
  );
  const inactiveState = state({
    active: false,
    chainId: deployment.chainId,
    known: true,
  });
  const inactive = await pageFor(inactiveState);
  await connect(inactive);
  await check(
    "owner sees required activation; public deposit disabled until activation",
    async () => {
      await expect(
        inactive.getByText(
          "Awaiting owner activation. Contributions open after on-chain verification.",
        ),
      ).toBeVisible();
      await expect(
        inactive.getByRole("button", { name: "Inspect NFT", exact: true }),
      ).toBeDisabled();
      await confirm(inactive, "Activate reserve");
      expect(inactiveState.writes.at(-1).functionName).toBe("activate");
      await expect(
        inactive.getByRole("button", { name: "Inspect NFT", exact: true }),
      ).toBeEnabled();
    },
  );
  const graph = state({
    graphError: true,
    chainId: deployment.chainId,
    known: true,
  });
  const graphPage = await pageFor(graph);
  await connect(graphPage);
  await check(
    "Graph A failure blocks admissions while accounted claim stays available",
    async () => {
      await expect(
        graphPage.getByText(
          "Graph A reads are unavailable. Deposits and merges are disabled. Refresh to retry.",
        ),
      ).toBeVisible();
      await expect(
        graphPage.getByRole("button", { name: "Inspect NFT", exact: true }),
      ).toBeDisabled();
      await expect(
        graphPage.getByRole("button", { name: "Claim rewards", exact: true }),
      ).toBeEnabled();
    },
  );
  const pendingState = state({
    owner: OTHER,
    strategist: OTHER,
    pendingOwner: USER,
    chainId: deployment.chainId,
    known: true,
  });
  const pendingPage = await pageFor(pendingState);
  await connect(pendingPage);
  await check(
    "pending owner accepts, then explicit renunciation removes owner controls",
    async () => {
      await expect(
        pendingPage.getByRole("heading", { name: "Owner setup" }),
      ).toHaveCount(0);
      await confirm(pendingPage, "Accept ownership");
      await expect(
        pendingPage.getByRole("heading", { name: "Owner setup" }),
      ).toBeVisible();
      await pendingPage
        .getByText("Ownership controls", { exact: true })
        .click();
      await confirm(pendingPage, "Renounce ownership");
      expect(pendingState.writes.at(-1).functionName).toBe("renounceOwnership");
      await expect(
        pendingPage.getByRole("heading", { name: "Owner setup" }),
      ).toHaveCount(0);
    },
  );
  const noCode = await pageFor(state({ noCode: true }));
  await check("missing deployed code fails closed", async () => {
    await expect(noCode.getByRole("alert")).toContainText("No reserve code");
    await expect(
      noCode.getByRole("button", { name: "Inspect NFT", exact: true }),
    ).toBeDisabled();
  });
  const failedRpc = await pageFor(state({ rpcError: true }));
  await check(
    "RPC failure shows unavailable values and disables signing",
    async () => {
      await expect(failedRpc.getByRole("alert")).toContainText(
        "Transactions are disabled",
        { timeout: 15000 },
      );
      await expect(failedRpc.locator(".big-stats")).toContainText(
        "Unavailable",
      );
      await expect(
        failedRpc.getByRole("button", { name: "Harvest reserve", exact: true }),
      ).toBeDisabled();
    },
  );
  await check(
    "ABI hash mismatch blocks the runtime before wallet connection",
    async () => {
      const ctx = await browser.newContext();
      contexts.push(ctx);
      const tampered = await ctx.newPage();
      await tampered.route("**/abi/HamsterMiningReserve.json", (route) =>
        route.fulfill({ contentType: "application/json", body: "[]" }),
      );
      await tampered.goto(server.url);
      await expect(tampered.getByRole("alert")).toContainText(
        "ABI does not match",
      );
      await expect(
        tampered.getByRole("button", { name: "Connect wallet", exact: true }),
      ).toHaveCount(0);
    },
  );
  await check("guide navigation and back to reserve", async () => {
    await disconnected
      .getByRole("button", { name: "How it works", exact: true })
      .click();
    await expect(
      disconnected.getByRole("heading", {
        name: "A permanent home for mining NFTs",
      }),
    ).toBeVisible();
    await disconnected
      .getByRole("button", { name: "Return to reserve", exact: false })
      .click();
    await expect(
      disconnected.getByRole("heading", { name: "Contribute an NFT" }),
    ).toBeVisible();
  });
  await check(
    "automated accessibility on reserve, expanded controls and wallet sheet",
    async () => {
      for (const target of [disconnected, page, mobile]) {
        const result = await new AxeBuilder({ page: target })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => n.target),
          })),
        ).toEqual([]);
      }
    },
  );
  await check(
    "no browser JavaScript errors or missing local resources",
    async () => {
      expect(errors).toEqual([]);
    },
  );
  try {
    const b = await webkit.launch({ headless: true });
    await b.close();
    checks.push({ name: "WebKit engine availability", passed: true });
  } catch {
    checks.push({
      name: "WebKit rendered checks",
      passed: null,
      limitation:
        "WebKit could not launch in the available runtime. Chromium coverage completed.",
    });
  }
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  for (const c of contexts) await c.close();
  if (browser) await browser.close();
  await server.close();
  await writeFile(
    resolve(scratch, "interaction/results.json"),
    JSON.stringify({ checks, errors }, null, 2) + "\n",
  );
  console.log(
    `${checks.filter((x) => x.passed === true).length} passed; ${checks.filter((x) => x.passed === false).length} failed; ${checks.filter((x) => x.passed === null).length} limitations`,
  );
}
