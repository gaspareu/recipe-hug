# Grille J4 — Planifier les repas de la semaine

**Composants meal-planning analysés :** `GroceryListSheet.tsx` (seul fichier dans `src/components/meal-planning/`)

| Écran | D1 UX | D2 Visuel | D3 Fonctionnel | Notes |
|-------|-------|-----------|----------------|-------|
| MealPlanning | 🔴 | 🟢 | 🔴 | Aucun moyen d'ajouter un repas depuis l'interface — la page est en lecture seule. Ajout uniquement via l'assistant IA (Chef). Suppression possible mais création impossible sans quitter la page. |
| GroceryListSheet | 🟢 | 🟢 | 🟡 | Sheet bottom bien positionnée ; agrégation des ingrédients correcte ; mais les quantités de même ingrédient ne sont pas additionnées (ex: 200g + 100g n'est pas consolidé en 300g, juste juxtaposé) ; custom meals sans checkbox |

## Problèmes détaillés

### 🔴 MealPlanning — Ajout de repas impossible depuis la page
**Description :** La page MealPlanning est une vue en lecture seule. Il n'existe aucun bouton, aucun slot cliquable, aucun formulaire pour ajouter un repas directement. La seule voie est de cliquer sur "Planifier avec Chef" (état vide) ou le bouton Utensils dans le header, qui redirige vers `/home` (l'assistant IA).

Pour un cas d'usage famille typique ("je veux juste mettre 'pizza' vendredi soir"), l'utilisateur doit passer par une conversation IA, ce qui est une friction majeure pour une action aussi simple.

**Suggestion :** Rendre chaque cellule jour/type-de-repas tappable pour ouvrir un mini-formulaire (sélecteur de recette existante OU saisie texte libre). Le bouton Chef reste disponible pour la planification automatique.

---

### 🔴 MealPlanning — Suppression sans confirmation
**Description :** La fonction `deleteMeal` supprime immédiatement en base sans aucun dialog de confirmation. La croix de suppression est en `opacity-0 group-hover:opacity-100` — comportement hover uniquement, donc **invisible sur mobile tactile** où `hover` n'existe pas. L'utilisateur sur mobile ne voit jamais le bouton de suppression et ne peut pas supprimer un repas.

**Suggestion :** Remplacer le hover par un tap long ou un bouton toujours visible (même à opacité réduite) avec swipe-to-delete. Ajouter un `toast` avec action "Annuler" (undo) plutôt qu'une confirmation modale.

---

### 🟡 MealPlanning — Pas de retour "aujourd'hui"
**Description :** Le navigateur de semaine permet d'avancer/reculer semaine par semaine, mais il n'y a pas de bouton "Aujourd'hui" pour revenir rapidement à la semaine courante si l'utilisateur a navigué loin dans le futur.

**Suggestion :** Ajouter un bouton "Aujourd'hui" entre les chevrons, visible uniquement quand la semaine affichée n'est pas la semaine courante.

---

### 🟡 GroceryListSheet — Quantités non additionnées
**Description :** La fonction `aggregateIngredients` détecte les doublons par nom (`.toLowerCase()`) mais ne tente pas d'additionner les quantités numériques — elle les juxtapose avec `+`. Ainsi "200 g farine" (lundi) et "100 g farine" (mercredi) s'affiche "farine (200 g + 100 g)" au lieu de "farine (300 g)". Pour une liste de courses, c'est un manque pratique notable.

**Suggestion :** Pour les quantités de même unité, additionner les valeurs numériques. Ignorer ou juxtaposer uniquement si les unités diffèrent.

---

### 🟡 MealPlanning — Aucune recette liée visible en détail depuis la grille
**Description :** Les titres de recettes liées sont cliquables (`cursor-pointer hover:underline`) et naviguent vers la fiche recette, ce qui est bien. Mais si l'utilisateur veut consulter rapidement les ingrédients d'un seul repas (pas toute la liste de courses), il n'y a pas d'aperçu rapide — il quitte le planning.

**Suggestion :** Un tap long ou une icône "œil" sur le nom de la recette pourrait ouvrir un mini-sheet avec les ingrédients, sans quitter le planning.
