# Écran 2 — Détail recette : mise en page éditoriale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner la fiche recette sur la maquette : hero image sans titre incrusté, **bloc éditorial titre + description sous l'image**, **suppression de la rangée de badges** (statut/saison/nutrition/score), cartes ingrédients/étapes au style de la maquette, CTA « Commencer à cuisiner » — **sans perdre** les fonctions actuelles (favoris, menu d'actions, historique de versions, analyse IA, génération d'image, mode cuisson).

**Architecture :** Extraire un composant présentationnel testable `RecipeDetailHeader` (titre serif + description). Rendre l'overlay de titre de `RecipeImageDisplay` optionnel (`showTitleOverlay`, défaut `true` pour ne rien casser ailleurs) et le désactiver sur la fiche. Retirer le bloc badges de `RecipeDetail`. Habiller les sections ingrédients/étapes au style maquette. Le reste de la logique de la page (hooks, actions) est inchangé.

**Tech Stack :** React 18 + TypeScript, Vitest + Testing Library, Tailwind + shadcn/ui.

**Portée de CE plan :** fiche détail uniquement (`/recipes/:id`). Écran Assistant = livré (PR #96). Mode cuisson (écran 3) = plan séparé.

**Décisions verrouillées (arbitrage) :**
- Badges statut/saison/nutrition/score : **retirés** de la fiche.
- Titre : **sous l'image** (éditorial, serif, aligné à gauche) + courte description (`ai_summary`).
- Favoris, menu d'actions (analyse + génération image), historique de versions, CTA cuisson : **conservés**.
- CTA : libellé **« Commencer à cuisiner »** (aujourd'hui « Cuisiner »).

**⚠️ Décision OUVERTE — cochage des étapes sur la fiche :** la maquette rend les étapes **cochables**. Or `RecipeStepsList` est **volontairement en lecture seule** (« la cuisson interactive se fait dans le mode cuisine » — cf. commentaire du composant), pour ne pas dupliquer le mode cuisson. **Défaut retenu dans ce plan : garder les étapes en lecture seule** et n'adopter que l'habillage visuel de la maquette (carte, titre serif). Si le propriétaire veut le cochage sur la fiche, c'est une extension mineure (réutiliser le pattern `useIngredientChecklist`) — à confirmer avant Task 4.

---

## File Structure

**Créés :**
- `src/components/recipes/RecipeDetailHeader.tsx` — bloc éditorial titre + description.
- `src/components/recipes/RecipeDetailHeader.test.tsx` — tests de rendu.

**Modifiés :**
- `src/components/recipes/RecipeImageDisplay.tsx` — prop `showTitleOverlay?: boolean` (défaut `true`).
- `src/components/recipes/RecipeImageDisplay.test.tsx` — **étendre** (le fichier EXISTE déjà : helper `renderRecipeImageDisplay` + 4 tests dont « affiche le titre sur l'image » qui couvre le défaut) : ajouter le test du masquage.
- `src/pages/RecipeDetail.tsx` — retrait des badges, insertion de `RecipeDetailHeader`, `showTitleOverlay={false}`, habillage des sections, wording CTA.
- `src/components/recipes/RecipeStepsList.tsx` — habillage carte/typo (rendu inchangé côté données).

---

## Task 1 : Composant `RecipeDetailHeader` (titre + description)

**Files:**
- Create: `src/components/recipes/RecipeDetailHeader.tsx`
- Test: `src/components/recipes/RecipeDetailHeader.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// src/components/recipes/RecipeDetailHeader.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecipeDetailHeader } from './RecipeDetailHeader';

describe('RecipeDetailHeader', () => {
  it('affiche le titre en niveau 1', () => {
    render(<RecipeDetailHeader title="Buddha bowl printanier" description="Un bol complet." />);
    expect(screen.getByRole('heading', { level: 1, name: 'Buddha bowl printanier' })).toBeInTheDocument();
  });

  it('affiche la description quand elle est fournie', () => {
    render(<RecipeDetailHeader title="X" description="Frais et rassasiant." />);
    expect(screen.getByText('Frais et rassasiant.')).toBeInTheDocument();
  });

  it('n’affiche pas de paragraphe de description quand elle est absente', () => {
    const { container } = render(<RecipeDetailHeader title="X" description={null} />);
    expect(container.querySelector('p')).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer — échec attendu**

Run: `npm run test:run -- src/components/recipes/RecipeDetailHeader.test.tsx`
Expected: FAIL (composant introuvable).

- [ ] **Step 3 : Implémenter**

```tsx
// src/components/recipes/RecipeDetailHeader.tsx
interface RecipeDetailHeaderProps {
  title: string;
  description?: string | null;
}

/** Bloc éditorial de la fiche recette : titre serif + courte description. */
export function RecipeDetailHeader({ title, description }: RecipeDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-solitreo text-3xl leading-tight text-foreground text-balance">
        {title}
      </h1>
      {description && (
        <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4 : Lancer — passe**

Run: `npm run test:run -- src/components/recipes/RecipeDetailHeader.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/components/recipes/RecipeDetailHeader.tsx src/components/recipes/RecipeDetailHeader.test.tsx
git commit -m "feat: bloc éditorial RecipeDetailHeader (titre + description)"
```

---

## Task 2 : Overlay de titre optionnel dans `RecipeImageDisplay`

**Files:**
- Modify: `src/components/recipes/RecipeImageDisplay.tsx`
- Modify: `src/components/recipes/RecipeImageDisplay.test.tsx` — **le fichier EXISTE déjà**. L'étendre, ne pas le recréer.

- [ ] **Step 1 : Étendre le test existant — échec attendu**

Le fichier a déjà un helper `renderRecipeImageDisplay(props)` (props par défaut complètes, dont `onImageChange`/`onImageRemove` mockées — requises par le composant) et un test « affiche le titre sur l'image » qui couvre le comportement par défaut. **Ajouter uniquement** le test de masquage, via le helper :

```tsx
// ajout dans le describe existant de RecipeImageDisplay.test.tsx
it("masque le titre en overlay quand showTitleOverlay={false}", () => {
  renderRecipeImageDisplay({ title: "Crème brûlée", showTitleOverlay: false });
  expect(screen.queryByText("Crème brûlée")).toBeNull();
});
```

(NB : le titre reste dans l'attribut `alt` de l'image — `queryByText` ne matche pas les attributs, l'assertion est donc valide.)

- [ ] **Step 2 : Lancer — échec attendu**

Run: `npm run test:run -- src/components/recipes/RecipeImageDisplay.test.tsx`
Expected: FAIL — d'abord une erreur TS (`showTitleOverlay` inconnu des props), puis le titre s'afficherait quand même.

- [ ] **Step 3 : Implémenter**

Dans `RecipeImageDisplay.tsx` : ajouter `showTitleOverlay?: boolean` à l'interface de props (défaut `true`), et remplacer la condition d'affichage du titre `title && !isHovered && !isBusy` par `title && showTitleOverlay && !isHovered && !isBusy`.

```tsx
interface RecipeImageDisplayProps {
  // …props existantes…
  showTitleOverlay?: boolean;
}

export function RecipeImageDisplay({ /* …, */ showTitleOverlay = true, /* … */ }: RecipeImageDisplayProps) {
  // …
  {title && showTitleOverlay && !isHovered && !isBusy && (
    // …bloc h2 overlay inchangé…
  )}
}
```

- [ ] **Step 4 : Lancer — passe**

Run: `npm run test:run -- src/components/recipes/RecipeImageDisplay.test.tsx`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/components/recipes/RecipeImageDisplay.tsx src/components/recipes/RecipeImageDisplay.test.tsx
git commit -m "feat: overlay de titre optionnel dans RecipeImageDisplay"
```

---

## Task 3 : Fiche `RecipeDetail` — retrait des badges, header éditorial, CTA

**Files:**
- Modify: `src/pages/RecipeDetail.tsx`

- [ ] **Step 1 : Désactiver l'overlay + insérer le header éditorial**

Passer `showTitleOverlay={false}` à `<RecipeImageDisplay>` (l'image reste, sans titre incrusté). Juste sous le bloc image (`</motion.div>`), insérer :

```tsx
<RecipeDetailHeader title={recipe.title} description={recipe.ai_summary} />
```

(Ajouter l'import `import { RecipeDetailHeader } from '@/components/recipes/RecipeDetailHeader';`.)

- [ ] **Step 2 : Retirer la rangée de badges**

Supprimer le bloc `<div className="relative">…</div>` contenant `RecipeStatusSelect`, saison, `nutrition_tags`, `calorie_score` (le bloc « Badges : statut → saison → nutrition → score »), ainsi que le paragraphe `recipe.ai_summary` désormais rendu par le header.

Nettoyer le code mort qui en découle (sinon erreurs lint `no-unused-vars`) :
- la fonction `handleStatusChange` (seule consommatrice : `RecipeStatusSelect`) ;
- les imports `RecipeStatusSelect`, `Badge`, `Separator`, `Leaf` et le type `RecipeStatus` (seule utilisation : `handleStatusChange`) ;
- **garder** `updateRecipe` (toujours utilisé par l'upload d'image et l'analyse) et `toast`.

Vérifier au typecheck + lint.

**Note (perte fonctionnelle assumée, décision verrouillée) :** la fiche perd le changement rapide de statut ; le statut reste modifiable via la page d'édition (`RecipeEdit`, champ « Statut »). `RecipeStatusSelect` n'a plus aucun consommateur hors tests — le composant et son test peuvent rester (utilisés nulle part ailleurs, suppression possible en suivi si souhaité).

- [ ] **Step 3 : Wording CTA**

Dans le CTA fixe en bas, remplacer le libellé `Cuisiner` par `Commencer à cuisiner` (garder l'icône `ChefHat` et le comportement `setCooking(true)`).

- [ ] **Step 4 : Typecheck + tests**

Run: `npm run typecheck 2>&1 | grep -cE "error TS"` → doit rester **0**.
Run: `npm run test:run` → 0 échec (aucun test ne visait les badges ; sinon adapter).

- [ ] **Step 5 : Vérif visuelle**

Run: `npm run dev`, ouvrir une recette : image sans titre incrusté, titre+description éditoriaux dessous, plus de badges, CTA « Commencer à cuisiner », favoris/menu/historique toujours présents.

- [ ] **Step 6 : Commit**

```bash
git add src/pages/RecipeDetail.tsx
git commit -m "feat: fiche détail — header éditorial, retrait des badges, CTA cuisson"
```

---

## Task 4 : Habillage des sections ingrédients / étapes (style maquette)

**⚠️ Ne PAS ajouter le cochage des étapes** sans confirmation (voir décision ouverte en tête de plan).

**Files:**
- Modify: `src/components/recipes/RecipeStepsList.tsx`
- Modify: `src/pages/RecipeDetail.tsx` (styles de `Card` des sections si besoin)

- [ ] **Step 1 : Aligner l'habillage sur la maquette**

Maquette : cartes arrondies (`rounded-2xl`), titres de section en serif (`font-solitreo`), fond `bg-card`, bordure `border-border`. Ajuster les `Card`/titres des sections « Ingrédients » et « Étapes » dans `RecipeDetail.tsx` pour ce style (sans changer le contenu ni la logique de `IngredientChecklistWithHeader`, déjà cochable). `RecipeStepsList` : conserver la liste ordonnée en lecture seule ET la structure `ol`/`li` (le test existant `RecipeStepsList.test.tsx` s'appuie sur `getAllByRole('listitem')`), harmoniser typo/espacement avec la maquette.

- [ ] **Step 2 : Tests + typecheck**

Run: `npm run test:run -- src/components/recipes` → 0 échec.
Run: `npm run typecheck 2>&1 | grep -cE "error TS"` → 0.

- [ ] **Step 3 : Commit**

```bash
git add src/components/recipes/RecipeStepsList.tsx src/pages/RecipeDetail.tsx
git commit -m "style: cartes ingrédients/étapes de la fiche au style maquette"
```

---

## Task 5 : Garde-fou qualité + PR

- [ ] **Step 1 : `/check`** (tests 0 échec, typecheck 0, lint 0 vs baseline).
- [ ] **Step 2 : `/pre-pr`** (revue simplify + correctness + sécurité).
- [ ] **Step 3 : PR** via le skill `git-github` (français, résumé + plan de test). Pas d'edge function touchée ici → pas de redéploiement.

---

## Self-Review (à exécuter avant de coder)

1. **Couverture spec :** badges retirés (T3) ✓ ; titre+description éditoriaux sous l'image (T1/T2/T3) ✓ ; cartes ingrédients/étapes au style maquette (T4) ✓ ; CTA « Commencer à cuisiner » (T3, cohérent avec la carte du chat et l'E2E existant) ✓ ; favoris/menu/historique conservés (aucune suppression planifiée) ✓ ; cochage étapes = **décision ouverte, non implémentée par défaut** (flag en tête) ✓.
2. **Placeholders :** aucun — code complet pour T1/T2 ; edits précis (fichier + repère) pour T3/T4.
3. **Cohérence des types :** `RecipeDetailHeader` (props `title`/`description`) défini T1 et utilisé T3 ; `showTitleOverlay` défini T2 et utilisé T3.
4. **Pièges vérifiés contre le code réel :** `RecipeImageDisplay.test.tsx` existe déjà (helper à réutiliser — le test proposé initialement ne compilait pas, props requises manquantes) ; `handleStatusChange` + type `RecipeStatus` deviennent morts en T3 (lint) ; statut toujours modifiable via `RecipeEdit` ; aucun test E2E ne cible le CTA « Cuisiner » de la fiche ; `RecipeStepsList.test.tsx` dépend des rôles `listitem` (structure `ol`/`li` à conserver en T4).
