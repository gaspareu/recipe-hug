# Grille J2 — Ajouter une recette manuellement / depuis une photo

| Écran | D1 UX | D2 Visuel | D3 Fonctionnel | Notes |
|-------|-------|-----------|----------------|-------|
| Dashboard | 🟢 | 🟢 | 🟢 | Bouton "Nouvelle" visible, état vide géré, swipe back fonctionnel |
| RecipeEdit | 🟡 | 🟡 | 🟡 | Page très longue, 2 colonnes compressées à 390px, pas de confirmation avant abandon |
| ImageUploader | 🟢 | 🟢 | 🔴 | Composant orphelin — non intégré dans RecipeEdit, flux photo inexistant |
| IngredientEditor | 🔴 | 🟡 | 🟡 | 5 champs par ligne inutilisable sur mobile, catégorie cachée sans alternative |
| StepsEditor | 🟡 | 🟢 | 🟢 | Grip icon affiché mais drag-drop non implémenté |

## Problèmes détaillés

### ImageUploader — D3 Fonctionnel — 🔴 Majeur
Composant développé mais non intégré dans RecipeEdit. Le flux "créer depuis photo" n'existe pas dans l'app.
**Suggestion :** Intégrer dans RecipeEdit avec choix "Photo" vs "Manuel" au démarrage, ou créer une page RecipeImport qui lance l'OCR puis redirige vers RecipeEdit pré-rempli.

### IngredientEditor — D1 UX — 🔴 Majeur
5 champs par ingrédient (Nom, Qté, Unité, Catégorie, Supprimer) sur une seule ligne — inutilisable à 390px. La catégorie est masquée (`hidden sm:flex`) sans alternative mobile.
**Suggestion :** Layout colonne sur mobile : Ligne 1 Nom (full) / Ligne 2 Qté | Unité (50/50) / Ligne 3 Catégorie / Ligne 4 Supprimer.

### RecipeEdit — D1 UX — 🟡 Mineur
Page très longue sur mobile, pas de scroll hint, les 2 colonnes Portions/Statut risquent d'être compressées.
**Suggestion :** Regrouper en sections collapsibles ou passer en multi-step form.

### RecipeEdit — D3 Fonctionnel — 🟡 Mineur
Pas de confirmation avant fermeture si modifications non enregistrées. Validation minimale (titre requis mais sans message d'erreur visible).
**Suggestion :** Modal "Quitter sans enregistrer ?" + validations inline.

### StepsEditor — D1 UX — 🟡 Mineur
Icône grip affichée mais drag-drop non implémenté sur mobile.
**Suggestion :** Implémenter drag-drop ou retirer l'icône. Ajouter boutons ↑/↓ sur mobile.
