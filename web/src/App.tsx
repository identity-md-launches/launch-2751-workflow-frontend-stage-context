import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import {
  getAddress,
  type Address,
  type EIP1193Provider,
  type PublicClient,
  zeroAddress,
} from "viem";
import type { Runtime } from "./config";
import {
  snapshot,
  graphVerified,
  same,
  type Snapshot,
  type Position,
} from "./chain";
import { Action, type Call } from "./Action";
import { Wallet } from "./Wallet";
import { WalletActivity } from "./Transactions";
import {
  amount,
  compact,
  errorMessage,
  integer,
  parseAmount,
  recipient,
  tokenId,
} from "./format";
function Icon({
  kind = "leaf",
}: {
  kind?: "leaf" | "arrow" | "layers" | "shield" | "plus";
}) {
  const paths = {
    leaf: "M19 4C8 3 3 8 5 15s14 6 14-11ZM6 18l9-9",
    arrow: "M5 12h14m-5-5 5 5-5 5",
    layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
    shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
    plus: "M12 5v14M5 12h14",
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
function Wheel() {
  return (
    <svg className="wheel-art" aria-hidden="true" viewBox="0 0 220 150">
      <g stroke="#7f8b71" fill="none" strokeWidth="1.5">
        <circle cx="126" cy="70" r="58" />
        <circle cx="126" cy="70" r="50" />
        <path d="m126 12 0 116M68 70h116M85 29l82 82M85 111l82-82M103 139l23-69 24 69M85 139h80" />
      </g>
      <path
        d="M96 86c-11-21 1-35 17-32 2-10 16-8 17 3 22 0 29 28 13 37-11 6-40 5-47-8Z"
        fill="#c9794b"
        stroke="#4b5c41"
        strokeWidth="1.5"
      />
      <path
        d="M133 68c17 3 20 15 8 22-9 5-24 3-23-6 1-7 7-14 15-16Z"
        fill="#f8f7f2"
      />
      <circle cx="139" cy="68" r="2" fill="#292f27" />
      <path
        d="m151 75-5 3 4 3M106 91l-10 6m29-3-2 5"
        stroke="#292f27"
        fill="none"
        strokeWidth="1.5"
      />
      <circle cx="118" cy="57" r="4" fill="#e6ad87" />
      <path
        d="M38 123h33m108 0h14M47 113h8"
        stroke="#7f8b71"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function AddressLink({
  rt,
  address,
  label,
}: {
  rt: Runtime;
  address: Address;
  label: string;
}) {
  const displayAddress = getAddress(address);
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="address-row">
      <div>
        <span className="muted fine">{label}</span>
        <a
          className="address-text"
          href={`${rt.deployment.network.explorer}/address/${address}`}
          target="_blank"
          rel="noreferrer"
        >
          {displayAddress} ↗
        </a>
      </div>
      <button
        className="small-button"
        aria-label={`Copy ${label} address`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(displayAddress);
            setCopied(true);
            setError("");
          } catch {
            setError("Copy unavailable. Select the address to copy it.");
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
type PanelProps = {
  rt: Runtime;
  s?: Snapshot;
  ready: boolean;
  refresh: () => Promise<unknown>;
};
function Deposit({
  rt,
  s,
  ready,
  refresh,
}: {
  rt: Runtime;
  s?: Snapshot;
  ready: boolean;
  refresh: () => Promise<unknown>;
}) {
  const { address, chainId } = useAccount();
  const [id, setId] = useState(""),
    [slippage, setSlippage] = useState("1"),
    [consent, setConsent] = useState(false),
    [inspecting, setInspecting] = useState(false),
    [error, setError] = useState("");
  const inspectionVersion = useRef(0);
  const [quote, setQuote] = useState<{
    id: bigint;
    shares: bigint;
    approved: boolean;
    level: number;
    weight: bigint;
    account: Address;
    block: bigint;
    time: number;
  }>();
  const canDeposit =
    ready &&
    s?.activated &&
    graphVerified(s) &&
    !s.graph?.coreState.paused &&
    s.ids.length < 32;
  useEffect(() => {
    inspectionVersion.current++;
    setQuote(undefined);
    setConsent(false);
    setError("");
  }, [id, address, chainId]);
  async function inspect() {
    const version = ++inspectionVersion.current;
    setInspecting(true);
    setError("");
    setQuote(undefined);
    try {
      if (!s || !address || !canDeposit)
        throw new Error(
          "Connect on the correct network and wait for an active, verified reserve.",
        );
      const tid = tokenId(id),
        block = await rt.publicClient.getBlockNumber();
      const read = (
        a: Address,
        abi: typeof rt.abis.vault,
        name: string,
        args: readonly unknown[],
      ) =>
        rt.publicClient.readContract({
          address: a,
          abi,
          functionName: name,
          args,
          blockNumber: block,
        });
      const [shares, owner, approved, operator, pos] = await Promise.all([
        read(rt.vault.address, rt.abis.vault, "previewDeposit", [tid]),
        read(s.nft, rt.abis.nft, "ownerOf", [tid]),
        read(s.nft, rt.abis.nft, "getApproved", [tid]),
        read(s.nft, rt.abis.nft, "isApprovedForAll", [
          address,
          rt.vault.address,
        ]),
        read(s.mining, rt.abis.mining, "position", [0, tid]),
      ]);
      if (!same(owner as Address, address))
        throw new Error(
          "This wallet does not own that NFT. Enter a Genesis Squeek NFT you own.",
        );
      const p = pos as Position;
      if (
        Number(p.level) === 0 ||
        Number(p.level) > 10 ||
        BigInt(p.pendingRound) !== 0n ||
        p.pendingWeight !== 0n
      )
        throw new Error(
          "This NFT is not fully activated. Wait for Graph A settlement, then inspect again.",
        );
      if (version !== inspectionVersion.current) return;
      setQuote({
        id: tid,
        shares: shares as bigint,
        approved:
          same(approved as Address, rt.vault.address) || operator === true,
        level: Number(p.level),
        weight: p.activeWeight,
        account: address,
        block,
        time: Date.now(),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setInspecting(false);
    }
  }
  const minShares = () => {
    if (
      !quote ||
      quote.id !== tokenId(id) ||
      !same(quote.account, address) ||
      Date.now() - quote.time > 120000
    )
      throw new Error(
        "The deposit preview has expired. Inspect the NFT again.",
      );
    if (!/^\d+(\.\d{1,2})?$/.test(slippage) || Number(slippage) > 5)
      throw new Error(
        "Choose a share tolerance from 0 to 5%, with at most two decimals.",
      );
    const bps = BigInt(Math.round(Number(slippage) * 100));
    const minimum = (quote.shares * (10000n - bps)) / 10000n;
    if (minimum === 0n)
      throw new Error("The minimum share amount must be greater than zero.");
    return minimum;
  };
  return (
    <section
      className="panel deposit-panel"
      id="contribute"
      aria-labelledby="deposit-heading"
    >
      <div className="panel-title">
        <div className="heading-icon">
          <Icon kind="plus" />
          <h2 id="deposit-heading">Contribute an NFT</h2>
        </div>
        <span className="step-label">01 / Contribute</span>
      </div>
      <p className="muted intro-copy">
        Add a Genesis Squeek to the reserve and receive hmSQUEEK shares.
      </p>
      <div className="permanent-note">
        <Icon kind="shield" />
        <p>
          <strong>Permanent contribution.</strong> NFTs cannot be withdrawn.
          Shares carry future reward rights.
        </p>
      </div>
      {!address && (
        <p className="connection-hint">Connect above to inspect your NFT.</p>
      )}
      {address && chainId !== rt.chain.id && (
        <p className="notice">
          Switch to {rt.chain.name} with the wallet control above.
        </p>
      )}
      {s && !s.activated && (
        <p className="notice">
          Awaiting owner activation. Contributions open after on-chain
          verification.
        </p>
      )}
      {s?.graph?.coreState.paused && (
        <p className="notice">
          Squeek Core is paused. Deposits and merges wait; share transfers and
          claims remain available.
        </p>
      )}
      {s && s.ids.length >= 32 && (
        <p className="notice">
          The reserve is full. A strategist merge must free a slot before
          another contribution.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void inspect();
        }}
      >
        <label htmlFor="nft-id">Genesis NFT ID</label>
        <div className="input-with-action">
          <input
            id="nft-id"
            name="nftId"
            inputMode="numeric"
            value={id}
            placeholder="Enter NFT ID"
            onChange={(e) => setId(e.target.value)}
            aria-describedby={error ? "nft-help nft-error" : "nft-help"}
            aria-invalid={!!error}
          />
          <button type="submit" disabled={!canDeposit || inspecting}>
            {inspecting ? "Inspecting…" : "Inspect NFT"}
            <Icon kind="arrow" />
          </button>
        </div>
        <p className="fine muted" id="nft-help">
          Enter a live, settled Squeek you own.
        </p>
      </form>
      {error && (
        <p id="nft-error" className="error" role="alert">
          {error}
        </p>
      )}
      {quote && (
        <div className="deposit-quote">
          <div className="data-pair">
            <span>
              Level {quote.level} · {integer(quote.weight)} weight
            </span>
            <span className="muted fine">Block {quote.block.toString()}</span>
          </div>
          <p className="quote-number">
            {amount(quote.shares, s?.shareDecimals)} <span>hmSQUEEK</span>
          </p>
          <p className="fine muted">
            Provisional shares. Pricing may change before confirmation.
          </p>
          <label htmlFor="tolerance">Share tolerance (%)</label>
          <input
            id="tolerance"
            type="text"
            inputMode="decimal"
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            aria-describedby="minimum-help"
          />
          <p id="minimum-help" className="fine muted">
            Accept up to this percentage fewer shares, capped at 5%. A nonzero
            minimum is sent on chain.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>I understand this NFT stays in the reserve permanently.</span>
          </label>
          {!quote.approved ? (
            <Action
              rt={rt}
              label="Approve this NFT"
              primary
              disabled={!canDeposit || !consent}
              build={() => ({
                address: s!.nft,
                abi: rt.abis.nft,
                functionName: "approve",
                args: [rt.vault.address, quote.id],
                description: `Allow the reserve to transfer only Genesis NFT #${quote.id}. This approval does not deposit it. A separate deposit transaction follows.`,
              })}
              refresh={async () => {
                await refresh();
                await inspect();
              }}
            />
          ) : (
            <Action
              rt={rt}
              label="Contribute NFT"
              primary
              disabled={!canDeposit || !consent}
              build={() => ({
                address: rt.vault.address,
                abi: rt.abis.vault,
                functionName: "deposit",
                args: [quote.id, minShares()],
                description: `Permanently contribute Genesis NFT #${quote.id}. Receive at least ${amount(minShares(), s?.shareDecimals)} hmSQUEEK. You cannot withdraw the NFT. Its carried funded rewards remain yours.`,
              })}
              refresh={async () => {
                setQuote(undefined);
                setId("");
                setConsent(false);
                await refresh();
              }}
            />
          )}
        </div>
      )}
      {!quote && (
        <div className="deposit-bottom">
          <span className="fine muted">
            {s
              ? `${s.ids.length} of 32 reserve slots occupied`
              : "Reserve capacity loads from the contract"}
          </span>
          <Icon kind="leaf" />
        </div>
      )}
    </section>
  );
}
function Rewards({ rt, s, ready, refresh }: PanelProps) {
  const units = s?.rewardDecimals !== undefined,
    symbol = s?.rewardSymbol ?? "SQK";
  return (
    <section className="panel" id="rewards">
      <div className="panel-title">
        <div className="heading-icon">
          <Icon kind="leaf" />
          <h2>Claim funded rewards</h2>
        </div>
      </div>
      <p className="muted">
        Harvest funded SQK into the reserve, then claim the rewards already
        accounted to your wallet.
      </p>
      <dl className="ledger">
        <div>
          <dt>Ready for your wallet</dt>
          <dd
            title={units ? amount(s?.claimable, s.rewardDecimals) : undefined}
          >
            {units ? compact(s?.claimable, s.rewardDecimals) : "Unavailable"}{" "}
            <span>{symbol}</span>
          </dd>
        </div>
        <div>
          <dt>Reserve awaiting harvest</dt>
          <dd title={units ? amount(s?.pending, s.rewardDecimals) : undefined}>
            {units ? compact(s?.pending, s.rewardDecimals) : "Unavailable"}{" "}
            <span>{symbol}</span>
          </dd>
        </div>
      </dl>
      <div className="two-actions">
        <div>
          <Action
            rt={rt}
            label="Harvest reserve"
            disabled={!ready || !s?.activated || !s.ids.length}
            build={() => ({
              address: rt.vault.address,
              abi: rt.abis.vault,
              functionName: "harvest",
              description:
                "Collect already-funded Mining rewards for all live reserve NFTs. Rewards are distributed by share ownership. This sends no personal reward to the caller.",
            })}
            refresh={refresh}
          />
          <p className="fine muted">Anyone can harvest. No caller bonus.</p>
        </div>
        <div>
          <Action
            rt={rt}
            label="Claim rewards"
            disabled={!ready || !s?.activated || !s.claimable || !units}
            build={() => ({
              address: rt.vault.address,
              abi: rt.abis.vault,
              functionName: "claimRewards",
              description: `Claim your accounted ${amount(s?.claimable, s?.rewardDecimals)} ${symbol} to this wallet. Unharvested rewards are excluded. No shares are burned.`,
            })}
            refresh={refresh}
          />
          <p className="fine muted">Claim only your accounted balance.</p>
        </div>
      </div>
      <p className="fine muted">
        Uncertified work is not a funded reward. USD pricing is unavailable; all
        amounts use token units.
      </p>
    </section>
  );
}
function Shares({ rt, s, ready, refresh }: PanelProps) {
  const [to, setTo] = useState(""),
    [value, setValue] = useState(""),
    [burn, setBurn] = useState("");
  const [spender, setSpender] = useState(""),
    [approval, setApproval] = useState(""),
    [from, setFrom] = useState(""),
    [dest, setDest] = useState(""),
    [delegated, setDelegated] = useState("");
  const [allowance, setAllowance] = useState<bigint>(),
    [allowanceError, setAllowanceError] = useState("");
  const { address } = useAccount();
  const call = (
    functionName: string,
    args: readonly unknown[],
    description: string,
  ): Call => ({
    address: rt.vault.address,
    abi: rt.abis.vault,
    functionName,
    args,
    description,
  });
  const transferAmount = (v: string) => {
    const n = parseAmount(v, s?.shareDecimals);
    if (n > (s?.balance ?? 0n))
      throw new Error(
        "Enter an amount no greater than your current share balance.",
      );
    return n;
  };
  return (
    <section className="panel" id="shares">
      <div className="panel-title">
        <div className="heading-icon">
          <Icon kind="layers" />
          <h2>Manage your shares</h2>
        </div>
      </div>
      <div className="share-balance">
        <span className="muted">Wallet balance</span>
        <p title={amount(s?.balance, s?.shareDecimals)}>
          {compact(s?.balance, s?.shareDecimals)} <span>hmSQUEEK</span>
        </p>
      </div>
      <p className="muted">
        Transfer shares to a willing recipient to leave future participation.
        Already accrued SQK stays claimable by you.
      </p>
      <div className="field-stack">
        <label htmlFor="transfer-to">Recipient address</label>
        <input
          id="transfer-to"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <label htmlFor="transfer-amount">Shares to transfer (hmSQUEEK)</label>
        <input
          id="transfer-amount"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Action
          rt={rt}
          label="Transfer shares"
          disabled={!ready || !s?.activated || !s.balance}
          build={() =>
            call(
              "transfer",
              [recipient(to, rt.vault.address), transferAmount(value)],
              `Transfer ${value} hmSQUEEK to ${recipient(to, rt.vault.address)}. The recipient receives future reward rights; accrued rewards remain with you. No NFT is returned.`,
            )
          }
          refresh={refresh}
        />
      </div>
      <details className="disclosure">
        <summary>Advanced share controls</summary>
        <p className="fine muted">
          Shares are internal accounting rights. There is no market, swap or
          liquidity pool.
        </p>
        <h3>Approve a share spender</h3>
        <label htmlFor="spender">Spender address</label>
        <input
          id="spender"
          value={spender}
          onChange={(e) => {
            setSpender(e.target.value);
            setAllowance(undefined);
          }}
          placeholder="0x…"
          spellCheck={false}
        />
        <label htmlFor="allowance">Allowance (hmSQUEEK)</label>
        <input
          id="allowance"
          value={approval}
          onChange={(e) => setApproval(e.target.value)}
          inputMode="decimal"
          placeholder="0 to revoke"
        />
        <button
          className="wide"
          disabled={!address}
          onClick={async () => {
            setAllowanceError("");
            try {
              setAllowance(
                (await rt.publicClient.readContract({
                  address: rt.vault.address,
                  abi: rt.abis.vault,
                  functionName: "allowance",
                  args: [address, recipient(spender, rt.vault.address)],
                })) as bigint,
              );
            } catch (e) {
              setAllowanceError(errorMessage(e));
            }
          }}
        >
          Read current allowance
        </button>
        {allowance !== undefined && (
          <p className="fine">
            Current allowance: {amount(allowance, s?.shareDecimals)} hmSQUEEK
          </p>
        )}
        {allowanceError && (
          <p className="error" role="alert">
            {allowanceError}
          </p>
        )}
        <Action
          rt={rt}
          label="Set share allowance"
          disabled={!ready}
          build={() =>
            call(
              "approve",
              [
                recipient(spender, rt.vault.address),
                approval.trim() === "0"
                  ? 0n
                  : parseAmount(approval, s?.shareDecimals),
              ],
              `Allow ${recipient(spender, rt.vault.address)} to transfer up to ${approval} hmSQUEEK from your wallet. Setting zero revokes permission.`,
            )
          }
          refresh={async () => {
            setAllowance(undefined);
            await refresh();
          }}
        />
        <h3>Transfer as an approved spender</h3>
        <label htmlFor="from">Share holder address</label>
        <input
          id="from"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
        />
        <label htmlFor="delegated-to">Recipient address</label>
        <input
          id="delegated-to"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder="0x…"
          spellCheck={false}
        />
        <label htmlFor="delegated-amount">Transfer amount (hmSQUEEK)</label>
        <input
          id="delegated-amount"
          value={delegated}
          onChange={(e) => setDelegated(e.target.value)}
          inputMode="decimal"
        />
        <Action
          rt={rt}
          label="Transfer approved shares"
          disabled={!ready || !s?.activated}
          build={() =>
            call(
              "transferFrom",
              [
                recipient(from, rt.vault.address),
                recipient(dest, rt.vault.address),
                parseAmount(delegated, s?.shareDecimals),
              ],
              `Transfer ${delegated} hmSQUEEK from ${recipient(from, rt.vault.address)} to ${recipient(dest, rt.vault.address)} using this wallet's existing allowance.`,
            )
          }
          refresh={refresh}
        />
        <h3>Renounce shares permanently</h3>
        <p className="fine muted">
          Burning abandons future rewards and returns no NFTs. Accrued rewards
          stay claimable. The supply floor and a nonzero outstanding supply must
          remain.
        </p>
        <label htmlFor="burn">Shares to burn (hmSQUEEK)</label>
        <input
          id="burn"
          inputMode="decimal"
          value={burn}
          onChange={(e) => setBurn(e.target.value)}
        />
        <Action
          rt={rt}
          label="Burn shares permanently"
          disabled={!ready || !s?.activated || !s.balance}
          build={() =>
            call(
              "renounceShares",
              [transferAmount(burn)],
              `Permanently burn ${burn} hmSQUEEK. You give up these future reward rights. No NFT or other asset is returned. Accrued SQK stays claimable.`,
            )
          }
          refresh={refresh}
        />
      </details>
    </section>
  );
}
function Management({ rt, s, ready, refresh }: PanelProps) {
  const { address } = useAccount();
  const [survivor, setSurvivor] = useState(""),
    [donor, setDonor] = useState(""),
    [strategist, setStrategist] = useState(""),
    [owner, setOwner] = useState("");
  const isOwner = same(address, s?.owner),
    isStrategist = same(address, s?.strategist),
    isPendingOwner = same(address, s?.pendingOwner);
  const call = (
    functionName: string,
    args: readonly unknown[],
    description: string,
  ): Call => ({
    address: rt.vault.address,
    abi: rt.abis.vault,
    functionName,
    args,
    description,
  });
  function mergeCall() {
    if (!s || !graphVerified(s))
      throw new Error("Graph A must be verified before merging.");
    const a = tokenId(survivor),
      b = tokenId(donor),
      p = s.positions?.find((p) => p.id === a)?.position,
      q = s.positions?.find((p) => p.id === b)?.position;
    if (a === b || !p || !q || p.level !== q.level || p.level >= 10 || !p.level)
      throw new Error(
        "Choose two different reserve NFTs at the same level below level 10.",
      );
    if (
      BigInt(p.pendingRound) ||
      BigInt(q.pendingRound) ||
      p.pendingWeight ||
      q.pendingWeight
    )
      throw new Error(
        "Both positions must finish pending activation before merging.",
      );
    if (
      BigInt(s.graph!.coreState.blockHeight) <
      BigInt(Math.max(Number(p.nextMergeBlock), Number(q.nextMergeBlock)))
    )
      throw new Error(
        "The merge cooldown has not reached the required Squeek Core height.",
      );
    return call(
      "merge",
      [a, b, s.shares],
      `Merge reserve NFT #${b} into #${a}. The donor is burned. Final pricing weight rises by 1,000; active weight follows settlement. Maximum share supply: ${amount(s.shares, s.shareDecimals)} hmSQUEEK. A preceding deposit makes this transaction revert.`,
    );
  }
  return (
    <section className="panel" id="operations">
      <div className="panel-title">
        <div className="heading-icon">
          <Icon kind="shield" />
          <h2>Reserve operations</h2>
        </div>
      </div>
      <p className="muted">
        Mining checkpoints fund settled rounds. Merge and setup controls appear
        for their authorized roles.
      </p>
      <dl className="ledger">
        <div>
          <dt>Squeek Core height</dt>
          <dd>
            {integer(
              s?.graph ? BigInt(s.graph.coreState.blockHeight) : undefined,
            )}
          </dd>
        </div>
        <div>
          <dt>Checkpoint backlog</dt>
          <dd>
            {s?.graph
              ? s.graph.checkpoint[2]
                ? "Ready to advance"
                : "Caught up"
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Core status</dt>
          <dd>
            {s?.graph
              ? s.graph.coreState.paused
                ? "Paused"
                : "Running"
              : "Unavailable"}
          </dd>
        </div>
      </dl>
      <Action
        rt={rt}
        label="Advance Mining checkpoint"
        disabled={
          !ready || !s?.graph || s.graph.checkpoint[0] || !s.graph.checkpoint[2]
        }
        build={() => ({
          address: s!.mining,
          abi: rt.abis.mining,
          functionName: "checkpoint",
          description:
            "Advance one bounded Mining checkpoint to fund settled rounds. It may take more than one checkpoint to clear a backlog. This does not send rewards to your wallet.",
        })}
        refresh={refresh}
      />
      {isStrategist && (
        <div className="role-section">
          <h3>Strategist merge</h3>
          <p className="fine muted">
            Use settled reserve positions at equal levels. Cooldowns use Squeek
            Core height.
          </p>
          <label htmlFor="survivor">Surviving NFT ID</label>
          <input
            id="survivor"
            value={survivor}
            onChange={(e) => setSurvivor(e.target.value)}
            inputMode="numeric"
          />
          <label htmlFor="donor">Donor NFT ID (burned)</label>
          <input
            id="donor"
            value={donor}
            onChange={(e) => setDonor(e.target.value)}
            inputMode="numeric"
          />
          <Action
            rt={rt}
            label="Merge reserve NFTs"
            disabled={
              !ready ||
              !s?.activated ||
              !graphVerified(s) ||
              s.graph?.coreState.paused
            }
            build={mergeCall}
            refresh={refresh}
          />
        </div>
      )}
      {isOwner && (
        <div className="role-section">
          <h3>Owner setup</h3>
          {!s?.activated && (
            <>
              <p className="notice">
                Activate once to verify Graph A and pin its SQK reward token.
                Deposits stay closed until this succeeds.
              </p>
              <Action
                rt={rt}
                label="Activate reserve"
                disabled={!ready}
                build={() =>
                  call(
                    "activate",
                    [],
                    "Verify Sepolia and the required Graph A identity, NFT links and level weights. Discover and permanently pin the reward token. This is a one-time activation.",
                  )
                }
                refresh={refresh}
              />
            </>
          )}
          <label htmlFor="strategist">Strategist address</label>
          <input
            id="strategist"
            value={strategist}
            onChange={(e) => setStrategist(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
          />
          <Action
            rt={rt}
            label="Set strategist"
            disabled={!ready}
            build={() =>
              call(
                "setStrategist",
                [recipient(strategist, rt.vault.address)],
                `Grant merge permission to ${recipient(strategist, rt.vault.address)}. This replaces the current strategist.`,
              )
            }
            refresh={refresh}
          />
          <details className="disclosure">
            <summary>Ownership controls</summary>
            <label htmlFor="next-owner">New owner address</label>
            <input
              id="next-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="0x…"
              spellCheck={false}
            />
            <Action
              rt={rt}
              label="Propose new owner"
              disabled={!ready}
              build={() =>
                call(
                  "transferOwnership",
                  [recipient(owner, rt.vault.address)],
                  `Propose ${recipient(owner, rt.vault.address)} as the new owner. They must accept in a second transaction. The strategist role does not change.`,
                )
              }
              refresh={refresh}
            />
            {s?.pendingOwner !== zeroAddress && (
              <Action
                rt={rt}
                label="Cancel ownership proposal"
                disabled={!ready}
                build={() =>
                  call(
                    "transferOwnership",
                    [zeroAddress],
                    "Cancel the pending two-step ownership transfer. Current ownership and strategist remain unchanged.",
                  )
                }
                refresh={refresh}
              />
            )}
            <Action
              rt={rt}
              label="Renounce ownership"
              disabled={!ready || !s?.activated}
              build={() =>
                call(
                  "renounceOwnership",
                  [],
                  "Permanently remove the owner. Nobody can change the strategist or recover ownership afterward. The current strategist keeps merge permission. This cannot be undone.",
                )
              }
              refresh={refresh}
            />
          </details>
        </div>
      )}
      {isPendingOwner && (
        <div className="role-section">
          <h3>Pending ownership</h3>
          <Action
            rt={rt}
            label="Accept ownership"
            disabled={!ready}
            build={() =>
              call(
                "acceptOwnership",
                [],
                "Accept ownership of the reserve. The current strategist is unchanged.",
              )
            }
            refresh={refresh}
          />
        </div>
      )}
      {!isOwner && !isStrategist && !isPendingOwner && (
        <p className="fine muted">
          The connected owner or strategist can manage setup and merges here.
        </p>
      )}
    </section>
  );
}
function Inventory({ s }: { s?: Snapshot }) {
  return (
    <section className="inventory-section" id="inventory">
      <div className="section-title">
        <h2>Inside the reserve</h2>
        <span className="muted fine">Genesis collection · Graph A</span>
      </div>
      {!s ? (
        <p className="muted">
          Reserve inventory is unavailable until a successful chain read.
        </p>
      ) : !s.ids.length ? (
        <div className="empty-inventory">
          <Icon kind="layers" />
          <h3>The reserve has room to grow</h3>
          <p className="muted">
            No NFTs are in the reserve at block {s.block.toString()}. Inspect a
            Squeek above to begin a contribution.
          </p>
        </div>
      ) : (
        <div className="inventory-list">
          {s.ids.map((id) => {
            const p = s.positions?.find((p) => p.id === id)?.position;
            return (
              <div key={id.toString()} className="inventory-row">
                <strong>Squeek #{id.toString()}</strong>
                <span>Level {p ? Number(p.level) : "unavailable"}</span>
                <span>
                  Active weight {p ? integer(p.activeWeight) : "unavailable"}
                </span>
                <span>
                  {p && BigInt(p.pendingRound) !== 0n
                    ? `Pending replacement ${p.pendingWeight} in round ${p.pendingRound}`
                    : "Settled position"}
                </span>
                <span className="fine muted">
                  Next merge at Core height{" "}
                  {p ? p.nextMergeBlock.toString() : "unavailable"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function App({ rt }: { rt: Runtime }) {
  const { address, chainId, connector } = useAccount();
  const query = useQuery({
    queryKey: ["reserve", address ?? "public", chainId],
    queryFn: async () => {
      let client: PublicClient = rt.publicClient;
      if (connector && chainId === rt.chain.id)
        client = rt.walletFallback(
          (await connector.getProvider()) as EIP1193Provider,
        ) as PublicClient;
      return snapshot(rt, address, client);
    },
    retry: 1,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  const s = query.data;
  const ready =
    !!address &&
    chainId === rt.chain.id &&
    !!s &&
    !query.isError &&
    Date.now() - s.updated < 60000;
  const refresh = async () => {
    const r = await query.refetch();
    if (r.isError)
      throw new Error(
        "Transaction confirmed, but fresh state is unavailable. Use Refresh state to retry.",
      );
    return r;
  };
  const props = { rt, s, ready, refresh };
  const [tab, setTab] = useState<"reserve" | "guide">("reserve");
  const status = query.isError
    ? "Read unavailable"
    : query.isPending
      ? "Connecting to Sepolia"
      : s?.activated
        ? "Reserve active"
        : "Awaiting activation";
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to reserve
      </a>
      <header className="header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            aria-label="Hamster Mining Reserve home"
            onClick={() => setTab("reserve")}
          >
            <img src="./favicon.svg" alt="" width="38" height="38" />
            <span>
              Hamster<span className="brand-sub">Mining Reserve</span>
            </span>
          </a>
          <nav aria-label="Main navigation">
            <button
              aria-current={tab === "reserve" ? "page" : undefined}
              onClick={() => setTab("reserve")}
            >
              Reserve
            </button>
            <button
              aria-current={tab === "guide" ? "page" : undefined}
              onClick={() => setTab("guide")}
            >
              How it works
            </button>
          </nav>
          <Wallet rt={rt} />
        </div>
      </header>
      <main id="main" className="main">
        <div className="page-intro">
          <div>
            <div className="network-line">
              <span className="network-dot" /> {rt.chain.name} testnet{" "}
              <span className="divider">/</span> Permanent NFT reserve
            </div>
            <h1>Hamster Mining Reserve</h1>
            <p className="muted">
              Pool Squeek mining weight. Share funded rewards.
            </p>
          </div>
          <Wheel />
        </div>
        {tab === "reserve" ? (
          <>
            <div className="state-bar">
              <span
                className={`state-label ${query.isError ? "state-error" : ""}`}
              >
                <span className="status-dot" />
                {status}
              </span>
              <span className="state-source">
                {s
                  ? `Block ${s.block.toString()}`
                  : "Reading deployed contracts"}
              </span>
              <button
                className="refresh-button"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                {query.isFetching ? "Refreshing…" : "Refresh state"}
                <span aria-hidden="true">↻</span>
              </button>
            </div>
            {query.isError && (
              <p className="error read-error" role="alert">
                {errorMessage(query.error)} Values from the last successful
                read, if present, are stale. Transactions are disabled.
              </p>
            )}
            {s?.graphError && (
              <p className="notice" role="status">
                {s.graphError}
              </p>
            )}
            {s?.graph && !graphVerified(s) && (
              <p className="notice">
                Graph A identity does not match the required Mining v6 and Core
                v3 integration. Contributions and merges are disabled.
              </p>
            )}
            {s?.rewardError && <p className="notice">{s.rewardError}</p>}
            <div className="workspace">
              <Deposit {...props} />
              <aside className="stats-panel" aria-label="Reserve at a glance">
                <div className="stats-title">
                  <h2>Reserve at a glance</h2>
                  <Icon kind="layers" />
                </div>
                <dl className="big-stats">
                  <div>
                    <dt>Final pricing weight</dt>
                    <dd>{integer(s?.weight)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding shares</dt>
                    <dd
                      className="stat-shares"
                      title={amount(s?.shares, s?.shareDecimals)}
                    >
                      {compact(s?.shares, s?.shareDecimals)}
                      <span>hmSQUEEK</span>
                    </dd>
                  </div>
                </dl>
                <dl className="ledger small-ledger">
                  <div>
                    <dt>Active mining weight</dt>
                    <dd>{integer(s?.weights?.[0])}</dd>
                  </div>
                  <div>
                    <dt>Pending weight increase</dt>
                    <dd>{integer(s?.weights?.[1])}</dd>
                  </div>
                  <div>
                    <dt>Live reserve NFTs</dt>
                    <dd>{s ? `${s.ids.length} / 32` : "Unavailable"}</dd>
                  </div>
                </dl>
                <p className="fine muted">
                  hmSQUEEK records participation in this reserve. It is not sold
                  and has no liquidity pool.
                </p>
              </aside>
            </div>
            <div className="workspace secondary">
              <Rewards {...props} />
              <Shares {...props} />
            </div>
            <Inventory s={s} />
            <div className="workspace secondary">
              <Management {...props} />
              <section className="panel integration">
                <div className="panel-title">
                  <h2>On-chain transparency</h2>
                  <Icon kind="shield" />
                </div>
                <p className="muted">
                  Read directly from the deployed reserve and Graph A. No fixed
                  yield or reward estimate is promised.
                </p>
                <dl className="ledger">
                  <div>
                    <dt>Graph A public minted</dt>
                    <dd>{integer(s?.graph?.minted)}</dd>
                  </div>
                  <div>
                    <dt>Graph A NFT supply</dt>
                    <dd>{integer(s?.graph?.nftSupply)}</dd>
                  </div>
                  <div>
                    <dt>Total rewards received</dt>
                    <dd>
                      {s?.rewardDecimals !== undefined
                        ? compact(s.received, s.rewardDecimals)
                        : "Unavailable"}{" "}
                      SQK
                    </dd>
                  </div>
                  <div>
                    <dt>Total rewards paid</dt>
                    <dd>
                      {s?.rewardDecimals !== undefined
                        ? compact(s.paid, s.rewardDecimals)
                        : "Unavailable"}{" "}
                      SQK
                    </dd>
                  </div>
                </dl>
                <AddressLink
                  rt={rt}
                  address={rt.vault.address}
                  label="Hamster Mining Reserve"
                />
                {s && (
                  <>
                    <AddressLink rt={rt} address={s.core} label="Squeek Core" />
                    <AddressLink
                      rt={rt}
                      address={s.mining}
                      label="Graph A Mining"
                    />
                    <AddressLink rt={rt} address={s.nft} label="Squeek NFT" />
                    {s.activated && s.rewardToken !== zeroAddress && (
                      <AddressLink
                        rt={rt}
                        address={s.rewardToken}
                        label="SQK reward token"
                      />
                    )}
                    <AddressLink rt={rt} address={s.owner} label="Owner" />
                    <AddressLink
                      rt={rt}
                      address={s.strategist}
                      label="Strategist"
                    />
                    {s.pendingOwner !== zeroAddress && (
                      <AddressLink
                        rt={rt}
                        address={s.pendingOwner}
                        label="Pending owner"
                      />
                    )}
                  </>
                )}
                <details className="disclosure">
                  <summary>Deployment & network details</summary>
                  <p className="fine address-text">
                    Source commit: {rt.deployment.sourceCommit}
                  </p>
                  <p className="fine address-text">
                    Attestation: {rt.deployment.attestationHash}
                  </p>
                  <p className="fine address-text">ABI: {rt.vault.abiHash}</p>
                  <p className="fine">Chain ID: {rt.chain.id}</p>
                  <ul className="source-list">
                    {rt.deployment.network.rpcUrls.map((url) => (
                      <li key={url} className="address-text">
                        {url}
                      </li>
                    ))}
                  </ul>
                  <p className="fine muted">Need Sepolia ETH for gas?</p>
                  {rt.deployment.network.faucets.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="external-link"
                    >
                      Open test ETH faucet {i + 1} ↗
                    </a>
                  ))}
                  <a href="./imd-deployment.json" className="external-link">
                    View deployment manifest ↗
                  </a>
                </details>
              </section>
            </div>
            <WalletActivity rt={rt} />
          </>
        ) : (
          <section className="guide panel">
            <h2>A permanent home for mining NFTs</h2>
            <p>
              Hamster Mining Reserve holds Genesis Squeek mining NFTs
              permanently. Depositors receive hmSQUEEK, an internal accounting
              share of the reserve’s future funded SQK rewards.
            </p>
            <ol>
              <li>
                <h3>Inspect and contribute</h3>
                <p>
                  Connect on Sepolia and enter an NFT ID. The app checks
                  ownership, level, settlement and approval. Review the
                  provisional shares and your minimum, approve that NFT, then
                  contribute it. There is no NFT withdrawal.
                </p>
              </li>
              <li>
                <h3>Grow the mining weight</h3>
                <p>
                  A designated strategist can merge equal-level reserve NFTs.
                  Each merge burns a donor and adds 1,000 final weight. Active
                  mining weight catches up after Graph A settlement.
                </p>
              </li>
              <li>
                <h3>Harvest, then claim</h3>
                <p>
                  Anyone can harvest funded Mining rewards into the reserve.
                  Claim your accounted SQK separately. Unharvested rewards and
                  uncertified physical work are not your current claimable
                  balance.
                </p>
              </li>
              <li>
                <h3>Transfer future participation</h3>
                <p>
                  Transfer hmSQUEEK to a willing recipient when you want to
                  leave. Already accrued SQK remains yours. Optional share burns
                  return nothing and must preserve the supply floor.
                </p>
              </li>
            </ol>
            <p>
              Sepolia is a test network. This site offers no swap, sale,
              liquidity pool, fixed yield or USD valuation. Transactions are
              simulated before wallet confirmation. Confirm the contract,
              network and gas fee in your wallet.
            </p>
            <button onClick={() => setTab("reserve")}>
              Return to reserve <Icon kind="arrow" />
            </button>
          </section>
        )}
      </main>
      <footer className="footer">
        <span>Hamster Mining Reserve</span>
        <span>Permanent custody. Shared mining weight.</span>
        <a href="./imd-deployment.json">Deployment record ↗</a>
      </footer>
    </>
  );
}
