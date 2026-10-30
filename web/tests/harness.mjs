import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  erc20Abi,
  zeroAddress,
} from "viem";
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const scratch = resolve(root, "test/scratch");
export const deployment = JSON.parse(
  await readFile(resolve(root, "dist/imd-deployment.json"), "utf8"),
);
export const abis = Object.fromEntries(
  await Promise.all(
    ["HamsterMiningReserve", "IGraphACore", "IGraphAMining", "IGraphANFT"].map(
      async (n) => [
        n,
        JSON.parse(await readFile(resolve(root, `web/abi/${n}.json`), "utf8")),
      ],
    ),
  ),
);
// Synthetic test fixtures are confined to this harness. The app gets all deployment data from the real export.
export const USER = "0x1111111111111111111111111111111111111111",
  OTHER = "0x2222222222222222222222222222222222222222",
  TOKEN = "0x3333333333333333333333333333333333333333";
export const CORE = "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f",
  MINING = "0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4",
  NFT = "0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6",
  IMPL = "0x08890b360C65FD878344Bf6e23d1c36358433B4E";
export const VAULT = deployment.contracts[0].address;
const W = 10n ** 18n;
export function state(overrides = {}) {
  return {
    active: true,
    owner: USER,
    strategist: USER,
    pendingOwner: OTHER,
    chainId: 1,
    known: false,
    authorized: false,
    approved: false,
    ids: [12n, 13n],
    balance: 1000n * W,
    supply: 2000n * W,
    claimable: 5n * W,
    pending: 10n * W,
    requests: [],
    writes: [],
    receipts: new Map(),
    rejected: false,
    simulationError: false,
    rpcError: false,
    graphError: false,
    noCode: false,
    ...overrides,
  };
}
const position = (id) => ({
  activeWeight: 1000n,
  pendingWeight: 0n,
  pendingRound: 0,
  nextMergeBlock: 100,
  level: 1,
  lastIndex: 0n,
  accruedScaled: 0n,
});
const norm = (a) => a?.toLowerCase();
function decode(tx) {
  const abi =
    norm(tx.to) === norm(VAULT)
      ? abis.HamsterMiningReserve
      : norm(tx.to) === norm(CORE)
        ? abis.IGraphACore
        : norm(tx.to) === norm(MINING)
          ? abis.IGraphAMining
          : norm(tx.to) === norm(NFT)
            ? abis.IGraphANFT
            : erc20Abi;
  return { abi, ...decodeFunctionData({ abi, data: tx.data }) };
}
export function rpc(req, s) {
  const { id, method, params = [] } = req;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  if (s.rpcError)
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: "RPC temporarily unavailable" },
    };
  if (method === "eth_chainId") return ok("0xaa36a7");
  if (method === "eth_blockNumber") {
    s.block = (s.block ?? 12029600) + 1;
    return ok("0x" + s.block.toString(16));
  }
  if (method === "eth_getCode") return ok(s.noCode ? "0x" : "0x60006000");
  if (method === "eth_getTransactionByHash") {
    const index = Number(BigInt(params[0])) - 1;
    const tx = s.writes[index]?.tx;
    return ok(
      tx
        ? {
            hash: params[0],
            from: USER,
            to: tx.to,
            gas: "0x186a0",
            gasPrice: "0x1",
            input: tx.data,
            nonce: "0x" + index.toString(16),
            r: "0x" + "01".repeat(32),
            s: "0x" + "01".repeat(32),
            v: "0x1b",
            type: "0x0",
            blockHash: s.holdReceipts ? null : "0x" + "ab".repeat(32),
            blockNumber: s.holdReceipts ? null : "0xb78f10",
            transactionIndex: s.holdReceipts ? null : "0x0",
            value: "0x0",
          }
        : null,
    );
  }
  if (method === "eth_getTransactionReceipt")
    return ok(s.holdReceipts ? null : (s.receipts.get(params[0]) ?? null));
  if (method === "eth_call") {
    try {
      const tx = params[0],
        { abi, functionName: n, args = [] } = decode(tx);
      if (s.graphError && norm(tx.to) === norm(MINING))
        throw Error("Graph A unavailable");
      const item = abi.find((x) => x.type === "function" && x.name === n);
      if (item.stateMutability !== "view" && item.stateMutability !== "pure") {
        if (s.simulationError)
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: 3,
              message: "execution reverted",
              data: encodeErrorResult({
                abi: abis.HamsterMiningReserve,
                errorName: "CheckpointRequired",
              }),
            },
          };
        const result =
          n === "deposit"
            ? 1000n * W
            : n === "claimRewards"
              ? s.claimable
              : n === "harvest"
                ? s.pending
                : ["transfer", "transferFrom", "approve"].includes(n) &&
                    norm(tx.to) === norm(VAULT)
                  ? true
                  : undefined;
        return ok(
          encodeFunctionResult({
            abi,
            functionName: n,
            ...(result !== undefined ? { result } : {}),
          }),
        );
      }
      let result;
      const values = {
        activated: s.active,
        owner: s.owner,
        pendingOwner: s.pendingOwner,
        strategist: s.strategist,
        CORE,
        MINING,
        NFT,
        MINING_IMPLEMENTATION: IMPL,
        rewardToken: s.active ? TOKEN : zeroAddress,
        totalSupply: norm(tx.to) === norm(NFT) ? 6910n : s.supply,
        decimals: 18,
        totalWeight: 2000n,
        liveTokenIds: s.ids,
        totalRewardsReceived: 100n * W,
        totalRewardsPaid: 80n * W,
        balanceOf: s.balance,
        claimableRewards: s.claimable,
        pendingMiningRewards: s.pending,
        miningWeights: [2000n, 0n],
        implementationCodeVersion: norm(tx.to) === norm(MINING) ? 6n : 3n,
        implementationCodeAddress: IMPL,
        deploymentIdentity: [IMPL, OTHER],
        state: {
          settledThroughRound: 10n,
          cumulativeWork: 500n,
          cumulativeBlockUnits: 100n,
          blockHeight: 200n,
          blockProgress: 0n,
          workPerThousandBlocks: 100,
          authorizationNonce: 0n,
          paused: false,
        },
        checkpointStatus: [false, 11n, true],
        publicMinted: 8888,
        previewDeposit: 1000n * W,
        ownerOf: USER,
        getApproved: s.approved ? VAULT : zeroAddress,
        isApprovedForAll: false,
        symbol: "SQK",
        allowance: 250n * W,
      };
      result = n === "position" ? position(args[1]) : values[n];
      if (result === undefined) throw Error(`Unhandled mock read ${n}`);
      return ok(encodeFunctionResult({ abi, functionName: n, result }));
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: e.message },
      };
    }
  }
  if (method === "eth_estimateGas") return ok("0x186a0");
  if (method === "eth_gasPrice") return ok("0x3b9aca00");
  throw Error(`Unhandled RPC method ${method}`);
}
export async function mockWallet(args, s) {
  s.requests.push(args);
  if (args.method === "eth_requestAccounts") {
    s.authorized = true;
    return [USER];
  }
  if (args.method === "eth_accounts") return s.authorized ? [USER] : [];
  if (args.method === "eth_chainId") return "0x" + s.chainId.toString(16);
  if (args.method === "wallet_switchEthereumChain") {
    if (!s.known) throw { code: 4902, message: "Unknown chain" };
    s.chainId = Number(args.params[0].chainId);
    return null;
  }
  if (args.method === "wallet_addEthereumChain") {
    s.known = true;
    return null;
  }
  if (args.method === "eth_sendTransaction") {
    if (s.rejected) {
      s.rejected = false;
      throw { code: 4001, message: "User rejected the request" };
    }
    const tx = args.params[0],
      decoded = decode(tx),
      n = decoded.functionName;
    s.writes.push({ tx, ...decoded });
    if (n === "approve" && norm(tx.to) === norm(NFT)) s.approved = true;
    if (n === "deposit") {
      s.ids.push(decoded.args[0]);
      s.balance += 1000n * W;
      s.supply += 1000n * W;
    }
    if (n === "harvest") {
      s.claimable += s.pending / 2n;
      s.pending = 0n;
    }
    if (n === "claimRewards") s.claimable = 0n;
    if (n === "activate") s.active = true;
    if (n === "acceptOwnership") {
      s.owner = USER;
      s.pendingOwner = zeroAddress;
    }
    if (n === "renounceOwnership") s.owner = zeroAddress;
    if (n === "setStrategist") s.strategist = decoded.args[0];
    if (n === "transferOwnership") s.pendingOwner = decoded.args[0];
    if (n === "merge") s.ids = s.ids.filter((x) => x !== decoded.args[1]);
    const hash = "0x" + s.writes.length.toString(16).padStart(64, "0");
    s.receipts.set(hash, {
      transactionHash: hash,
      transactionIndex: "0x0",
      blockHash: "0x" + "ab".repeat(32),
      blockNumber: "0xb78f10",
      from: USER,
      to: tx.to,
      cumulativeGasUsed: "0x186a0",
      gasUsed: "0x186a0",
      effectiveGasPrice: "0x1",
      contractAddress: null,
      logs: [],
      logsBloom: "0x" + "00".repeat(256),
      status: "0x1",
      type: "0x2",
    });
    return hash;
  }
  throw Error(`Unhandled wallet method ${args.method}`);
}
export async function attach(page, s, { wallet = true } = {}) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (deployment.network.rpcUrls.some((u) => req.url().startsWith(u))) {
      const payload = req.postDataJSON();
      const results = Array.isArray(payload)
        ? payload.map((r) => rpc(r, s))
        : rpc(payload, s);
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(results),
      });
    }
    return route.continue();
  });
  if (wallet) {
    await page.exposeFunction("__wallet", (args) => mockWallet(args, s));
    await page.addInitScript(() => {
      const events = new Map();
      const provider = {
        isMetaMask: true,
        on: (n, cb) => {
          events.set(n, [...(events.get(n) || []), cb]);
        },
        removeListener: (n, cb) =>
          events.set(
            n,
            (events.get(n) || []).filter((x) => x !== cb),
          ),
        request: async (args) => {
          try {
            const r = await window.__wallet(args);
            if (args.method === "wallet_switchEthereumChain") {
              for (const cb of events.get("chainChanged") || [])
                cb(args.params[0].chainId);
            }
            return r;
          } catch (e) {
            throw Object.assign(new Error(e.message), { code: e.code });
          }
        },
      };
      window.ethereum = provider;
      const announce = () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: {
              info: {
                uuid: "d52680d1-0955-4ad1-a563-5924f328875c",
                name: "Test Browser Wallet",
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: "test.wallet",
              },
              provider,
            },
          }),
        );
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    });
  }
}
export async function serve() {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://preview").pathname;
    if (!path.startsWith("/preview/")) {
      res.writeHead(404).end();
      return;
    }
    const relative =
      decodeURIComponent(path.slice("/preview/".length)) || "index.html";
    if (relative.includes("..")) {
      res.writeHead(400).end();
      return;
    }
    try {
      const bytes = await readFile(resolve(root, "dist", relative));
      res.setHeader(
        "content-type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".json": "application/json",
        }[extname(relative)] ?? "application/octet-stream",
      );
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/preview/`,
    close: () => new Promise((r) => server.close(r)),
  };
}
