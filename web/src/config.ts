import { createConfig, http, fallback } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import {
  createPublicClient,
  custom,
  defineChain,
  erc20Abi,
  getAddress,
  keccak256,
  toBytes,
  type Abi,
  type Address,
  type EIP1193Provider,
} from "viem";
export type Deployment = {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
  };
  walletAddChain?: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
};
const canonical = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical((x as Record<string, unknown>)[k])]),
        )
      : x;
const safePath = (p: string) =>
  p &&
  !p.startsWith("/") &&
  !p.includes("..") &&
  !p.includes(":") &&
  !p.includes("\\");
async function json(path: string) {
  if (!safePath(path)) throw new Error("Unsafe deployment asset path.");
  const r = await fetch(new URL(path, new URL("./", document.baseURI)));
  if (!r.ok) throw new Error(`Could not load ${path}. Reload to try again.`);
  return r.json();
}
export async function loadConfiguration() {
  const deployment = (await json("imd-deployment.json")) as Deployment;
  if (
    deployment.version !== 1 ||
    !deployment.network ||
    deployment.chainId !== deployment.network.chainId ||
    !deployment.network.rpcUrls.length ||
    deployment.contracts.length !== 1
  )
    throw new Error("Deployment configuration is invalid.");
  const vault = deployment.contracts.find(
    (c) => c.name === "HamsterMiningReserve",
  );
  if (!vault) throw new Error("Reserve deployment is missing.");
  getAddress(vault.address);
  const abi = (await json(vault.abiPath)) as Abi;
  if (
    keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2) !==
    vault.abiHash
  )
    throw new Error(
      "The reserve ABI does not match its attested deployment. Actions are unavailable.",
    );
  const [mining, core, nft] = await Promise.all(
    ["IGraphAMining", "IGraphACore", "IGraphANFT"].map(
      (name) => json(`abi/${name}.json`) as Promise<Abi>,
    ),
  );
  const n = deployment.network;
  const chain = defineChain({
    id: deployment.chainId,
    name: n.name,
    nativeCurrency: n.nativeCurrency,
    rpcUrls: { default: { http: n.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: n.explorer } },
    testnet: n.testnet,
  });
  const transport = () =>
    fallback(
      n.rpcUrls.map((url) =>
        http(url, { batch: true, timeout: 12000, retryCount: 1 }),
      ),
      { rank: false, retryCount: 0 },
    );
  const publicClient = createPublicClient({ chain, transport: transport() });
  const walletConfig = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({ appName: "Hamster Mining Reserve" }),
    ],
    transports: { [chain.id]: transport() },
  });
  return {
    deployment,
    vault,
    abis: { vault: abi, mining, core, nft, erc20: erc20Abi as Abi },
    chain,
    publicClient,
    walletConfig,
    walletFallback: (provider: EIP1193Provider) =>
      createPublicClient({
        chain,
        transport: fallback(
          [transport(), custom(provider, { retryCount: 0 })],
          { retryCount: 0, rank: false },
        ),
      }),
  };
}
export type Runtime = Awaited<ReturnType<typeof loadConfiguration>>;
export async function switchNetwork(
  provider: EIP1193Provider,
  deployment: Deployment,
) {
  const id = `0x${deployment.chainId.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: id }],
    });
  } catch (error) {
    const e = error as {
      code?: number;
      message?: string;
      cause?: { code?: number };
    };
    if (
      e.code !== 4902 &&
      e.cause?.code !== 4902 &&
      !/unknown chain|unrecognized chain|not added|chain.*not.*configured/i.test(
        e.message ?? "",
      )
    )
      throw error;
    if (!deployment.walletAddChain)
      throw new Error(
        "This chain is missing from your wallet. Add it using the network details below.",
      );
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [deployment.walletAddChain],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: id }],
    });
  }
}
