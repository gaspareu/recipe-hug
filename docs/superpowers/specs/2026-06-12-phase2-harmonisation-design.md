# Phase 2 — Harmonisation UX/UI (formulaires recette, profil, planning)

**Date** : 2026-06-12
**Statut** : Validé, en attente de plan d'implémentation

## Contexte

La Phase 1 (PR #25, mergée) a posé une nouvelle identité visuelle pour l'app
"Grimoire" : chat d'accueil façon Claude (typographie `font-solitreo` pour
les titres, `font-crimson` pour le corps, palette crème/sauge/olive/jaune
doré, easings `--ease-emphasized` / `--ease-standard` dans `src/index.css`,
variants framer-motion dans `src/lib/motion.ts`) et la collection de recettes
façon Instagram (grille de cartes).

La Phase 2 étend cette identité au reste de l'app : les formulaires de
recette (création/édition), la page Profil et le Planning de repas.

## Objectif

Harmoniser visuellement les pages restantes avec l'identité Grimoire, sans
casser les flux existants. Deux pages (Profil, Planning) sont des restyles
purs (pas de changement de structure). Les formulaires recette reçoivent en
plus un changement structurel léger (sections repliables).

## Périmètre

1. `src/pages/RecipeNew.tsx` / `src/pages/RecipeEdit.tsx` — restructuration
   en sections repliables + restyle
2. `src/pages/Profile.tsx` — restyle uniquement
3. `src/pages/MealPlanning.tsx` — restyle uniquement

Hors périmètre : nouvelles fonctionnalités, changements de navigation,
modification du backend / des hooks de données.

## Section 1 — Formulaires RecipeNew / RecipeEdit

### Structure

Le formulaire actuel (`<form id="recipe-new-form">`) est un long flux
vertical : titre, portions/statut, saison, tags nutrition, éditeur
d'ingrédients, éditeur d'étapes, bouton de soumission.

Il est réorganisé en **3 sections repliables**, toutes ouvertes par défaut
(le scroll unique est conservé, seul l'aspect visuel change) :

- **Informations générales** : titre, portions, statut, saison, tags
  nutrition (regroupe les champs actuellement en l.290-373)
- **Ingrédients** : `<IngredientEditor>`
- **Étapes** : `<StepsEditor>`

Chaque section utilise le composant existant `CollapsibleSection`
(`src/components/profile/CollapsibleSection.tsx`, déjà utilisé dans
Profile.tsx), avec transition d'ouverture/fermeture sur `--ease-standard`.

### Typographie et style

- Titres de section et titre de page en `font-solitreo`
- Cartes mode-selector (choix manuel / photo, l.183-215) restylées avec les
  arrondis/ombres/couleurs de la grille de recettes (palette
  crème/sauge/olive/doré) au lieu des styles shadcn par défaut
- Bouton de soumission aligné sur le style des boutons d'action principaux
  (chat, grille)

### Animations

- Apparition des sections en fade-in-up léger au montage de la page
  (réutilisation de `pageVariants` / `messageVariants` de
  `src/lib/motion.ts` selon le cas)
- Toutes les animations respectent `useReducedMotion` (désactivées si
  l'utilisateur préfère moins de mouvement)

### Comportement inchangé

- Le flux mode `'choose' | 'manual' | 'photo'`, l'upload/parsing IA d'image,
  la validation et la soumission du formulaire ne changent pas.
- RecipeEdit suit la même structuration de sections que RecipeNew.

## Section 2 — Page Profil

Restyle uniquement, aucun changement de structure ni de navigation.

- Titres de sections (carte "Informations personnelles", "Apparence",
  et titres des `CollapsibleSection`) en `font-solitreo`
- Cartes harmonisées : mêmes rayons et ombres que les cartes de la grille
  de recettes (remplace le style shadcn par défaut `rounded-lg border
  bg-card shadow-sm`)
- Avatar : légère animation au survol (scale subtil), focus ring cohérent
  avec la palette
- `CollapsibleSection` : icônes et accents colorés alignés sur la palette
  sauge/olive plutôt que les couleurs muted-foreground génériques
- Sections concernées : "Informations personnelles", "Apparence",
  "Préférences culinaires", "Configuration IA", "Cookidoo / Thermomix",
  "Intégrations"

## Section 3 — Page Planning de repas

Restyle uniquement, aucun changement de structure ni de navigation.

- Titre de page ("Planning repas") en `font-solitreo`
- Cartes des 7 jours : arrondis/ombres cohérents avec la grille de recettes
- Carte du jour courant : remplacer le `ring-primary` générique par un
  traitement identité (fond sauge clair + bordure dorée)
- Apparition séquencée des 7 cartes au chargement (fade-in-up, délai
  ~30ms par carte), respectant `useReducedMotion`
- Dialog d'ajout de repas : inputs et focus ring restylés pour matcher
  ceux du chat d'accueil
- Boutons "Ajouter" : icône + style cohérent avec les boutons d'action de
  la grille de recettes
- Le composant `GroceryListSheet` n'est pas modifié dans cette phase sauf
  ajustements de cohérence visuelle mineurs s'ils sont triviaux

## Transversal

- Vérifier qu'aucune occurrence résiduelle de `font-playfair` / `font-display`
  ne subsiste sur les 4 pages concernées (RecipeNew, RecipeEdit, Profile,
  MealPlanning)
- Les transitions de page (`PageTransition`, `pageVariants`/`pageTransition`
  de `src/lib/motion.ts`) sont déjà branchées globalement — pas d'action
  supplémentaire requise, juste vérifier la cohérence visuelle

## Tests

- Conserver/adapter les tests existants sur RecipeNew, RecipeEdit, Profile,
  MealPlanning (changements de structure DOM dus aux `CollapsibleSection`
  sur les formulaires recette)
- Aucun nouveau test fonctionnel requis (restyle visuel), mais vérifier que
  les tests de soumission de formulaire et de rendu des pages passent
  toujours après restructuration

## Risques / points d'attention

- RecipeEdit doit recevoir la même structuration que RecipeNew pour rester
  cohérent — à traiter dans le même chantier
- Vérifier que les sections repliables n'aggravent pas l'accessibilité
  (focus, lecteurs d'écran) — `CollapsibleSection` est déjà utilisé ailleurs,
  donc son comportement est éprouvé
