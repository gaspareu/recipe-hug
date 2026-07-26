# Écran 1 — Assistant : carte recette unifiée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer, dans le chat d'accueil, le duo « prose + barre pendingRecipe + mini-carte » par **une carte recette riche unique par message**, dont les boutons dépendent de l'état DB (pas encore enregistrée → « Créer la recette » ; enregistrée → « Commencer à cuisiner » + accès détail), avec sélecteur de portions qui recalcule les quantités.

**Architecture :** L'agent `home-assistant` émet une recette **structurée** dès la proposition via un nouvel outil `propose_recipe` (titre, portions, ingrédients à quantité numérique, étapes, intro à puces, clôture, astuce). Le front attache cette carte au message assistant en état `proposed`. Le bouton « Créer la recette » persiste la recette (logique `savePendingRecipe` réutilisée) puis fait passer la carte en état `saved`. Le sélecteur de portions recalcule les quantités en local (pur), sans écriture DB après enregistrement. Les résultats de `search_recipes` sont rendus en cartes `saved` construites depuis les recettes déjà en mémoire (`useRecipes`).

**Tech Stack :** React 18 + TypeScript, TanStack Query, Vitest + Testing Library, Supabase Edge Function (Deno) `home-assistant`, Zod.

**Portée de CE plan :** écran Assistant uniquement. Le détail recette (écran 2) et le mode cuisson (écran 3) font l'objet de plans séparés. Les titres d'étapes (`Step.title`) sont traités dans le plan de l'écran 3.

**Prérequis logo — résolu :** le logo Grimoire est l'icône PWA existante `public/icons/icon-192x192.png` (confirmé par le propriétaire). Aucun fichier à ajouter.

