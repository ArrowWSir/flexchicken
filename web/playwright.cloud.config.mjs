import { defineConfig, devices } from "@playwright/test";

// The database build, run locally by `npm run preview` (Worker + Durable
// Object on :8787). Start the preview first; this config does not.
// Codes come from .dev.vars.
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["cloud.spec.mjs", "security.spec.mjs"],
  timeout: 60_000,
  use: { baseURL: process.env.CLOUD_URL || "http://localhost:8787" },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
});
