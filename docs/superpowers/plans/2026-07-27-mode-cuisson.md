# Écran 3 — Mode cuisson : titres d'étapes + minuteur fusionné — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rapprocher le mode cuisson de la maquette : chaque étape a un **titre court** (« Cuire les œufs ») affiché en gros au-dessus du détail, et le minuteur de l'étape courante s'affiche en **gros compte à rebours + play/pause** — tout en **conservant** le multi-minuteurs parallèle, le chat Chef vocal, le wake lock et l'écran de fin.

**Architecture :** Ajout d'un champ optionnel `Step.title` (généré par l'agent pour les nouvelles recettes ; repli `deriveStepTitle` sur le texte pour les recettes existantes). Refonte de l'affichage d'étape (`CookingStepFocus`) : titre serif centré + détail. Le minuteur de l'étape courante est **piloté par le multi-minuteurs existant** (`useCookingTimers`) : quand un minuteur lié à l'étape courante tourne, on l'affiche en grand (compte à rebours + play/pause via `toggleTimer`) ; la `CookingTimerBar` reste pour les minuteurs des autres étapes (parallèles).

**Tech Stack :** React 18 + TypeScript, Vitest + Testing Library, Supabase Edge Function (Deno) `home-assistant`, Tailwind.

**Portée de CE plan :** mode cuisson uniquement (`CookingMode` + `CookingStepFocus`). Écrans 1 (Assistant, livré) et 2 (Détail, plan séparé) hors scope.

**Décisions verrouillées (arbitrage) :**
- Titres d'étapes : **générés** (`Step.title`), repli sur le texte pour l'existant.
- Minuteur : **fusion** — gros compte à rebours + play/pause pour l'étape courante, barre multi-minuteurs conservée pour les timers parallèles.
- Chat Chef vocal, wake lock, écran de fin `CookingDone`, navigation précédent/suivant : **conservés**.
- Typo : **full-Lora** (classes `font-solitreo`/`font-crimson` déjà mappées sur Lora — ne rien changer côté fonts).

**Note données :** `Step.title` est optionnel et vit dans le JSON `steps` (pas de migration DB). Les recettes existantes n'en ont pas → repli `deriveStepTitle`.

---

## File Structure

**Créés :**
- `src/lib/step-title.ts` — `deriveStepTitle(step, index)` (repli de titre).
- `src/lib/step-title.test.ts` — tests.

**Modifiés :**
- `src/types/recipe.ts` — ajouter `title?: string` à `Step`.
- `src/lib/chat-tool-payloads.ts` — `StepPayloadSchema` accepte `title` optionnel.
- `supabase/functions/home-assistant/index.ts` — `STEP_ITEMS_SCHEMA` : propriété `title` + consigne de prompt.
- `src/components/cooking/CookingStepFocus.tsx` — titre serif centré + détail ; gros minuteur (compte à rebours + play/pause) pour l'étape courante.
- `src/components/cooking/CookingStepFocus.test.tsx` — **étendre** (le fichier EXISTE déjà, 4 tests) : nouvelles props sur les `render()` existants + tests titre/minuteur.
- `src/components/cooking/CookingMode.tsx` — passer au `CookingStepFocus` les props minuteur de l'étape courante (timer lié + `toggleTimer`) ; filtrer ce timer de la `CookingTimerBar`.

Vérifié : `supabase/functions/_shared/ai-providers_test.ts` ne fige **aucune** assertion sur le schéma d'étape — rien à y modifier.

---

## Task 1 : `Step.title` + repli `deriveStepTitle`

**Files:**
- Modify: `src/types/recipe.ts`
- Create: `src/lib/step-title.ts`
- Test: `src/lib/step-title.test.ts`

- [ ] **Step 1 : Ajouter le champ au type**

Dans `src/types/recipe.ts`, ajouter à `Step` :

