import {
  BaseError,
  ContractFunctionRevertedError,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const amount = (v: bigint | undefined, d = 18) =>
  v === undefined ? "Unavailable" : formatUnits(v, d);
export const compact = (v: bigint | undefined, d = 18) => {
  if (v === undefined) return "Unavailable";
  const s = formatUnits(v, d),
    [whole, frac] = s.split(".");
  if (v > 0n && whole === "0" && frac && /^0{4}/.test(frac)) return "<0.0001";
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (frac ? "." + frac.slice(0, 4) : "")
  );
};
export const integer = (v: bigint | undefined) =>
  v === undefined ? "Unavailable" : v.toLocaleString("en-US");
export const parseAmount = (s: string, d = 18) => {
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s.trim()) ||
    (s.split(".")[1]?.length ?? 0) > d
  )
    throw new Error(
      `Enter a positive amount with at most ${d} decimal places.`,
    );
  const v = parseUnits(s.trim(), d);
  if (v <= 0n) throw new Error("Enter an amount greater than zero.");
  return v;
};
export const tokenId = (s: string) => {
  if (!/^[1-9]\d*$/.test(s.trim()))
    throw new Error("Enter a whole NFT ID greater than zero.");
  return BigInt(s.trim());
};
export const recipient = (s: string, vault?: Address) => {
  const a = s.trim();
  if (!isAddress(a))
    throw new Error(
      "Enter a valid checksummed address. ENS names are not supported on this network.",
    );
  const address = getAddress(a);
  if (address === zeroAddress || address.toLowerCase() === vault?.toLowerCase())
    throw new Error("Choose a nonzero recipient other than the reserve.");
  return address;
};
const errors: Record<string, string> = {
  NotActivated:
    "The owner must activate the reserve before this action is available.",
  UnsupportedImplementation:
    "Graph A no longer matches the required implementation. Check the integration before continuing.",
  InvalidGraph:
    "Graph A validation failed. The owner cannot override these checks.",
  InvalidDeposit:
    "This wallet must own a live Genesis Squeek NFT that is not already deposited.",
  InvalidPosition:
    "This NFT has no valid settled mining position. Check the NFT ID.",
  PendingActivation:
    "This position is awaiting Graph A settlement. Checkpoint Mining when the round is ready, then inspect again.",
  ReserveFull:
    "The reserve holds its maximum 32 NFTs. A valid merge must free a slot first.",
  MinimumSharesNotMet:
    "The share quote changed. Inspect the NFT again and review the new minimum.",
  CheckpointRequired:
    "Mining has a checkpoint backlog. Advance a checkpoint, refresh and retry.",
  MergeCooldown:
    "The merge cooldown has not reached its required Squeek Core height. Refresh the positions.",
  InvalidMerge:
    "Choose two different, settled reserve NFTs at the same level below level 10.",
  UnexpectedSupply:
    "Share supply increased. Review the refreshed supply and prepare the merge again.",
  SupplyBelowFloor:
    "This burn would leave too few shares. Burn less or transfer shares to a willing recipient.",
  InvalidExit:
    "Burn a positive amount smaller than the total outstanding supply.",
  OnlyStrategist: "Only the current strategist can merge reserve NFTs.",
  OwnableUnauthorizedAccount:
    "This wallet does not have the required owner role.",
  ERC20InsufficientBalance:
    "Your share balance is too small. Refresh and enter a lower amount.",
  ERC20InsufficientAllowance:
    "The share allowance is too small. Ask the holder to approve the spender first.",
  InvalidRewardPayment:
    "The underlying reward transfer did not match the reported payment. No partial state change was applied.",
};
export function errorMessage(error: unknown): string {
  const e = error as {
    code?: number;
    message?: string;
    shortMessage?: string;
    cause?: unknown;
  };
  if (
    e.code === 4001 ||
    /user rejected|user denied|request rejected/i.test(
      e.shortMessage ?? e.message ?? "",
    )
  )
    return "Request declined in your wallet. You can try again when ready.";
  if (
    /provider.*not found|no provider/i.test(e.shortMessage ?? e.message ?? "")
  )
    return "No browser wallet was found. Choose Coinbase Wallet or open this page in a wallet app.";
  if (error instanceof BaseError) {
    const revert = error.walk(
      (x) => x instanceof ContractFunctionRevertedError,
    ) as ContractFunctionRevertedError;
    if (revert?.data?.errorName)
      return (
        errors[revert.data.errorName] ??
        `Contract refused this action (${revert.data.errorName}). Refresh the state before retrying.`
      );
    if (/insufficient funds/i.test(error.shortMessage))
      return "Your wallet needs Sepolia ETH for transaction fees. Use a faucet from the network details.";
    return error.shortMessage.length < 240
      ? error.shortMessage
      : "The RPC could not complete this request. Refresh and try again.";
  }
  return e.message && e.message.length < 240
    ? e.message
    : "Unable to complete this request. Check your network and try again.";
}
