import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const shouldStartServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER !== "true";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    headless: true,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: shouldStartServer
    ? {
        command: `PORT=${PORT} AUTH0_MOCK_ENABLED=true npm run dev -- --hostname 0.0.0.0 --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      }
    : undefined,
});

