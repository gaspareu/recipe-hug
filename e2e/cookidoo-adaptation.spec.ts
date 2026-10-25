import { test, expect } from '@playwright/test';
import { createTestUserClient, deleteRecipesByTitle } from './helpers/supabase';

// Auth et source réels sur Supabase dev. Adaptation/envoi simulés : aucun appel
// IA ni écriture Cookidoo ; SQL/RLS et adaptateur sont testés séparément.
for (const width of [1280, 390]) {
  test(`Cookidoo : aperçu, envoi, reprise sans réadaptation (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const client = await createTestUserClient();
    const { data: { user } } = await client.auth.getUser();
    const title = `E2E Cookidoo ${Date.now()}`;
    const source = { title, user_id: user!.id, servings: 4, ingredients: [{ name: 'farine', quantity: 300, unit: 'g' }], steps: [{ order: 1, text: 'Mélanger la farine dans un saladier.' }] };
    const { data: recipe, error } = await client.from('recipes').insert(source).select('id').single();
    expect(error).toBeNull();
    let preparations = 0, sends = 0;
    let ready = false, sent = false;
    const state = () => ({ ok: true, has_destination: sent, adaptation: ready ? { id: 'a1', status: 'ready', recipe: { title, ingredients: source.ingredients, steps: [{ order: 1, text: 'Mettre 300 g de farine dans le bol. Pétrir 2 min.' }] }, ingredients: ['300 g de farine'], changes: ['Pétrissage dans le bol au lieu du saladier.'], notes: [], blockers: [], guided_steps: 1, reused: true, confirmation: { token: 'test', expires_at: Date.now() + 900000 } } : null, job: sent ? { id: `j-${recipe!.id}`, adaptation_id: 'a1', status: 'success', phase: 'done', warnings: [], updated: false, cookidoo_url: 'https://cookidoo.fr/created-recipes/fr-FR/test' } : null });
    await page.route('**/functions/v1/manage-cookidoo-credentials', route => route.fulfill({ json: { configured: true } }));
    await page.route('**/functions/v1/export-recipe-cookidoo', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { capabilities: ['cookidoo_adaptation_v2'] } });
      const body = route.request().postDataJSON();
      if (body.action === 'prepare') { preparations++; ready = true; }
      if (body.action === 'send') { sends++; sent = true; return route.fulfill({ json: { ok: true, export_id: `j-${recipe!.id}` } }); }
      return route.fulfill({ json: state() });
    });
    try {
      await page.goto(`/recipes/${recipe!.id}`);
      await page.getByRole('button', { name: "Plus d'actions" }).click();
      await page.getByRole('menuitem', { name: 'Envoyer vers Cookidoo' }).click();
      await page.getByRole('button', { name: 'Préparer la version Cookidoo' }).click();
      await expect(page.getByText('Pétrissage dans le bol au lieu du saladier.')).toBeVisible();
      expect(sends).toBe(0);
      await page.getByRole('button', { name: 'Envoyer cette version' }).click();
      await expect(page.getByRole('link', { name: 'Ouvrir dans Cookidoo' })).toBeVisible();
      await page.keyboard.press('Escape');
      await page.reload();
      await expect(page.getByText('Disponible sur Cookidoo', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Voir la version Cookidoo' }).click();
      await expect(page.getByText(/Aucune nouvelle adaptation/)).toBeVisible();
      await page.getByRole('button', { name: 'Mettre à jour sur Cookidoo' }).click();
      await expect.poll(() => sends).toBe(2);
      expect(preparations).toBe(1);
      const { data: unchanged } = await client.from('recipes').select('steps,ingredients').eq('id', recipe!.id).single();
      expect(unchanged?.steps).toEqual(source.steps);expect(unchanged?.ingredients).toEqual(source.ingredients);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`cookidoo-adaptation-${width}.png`), fullPage: true });
    } finally { await deleteRecipesByTitle(client, title); }
  });
}

test('Cookidoo : une information culinaire manquante demande une précision sans proposer d’envoi', async ({ page }) => {
  const client = await createTestUserClient();
  const { data: { user } } = await client.auth.getUser();
  const title = `E2E Cookidoo correction ${Date.now()}`;
  const { data: recipe, error } = await client.from('recipes').insert({ title, user_id: user!.id, servings: 4, ingredients: [{ name: 'farine', quantity: 300, unit: 'g' }], steps: [{ order: 1, text: 'Mélanger la farine dans un saladier.' }] }).select('id').single();
  expect(error).toBeNull();
  let prepared = false, clarified = false, sends = 0;
  const blocker = 'Souhaitez-vous conserver le mélange au saladier ?';
  const state = () => ({ ok: true, has_destination: false, job: null, adaptation: prepared ? { id: 'correction-a1', status: clarified ? 'ready' : 'needs_input', recipe: clarified ? { title, ingredients: [{ name: 'farine', quantity: 300, unit: 'g' }], steps: [{ order: 1, text: 'Mélanger la farine dans un saladier.' }] } : null, ingredients: [], guided_steps: 0, changes: [], notes: [], blockers: clarified ? [] : [blocker], confirmation: clarified ? { token: 'test', expires_at: Date.now() + 900000 } : null, error_code: null, reused: false } : null });
  await page.route('**/functions/v1/manage-cookidoo-credentials', route => route.fulfill({ json: { configured: true } }));
  await page.route('**/functions/v1/export-recipe-cookidoo', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { capabilities: ['cookidoo_adaptation_v2'] } });
    const body = route.request().postDataJSON();
    if (body.action === 'prepare') { prepared = true; clarified = body.clarifications === 'Conserver le mélange au saladier.'; }
    if (body.action === 'send') sends++;
    return route.fulfill({ json: state() });
  });
  try {
    await page.goto(`/recipes/${recipe!.id}`);
    await page.getByRole('button', { name: "Plus d'actions" }).click();
    await page.getByRole('menuitem', { name: 'Envoyer vers Cookidoo' }).click();
    await page.getByRole('button', { name: 'Préparer la version Cookidoo' }).click();
    await expect(page.getByText(blocker)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer cette version' })).toHaveCount(0);
    expect(sends).toBe(0);
    await page.getByLabel('Précisions pour cette version Cookidoo').fill('Conserver le mélange au saladier.');
    await page.getByRole('button', { name: 'Compléter la version' }).click();
    await expect(page.getByRole('button', { name: 'Envoyer cette version' })).toBeVisible();
    expect(sends).toBe(0);
  } finally { await deleteRecipesByTitle(client, title); }
});

for (const width of [1280, 390]) {
  test(`Cookidoo : échec technique expliqué et relance sans précision (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const client = await createTestUserClient();
    const { data: { user } } = await client.auth.getUser();
    const title = `E2E Cookidoo autonomie ${Date.now()}`;
    const { data: recipe, error } = await client.from('recipes').insert({ title, user_id: user!.id, ingredients: [{ name: 'riz', quantity: 160, unit: 'g' }], steps: [{ order: 1, text: 'Mélanger le riz.' }] }).select('id').single();
    expect(error).toBeNull();
    let preparations = 0, sends = 0;
    const blocker = 'La somme des ajouts ne correspond pas à la quantité source. Ingrédient : riz.';
    await page.route('**/functions/v1/manage-cookidoo-credentials', route => route.fulfill({ json: { configured: true } }));
    await page.route('**/functions/v1/export-recipe-cookidoo', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { capabilities: ['cookidoo_adaptation_v2'] } });
      const body = route.request().postDataJSON();
      if (body.action === 'prepare') { expect(body.technical_water_ml).toBeUndefined(); expect(body.clarifications).toBeUndefined(); preparations++; }
      if (body.action === 'send') sends++;
      return route.fulfill({ json: { ok: true, job: null, has_destination: false, adaptation: { id: 'auto-1', status: 'failed', recipe: null, ingredients: [], changes: [], notes: [], blockers: [blocker], error_code: 'adaptation_failed', confirmation: null, guided_steps: 0, reused: false } } });
    });
    try {
      await page.goto(`/recipes/${recipe!.id}`);
      await page.getByRole('button', { name: "Plus d'actions" }).click();
      await page.getByRole('menuitem', { name: 'Envoyer vers Cookidoo' }).click();
      await expect(page.getByRole('alert')).toContainText(blocker);
      await expect(page.getByLabel('Précisions pour cette version Cookidoo')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Envoyer cette version' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Réessayer l’adaptation' }).click();
      await expect.poll(() => preparations).toBe(1);
      expect(sends).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`cookidoo-autonomie-${width}.png`), fullPage: true });
    } finally { await deleteRecipesByTitle(client, title); }
  });
}
