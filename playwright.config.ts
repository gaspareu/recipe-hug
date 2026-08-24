import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEV_SUPABASE_PROJECT_ID = 'dltaxjvwtxjpbzcwdqvu';

// Aligne le client Node des tests sur le serveur Vite : .env.development.local
// prévaut sur .env, tandis que les variables injectées par la CI restent prioritaires.
Object.assign(process.env, loadEnv('development', ROOT_DIR, 'VITE_'));
Object.assign(process.env, loadEnv('test', ROOT_DIR, ['TEST_', 'E2E_']));

const supabaseProjectId = process.env.VITE_SUPABASE_PROJECT_ID;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
if (
  supabaseProjectId !== DEV_SUPABASE_PROJECT_ID ||
  supabaseUrl !== `https://${DEV_SUPABASE_PROJECT_ID}.supabase.co`
) {
  throw new Error(
    `E2E refusés hors du projet Supabase dev ${DEV_SUPABASE_PROJECT_ID}. ` +
      'Vérifie les variables VITE_SUPABASE_* dans .env.development.local.',
  );
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const baseUrl = new URL(BASE_URL);
const LOCAL_E2E_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
if (!LOCAL_E2E_HOSTS.has(baseUrl.hostname)) {
  throw new Error(
    `E2E refusés hors de localhost (reçu ${baseUrl.origin}). ` +
      'E2E_BASE_URL doit pointer vers le serveur local de développement.',
  );
}

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
