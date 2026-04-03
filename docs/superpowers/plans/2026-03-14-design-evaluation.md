# Design Evaluation — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire un audit complet du design de recipe-hug couvrant UX & navigation, cohérence visuelle, adéquation fonctionnelle et comportement PWA, livré sous forme d'un document markdown avec tableau de sévérité, synthèse par parcours et recommandations priorisées.

**Architecture:** L'évaluation suit 6 parcours utilisateurs (J1–J6) croisés avec 4 dimensions (D1 UX, D2 Visuel, D3 Fonctionnel, D4 PWA). Chaque parcours fait l'objet d'une revue statique du code source, suivie d'une revue visuelle via le navigateur. Les résultats sont consolidés dans un document final.

**Tech Stack:** React + TypeScript, shadcn/ui, Tailwind CSS, Supabase, vite-plugin-pwa.

**Spec:** `docs/superpowers/specs/2026-03-14-design-evaluation-plan.md`

**Livrable:** `docs/superpowers/audits/2026-03-14-design-audit.md`

---

## Chunk 1 : Revue statique des parcours J1–J3

### Task 1 : Évaluation J1 — Créer une recette via le chat IA

**Écrans :** `src/pages/Home.tsx`, `src/components/chat/ChatInterface.tsx`, `src/pages/RecipeDetail.tsx`

- [ ] **Étape 1 : Lire Home.tsx en entier**

  Identifier : structure du layout, navigation entrante/sortante, gestion des états (vide, streaming, pendingRecipe), zones d'action, ergonomie mobile (touch targets, safe areas).

- [ ] **Étape 2 : Lire ChatInterface.tsx en entier**

  Identifier : gestion de l'input, états de streaming, affichage de la confirmation de recette (pendingRecipe), cohérence des composants utilisés, accessibilité mobile.

- [ ] **Étape 3 : Lire RecipeDetail.tsx en entier**

  Identifier : état après sauvegarde, retour arrière, actions disponibles au premier écran sans scroll.

- [ ] **Étape 4 : Remplir la grille J1**

  Pour chaque dimension D1/D2/D3, noter chaque écran avec le système 🟢/🟡/🔴/⚫ et décrire le problème s'il y en a un. Format :

  ```
  Écran       | D1 UX | D2 Visuel | D3 Fonctionnel | Notes
  Home        |       |           |                |
  ChatInterface|      |           |                |
  RecipeDetail|       |           |                |
  ```

---

### Task 2 : Évaluation J2 — Ajouter une recette manuellement / depuis une photo

**Écrans :** `src/pages/Dashboard.tsx`, `src/pages/RecipeEdit.tsx`, `src/components/recipes/ImageUploader.tsx`, `src/components/recipes/IngredientEditor.tsx`, `src/components/recipes/StepsEditor.tsx`

- [ ] **Étape 1 : Lire Dashboard.tsx en entier**

  Identifier : point d'entrée vers la création manuelle, découvrabilité du bouton "nouveau", état vide (0 recettes).

- [ ] **Étape 2 : Lire RecipeEdit.tsx en entier**

  Identifier : structure du formulaire, ordre des champs, longueur de la page, feedback de sauvegarde, gestion des erreurs de validation.

- [ ] **Étape 3 : Lire ImageUploader.tsx, IngredientEditor.tsx, StepsEditor.tsx**

  Identifier : ergonomie des sous-composants d'édition sur mobile, cohérence visuelle entre eux.

- [ ] **Étape 4 : Remplir la grille J2**

  Même format que Task 1.

---

### Task 3 : Évaluation J3 — Cuisiner une recette

**Écrans :** `src/pages/RecipeDetail.tsx`, `src/components/recipes/IngredientChecklist.tsx`, `src/components/recipes/CookingAssistantButton.tsx`

- [ ] **Étape 1 : Lire RecipeDetail.tsx (focus sur le mode cuisson)**

  Identifier : comment l'utilisateur passe en "mode cuisson", la liste d'ingrédients cochable, la navigation étape par étape, le bouton assistant cuisson.

- [ ] **Étape 2 : Lire IngredientChecklist.tsx et CookingAssistantButton.tsx**

  Identifier : interaction tactile de la checklist, ouverture de l'assistant (sheet), ergonomie à une main.

- [ ] **Étape 3 : Remplir la grille J3**

  Même format que Task 1.

---

## Chunk 2 : Revue statique des parcours J4–J6 + PWA

### Task 4 : Évaluation J4 — Planifier les repas de la semaine

**Écrans :** `src/pages/MealPlanning.tsx`, `src/components/meal-planning/` (tous les fichiers)

- [ ] **Étape 1 : Lire MealPlanning.tsx et tous les composants dans `src/components/meal-planning/`**

  Identifier : comment on accède au planning (navigation), la structure de la semaine, la sélection des recettes, la validation/sauvegarde du plan.

- [ ] **Étape 2 : Remplir la grille J4**

  Même format que Task 1, avec D3 focalisé sur : est-ce qu'on peut planifier une semaine complète sans friction ?

---

### Task 5 : Évaluation J5 — Partager une recette + réception

