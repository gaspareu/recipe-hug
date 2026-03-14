# Grille J3 — Cuisiner une recette

| Écran | D1 UX | D2 Visuel | D3 Fonctionnel | Notes |
|-------|-------|-----------|----------------|-------|
| RecipeDetail (mode cuisson) | 🟡 | 🟢 | 🟡 | Navigation étapes par toggle manuel ; pas de mode plein écran cuisson ; bouton assistant FAB visible mais label masqué sur mobile (`hidden sm:inline`) |
| IngredientChecklist | 🟢 | 🟢 | 🟡 | Checklist animée bien faite ; état non persisté (rechargement = tout reset) ; pas de distinction ingrédients déjà en stock |
| CookingAssistantButton | 🔴 | 🟡 | 🟡 | Label texte invisible sur mobile (hidden sm:inline) → utilisateur voit juste une icône sans contexte ; tooltip inaccessible au touch |

## Problèmes détaillés

### 🔴 CookingAssistantButton — Label invisible sur mobile
**Description :** Le texte du bouton FAB (`Assistant (x/y)` ou `Terminé !`) est rendu avec `hidden sm:inline`, ce qui le masque sur tout écran < 640 px, soit l'intégralité des téléphones. L'utilisateur voit un bouton rond avec une icône MessageCircle sans label. Le tooltip `side="left"` est un élément hover-only, non accessible au touch.

**Suggestion :** Retirer `hidden sm:inline` ou utiliser `inline` par défaut et `sm:inline` redondant — ou afficher le compteur d'étape `(x/y)` systématiquement à côté de l'icône, même en format court.

---

### 🟡 RecipeDetail — Pas de mode cuisson dédié
**Description :** Il n'existe pas de bascule vers un mode "cuisson" qui masquerait les métadonnées (badges, résumé IA, image) pour ne montrer que les étapes et la checklist. Sur une recette avec image + tags + summary + liste ingrédients longue, l'utilisateur doit scroller plusieurs fois pour atteindre l'étape en cours, les mains occupées.

**Suggestion :** Ajouter un bouton "Cuisiner" qui scrolle en focus sur la section Étapes, ou affiche les étapes en modale plein écran avec swipe entre étapes.

---

### 🟡 RecipeDetail — `handleAdvanceStep` non exposé à l'utilisateur
**Description :** La fonction `handleAdvanceStep` (qui coche automatiquement la prochaine étape non complétée) est définie mais n'est pas reliée à un bouton visible dans l'interface. Seul le clic direct sur chaque étape permet de la cocher. En mode mains mouillées/occupées, c'est une opportunité manquée.

**Suggestion :** Exposer un bouton "Étape suivante" (potentiellement dans le FAB ou en bas de la liste d'étapes) qui appelle `handleAdvanceStep`.

---

### 🟡 IngredientChecklist — État non persisté
**Description :** La checklist des ingrédients est gérée en état local React (`useState`). Un rechargement de page ou un retour arrière puis retour sur la recette remet tout à zéro. En usage famille avec interruptions fréquentes, cela oblige à retrouver sa position manuellement.

**Suggestion :** Persister l'état dans `sessionStorage` ou `localStorage` avec la clé `recipe-{id}-checklist` pour survivre aux navigations intra-session.

---

### 🟡 RecipeDetail — Erreurs upload image silencieuses
**Description :** Les blocs `catch` dans `handleImageChange` et `handleImageRemove` font un `console.error` uniquement. L'utilisateur ne reçoit aucun feedback visuel en cas d'échec upload.

**Suggestion :** Ajouter un `toast.error(...)` dans les catch pour informer l'utilisateur.
