// Builds the site for Cloudflare with the shop's database switched on
// (NEXT_PUBLIC_STORE=cloud), then previews or deploys it.
//   node scripts/cloud.mjs preview   -> local Worker + Durable Object on :8787
//   node scripts/cloud.mjs deploy    -> live on Cloudflare
import { spawnSync } from "node:child_process";

const step = process.argv[2];
if (!["preview", "deploy", "build"].includes(step)) {
  console.error("Usage: node scripts/cloud.mjs preview|deploy|build");
  process.exit(1);
}
const env = { ...process.env, NEXT_PUBLIC_STORE: "cloud" };
const run = (args) => {
  const result = spawnSync("npx", ["opennextjs-cloudflare", ...args], { stdio: "inherit", env, shell: process.platform === "win32" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(["build"]);
if (step !== "build") run([step]);