```typescript
export interface Step {
  order: number;
  text: string;
  /** Titre court de l'étape (« Cuire les œufs »). Généré par l'agent ; absent sur les recettes anciennes. */
  title?: string;
  duration_minutes?: number;
  parallel_with?: number[];
  tm7?: Tm7StepParams;
}
```

- [ ] **Step 2 : Écrire le test qui échoue**

```typescript
// src/lib/step-title.test.ts
import { describe, it, expect } from 'vitest';
import { deriveStepTitle } from './step-title';
import type { Step } from '@/types/recipe';

const mk = (over: Partial<Step>): Step => ({ order: 1, text: '', ...over });

describe('deriveStepTitle', () => {
  it('utilise step.title quand il est présent', () => {
    expect(deriveStepTitle(mk({ title: 'Cuire les œufs', text: 'Faire cuire 6 min.' }), 0)).toBe('Cuire les œufs');
  });

  it('à défaut, dérive la première clause du texte', () => {
    expect(deriveStepTitle(mk({ text: 'Émincer les champignons, puis les poêler.' }), 0)).toBe('Émincer les champignons');
  });

  it('tronque une clause trop longue à ~40 caractères', () => {
    const long = 'Mélanger la farine le sucre les œufs le beurre et la levure ensemble';
    expect(deriveStepTitle(mk({ text: long }), 0).length).toBeLessThanOrEqual(41);
  });

  it('repli final « Étape N » si le texte est vide', () => {
    expect(deriveStepTitle(mk({ text: '' }), 2)).toBe('Étape 3');
  });
});
```

- [ ] **Step 3 : Lancer — échec attendu**

Run: `npm run test:run -- src/lib/step-title.test.ts`
Expected: FAIL (`deriveStepTitle` introuvable).

- [ ] **Step 4 : Implémenter**

```typescript
// src/lib/step-title.ts
import type { Step } from '@/types/recipe';

const MAX_LEN = 40;

/**
 * Titre court d'une étape pour le mode cuisson. Priorité : `step.title` (généré
 * par l'agent) → première clause du texte (avant «,» / «.» / «;») tronquée →
 * repli « Étape N ». Fonction pure.
 */
export function deriveStepTitle(step: Step, index: number): string {
  if (step.title && step.title.trim()) return step.title.trim();
  const firstClause = step.text.split(/[,.;]/)[0]?.trim() ?? '';
  if (firstClause) {
    return firstClause.length > MAX_LEN ? `${firstClause.slice(0, MAX_LEN)}…` : firstClause;
  }
  return `Étape ${index + 1}`;
}
```

- [ ] **Step 5 : Lancer — passe**

Run: `npm run test:run -- src/lib/step-title.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6 : Commit**

```bash
git add src/types/recipe.ts src/lib/step-title.ts src/lib/step-title.test.ts
git commit -m "feat: Step.title optionnel + repli deriveStepTitle"
```

---

## Task 2 : Payload — `title` d'étape accepté

**Files:**
- Modify: `src/lib/chat-tool-payloads.ts`
- Modify: `src/lib/chat-tool-payloads.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter le bloc `describe` suivant dans `src/lib/chat-tool-payloads.test.ts`. **Ne pas ajouter d'imports** : le fichier importe déjà `describe/it/expect` (vitest) et `buildPendingRecipeFromToolCall`.

```typescript
// ajout dans src/lib/chat-tool-payloads.test.ts (imports déjà présents)
describe('buildPendingRecipeFromToolCall — title d’étape', () => {
  it('conserve steps[].title', () => {
    const out = buildPendingRecipeFromToolCall({
      type: 'propose_recipe',
      data: {
        title: 'Bowl', servings: 2,
        ingredients: [{ name: 'Avocat', quantity: 1, unit: '' }],
        steps: [{ order: 1, text: 'Faire cuire 6 min.', title: 'Cuire les œufs' }],
      },
    }, null);
    expect(out?.steps[0].title).toBe('Cuire les œufs');
  });
});
```

