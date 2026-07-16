import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Charge .env.test (gitignored) — TEST_EMAIL / TEST_PASSWORD du compte de test.
// dotenv n'est pas une dépendance du projet : parsing manuel minimal.
try {
  const raw = readFileSync(new URL('.env.test', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  // .env.test absent : les tests d'auth échoueront avec un message explicite (voir auth.setup.ts).
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

/**
 * Config E2E Playwright — exécution LOCALE (pas encore câblée en CI : nécessite
 * .env.test avec un compte de test + le serveur de dev, et écrit des données
 * réelles sur ce compte). Voir e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
