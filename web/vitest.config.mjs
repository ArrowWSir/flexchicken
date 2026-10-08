import { defineConfig } from "vitest/config";

// Unit tests live next to the code in app/ and server/; Playwright owns e2e/.
export default defineConfig({
  test: { include: ["app/**/*.test.js", "server/**/*.test.js"] },
});
