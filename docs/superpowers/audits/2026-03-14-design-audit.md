# Audit design — recipe-hug
*Date : 2026-03-14 | Méthode : revue hybride parcours × dimensions*

---

## Tableau de sévérité global

| Parcours | Écran | D1 UX | D2 Visuel | D3 Fonctionnel | Notes |
|----------|-------|-------|-----------|----------------|-------|
| J1 | Home | 🟡 | 🟢 | 🟢 | Safe areas bottom manquants, header absolu occulte premiers messages |
| J1 | ChatInterface | 🟡 | 🟢 | 🟡 | Pending recipe bar sans animation, voice affordance floue |
| J1 | RecipeDetail | 🟡 | 🟢 | 🟢 | Back button peu contrasté au chargement image |
| J2 | Dashboard | 🟢 | 🟢 | 🟢 | — |
| J2 | RecipeEdit | 🟡 | 🟡 | 🟡 | Page longue, colonnes compressées mobile, pas de confirmation abandon |
| J2 | ImageUploader | 🟢 | 🟢 | 🔴 | Composant orphelin — flux photo inexistant dans l'app |
| J2 | IngredientEditor | 🔴 | 🟡 | 🟡 | 5 champs par ligne inutilisable à 390px, catégorie masquée sans alternative |
| J2 | StepsEditor | 🟡 | 🟢 | 🟢 | Grip icon affiché, drag-drop non implémenté |
| J3 | RecipeDetail (cuisson) | 🟡 | 🟢 | 🟡 | Pas de mode cuisson dédié, handleAdvanceStep non exposé |
| J3 | IngredientChecklist | 🟢 | 🟢 | 🟡 | État non persisté (rechargement = reset) |
| J3 | CookingAssistantButton | 🔴 | 🟡 | 🟡 | Label invisible sur mobile (hidden sm:inline), tooltip inaccessible au touch |
| J4 | MealPlanning | 🔴 | 🟢 | 🔴 | Ajout de repas impossible depuis l'interface ; suppression via hover invisible sur mobile |
| J4 | GroceryListSheet | 🟢 | 🟢 | 🟡 | Quantités identiques non additionnées |
| J5 | ShareRecipeDialog | 🔴 | 🟢 | 🔴 | Aucun feedback succès/erreur, erreurs de validation non affichées |
| J5 | Auth (destinataire) | 🟡 | 🟢 | 🔴 | Aucun contexte pour le destinataire non-utilisateur |
| J5 | Flux claim (backend) | — | — | ⚫ | `claim-shares` jamais déclenché ; `listUsers()` non paginé (tous les users chargés) |
| J6 | Dashboard (recherche) | 🟢 | 🟢 | 🟡 | Recherche titre uniquement, pas de tri, vue galerie uniquement |
| J6 | FilterBar | 🟢 | 🟢 | 🟡 | Reset partiel (search non réinitialisé par clearAllFilters) |
| D4 | PWA — Manifest | — | — | 🟡 | Purpose "any maskable" fusionné, screenshots absents |
| D4 | PWA — Offline | — | — | 🟡 | Pas d'indicateur réseau dans l'UI |
| D4 | PWA — Install | — | — | 🟡 | Aucun prompt in-app, installation iOS non guidée |

---

## Synthèse par parcours

**J1 — Créer une recette via le chat IA**
Point fort majeur : le parcours est complet et fluide bout en bout. La ChatInterface est bien construite avec swipe navigation découvrable, markdown lisible, suggestions dynamiques et gestion de la recette en attente. Les problèmes sont tous mineurs : safe areas bottom à corriger, animation manquante sur la barre de confirmation, et affordance vocale perfectible. C'est le parcours le plus solide de l'app.

**J2 — Ajouter une recette manuellement / depuis une photo**
Ce parcours a deux problèmes sérieux : l'ImageUploader est développé mais jamais intégré dans l'interface (le flux photo n'existe pas), et l'IngredientEditor est inutilisable à 390px avec ses 5 champs sur une ligne. Pour une app dont un des arguments est la création par photo, l'absence d'accès à cette feature est un manque notable. La correction de l'IngredientEditor est urgente pour tout usage mobile réel.

**J3 — Cuisiner une recette**
L'expérience de cuisson souffre d'un problème d'affordance majeur : le bouton de l'assistant cuisson n'a pas de label visible sur mobile. L'utilisateur voit une icône ronde sans texte et doit deviner. En dehors de ça, la checklist d'ingrédients est bien conçue mais son état non persisté pénalise les cuisiniers interrompus. L'absence de mode cuisson dédié (masquant métadonnées et image pour se concentrer sur les étapes) est un manque de confort notable.

**J4 — Planifier les repas de la semaine**
Le planning est actuellement une page en lecture seule : on ne peut pas ajouter un repas directement, tout passe par l'assistant IA. C'est une friction majeure pour les cas d'usage simples ("je veux noter pizza vendredi"). Le bouton de suppression est invisible sur mobile (hover-only). Ces deux problèmes font de ce parcours le moins utilisable de l'app sur mobile.

**J5 — Partager une recette + réception**
La feature de partage existe mais est cassée pour le cas clé : partager avec un non-utilisateur. `claim-shares` n'est jamais déclenché après la connexion d'un nouveau compte, donc les recettes partagées en attente restent bloquées indéfiniment. L'expérience du destinataire est aussi incomplète (aucun contexte à l'arrivée sur Auth). Côté backend, `listUsers()` sans pagination est un problème de scalabilité à corriger avant toute montée en charge.

