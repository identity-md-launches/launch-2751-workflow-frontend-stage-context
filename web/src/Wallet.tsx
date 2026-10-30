import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { getAddress, type EIP1193Provider } from "viem";
import { switchNetwork, type Runtime } from "./config";
import { errorMessage, short } from "./format";
import { WALLET_MARKS } from "./wallet-marks";
const ICONS: Record<string, string> = {
  coinbaseWalletSDK:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1652f0"/><circle cx="16" cy="16" r="10" fill="white"/><path fill="#1652f0" d="M11 11h10v10H11z"/></svg>',
  injected:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="3" y="6" width="26" height="21" rx="5" fill="#68745d"/><rect x="18" y="12" width="13" height="10" rx="3" fill="#e9eadc"/><circle cx="23" cy="17" r="2" fill="#333a2f"/></svg>',
};
const OPEN_IN = [
  {
    name: "MetaMask",
    icon: "metamask",
    href: (u: string) =>
      `https://link.metamask.io/dapp/${u.replace(/^https?:\/\//, "")}`,
  },
  {
    name: "Coinbase Wallet",
    icon: "coinbaseWalletSDK",
    href: (u: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(u)}`,
  },
  {
    name: "Rabby",
    icon: "rabby",
    href: (u: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(u)}`,
  },
  {
    name: "Phantom",
    icon: "phantom",
    href: (u: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}`,
  },
];
function WalletMark({ id, icon }: { id: string; icon?: string }) {
  const svg = ICONS[id] ?? WALLET_MARKS[id] ?? ICONS.injected;
  return (
    <img
      width="28"
      height="28"
      alt=""
      src={icon ?? `data:image/svg+xml,${encodeURIComponent(svg)}`}
    />
  );
}
export function Wallet({ rt }: { rt: Runtime }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [switching, setSwitching] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const listed = [
    ...connectors.filter((c) => c.type === "injected"),
    ...connectors.filter((c) => c.type !== "injected"),
  ].filter((c) => !(c.id === "injected" && named));
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (isConnected) setOpen(false);
  }, [isConnected]);
  async function changeChain() {
    if (!connector) return;
    setSwitching(true);
    setError("");
    try {
      await switchNetwork(
        (await connector.getProvider()) as EIP1193Provider,
        rt.deployment,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSwitching(false);
    }
  }
  const wrong = isConnected && chainId !== rt.deployment.chainId;
  return (
    <div className="wallet-area">
      <button
        className="wallet-button"
        ref={trigger}
        disabled={switching}
        onClick={() => (wrong ? void changeChain() : setOpen(true))}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="5" width="18" height="15" rx="3" />
          <path d="M17 12h4M6 5V3h12" />
        </svg>
        {switching
          ? "Switching…"
          : wrong
            ? `Switch to ${rt.chain.name}`
            : address
              ? short(getAddress(address))
              : "Connect wallet"}
      </button>
      {error && !open && (
        <p className="wallet-error" role="alert">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="wallet-sheet"
        aria-labelledby="wallet-title"
        onCancel={() => setOpen(false)}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) setOpen(false);
        }}
      >
        <div className="sheet-heading">
          <h2 id="wallet-title">
            {isConnected ? "Connected wallet" : "Connect a wallet"}
          </h2>
          <button
            className="icon-button"
            aria-label="Close wallet picker"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>
        {address ? (
          <>
            <p className="address-text">
              <a
                href={`${rt.deployment.network.explorer}/address/${address}`}
                target="_blank"
                rel="noreferrer"
              >
                {getAddress(address)} ↗
              </a>
            </p>
            <button
              className="wide"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setError("Address copied.");
                } catch {
                  setError("Select the address above to copy it.");
                }
              }}
            >
              Copy wallet address
            </button>
            {error && (
              <p role="status" className="fine">
                {error}
              </p>
            )}
            <p className="muted">Signing stays in your wallet.</p>
            <button
              className="wide"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Choose a wallet to manage your reserve shares.
            </p>
            {!mobile &&
              listed.map((c) => (
                <button
                  className="wallet-row"
                  key={c.uid}
                  disabled={isPending}
                  onClick={async () => {
                    setError("");
                    try {
                      await connectAsync({ connector: c });
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  <WalletMark id={c.id} icon={c.icon} />
                  <span>
                    {c.id === "injected"
                      ? "Browser wallet"
                      : c.id === "coinbaseWalletSDK"
                        ? "Coinbase Wallet"
                        : c.name}
                  </span>
                  <span aria-hidden="true">
                    {isPending && variables?.connector === c ? "…" : "↗"}
                  </span>
                </button>
              ))}
            {mobile && (
              <>
                {named &&
                  listed
                    .filter((c) => c.type === "injected")
                    .map((c) => (
                      <button
                        className="wallet-row"
                        disabled={isPending}
                        key={c.uid}
                        onClick={async () => {
                          setError("");
                          try {
                            await connectAsync({ connector: c });
                          } catch (e) {
                            setError(errorMessage(e));
                          }
                        }}
                      >
                        <WalletMark id={c.id} icon={c.icon} />
                        <span>{c.name}</span>
                      </button>
                    ))}
                {!named &&
                  OPEN_IN.map((w) => (
                    <a
                      className="wallet-row"
                      href={w.href(location.href)}
                      key={w.name}
                    >
                      <WalletMark id={w.icon} />
                      <span>Open in {w.name}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  ))}
                {listed
                  .filter((c) => c.id === "coinbaseWalletSDK")
                  .map((c) => (
                    <button
                      className="wallet-row"
                      disabled={isPending}
                      key={c.uid}
                      onClick={async () => {
                        setError("");
                        try {
                          await connectAsync({ connector: c });
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      <WalletMark id={c.id} />
                      <span>Coinbase Smart Wallet</span>
                    </button>
                  ))}
                {!named &&
                  listed
                    .filter((c) => c.id === "injected")
                    .map((c) => (
                      <button
                        className="wallet-row"
                        disabled={isPending}
                        key={c.uid}
                        onClick={async () => {
                          setError("");
                          try {
                            await connectAsync({ connector: c });
                          } catch (e) {
                            setError(errorMessage(e));
                          }
                        }}
                      >
                        <WalletMark id={c.id} />
                        <span>Browser wallet</span>
                      </button>
                    ))}
              </>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <p className="fine muted">
              No wallet? Coinbase can create a wallet with a passkey. No
              recovery phrase is shared with this site.
            </p>
          </>
        )}
      </dialog>
    </div>
  );
}
