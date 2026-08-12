import { defineConfig } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/mockServer.mjs",
      port: 5051,
      reuseExistingServer: false,
      env: { ...process.env, E2E_BACKEND_PORT: "5051" },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174",
      port: 4174,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_E2E_TEST_AUTH: "true",
        VITE_BACKEND_URL: "http://127.0.0.1:5051",
        VITE_SUPABASE_URL: "http://127.0.0.1:5051/e2e-supabase",
        VITE_SUPABASE_ANON_KEY: "e2e-public-key",
      },
    },
  ],
});
