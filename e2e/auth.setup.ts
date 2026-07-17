import { test as setup, expect } from '@playwright/test';

const AUTH_FILE = 'e2e/.auth/user.json';

// Authentifie une fois le compte de test et sauvegarde la session (storageState),
// réutilisée par les specs (projet `chromium` dépend de `setup`).
setup('authentification du compte de test', async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  expect(
    email && password,
    'TEST_EMAIL / TEST_PASSWORD manquants (voir .env.test, gitignored)',
  ).toBeTruthy();

  await page.goto('/auth');
  await page.waitForSelector('input[type="email"]', { timeout: 20_000 });
  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');

  // Redirigé vers /home après connexion réussie.
  await page.waitForURL('**/home', { timeout: 20_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