**Écrans :** `src/pages/RecipeDetail.tsx`, `src/components/recipes/ShareRecipeDialog.tsx`, `src/pages/Auth.tsx`, `supabase/functions/share-recipe/`, `supabase/functions/claim-shares/`

- [ ] **Étape 1 : Lire ShareRecipeDialog.tsx**

  Identifier : comment on initie le partage, ce qu'on saisit (email ?), le feedback de confirmation.

- [ ] **Étape 2 : Lire Auth.tsx**

  Identifier : l'expérience d'un nouveau destinataire (inscription/connexion), clarté du contexte ("tu as reçu une recette de X").

- [ ] **Étape 3 : Lire share-recipe et claim-shares (index.ts de chaque fonction)**

  Identifier : le mécanisme de liaison (token ? email ?), les cas d'erreur exposés à l'UI.

- [ ] **Étape 4 : Remplir la grille J5**

  Même format, avec D3 focalisé sur la simplicité pour un destinataire non-utilisateur.

---

### Task 6 : Évaluation J6 — Retrouver une recette existante

**Écrans :** `src/pages/Dashboard.tsx`, `src/components/recipes/FilterBar.tsx`

- [ ] **Étape 1 : Lire FilterBar.tsx**

  Identifier : les filtres disponibles (saison, statut, favoris, recherche texte), leur ergonomie sur mobile, la visibilité sans scroll.

- [ ] **Étape 2 : Remplir la grille J6**

  Même format. D3 : est-ce qu'un utilisateur avec 50 recettes peut retrouver ce qu'il cherche en moins de 10 secondes ?

---

### Task 7 : Évaluation D4 — Comportement PWA

**Fichiers :** `vite.config.ts`, `public/manifest.json` (ou équivalent), `src/main.tsx`, tout fichier de service worker généré.

- [ ] **Étape 1 : Lire vite.config.ts**

  Identifier : configuration de vite-plugin-pwa (workbox, manifest inline, stratégies de cache).

- [ ] **Étape 2 : Chercher le manifest PWA**

  Commande : `find /Users/gaspar/Documents/Perso/recipe-hug/public -name "*.json" -o -name "*.webmanifest"` et lire le résultat.

- [ ] **Étape 3 : Remplir la grille D4**

  ```
  Critère                          | Statut | Notes
  Manifest complet (icônes, name…) |        |
  Service worker actif             |        |
  Stratégie de cache définie       |        |
  Comportement offline documenté   |        |
  Prompt d'installation            |        |
  ```

---

## Chunk 3 : Revue visuelle + Livrable final

### Task 8 : Revue visuelle des écrans clés

- [ ] **Étape 1 : Lancer l'app en local**

  Commande : `cd /Users/gaspar/Documents/Perso/recipe-hug && npm run dev`

- [ ] **Étape 2 : Capturer les écrans dans leurs états principaux via Playwright**

  Pour chaque écran listé ci-dessous, prendre une capture mobile (390×844) :
  - Home — état vide (0 messages)
  - Home — état avec conversation active
  - Dashboard — état vide (0 recettes)
  - Dashboard — état avec recettes et filtres
  - RecipeDetail — état chargé
  - RecipeEdit — formulaire vide
  - MealPlanning — état initial
  - Auth — formulaire de connexion

  Commande Playwright (exemple) :
  ```bash
  npx playwright screenshot --viewport-size="390,844" http://localhost:5173/home
  ```

- [ ] **Étape 3 : Pour chaque problème 🔴 ou ⚫ identifié en phase statique**

  Générer une alternative visuelle dans le navigateur du visual companion (http://localhost:63143) montrant le problème vs. la correction proposée.

---

### Task 9 : Rédaction du livrable final

**Fichier à créer :** `docs/superpowers/audits/2026-03-14-design-audit.md`

- [ ] **Étape 1 : Créer le fichier avec l'en-tête**

  ```markdown
  # Audit design — recipe-hug
  *Date : 2026-03-14 | Méthode : revue hybride parcours × dimensions*
  ```

- [ ] **Étape 2 : Écrire le tableau de sévérité global**

  Colonnes : Parcours | Écran | D1 UX | D2 Visuel | D3 Fonctionnel | D4 PWA | Notes.
  Une ligne par écran par parcours. Utiliser les emojis 🟢/🟡/🔴/⚫.

- [ ] **Étape 3 : Écrire la synthèse par parcours**

  Un paragraphe par J1–J6 : points forts + points faibles principaux.

- [ ] **Étape 4 : Écrire les recommandations priorisées**

  Format :
  ```markdown
  ### ⚫ Bloquant
  - **[Écran] — [Problème]** : [Description] → [Suggestion de correction]

  ### 🔴 Majeur
  - ...

  ### 🟡 Mineur
  - ...
  ```

- [ ] **Étape 5 : Relire et vérifier la cohérence**

  Vérifier que chaque recommandation est liée à un problème dans le tableau, et que la sévérité est cohérente entre le tableau et les recommandations.

- [ ] **Étape 6 : Commit**

  ```bash
  cd /Users/gaspar/Documents/Perso/recipe-hug
  git add docs/superpowers/audits/2026-03-14-design-audit.md
  git commit -m "docs: audit design complet recipe-hug"
  ```