- [ ] **Step 2 : Lancer — échec attendu**

Run: `npm run test:run -- src/lib/chat-tool-payloads.test.ts`
Expected: FAIL (`title` retiré par le schéma zod car non déclaré).

- [ ] **Step 3 : Ajouter `title` au schéma d'étape**

Dans `StepPayloadSchema` (`chat-tool-payloads.ts`) :

```typescript
const StepPayloadSchema = z.object({
  order: z.number().optional(),
  text: z.string().min(1),
  title: z.string().optional(),
  duration_minutes: z.number().nullable().optional(),
  parallel_with: z.array(z.number()).optional(),
  tm7: Tm7ParamsPayloadSchema.nullable().optional(),
});
```

- [ ] **Step 4 : Lancer — passe**

Run: `npm run test:run -- src/lib/chat-tool-payloads.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/chat-tool-payloads.ts src/lib/chat-tool-payloads.test.ts
git commit -m "feat: le payload de recette accepte steps[].title"
```

---

## Task 3 : Backend — l'agent génère les titres d'étapes

**Files:**
- Modify: `supabase/functions/home-assistant/index.ts`

(Vérifié : `_shared/ai-providers_test.ts` ne fige aucune assertion sur le schéma d'étape — rien à y modifier.)

- [ ] **Step 1 : Ajouter `title` à `STEP_ITEMS_SCHEMA`**

Dans les `properties` de `STEP_ITEMS_SCHEMA` (ligne ~160, avant `text`) :

```typescript
title: {
  type: "string",
  description: "Titre court de l'étape (2-4 mots, ex. « Cuire les œufs », « Poêler les champignons ») affiché en grand dans le mode cuisson.",
},
```

(Ne pas l'ajouter à `required` : rester tolérant.)

- [ ] **Step 2 : Consigne de prompt**

Dans `UNIFIED_PROMPT`, section « Format étapes — TOUTES les recettes… » (ligne ~102), ajouter la puce : « Donne à CHAQUE étape un "title" court (2-4 mots) résumant l'action, en plus du "text" détaillé. »

⚠️ **PAS de backticks** autour de "title"/"text" dans cette phrase : `UNIFIED_PROMPT` est une template literal — des backticks non échappés cassent la compilation (bug déjà survenu, commit 837928e). Utiliser des guillemets. Vérifier avec `~/.deno/bin/deno check supabase/functions/home-assistant/index.ts`.

- [ ] **Step 3 : Tests Deno**

Run: `~/.deno/bin/deno test supabase/functions/_shared/ && ~/.deno/bin/deno check supabase/functions/home-assistant/index.ts`
Expected: PASS + check propre.

- [ ] **Step 4 : Commit + déploiement**

```bash
git add supabase/functions/home-assistant/index.ts
git commit -m "feat(edge): l'agent génère un titre court par étape"
```

Déploiement : automatique au merge sur `main` (`deploy-edge-functions.yml`). Hotfix éventuel : `supabase functions deploy home-assistant --project-ref ifpqsyyvytfpossqycpc`, puis vérifier la version via `get_edge_function`.

---

## Task 4 : `CookingStepFocus` — titre serif + minuteur fusionné

**Files:**
- Modify: `src/components/cooking/CookingStepFocus.tsx`
- Modify: `src/components/cooking/CookingMode.tsx`
- Modify: `src/components/cooking/CookingStepFocus.test.tsx` — **le fichier EXISTE déjà** (4 tests : progression/numéro, surlignage durée, 2 TimerChip). L'étendre, ne pas le recréer.

- [ ] **Step 1 : Étendre le test existant — échec attendu**

Dans `src/components/cooking/CookingStepFocus.test.tsx` :

1. **Mettre à jour les 4 `render()` existants** : ajouter les nouvelles props requises `activeTimer={null} onToggleTimer={vi.fn()}` (sinon erreur TS).
2. **Adapter le 1er test** (« affiche la progression et le numéro d'étape ») : le bloc numéro 78px + « Étape N » est remplacé par le titre (voir Step 3) → supprimer l'assertion `expect(screen.getByText('2'))…` ; garder `Étape 2 sur 6` (compteur `Progress`, conservé) et ajouter `expect(screen.getByText('Faites cuire 6 min puis égouttez')).toBeInTheDocument()` (titre dérivé du texte, repli sans `title`).
3. **Ajouter les nouveaux tests** :

```tsx
// ajouts dans le describe existant
const titled: Step = { order: 1, text: 'Faire cuire 6 min à la casserole.', title: 'Cuire les œufs', duration_minutes: 6 };

it('affiche le titre court de l’étape quand il est présent', () => {
  render(<CookingStepFocus step={titled} idx={0} total={3} onStartTimer={vi.fn()} activeTimer={null} onToggleTimer={vi.fn()} />);
  expect(screen.getByText('Cuire les œufs')).toBeInTheDocument();
});

it('affiche le gros compte à rebours + pause quand un minuteur de l’étape tourne', () => {
  const activeTimer = { id: 't1', label: 'Étape 1', total: 360, remaining: 300, running: true, done: false };
  render(<CookingStepFocus step={titled} idx={0} total={3} onStartTimer={vi.fn()} activeTimer={activeTimer} onToggleTimer={vi.fn()} />);
  expect(screen.getByText('5:00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /mettre en pause/i })).toBeInTheDocument();
});

it('propose « reprendre » quand le minuteur de l’étape est en pause', () => {
  const paused = { id: 't1', label: 'Étape 1', total: 360, remaining: 300, running: false, done: false };
  const onToggleTimer = vi.fn();
  render(<CookingStepFocus step={titled} idx={0} total={3} onStartTimer={vi.fn()} activeTimer={paused} onToggleTimer={onToggleTimer} />);
  fireEvent.click(screen.getByRole('button', { name: /reprendre/i }));
  expect(onToggleTimer).toHaveBeenCalledWith('t1');
});
```

(`fireEvent` est déjà importé dans ce fichier.)

- [ ] **Step 2 : Lancer — échec attendu**

Run: `npm run test:run -- src/components/cooking/CookingStepFocus.test.tsx`
Expected: FAIL (props `activeTimer`/`onToggleTimer` inexistantes, titre non rendu).

- [ ] **Step 3 : Implémenter la refonte**

Étendre les props de `CookingStepFocus` :

```tsx
import type { CookingTimer } from '@/hooks/useCookingTimers';

interface CookingStepFocusProps {
  step: Step;
  idx: number;
  total: number;
  onStartTimer: (label: string, seconds: number) => void;
  /** Minuteur en cours lié à l'étape courante (null si aucun). */
  activeTimer: CookingTimer | null;
  onToggleTimer: (id: string) => void;
}
```

Rendu (en gardant la barre de progression `Progress` existante) :
- **Titre** : **remplacer** le bloc actuel numéro 78px (`step.order`) + label accent « Étape N » par `deriveStepTitle(step, idx)` en `font-solitreo` (gros, ex. `text-4xl`), centré, au-dessus du détail. Le compteur « Étape N sur M » de `Progress` reste — pas de perte d'information de position.
- **Détail** : `step.text` (conserver la mise en évidence des durées via `parseStepTimers`/segments existants).
- **Minuteur fusionné** :
  - Si `activeTimer` : afficher `formatTimer(activeTimer.remaining)` en très grand (`font-solitreo text-5xl`) + un bouton rond play/pause appelant `onToggleTimer(activeTimer.id)` — `aria-label` « mettre en pause » si `running`, « reprendre » sinon (icônes `Pause`/`Play` de lucide). Masquer les `TimerChip` dans ce cas.
  - Sinon : conserver les `TimerChip` (`offeredMinutes`) qui lancent `onStartTimer` (démarre le minuteur, qui deviendra l'`activeTimer`).

Importer `deriveStepTitle` (Task 1) et `CookingTimer` (type) ; `formatTimer` est déjà importé dans ce fichier.

- [ ] **Step 4 : Câbler dans `CookingMode`**

Dans `CookingMode.tsx`, calculer le minuteur lié à l'étape courante et le passer à `CookingStepFocus`. Les `TimerChip` posent `label = « Étape N »` (déjà le cas via `stepLabel`) → retrouver le minuteur courant :

```tsx
const currentTimer = (!done && timers.find(t => t.label === `Étape ${idx + 1}` && !t.done)) || null;
// …
<CookingStepFocus
  step={currentStep} idx={idx} total={total}
  onStartTimer={addTimer}
  activeTimer={currentTimer}
  onToggleTimer={toggleTimer}
/>
```

**Éviter le double affichage** : le minuteur courant étant déjà rendu en grand dans l'étape, le retirer de la `CookingTimerBar` (qui ne garde que les minuteurs parallèles/terminés — conforme à la décision verrouillée) :

```tsx
<CookingTimerBar timers={timers.filter(t => t.id !== currentTimer?.id)} onToggle={toggleTimer} onDismiss={dismissTimer} />
```

(Quand le minuteur courant sonne (`done: true`), il sort du `find` et réapparaît dans la barre avec son bouton de fermeture — comportement voulu.)

- [ ] **Step 5 : Lancer — passe**

Run: `npm run test:run -- src/components/cooking/CookingStepFocus.test.tsx`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/components/cooking/CookingStepFocus.tsx src/components/cooking/CookingMode.tsx src/components/cooking/CookingStepFocus.test.tsx
git commit -m "feat: mode cuisson — titre d'étape serif + minuteur courant en grand"
```

---

## Task 5 : Garde-fou qualité + PR

- [ ] **Step 1 : `/check`** (tests 0 échec, typecheck 0, lint 0 vs baseline).
- [ ] **Step 2 : Vérif visuelle** `npm run dev` → mode cuisson : titre en grand, minuteur de l'étape en gros + play/pause, navigation et chat Chef intacts.
- [ ] **Step 3 : `/pre-pr`** puis **PR** (skill `git-github`). Edge function touchée → noter le redéploiement dans la PR.

---

## Self-Review (à exécuter avant de coder)

1. **Couverture spec :** titres d'étapes générés + repli (T1/T2/T3) ✓ ; minuteur fusionné gros compte à rebours + play/pause, multi-minuteurs conservé (T4, minuteur courant filtré de la barre pour éviter le doublon) ✓ ; chat Chef / wake lock / écran de fin conservés (aucune suppression planifiée) ✓ ; full-Lora (aucun changement de fonts) ✓.
2. **Placeholders :** code complet pour T1/T2 ; edits précis (fichier + repère) pour T3/T4. La refonte visuelle T4 référence la maquette fournie (gros compte à rebours 52px + play/pause). T4 explicite le sort du bloc numéro 78px (remplacé par le titre) et l'adaptation des 4 tests existants.
3. **Cohérence des types :** `Step.title` (T1) utilisé par `deriveStepTitle` (T1), le schéma payload (T2), le schéma edge (T3) et `CookingStepFocus` (T4). Props `activeTimer: CookingTimer | null` / `onToggleTimer` définies T4 et câblées depuis `CookingMode` (T4).
4. **Pièges vérifiés contre le code réel :** `CookingStepFocus.test.tsx` existe déjà (étendre, pas créer) ; pas de backticks dans la consigne de prompt (template literal, récidive commit 837928e) ; `ai-providers_test.ts` sans assertion sur le schéma d'étape (rien à modifier) ; `formatTimer` déjà importé dans `CookingStepFocus`.
