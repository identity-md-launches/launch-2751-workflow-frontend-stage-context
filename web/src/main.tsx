import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { loadConfiguration } from "./config";
import "./style.css";
import { TransactionsProvider } from "./Transactions";
const root = createRoot(document.getElementById("root")!);
root.render(
  <main className="boot-screen">
    <img src="./favicon.svg" alt="" width="48" height="48" />
    <h1>Hamster Mining Reserve</h1>
    <p>Loading the attested deployment…</p>
  </main>,
);
loadConfiguration()
  .then((rt) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 10000, retry: 1 } },
    });
    root.render(
      <StrictMode>
        <WagmiProvider config={rt.walletConfig}>
          <QueryClientProvider client={queryClient}>
            <TransactionsProvider>
              <App rt={rt} />
            </TransactionsProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </StrictMode>,
    );
  })
  .catch((error) => {
    root.render(
      <main className="boot-screen">
        <img src="./favicon.svg" alt="" width="48" height="48" />
        <h1>Hamster Mining Reserve</h1>
        <p role="alert">
          {error instanceof Error ? error.message : "Deployment unavailable."}
        </p>
        <button onClick={() => location.reload()}>Reload deployment</button>
      </main>,
    );
  });
