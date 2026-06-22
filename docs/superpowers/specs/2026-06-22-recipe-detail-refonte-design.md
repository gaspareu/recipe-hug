# Refonte page détail recette (#5) — design

## Contexte & objectifs

`src/pages/RecipeDetail.tsx` cumule plusieurs problèmes UX (backlog #5) :

1. **Trop de CTA en haut à droite** (favori, analyser+image, partager, export Cookidoo, éditer) — ils débordent et **coupent le badge de statut « brouillon »**.
2. **Affichage des tags/badges** peu lisible.
3. La **bulle assistant flottante** (`CookingAssistantButton`) **masque le bouton « étape suivante »** de la barre fixe.
4. La cuisson se fait *inline* sur la fiche (progression d'étapes + sheet assistant) au lieu de **rediriger vers le mode cuisine** livré au #2.

Design validé via la maquette DS Grimoire `recipe-detail/Recipe detail.html` (projet `c95dc289…`).

## Principes de la refonte

- **Hero épuré** : bouton *retour* (gauche) + *favori* + menu **« … »** (droite). Plus que 2 boutons d'action sur l'image.
- **Menu d'actions secondaires** (`DropdownMenu`) : Éditer · Partager · Exporter vers Cookidoo · Analyser & générer l'image · Historique des versions.
- **Statut** = premier badge (cliquable, ouvre `RecipeStatusSelect`) d'une **rangée de badges scrollable** sous le titre : statut → saison → tags nutrition → score. Jamais chevauché.
- **Étapes en lecture seule** : liste numérotée (cercle n° + texte), sans cochage, sans barre de progression fixe, sans bouton flottant.
- **CTA unique « Cuisiner »** : barre fixe en bas, pleine largeur, primaire → ouvre le **mode cuisine** (`CookingModeContainer`). Affiché seulement si la recette a au moins une étape.
- **Ingrédients** : checklist conservée (`IngredientChecklistWithHeader`), utile prépa/courses.

## Changements par composant

### `src/pages/RecipeDetail.tsx` (refactor principal)
- **Supprimer** l'expérience cuisson inline : états `completedSteps`, `currentStepIndex`, `chatOpen` ; fonctions `handleStepToggle`, `handleAdvanceStep` ; la barre d'étape fixe ; `CookingAssistantButton` ; le `Sheet` assistant et les sous-composants `AssistantSheetContent` / `RecipeChatContent` (et l'usage de `useRecipeChat`, `RecipeVersionHistory` y était imbriqué).
- **Étapes** → composant de liste en lecture seule (numérotée).
- **Actions hero** → `RecipeActionsMenu` (nouveau) regroupant les actions secondaires ; favori reste un bouton overlay direct ; retour inchangé.
- **CTA « Cuisiner »** → barre fixe en bas ; état local `cooking` → rend `<CookingModeContainer recipeId={recipe.id} onClose={…} />` en overlay (réutilise le #2). Les handlers `onRecipeUpdate`/`onRecipeCreate` du mode cuisine réutilisent `useUpdateRecipe`/`useCreateRecipe` + snapshot de version (déjà en place dans le conteneur).
- **Historique** → ouvre un `Sheet` contenant `RecipeVersionHistory` (déclenché depuis le menu).

### Nouveau : `src/components/recipes/RecipeActionsMenu.tsx`
- `DropdownMenu` (shadcn) déclenché par un bouton overlay « … » (`MoreVertical`).
- Items : Éditer (`Link` vers `/edit`), Partager, Exporter Cookidoo, Analyser & générer l'image, Historique des versions.
- Pilote l'ouverture des dialogs/sheets via état (voir ci-dessous).

### `ShareRecipeDialog` & `ExportToCookidooButton` → mode contrôlé
- Ajouter props optionnelles `open?` / `onOpenChange?` et masquer le trigger interne quand contrôlé (prop `trigger?: ReactNode` ou `hideTrigger`).
- Permet de les piloter depuis `RecipeActionsMenu` (un item de menu ouvre le dialog) sans casser leurs usages actuels (trigger par défaut conservé si non contrôlé).

## Réutilisation du mode cuisine (#2)
- `CookingModeContainer` / `startCooking` existent déjà. Sur la fiche, le CTA « Cuisiner » ouvre le conteneur avec `recipe.id`. Pas de duplication de logique cuisson.

## Tests
- `RecipeDetail` : rendu de la fiche (titre, badges, ingrédients, étapes lecture seule), présence du CTA « Cuisiner » quand il y a des étapes, ouverture du mode cuisine au clic, ouverture du menu d'actions.
- `RecipeActionsMenu` : le menu liste les actions et déclenche l'ouverture du dialog correspondant.
- `ShareRecipeDialog` / `ExportToCookidooButton` : non-régression du mode auto-porté + nouveau mode contrôlé.
- Vérif visuelle mobile (Playwright) conforme à la maquette.

## Hors-scope
- Pas de changement back/edge function (refonte purement front).
- Pas de refonte du Dashboard ni de l'éditeur.
- La génération d'image / analyse garde sa logique actuelle, seulement déplacée dans le menu.

## Risques
- Rendre `ShareRecipeDialog`/`ExportToCookidooButton` contrôlables sans casser leurs appels existants (garder le comportement par défaut si props non fournies).
- L'ordre des hooks dans `RecipeDetail` (déjà sensible, cf. erreur #310 historique) : conserver tous les hooks avant les early returns.
