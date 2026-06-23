# Complétion automatique de la description et des tags à la création d'une recette

> Spec de design — 2026-06-23

## Problème

À la création d'une recette, la **description** (`ai_summary`) reste vide et les **tags
nutritionnels** (`nutrition_tags`) doivent être saisis à la main depuis une liste figée.
La fonction edge `analyze-recipe` sait déjà produire ces champs, mais elle n'est
déclenchée qu'**après** création, via un bouton dans `RecipeDetail`. Résultat : la
plupart des recettes nouvellement créées n'ont ni description ni tags tant que
l'utilisateur ne lance pas l'analyse manuellement.

## Objectif

Compléter automatiquement et **silencieusement** la description, les tags, la saison et
le score calorique au moment de l'enregistrement d'une **nouvelle** recette, pour les
deux chemins de création :

1. `RecipeNew` — modes manuel et photo (`useCreateRecipe`)
2. Chat IA d'accueil — `save_recipe` → recette en attente → `savePendingRecipe`

Hors scope : webhook externe (`webhook-recipe`), mises à jour de recettes existantes.

## Comportement attendu

- **Non-bloquant** : l'enregistrement et la navigation/affichage restent immédiats.
  La complétion tourne en tâche de fond (fire-and-forget) et la fiche se rafraîchit
  d'elle-même dès que les champs sont écrits (~1-2 s plus tard).
- **Aucun nouveau champ UI** dans le formulaire de création ni dans le chat.
- **Ne pas écraser la saisie utilisateur** :
  - `ai_summary` → toujours rempli (jamais saisi à la création)
  - `calorie_score` → toujours rempli (jamais saisi)
  - `nutrition_tags` → rempli **seulement si vide** (protège la sélection manuelle de `RecipeNew`)
  - `season` → rempli **seulement si vide**
- **Création uniquement**, jamais en mise à jour (`isUpdate`).
- **Échec silencieux** : si `analyze-recipe` échoue, la recette reste valide sans
  description/tags. On log en `console.warn`. Le bouton d'analyse de `RecipeDetail`
  reste le filet de secours.

## Architecture

### Pattern de référence existant

Deux chemins de création insèrent indépendamment et déclenchent chacun leur propre
génération d'image en arrière-plan :

| Chemin | Insert | Trigger image existant |
|---|---|---|
| `RecipeNew` (manuel + photo) | `useCreateRecipe` (`src/hooks/useRecipes.ts`) | `triggerImageGeneration` |
| Chat | `savePendingRecipe`, branche `else` (`src/hooks/useHomeChat.ts`) | `triggerBackgroundImageGeneration` |

La complétion s'ajoute **exactement aux mêmes points d'appel**, en miroir de ces
triggers d'image.

### Nouvelle fonction partagée

`triggerRecipeCompletion(recipeId, current, accessToken, onUpdated)` — fire-and-forget :

1. Appelle l'edge function `analyze-recipe` avec `{ title, ingredients, steps }`.
2. Construit un patch ne contenant que les champs manquants selon les règles
   « ne pas écraser » ci-dessus (`current` fournit les `nutrition_tags`/`season`
   éventuellement déjà saisis).
3. Si le patch est non vide, écrit en DB (`supabase.from('recipes').update(patch).eq('id', recipeId)`).
4. Appelle `onUpdated()` pour rafraîchir le cache (invalidation TanStack Query
   `['recipe', id]` + `['recipes']`, ou `refetchRecipes` côté chat).
5. Toute erreur est avalée en `console.warn` (ne remonte jamais à l'appelant).

Emplacement : module utilitaire côté client (ex. `src/lib/recipe-completion.ts`),
importé par les deux hooks. On ne factorise pas les deux triggers d'image existants
(hors scope) ; on se contente d'ajouter le trigger de complétion en parallèle.

### Points d'appel

- **`useCreateRecipe`** (`src/hooks/useRecipes.ts`) : après l'insert réussi, à côté de
  l'appel `triggerImageGeneration`. `onUpdated` = invalidation via `queryClient`.
- **`savePendingRecipe`** (`src/hooks/useHomeChat.ts`) : dans la branche `else`
  (création), à côté de `triggerBackgroundImageGeneration`. `onUpdated` = `refetchRecipes`.
  Pour le chat, tous les champs sont vides → tout est complété.

## Flux de données

```
Enregistrement recette (RecipeNew ou chat)
  └─ insert recipes (sans ai_summary, tags/season = saisie ou null)
  └─ navigation / message immédiat
  └─ triggerRecipeCompletion (fond)
       ├─ analyze-recipe (Haiku) → { ai_summary, nutrition_tags, calorie_score, season }
       ├─ patch = champs manquants uniquement
       ├─ update recipes
       └─ onUpdated() → refetch → description + tags visibles
```

## Gestion d'erreur

- `analyze-recipe` indisponible / réponse invalide → `console.warn`, aucun patch, la
  recette reste telle quelle. Aucune notification d'erreur à l'utilisateur (complétion
  best-effort, comme la génération d'image).
- Patch vide (tout déjà rempli) → aucun appel `update`, aucun refetch inutile.

## Tests (Vitest)

1. La complétion est déclenchée après l'insert (les deux chemins).
2. `nutrition_tags` / `season` saisis par l'utilisateur ne sont **pas** écrasés.
3. `ai_summary` / `calorie_score` sont remplis même si l'utilisateur n'a rien saisi.
4. Aucune complétion en mise à jour (`isUpdate`).
5. Un échec de `analyze-recipe` ne fait pas échouer la création (recette créée, warn loggé).
6. Patch vide → pas d'appel `update`.

## Non-objectifs

- Pas de champ description éditable dans le formulaire.
- Pas de complétion bloquante / avec loader d'attente.
- Pas de prise en charge du webhook externe ni des mises à jour.
- Pas de refactoring des deux triggers d'image existants.
