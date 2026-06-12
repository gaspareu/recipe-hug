# Phase 2 — Harmonisation UX/UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harmoniser visuellement les formulaires de recette (RecipeNew/RecipeEdit), la page Profil et le Planning de repas avec l'identité visuelle "Grimoire" posée en Phase 1 (typographie Solitreo, palette crème/sauge/olive/doré, cartes `rounded-2xl`, animations fade-in-up respectant `prefers-reduced-motion`).

**Architecture:** Ajout d'une variante d'animation partagée dans `src/lib/motion.ts`. Les formulaires recette sont restructurés en 3 sections repliables via le composant existant `CollapsibleSection` (déjà utilisé dans Profile). Profile et MealPlanning sont restylés in-place (mêmes structures, classes Tailwind harmonisées).

**Tech Stack:** React 18 + TypeScript, Tailwind CSS, shadcn/ui, framer-motion, Vitest + Testing Library.

---

## Référence — spec

Voir `docs/superpowers/specs/2026-06-12-phase2-harmonisation-design.md` pour le détail validé de chaque section.

## Référence — design tokens existants

- `src/index.css` : `h1`-`h6` ont déjà `font-solitreo` via `@layer base` — aucune classe `font-solitreo` à ajouter manuellement sur les titres `<h1>` existants.
- `src/lib/motion.ts` : `easeStandard = [0.4, 0, 0.2, 1]`, `pageVariants`, `pageTransition`, `messageVariants`, `messageTransition`.
- Pattern reduced-motion existant (`src/pages/RecipeDetail.tsx:38,142`) :
  ```tsx
  const reduceMotion = useReducedMotion();
  // ...
  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
  ```

---

### Task 1: Ajouter la variante d'animation `fadeInUpVariants` partagée

**Files:**
- Modify: `src/lib/motion.ts`

- [ ] **Step 1: Ajouter la variante et le helper de transition échelonnée**

Ajouter à la fin de `src/lib/motion.ts` :

```ts
/** Variants d'apparition "fade + glissement vers le haut" pour sections/cartes. */
export const fadeInUpVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
} as const;

/** Transition fade-in-up avec délai optionnel pour effet échelonné (ex: liste de cartes). */
export function fadeInUpTransition(index = 0) {
  return { duration: 0.25, ease: easeStandard, delay: index * 0.05 };
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npm run build`
Expected: build réussit sans erreur TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/lib/motion.ts
git commit -m "feat: ajoute la variante d'animation fade-in-up partagee"
```

---

### Task 2: Restructurer RecipeNew.tsx en sections repliables + restyle

**Files:**
- Modify: `src/pages/RecipeNew.tsx`
- Test: `src/pages/RecipeNew.test.tsx` (nouveau)

- [ ] **Step 1: Écrire le test (smoke test sur la structure repliable)**

Créer `src/pages/RecipeNew.test.tsx` :

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import RecipeNew from "./RecipeNew";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useRecipes", () => ({
  useCreateRecipe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(), getUser: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

describe("RecipeNew", () => {
  it("affiche les sections repliables en mode manuel", () => {
    render(
      <MemoryRouter>
        <RecipeNew />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Saisir manuellement"));

    expect(screen.getByText("Informations générales")).toBeInTheDocument();
    expect(screen.getByText("Ingrédients")).toBeInTheDocument();
    expect(screen.getByText("Étapes")).toBeInTheDocument();
    expect(screen.getByLabelText(/Titre/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/pages/RecipeNew.test.tsx`
Expected: FAIL — "Informations générales" / "Ingrédients" / "Étapes" introuvables (structure actuelle = un seul bloc, pas de `CollapsibleSection`).

- [ ] **Step 3: Importer `CollapsibleSection`, `motion`/`useReducedMotion` et la variante d'animation**

