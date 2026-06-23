# Complétion auto description et tags à la création — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compléter automatiquement et silencieusement la description (`ai_summary`), les tags (`nutrition_tags`), la saison et le score calorique d'une recette nouvellement créée, pour les deux chemins de création (formulaire `RecipeNew` et chat IA), sans écraser la saisie utilisateur.

**Architecture:** Une fonction partagée `triggerRecipeCompletion` (fire-and-forget) appelle l'edge function existante `analyze-recipe`, écrit en DB uniquement les champs manquants, puis déclenche un rafraîchissement du cache. Elle est appelée aux deux points d'insertion existants, en miroir des triggers de génération d'image déjà en place. Non-bloquant : l'enregistrement et la navigation restent immédiats.

**Tech Stack:** React + TypeScript, TanStack Query v5, Supabase JS (`functions.invoke`), Vitest + Testing Library.

**Spec de référence:** [docs/superpowers/specs/2026-06-23-completion-description-tags-creation-design.md](../specs/2026-06-23-completion-description-tags-creation-design.md)

---

## File Structure

- **Create** `src/lib/recipe-completion.ts` — module utilitaire : type `CompletionSource` + fonction `triggerRecipeCompletion`. Responsabilité unique : analyser une recette et patcher ses champs descriptifs manquants. Best-effort, n'expose aucune erreur.
- **Create** `src/lib/recipe-completion.test.ts` — tests unitaires de la logique « ne pas écraser » / patch vide / échec silencieux.
- **Modify** `src/hooks/useRecipes.ts` — dans `useCreateRecipe`, appeler `triggerRecipeCompletion` après l'insert (à côté de `triggerImageGeneration`).
- **Modify** `src/hooks/useRecipes.test.ts` — test : la complétion est déclenchée après la création.
- **Modify** `src/hooks/useHomeChat.ts` — dans `savePendingRecipe`, branche `else` (création uniquement), appeler `triggerRecipeCompletion` après `triggerBackgroundImageGeneration`.
- **Modify** `src/hooks/useHomeChat.test.ts` — tests : complétion déclenchée à la création via chat ; pas de complétion en mise à jour.

---

## Task 1 : Module partagé `triggerRecipeCompletion`

