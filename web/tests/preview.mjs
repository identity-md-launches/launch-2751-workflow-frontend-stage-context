import { serve } from "./harness.mjs";
// A bounded foreground preview for manual browser inspection. It closes automatically.
const app = await serve();
console.log(app.url);
const timer = setTimeout(async () => {
  await app.close();
}, 300000);
process.on("SIGINT", async () => {
  clearTimeout(timer);
  await app.close();
  process.exit(0);
});
