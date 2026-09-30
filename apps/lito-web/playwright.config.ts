import { defineConfig, devices } from "@playwright/test";

const port = 5189;
const liveUrl = process.env.LITORA_E2E_LIVE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: liveUrl ?? `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    ...(process.env.LITORA_E2E_USE_SYSTEM_CHROME === "1"
      ? { channel: "chrome" as const }
      : {}),
    trace: "retain-on-failure",
  },
  webServer: liveUrl ? undefined : {
    command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/login`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
