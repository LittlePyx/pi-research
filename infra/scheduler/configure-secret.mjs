// Provision through a private stdin pipe; never pass a secret in argv or files.
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const timer = setTimeout(() => process.exit(1), 120_000);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = createInterface({ input: process.stdin });
input.once("line", (key) => {
  input.close();
  if (!/^[a-f0-9]{64}$/.test(key)) process.exit(1);
  const child = spawn(process.execPath, [
    fileURLToPath(new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
    "secret", "put", "MONITOR_SCHEDULER_SECRET", "--config",
    fileURLToPath(new URL("wrangler.jsonc", import.meta.url)),
  ], { stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.on("data", (data) => process.stdout.write(data.toString().split(key).join("[redacted]")));
  child.stderr.on("data", (data) => process.stderr.write(data.toString().split(key).join("[redacted]")));
  child.on("error", () => process.exit(1));
  child.on("exit", (code) => { clearTimeout(timer); process.exit(code ?? 1); });
  child.stdin.end(key);
});
