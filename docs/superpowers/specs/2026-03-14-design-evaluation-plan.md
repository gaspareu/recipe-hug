# Plan d'évaluation design — recipe-hug

## Contexte

App de gestion de recettes, PWA mobile-first, usage famille + partage externe. Évaluation lancée sans a priori — regard neuf sur l'ensemble de l'app.

**Objectif :** audit complet couvrant UX & navigation, cohérence visuelle, adéquation fonctionnelle et comportement PWA.

---

## Approche

Hybride parcours × dimensions : les parcours servent de fil conducteur, chaque écran est évalué selon 4 dimensions simultanément. Le résultat est un tableau écran × dimension × sévérité, suivi d'une liste de recommandations priorisées.

---

## Parcours utilisateurs à évaluer

| # | Parcours | Écrans impliqués |
|---|----------|-----------------|
| J1 | Créer une recette via le chat IA | Home (contient le chat IA) → confirmation de sauvegarde → RecipeDetail |
| J2 | Ajouter une recette manuellement / depuis une photo | Dashboard → RecipeEdit → sauvegarde |
| J3 | Cuisiner une recette | Dashboard → RecipeDetail → mode étape par étape → assistant cuisson (sheet dans RecipeDetail) |
| J4 | Planifier les repas de la semaine | Nav → MealPlanning → validation |
| J5 | Partager une recette + réception | RecipeDetail → ShareRecipeDialog → Auth (inscription/connexion destinataire) → claim → RecipeDetail |
| J6 | Retrouver une recette existante | Dashboard → filtres (saison, statut, favoris, recherche) → RecipeDetail |

*Note : la page Auth est intégrée dans J5 (le destinataire d'un partage doit se connecter ou s'inscrire pour réclamer la recette).*

---

## Dimensions d'évaluation

### D1 — UX & Navigation
- La navigation vers l'écran est-elle évidente ?
- Le retour en arrière est-il clair ?
- Les actions principales sont-elles visibles sans scroller ?
- Les états (chargement, erreur, vide) sont-ils gérés ?
- L'app est-elle utilisable à une main sur mobile ?
- Les gestes (swipe) sont-ils cohérents et découvrables ?

### D2 — Cohérence visuelle
- Hiérarchie typographique lisible (tailles, poids, couleurs)
- Espacement et densité adaptés au mobile
- Composants cohérents entre les écrans (boutons, cards, badges)
- Thème clair/sombre fonctionnel partout
- Images et placeholders de qualité homogène

### D3 — Adéquation fonctionnelle
- Le parcours couvre-t-il le besoin de bout en bout ?
- Les fonctionnalités importantes sont-elles accessibles sans friction ?
- Y a-t-il des fonctionnalités manquantes pour un usage famille ?
- Le partage de recettes est-il suffisamment simple pour un destinataire non-utilisateur ?

### D4 — Comportement PWA *(évaluation statique uniquement — code et manifest)*
- Manifest configuré correctement (icônes, nom, display, theme_color)
- Service worker actif avec stratégie de cache pour les assets statiques
- Comportement offline défini (message d'erreur ou cache des recettes)
- Prompt d'installation disponible sur mobile

---

## Système de notation

| Niveau | Signification |
|--------|--------------|
| 🟢 OK | Aucun problème |
| 🟡 Mineur | Irritant, mais pas bloquant |
| 🔴 Majeur | Frein à l'usage ou confusion réelle |
| ⚫ Bloquant | L'utilisateur ne peut pas accomplir son objectif |

---

## Méthode d'exécution

**Phase 1 — Revue statique (code)**
Analyse du code source écran par écran : composants, gestion des états, logique de navigation, accessibilité mobile, configuration PWA (vite.config, manifest, service worker).

**Phase 2 — Revue visuelle (rendu live)**
Rendu des écrans clés via le navigateur (app lancée en local avec `npm run dev`). Captures des écrans dans les états principaux (vide, chargé, erreur). Comparaisons côte à côte générées dans le navigateur lorsqu'une alternative est proposée pour un problème identifié.

---

## Livrable attendu

Un document markdown contenant :
1. **Tableau de sévérité** : chaque écran × chaque dimension × niveau de sévérité + description du problème
2. **Synthèse par parcours** : un paragraphe résumant les points forts et points faibles de chaque J1–J6
3. **Recommandations priorisées** : classées par sévérité (⚫ → 🔴 → 🟡), avec suggestion de correction pour chaque problème majeur ou bloquant
