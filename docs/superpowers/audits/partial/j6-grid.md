# Grille J6 — Retrouver une recette existante

## Réponse à la question clé D3

**Un utilisateur avec 50 recettes peut-il retrouver ce qu'il cherche en moins de 10 secondes ?**

Partiellement. La recherche textuelle par titre est instantanée et sans debounce (réactif à chaque frappe). Mais la recherche est limitée au titre uniquement — pas d'ingrédients, pas de tags nutritionnels. Avec 50 recettes dont plusieurs noms similaires, la combinaison recherche + filtre statut + filtre saison est fonctionnelle mais les filtres ne sont pas cumulatifs avec la recherche de façon évidente (pas de résultats en temps réel affichés dans les dropdowns). La réponse est : **oui si l'utilisateur se souvient du titre, non si il cherche par ingrédient ou tag**.

| Écran | D1 UX | D2 Visuel | D3 Fonctionnel | Notes |
|-------|-------|-----------|----------------|-------|
| Dashboard (recherche) | 🟢 | 🟢 | 🟡 | Recherche réactive sur le titre, filtres actifs visibles sous forme de badges supprimables. Pas de résultat mis en évidence dans la galerie. Aucun tri (alphabétique, date, récemment consulté). |
| FilterBar | 🟢 | 🟢 | 🟡 | Interface compacte et claire sur mobile. Recherche titre + filtre statut + saison + favoris. Manque : recherche dans les ingrédients, filtre par tag nutritionnel, tri des résultats. |

## Problèmes détaillés

### 🟡 FilterBar / Dashboard — Recherche limitée au titre
**Description :** La logique de filtrage dans `Dashboard.tsx` (ligne 48) vérifie uniquement `recipe.title.toLowerCase().includes(search.toLowerCase())`. Un utilisateur qui cherche "poulet" pour retrouver une recette de "Gratin dauphinois au blanc de volaille" (avec poulet dans les ingrédients) ne trouvera rien.

**Suggestion :** Étendre la recherche aux `ingredients[].name` et à `ai_summary` pour couvrir les cas de recherche sémantique naturelle, sans nécessiter un moteur de recherche externe.

---

### 🟡 Dashboard — Aucun tri disponible
**Description :** Les recettes sont affichées dans l'ordre retourné par la requête Supabase (probablement `created_at` DESC par défaut). Il n'existe aucun contrôle de tri visible : pas de "plus récentes", "alphabétique", "récemment consultées", "les mieux notées". Avec 50 recettes, l'utilisateur qui cherche une recette récente doit la trouver visuellement dans la grille.

**Suggestion :** Ajouter un sélecteur de tri (A-Z, plus récentes, favoris en tête) dans ou à côté de la FilterBar. Option minimaliste : ajouter un seul bouton toggle "A-Z" dans la barre existante sans encombrer l'UI.

---

### 🟡 FilterBar — Pas de filtre par tag nutritionnel
**Description :** Les recettes analysées par l'IA reçoivent des `nutrition_tags` (ex: "végétarien", "sans gluten"). Ces données sont présentes dans le modèle et affichées en badges sur RecipeDetail, mais elles ne sont pas filtrables depuis le Dashboard. Un utilisateur cherchant "quelque chose de végétarien pour ce soir" ne peut pas filtrer sur ce critère.

**Suggestion :** Ajouter un filtre multi-select pour les `nutrition_tags` (récupérer les valeurs distinctes existantes dans les recettes de l'utilisateur via une requête dédupliquée).

---

### 🟡 Dashboard — Galerie uniquement, pas de vue liste
**Description :** La galerie `ImageGallery` affiche les recettes sous forme de grille d'images. Pour les recettes sans image (photo générée ou non), les vignettes sont des placeholders. Avec 50 recettes, parcourir visuellement les vignettes est moins efficace qu'une vue liste avec titre + statut + date.

**Suggestion :** Ajouter un toggle vue liste / vue galerie. La vue liste afficherait titre, statut (badge couleur), saison, et favori sur une ligne compacte, bien adapté au scan rapide.

---

### 🟡 FilterBar — Le bouton ✕ reset les filtres mais pas la recherche
**Description :** La fonction `clearAllFilters` dans `FilterBar` réinitialise statut, favoris et saison, mais pas le champ `search` (qui est géré par le parent Dashboard). Le badge "Recherche" dans Dashboard a son propre bouton de suppression, mais si l'utilisateur utilise le ✕ global de la FilterBar, la recherche textuelle reste active. L'état est donc partiellement resetté, ce qui peut dérouter.

**Suggestion :** Soit faire remonter le reset de `search` dans `clearAllFilters` via un callback supplémentaire, soit déplacer la logique de clear complet entièrement dans le composant parent Dashboard.