**Décisions de conception verrouillées :**
- Portions après enregistrement : aperçu local, **aucune écriture DB** (le nombre choisi sert de portions de départ au mode cuisson).
- Intro + astuce : **structurées** dans le payload de l'agent.
- Recherche : résultats rendus en **cartes riches** (état `saved`), ingrédients lus depuis `useRecipes` (pas de fetch réseau).
- Puce « Adapté de… » (historique) : **omise** dans ce lot.
- Mises à jour de recette (`save_recipe` porteur d'`isUpdate`, `extract_modified_recipe`) : passent **aussi par la carte** — état `proposed` + `isUpdate: true`, bouton « Mettre à jour la recette ». La barre pendingRecipe disparaît entièrement de l'écran Assistant.
- Le flux `pendingRecipe` **reste dans `useChatEngine`** (l'assistant de cuisson `useRecipeChat` en dépend) ; seul l'écran Assistant cesse de l'utiliser.
- Nommage backend/front : la tool def émet `intro_closing` (snake_case) ; normalisation `intro_closing` → `introClosing` **et** coercition `quantity` string → number dans `parseRecipePayload` (Task 2).

---

## File Structure

**Créés :**
- `src/lib/recipe-scaling.ts` — fonction pure `scaleIngredients(ingredients, baseServings, targetServings)`.
- `src/lib/recipe-scaling.test.ts` — tests unitaires du scaling.
- `src/components/chat/RecipeChatCard.tsx` — carte recette riche (intro, carte portions/ingrédients, boutons dynamiques, astuce).
- `src/components/chat/RecipeChatCard.test.tsx` — tests de rendu + boutons dynamiques + scaling portions.

**Modifiés :**
- `src/hooks/useChatEngine.ts` — enrichir `RecipeCard` (état + données complètes), attacher les cartes aux messages (`recipeCard` / `recipeCards`). Le flux `pendingRecipe` du moteur est **conservé** (utilisé par `useRecipeChat`) — seul l'écran Assistant cesse de l'utiliser.
- `src/lib/chat-tool-payloads.ts` — schéma + builder du payload `propose_recipe` (champs `intro`, `introClosing`, `tip`, quantité numérique).
- `src/lib/chat-tool-payloads.test.ts` — **étendre** (le fichier existe déjà et couvre `parseRecipePayload` ; ne pas l'écraser) : tests du nouveau schéma.
- `src/hooks/useHomeChat.ts` — brancher `propose_recipe`, la persistance « Créer la recette », les résultats de recherche en cartes.
- `src/hooks/useHomeChat.test.ts` — **étendre** (le fichier existe déjà : harnais `renderHook` + `sendToolCall` + `installSupabase`) : tests cartes/création.
- `src/components/chat/ChatInterface.tsx` — remplacer mini-carte + barre pendingRecipe par `<RecipeChatCard>` par message.
- `src/components/chat/ChatInterface.test.tsx` — adapter les tests au nouveau rendu.
- `src/pages/Home.tsx` — en-tête épuré (menu) + logo d'accueil.
- `supabase/functions/home-assistant/index.ts` — outil `propose_recipe` + ajustement du prompt.
- `supabase/functions/_shared/ai-providers_test.ts` — adapter si des assertions portent sur la liste d'outils.

---

## Task 1 : Fonction pure de recalcul des portions

**Files:**
- Create: `src/lib/recipe-scaling.ts`
- Test: `src/lib/recipe-scaling.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

```typescript
// src/lib/recipe-scaling.test.ts
import { describe, it, expect } from 'vitest';
import { scaleIngredients } from './recipe-scaling';
import type { Ingredient } from '@/types/recipe';

const base: Ingredient[] = [
  { name: 'Farine', quantity: 200, unit: 'g' },
  { name: 'Œufs', quantity: 2, unit: '' },
  { name: 'Sel', quantity: 0, unit: 'pincée' },
];

describe('scaleIngredients', () => {
  it('double les quantités quand on double les portions', () => {
    const out = scaleIngredients(base, 2, 4);
    expect(out[0].quantity).toBe(400);
    expect(out[1].quantity).toBe(4);
  });

  it('arrondit à 2 décimales et supprime les décimales inutiles', () => {
    const out = scaleIngredients([{ name: 'Lait', quantity: 100, unit: 'ml' }], 3, 4);
    // 100 * 4/3 = 133.33
    expect(out[0].quantity).toBe(133.33);
  });

  it('laisse les quantités à 0 inchangées (pincée, qs)', () => {
    const out = scaleIngredients(base, 2, 6);
    expect(out[2].quantity).toBe(0);
  });

  it('ne divise pas par zéro : baseServings <= 0 renvoie les ingrédients inchangés', () => {
    const out = scaleIngredients(base, 0, 4);
    expect(out).toEqual(base);
  });

  it('renvoie une nouvelle liste sans muter l’entrée (immutabilité)', () => {
    const out = scaleIngredients(base, 2, 4);
    expect(out).not.toBe(base);
    expect(base[0].quantity).toBe(200);
  });
});
```

- [ ] **Step 2 : Lancer le test — il doit échouer**

Run: `npm run test:run -- src/lib/recipe-scaling.test.ts`
Expected: FAIL (`scaleIngredients` introuvable).

- [ ] **Step 3 : Implémenter**

```typescript
// src/lib/recipe-scaling.ts
import type { Ingredient } from '@/types/recipe';

/** Arrondit à 2 décimales max en supprimant les zéros inutiles (2.50 → 2.5, 4.00 → 4). */
function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recalcule les quantités d'une liste d'ingrédients pour un nombre de portions
 * cible. Fonction pure (retourne une nouvelle liste, ne mute pas l'entrée).
 * - Les quantités numériques > 0 sont multipliées par `targetServings / baseServings`.
 * - Les quantités nulles (« pincée », « qs ») restent inchangées.
 * - Si `baseServings <= 0`, on ne peut pas scaler : la liste est renvoyée telle quelle.
 */
export function scaleIngredients(
  ingredients: readonly Ingredient[],
  baseServings: number,
  targetServings: number,
): Ingredient[] {
  if (baseServings <= 0 || targetServings <= 0) {
    return ingredients.map(ing => ({ ...ing }));
  }
  const factor = targetServings / baseServings;
  return ingredients.map(ing => {
    const qty = typeof ing.quantity === 'number' ? ing.quantity : 0;
    if (qty <= 0) return { ...ing };
    return { ...ing, quantity: roundQuantity(qty * factor) };
  });
}
```

- [ ] **Step 4 : Lancer le test — il doit passer**

Run: `npm run test:run -- src/lib/recipe-scaling.test.ts`
Expected: PASS (5 tests verts).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/recipe-scaling.ts src/lib/recipe-scaling.test.ts
git commit -m "feat: ajoute le recalcul pur des quantités par portions"
```

---

## Task 2 : Payload `propose_recipe` (schéma + type)

Étend le format de recette côté front pour accepter les nouveaux champs structurés (`intro`, `introClosing`, `tip`) émis par l'agent, en gardant la compatibilité avec `save_recipe`/`extract`/`create`.

**Files:**
- Modify: `src/hooks/useChatEngine.ts` (types `PendingRecipe`, `RecipeCard`)
- Modify: `src/lib/chat-tool-payloads.ts`
- Modify: `src/hooks/useHomeChat.ts` + `src/components/chat/ChatInterface.tsx` (ajustements de compilation — nouveaux champs requis de `RecipeCard`, cf. Step 3)
- Test: `src/lib/chat-tool-payloads.test.ts` (**étendre** — le fichier existe déjà ; ne pas l'écraser)

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter au fichier **existant** (les imports `buildPendingRecipeFromToolCall` etc. y sont déjà) :

```typescript
describe('buildPendingRecipeFromToolCall — propose_recipe', () => {
  const data = {
    title: 'Buddha bowl',
    servings: 2,
    ingredients: [{ name: 'Avocat', quantity: 1, unit: '' }],
    steps: [{ order: 1, text: 'Couper' }],
    intro: ['Avocat mûr et œufs mollets.', 'Champignons poêlés.'],
    introClosing: 'Assembler à la dernière minute.',
    tip: 'Poêler à feu vif pour garder du croquant.',
  };

  it('conserve les champs riches intro/introClosing/tip', () => {
    const out = buildPendingRecipeFromToolCall({ type: 'propose_recipe', data }, null);
    expect(out).not.toBeNull();
    expect(out!.title).toBe('Buddha bowl');
    expect(out!.intro).toEqual(['Avocat mûr et œufs mollets.', 'Champignons poêlés.']);
    expect(out!.introClosing).toBe('Assembler à la dernière minute.');
    expect(out!.tip).toBe('Poêler à feu vif pour garder du croquant.');
  });

  it('normalise intro_closing (snake_case émis par la tool def backend)', () => {
    const out = buildPendingRecipeFromToolCall(
      { type: 'propose_recipe', data: { ...data, introClosing: undefined, intro_closing: 'Assembler à la dernière minute.' } },
      null,
    );
    expect(out!.introClosing).toBe('Assembler à la dernière minute.');
  });

  it('coerce quantity string → number (nécessaire au recalcul des portions)', () => {
    const out = buildPendingRecipeFromToolCall(
      { type: 'propose_recipe', data: { ...data, ingredients: [{ name: 'Avocat', quantity: '1.5', unit: '' }] } },
      null,
    );
    expect(out!.ingredients[0].quantity).toBe(1.5);
  });

  it('tolère l’absence des champs riches (rétrocompat save_recipe)', () => {
    const out = buildPendingRecipeFromToolCall({ type: 'save_recipe', data: { ...data, intro: undefined, introClosing: undefined, tip: undefined } }, null);
    expect(out).not.toBeNull();
    expect(out!.intro).toBeUndefined();
  });
});
```

⚠️ La coercition s'applique à **tous** les outils recette (le comportement historique « quantity conservée telle quelle » disparaît) : adapter les tests existants du fichier s'ils affirment une `quantity` string en sortie.

- [ ] **Step 2 : Lancer le test — il doit échouer**

Run: `npm run test:run -- src/lib/chat-tool-payloads.test.ts`
Expected: FAIL (`propose_recipe` non géré → `buildPendingRecipeFromToolCall` renvoie `null`).

- [ ] **Step 3 : Étendre les types dans `useChatEngine.ts`**

Dans `src/hooks/useChatEngine.ts`, ajouter les champs riches à `PendingRecipe` et enrichir `RecipeCard` avec l'état et les données nécessaires au rendu de la carte :

```typescript
export type RecipeCardStatus = 'proposed' | 'saved';

export interface RecipeCard {
  /** Présent uniquement en état 'saved' (recette en DB). */
  id?: string;
  status: RecipeCardStatus;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  stepsCount: number;
  intro?: string[];
  introClosing?: string;
  tip?: string;
  isUpdate: boolean;
}

export interface PendingRecipe {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  steps: Step[];
  intro?: string[];
  introClosing?: string;
  tip?: string;
  isUpdate?: boolean;
  originalRecipeId?: string;
  relationToOriginal?: string;
}
```

Ajouter aussi à `ChatMessage` : `recipeCards?: RecipeCard[]` (cartes des résultats de recherche, branchées en Task 4).

Deux usages existants de `RecipeCard` doivent être ajustés **dans ce commit** pour garder le typecheck vert (ils seront réécrits en Tasks 4-5) :
- `useHomeChat.savePendingRecipe` (message de confirmation) : compléter la carte construite → `{ id: recipeId, status: 'saved', title: pending.title, servings: pending.servings, ingredients: pending.ingredients, stepsCount: pending.steps.length, isUpdate: !!pending.isUpdate }`.
- `ChatInterface` (mini-carte actuelle) : `id` devient optionnel — extraire `const cardId = message.recipeCard?.id;` et garder les `onClick` derrière `cardId && …`.

- [ ] **Step 4 : Étendre le schéma et le builder dans `chat-tool-payloads.ts`**

Ajouter les champs au schéma, y compris la forme snake_case `intro_closing` émise par la tool def backend (Task 6) :

```typescript
const RecipePayloadSchema = z.object({
  title: z.string().min(1),
  servings: z.number().nullable().optional(),
  ingredients: z.array(IngredientPayloadSchema),
  steps: z.array(StepPayloadSchema),
  intro: z.array(z.string()).optional(),
  introClosing: z.string().optional(),
  intro_closing: z.string().optional(), // forme émise par la tool def backend (Task 6)
  tip: z.string().optional(),
  isUpdate: z.boolean().optional(),
  originalRecipeId: z.string().optional(),
  relationToOriginal: z.string().optional(),
});
```

Dans `parseRecipePayload`, normaliser `intro_closing` → `introClosing` et coercer les `quantity` string → number (nécessaire au recalcul des portions ; remplace le comportement historique « valeur conservée telle quelle ») :

```typescript
export function parseRecipePayload(data: unknown): PendingRecipe | null {
  const result = RecipePayloadSchema.safeParse(data);
  if (!result.success) {
    console.error('Payload de recette invalide, ignoré:', result.error.issues);
    return null;
  }
  const { intro_closing, ...rest } = result.data;
  return {
    ...rest,
    introClosing: rest.introClosing ?? intro_closing,
    ingredients: rest.ingredients.map(ing => ({
      ...ing,
      quantity: typeof ing.quantity === 'string' ? (parseFloat(ing.quantity) || 0) : (ing.quantity ?? 0),
    })),
  } as unknown as PendingRecipe;
}
```

Dans `buildPendingRecipeFromToolCall`, ajouter le cas `propose_recipe` (traité comme `save_recipe`, marqueurs de mise à jour portés par le payload s'il y en a) :

```typescript
  switch (action.type) {
    case 'propose_recipe':
    case 'save_recipe':
      return recipe;
    case 'extract_modified_recipe':
      return { ...recipe, isUpdate: true, originalRecipeId: activeRecipe?.id };
    case 'create_new_recipe':
      return { ...recipe, relationToOriginal: action.data.relation_to_original as string };
    default:
      return null;
  }
```

- [ ] **Step 5 : Lancer le test — il doit passer**

Run: `npm run test:run -- src/lib/chat-tool-payloads.test.ts`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/chat-tool-payloads.ts src/lib/chat-tool-payloads.test.ts src/hooks/useChatEngine.ts src/hooks/useHomeChat.ts src/components/chat/ChatInterface.tsx
git commit -m "feat: schéma payload propose_recipe (intro, clôture, astuce)"
```

---

## Task 3 : Composant `RecipeChatCard` (rendu + boutons dynamiques + portions)

La structure visuelle est décrite intégralement au Step 3 — la maquette HTML d'origine n'est pas dans le repo, **ce plan est la source de vérité du rendu**. Le sélecteur de portions utilise `scaleIngredients` (Task 1). Les boutons dépendent de `card.status` et `card.isUpdate`.

**Files:**
- Create: `src/components/chat/RecipeChatCard.tsx`
- Test: `src/components/chat/RecipeChatCard.test.tsx`

- [ ] **Step 1 : Écrire le test qui échoue**

```tsx
// src/components/chat/RecipeChatCard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeChatCard } from './RecipeChatCard';
import type { RecipeCard } from '@/hooks/useChatEngine';

const proposed: RecipeCard = {
  status: 'proposed', title: 'Buddha bowl', servings: 2, stepsCount: 3, isUpdate: false,
  ingredients: [{ name: 'Avocat', quantity: 2, unit: '' }],
  intro: ['Avocat mûr.'], introClosing: 'Assembler.', tip: 'Feu vif.',
};
const saved: RecipeCard = { ...proposed, status: 'saved', id: 'r1' };

describe('RecipeChatCard', () => {
  it('état proposed : affiche un seul bouton « Créer la recette »', () => {
    render(<RecipeChatCard card={proposed} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Créer la recette/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Commencer à cuisiner/i })).toBeNull();
  });

  it('état saved : affiche « Commencer à cuisiner » + accès détail', () => {
    render(<RecipeChatCard card={saved} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Commencer à cuisiner/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Créer la recette/i })).toBeNull();
  });

  it('incrémenter les portions recalcule les quantités affichées', () => {
    render(<RecipeChatCard card={proposed} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    const plus = screen.getByRole('button', { name: /augmenter les portions/i });
    fireEvent.click(plus); // 2 → 3 portions
    fireEvent.click(plus); // 3 → 4 portions
    // Avocat 2 → 4 (portions doublées) — affichage « 4 Avocat » (unité vide omise)
    expect(screen.getByText(/4\s*Avocat/)).toBeInTheDocument();
  });

  it('état proposed + isUpdate : le bouton devient « Mettre à jour la recette »', () => {
    render(<RecipeChatCard card={{ ...proposed, isUpdate: true }} onCreate={vi.fn()} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Mettre à jour la recette/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Créer la recette/i })).toBeNull();
  });

  it('« Créer la recette » remonte les portions choisies', () => {
    const onCreate = vi.fn();
    render(<RecipeChatCard card={proposed} onCreate={onCreate} onStartCooking={vi.fn()} onOpenDetail={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /augmenter les portions/i }));
    fireEvent.click(screen.getByRole('button', { name: /Créer la recette/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ servings: 3 }));
  });
});
```

- [ ] **Step 2 : Lancer le test — il doit échouer**

Run: `npm run test:run -- src/components/chat/RecipeChatCard.test.tsx`
Expected: FAIL (composant introuvable).

- [ ] **Step 3 : Implémenter le composant**

Implémenter la structure suivante en Tailwind + tokens du DS (classes `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `font-solitreo` pour le nom). Structure :
- Bulle intro (puces `card.intro` + `card.introClosing`) — rendue seulement si présente.
- Carte : nom (`font-solitreo`), méta `${card.ingredients.length} ingrédients · ${card.stepsCount} étapes`, ligne « Portions » + stepper `-`/valeur/`+` (bornes 1..12, boutons `aria-label="diminuer les portions"` / `"augmenter les portions"`), section « Ingrédients » listant `scaled` (via `scaleIngredients(card.ingredients, card.servings, portions)`), affichage `${qty} ${unit} ${name}` (omettre `0`/unité vide proprement).
- Boutons dynamiques :
  - `status === 'proposed'` → un seul `<Button>` pleine largeur, libellé « Mettre à jour la recette » si `card.isUpdate`, sinon « Créer la recette » → `onCreate({ ...card, servings: portions, ingredients: scaled })`.
  - `status === 'saved'` → « Commencer à cuisiner » (`onStartCooking(card.id!, portions)`) + bouton icône « Voir la recette » (`onOpenDetail(card.id!)`).
