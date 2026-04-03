# Design Fixes — Plan d'implémentation
*Généré le 2026-03-17 | Source : [audit 2026-03-14](../audits/2026-03-14-design-audit.md)*

> **Pour les agents IA :** utiliser le skill `superpowers:executing-plans` pour traiter chaque ticket. Chaque ticket est indépendant et peut être traité dans sa propre MR/branche.

**Stack :** React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui, Supabase Edge Functions, TanStack Query, React Router v7, Framer Motion.

---

## Lot 1 — Bloquants (traiter en premier, MR séparées)

### TICKET-01 — `claim-shares` jamais déclenché après login

**Sévérité :** ⚫ Bloquant
**Fichiers :** `src/hooks/useAuth.tsx` (L.24-46, L.105-117)

**Contexte :** `claimPendingShares` est déjà déclarée dans `useAuth.tsx` (L.105) mais l'exploration a confirmé qu'elle est bien appelée dans `onAuthStateChange` sur l'event `SIGNED_IN`. **Vérifier si le bug est réel** : tester le flux complet (partage → inscription → claim). Si le claim ne fonctionne pas, le problème est probablement dans la edge function `claim-shares` elle-même plutôt que dans le hook.

**Étapes :**
- [ ] Lire `src/hooks/useAuth.tsx` en entier pour confirmer l'appel à `claimPendingShares`
- [ ] Lire `supabase/functions/claim-shares/index.ts` en entier
- [ ] Vérifier que `claim-shares` est bien déployée et que son CORS est configuré
- [ ] Si le hook n'appelle pas `claimPendingShares` : ajouter l'appel dans le handler `SIGNED_IN`
- [ ] Si la fonction est correcte mais non déployée : vérifier le déploiement Supabase
- [ ] Tester le flux complet : partage vers email inexistant → inscription → vérification que la recette apparaît

---

### TICKET-02 — `listUsers()` non paginé dans share-recipe

**Sévérité :** ⚫ Bloquant (scalabilité + sécurité)
**Fichiers :** `supabase/functions/share-recipe/index.ts` (L.81-96)

**Contexte :** La fonction utilise `adminClient.auth.admin.listUsers()` pour chercher un utilisateur par email. Cette méthode charge **tous les comptes** en mémoire. À remplacer par un lookup direct sur la table `profiles`.

**Étapes :**
- [ ] Lire `supabase/functions/share-recipe/index.ts` en entier
- [ ] Remplacer le bloc `listUsers` (L.87-96) par :
  ```typescript
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', identifier)
    .single();
  ```
- [ ] Adapter la logique aval qui utilise le résultat (vérifier que `profile?.id` remplace `user?.id`)
- [ ] Si la table `profiles` ne contient pas de colonne `email`, vérifier la structure et adapter (peut nécessiter de passer par `auth.users` avec un `rpc` ou une vue)
- [ ] Tester avec un email existant et un email inconnu

---

## Lot 2 — Majeurs (traiter dans cet ordre)

### TICKET-03 — IngredientEditor : layout inutilisable sur mobile

**Sévérité :** 🔴 Majeur
**Fichiers :** `src/components/recipes/IngredientEditor.tsx` (L.62-109)

**Contexte :** Chaque ligne d'ingrédient est un `flex items-center gap-2`. À 390px, les 5 champs (nom, quantité, unité, catégorie, supprimer) sont illisibles. La colonne catégorie est déjà masquée sur mobile (`hidden sm:flex`, L.89) mais sans alternative.

**Étapes :**
- [ ] Lire `src/components/recipes/IngredientEditor.tsx` en entier
- [ ] Remplacer le layout flex inline par un layout en grille responsive :
  - Mobile (`< sm`) : 2 lignes — ligne 1 : Nom (full-width) ; ligne 2 : Qté (w-20) + Unité (w-28) + bouton Supprimer
  - Desktop (`sm+`) : conserver le layout actuel en ajoutant la catégorie visible
