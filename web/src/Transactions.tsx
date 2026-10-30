import { createContext, useContext, useState, type ReactNode } from "react";
import type { Runtime } from "./config";
import { short } from "./format";
type Entry = {
  id: string;
  label: string;
  status: "Waiting for wallet" | "Pending" | "Confirmed" | "Failed";
  hash?: `0x${string}`;
  message?: string;
};
const Context = createContext<{
  entries: Entry[];
  record: (entry: Entry) => void;
}>({ entries: [], record: () => {} });
export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  return (
    <Context.Provider
      value={{
        entries,
        record: (entry) =>
          setEntries((prev) =>
            [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, 10),
          ),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useTransactions = () => useContext(Context);
export function WalletActivity({ rt }: { rt: Runtime }) {
  const { entries } = useTransactions();
  return (
    <section className="activity-section" aria-live="polite">
      <div className="section-title">
        <h2>Wallet activity</h2>
        <span className="fine muted">This page session only</span>
      </div>
      {!entries.length ? (
        <p className="fine muted">
          Transactions you request here will appear with their status and
          explorer link.
        </p>
      ) : (
        <ul className="activity-list">
          {entries.map((e) => (
            <li key={e.id}>
              <div>
                <strong>{e.label}</strong>
                <span
                  className={
                    e.status === "Failed"
                      ? "error"
                      : e.status === "Confirmed"
                        ? "success"
                        : "muted"
                  }
                >
                  {e.status}
                </span>
              </div>
              {e.message && <p className="fine muted">{e.message}</p>}
              {e.hash && (
                <a
                  href={`${rt.deployment.network.explorer}/tx/${e.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction {short(e.hash)} ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
