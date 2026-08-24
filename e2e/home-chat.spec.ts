import { test, expect, devices } from '@playwright/test';

function cannedProposeRecipeStream(): string {
  const chunk = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  return (
    chunk({ choices: [{ delta: { content: 'Je prépare votre recette.' } }] }) +
    chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: {
      name: 'propose_recipe',
      arguments: JSON.stringify({
        title: 'Tarte E2E',
        servings: 4,
        ingredients: [{ name: 'Pommes', quantity: 4, unit: '' }],
        steps: [{ order: 1, text: 'Préchauffer le four.' }],
      }),
    } }] } }] }) +
    chunk({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) +
    'data: [DONE]\n\n'
  );
}

// On réutilise la géométrie et les interactions de l'iPhone, tout en conservant
// Chromium : le descripteur complet demanderait WebKit par défaut.
const iPhone13 = devices['iPhone 13'];
test.use({
  viewport: iPhone13.viewport,
  screen: iPhone13.screen,
  userAgent: iPhone13.userAgent,
  deviceScaleFactor: iPhone13.deviceScaleFactor,
  isMobile: iPhone13.isMobile,
  hasTouch: iPhone13.hasTouch,
});

test.describe('chat Home — mobile', () => {
  test('masque les suggestions pendant la saisie puis les réaffiche lorsque le composeur est vide', async ({ page }) => {
    await page.goto('/home');

    const input = page.getByRole('textbox', { name: 'Poser une question' });
    const suggestions = page.getByTestId('suggestions-scroll');
    await expect(suggestions).toBeVisible();

    await input.fill('Je cherche une tarte aux pommes');
    await expect(suggestions).toBeHidden();

    await input.fill('');
    await expect(suggestions).toBeVisible();
  });

  test('affiche un retour contextualisé pendant la préparation d’une recette', async ({ page }) => {
    await page.route('**/functions/v1/home-assistant', (route) =>
      route.fulfill({ status: 200, contentType: 'text/event-stream', body: cannedProposeRecipeStream() }),
    );
    await page.goto('/home');

    const input = page.getByRole('textbox', { name: 'Poser une question' });
    await input.fill('Crée-moi une tarte');
    await input.press('Enter');

    await expect(page.getByRole('status', { name: 'Préparation de votre recette' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Créer la recette' })).toBeVisible();
  });
});
