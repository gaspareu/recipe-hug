import { expect, test, type Locator, type Page } from '@playwright/test';
import axe from 'axe-core';

test.use({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, 'La commande doit être visible').not.toBeNull();
  expect(box!.width, 'Largeur de la cible tactile').toBeGreaterThanOrEqual(43.99);
  expect(box!.height, 'Hauteur de la cible tactile').toBeGreaterThanOrEqual(43.99);
}

async function expectNoAuditedViolations(page: Page) {
  await page.addScriptTag({ content: axe.source });
  // Le Planning anime l'entrée des cartes ; contrôler l'état rendu une fois
  // l'animation terminée évite de mesurer leur opacité transitoire.
  await expect.poll(async () => {
    return page.evaluate(async () => {
      const results = await (window as Window & { axe: typeof axe }).axe.run(document, {
        runOnly: { type: 'rule', values: ['button-name', 'color-contrast', 'landmark-one-main', 'page-has-heading-one'] },
      });
      return results.violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target.join(' ')),
      }));
    });
  }, { timeout: 5_000, intervals: [200, 400, 800] }).toEqual([]);
}

test.describe('authentification — sans session', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('expose un titre et une région principale', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Mes Recettes' })).toBeVisible();
    await expectNoAuditedViolations(page);
  });
});

test.describe('PWA mobile — compte de développement', () => {
  test('Chef conserve ses repères et ses commandes tactiles', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Toujours prêt à cuisiner.' })).toBeVisible();
    await expectTouchTarget(page.getByRole('button', { name: 'Menu' }));
    await expectTouchTarget(page.getByRole('button', { name: 'Nouvelle conversation' }));
    await expectNoAuditedViolations(page);
  });

  test('Livre nomme ses filtres et permet de les effacer au clavier', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Mes Recettes' })).toBeVisible();
    await expectTouchTarget(page.getByRole('combobox', { name: 'Trier les recettes' }));
    await expect(page.getByRole('combobox', { name: 'Trier les recettes' })).toHaveAccessibleDescription('Plus récentes');
    await expectTouchTarget(page.getByRole('combobox', { name: 'Filtrer par statut' }));
    await expectTouchTarget(page.getByRole('combobox', { name: 'Filtrer par saison' }));
    await expectTouchTarget(page.getByRole('button', { name: 'Ouvrir le menu du profil' }));

    const search = page.getByRole('textbox', { name: 'Rechercher une recette' });
    await search.fill('recette absente');
    const clear = page.getByRole('button', { name: 'Effacer tous les filtres' });
    await expectTouchTarget(clear);
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(search).toHaveValue('');
    await expectNoAuditedViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  });

  test('Planning expose les semaines, les repas et des cibles utilisables', async ({ page }) => {
    await page.goto('/meal-planning');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Planning repas' })).toBeVisible();
    for (const name of ['Retour', 'Ouvrir la liste de courses', 'Demander à Chef', 'Semaine précédente', 'Semaine suivante']) {
      await expectTouchTarget(page.getByRole('button', { name }));
    }

    const firstAdd = page.getByRole('button', { name: /^Ajouter / }).first();
    await expect(firstAdd).toBeVisible();
    await expectTouchTarget(firstAdd);
    const before = await page.locator('main').innerText();
    await page.getByRole('button', { name: 'Semaine suivante' }).click();
    await expect(page.locator('main')).not.toHaveText(before);
    await page.getByRole('button', { name: 'Semaine précédente' }).click();
    const sunday = page.getByText('Dim', { exact: true });
    await sunday.scrollIntoViewIfNeeded();
    await expect(sunday).toBeInViewport();
    await expectNoAuditedViolations(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(393);
  });

  test('Profil présente ses sections et la commande photo', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Mon Profil' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Informations personnelles' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Apparence' })).toBeVisible();
    await expectTouchTarget(page.getByRole('button', { name: 'Retour' }));
    await expectTouchTarget(page.getByRole('button', { name: 'Changer la photo de profil' }));
    await expectNoAuditedViolations(page);
  });

  test('les contrastes restent lisibles en thème sombre sans changer le compte', async ({ page }) => {
    for (const route of ['/dashboard', '/meal-planning', '/profile']) {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
      });
      await expectNoAuditedViolations(page);
      await expect(page.locator('html')).toHaveClass(/dark/);
    }
  });
});
