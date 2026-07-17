import { test, expect } from '@playwright/test';

// Smoke E2E déterministe : authentification, protection des routes, et rendu des
// pages protégées clés (sans IA ni écriture de données). Les flux non
// déterministes (création de recette via chat = LLM) ou à écriture (liste de
// courses) sont volontairement exclus — voir e2e/README.md.

test.describe('routes protégées — non authentifié', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirige vers /auth quand non connecté', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/auth', { timeout: 15_000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });
});

test.describe('pages protégées — authentifié', () => {
  test('accueil /home monte sans rediriger vers /auth', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/\/home/);
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('dashboard affiche « Mes Recettes »', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Mes Recettes' })).toBeVisible();
  });

  test('profil affiche « Mon Profil »', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Mon Profil' })).toBeVisible();
  });

  test('planning repas affiche « Planning repas »', async ({ page }) => {
    await page.goto('/meal-planning');
    await expect(page.getByRole('heading', { name: 'Planning repas' })).toBeVisible();
  });
});