**J6 — Retrouver une recette existante**
La recherche fonctionne et les filtres sont visuellement clairs. La principale limitation est la recherche limitée au titre : avec 50 recettes, un utilisateur cherchant par ingrédient ou tag ne trouvera pas ce qu'il cherche. L'absence de tri et de vue liste complique la navigation dans un grand catalogue. Ce parcours est fonctionnel pour un petit nombre de recettes, mais ne passera pas à l'échelle sans améliorations.

---

## Recommandations priorisées

### ⚫ Bloquant

- **Flux claim (backend) — `claim-shares` jamais déclenché** : Les recettes partagées avec des non-utilisateurs restent bloquées à `pending` indéfiniment. Appeler `supabase.functions.invoke('claim-shares')` dans le handler post-login de `useAuth` après confirmation que `user` est défini.

- **share-recipe — `listUsers()` non paginé** : L'edge function charge la totalité des comptes Supabase en mémoire pour vérifier un email. Remplacer par `adminClient.from('profiles').select('id').eq('email', identifier).single()`.

### 🔴 Majeur

- **IngredientEditor — Layout inutilisable sur mobile** : 5 champs sur une ligne à 390px. Passer en layout colonne sur mobile : Nom (full-width) / Qté + Unité (50/50) / Catégorie / Supprimer.

- **ImageUploader — Composant orphelin** : Le flux "créer depuis photo" est développé mais pas accessible. Intégrer dans RecipeEdit avec un choix "Manuel / Photo" à l'entrée du formulaire.

- **CookingAssistantButton — Label invisible sur mobile** : Retirer `hidden sm:inline` sur le label du bouton. Afficher a minima le compteur d'étape `(x/y)` même sur petit écran.

- **MealPlanning — Ajout direct de repas impossible** : Rendre les cellules jour/repas tappables pour ouvrir un mini-formulaire (sélecteur de recette existante ou texte libre).

- **MealPlanning — Suppression via hover invisible sur mobile** : Le bouton de suppression n'est pas accessible au touch (`opacity-0 group-hover`). Utiliser un swipe-to-delete ou un bouton toujours visible avec `toast` "Annuler".

- **ShareRecipeDialog — Aucun feedback succès/erreur** : Ajouter `toast.success` / `toast.error` dans `handleShare`. Afficher les erreurs de validation zod sous le champ input.

- **Auth (destinataire) — Parcours de réception non guidé** : Ajouter un paramètre d'URL au lien de partage (`?share=pending&from=X`) pour personnaliser le message d'accueil sur Auth et déclencher `claim-shares` immédiatement après inscription.

### 🟡 Mineur

- **Home — Safe areas bottom manquants** : Ajouter `pb-[env(safe-area-inset-bottom)]` au conteneur du chat pour que le dernier message ne soit pas caché sous le home indicator iOS.

- **ChatInterface — Pending recipe bar sans animation** : Envelopper la barre de confirmation dans un `AnimatePresence` + `motion.div` pour rendre le changement d'état perceptible.

- **RecipeEdit — Longueur excessive sur mobile** : Regrouper les sections en collapsibles (Infos de base / Ingrédients / Étapes / Tags) ou en multi-step form.

- **RecipeEdit — Pas de confirmation avant abandon** : Afficher un dialog "Quitter sans enregistrer ?" si modifications non sauvegardées et retour arrière déclenché.

- **IngredientChecklist — État non persisté** : Persister l'état dans `sessionStorage` avec la clé `recipe-{id}-checklist`.

- **RecipeDetail — `handleAdvanceStep` non exposé** : Ajouter un bouton "Étape suivante" accessible depuis la vue cuisson qui appelle cette fonction.

- **StepsEditor — Grip icon sans drag-drop** : Implémenter le drag-drop (ex: dnd-kit) ou retirer l'icône. Ajouter boutons ↑/↓ en alternative mobile.

- **FilterBar — Reset partiel** : Faire remonter le reset de `search` dans `clearAllFilters` via callback.

- **FilterBar — Recherche limitée au titre** : Étendre aux `ingredients[].name` et `ai_summary`.

- **Dashboard — Aucun tri** : Ajouter un sélecteur de tri (A-Z, plus récentes, favoris en tête).

- **GroceryListSheet — Quantités non additionnées** : Additionner les quantités numériques de même unité dans `aggregateIngredients`.

- **PWA — Purpose "any maskable" fusionné** : Séparer en deux entrées distinctes par icône dans le manifest.

- **PWA — Aucun indicateur réseau** : Afficher un bandeau discret en mode offline et désactiver les mutations avec message explicatif.

- **PWA — Aucun prompt d'installation** : Implémenter `useRegisterSW` ou une bannière contextuelle "Installer l'app" sur mobile, avec guide spécifique iOS.

- **ShareRecipeDialog — Onglet téléphone sans SMS** : Clarifier si le partage par téléphone déclenche un vrai SMS. Sinon, retirer l'onglet pour éviter une attente non fondée.

---

## Points forts à conserver

- Navigation swipe entre Home ↔ Dashboard fluide et découvrable
- ChatInterface : textarea auto-resize, suggestions dynamiques, markdown lisible
- RecipeDetail : checklist étapes avec état visuel (cercle → coche), assistant sheet cohérent
- Auth : design épuré, Google SSO bien intégré, onglets Connexion/Inscription clairs
- PWA : stratégies de cache Workbox solides (NetworkFirst pour Supabase, CacheFirst pour fonts)
- Cohérence visuelle globale : palette, typographie, composants shadcn uniformes sur tous les écrans
