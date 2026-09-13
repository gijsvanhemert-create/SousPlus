import { defineConfig, devices } from "@playwright/test";

// E2e over de demoflows. Draait tegen de productie-build (next start) en de
// echte database. Een global-setup reseedt vooraf zodat elke run op een bekende
// staat begint; de suite draait serieel (workers: 1) omdat tests dezelfde DB en
// sessie delen. Zet E2E_SKIP_SEED=1 om de reseed over te slaan.

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Auth.js vertrouwt de host niet in productie (next start) zonder dit;
    // alleen voor de e2e-server, niet voor de app-defaults.
    env: { AUTH_TRUST_HOST: "true" },
  },
});
