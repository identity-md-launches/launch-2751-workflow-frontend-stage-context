import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(resolve(web, "design/share.svg"), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.screenshot({ path: resolve(web, "public/share.png") });
} finally {
  await browser.close();
}
console.log(
  "Rendered local 1200×630 social image. Rebuild to inventory its bytes.",
);
