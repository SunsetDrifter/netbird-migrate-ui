import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a dev server with all NetBird API traffic mocked at
 * the Next.js API-route boundary (Playwright `page.route()` intercepts
 * /api/connect, /api/resources, /api/migrate). Tests never touch real
 * NetBird accounts.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3211",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "PORT=3211 npm run dev",
    url: "http://localhost:3211",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