- Astuce (`card.tip`) sous la carte, si présente.

État local : `const [portions, setPortions] = useState(card.servings);` et `const scaled = useMemo(() => scaleIngredients(card.ingredients, card.servings, portions), [card.ingredients, card.servings, portions]);`

Signature :

```tsx
interface RecipeChatCardProps {
  card: RecipeCard;
  onCreate: (data: { title: string; servings: number; ingredients: Ingredient[] }) => void;
  onStartCooking: (recipeId: string, servings: number) => void;
  onOpenDetail: (recipeId: string) => void;
}
```

- [ ] **Step 4 : Lancer le test — il doit passer**

Run: `npm run test:run -- src/components/chat/RecipeChatCard.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/components/chat/RecipeChatCard.tsx src/components/chat/RecipeChatCard.test.tsx
git commit -m "feat: composant RecipeChatCard (carte recette riche, boutons dynamiques)"
```

---

## Task 4 : Brancher `propose_recipe` et « Créer la recette » dans les hooks

Tous les outils recette (`propose_recipe`, `save_recipe`, `extract_modified_recipe`, `create_new_recipe`) attachent désormais une carte `proposed` au message assistant (avec `isUpdate` pour les mises à jour). « Créer la recette » / « Mettre à jour la recette » persiste puis passe la carte en `saved`. Le flux `pendingRecipe` du moteur est **conservé** (utilisé par `useRecipeChat`) : seul l'écran Assistant cesse de s'en servir. `savePendingRecipe`/`cancelPendingRecipe` restent exportés jusqu'à la Task 5 (qui les supprime avec la barre) pour garder le typecheck vert entre les deux tasks.

