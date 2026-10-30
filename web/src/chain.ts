import { zeroAddress, type Abi, type Address, type PublicClient } from "viem";
import type { Runtime } from "./config";
export type Position = {
  activeWeight: bigint;
  pendingWeight: bigint;
  pendingRound: number;
  nextMergeBlock: number;
  level: number;
  lastIndex: bigint;
  accruedScaled: bigint;
};
export type CoreState = {
  blockHeight: bigint;
  paused: boolean;
  settledThroughRound: bigint;
};
export type Snapshot = {
  block: bigint;
  updated: number;
  activated: boolean;
  owner: Address;
  pendingOwner: Address;
  strategist: Address;
  core: Address;
  mining: Address;
  nft: Address;
  rewardToken: Address;
  expectedImplementation: Address;
  shares: bigint;
  shareDecimals: number;
  weight: bigint;
  ids: bigint[];
  received: bigint;
  paid: bigint;
  balance?: bigint;
  claimable?: bigint;
  rewardDecimals?: number;
  rewardSymbol?: string;
  pending?: bigint;
  weights?: readonly [bigint, bigint];
  graph?: {
    version: bigint;
    coreVersion: bigint;
    implementation: Address;
    identity: readonly [Address, Address];
    coreState: CoreState;
    checkpoint: readonly [boolean, bigint, boolean];
    minted: bigint;
    nftSupply: bigint;
  };
  positions?: { id: bigint; position: Position }[];
  graphError?: string;
  rewardError?: string;
};
export async function snapshot(
  rt: Runtime,
  account?: Address,
  client: PublicClient = rt.publicClient,
): Promise<Snapshot> {
  const block = await client.getBlockNumber();
  if ((await client.getChainId()) !== rt.deployment.chainId)
    throw new Error(
      "RPC chain does not match the deployment. Transactions are disabled.",
    );
  if (
    !(await client.getCode({ address: rt.vault.address, blockNumber: block }))
  )
    throw new Error(
      "No reserve code was found at the deployed address. Transactions are disabled.",
    );
  const call = (
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
  ) =>
    client.readContract({
      address,
      abi,
      functionName,
      args,
      blockNumber: block,
    });
  const names = [
    "activated",
    "owner",
    "pendingOwner",
    "strategist",
    "CORE",
    "MINING",
    "NFT",
    "rewardToken",
    "MINING_IMPLEMENTATION",
    "totalSupply",
    "decimals",
    "totalWeight",
    "liveTokenIds",
    "totalRewardsReceived",
    "totalRewardsPaid",
  ] as const;
  const values = await Promise.all(
    names.map((name) => call(rt.vault.address, rt.abis.vault, name)),
  );
  const v = Object.fromEntries(names.map((name, i) => [name, values[i]]));
  const s: Snapshot = {
    block,
    updated: Date.now(),
    activated: v.activated as boolean,
    owner: v.owner as Address,
    pendingOwner: v.pendingOwner as Address,
    strategist: v.strategist as Address,
    core: v.CORE as Address,
    mining: v.MINING as Address,
    nft: v.NFT as Address,
    rewardToken: v.rewardToken as Address,
    expectedImplementation: v.MINING_IMPLEMENTATION as Address,
    shares: v.totalSupply as bigint,
    shareDecimals: Number(v.decimals),
    weight: v.totalWeight as bigint,
    ids: v.liveTokenIds as bigint[],
    received: v.totalRewardsReceived as bigint,
    paid: v.totalRewardsPaid as bigint,
  };
  if (account) {
    const [balance, claimable] = await Promise.all([
      call(rt.vault.address, rt.abis.vault, "balanceOf", [account]),
      call(rt.vault.address, rt.abis.vault, "claimableRewards", [account]),
    ]);
    s.balance = balance as bigint;
    s.claimable = claimable as bigint;
  }
  try {
    const [
      version,
      coreVersion,
      implementation,
      identity,
      coreState,
      checkpoint,
      minted,
      nftSupply,
      positions,
    ] = await Promise.all([
      call(s.mining, rt.abis.mining, "implementationCodeVersion"),
      call(s.core, rt.abis.core, "implementationCodeVersion"),
      call(s.mining, rt.abis.mining, "implementationCodeAddress"),
      call(s.mining, rt.abis.mining, "deploymentIdentity"),
      call(s.core, rt.abis.core, "state"),
      call(s.mining, rt.abis.mining, "checkpointStatus"),
      call(s.nft, rt.abis.nft, "publicMinted"),
      call(s.nft, rt.abis.nft, "totalSupply"),
      Promise.all(
        s.ids.map(async (id) => ({
          id,
          position: (await call(s.mining, rt.abis.mining, "position", [
            0,
            id,
          ])) as Position,
        })),
      ),
    ]);
    s.graph = {
      version: version as bigint,
      coreVersion: coreVersion as bigint,
      implementation: implementation as Address,
      identity: identity as readonly [Address, Address],
      coreState: coreState as CoreState,
      checkpoint: checkpoint as readonly [boolean, bigint, boolean],
      minted: BigInt(minted as bigint),
      nftSupply: nftSupply as bigint,
    };
    s.positions = positions;
  } catch {
    s.graphError =
      "Graph A reads are unavailable. Deposits and merges are disabled. Refresh to retry.";
  }
  if (s.activated) {
    const extra = await Promise.allSettled([
      call(rt.vault.address, rt.abis.vault, "pendingMiningRewards"),
      call(rt.vault.address, rt.abis.vault, "miningWeights"),
      call(s.rewardToken, rt.abis.erc20, "decimals"),
      call(s.rewardToken, rt.abis.erc20, "symbol"),
    ]);
    if (extra[0].status === "fulfilled") s.pending = extra[0].value as bigint;
    if (extra[1].status === "fulfilled")
      s.weights = extra[1].value as readonly [bigint, bigint];
    if (extra[2].status === "fulfilled" && extra[3].status === "fulfilled") {
      s.rewardDecimals = Number(extra[2].value);
      s.rewardSymbol = extra[3].value as string;
    } else
      s.rewardError =
        "Reward token units could not be verified. Reward amounts are unavailable.";
  }
  return s;
}
export const graphVerified = (s: Snapshot) =>
  !!s.graph &&
  s.graph.version === 6n &&
  s.graph.coreVersion === 3n &&
  s.graph.implementation.toLowerCase() ===
    s.expectedImplementation.toLowerCase() &&
  s.graph.identity[0].toLowerCase() === s.expectedImplementation.toLowerCase();
export const same = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const isSet = (a: Address) => a !== zeroAddress;
