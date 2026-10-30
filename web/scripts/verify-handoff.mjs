import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import assert from "node:assert/strict";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const d = JSON.parse(
  await readFile(resolve(root, ".imd/reads/deployment.json"), "utf8"),
);
const n = JSON.parse(
  await readFile(resolve(root, ".imd/reads/network.json"), "utf8"),
);
const m = JSON.parse(
  await readFile(resolve(root, "dist/imd-deployment.json"), "utf8"),
);
for (const key of [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
])
  assert.deepEqual(m[key], d[key]);
assert.deepEqual(
  m.contracts,
  d.contracts.map((c) => ({
    ...Object.fromEntries(["name", "address", "abiHash"].map((k) => [k, c[k]])),
    abiPath: `abi/${c.name}.json`,
  })),
);
assert.deepEqual(m.network, n.network);
assert.deepEqual(m.walletAddChain, n.walletAddChain);
assert.deepEqual(m.poolKey, d.poolKey);
const allowed = [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
  "contracts",
  "assets",
  "network",
  "walletAddChain",
  ...(d.poolKey ? ["poolKey"] : []),
];
assert.deepEqual(Object.keys(m).sort(), allowed.sort());
for (const name of [
  "HamsterMiningReserve",
  "IGraphAMining",
  "IGraphACore",
  "IGraphANFT",
]) {
  const pinned = execFileSync(
    "git",
    ["show", `${d.sourceCommit}:docs/abi/${name}.json`],
    { cwd: root },
  );
  assert.deepEqual(
    await readFile(resolve(root, `web/abi/${name}.json`)),
    pinned,
  );
  assert.deepEqual(
    await readFile(resolve(root, `dist/abi/${name}.json`)),
    pinned,
  );
}
console.log(
  "Handoff identifiers, exact contract set, network, walletAddChain, poolKey presence, permitted keys and all pinned ABI bytes match.",
);
