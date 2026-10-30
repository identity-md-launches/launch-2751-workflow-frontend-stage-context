import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  createWalletClient,
  custom,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";
import type { Runtime } from "./config";
import { errorMessage, short } from "./format";
import { useTransactions } from "./Transactions";
export type Call = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  description: string;
};
type Phase =
  | "idle"
  | "checking"
  | "review"
  | "signing"
  | "confirming"
  | "unconfirmed"
  | "refreshing"
  | "success";
export function Action({
  rt,
  label,
  build,
  disabled = false,
  refresh,
  primary = false,
}: {
  rt: Runtime;
  label: string;
  build: () => Call | Promise<Call>;
  disabled?: boolean;
  refresh: () => Promise<unknown>;
  primary?: boolean;
}) {
  const { address, chainId, connector } = useAccount();
  const { record } = useTransactions();
  const [phase, setPhase] = useState<Phase>("idle");
  const [restoreRequested, setRestoreRequested] = useState(false);
  const [error, setError] = useState(""),
    [hash, setHash] = useState<`0x${string}`>(),
    [call, setCall] = useState<Call>(),
    [fresh, setFresh] = useState(false);
  const group = useRef<HTMLDivElement>(null);
  const review = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    lock = useRef(false),
    preparedAccount = useRef<Address | undefined>(undefined),
    activityId = useRef("");
  const busy = [
    "checking",
    "signing",
    "confirming",
    "review",
    "unconfirmed",
    "refreshing",
  ].includes(phase);
  useEffect(() => {
    if (phase === "review") {
      review.current?.close();
      setRestoreRequested(true);
      setPhase("idle");
      lock.current = false;
      setError("Wallet connection changed. Review the action again.");
    }
    // A wallet change invalidates the prepared transaction; normal phase changes do not.
  }, [address, chainId]);
  useEffect(() => {
    if (!restoreRequested || !["idle", "success"].includes(phase)) return;
    // Restore only after the DOM reflects the enabled state. If a completed
    // action is now unavailable, focus its status region instead.
    if (trigger.current && !trigger.current.disabled) trigger.current.focus();
    else group.current?.focus();
    setRestoreRequested(false);
  }, [phase, restoreRequested]);
  async function verified() {
    if (!address || !connector || chainId !== rt.chain.id)
      throw new Error(
        `Connect your wallet on ${rt.chain.name} before continuing.`,
      );
    const provider = (await connector.getProvider()) as EIP1193Provider;
    if (
      Number(await provider.request({ method: "eth_chainId" })) !== rt.chain.id
    )
      throw new Error(`Switch your wallet to ${rt.chain.name} and try again.`);
    if (
      (await rt.publicClient.getChainId()) !== rt.chain.id ||
      !(await rt.publicClient.getCode({ address: rt.vault.address }))
    )
      throw new Error(
        "The deployed reserve could not be verified. Refresh and try again.",
      );
    return { provider, account: address };
  }
  async function prepare() {
    if (lock.current) return;
    lock.current = true;
    setPhase("checking");
    setError("");
    setHash(undefined);
    setFresh(false);
    try {
      const { account } = await verified();
      const c = await build();
      await rt.publicClient.simulateContract({ ...c, account });
      preparedAccount.current = account;
      setCall(c);
      setPhase("review");
      review.current?.showModal();
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
      lock.current = false;
    }
  }
  function cancel() {
    if (phase === "signing" || phase === "confirming") return;
    review.current?.close();
    setPhase("idle");
    lock.current = false;
    setRestoreRequested(true);
  }
  async function confirmReceipt(tx: `0x${string}`, timeout = 180000) {
    setPhase("confirming");
    setError("");
    let receipt;
    let replacementReason: string | undefined;
    try {
      receipt = await rt.publicClient.waitForTransactionReceipt({
        hash: tx,
        timeout,
        onReplaced: ({ reason, transactionReceipt }) => {
          replacementReason = reason;
          setHash(transactionReceipt.transactionHash);
          record({
            id: activityId.current,
            label,
            status: "Pending",
            hash: transactionReceipt.transactionHash,
          });
        },
      });
    } catch {
      setPhase("unconfirmed");
      setError(
        "Confirmation is not available yet. Check the transaction status before trying another submission.",
      );
      record({
        id: activityId.current,
        label,
        status: "Pending",
        hash: tx,
        message: "Receipt unavailable. Check transaction status.",
      });
      return;
    }
    if (replacementReason && replacementReason !== "repriced") {
      const message =
        "This request was canceled or replaced in your wallet. Refresh the reserve and inspect the replacement transaction.";
      setError(message);
      setPhase("idle");
      record({
        id: activityId.current,
        label,
        status: "Failed",
        hash: receipt.transactionHash,
        message,
      });
      try {
        await refresh();
      } catch {
        /* The receipt remains available through the explorer link. */
      }
      return;
    }
    if (receipt.status !== "success") {
      const message =
        "The transaction reverted. Refresh the state before retrying.";
      setError(message);
      setPhase("idle");
      record({
        id: activityId.current,
        label,
        status: "Failed",
        hash: tx,
        message,
      });
      return;
    }
    record({
      id: activityId.current,
      label,
      status: "Confirmed",
      hash: receipt.transactionHash,
    });
    setPhase("refreshing");
    try {
      await refresh();
      setFresh(true);
    } catch (e) {
      setFresh(false);
      setError(errorMessage(e));
    } finally {
      setPhase("success");
    }
  }
  async function send() {
    if (!call || phase !== "review") return;
    activityId.current = crypto.randomUUID();
    record({ id: activityId.current, label, status: "Waiting for wallet" });
    setPhase("signing");
    review.current?.close();
    try {
      const { provider, account } = await verified();
      if (account !== preparedAccount.current)
        throw new Error("Wallet account changed. Review this action again.");
      // Re-simulate the reviewed arguments. Never silently replace quote or supply protections.
      const { request } = await rt.publicClient.simulateContract({
        ...call,
        account,
      });
      const wallet = createWalletClient({
        account,
        chain: rt.chain,
        transport: custom(provider),
      });
      const tx = await wallet.writeContract(request);
      setHash(tx);
      record({ id: activityId.current, label, status: "Pending", hash: tx });
      await confirmReceipt(tx);
    } catch (e) {
      setError(errorMessage(e));
      setPhase("idle");
      record({
        id: activityId.current,
        label,
        status: "Failed",
        message: errorMessage(e),
      });
    } finally {
      lock.current = false;
      setRestoreRequested(true);
    }
  }
  const verb =
    phase === "checking"
      ? "Checking transaction…"
      : phase === "signing"
        ? "Confirm in wallet…"
        : phase === "confirming"
          ? "Waiting for confirmation…"
          : phase === "unconfirmed"
            ? "Confirmation unavailable"
            : phase === "refreshing"
              ? "Refreshing contract state…"
              : label;
  return (
    <div className="action-group" ref={group} tabIndex={-1}>
      <button
        ref={trigger}
        className={primary ? "primary wide" : "wide"}
        disabled={disabled || busy || !address || chainId !== rt.chain.id}
        onClick={() => void prepare()}
      >
        {busy && phase !== "unconfirmed" && (
          <span className="spinner" aria-hidden="true" />
        )}
        {verb}
      </button>
      <div aria-live="polite">
        {phase === "success" && (
          <p className="success">
            {fresh
              ? "Confirmed. Contract state refreshed."
              : "Transaction confirmed. Refresh state to load balances."}
          </p>
        )}
        {hash && (
          <a
            className="tx-link"
            href={`${rt.deployment.network.explorer}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {phase === "success"
              ? "View confirmed transaction"
              : "View transaction"}{" "}
            {short(hash)} ↗
          </a>
        )}
        {(phase === "signing" || phase === "confirming") && (
          <p className="muted fine">
            {phase === "signing"
              ? "Review the request in your wallet."
              : "Waiting for an on-chain receipt. Keep this page open."}
          </p>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {phase === "unconfirmed" && hash && (
        <button
          className="wide"
          onClick={() => void confirmReceipt(hash, 20000)}
        >
          Check transaction status
        </button>
      )}
      <dialog
        ref={review}
        className="review-dialog"
        aria-labelledby={`review-${label.replace(/\W/g, "")}`}
        onCancel={(e) => {
          e.preventDefault();
          cancel();
        }}
      >
        <h2 id={`review-${label.replace(/\W/g, "")}`}>
          Review {label.toLowerCase()}
        </h2>
        <p>{call?.description}</p>
        <p className="muted fine">
          Network: {rt.chain.name}. Your wallet will show the gas fee in ETH. No
          USD price source is configured.
        </p>
        <p className="fine address-text">Contract: {call?.address}</p>
        <div className="button-pair">
          <button onClick={cancel}>Cancel</button>
          <button className="primary" onClick={() => void send()}>
            Confirm {label.toLowerCase()}
          </button>
        </div>
      </dialog>
    </div>
  );
}