**Files:**
- Modify: `src/hooks/useChatEngine.ts`
- Modify: `src/hooks/useHomeChat.ts`
- Test: `src/hooks/useHomeChat.test.ts` (**étendre** — le fichier existe déjà avec un harnais complet : `renderHook`, `sendToolCall`, `installSupabase`, `lastMessage`, `buildersFor`)

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/hooks/useHomeChat.test.ts`, réutiliser les helpers existants du fichier. Ajouter :

```typescript
describe('propose_recipe — carte attachée au message', () => {
  const PROPOSED_PAYLOAD = {
    title: 'Buddha bowl', servings: 2,
    ingredients: [{ name: 'Avocat', quantity: 1, unit: '' }],
    steps: [{ order: 1, text: 'Couper' }],
    intro: ['Avocat mûr.'], intro_closing: 'Assembler.', tip: 'Feu vif.',
  };

  it('attache une carte proposed au message assistant, sans ouvrir pendingRecipe', async () => {
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, 'propose_recipe', PROPOSED_PAYLOAD);
    const msg = lastMessage(result.current.messages);
    expect(msg.recipeCard).toMatchObject({
      status: 'proposed', title: 'Buddha bowl', servings: 2, stepsCount: 1,
      introClosing: 'Assembler.', tip: 'Feu vif.',
    });
    expect(result.current.pendingRecipe).toBeNull();
  });

  it('createProposedRecipe insère la recette et passe la carte en saved', async () => {
    installSupabase({
      resultsByTable: { recipes: { data: { id: 'new-1' }, error: null } },
    });
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, 'propose_recipe', PROPOSED_PAYLOAD);
    const msgId = lastMessage(result.current.messages).id;

    await act(() => result.current.createProposedRecipe(msgId, {
      servings: 4, ingredients: [{ name: 'Avocat', quantity: 2, unit: '' }],
    }));

    const [recipesBuilder] = buildersFor('recipes');
    expect(recipesBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Buddha bowl', servings: 4, source_type: 'ai', status: 'draft' }),
    );
    await waitFor(() => {
      expect(lastMessage(result.current.messages).recipeCard).toMatchObject({
        status: 'saved', id: 'new-1', servings: 4,
      });
    });
  });

  it('save_recipe en mise à jour attache une carte proposed avec isUpdate', async () => {
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, 'save_recipe', {
      ...PROPOSED_PAYLOAD, isUpdate: true, originalRecipeId: 'r1',
    });
    expect(lastMessage(result.current.messages).recipeCard).toMatchObject({
      status: 'proposed', isUpdate: true,
    });
    expect(result.current.pendingRecipe).toBeNull();
  });

  it('search_recipes attache des cartes saved construites depuis useRecipes', async () => {
    const { result } = renderHook(() => useHomeChat());
    await sendToolCall(result, 'search_recipes', { query: 'tarte' });
    const msg = lastMessage(result.current.messages);
    expect(msg.recipeCards).toHaveLength(1); // seule « Tarte aux pommes » (r1) matche
    expect(msg.recipeCards![0]).toMatchObject({ status: 'saved', id: 'r1', title: 'Tarte aux pommes' });
  });
});
```

Adapter aussi les tests existants qui attendent l'ancien comportement : « save_recipe met la recette en attente de confirmation » et les cas `extract_modified_recipe` attendent désormais une carte sur le message (`recipeCard.status === 'proposed'`), plus un `pendingRecipe`. Les tests de `savePendingRecipe`/`cancelPendingRecipe` restent verts tels quels tant que ces fonctions existent (supprimés avec elles en Task 5) — les convertir vers `createProposedRecipe` si plus simple.

- [ ] **Step 2 : Lancer — échec attendu**

Run: `npm run test:run -- src/hooks/useHomeChat.test.ts`
Expected: FAIL (carte absente des messages, `createProposedRecipe` inexistant).

- [ ] **Step 3 : `useChatEngine` — attacher les cartes et exposer les helpers**

a) Ajouter `propose_recipe: 'propose_recipe',` à `actionMap` (fallback texte).

b) Ref + helpers (le `PendingRecipe` complet — avec `steps` — est conservé pour la persistance) :

```typescript
const proposedPendingRef = useRef<Map<string, PendingRecipe>>(new Map());

