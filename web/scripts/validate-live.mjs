import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeFunctionData, decodeFunctionResult } from "viem";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const d = JSON.parse(
  await readFile(resolve(root, "dist/imd-deployment.json"), "utf8"),
);
const abis = Object.fromEntries(
  await Promise.all(
    ["HamsterMiningReserve", "IGraphAMining", "IGraphACore", "IGraphANFT"].map(
      async (n) => [
        n,
        JSON.parse(await readFile(resolve(root, `web/abi/${n}.json`), "utf8")),
      ],
    ),
  ),
);
const endpoint = d.network.rpcUrls[0];
function rpc(method, params) {
  const body = execFileSync(
    "curl",
    [
      "--max-time",
      "30",
      "--fail",
      "--silent",
      "--show-error",
      "-H",
      "Content-Type: application/json",
      "--data",
      JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      endpoint,
    ],
    { encoding: "utf8" },
  );
  const r = JSON.parse(body);
  if (r.error) throw Error(JSON.stringify(r.error));
  return r.result;
}
const chain = Number(BigInt(rpc("eth_chainId", [])));
if (chain !== d.chainId) throw Error("Chain mismatch");
const blockHex = rpc("eth_blockNumber", []),
  block = BigInt(blockHex).toString();
function call(address, abi, functionName, args = []) {
  return decodeFunctionResult({
    abi,
    functionName,
    data: rpc("eth_call", [
      { to: address, data: encodeFunctionData({ abi, functionName, args }) },
      blockHex,
    ]),
  });
}
const vault = d.contracts[0];
const code = rpc("eth_getCode", [vault.address, blockHex]);
if (!code || code === "0x") throw Error("Empty deployed code");
const a = abis.HamsterMiningReserve;
const getters = [
  "activated",
  "owner",
  "pendingOwner",
  "strategist",
  "CORE",
  "MINING",
  "NFT",
  "MINING_IMPLEMENTATION",
  "rewardToken",
  "totalSupply",
  "totalWeight",
  "liveTokenIds",
  "totalRewardsReceived",
  "totalRewardsPaid",
];
const values = Object.fromEntries(
  getters.map((n) => [n, call(vault.address, a, n)]),
);
const graph = {
  miningVersion: call(
    values.MINING,
    abis.IGraphAMining,
    "implementationCodeVersion",
  ),
  coreVersion: call(values.CORE, abis.IGraphACore, "implementationCodeVersion"),
  implementation: call(
    values.MINING,
    abis.IGraphAMining,
    "implementationCodeAddress",
  ),
  deploymentIdentity: call(
    values.MINING,
    abis.IGraphAMining,
    "deploymentIdentity",
  ),
  coreState: call(values.CORE, abis.IGraphACore, "state"),
  checkpointStatus: call(values.MINING, abis.IGraphAMining, "checkpointStatus"),
  publicMinted: call(values.NFT, abis.IGraphANFT, "publicMinted"),
  nftSupply: call(values.NFT, abis.IGraphANFT, "totalSupply"),
};
const report = {
  checkedAt: new Date().toISOString(),
  source: endpoint,
  chainId: chain,
  block,
  address: vault.address,
  codeBytes: (code.length - 2) / 2,
  values,
  graph,
  transactionsBroadcast: 0,
  scope:
    "Read-only snapshot; frontend interaction tests use separate synthetic wallet/RPC fixtures.",
};
await writeFile(
  resolve(root, "docs/frontend/live-evidence.json"),
  JSON.stringify(
    report,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n",
);
console.log(
  `Read-only validation passed at block ${block}: deployed code present, activated=${values.activated}, Mining v${graph.miningVersion}, Core v${graph.coreVersion}. No transactions broadcast.`,
);
