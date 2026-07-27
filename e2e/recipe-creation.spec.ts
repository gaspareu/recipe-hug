import { test, expect } from '@playwright/test';
import { createTestUserClient, deleteRecipesByTitle } from './helpers/supabase';

// Teste le FLUX de création de recette (carte recette → clic « Créer la recette »),
// PAS le chat/LLM lui-même : l'échange avec `home-assistant` est simulé une fois
// par une réponse SSE figée contenant un tool call `propose_recipe`. L'assistant
// présente alors une carte recette (état « proposed ») ; on clique « Créer la
// recette », ce qui déclenche l'écriture réelle en base (createProposedRecipe) et
// fait passer la carte en état « saved ». On vérifie la persistance, puis on nettoie.

/** Construit une réponse SSE OpenAI-compatible déclenchant un tool call propose_recipe. */
function cannedProposeRecipeStream(recipe: Record<string, unknown>): string {
  const chunk = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
  return (
    chunk({ choices: [{ delta: { content: 'Voici une recette pour toi !' } }] }) +
    chunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'propose_recipe', arguments: JSON.stringify(recipe) } }] } }] }) +
    chunk({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) +
    'data: [DONE]\n\n'
  );
}

let createdTitle: string | null = null;

test.afterEach(async () => {
  if (createdTitle) {
    const client = await createTestUserClient();
    await deleteRecipesByTitle(client, createdTitle);
    createdTitle = null;
  }
});

test('flux de création : clic « Créer la recette » → recette persistée', async ({ page }) => {
  const title = `E2E Recette ${Date.now()}`;
  createdTitle = title;
  const recipe = {
    title,
    servings: 2,
    ingredients: [{ name: 'Farine', quantity: 200, unit: 'g' }],
    steps: [{ order: 1, text: 'Mélanger les ingrédients' }],
  };

  // Échange LLM simulé (une fois) + endpoints de fond neutralisés (zéro coût).
  await page.route('**/functions/v1/home-assistant', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: cannedProposeRecipeStream(recipe) }),
  );
  await page.route('**/functions/v1/generate-recipe-image', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/functions/v1/analyze-recipe', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  await page.goto('/home');

  // Envoi d'un message (le contenu importe peu : la réponse est figée).
  const input = page.getByRole('textbox', { name: 'Poser une question' });
  await input.fill('Crée-moi une recette');
  await input.press('Enter');

  // La recette proposée apparaît sous forme de carte (état « proposed ») : le
  // bouton de création est visible.
  const createButton = page.getByRole('button', { name: 'Créer la recette' });
  await expect(createButton).toBeVisible({ timeout: 15_000 });

  // Le flux testé : clic « Créer la recette ».
  await createButton.click();

  // Confirmation UI : la carte bascule en état « saved » — le bouton
  // « Commencer à cuisiner » remplace « Créer la recette ».
  await expect(page.getByRole('button', { name: 'Commencer à cuisiner' }))
    .toBeVisible({ timeout: 15_000 });
  await expect(createButton).toBeHidden();

  // Persistance réelle : la recette existe bien en base (compte test, RLS).
  const client = await createTestUserClient();
  const { data } = await client.from('recipes').select('title, status, source_type').eq('title', title);
  expect(data?.length).toBe(1);
  expect(data?.[0]).toMatchObject({ status: 'draft', source_type: 'ai' });
});