const getProposedPending = useCallback(
  (messageId: string): PendingRecipe | null => proposedPendingRef.current.get(messageId) ?? null,
  [],
);

const updateMessageCard = useCallback((messageId: string, patch: Partial<RecipeCard>) => {
  setMessages(prev => prev.map(m =>
    m.id === messageId && m.recipeCard ? { ...m, recipeCard: { ...m.recipeCard, ...patch } } : m,
  ));
}, []);
```

Exposer `getProposedPending` et `updateMessageCard` dans le retour du hook.

c) Dans `executeToolCall`, avant le bloc `search_recipes` : si le handler renvoie `{ card, pending }`, attacher la carte au message assistant. Le contrôle de forme laisse `useRecipeChat` — dont le handler renvoie `null` pour ces outils — strictement inchangé :

```typescript
if (result && typeof result === 'object' && 'card' in result && 'pending' in result) {
  const { card, pending } = result as { card: RecipeCard; pending: PendingRecipe };
  proposedPendingRef.current.set(assistantMessageId, pending);
  setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, recipeCard: card } : m));
  return currentContent;
}
```

d) Adapter le bloc `search_recipes` existant : accepter le nouveau format `{ summaries, cards }` (fallback ancien format tableau pour compatibilité), remplacer la liste markdown par une ligne courte (le modèle garde ainsi le contexte des résultats au tour suivant) et attacher `recipeCards` :

```typescript
if (name === 'search_recipes' && result) {
  const { summaries, cards } = Array.isArray(result)
    ? { summaries: result as SearchResult[], cards: [] as RecipeCard[] }
    : result as { summaries: SearchResult[]; cards: RecipeCard[] };
  let content = currentContent;
  content += summaries.length === 0
    ? "\n\nJe n'ai trouvé aucune recette correspondante. Tu veux que je t'en crée une nouvelle ?"
    : `\n\nJ'ai trouvé : ${summaries.map(r => r.title).join(', ')}.`;
  setMessages(prev => prev.map(m => m.id === assistantMessageId
    ? { ...m, content, recipeCards: cards.length > 0 ? cards : undefined }
    : m));
  return content;
}
```

- [ ] **Step 4 : `useHomeChat` — handler des outils recette + `createProposedRecipe`**

a) Remplacer le cas `save_recipe`/`extract_modified_recipe`/`create_new_recipe` (qui appelait `engine.setPendingRecipe`) par un cas commun renvoyant `{ card, pending }` :

```typescript
case 'propose_recipe':
case 'save_recipe':
case 'extract_modified_recipe':
case 'create_new_recipe': {
  const pending = buildPendingRecipeFromToolCall(action, activeRecipe);
  if (!pending) return null;
  const card: RecipeCard = {
    status: 'proposed',
    title: pending.title,
    servings: pending.servings ?? 2,
    ingredients: pending.ingredients,
    stepsCount: pending.steps.length,
    intro: pending.intro,
    introClosing: pending.introClosing,
    tip: pending.tip,
    isUpdate: !!pending.isUpdate,
  };
  return { card, pending };
}
```

b) `search_recipes` : conserver le filtre existant (rawQuery/statusFilter/favoritesOnly, `slice(0, 10)`), renvoyer `{ summaries, cards }` :

```typescript
        const summaries = results.map(r => ({ id: r.id, title: r.title, status: r.status, is_favorite: r.is_favorite ?? false }));
        const cards: RecipeCard[] = results.map(r => ({
          status: 'saved', id: r.id, title: r.title,
          servings: r.servings ?? 2, ingredients: r.ingredients,
          stepsCount: r.steps.length, isUpdate: false,
        }));
        return { summaries, cards };
