import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  copyFile,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes } from "viem";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(web, "../dist");
const input = JSON.parse(
  await readFile(resolve(web, "deployment.json"), "utf8"),
);
const check = process.argv.includes("--check");
const canonical = (x) =>
  Array.isArray(x)
    ? x.map(canonical)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, canonical(x[k])]),
        )
      : x;
const hashABI = (abi) =>
  keccak256(toBytes(JSON.stringify(canonical(abi)))).slice(2);
const assert = (condition, msg) => {
  if (!condition) throw new Error(msg);
};
for (const c of input.contracts) {
  assert(/^[a-f0-9]{64}$/.test(c.abiHash), "Invalid ABI hash");
  const abi = JSON.parse(await readFile(resolve(web, c.abiPath), "utf8"));
  assert(
    Array.isArray(abi) && hashABI(abi) === c.abiHash,
    `ABI binding failed: ${c.name} (${hashABI(abi)})`,
  );
}
if (!check) {
  await mkdir(resolve(dist, "abi"), { recursive: true });
  for (const f of await readdir(resolve(web, "abi")))
    await copyFile(resolve(web, "abi", f), resolve(dist, "abi", f));
}
const enumerate = async (dir, prefix = "") => {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = prefix + e.name;
    if (e.isDirectory())
      out.push(...(await enumerate(resolve(dir, e.name), path + "/")));
    else if (path !== "imd-deployment.json") {
      const bytes = await readFile(resolve(dir, e.name));
      assert(bytes.length <= 8388608, `Asset too large: ${path}`);
      out.push({
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
};
const assets = await enumerate(dist);
assert(
  assets.length <= 128 && assets.some((a) => a.path === "index.html"),
  "Invalid inventory",
);
const expected = { ...input, assets };
if (check) {
  const manifest = JSON.parse(
    await readFile(resolve(dist, "imd-deployment.json"), "utf8"),
  );
  assert(
    JSON.stringify(canonical(manifest)) === JSON.stringify(canonical(expected)),
    "Export manifest does not match deployment or file hashes",
  );
  for (const c of manifest.contracts)
    assert(
      hashABI(JSON.parse(await readFile(resolve(dist, c.abiPath), "utf8"))) ===
        c.abiHash,
      "Exported ABI mismatch",
    );
} else
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(expected, null, 2) + "\n",
  );
let total = 0;
for (const a of assets) total += (await stat(resolve(dist, a.path))).size;
assert(total < 24 * 1024 * 1024, "Export exceeds safe HTTP budget");
console.log(
  `${check ? "Verified" : "Exported"} ${assets.length} assets, ${total} bytes; ABI and deployment binding verified.`,
);
