import { defineConfig, devices } from "@playwright/test";

// Phone first: the main project is an iPhone-sized Chromium.
export default defineConfig({
  testDir: "./e2e",
  // These need the database build and its headers: playwright.cloud.config.mjs.
  testIgnore: ["cloud.spec.mjs", "security.spec.mjs"],
  timeout: 30_000,
  use: { baseURL: "http://localhost:3200" },
  projects: [{ name: "phone", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3200",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
