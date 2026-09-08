// One explicit integration check; same handler as the deployed timer.
import { createInterface } from "node:readline";
import { wakeResearch } from "./worker.mjs";
const timer = setTimeout(() => process.exit(1), 300_000);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = createInterface({ input: process.stdin });
input.once("line", async (key) => {
  input.close();
  if (!/^[a-f0-9]{64}$/.test(key)) process.exit(1);
  try {
    console.log(JSON.stringify(await wakeResearch({ MONITOR_SCHEDULER_SECRET: key })));
    clearTimeout(timer);
    process.exit(0);
  } catch {
    console.error("controlled_wake_failed");
    process.exit(1);
  }
});