Dans `src/pages/RecipeNew.tsx`, ajouter aux imports (après la ligne 18, avant `import { useCreateRecipe }`) :

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import { CollapsibleSection } from '@/components/profile/CollapsibleSection';
import { fadeInUpVariants, fadeInUpTransition } from '@/lib/motion';
```

- [ ] **Step 4: Récupérer `reduceMotion` dans le composant**

Juste après `const createRecipe = useCreateRecipe();` (ligne 76), ajouter :

```tsx
  const reduceMotion = useReducedMotion();
```

- [ ] **Step 5: Restyler les cartes du sélecteur de mode (lignes 183-215)**

Remplacer le bloc des deux `<button>` (mode "choose") par :

```tsx
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md cursor-pointer text-left"
            >
              <div className="rounded-full bg-primary/10 p-4">
                <PenLine className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Saisir manuellement</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Remplis le formulaire ingrédient par ingrédient
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('photo')}
              className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-md cursor-pointer text-left"
            >
              <div className="rounded-full bg-primary/10 p-4">
                <Camera className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Créer depuis une photo</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Prends en photo une recette, l'IA l'analyse automatiquement
                </p>
              </div>
            </button>
          </div>
```

- [ ] **Step 6: Restructurer le formulaire en 3 sections repliables (lignes 287-388)**

Remplacer tout le bloc `{/* Form */}` ... `{showForm && (...)}` par :

```tsx
        {/* Form */}
        {showForm && (
          <form
            id="recipe-new-form"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <motion.div variants={fadeInUpVariants} transition={fadeInUpTransition(0)} initial={reduceMotion ? false : 'initial'} animate="animate">
              <CollapsibleSection title="Informations générales" defaultOpen>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Titre *</Label>
                    <Input
                      id="title"
                      placeholder="Ex: Tarte aux pommes de mamie"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={isAnalyzing}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="servings">Portions</Label>
                      <Input
                        id="servings"
                        type="number"
                        min="1"
                        placeholder="4"
                        value={servings}
                        onChange={(e) => setServings(e.target.value ? parseInt(e.target.value) : '')}
                        disabled={isAnalyzing}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Statut</Label>
                      <Select value={status} onValueChange={(v) => setStatus(v as RecipeStatus)} disabled={isAnalyzing}>
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Brouillon</SelectItem>
                          <SelectItem value="tested">Testé</SelectItem>
                          <SelectItem value="validated">Validé</SelectItem>
                          <SelectItem value="archived">Archivé</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="season">Saison</Label>
                    <Select
                      value={season || 'none'}
                      onValueChange={(v) => setSeason(v === 'none' ? '' : v)}
                      disabled={isAnalyzing}
                    >
                      <SelectTrigger id="season">
                        <SelectValue placeholder="Sélectionner une saison" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucune</SelectItem>
                        {SEASONS.map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tags nutritionnels (max 3)</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {nutritionTags.map(tag => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          {tag}
                          <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    {nutritionTags.length < 3 && (
                      <Select onValueChange={addTag} value="" disabled={isAnalyzing}>
                        <SelectTrigger>
                          <SelectValue placeholder="Ajouter un tag..." />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_TAGS.filter(t => !nutritionTags.includes(t)).map(tag => (
                            <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CollapsibleSection>
            </motion.div>

            <motion.div variants={fadeInUpVariants} transition={fadeInUpTransition(1)} initial={reduceMotion ? false : 'initial'} animate="animate">
              <CollapsibleSection title="Ingrédients" defaultOpen>
                <IngredientEditor ingredients={ingredients} onChange={setIngredients} />
              </CollapsibleSection>
            </motion.div>

            <motion.div variants={fadeInUpVariants} transition={fadeInUpTransition(2)} initial={reduceMotion ? false : 'initial'} animate="animate">
              <CollapsibleSection title="Étapes" defaultOpen>
                <StepsEditor steps={steps} onChange={setSteps} />
              </CollapsibleSection>
            </motion.div>

            <Button
              type="submit"
              className="w-full"
              disabled={createRecipe.isPending || isAnalyzing || !title.trim()}
            >
              <Save className="mr-2 h-4 w-4" />
              {createRecipe.isPending ? 'Enregistrement...' : 'Enregistrer la recette'}
            </Button>
          </form>
        )}
```

- [ ] **Step 7: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/pages/RecipeNew.test.tsx`
Expected: PASS

- [ ] **Step 8: Vérifier le build complet**

Run: `npm run build`
Expected: build réussit sans erreur TypeScript.

- [ ] **Step 9: Commit**

```bash
git add src/pages/RecipeNew.tsx src/pages/RecipeNew.test.tsx
git commit -m "feat: sections repliables et restyle pour RecipeNew"
```

---

### Task 3: Restructurer RecipeEdit.tsx en sections repliables + restyle

**Files:**
- Modify: `src/pages/RecipeEdit.tsx`
- Test: `src/pages/RecipeEdit.test.tsx` (nouveau)

- [ ] **Step 1: Écrire le test (smoke test sur la structure repliable)**

Créer `src/pages/RecipeEdit.test.tsx` :

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import RecipeEdit from "./RecipeEdit";
import type { Recipe } from "@/types/recipe";

const mockRecipe: Recipe = {
  id: "r1",
  title: "Tarte aux pommes",
  status: "draft",
  servings: 4,
  ingredients: [],
  steps: [],
  nutrition_tags: null,
  season: null,
  source_type: "manual",
  source_image_url: null,
  is_favorite: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  user_id: "u1",
} as unknown as Recipe;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock("@/hooks/useRecipes", () => ({
  useRecipe: () => ({ data: mockRecipe, isLoading: false }),
  useUpdateRecipe: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRecipe: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(), getUser: vi.fn() },
    storage: { from: vi.fn() },
  },
}));

describe("RecipeEdit", () => {
  it("affiche les sections repliables avec les données de la recette", () => {
    render(
      <MemoryRouter initialEntries={["/recipes/r1/edit"]}>
        <Routes>
          <Route path="/recipes/:id/edit" element={<RecipeEdit />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Informations générales")).toBeInTheDocument();
    expect(screen.getByText("Ingrédients")).toBeInTheDocument();
    expect(screen.getByText("Étapes")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tarte aux pommes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/pages/RecipeEdit.test.tsx`
Expected: FAIL — "Informations générales" / "Ingrédients" / "Étapes" introuvables.

- [ ] **Step 3: Importer `CollapsibleSection`, `motion`/`useReducedMotion` et la variante d'animation**

Dans `src/pages/RecipeEdit.tsx`, ajouter aux imports (après la ligne 29) :

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import { CollapsibleSection } from '@/components/profile/CollapsibleSection';
import { fadeInUpVariants, fadeInUpTransition } from '@/lib/motion';
```

- [ ] **Step 4: Récupérer `reduceMotion` dans le composant**

Juste après `const deleteRecipe = useDeleteRecipe();` (ligne 48), ajouter :

```tsx
  const reduceMotion = useReducedMotion();
```

- [ ] **Step 5: Restructurer le formulaire en 3 sections repliables (lignes 161-276)**

Remplacer le `<form id="recipe-edit-form" ...> ... </form>` (lignes 161-276) par :

```tsx
        <form
          id="recipe-edit-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <motion.div variants={fadeInUpVariants} transition={fadeInUpTransition(0)} initial={reduceMotion ? false : 'initial'} animate="animate">
            <CollapsibleSection title="Informations générales" defaultOpen>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Titre *</Label>
                  <Input
                    id="title"
                    placeholder="Ex: Tarte aux pommes de mamie"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setIsDirty(true); }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="servings">Portions</Label>
                    <Input
                      id="servings"
                      type="number"
                      min="1"
                      placeholder="4"
                      value={servings}
                      onChange={(e) => { setServings(e.target.value ? parseInt(e.target.value) : ''); setIsDirty(true); }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Statut</Label>
                    <Select value={status} onValueChange={(v) => { setStatus(v as RecipeStatus); setIsDirty(true); }}>
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Brouillon</SelectItem>
                        <SelectItem value="tested">Testé</SelectItem>
                        <SelectItem value="validated">Validé</SelectItem>
                        <SelectItem value="archived">Archivé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="season">Saison</Label>
                  <Select value={season || "none"} onValueChange={(v) => { setSeason(v === "none" ? "" : v); setIsDirty(true); }}>
                    <SelectTrigger id="season">
                      <SelectValue placeholder="Sélectionner une saison" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      {SEASONS.map(s => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tags nutritionnels (max 3)</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {nutritionTags.map(tag => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  {nutritionTags.length < 3 && (
                    <Select onValueChange={addTag} value="">
                      <SelectTrigger>
                        <SelectValue placeholder="Ajouter un tag..." />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_TAGS.filter(t => !nutritionTags.includes(t)).map(tag => (
                          <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CollapsibleSection>
          </motion.div>

          <motion.div variants={fadeInUpVariants} transition={fadeInUpTransition(1)} initial={reduceMotion ? false : 'initial'} animate="animate">
            <CollapsibleSection title="Ingrédients" defaultOpen>
              <IngredientEditor ingredients={ingredients} onChange={(v) => { setIngredients(v); setIsDirty(true); }} />
            </CollapsibleSection>
          </motion.div>

          <motion.div variants={fadeInUpVariants} transition={fadeInUpTransition(2)} initial={reduceMotion ? false : 'initial'} animate="animate">
            <CollapsibleSection title="Étapes" defaultOpen>
              <StepsEditor steps={steps} onChange={(v) => { setSteps(v); setIsDirty(true); }} />
            </CollapsibleSection>
          </motion.div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" className="flex-1 min-w-0" disabled={updateRecipe.isPending}>
              <Save className="mr-2 h-4 w-4 shrink-0" />
              <span className="truncate">{updateRecipe.isPending ? 'Enregistrement...' : 'Enregistrer'}</span>
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="text-destructive shrink-0">
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="sm:inline hidden">Supprimer</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer cette recette ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. La recette "{recipe.title}" sera définitivement supprimée.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </form>
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/pages/RecipeEdit.test.tsx`
Expected: PASS

- [ ] **Step 7: Vérifier le build complet**

Run: `npm run build`
Expected: build réussit sans erreur TypeScript.

- [ ] **Step 8: Commit**

```bash
git add src/pages/RecipeEdit.tsx src/pages/RecipeEdit.test.tsx
git commit -m "feat: sections repliables et restyle pour RecipeEdit"
```

---

### Task 4: Restyler la page Profil (cartes, avatar, CollapsibleSection)

**Files:**
- Modify: `src/pages/Profile.tsx`
- Modify: `src/components/profile/CollapsibleSection.tsx`

- [ ] **Step 1: Harmoniser les rayons/ombres de `CollapsibleSection` et la couleur de l'icône**

Dans `src/components/profile/CollapsibleSection.tsx`, remplacer :

```tsx
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
```

par :

```tsx
      <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
```

Et remplacer :

```tsx
            {icon && <span className="text-muted-foreground">{icon}</span>}
```

par :

```tsx
            {icon && <span className="text-primary">{icon}</span>}
```

- [ ] **Step 2: Harmoniser les cartes "Informations personnelles" et "Apparence" dans Profile.tsx**

Dans `src/pages/Profile.tsx`, ligne 151, remplacer :

```tsx
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-muted-foreground"><User className="h-5 w-5" /></span>
```

par :

```tsx
        <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-primary"><User className="h-5 w-5" /></span>
```

Ligne 224, remplacer :

```tsx
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-muted-foreground"><Sun className="h-5 w-5" /></span>
```

par :

```tsx
        <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-primary"><Sun className="h-5 w-5" /></span>
```

- [ ] **Step 3: Ajouter une légère animation au survol de l'avatar**

Dans `src/pages/Profile.tsx`, ligne 163, remplacer :

```tsx
                <Avatar className="h-24 w-24">
```

par :

```tsx
                <Avatar className="h-24 w-24 transition-transform duration-200 hover:scale-105">
```

- [ ] **Step 4: Lancer les tests existants liés au profil**

Run: `npx vitest run src/components/profile`
Expected: PASS (aucun test existant ne casse — changements de classes Tailwind uniquement).

- [ ] **Step 5: Vérifier le build complet**

Run: `npm run build`
Expected: build réussit sans erreur TypeScript.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Profile.tsx src/components/profile/CollapsibleSection.tsx
git commit -m "style: harmonise la page Profil avec l'identite Grimoire"
```

---

### Task 5: Restyler la page Planning de repas (cartes jour, dialog, animations)

**Files:**
- Modify: `src/pages/MealPlanning.tsx`

- [ ] **Step 1: Importer `useReducedMotion`, `motion` et la variante d'animation**

Dans `src/pages/MealPlanning.tsx`, ajouter aux imports (après la ligne 5) :

```tsx
import { motion, useReducedMotion } from 'framer-motion';
import { fadeInUpVariants, fadeInUpTransition } from '@/lib/motion';
```

- [ ] **Step 2: Récupérer `reduceMotion` dans le composant**

Juste après `const queryClient = useQueryClient();` (ligne 82), ajouter :

```tsx
  const reduceMotion = useReducedMotion();
```

- [ ] **Step 3: Restyler la carte du jour courant et appliquer l'animation séquencée**

Remplacer (lignes 283-287) :

```tsx
              return (
                <Card
                  key={dayIndex}
                  className={`p-3 ${isToday ? 'ring-2 ring-primary/30 bg-primary/5' : ''}`}
                >
```

par :

```tsx
              return (
                <motion.div
                  key={dayIndex}
                  variants={fadeInUpVariants}
                  transition={fadeInUpTransition(dayIndex)}
                  initial={reduceMotion ? false : 'initial'}
                  animate="animate"
                >
                <Card
                  className={`p-3 rounded-2xl border-border ${isToday ? 'border-accent bg-primary/5' : ''}`}
                >
```

Puis, à la fin de la boucle (ligne 347-348), remplacer :

```tsx
                </Card>
              );
            })}
```

par :

```tsx
                </Card>
                </motion.div>
              );
            })}
```

- [ ] **Step 4: Restyler les boutons "Ajouter"**

Remplacer (lignes 329-343) :

```tsx
                      return (
                        <button
                          key={key}
                          onClick={() => openAddDialog(dayIndex, key)}
                          aria-label={`Ajouter ${label} le ${DAY_NAMES[dayIndex]} ${format(day, 'd MMM', { locale: fr })}`}
                          className="flex items-center gap-2 w-full text-left group/add"
                        >
                          <span className="text-xs shrink-0 opacity-40">{icon}</span>
                          <span className="text-xs text-muted-foreground/50 shrink-0 w-14">{label}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground/40 group-hover/add:text-muted-foreground transition-colors">
                            <Plus className="h-3 w-3" />
                            Ajouter
                          </span>
                        </button>
                      );
```

par :

```tsx
                      return (
                        <button
                          key={key}
                          onClick={() => openAddDialog(dayIndex, key)}
                          aria-label={`Ajouter ${label} le ${DAY_NAMES[dayIndex]} ${format(day, 'd MMM', { locale: fr })}`}
                          className="flex items-center gap-2 w-full text-left group/add"
                        >
                          <span className="text-xs shrink-0 opacity-40">{icon}</span>
                          <span className="text-xs text-muted-foreground/50 shrink-0 w-14">{label}</span>
                          <span className="flex items-center gap-1 text-xs text-primary/50 group-hover/add:text-primary transition-colors">
                            <Plus className="h-3 w-3" />
                            Ajouter
                          </span>
                        </button>
                      );
```

- [ ] **Step 5: Restyler les inputs du dialog d'ajout de repas**

Remplacer (ligne 370-377) :

```tsx
              <Input
                placeholder="Rechercher…"
                value={recipeSearch}
                onChange={e => {
                  setRecipeSearch(e.target.value);
                  setSelectedRecipeId(null);
                }}
              />
```

par :

```tsx
              <Input
                placeholder="Rechercher…"
                value={recipeSearch}
                onChange={e => {
                  setRecipeSearch(e.target.value);
                  setSelectedRecipeId(null);
                }}
                className="rounded-2xl focus-visible:ring-accent"
              />
```

Et remplacer (ligne 407-417) :

```tsx
              <Input
                placeholder="Ex : Pasta bolognaise maison"
                value={customMealText}
                onChange={e => {
                  setCustomMealText(e.target.value);
                  if (e.target.value.trim()) {
                    setSelectedRecipeId(null);
                    setRecipeSearch('');
                  }
                }}
              />
```

par :

```tsx
              <Input
                placeholder="Ex : Pasta bolognaise maison"
                value={customMealText}
                onChange={e => {
                  setCustomMealText(e.target.value);
                  if (e.target.value.trim()) {
                    setSelectedRecipeId(null);
                    setRecipeSearch('');
                  }
                }}
                className="rounded-2xl focus-visible:ring-accent"
              />
```

- [ ] **Step 6: Lancer les tests existants liés au planning de repas**

Run: `npx vitest run src/components/meal-planning`
Expected: PASS (aucun test existant ne casse — changements de classes Tailwind et animation uniquement).

- [ ] **Step 7: Vérifier le build complet**

Run: `npm run build`
Expected: build réussit sans erreur TypeScript.

- [ ] **Step 8: Commit**

```bash
git add src/pages/MealPlanning.tsx
git commit -m "style: harmonise la page Planning de repas avec l'identite Grimoire"
```

---

### Task 6: Vérification finale transversale

**Files:**
- None (vérification uniquement)

- [ ] **Step 1: Vérifier l'absence de classes typographiques obsolètes**

Run: `grep -rn "font-playfair\|font-display" src/pages/RecipeNew.tsx src/pages/RecipeEdit.tsx src/pages/Profile.tsx src/pages/MealPlanning.tsx`
Expected: aucune occurrence (sortie vide). Si des occurrences apparaissent, les remplacer par rien (les `h1`-`h6` héritent déjà de `font-solitreo` via `src/index.css`).

- [ ] **Step 2: Lancer la suite de tests complète**

Run: `npm run test:run`
Expected: tous les tests passent (y compris les nouveaux tests `RecipeNew.test.tsx` et `RecipeEdit.test.tsx`).

- [ ] **Step 3: Lancer le lint et le build**

Run: `npm run lint && npm run build`
Expected: build réussit ; lint informatif (non-bloquant selon `CLAUDE.md`), corriger uniquement les nouvelles erreurs introduites par ce chantier.

- [ ] **Step 4: Test manuel en navigateur**

Run: `npm run dev` puis ouvrir `http://localhost:8080`.

Vérifier :
- `/recipes/new` (mode manuel et mode photo) : 3 sections repliables ouvertes par défaut, cartes mode-selector restylées, animation d'apparition douce
- `/recipes/:id/edit` : mêmes 3 sections, données pré-remplies, suppression toujours fonctionnelle
- `/profile` : cartes harmonisées, icônes en sauge, avatar avec effet hover
- `/meal-planning` : cartes jour restylées, carte du jour courant avec bordure dorée, apparition séquencée des 7 cartes, dialog d'ajout restylé

Activer "Réduire les animations" dans les préférences système et vérifier qu'aucune animation fade-in-up ne se déclenche (apparition instantanée).

- [ ] **Step 5: Commit final si des ajustements ont été faits**

```bash
git add -A
git commit -m "fix: ajustements suite a la verification finale phase 2"
```
(Ne committer que s'il y a eu des modifications à l'étape 1 ou suite aux vérifications.)
