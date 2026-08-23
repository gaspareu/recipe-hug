import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Charge .env (VITE_SUPABASE_*) et .env.test (TEST_EMAIL/TEST_PASSWORD), tous deux
// gitignored, dans process.env. dotenv n'est pas une dépendance : parsing manuel.
function loadEnvFile(name: string) {
  try {
    const raw = readFileSync(new URL(name, import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // Fichier absent : les tests concernés échoueront avec un message explicite.
  }
}
loadEnvFile('.env');
loadEnvFile('.env.test');

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

/**
 * Config E2E Playwright — exécution locale et post-merge sur main en CI. Nécessite
 * un compte de test et écrit des données réelles sur ce compte avant nettoyage.
 * Voir e2e/README.md.
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
