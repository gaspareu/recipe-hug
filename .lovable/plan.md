

## Unifier le chat de la page recette avec le chat principal

### Objectif
Remplacer le chat actuel de la page recette (basé sur `useCookingAssistant` + `cooking-assistant`) par une version du chat principal (`useHomeChat` + `home-assistant`) enrichie du contexte de la recette en cours (ingredients, etapes, progression).

### Approche

Plutot que de dupliquer `useHomeChat`, on va creer un hook `useRecipeChat` qui reutilise la meme architecture et le meme endpoint (`home-assistant`) mais demarre directement dans un mode contextuel (cooking ou editing) avec la recette pre-chargee.

### Changements

#### 1. Nouveau hook : `src/hooks/useRecipeChat.ts`
- Fork leger de `useHomeChat` adapte au contexte recette
- Recoit la recette en parametre et la passe comme `activeRecipe` dans chaque appel
- Inclut les `completedSteps` dans le contexte envoye au backend
- Demarre en mode `cooking` par defaut (au lieu de `orchestration`)
- Le message de bienvenue mentionne la recette
- Supporte les memes modes : orchestration, cooking, editing, creating, memory
- Gere les memes tool calls que `useHomeChat` (search, save, extract, navigate, etc.)
- Ajoute le contexte de progression (etapes cochees) dans le payload envoye a `home-assistant`

#### 2. Mise a jour du backend : `supabase/functions/home-assistant/index.ts`
- Ajouter un champ optionnel `completedSteps` dans `ActiveRecipeSchema` pour transmettre la progression
- Enrichir `formatRecipeContext()` pour afficher le statut de completion des etapes (comme le fait deja `cooking-assistant`)
- Le reste de la logique (prompts, tools, modes) est deja en place

#### 3. Refonte de `AssistantSheetContent` dans `src/pages/RecipeDetail.tsx`
- Remplacer `useCookingAssistant` par `useRecipeChat`
- Conserver les onglets Cuisiner / Modifier / Historique mais les connecter au mode du hook unifie
- Reprendre l'UI du chat Home : barre de saisie arrondie, bouton +, upload image, micro/envoi dynamique, suggestions contextuelles
- Conserver la gestion des `pendingRecipe` (apply/create) qui existe deja
- Ajouter le badge de mode comme sur la page Home

#### 4. Suppression de l'ancien code
- Supprimer `src/hooks/useCookingAssistant.ts` (plus utilise)
- La edge function `cooking-assistant` peut etre conservee temporairement mais ne sera plus appelee

### Details techniques

```text
Flux actuel (recette) :
  RecipeDetail → useCookingAssistant → cooking-assistant (edge)

Nouveau flux :
  RecipeDetail → useRecipeChat → home-assistant (edge)
                                  (avec completedSteps + recette pre-chargee)
```

Le hook `useRecipeChat` differe de `useHomeChat` par :
- `activeRecipe` est initialise avec la recette courante (pas null)
- Le mode initial est `cooking` (pas `orchestration`)  
- Le payload inclut `completedSteps: number[]` pour la progression
- Les tool calls `save_recipe` / `extract_modified_recipe` / `create_new_recipe` declenchent les callbacks `onRecipeUpdate` / `onRecipeCreate` du parent
- Le `resetChat` garde le contexte recette (ne revient pas a orchestration vide)

Le composant `ChatInterface` dans RecipeDetail sera largement aligne sur le rendu de Home.tsx : meme barre d'input, memes bulles, memes suggestions dynamiques, support image et voix.