```

c) Ajouter `createProposedRecipe` (reprend les branches update/insert, génération d'image, `triggerRecipeCompletion` et refetch de `savePendingRecipe`, appliquées aux portions/ingrédients recalculés ; met à jour la carte du message au lieu d'append une confirmation) :

```typescript
const createProposedRecipe = useCallback(async (
  messageId: string,
  override: { servings: number; ingredients: Ingredient[] },
) => {
  const pending = engine.getProposedPending(messageId);
  if (!pending) return;
  setIsSavingRecipe(true);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Tu dois être connecté pour enregistrer une recette.');
    const toSave = { ...pending, servings: override.servings, ingredients: override.ingredients };

    let recipeId = toSave.originalRecipeId ?? '';
    if (toSave.isUpdate && toSave.originalRecipeId) {
      const { error } = await supabase.from('recipes').update({
        title: toSave.title, servings: toSave.servings,
        ingredients: toSave.ingredients as unknown as Json, steps: toSave.steps as unknown as Json,
        updated_at: new Date().toISOString(),
      }).eq('id', toSave.originalRecipeId);
      if (error) throw error;
    } else {
      const { data: newRecipe, error } = await supabase.from('recipes').insert({
        user_id: session.user.id, title: toSave.title, servings: toSave.servings,
        ingredients: toSave.ingredients as unknown as Json, steps: toSave.steps as unknown as Json,
        source_type: 'ai', status: 'draft',
      }).select('id').single();
      if (error) throw error;
      recipeId = newRecipe?.id ?? '';
      if (recipeId) {
        generateRecipeImageInBackground({
          recipeId, title: toSave.title, ingredients: toSave.ingredients,
          accessToken: session.access_token, onSuccess: refetchRecipes,
        });
        triggerRecipeCompletion(
          recipeId,
          { title: toSave.title, ingredients: toSave.ingredients, steps: toSave.steps,
            ai_summary: null, calorie_score: null, nutrition_tags: null, season: null },
          refetchRecipes,
        );
      }
    }

    await refetchRecipes();
    // Rafraîchit aussi la fiche détail en cache (['recipe', id]) : refetchRecipes
    // ne couvre que la liste (['recipes']).
    if (recipeId) queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] });
    engine.updateMessageCard(messageId, {
      status: 'saved', id: recipeId,
      servings: toSave.servings, ingredients: toSave.ingredients,
    });
  } catch (error) {
    console.error('Error saving recipe:', error);
    engine.setMessages(prev => [...prev, {
      id: `error-${Date.now()}`, role: 'assistant',
      content: "⚠️ Je n'ai pas pu enregistrer la recette. Vérifie ta connexion et réessaie.",
      timestamp: new Date(),
    }]);
  } finally {
    setIsSavingRecipe(false);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `engine.*` sont stables (même motif que savePendingRecipe)
}, [refetchRecipes, queryClient]);
```

Exposer `createProposedRecipe` dans le retour du hook. **Ne pas supprimer** `savePendingRecipe`/`cancelPendingRecipe` ici (fait en Task 5 avec la barre).

- [ ] **Step 5 : Lancer — passe**

Run: `npm run test:run -- src/hooks/useHomeChat.test.ts`
Expected: PASS (nouveaux tests + tests existants adaptés).

- [ ] **Step 6 : Commit**

```bash
git add src/hooks/useChatEngine.ts src/hooks/useHomeChat.ts src/hooks/useHomeChat.test.ts
git commit -m "feat: les outils recette attachent une carte au message, création via bouton"
```

---

## Task 5 : Intégrer `RecipeChatCard` dans `ChatInterface` (retirer la barre pendingRecipe)

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx`
- Modify: `src/components/chat/ChatInterface.test.tsx`
- Modify: `src/hooks/useHomeChat.ts` (suppression de l'ancien flux `savePendingRecipe`/`cancelPendingRecipe`)
- Modify: `src/pages/Home.tsx` (props passées à `ChatInterface`)

- [ ] **Step 1 : Adapter les tests**

Mettre à jour `ChatInterface.test.tsx` : le rendu d'un message porteur de `recipeCard` affiche `<RecipeChatCard>` (bouton « Créer la recette » ou « Commencer à cuisiner » selon `status`). Supprimer les assertions sur l'ancienne barre pendingRecipe / mini-carte.

- [ ] **Step 2 : Lancer — échec attendu**

Run: `npm run test:run -- src/components/chat/ChatInterface.test.tsx`
Expected: FAIL.

- [ ] **Step 3 : Remplacer le rendu**

- Remplacer le bloc `message.recipeCard && (...)` (mini-carte) par `<RecipeChatCard card={message.recipeCard} onCreate={(data) => createProposedRecipe(message.id, data)} onStartCooking=... onOpenDetail=... />`. Rendre aussi `message.recipeCards` (résultats de recherche) : une `<RecipeChatCard>` par carte.
- Supprimer le bloc `AnimatePresence` de `pendingRecipe` (barre Créer/Annuler) et les props associées (`pendingRecipe`, `savePendingRecipe`, `cancelPendingRecipe`) — router les callbacks via la carte ; conserver `isSavingRecipe` pour désactiver le bouton de la carte pendant la persistance.
- Dans `useHomeChat` : supprimer `savePendingRecipe` et `cancelPendingRecipe` (remplacés par `createProposedRecipe` en Task 4) et cesser d'exposer `pendingRecipe` ; adapter les props dans `Home.tsx`. **Ne pas** toucher à `pendingRecipe` dans `useChatEngine` (utilisé par `useRecipeChat`).
- Câbler `onStartCooking(recipeId, servings)` et `onOpenDetail(recipeId)` (navigation `/recipes/:id`).

- [ ] **Step 4 : Lancer — passe**

Run: `npm run test:run -- src/components/chat/ChatInterface.test.tsx`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/components/chat/ChatInterface.tsx src/components/chat/ChatInterface.test.tsx src/hooks/useHomeChat.ts src/hooks/useHomeChat.test.ts src/pages/Home.tsx
git commit -m "refactor: ChatInterface rend RecipeChatCard, retire la barre pendingRecipe"
```

---

## Task 6 : Backend — outil `propose_recipe` + prompt

**Files:**
- Modify: `supabase/functions/home-assistant/index.ts`
- Modify: `supabase/functions/_shared/ai-providers_test.ts` (si assertions sur la liste d'outils)

- [ ] **Step 1 : Ajouter l'outil `propose_recipe`**

Nouveau `TOOLS` : `propose_recipe` avec `title`, `servings` (number), `ingredients` (**`quantity` en `number`**, `unit`, `category`, `preparation`), `steps` (`STEP_ITEMS_SCHEMA`), plus `intro` (`array` de `string`, 2-3 puces), `intro_closing` (`string`), `tip` (`string`). Description : « Présente une recette à l'utilisateur sous forme de carte. L'utilisateur l'enregistre lui-même via le bouton — n'appelle PAS save_recipe toi-même sauf mise à jour d'une recette existante. »

La tool def émet `intro_closing` (snake_case, cohérent avec les autres champs des tool defs). La normalisation `intro_closing` → `introClosing` côté front est **déjà en place** (`parseRecipePayload`, Task 2) — rien d'autre à faire ici.

- [ ] **Step 2 : Ajuster le prompt (`UNIFIED_PROMPT`)**

Dans « Skill : Création de recette », remplacer l'étape VALIDATION par : « PROPOSITION : appelle `propose_recipe` avec la recette structurée (intro à puces, clôture, astuce). L'utilisateur crée la recette via le bouton de la carte — n'appelle pas `save_recipe` toi-même. » Conserver `extract_modified_recipe`/`create_new_recipe` pour les modifications de recette en contexte.

- [ ] **Step 3 : Lancer les tests Deno partagés**

Run: `deno test supabase/functions/_shared/` (via `~/.deno/bin/deno` si hors PATH)
Expected: PASS (adapter `ai-providers_test.ts` si une assertion énumère les outils).

- [ ] **Step 4 : Commit**

```bash
git add supabase/functions/home-assistant/index.ts supabase/functions/_shared/ai-providers_test.ts
git commit -m "feat(edge): outil propose_recipe (carte structurée) + prompt"
```

- [ ] **Step 5 : Déploiement**

Le merge sur `main` redéploie via `.github/workflows/deploy-edge-functions.yml`. Pour tester avant merge : `supabase functions deploy home-assistant --project-ref ifpqsyyvytfpossqycpc`. Vérifier ensuite avec `get_edge_function` que la version a augmenté.

---

## Task 7 : Écran d'accueil — logo + en-tête épuré

**Files:**
- Modify: `src/pages/Home.tsx`

**Prérequis :** résolu — le logo est l'icône PWA `public/icons/icon-192x192.png`.

- [ ] **Step 1 : Logo dans le welcomeContent**

Ajouter au-dessus du `<h1>` « Toujours prêt à cuisiner. » :

```tsx
<img src="/icons/icon-192x192.png" alt="" className="w-[72px] h-[72px] rounded-[18px] mb-[18px] opacity-95" />
```

- [ ] **Step 2 : En-tête épuré (menu)**

Remplacer la rangée d'icônes Planning/Livre/Profil par un bouton menu (hamburger) ouvrant un `DropdownMenu` (shadcn, déjà dans `ui/`) listant Planning / Livre de recettes / Profil, en conservant à gauche le bouton « + » (nouvelle conversation). Conserver les `title`/`aria-label`.

- [ ] **Step 3 : Vérif visuelle**

Run: `npm run dev` puis vérifier `/home` (empty state avec logo + menu). Voir la procédure Playwright locale si vérif automatisée souhaitée.

- [ ] **Step 4 : Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: accueil chat — logo Grimoire + en-tête épuré (menu)"
```

---

## Task 8 : Garde-fou qualité + PR

- [ ] **Step 1 : `/check`**

Lancer le skill `/check` (tests + typecheck + lint vs baseline). Baseline : typecheck = 0, lint = 0, test:run = 0 échec. Corriger toute régression.

- [ ] **Step 2 : Revue `/pre-pr`** (une fois la feature complète)

- [ ] **Step 3 : PR**

Suivre le skill `git-github` : PR en français, résumé + plan de test, redéploiement edge function noté.

---

## Self-Review (à exécuter avant de coder)

1. **Couverture spec :** carte unifiée (T3/T4/T5) ✓ ; boutons dynamiques par statut (T3) ✓ ; mises à jour de recette via carte `isUpdate` (T3/T4) ✓ ; portions recalculées, aperçu local (T1/T3) ✓ ; intro+astuce structurées (T2/T6) ✓ ; recherche en cartes (T4) ✓ ; puce historique **omise** (non planifiée, conforme) ✓ ; logo + nav épurée (T7) ✓.
2. **Placeholders :** la structure UI est décrite intégralement dans le plan (T3 Step 3) et s'appuie sur les composants shadcn existants — pas de « TODO ». Les fichiers de test `chat-tool-payloads.test.ts` et `useHomeChat.test.ts` **existent déjà** : les étendre, ne pas les écraser. Logo : `/icons/icon-192x192.png` (confirmé).
3. **Cohérence des types :** `RecipeCard` (avec `status`/`ingredients`/`stepsCount`/`intro`/`tip`) défini en T2, utilisé identiquement en T3/T4/T5 ; `ChatMessage.recipeCards` défini en T2, alimenté en T4, rendu en T5. `scaleIngredients` (T1) appelé en T3. `getProposedPending`/`updateMessageCard`/`createProposedRecipe` cohérents T4/T5. `propose_recipe`/`intro_closing`→`introClosing` cohérents T2/T6. Le typecheck reste vert entre les tasks : T2 ajuste les usages existants de `RecipeCard`, T4 conserve `savePendingRecipe`/`cancelPendingRecipe` jusqu'à leur suppression en T5.
