import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestUserClient } from './helpers/supabase';

// Teste le FLUX liste de courses (sans LLM) : une recette avec un ingrédient
// connu est ajoutée au planning via l'UI (écriture réelle), puis on vérifie que
// l'ingrédient apparaît dans la liste de courses agrégée. Nettoyage ensuite.

let client: SupabaseClient;
let recipeId: string | null = null;
const stamp = Date.now();
const recipeTitle = `E2E Courses ${stamp}`;
const ingredientName = `Courgette-${stamp}`;

test.beforeAll(async () => {
  client = await createTestUserClient();
  const { data: { user } } = await client.auth.getUser();
  const { data, error } = await client
    .from('recipes')
    .insert({
      user_id: user!.id,
      title: recipeTitle,
      servings: 2,
      ingredients: [{ name: ingredientName, quantity: 2, unit: 'pièce' }],
      steps: [{ order: 1, text: 'Cuire' }],
      status: 'draft',
      source_type: 'ai',
    })
    .select('id')
    .single();
  if (error) throw error;
  recipeId = data.id;
});

test.afterAll(async () => {
  if (recipeId) {
    const { error: planError } = await client.from('meal_plans').delete().eq('recipe_id', recipeId);
    if (planError) throw planError;
    const { error: recipeError } = await client.from('recipes').delete().eq('id', recipeId);
    if (recipeError) throw recipeError;
  }
});

test('flux liste de courses : repas planifié → ingrédient agrégé', async ({ page }) => {
  await page.goto('/meal-planning');

  // Ouvre le premier créneau « Ajouter … » de la semaine.
  await page.getByLabel(/^Ajouter .+ le /).first().click();

  // Choisit la recette de test dans le dialog.
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('Rechercher…').fill(recipeTitle);
  await dialog.getByRole('button', { name: recipeTitle }).click();
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();

  // Attend que le repas soit réellement posé (dialog fermé + repas affiché) pour
  // éviter d'ouvrir la feuille pendant l'invalidation de la requête.
  await expect(dialog).toBeHidden();
  await expect(page.getByText(recipeTitle)).toBeVisible({ timeout: 15_000 });

  // Ouvre la liste de courses (bouton activé une fois qu'il y a un repas).
  const coursesBtn = page.getByRole('button', { name: 'Courses', exact: true });
  await expect(coursesBtn).toBeEnabled({ timeout: 15_000 });
  await coursesBtn.click();

  // La feuille est ouverte, et l'ingrédient de la recette planifiée y figure.
  await expect(page.getByRole('heading', { name: 'Liste de courses' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(new RegExp(ingredientName, 'i'))).toBeVisible({ timeout: 10_000 });
});