- [ ] Retirer `hidden sm:flex` sur le Select catégorie et le positionner dans la ligne mobile
- [ ] Vérifier que le bouton de suppression reste accessible (touch target ≥ 44px)
- [ ] Tester sur viewport 390px (iPhone 14) et 768px (tablette)

---

### TICKET-04 — ImageUploader : composant orphelin

**Sévérité :** 🔴 Majeur
**Fichiers :** `src/pages/RecipeEdit.tsx` (L.28-29), `src/components/recipes/ImageUploader.tsx` (complet, 143 lignes)

**Contexte :** `ImageUploader` est développé et fonctionnel mais jamais importé dans `RecipeEdit.tsx`. Le flux "créer depuis photo" est absent de l'interface.

**Étapes :**
- [ ] Lire `src/pages/RecipeEdit.tsx` en entier
- [ ] Lire `src/components/recipes/ImageUploader.tsx` en entier pour comprendre ses props
- [ ] Identifier si `RecipeEdit` est utilisé pour créer ET éditer (vérifier la route et le paramètre `id`)
- [ ] Ajouter un état `creationMode: 'manual' | 'photo'` uniquement sur la création (pas sur l'édition)
- [ ] Afficher deux boutons au-dessus du formulaire en mode création : "Saisir manuellement" / "Créer depuis une photo"
- [ ] En mode `photo` : afficher `ImageUploader`, passer l'image uploadée à la logique de traitement IA existante (vérifier si `home-assistant` supporte vision — oui selon CLAUDE.md)
- [ ] Tester le flux complet : upload photo → génération recette → sauvegarde

---

### TICKET-05 — CookingAssistantButton : label invisible sur mobile

**Sévérité :** 🔴 Majeur
**Fichiers :** `src/components/recipes/CookingAssistantButton.tsx` (L.48)

**Contexte :** `<span className="hidden sm:inline">{getButtonText()}</span>` — le texte est masqué sous `sm` (< 640px). L'utilisateur voit une icône ronde sans texte.

**Étapes :**
- [ ] Lire `src/components/recipes/CookingAssistantButton.tsx` en entier
- [ ] Retirer `hidden sm:inline` sur le `<span>` du label
- [ ] Vérifier que le bouton reste lisible sur 390px (tronquer avec `truncate` si nécessaire, ou réduire le font-size)
- [ ] S'assurer que le compteur d'étape `(x/y)` est visible même sur petit écran
- [ ] Tester sur 390px et vérifier qu'il n'y a pas de débordement de layout

---

### TICKET-06 — MealPlanning : ajout direct de repas impossible

**Sévérité :** 🔴 Majeur
**Fichiers :** `src/pages/MealPlanning.tsx`

**Contexte :** Les cellules du planning ne sont pas interactives pour l'ajout. Tout passe par l'assistant IA. L.227 montre un `onClick` existant mais uniquement pour naviguer vers le détail d'une recette existante.

**Étapes :**
- [ ] Lire `src/pages/MealPlanning.tsx` en entier
- [ ] Lire les hooks associés (`useMealPlanning` ou équivalent) pour comprendre les mutations disponibles
- [ ] Ajouter un état `addingMeal: { day: string, mealType: string } | null`
- [ ] Rendre les cellules vides tappables (bouton `+` ou zone cliquable avec aria-label)
- [ ] Au tap : ouvrir un `Dialog` ou `Sheet` avec :
  - Un `Combobox` pour sélectionner une recette existante (chercher dans `useRecipes`)
  - Un champ texte libre en alternative
  - Bouton "Ajouter"
- [ ] Appeler la mutation d'ajout existante (ou créer `addMealPlanEntry` si absente)
- [ ] Tester sur mobile 390px : accessibilité touch des cellules vides

---

### TICKET-07 — MealPlanning : suppression hover-only invisible au touch

**Sévérité :** 🔴 Majeur
**Fichiers :** `src/pages/MealPlanning.tsx` (L.230)

**Contexte :** `className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5..."` — le bouton de suppression n'apparaît qu'au survol de la souris, invisible sur mobile.

**Étapes :**
- [ ] Lire `src/pages/MealPlanning.tsx` en entier (si pas déjà lu dans TICKET-06, grouper les deux MR)
- [ ] Option A (recommandée) : remplacer `opacity-0 group-hover:opacity-100` par un bouton toujours visible avec taille réduite (`h-6 w-6`, `text-muted-foreground`)
- [ ] Ajouter un toast "Repas supprimé" avec action "Annuler" (undo) via `toast` de shadcn
- [ ] Option B (alternative) : implémenter un swipe-to-delete si le composant est une liste scrollable
- [ ] Tester sur mobile : confirmer que la suppression est découvrable sans hover

> **Note :** TICKET-06 et TICKET-07 touchent le même fichier. Ils peuvent être groupés dans une seule MR "MealPlanning : interactions mobile".

---

### TICKET-08 — ShareRecipeDialog : aucun feedback succès/erreur

**Sévérité :** 🔴 Majeur
**Fichiers :** `src/components/recipes/ShareRecipeDialog.tsx` (L.25-51)

**Contexte :** `handleShare` invoque la edge function mais n'affiche ni toast de succès, ni toast d'erreur, ni messages de validation zod sous le champ input.

**Étapes :**
- [ ] Lire `src/components/recipes/ShareRecipeDialog.tsx` en entier
- [ ] Vérifier que `toast` (shadcn/sonner) est disponible dans le projet (`import { toast } from 'sonner'` ou équivalent)
- [ ] Dans `handleShare` : ajouter `toast.success("Recette partagée !")` après succès
- [ ] Dans le catch : ajouter `toast.error("Erreur lors du partage. Réessayez.")` avec message explicite
- [ ] Pour la validation zod (L.26-30) : afficher les erreurs sous le champ input avec un `<p className="text-destructive text-sm">` au lieu de les avaler silencieusement
- [ ] Fermer le dialog uniquement en cas de succès
- [ ] Tester : cas succès, cas erreur réseau, cas email invalide

---

### TICKET-09 — Auth destinataire : parcours de réception non guidé

**Sévérité :** 🔴 Majeur
**Fichiers :** `src/pages/Auth.tsx` (L.32-41), `src/hooks/useAuth.tsx` (L.105-117)

**Contexte :** Le lien de partage envoyé à un non-utilisateur arrive sur `/auth` sans contexte. L'utilisateur ne sait pas pourquoi il est là. `claim-shares` est déclenché automatiquement post-SIGNED_IN mais sans message d'accueil personnalisé.

**Étapes :**
- [ ] Lire `src/pages/Auth.tsx` en entier
- [ ] Lire `supabase/functions/share-recipe/index.ts` pour voir comment le lien de partage est construit (L.100-131)
- [ ] Modifier la génération du lien dans `share-recipe` pour ajouter `?shared_by=<prenom>&recipe=<titre>` (pas de données sensibles)
- [ ] Dans `Auth.tsx` : lire les query params `shared_by` et `recipe` via `useSearchParams`
- [ ] Si présents : afficher un bandeau contextuel `"<Prénom> t'a partagé la recette <Titre>. Crée un compte pour la voir."`
- [ ] S'assurer que `claim-shares` est bien déclenché après inscription (vérifié dans TICKET-01)
- [ ] Tester : flux complet depuis le lien reçu jusqu'à l'accès à la recette

---

## Lot 3 — Mineurs (traiter après les bloquants et majeurs)

### TICKET-10 — Home : safe areas bottom manquants

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/pages/Home.tsx` (L.34)

**Contexte :** Le conteneur utilise déjà `pt-[env(safe-area-inset-top)]` mais pas le padding bottom pour le home indicator iOS.

**Étapes :**
- [ ] Lire `src/pages/Home.tsx`, identifier le conteneur principal et le conteneur de l'input chat
- [ ] Ajouter `pb-[env(safe-area-inset-bottom)]` au conteneur wrappant l'input/barre d'action en bas
- [ ] Vérifier sur Safari iOS (ou simulateur) que le dernier message n'est pas masqué

---

### TICKET-11 — ChatInterface : pending recipe bar sans animation

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/components/chat/ChatInterface.tsx` (L.2, L.34)

**Contexte :** Framer Motion est déjà importé (L.2). La barre de confirmation de recette en attente apparaît/disparaît sans transition.

**Étapes :**
- [ ] Lire `src/components/chat/ChatInterface.tsx`, localiser le rendu conditionnel de la barre `pendingRecipe`
- [ ] Envelopper dans `<AnimatePresence>` et ajouter `<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>` sur la barre
- [ ] Vérifier que l'animation ne cause pas de layout shift sur le reste du chat

---

### TICKET-12 — RecipeEdit : pas de confirmation avant abandon

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/pages/RecipeEdit.tsx` (L.80-99)

**Contexte :** Si l'utilisateur a modifié le formulaire et appuie sur retour, les modifications sont perdues sans avertissement.

**Étapes :**
- [ ] Lire `src/pages/RecipeEdit.tsx` en entier
- [ ] Créer un état `isDirty` (ou utiliser `react-hook-form`'s `formState.isDirty` si déjà utilisé)
- [ ] Intercepter la navigation arrière avec `useBlocker` (React Router v7) si `isDirty === true`
- [ ] Afficher un `AlertDialog` : "Quitter sans enregistrer ? Vos modifications seront perdues." avec boutons "Rester" / "Quitter"
- [ ] Tester : modifier un champ → retour → dialog apparaît ; sauvegarder → retour → pas de dialog

---

### TICKET-13 — IngredientChecklist : état non persisté

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/components/recipes/IngredientChecklist.tsx` (L.23-61)

**Contexte :** L'état des cases cochées est en mémoire React (`useState`). Un rechargement de page remet tout à zéro.

**Étapes :**
- [ ] Lire `src/components/recipes/IngredientChecklist.tsx` en entier
- [ ] Dans `useIngredientChecklist`, remplacer l'initialisation du state par une lecture de `sessionStorage` :
  ```typescript
  const storageKey = `recipe-${recipeId}-checklist`;
  const [checked, setChecked] = useState<CheckedState>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    } catch { return {}; }
  });
  ```
- [ ] Dans le setter, ajouter `sessionStorage.setItem(storageKey, JSON.stringify(newState))` à chaque changement
- [ ] Vérifier que `recipeId` est bien passé en prop au hook
- [ ] Tester : cocher des ingrédients → recharger → état conservé ; naviguer vers une autre recette → état distinct

---

### TICKET-14 — RecipeDetail : `handleAdvanceStep` non exposé

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/pages/RecipeDetail.tsx` (L.107-118)

**Contexte :** `handleAdvanceStep` avance automatiquement à l'étape suivante mais n'est accessible que via l'assistant IA, pas directement dans la vue cuisson.

**Étapes :**
- [ ] Lire `src/pages/RecipeDetail.tsx` en entier pour identifier l'affichage des étapes
- [ ] Ajouter un bouton "Étape suivante →" visible en mode cuisson (sous la liste des étapes ou en position fixe bas d'écran)
- [ ] Bouton désactivé (`disabled`) quand toutes les étapes sont complétées
- [ ] Afficher le compteur `Étape x / y` à côté du bouton
- [ ] Tester : bouton avance bien d'étape en étape, se désactive à la fin

---

### TICKET-15 — StepsEditor : grip icon sans drag-drop

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/components/recipes/StepsEditor.tsx` (L.1, L.51-52)

**Contexte :** L'icône `GripVertical` est affichée mais il n'y a pas de drag-and-drop implémenté, ce qui crée une affordance trompeuse.

**Étapes :**
- [ ] Lire `src/components/recipes/StepsEditor.tsx` en entier
- [ ] **Option A (rapide) :** Retirer l'icône `GripVertical` et ajouter deux boutons ↑/↓ pour réordonner les étapes. Utiliser la logique de réordonnancement existante (L.x `map((step, i) => ({ ...step, order: i + 1 }))`)
- [ ] **Option B (complète) :** Installer `@dnd-kit/core` et `@dnd-kit/sortable`, wrapper la liste dans `<SortableContext>`, chaque étape dans `<SortableItem>`. Conserver l'icône grip.
- [ ] Recommandation : Option A pour cette MR (plus rapide, moins de dépendances), Option B en ticket séparé si nécessaire
- [ ] Tester : réordonner des étapes, vérifier que l'ordre est bien sauvegardé

---

### TICKET-16 — FilterBar : reset partiel (search non réinitialisé)

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/components/recipes/FilterBar.tsx` (L.34-38, L.75-77)

**Contexte :** `clearAllFilters()` remet à zéro status, favoris et saison, mais pas le champ `search`. L'utilisateur peut croire avoir tout réinitialisé alors que la recherche textuelle est encore active.

**Étapes :**
- [ ] Lire `src/components/recipes/FilterBar.tsx` en entier
- [ ] Lire `src/pages/Dashboard.tsx` pour comprendre comment `search` est géré (state local ou prop)
- [ ] Ajouter une prop `onSearchChange` (ou `onClearSearch`) à `FilterBar`
- [ ] Dans `clearAllFilters`, appeler `onSearchChange('')` pour vider le champ
- [ ] Vider également la valeur affichée dans l'input de recherche (controlled input)
- [ ] Tester : saisir un texte + activer un filtre → cliquer "Tout effacer" → recherche vidée

---

### TICKET-17 — FilterBar : recherche limitée au titre

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/pages/Dashboard.tsx` (L.47-50), `src/components/recipes/FilterBar.tsx`

**Contexte :** Le filtre `search` ne cherche que dans le titre de la recette. Pas dans les ingrédients ni le résumé IA.

**Étapes :**
- [ ] Lire `src/pages/Dashboard.tsx`, localiser le `useMemo` de filtrage (L.43-65)
- [ ] Étendre la condition de recherche pour inclure :
  ```typescript
  const q = search.toLowerCase();
  recipe.title.toLowerCase().includes(q) ||
  recipe.ai_summary?.toLowerCase().includes(q) ||
  recipe.ingredients?.some(i => i.name?.toLowerCase().includes(q))
  ```
- [ ] Vérifier les types de `recipe.ingredients` (tableau d'objets avec champ `name`)
- [ ] Tester : chercher un ingrédient → recettes contenant cet ingrédient apparaissent

---

### TICKET-18 — Dashboard : aucun tri

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/pages/Dashboard.tsx` (L.43-65)

**Contexte :** Les recettes s'affichent dans l'ordre de la base de données. Pas de tri accessible à l'utilisateur.

**Étapes :**
- [ ] Lire `src/pages/Dashboard.tsx` en entier
- [ ] Ajouter un état `sortBy: 'recent' | 'alpha' | 'favorites'`
- [ ] Ajouter un `Select` (shadcn) dans le header du Dashboard : "Trier par : Plus récentes / A-Z / Favoris en tête"
- [ ] Dans le `useMemo`, appliquer le tri après les filtres :
  - `recent` : sort par `created_at` desc
  - `alpha` : sort par `title` asc
  - `favorites` : favoris en premier, puis par `created_at` desc
- [ ] Tester les trois options de tri

---

### TICKET-19 — GroceryListSheet : quantités non additionnées

**Sévérité :** 🟡 Mineur
**Fichiers :** `src/components/meal-planning/GroceryListSheet.tsx` (L.22-48)

**Contexte :** `aggregateIngredients` regroupe par nom mais concatène les quantités en array au lieu de les additionner quand la même unité est utilisée.

**Étapes :**
- [ ] Lire `src/components/meal-planning/GroceryListSheet.tsx` en entier
- [ ] Dans `aggregateIngredients`, pour les ingrédients de même nom et même unité : additionner les valeurs numériques
  ```typescript
  // Quand même nom + même unité : additionner les quantités numériques
  const existingQty = existing.quantities.find(q => q.unit === ingredient.unit);
  if (existingQty && !isNaN(Number(existingQty.amount)) && !isNaN(Number(ingredient.amount))) {
    existingQty.amount = String(Number(existingQty.amount) + Number(ingredient.amount));
  } else {
    existing.quantities.push({ amount: ingredient.amount, unit: ingredient.unit });
  }
  ```
- [ ] Vérifier le type de `quantities` (array de `{ amount: string, unit: string }` ou similar)
- [ ] Gérer les quantités non-numériques (ex: "quelques", "à goût") : ne pas additionner, conserver distinctes
- [ ] Tester : planning avec 2 recettes utilisant 200g de farine → liste affiche "400g farine"

---

### TICKET-20 — PWA : manifest "any maskable" fusionné

**Sévérité :** 🟡 Mineur
**Fichiers :** `public/manifest.json` (L.15)

**Contexte :** `"purpose": "any maskable"` dans une seule entrée est déprécié. Les navigateurs modernes attendent des entrées séparées.

**Étapes :**
- [ ] Lire `public/manifest.json` en entier
- [ ] Pour chaque icône avec `"purpose": "any maskable"`, créer deux entrées :
  ```json
  { "src": "icon.png", "sizes": "...", "type": "image/png", "purpose": "any" },
  { "src": "icon-maskable.png", "sizes": "...", "type": "image/png", "purpose": "maskable" }
  ```
- [ ] Si une seule icône existe : la dupliquer (même fichier, deux entrées avec purpose distinct)
- [ ] Ajouter des `screenshots` dans le manifest (requis pour le prompt d'installation sur certains navigateurs) : 2 captures 390×844 et 1280×800
- [ ] Tester avec Lighthouse PWA audit : score installability

---

### TICKET-21 — PWA : aucun indicateur réseau offline

**Sévérité :** 🟡 Mineur
**Fichiers :** à créer : `src/hooks/useNetworkStatus.ts` + `src/components/OfflineBanner.tsx`

**Contexte :** Aucun feedback visuel quand l'utilisateur est hors ligne. Les mutations échouent silencieusement.

**Étapes :**
- [ ] Créer `src/hooks/useNetworkStatus.ts` :
  ```typescript
  export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    useEffect(() => {
      const on = () => setIsOnline(true);
      const off = () => setIsOnline(false);
      window.addEventListener('online', on);
      window.addEventListener('offline', off);
      return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);
    return isOnline;
  }
  ```
- [ ] Créer `src/components/OfflineBanner.tsx` : bandeau discret en bas d'écran (`fixed bottom-0`) avec message "Vous êtes hors ligne — certaines fonctionnalités sont indisponibles"
- [ ] Intégrer dans le layout racine (`App.tsx` ou layout principal)
- [ ] Désactiver les boutons de mutation (ajouter, enregistrer, partager) quand `!isOnline` avec `disabled` et tooltip explicatif
- [ ] Tester en mode offline dans DevTools

---

### TICKET-22 — PWA : aucun prompt d'installation

**Sévérité :** 🟡 Mineur
**Fichiers :** `vite.config.ts` (L.6, L.17-20), à créer : `src/hooks/useInstallPrompt.ts`

**Contexte :** Aucun prompt in-app pour installer la PWA. Sur iOS, l'installation n'est pas guidée.

**Étapes :**
- [ ] Créer `src/hooks/useInstallPrompt.ts` pour capturer l'event `beforeinstallprompt`
- [ ] Créer `src/components/InstallBanner.tsx` : bannière contextuelle "Installer l'app pour un accès rapide" avec bouton "Installer" (déclenche `prompt()`) et bouton "Plus tard" (dismiss + ne plus afficher pendant 7 jours via `localStorage`)
- [ ] Afficher uniquement sur mobile (media query ou user-agent) et uniquement si l'app n'est pas déjà installée (`display-mode: standalone`)
- [ ] Pour iOS (où `beforeinstallprompt` n'existe pas) : détecter Safari iOS et afficher un guide "Appuyer sur Partager → Ajouter à l'écran d'accueil"
- [ ] Intégrer dans `App.tsx` ou le layout principal
- [ ] Tester sur Chrome Android et Safari iOS

---

## Récapitulatif et ordre d'exécution

| # | Ticket | Sévérité | Effort estimé | Fichiers principaux |
|---|--------|----------|---------------|---------------------|
| 01 | claim-shares post-login | ⚫ | S | `useAuth.tsx`, `claim-shares/index.ts` |
| 02 | listUsers non paginé | ⚫ | S | `share-recipe/index.ts` |
| 03 | IngredientEditor mobile | 🔴 | M | `IngredientEditor.tsx` |
| 04 | ImageUploader orphelin | 🔴 | L | `RecipeEdit.tsx`, `ImageUploader.tsx` |
| 05 | CookingAssistantButton label | 🔴 | XS | `CookingAssistantButton.tsx` |
| 06 | MealPlanning ajout | 🔴 | L | `MealPlanning.tsx` |
| 07 | MealPlanning suppression | 🔴 | S | `MealPlanning.tsx` |
| 08 | ShareRecipeDialog feedback | 🔴 | S | `ShareRecipeDialog.tsx` |
| 09 | Auth destinataire | 🔴 | M | `Auth.tsx`, `share-recipe/index.ts` |
| 10 | Home safe-area | 🟡 | XS | `Home.tsx` |
| 11 | ChatInterface animation | 🟡 | XS | `ChatInterface.tsx` |
| 12 | RecipeEdit abandon | 🟡 | S | `RecipeEdit.tsx` |
| 13 | IngredientChecklist persistance | 🟡 | S | `IngredientChecklist.tsx` |
| 14 | handleAdvanceStep bouton | 🟡 | S | `RecipeDetail.tsx` |
| 15 | StepsEditor grip/dnd | 🟡 | M | `StepsEditor.tsx` |
| 16 | FilterBar reset search | 🟡 | S | `FilterBar.tsx`, `Dashboard.tsx` |
| 17 | Recherche étendue | 🟡 | S | `Dashboard.tsx` |
| 18 | Dashboard tri | 🟡 | S | `Dashboard.tsx` |
| 19 | GroceryList quantités | 🟡 | S | `GroceryListSheet.tsx` |
| 20 | PWA manifest | 🟡 | XS | `manifest.json` |
| 21 | PWA offline indicator | 🟡 | M | nouveau hook + composant |
| 22 | PWA install prompt | 🟡 | M | nouveau hook + composant |

**Lots suggérés pour les MRs :**
1. MR-01 : TICKET-01 + TICKET-02 (backend, bloquants)
2. MR-02 : TICKET-03 (IngredientEditor mobile)
3. MR-03 : TICKET-08 + TICKET-05 (quick wins UX, < 1h)
4. MR-04 : TICKET-06 + TICKET-07 (MealPlanning mobile)
5. MR-05 : TICKET-04 (ImageUploader intégration)
6. MR-06 : TICKET-09 (Auth destinataire)
7. MR-07 : TICKET-10 + TICKET-11 + TICKET-14 + TICKET-16 + TICKET-17 + TICKET-18 + TICKET-20 (quick wins mineurs)
8. MR-08 : TICKET-12 + TICKET-13 + TICKET-15 + TICKET-19 (mineurs avec logique)
9. MR-09 : TICKET-21 + TICKET-22 (PWA)