**Files:**
- Create: `src/lib/recipe-completion.ts`
- Test: `src/lib/recipe-completion.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `src/lib/recipe-completion.test.ts` :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke, mockUpdate, mockEq, mockFrom } = vi.hoisted(() => {
  const mockEq = vi.fn(() => Promise.resolve({ error: null }));
  const mockUpdate = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ update: mockUpdate }));
  return { mockInvoke: vi.fn(), mockUpdate, mockEq, mockFrom };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mockInvoke }, from: mockFrom },
}));

import { triggerRecipeCompletion, type CompletionSource } from './recipe-completion';

const BASE: CompletionSource = {
  title: 'Risotto',
  ingredients: [{ name: 'Riz', quantity: 200, unit: 'g' }],
  steps: [{ order: 1, text: 'Cuire' }],
  ai_summary: null,
  calorie_score: null,
  nutrition_tags: null,
  season: null,
};

const ANALYSIS = {
  data: {
    ai_summary: 'Un risotto crémeux.',
    nutrition_tags: ['protéines'],
    calorie_score: 3,
    season: 'hiver',
  },
  error: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
});

describe('triggerRecipeCompletion', () => {
  it('complète les 4 champs quand la recette est vide', async () => {
    mockInvoke.mockResolvedValue(ANALYSIS);
    const onUpdated = vi.fn();

    await triggerRecipeCompletion('r1', BASE, onUpdated);

    expect(mockInvoke).toHaveBeenCalledWith('analyze-recipe', {
      body: { title: 'Risotto', ingredients: BASE.ingredients, steps: BASE.steps },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      ai_summary: 'Un risotto crémeux.',
      calorie_score: 3,
      nutrition_tags: ['protéines'],
      season: 'hiver',
    });
    expect(mockEq).toHaveBeenCalledWith('id', 'r1');
    expect(onUpdated).toHaveBeenCalled();
  });

  it("n'écrase pas les tags et la saison déjà saisis", async () => {
    mockInvoke.mockResolvedValue(ANALYSIS);

    await triggerRecipeCompletion(
      'r1',
      { ...BASE, nutrition_tags: ['léger'], season: 'été' },
      vi.fn(),
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      ai_summary: 'Un risotto crémeux.',
      calorie_score: 3,
    });
  });

  it("n'appelle pas update quand tout est déjà rempli", async () => {
    mockInvoke.mockResolvedValue(ANALYSIS);
    const onUpdated = vi.fn();

    await triggerRecipeCompletion(
      'r1',
      { ...BASE, ai_summary: 'Déjà là', calorie_score: 2, nutrition_tags: ['fer'], season: 'automne' },
      onUpdated,
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('avale les erreurs analyze-recipe sans throw ni update', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const onUpdated = vi.fn();

    await expect(triggerRecipeCompletion('r1', BASE, onUpdated)).resolves.toBeUndefined();

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm run test:run -- src/lib/recipe-completion.test.ts`
Expected: FAIL — `Failed to resolve import "./recipe-completion"` (le module n'existe pas encore).

- [ ] **Step 3 : Écrire l'implémentation minimale**

Create `src/lib/recipe-completion.ts` :

```typescript
import { supabase } from '@/integrations/supabase/client';
import type { Ingredient, Step } from '@/types/recipe';

/** Champs nécessaires pour compléter une recette sans écraser la saisie. */
export interface CompletionSource {
  title: string;
  ingredients: Ingredient[];
  steps: Step[];
  ai_summary: string | null;
  calorie_score: number | null;
  nutrition_tags: string[] | null;
  season: string | null;
}

interface AnalyzeResult {
  ai_summary?: string | null;
  nutrition_tags?: string[] | null;
  calorie_score?: number | null;
  season?: string | null;
}

/**
 * Complète en tâche de fond la description, les tags, la saison et le score
 * calorique d'une recette nouvellement créée, sans écraser les champs déjà saisis.
 * Best-effort : toute erreur est avalée (console.warn), la recette reste valide.
 */
export async function triggerRecipeCompletion(
  recipeId: string,
  current: CompletionSource,
  onUpdated: () => void | Promise<unknown>,
): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-recipe', {
      body: { title: current.title, ingredients: current.ingredients, steps: current.steps },
    });

    if (error || !data) {
      console.warn('Recipe completion: analyze-recipe failed', error);
      return;
    }

    const analysis = data as AnalyzeResult;
    const patch: Record<string, unknown> = {};

    if (!current.ai_summary?.trim() && analysis.ai_summary) {
      patch.ai_summary = analysis.ai_summary;
    }
    if (current.calorie_score == null && analysis.calorie_score != null) {
      patch.calorie_score = analysis.calorie_score;
    }
    if (!current.nutrition_tags?.length && analysis.nutrition_tags?.length) {
      patch.nutrition_tags = analysis.nutrition_tags;
    }
    if (!current.season && analysis.season) {
      patch.season = analysis.season;
    }

    if (Object.keys(patch).length === 0) return;

    const { error: updateError } = await supabase
      .from('recipes')
      .update(patch)
      .eq('id', recipeId);

    if (updateError) {
      console.warn('Recipe completion: update failed', updateError);
      return;
    }

    await onUpdated();
  } catch (err) {
    console.warn('Recipe completion error:', err);
  }
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npm run test:run -- src/lib/recipe-completion.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/recipe-completion.ts src/lib/recipe-completion.test.ts
git commit -m "feat(recipe): module de complétion auto description et tags"
```

---

## Task 2 : Câblage dans `useCreateRecipe` (formulaire RecipeNew)

**Files:**
- Modify: `src/hooks/useRecipes.ts`
- Test: `src/hooks/useRecipes.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `src/hooks/useRecipes.test.ts`, ajouter le mock du module en haut du fichier, juste après `vi.mock("@/integrations/supabase/client", ...)` :

```typescript
vi.mock("@/lib/recipe-completion", () => ({
  triggerRecipeCompletion: vi.fn(() => Promise.resolve()),
}));
```

Ajouter l'import (avec les autres imports, après l'import de `./useRecipes`) :

```typescript
import { triggerRecipeCompletion } from "@/lib/recipe-completion";
```

Ajouter ce bloc de test (à la suite des tests `useCreateRecipe` existants ; `FORM`, `installSupabase`, `createQueryWrapper`, `createTestQueryClient` sont déjà définis dans le fichier) :

```typescript
describe("useCreateRecipe — complétion", () => {
  it("déclenche la complétion après la création", async () => {
    installSupabase({
      user: { id: "u1" },
      result: { data: { id: "r-new", title: "Nouvelle", ingredients: [], steps: [] }, error: null },
    });

    const { result } = renderHook(() => useCreateRecipe(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    await result.current.mutateAsync({ ...FORM, source_type: "manual", source_image_url: null });

    await waitFor(() => expect(triggerRecipeCompletion).toHaveBeenCalled());
    expect(triggerRecipeCompletion).toHaveBeenCalledWith(
      "r-new",
      expect.objectContaining({ title: "Nouvelle" }),
      expect.any(Function),
    );
  });
});
```

> Note : `renderHook` et `waitFor` sont déjà importés en tête de fichier. Si `FORM` n'inclut pas `source_type`/`source_image_url`, les ajouter dans l'appel comme ci-dessus.

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run: `npm run test:run -- src/hooks/useRecipes.test.ts -t "complétion"`
Expected: FAIL — `triggerRecipeCompletion` n'est jamais appelé (aucun appel enregistré).

- [ ] **Step 3 : Écrire l'implémentation**

Dans `src/hooks/useRecipes.ts`, ajouter l'import en tête (avec les autres imports) :

```typescript
import { triggerRecipeCompletion } from '@/lib/recipe-completion';
```

Dans `useCreateRecipe`, juste après le bloc `triggerImageGeneration` existant (actuellement vers la ligne 85-87), ajouter :

```typescript
      // Complétion description/tags en arrière-plan (best-effort, non bloquant)
      triggerRecipeCompletion(createdRecipe.id, createdRecipe, () => {
        queryClient.invalidateQueries({ queryKey: ['recipe', createdRecipe.id] });
        queryClient.invalidateQueries({ queryKey: ['recipes'] });
      });
```

> `createdRecipe` est un `Recipe` complet (issu de `parseRecipe`) : il satisfait `CompletionSource` (title, ingredients, steps, ai_summary, calorie_score, nutrition_tags, season). `queryClient` est déjà disponible dans le hook.

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run: `npm run test:run -- src/hooks/useRecipes.test.ts`
Expected: PASS (incluant le nouveau test et tous les tests existants).

- [ ] **Step 5 : Commit**

```bash
git add src/hooks/useRecipes.ts src/hooks/useRecipes.test.ts
git commit -m "feat(recipe): complète description et tags à la création via le formulaire"
```

---

## Task 3 : Câblage dans `savePendingRecipe` (chat IA)

**Files:**
- Modify: `src/hooks/useHomeChat.ts`
- Test: `src/hooks/useHomeChat.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/hooks/useHomeChat.test.ts`, ajouter le mock du module en haut (avec les autres `vi.mock`) :

```typescript
vi.mock("@/lib/recipe-completion", () => ({
  triggerRecipeCompletion: vi.fn(() => Promise.resolve()),
}));
```

Ajouter l'import (avec les autres imports de modules) :

```typescript
import { triggerRecipeCompletion } from "@/lib/recipe-completion";
```

Ajouter ces deux tests (les helpers `installSupabase`, `sendToolCall`, `renderHook`, `act`, `waitFor`, `PENDING_RECIPE`, `SESSION` sont déjà utilisés dans le fichier — calquer l'appel d'installation du mock sur les tests `savePendingRecipe` existants) :

```typescript
describe("savePendingRecipe — complétion", () => {
  it("déclenche la complétion description/tags après l'insertion (création)", async () => {
    installSupabase({
      session: SESSION,
      resultsByTable: { recipes: { data: { id: "new-1" }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "save_recipe", PENDING_RECIPE);
    await act(() => result.current.savePendingRecipe());

    await waitFor(() => expect(triggerRecipeCompletion).toHaveBeenCalled());
    expect(triggerRecipeCompletion).toHaveBeenCalledWith(
      "new-1",
      expect.objectContaining({ title: PENDING_RECIPE.title }),
      expect.any(Function),
    );
  });

  it("ne déclenche pas la complétion en mise à jour", async () => {
    installSupabase({
      session: SESSION,
      resultsByTable: { recipes: { data: { id: "r1" }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());

    await sendToolCall(result, "save_recipe", {
      ...PENDING_RECIPE,
      isUpdate: true,
      originalRecipeId: "r1",
    });
    await act(() => result.current.savePendingRecipe());

    expect(triggerRecipeCompletion).not.toHaveBeenCalled();
  });
});
```

> Note : si la fonction d'installation du mock supabase du fichier porte un autre nom que `installSupabase`, utiliser le nom réel employé par les tests `savePendingRecipe` voisins (cf. test « savePendingRecipe insère la recette en brouillon IA »).

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm run test:run -- src/hooks/useHomeChat.test.ts -t "complétion"`
Expected: FAIL — le premier test échoue (`triggerRecipeCompletion` jamais appelé). Le second passe déjà (rien ne l'appelle), c'est attendu.

- [ ] **Step 3 : Écrire l'implémentation**

Dans `src/hooks/useHomeChat.ts`, ajouter l'import en tête :

```typescript
import { triggerRecipeCompletion } from '@/lib/recipe-completion';
```

Dans `savePendingRecipe`, branche `else` (création), juste après l'appel `triggerBackgroundImageGeneration(...)` (vers la ligne 202), ajouter :

```typescript
          triggerRecipeCompletion(
            recipeId,
            {
              title: pending.title,
              ingredients: pending.ingredients,
              steps: pending.steps,
              ai_summary: null,
              calorie_score: null,
              nutrition_tags: null,
              season: null,
            },
            refetchRecipes,
          );
```

> Placer cet appel à l'intérieur du `if (recipeId) { ... }` existant, à côté de `triggerBackgroundImageGeneration`. Ne **pas** l'ajouter dans la branche `if (pending.isUpdate ...)`.

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run: `npm run test:run -- src/hooks/useHomeChat.test.ts`
Expected: PASS (les deux nouveaux tests + tous les tests existants).

- [ ] **Step 5 : Commit**

```bash
git add src/hooks/useHomeChat.ts src/hooks/useHomeChat.test.ts
git commit -m "feat(recipe): complète description et tags à la création via le chat"
```

---

## Task 4 : Vérification finale

- [ ] **Step 1 : Suite de tests complète**

Run: `npm run test:run`
Expected: PASS (toute la suite, aucune régression).

- [ ] **Step 2 : Lint**

Run: `npm run lint`
Expected: Aucune nouvelle erreur sur les fichiers touchés (`src/lib/recipe-completion.ts`, `src/hooks/useRecipes.ts`, `src/hooks/useHomeChat.ts`).

- [ ] **Step 3 : Build (vérif TypeScript)**

Run: `npm run build`
Expected: Build réussi, pas d'erreur de type.

- [ ] **Step 4 : Bump de version**

Incrémenter `version` dans `package.json` (évolution notable, cf. CLAUDE.md). Commit :

```bash
git add package.json
git commit -m "chore: bump version (complétion description/tags à la création)"
```

---

## Self-Review (effectuée à la rédaction)

- **Couverture spec** : non-bloquant ✔ (fire-and-forget, navigation immédiate) · aucun champ UI ✔ · ne pas écraser ✔ (Task 1 tests 1-2) · création seulement ✔ (Task 3 test « pas en update ») · échec silencieux ✔ (Task 1 test 4) · patch vide ✔ (Task 1 test 3) · deux chemins ✔ (Tasks 2 et 3).
- **Placeholders** : aucun — tout le code de test et d'implémentation est fourni.
- **Cohérence des types** : `triggerRecipeCompletion(recipeId, current: CompletionSource, onUpdated)` utilisé de façon identique dans Tasks 1/2/3. `createdRecipe` (type `Recipe`) satisfait `CompletionSource`. `analyze-recipe` renvoie `{ ai_summary, nutrition_tags, calorie_score, season }`, mappé dans `AnalyzeResult`.
- **Edge function** : `analyze-recipe` est déjà déployée et inchangée — aucun redéploiement Supabase nécessaire.
