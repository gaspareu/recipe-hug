# Export Cookidoo asynchrone — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'export d'une recette vers Cookidoo non bloquant, et conserver en base une trace exploitable de chaque export (succès, échec, qualité du contenu envoyé).

**Architecture:** L'edge function `export-recipe-cookidoo` se scinde en deux phases. La phase synchrone (auth, lecture, mapping, validation) crée une ligne `cookidoo_exports` au statut `pending` et répond immédiatement. La phase asynchrone (`EdgeRuntime.waitUntil`) exécute le travail réseau et met la ligne à jour. Le front interroge cette ligne toutes les 2 s tant qu'elle est `pending`, puis affiche le toast final.

**Tech Stack:** Deno (edge functions), Supabase Postgres + RLS, TanStack Query v5, React 18, Vitest, `deno test`.

**Spec de référence :** `docs/superpowers/specs/2026-07-19-export-cookidoo-asynchrone-design.md`

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260719000000_cookidoo_exports.sql` *(créer)* | Table `cookidoo_exports`, RLS (lecture propriétaire, écriture service role) |
| `supabase/functions/_shared/cookidoo/diagnostics.ts` *(créer)* | `buildExportDiagnostics` — fonction pure, sans réseau |
| `supabase/functions/_shared/cookidoo/diagnostics_test.ts` *(créer)* | Tests Deno de la fonction pure |
| `supabase/functions/_shared/cookidoo/run-export.ts` *(créer)* | Orchestration create/update → fill → image → contrôle, dépendances injectées |
| `supabase/functions/_shared/cookidoo/run-export_test.ts` *(créer)* | Tests Deno de l'orchestration, avec doublures |
| `supabase/functions/export-recipe-cookidoo/index.ts` *(modifier)* | Auth, validation, création du job, `waitUntil`, réponse |
| `src/hooks/useCookidooExport.ts` *(créer)* | Déclenchement + interrogation périodique |
| `src/hooks/useCookidooExport.test.tsx` *(créer)* | Tests Vitest du hook |
| `src/components/recipes/ExportToCookidooButton.tsx` *(modifier)* | Branchement sur le nouveau flux + toasts |

**Écart assumé par rapport à la spec :** la spec plaçait le `login` Cookidoo dans `run-export.ts`. Il reste dans `index.ts`. Raison : `login` a besoin des identifiants déchiffrés, qui n'ont rien à faire dans un module d'orchestration de recette. `runExport` reçoit un `ClientCtx` déjà authentifié, ce qui le rend testable sans simuler tout le flow de connexion.

---

## Task 1 : Table `cookidoo_exports`

**Files:**
- Create: `supabase/migrations/20260719000000_cookidoo_exports.sql`

Cette table n'est pas testable par test unitaire ; sa validation est l'application de la migration et une requête de contrôle.

- [ ] **Step 1: Écrire la migration**

```sql
-- Journal des exports Cookidoo.
--
-- Sert deux usages avec une seule source de vérité :
--   1. suivi d'état — le front interroge la ligne pour savoir quand l'export
--      asynchrone est terminé et afficher le bon retour ;
--   2. journal d'analyse — `diagnostics` conserve la qualité du contenu envoyé,
--      ce qui permet de répondre après coup à « pourquoi la recette est mal
--      configurée sur Cookidoo » sans refaire un export en observant le réseau.
CREATE TABLE public.cookidoo_exports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recipe_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed')),
  cookidoo_recipe_id TEXT,
  cookidoo_url TEXT,
  updated BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT,
  error_message TEXT,
  warnings TEXT[] NOT NULL DEFAULT '{}',
  unguided_steps INT[] NOT NULL DEFAULT '{}',
  diagnostics JSONB,
  duration_ms INT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE
);

-- Interrogation par le front : « ma ligne, par id ». Index sur le propriétaire
-- pour les requêtes d'analyse (historique des exports d'un utilisateur).
CREATE INDEX cookidoo_exports_user_created_idx
  ON public.cookidoo_exports (user_id, created_at DESC);

ALTER TABLE public.cookidoo_exports ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour le propriétaire. Aucune policy d'écriture : les insertions
-- et mises à jour passent exclusivement par l'edge function en service role,
-- qui contourne la RLS. Un client ne peut donc pas fabriquer de fausse entrée
-- de journal ni maquiller un échec en succès.
CREATE POLICY "Users can view their own Cookidoo exports"
ON public.cookidoo_exports
FOR SELECT
USING (auth.uid() = user_id);

COMMENT ON TABLE public.cookidoo_exports IS
  'Journal des exports vers Cookidoo : suivi d''état pour le front, diagnostic de qualité pour l''analyse.';
COMMENT ON COLUMN public.cookidoo_exports.diagnostics IS
  'Qualité du payload envoyé : steps_total, steps_with_tm7, steps_guided, annotations, ingredients_count, has_image, tools.';
COMMENT ON COLUMN public.cookidoo_exports.unguided_steps IS
  'Index des étapes dont Cookidoo a dégradé les annotations en simple texte (vue appareil).';
COMMENT ON COLUMN public.cookidoo_exports.finished_at IS
  'Nul sur une ligne pending : une ligne pending ancienne signale un isolate tué avant la fin.';
```

- [ ] **Step 2: Appliquer la migration**

Via le MCP Supabase, outil `apply_migration`, nom `cookidoo_exports`, avec le contenu SQL ci-dessus.

Attendu : succès sans erreur.

**Pourquoi manuellement, alors que les migrations s'appliquent seules au merge.** Dans ce projet, l'intégration native Supabase↔GitHub applique `supabase/migrations/` à chaque merge sur `main` — c'est le mécanisme normal, à ne pas court-circuiter d'habitude. Ici on l'applique en avance parce que les tâches 5 à 7 en dépendent : sans la table, les types ne peuvent pas être générés et le front ne peut pas être testé. L'opération est additive (création d'une table neuve, aucune donnée touchée) et `apply_migration` l'enregistre dans l'historique, donc le merge ne la rejouera pas.

- [ ] **Step 3: Vérifier la structure et la RLS**

Via le MCP Supabase, outil `execute_sql` :

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'cookidoo_exports'
ORDER BY ordinal_position;

SELECT policyname, cmd FROM pg_policies WHERE tablename = 'cookidoo_exports';
```

Attendu : 15 colonnes ; exactement une policy, `SELECT`. Si une policy d'écriture apparaît, la supprimer — elle ouvrirait la falsification du journal.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260719000000_cookidoo_exports.sql
git commit -m "feat: table de journal des exports Cookidoo"
```

---

## Task 2 : `buildExportDiagnostics`

**Files:**
- Create: `supabase/functions/_shared/cookidoo/diagnostics.ts`
- Test: `supabase/functions/_shared/cookidoo/diagnostics_test.ts`

Fonction pure : elle compare la recette source au payload produit, ce qui permet de distinguer « l'IA n'a pas généré de paramètres machine » de « le mapper n'a pas produit d'annotations ».

- [ ] **Step 1: Écrire les tests qui échouent**

Contenu complet de `diagnostics_test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildExportDiagnostics } from "./diagnostics.ts";
import type { Recipe } from "./types.ts";
import type { CookidooRecipePayload } from "./types.ts";

function payloadWith(
  instructions: CookidooRecipePayload["instructions"],
  image: string | null = null,
): CookidooRecipePayload {
  return {
    name: "Test",
    image,
    isImageOwnedByUser: false,
    tools: ["TM7"],
    yield: { value: 4, unitText: "portions" },
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    ingredients: [{ type: "INGREDIENT", text: "200 g de farine" }],
    instructions,
    hints: "",
    workStatus: "PRIVATE",
    recipeMetadata: { requiresAnnotationsCheck: false },
  };
}

Deno.test("compte les étapes, les annotations et les ingrédients", () => {
  const recipe: Recipe = {
    title: "Test",
    servings: 4,
    ingredients: [{ name: "farine", quantity: 200, unit: "g" }],
    steps: [
      { order: 1, text: "Mixer", tm7: { mode: "mix", seconds: 30, speed: "5" } },
      { order: 2, text: "Verser" },
    ],
  };
  const payload = payloadWith([
    {
      type: "STEP",
      text: "Mixer 30 s / vitesse 5",
      annotations: [
        { type: "TTS", data: {}, position: { offset: 0, length: 5 } },
        { type: "INGREDIENT", data: {}, position: { offset: 0, length: 5 } },
      ],
    },
    { type: "STEP", text: "Verser", annotations: [] },
  ]);

  const diag = buildExportDiagnostics(recipe, payload);

  assertEquals(diag.steps_total, 2);
  assertEquals(diag.steps_with_tm7, 1);
  assertEquals(diag.steps_guided, 1);
  assertEquals(diag.annotations, { TTS: 1, INGREDIENT: 1 });
  assertEquals(diag.ingredients_count, 1);
  assertEquals(diag.tools, ["TM7"]);
});

Deno.test("une étape annotée uniquement INGREDIENT n'est pas guidée", () => {
  // C'est la distinction qui compte : une liaison d'ingrédient ne déclenche
  // aucun réglage machine sur le TM7, contrairement à TTS ou MODE.
  const recipe: Recipe = {
    title: "Test",
    ingredients: [],
    steps: [{ order: 1, text: "Ajouter la farine" }],
  };
  const payload = payloadWith([
    {
      type: "STEP",
      text: "Ajouter la farine",
      annotations: [{ type: "INGREDIENT", data: {}, position: { offset: 8, length: 9 } }],
    },
  ]);

  const diag = buildExportDiagnostics(recipe, payload);

  assertEquals(diag.steps_guided, 0);
  assertEquals(diag.annotations, { INGREDIENT: 1 });
});

Deno.test("signale l'absence d'image", () => {
  const recipe: Recipe = { title: "Test", ingredients: [], steps: [] };

  assertEquals(buildExportDiagnostics(recipe, payloadWith([], null)).has_image, false);
  assertEquals(buildExportDiagnostics(recipe, payloadWith([], "https://x/i.jpg")).has_image, true);
});

Deno.test("recette vide : tous les compteurs à zéro", () => {
  const recipe: Recipe = { title: "Vide", ingredients: [], steps: [] };
  const payload = payloadWith([]);
  payload.ingredients = [];

  const diag = buildExportDiagnostics(recipe, payload);

  assertEquals(diag.steps_total, 0);
  assertEquals(diag.steps_with_tm7, 0);
  assertEquals(diag.steps_guided, 0);
  assertEquals(diag.annotations, {});
  assertEquals(diag.ingredients_count, 0);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
~/.deno/bin/deno test --allow-env supabase/functions/_shared/cookidoo/diagnostics_test.ts
```

Attendu : ÉCHEC — `Module not found "./diagnostics.ts"`.

Note : `deno` n'est pas dans le PATH sur cette machine, il est sous `~/.deno/bin`.

- [ ] **Step 3: Écrire l'implémentation**

Contenu complet de `diagnostics.ts` :

```ts
/**
 * Diagnostic de qualité d'un export Cookidoo.
 *
 * Compare la recette source au payload produit. C'est ce qui permet de
 * distinguer deux causes très différentes d'une recette mal configurée sur
 * Cookidoo : soit la recette n'avait pas de paramètres machine dès le départ
 * (`steps_with_tm7` bas → problème de génération, en amont), soit elle en avait
 * mais le mapper n'a pas produit d'annotations (`steps_guided` bas alors que
 * `steps_with_tm7` est haut → problème de connecteur).
 */
import type { CookidooRecipePayload, Recipe } from "./types.ts";

export interface ExportDiagnostics {
  steps_total: number;
  /** Étapes portant des paramètres machine dans la recette source. */
  steps_with_tm7: number;
  /** Étapes ayant reçu une annotation déclenchant un réglage TM7 (TTS ou MODE). */
  steps_guided: number;
  annotations: Record<string, number>;
  ingredients_count: number;
  has_image: boolean;
  tools: string[];
}

export function buildExportDiagnostics(
  recipe: Recipe,
  payload: CookidooRecipePayload,
): ExportDiagnostics {
  const annotations: Record<string, number> = {};
  let stepsGuided = 0;

  for (const step of payload.instructions) {
    // Une annotation INGREDIENT ne fait que lier un texte à un ingrédient :
    // elle ne rend pas l'étape guidée.
    if (step.annotations.some((a) => a.type !== "INGREDIENT")) stepsGuided++;
    for (const annotation of step.annotations) {
      annotations[annotation.type] = (annotations[annotation.type] ?? 0) + 1;
    }
  }

  return {
    steps_total: recipe.steps.length,
    steps_with_tm7: recipe.steps.filter((s) => s.tm7).length,
    steps_guided: stepsGuided,
    annotations,
    ingredients_count: payload.ingredients.length,
    has_image: payload.image !== null,
    tools: [...payload.tools],
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
~/.deno/bin/deno test --allow-env supabase/functions/_shared/cookidoo/diagnostics_test.ts
```

Attendu : 4 tests, tous verts.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cookidoo/diagnostics.ts supabase/functions/_shared/cookidoo/diagnostics_test.ts
git commit -m "feat: diagnostic de qualité du payload Cookidoo"
```

---

## Task 3 : Extraire l'orchestration dans `run-export.ts`

**Files:**
- Create: `supabase/functions/_shared/cookidoo/run-export.ts`
- Test: `supabase/functions/_shared/cookidoo/run-export_test.ts`

L'orchestration vit aujourd'hui dans le corps de `serve()` — donc intestable. On l'extrait avec ses dépendances injectées, sans changer son comportement.

- [ ] **Step 1: Écrire les tests qui échouent**

Contenu complet de `run-export_test.ts` :

```ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { PartialCreateError, runExport, type CookidooOps } from "./run-export.ts";
import type { ClientCtx } from "./client.ts";
import type { CookidooRecipePayload } from "./types.ts";

const ctx: ClientCtx = { cookieHeader: "cookie", lang: "fr" };

function payload(guided = true): CookidooRecipePayload {
  return {
    name: "Tarte",
    image: null,
    isImageOwnedByUser: false,
    tools: ["TM7"],
    yield: { value: 4, unitText: "portions" },
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    ingredients: [],
    instructions: [
      {
        type: "STEP",
        text: "Mixer",
        annotations: guided ? [{ type: "TTS", data: {}, position: { offset: 0, length: 5 } }] : [],
      },
    ],
    hints: "",
    workStatus: "PRIVATE",
    recipeMetadata: { requiresAnnotationsCheck: false },
  };
}

/** Doublure : chaque opération réussit, et enregistre son appel. */
function fakeOps(overrides: Partial<CookidooOps> = {}): CookidooOps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getRecipe: (_c, id) => { calls.push(`get:${id}`); return Promise.resolve({}); },
    createRecipe: (_c, name) => { calls.push(`create:${name}`); return Promise.resolve("new-id"); },
    fillRecipe: (_c, id) => { calls.push(`fill:${id}`); return Promise.resolve(); },
    renameRecipe: (_c, id) => { calls.push(`rename:${id}`); return Promise.resolve(); },
    deleteRecipe: (_c, id) => { calls.push(`delete:${id}`); return Promise.resolve(); },
    uploadRecipeImage: (_c, id) => { calls.push(`image:${id}`); return Promise.resolve(); },
    findUnguidedSteps: () => { calls.push("check"); return Promise.resolve([]); },
    recipeWebUrl: (_c, id) => `https://cookidoo.fr/created-recipes/fr/r/${id}`,
    ...overrides,
  };
}

const noSleep = () => Promise.resolve();

Deno.test("création : crée puis remplit, et renvoie l'URL", async () => {
  const ops = fakeOps();

  const out = await runExport(
    { ctx, payload: payload(), existingId: null, supabaseHost: "db.example.com" },
    ops,
    noSleep,
  );

  assertEquals(out.cookidoo_recipe_id, "new-id");
  assertEquals(out.updated, false);
  assertEquals(out.url, "https://cookidoo.fr/created-recipes/fr/r/new-id");
  assertEquals(ops.calls.includes("create:Tarte"), true);
  assertEquals(ops.calls.includes("fill:new-id"), true);
});

Deno.test("ré-export : réutilise l'identifiant existant sans créer de doublon", async () => {
  const ops = fakeOps();

  const out = await runExport(
    { ctx, payload: payload(), existingId: "old-id", supabaseHost: "db.example.com" },
    ops,
    noSleep,
  );

  assertEquals(out.cookidoo_recipe_id, "old-id");
  assertEquals(out.updated, true);
  assertEquals(ops.calls.some((c) => c.startsWith("create:")), false);
});

Deno.test("échec du remplissage après création : supprime la recette et relaie l'erreur", async () => {
  const ops = fakeOps({
    fillRecipe: () => Promise.reject(new Error("HTTP 500")),
  });

  await assertRejects(
    () => runExport(
      { ctx, payload: payload(), existingId: null, supabaseHost: "db.example.com" },
      ops,
      noSleep,
    ),
    Error,
    "HTTP 500",
  );

  assertEquals(ops.calls.includes("delete:new-id"), true);
});

Deno.test("remplissage ET suppression en échec : PartialCreateError portant l'identifiant", async () => {
  // Cas à ne surtout pas confondre avec un échec ordinaire : une recette vide
  // subsiste sur le compte Cookidoo et exige un nettoyage manuel.
  const ops = fakeOps({
    fillRecipe: () => Promise.reject(new Error("HTTP 500")),
    deleteRecipe: () => Promise.reject(new Error("HTTP 403")),
  });

  const err = await assertRejects(
    () => runExport(
      { ctx, payload: payload(), existingId: null, supabaseHost: "db.example.com" },
      ops,
      noSleep,
    ),
    PartialCreateError,
  );

  assertEquals(err.cookidooRecipeId, "new-id");
});

Deno.test("image absente : avertissement no_image, export réussi", async () => {
  const ops = fakeOps();

  const out = await runExport(
    { ctx, payload: payload(), existingId: null, supabaseHost: "db.example.com" },
    ops,
    noSleep,
  );

  assertEquals(out.warnings, ["no_image"]);
});

Deno.test("échec de l'upload d'image : avertissement, export réussi quand même", async () => {
  const ops = fakeOps({
    uploadRecipeImage: () => Promise.reject(new Error("cloudinary down")),
  });

  const out = await runExport(
    {
      ctx,
      payload: payload(),
      existingId: null,
      imageUrl: "https://x/image.jpg",
      supabaseHost: "db.example.com",
    },
    ops,
    noSleep,
  );

  assertEquals(out.warnings, ["image_not_transferred"]);
  assertEquals(out.cookidoo_recipe_id, "new-id");
});

Deno.test("étapes dégradées par Cookidoo : avertissement et index conservés", async () => {
  const ops = fakeOps({ findUnguidedSteps: () => Promise.resolve([0]) });

  const out = await runExport(
    { ctx, payload: payload(), existingId: null, supabaseHost: "db.example.com" },
    ops,
    noSleep,
  );

  assertEquals(out.unguided_steps, [0]);
  assertEquals(out.warnings.includes("steps_not_guided"), true);
});

Deno.test("échec du contrôle guided cooking : n'invalide pas l'export", async () => {
  const ops = fakeOps({ findUnguidedSteps: () => Promise.reject(new Error("HTTP 429")) });

  const out = await runExport(
    { ctx, payload: payload(), existingId: null, supabaseHost: "db.example.com" },
    ops,
    noSleep,
  );

  assertEquals(out.cookidoo_recipe_id, "new-id");
  assertEquals(out.unguided_steps, []);
});

Deno.test("aucune étape guidée attendue : pas de contrôle appareil", async () => {
  const ops = fakeOps();

  await runExport(
    { ctx, payload: payload(false), existingId: null, supabaseHost: "db.example.com" },
    ops,
    noSleep,
  );

  assertEquals(ops.calls.includes("check"), false);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
~/.deno/bin/deno test --allow-env supabase/functions/_shared/cookidoo/run-export_test.ts
```

Attendu : ÉCHEC — `Module not found "./run-export.ts"`.

- [ ] **Step 3: Écrire l'implémentation**

Contenu complet de `run-export.ts` :

```ts
/**
 * Orchestration d'un export vers Cookidoo, à partir d'un contexte déjà
 * authentifié.
 *
 * Les opérations réseau sont injectées (`CookidooOps`) plutôt qu'importées
 * directement : c'est ce qui rend l'enchaînement testable — notamment les
 * chemins d'échec (rollback, dégradation des annotations), impossibles à
 * provoquer contre l'API réelle.
 *
 * Le `login` reste volontairement en dehors : il dépend des identifiants
 * déchiffrés, qui n'ont rien à faire ici.
 */
import type { ClientCtx } from "./client.ts";
import type { CookidooRecipePayload } from "./types.ts";

/** Recette créée sur Cookidoo mais ni remplie ni supprimable : nettoyage manuel requis. */
export class PartialCreateError extends Error {
  // `override` est exigé : `cause` masque `Error.cause` (ES2022).
  constructor(public readonly cookidooRecipeId: string, public override readonly cause: unknown) {
    super(
      `Recette partiellement créée sur Cookidoo (id ${cookidooRecipeId}) : ` +
        `le remplissage a échoué et la suppression automatique aussi. ` +
        `Supprimez-la depuis Cookidoo, ou via le CLI (--delete ${cookidooRecipeId}).`,
    );
    this.name = "PartialCreateError";
  }
}

export interface CookidooOps {
  getRecipe(ctx: ClientCtx, id: string): Promise<unknown>;
  createRecipe(ctx: ClientCtx, name: string): Promise<string>;
  fillRecipe(ctx: ClientCtx, id: string, payload: CookidooRecipePayload): Promise<void>;
  renameRecipe(ctx: ClientCtx, id: string, name: string): Promise<void>;
  deleteRecipe(ctx: ClientCtx, id: string): Promise<void>;
  uploadRecipeImage(ctx: ClientCtx, id: string, imageUrl: string, host: string): Promise<void>;
  findUnguidedSteps(ctx: ClientCtx, id: string, expected: number[]): Promise<number[]>;
  recipeWebUrl(ctx: ClientCtx, id: string): string;
}

export interface RunExportInput {
  ctx: ClientCtx;
  payload: CookidooRecipePayload;
  /** Identifiant Cookidoo déjà associé à la recette, ou null. Voir `resolveExistingId`. */
  existingId: string | null;
  imageUrl?: string;
  /** Hôte Supabase, pour la validation anti-SSRF de l'URL d'image. */
  supabaseHost: string;
}

export interface ExportOutcome {
  cookidoo_recipe_id: string;
  url: string;
  updated: boolean;
  warnings: string[];
  unguided_steps: number[];
}

export type Sleep = (ms: number) => Promise<void>;

export async function runExport(
  input: RunExportInput,
  ops: CookidooOps,
  sleep: Sleep,
): Promise<ExportOutcome> {
  const { ctx, payload, existingId, imageUrl, supabaseHost } = input;
  const warnings: string[] = [];

  let id: string;
  if (existingId) {
    id = existingId;
    // Le champ de renommage en PATCH n'est pas confirmé (endpoints
    // non-officiels) → best-effort : un échec ne doit pas empêcher la mise à
    // jour du contenu.
    try {
      await ops.renameRecipe(ctx, id, payload.name);
      await sleep(2000);
    } catch (renameErr) {
      console.error("[run-export] rename", renameErr);
      warnings.push("title_not_updated");
    }
    await ops.fillRecipe(ctx, id, payload);
  } else {
    id = await ops.createRecipe(ctx, payload.name);
    await sleep(5000); // Cookidoo exige un délai avant les PATCH de remplissage
    try {
      await ops.fillRecipe(ctx, id, payload);
    } catch (fillErr) {
      // Rollback best-effort : ne pas laisser une recette vide sur Cookidoo.
      try {
        await ops.deleteRecipe(ctx, id);
      } catch {
        throw new PartialCreateError(id, fillErr);
      }
      throw fillErr; // rollback OK → échec classé normalement, sans résidu
    }
  }

  // Image : best-effort — un échec n'invalide pas l'export.
  if (imageUrl) {
    try {
      await sleep(2000);
      await ops.uploadRecipeImage(ctx, id, imageUrl, supabaseHost);
    } catch (imgErr) {
      console.error("[run-export] image", imgErr);
      warnings.push("image_not_transferred");
    }
  } else {
    warnings.push("no_image");
  }

  // Contrôle du guided cooking : l'API accepte des annotations qu'elle dégrade
  // ensuite en simple texte, sans erreur HTTP (cf. docs/COOKIDOO-CONTRAT.md §8).
  // La vue « appareil » est le seul endroit où ce silence devient visible.
  let unguided: number[] = [];
  const expectedGuided = payload.instructions
    .map((step, i) => (step.annotations.some((a) => a.type !== "INGREDIENT") ? i : -1))
    .filter((i) => i >= 0);
  if (expectedGuided.length > 0) {
    try {
      await sleep(2000);
      unguided = await ops.findUnguidedSteps(ctx, id, expectedGuided);
      if (unguided.length > 0) {
        // Le log liste les index concernés : c'est le point d'entrée du
        // diagnostic quand une recette arrive mal configurée sur l'appareil.
        console.error(`[run-export] étapes non guidées sur l'appareil : ${unguided.join(", ")}`);
        warnings.push("steps_not_guided");
      }
    } catch (checkErr) {
      // Contrôle best-effort : son échec ne remet pas en cause l'export.
      console.error("[run-export] contrôle guided cooking", checkErr);
    }
  }

  return {
    cookidoo_recipe_id: id,
    url: ops.recipeWebUrl(ctx, id),
    updated: existingId !== null,
    warnings,
    unguided_steps: unguided,
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
~/.deno/bin/deno test --allow-env supabase/functions/_shared/cookidoo/run-export_test.ts
```

Attendu : 9 tests, tous verts.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cookidoo/run-export.ts supabase/functions/_shared/cookidoo/run-export_test.ts
git commit -m "refactor: extrait l'orchestration de l'export Cookidoo, désormais testable"
```

---

## Task 4 : Passage en deux phases dans l'edge function

**Files:**
- Modify: `supabase/functions/export-recipe-cookidoo/index.ts` (réécriture du corps de `serve`, lignes 65-276)

Pas de test automatisé sur ce fichier : il n'est pas importable hors runtime edge (il appelle `serve` au chargement). La logique testable a été extraite aux tâches 2 et 3 ; ce qui reste ici est de la plomberie, validée par l'export réel de la tâche 7.

- [ ] **Step 1: Remplacer les imports**

Remplacer le bloc d'imports (lignes 10-29) par :

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptValue } from "../_shared/decrypt-keys.ts";
import { login, countryToLang } from "../_shared/cookidoo/auth.ts";
import {
  CookidooHttpError,
  createRecipe,
  deleteRecipe,
  fillRecipe,
  findUnguidedSteps,
  getRecipe,
  recipeWebUrl,
  renameRecipe,
  uploadRecipeImage,
  type ClientCtx,
} from "../_shared/cookidoo/client.ts";
import { mapRecipeToCookidoo } from "../_shared/cookidoo/mapper.ts";
import { validateCookidooPayload } from "../_shared/cookidoo/validate.ts";
import { buildExportDiagnostics } from "../_shared/cookidoo/diagnostics.ts";
import { PartialCreateError, runExport, type CookidooOps } from "../_shared/cookidoo/run-export.ts";
import type { Recipe, ThermomixTool } from "../_shared/cookidoo/types.ts";
```

- [ ] **Step 2: Ajouter les helpers après `classifyError` (après la ligne 63)**

```ts
/** Implémentation réelle des opérations Cookidoo injectées dans `runExport`. */
const realOps: CookidooOps = {
  getRecipe,
  createRecipe,
  fillRecipe,
  renameRecipe,
  deleteRecipe,
  uploadRecipeImage,
  findUnguidedSteps,
  recipeWebUrl,
};

/**
 * Détermine si un ré-export doit réutiliser l'identifiant Cookidoo mémorisé.
 *
 * 404 → la recette a été supprimée côté Cookidoo, on la recrée. Toute autre
 * erreur (429, 5xx, réseau) remonte : recréer sur un doute fabriquerait
 * exactement le doublon que ce mécanisme sert à éviter.
 */
async function resolveExistingId(ctx: ClientCtx, existingId: string | null): Promise<string | null> {
  if (!existingId) return null;
  try {
    await getRecipe(ctx, existingId);
    return existingId;
  } catch (lookupErr) {
    if (lookupErr instanceof CookidooHttpError && lookupErr.status === 404) return null;
    throw lookupErr;
  }
}
```

- [ ] **Step 3: Remplacer tout le bloc `try { const jar = await login(...) } catch (err) { ... }` (lignes 157-271) par la phase asynchrone**

```ts
    // ── Journal : ligne pending, créée avant de rendre la main ──────────────
    // Écriture en service role : la RLS n'accorde au client que la lecture, de
    // sorte qu'un journal ne puisse pas être falsifié depuis le front.
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SERVICE_ROLE_KEY) {
      return json({ error: "server_misconfigured", message: "SUPABASE_SERVICE_ROLE_KEY absent" }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const diagnostics = buildExportDiagnostics(recipe, payload);
    const { data: job, error: jobError } = await admin
      .from("cookidoo_exports")
      .insert({ user_id: user.id, recipe_id: recipeId, diagnostics })
      .select("id")
      .single();
    if (jobError || !job) {
      return json({ error: "db_error", message: jobError?.message ?? "job non créé" }, 500);
    }

    // ── Phase asynchrone ───────────────────────────────────────────────────
    // Tout ce qui suit se poursuit après la réponse HTTP. Aucune exception ne
    // doit s'en échapper : elle serait perdue sans laisser de trace, et la
    // ligne resterait pending indéfiniment.
    const startedAt = Date.now();
    const work = (async () => {
      try {
        const jar = await login(creds.email, password, lang);
        const ctx: ClientCtx = { cookieHeader: jar.headerForUrl("https://cookidoo.fr"), lang };
        const reuseId = await resolveExistingId(ctx, existingId);

        const outcome = await runExport(
          { ctx, payload, existingId: reuseId, imageUrl, supabaseHost: new URL(SUPABASE_URL).hostname },
          realOps,
          sleep,
        );

        // Mémorise le mapping pour le prochain export (anti-doublon).
        const { error: mapErr } = await admin
          .from("recipes")
          .update({
            cookidoo_recipe_id: outcome.cookidoo_recipe_id,
            cookidoo_exported_at: new Date().toISOString(),
          })
          .eq("id", recipeId);
        if (mapErr) console.error("[export-recipe-cookidoo] mapping", mapErr.message);

        await admin.from("cookidoo_exports").update({
          status: "success",
          cookidoo_recipe_id: outcome.cookidoo_recipe_id,
          cookidoo_url: outcome.url,
          updated: outcome.updated,
          warnings: outcome.warnings,
          unguided_steps: outcome.unguided_steps,
          duration_ms: Date.now() - startedAt,
          finished_at: new Date().toISOString(),
        }).eq("id", job.id);
      } catch (err) {
        const classified = err instanceof PartialCreateError
          ? { error: "partial_created", message: err.message }
          : classifyError(err);
        console.error("[export-recipe-cookidoo]", classified.error, classified.message);

        const { error: updateErr } = await admin.from("cookidoo_exports").update({
          status: "failed",
          error_code: classified.error,
          error_message: classified.message,
          // Conserve l'identifiant de la recette résiduelle à nettoyer.
          cookidoo_recipe_id: err instanceof PartialCreateError ? err.cookidooRecipeId : null,
          duration_ms: Date.now() - startedAt,
          finished_at: new Date().toISOString(),
        }).eq("id", job.id);
        // Dernier recours : si même l'écriture de l'échec échoue, la ligne
        // restera pending. Au moins la cause apparaîtra dans les logs.
        if (updateErr) {
          console.error("[export-recipe-cookidoo] journal", updateErr.message);
        }
      }
    })();

    // @ts-ignore — EdgeRuntime est fourni par le runtime Supabase, absent des types Deno.
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);

    return json({ ok: true, export_id: job.id, status: "pending", tools });
```

- [ ] **Step 4: Tracer l'arrêt de l'isolate**

Ajouter juste avant `serve(async (req) => {` (ligne 65) :

```ts
// Le runtime prévient avant de recycler l'isolate. Sans cette trace, un export
// interrompu en plein vol laisse une ligne `pending` sans la moindre indication
// de la cause : on saurait qu'il a échoué, pas pourquoi.
// @ts-ignore — addEventListener("beforeunload") est propre au runtime Supabase.
globalThis.addEventListener?.("beforeunload", (ev: unknown) => {
  const reason = (ev as { detail?: { reason?: string } })?.detail?.reason ?? "inconnu";
  console.error(`[export-recipe-cookidoo] isolate arrêté (${reason}) — export en cours possiblement interrompu`);
});
```

Ce handler ne peut pas écrire en base de façon fiable : l'isolate est en cours d'arrêt et une requête réseau n'aboutirait probablement pas. Il ne fait donc que journaliser. Le rattrapage côté utilisateur est assuré par le délai d'attente du hook (tâche 6), et la ligne reste détectable en SQL (`status = 'pending'` avec `finished_at` nul).

- [ ] **Step 5: Vérifier que le fichier compile**

```bash
~/.deno/bin/deno check supabase/functions/export-recipe-cookidoo/index.ts
```

Attendu : aucune erreur. Si `EdgeRuntime` est signalé malgré le `@ts-ignore`, vérifier que le commentaire est bien sur la ligne immédiatement précédente.

- [ ] **Step 6: Vérifier que les tests partagés passent toujours**

```bash
~/.deno/bin/deno test --allow-env supabase/functions/_shared/cookidoo/
```

Attendu : tous verts (mapper, client, validate, diagnostics, run-export).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/export-recipe-cookidoo/index.ts
git commit -m "feat: export Cookidoo asynchrone, journalisé en base"
```

---

## Task 5 : Types Supabase de la nouvelle table

**Files:**
- Modify: `src/integrations/supabase/types.ts` *(auto-généré)*

⚠️ **Point de friction connu.** Ce fichier est protégé par le hook `git-guard` : toute écriture sera bloquée. C'est voulu — il ne doit jamais être édité à la main. Ici il ne s'agit pas d'une édition mais d'une **régénération** après changement de schéma, ce qui est l'opération normale.

- [ ] **Step 1: Régénérer les types**

Via le MCP Supabase, outil `generate_typescript_types`.

- [ ] **Step 2: Écrire le résultat dans le fichier**

Le hook va bloquer l'écriture. **Demander à l'utilisateur d'autoriser cette écriture précise**, en expliquant qu'il s'agit d'une régénération liée à la migration de la tâche 1, pas d'une édition manuelle. Ne pas contourner le hook.

- [ ] **Step 3: Vérifier que la table est typée**

```bash
npm run typecheck
```

Attendu : pas de nouvelle erreur. `Database['public']['Tables']['cookidoo_exports']` doit exister.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore: régénère les types Supabase après ajout de cookidoo_exports"
```

---

## Task 6 : Hook `useCookidooExport`

**Files:**
- Create: `src/hooks/useCookidooExport.ts`
- Test: `src/hooks/useCookidooExport.test.tsx`

- [ ] **Step 1: Écrire les tests qui échouent**

Contenu complet de `useCookidooExport.test.tsx` :

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const maybeSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    })),
  },
}));

import { supabase } from '@/integrations/supabase/client';
import { useCookidooExport } from './useCookidooExport';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCookidooExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('interroge la ligne tant qu’elle est pending, puis s’arrête au statut final', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, export_id: 'job-1', status: 'pending' },
      error: null,
    } as never);
    maybeSingle
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'pending' }, error: null })
      .mockResolvedValue({
        data: { id: 'job-1', status: 'success', cookidoo_url: 'https://cookidoo.fr/r/1', warnings: [] },
        error: null,
      });

    const { result } = renderHook(() => useCookidooExport(), { wrapper });

    await act(async () => {
      await result.current.startExport('recipe-1');
    });

    await waitFor(() => expect(result.current.exportId).toBe('job-1'));

    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    await waitFor(() => expect(result.current.job?.status).toBe('success'));

    const callsAtSuccess = maybeSingle.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    // Le statut est final : plus aucune interrogation ne doit partir.
    expect(maybeSingle.mock.calls.length).toBe(callsAtSuccess);
  });

  it('abandonne l’attente au-delà de deux minutes sur un statut pending', async () => {
    // Un isolate tué avant la fin laisse la ligne pending pour toujours :
    // sans borne, le front interrogerait indéfiniment.
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: true, export_id: 'job-2', status: 'pending' },
      error: null,
    } as never);
    maybeSingle.mockResolvedValue({ data: { id: 'job-2', status: 'pending' }, error: null });

    const { result } = renderHook(() => useCookidooExport(), { wrapper });

    await act(async () => { await result.current.startExport('recipe-2'); });
    await waitFor(() => expect(result.current.exportId).toBe('job-2'));

    await act(async () => { await vi.advanceTimersByTimeAsync(125_000); });

    await waitFor(() => expect(result.current.timedOut).toBe(true));

    const calls = maybeSingle.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(maybeSingle.mock.calls.length).toBe(calls);
  });

  it('remonte un échec synchrone sans lancer d’interrogation', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { ok: false, error: 'invalid_payload', message: 'Recette non exportable : titre vide.' },
      error: null,
    } as never);

    const { result } = renderHook(() => useCookidooExport(), { wrapper });

    let response;
    await act(async () => { response = await result.current.startExport('recipe-3'); });

    expect(response).toMatchObject({ ok: false, error: 'invalid_payload' });
    expect(result.current.exportId).toBeNull();
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npx vitest run src/hooks/useCookidooExport.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./useCookidooExport"`.

- [ ] **Step 3: Écrire l'implémentation**

Contenu complet de `useCookidooExport.ts` :

```ts
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Intervalle d'interrogation de la ligne de journal, en millisecondes. */
const POLL_INTERVAL_MS = 2000;

/**
 * Au-delà de cette durée, on cesse d'attendre : un isolate tué avant la fin
 * laisse la ligne `pending` définitivement, et interroger sans fin ne
 * produirait qu'un spinner éternel.
 */
const POLL_TIMEOUT_MS = 120_000;

export type CookidooExportStatus = 'pending' | 'success' | 'failed';

export interface CookidooExportJob {
  id: string;
  status: CookidooExportStatus;
  cookidoo_recipe_id: string | null;
  cookidoo_url: string | null;
  updated: boolean;
  error_code: string | null;
  error_message: string | null;
  warnings: string[];
  unguided_steps: number[];
}

/** Réponse de la phase synchrone de l'edge function. */
export interface StartExportResponse {
  ok: boolean;
  export_id?: string;
  status?: 'pending';
  error?: string;
  message?: string;
}

/**
 * Export d'une recette vers Cookidoo.
 *
 * L'edge function rend la main immédiatement ; le résultat réel arrive par
 * interrogation de la ligne de journal. Le hook expose donc deux choses
 * distinctes : le déclenchement (`startExport`, qui peut échouer tout de suite
 * si la recette n'est pas exportable) et l'issue finale (`job`).
 */
export function useCookidooExport() {
  const [exportId, setExportId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const start = useMutation({
    mutationFn: async (recipeId: string): Promise<StartExportResponse> => {
      const response = await supabase.functions.invoke('export-recipe-cookidoo', {
        body: { recipe_id: recipeId, tools: ['TM7'] },
      });
      const data = response.data as StartExportResponse | null;
      if (data) return data;
      if (response.error) throw response.error;
      return { ok: false, error: 'unknown', message: 'Réponse vide du serveur' };
    },
  });

  const job = useQuery({
    queryKey: ['cookidoo-export', exportId],
    queryFn: async (): Promise<CookidooExportJob | null> => {
      const { data, error } = await supabase
        .from('cookidoo_exports')
        .select('id, status, cookidoo_recipe_id, cookidoo_url, updated, error_code, error_message, warnings, unguided_steps')
        .eq('id', exportId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CookidooExportJob | null) ?? null;
    },
    enabled: !!exportId && !timedOut,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && status !== 'pending') return false;
      if (startedAt !== null && Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return false;
      }
      return POLL_INTERVAL_MS;
    },
  });

  /** Lance l'export. Renvoie la réponse synchrone : un `ok: false` est définitif. */
  const startExport = async (recipeId: string): Promise<StartExportResponse> => {
    setExportId(null);
    setTimedOut(false);
    const response = await start.mutateAsync(recipeId);
    if (response.ok && response.export_id) {
      setStartedAt(Date.now());
      setExportId(response.export_id);
    }
    return response;
  };

  /** Remet le hook à zéro (fermeture du dialogue, nouvel export). */
  const reset = () => {
    setExportId(null);
    setStartedAt(null);
    setTimedOut(false);
  };

  return {
    startExport,
    reset,
    exportId,
    isStarting: start.isPending,
    job: job.data ?? null,
    timedOut,
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```bash
npx vitest run src/hooks/useCookidooExport.test.tsx
```

Attendu : 3 tests verts.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCookidooExport.ts src/hooks/useCookidooExport.test.tsx
git commit -m "feat: hook d'export Cookidoo asynchrone avec interrogation périodique"
```

---

## Task 7 : Branchement du bouton d'export

**Files:**
- Modify: `src/components/recipes/ExportToCookidooButton.tsx`
- Modify: `src/hooks/useCookidooConnector.ts` (retrait de `exportRecipe`, désormais dans `useCookidooExport`)

- [ ] **Step 1: Étendre le dictionnaire d'avertissements**

Dans `ExportToCookidooButton.tsx`, remplacer `WARNING_MESSAGES` (lignes 27-31) par :

```tsx
const WARNING_MESSAGES: Record<string, string> = {
  no_image: 'Astuce : ajoutez une image à la recette pour l’afficher sur Cookidoo.',
  image_not_transferred: 'L’image n’a pas pu être transférée cette fois.',
  title_not_updated: 'Le titre n’a pas pu être mis à jour sur Cookidoo (contenu à jour).',
  steps_not_guided: 'Certaines étapes n’ont pas été reconnues comme guidées par Cookidoo.',
};
```

Et ajouter à `ERROR_MESSAGES` (après la ligne 23) :

```tsx
  partial_created: 'Une recette vide subsiste sur Cookidoo : supprimez-la depuis votre compte.',
```

- [ ] **Step 2: Remplacer le déclenchement et l'affichage du résultat**

Remplacer la ligne 43 :

```tsx
  const { status } = useCookidooConnector();
  const { startExport, reset, job, isStarting, timedOut } = useCookidooExport();
```

Ajouter l'import correspondant après la ligne 15 :

```tsx
import { useCookidooExport } from '@/hooks/useCookidooExport';
```

Remplacer `handleExport` (lignes 54-80) par :

```tsx
  // L'export rend la main immédiatement : seul un refus synchrone (recette non
  // exportable) est connu ici. L'issue réelle arrive par `job`, traitée dans
  // l'effet ci-dessous.
  const handleExport = async () => {
    const response = await startExport(recipeId);
    if (!response.ok) {
      toast.error('Échec de l’envoi', {
        description: ERROR_MESSAGES[response.error ?? ''] ?? response.message ?? 'Erreur inconnue',
      });
      return;
    }
    toast.info('Envoi lancé vers Cookidoo…', {
      description: 'Vous pouvez continuer, le résultat s’affichera ici.',
    });
    setOpen(false);
  };
```

- [ ] **Step 3: Ajouter l'effet qui affiche l'issue finale**

Après `handleExport`, ajouter :

```tsx
  // Le toast final doit partir une seule fois par export, y compris si
  // l'utilisateur a navigué ailleurs entretemps.
  const [notifiedId, setNotifiedId] = useState<string | null>(null);
  useEffect(() => {
    if (!job || job.status === 'pending' || job.id === notifiedId) return;
    setNotifiedId(job.id);

    if (job.status === 'success') {
      const warnings = (job.warnings ?? []).map((w) => WARNING_MESSAGES[w]).filter(Boolean);
      const base = job.cookidoo_url ? 'Disponible dans « Mes recettes créées ».' : undefined;
      toast.success(job.updated ? 'Recette mise à jour sur Cookidoo' : 'Recette envoyée vers Cookidoo', {
        description: [base, ...warnings].filter(Boolean).join(' ') || undefined,
        action: job.cookidoo_url
          ? { label: 'Ouvrir', onClick: () => window.open(job.cookidoo_url!, '_blank') }
          : undefined,
      });
    } else {
      toast.error('Échec de l’envoi', {
        description: ERROR_MESSAGES[job.error_code ?? ''] ?? job.error_message ?? 'Erreur inconnue',
      });
    }
    reset();
  }, [job, notifiedId, reset]);

  // Au-delà du délai d'attente, on ne sait plus rien : le dire franchement
  // plutôt que laisser un spinner tourner sans fin.
  useEffect(() => {
    if (!timedOut) return;
    toast.warning('Envoi toujours en cours', {
      description: 'Vérifiez dans quelques instants sur Cookidoo avant de relancer.',
    });
    reset();
  }, [timedOut, reset]);
```

Compléter l'import React de la ligne 1 :

```tsx
import { useState, useEffect } from 'react';
```

- [ ] **Step 4: Adapter l'état du bouton**

Remplacer `disabled={exportRecipe.isPending}` et le ternaire `exportRecipe.isPending ?` (lignes 128-129) par `disabled={isStarting}` et `isStarting ?`.

- [ ] **Step 5: Retirer `exportRecipe` de `useCookidooConnector`**

Dans `src/hooks/useCookidooConnector.ts`, supprimer la mutation `exportRecipe` (lignes 83-97), l'interface `CookidooExportResult` (lignes 21-32) et la retirer du retour (ligne 99) :

```ts
  return { status, saveCredentials, deleteCredentials };
```

Le hook conserve la gestion des identifiants ; l'export vit désormais dans `useCookidooExport`.

- [ ] **Step 6: Vérifier qu'aucun appelant ne casse**

```bash
grep -rn "exportRecipe\|CookidooExportResult" src/
```

Attendu : aucun résultat. S'il en reste, adapter l'appelant avant de continuer.

- [ ] **Step 7: Lancer la suite complète**

```bash
npm run test:run && npm run build
```

Attendu : tous les tests verts, build OK.

- [ ] **Step 8: Commit**

```bash
git add src/components/recipes/ExportToCookidooButton.tsx src/hooks/useCookidooConnector.ts
git commit -m "feat: branche le bouton d'export sur le flux asynchrone"
```

---

## Task 8 : Vérification réelle, après merge

⚠️ **Cette tâche s'exécute après le merge de la PR, pas avant.**

Le déploiement des edge functions est automatique : `.github/workflows/deploy-edge-functions.yml` déploie à chaque push sur `main` touchant `supabase/functions/**`. Ce workflow existe précisément pour supprimer les déploiements manuels, qui avaient causé une dérive « repo ≠ prod ». **Ne pas déployer via le MCP** : ce serait mettre en production du code non mergé, et recréer le problème que le workflow élimine.

Conséquence sur l'ordre : les tâches 1 à 7 se terminent par une PR. Une fois mergée, le workflow déploie, et seulement là cette tâche peut être menée.

- [ ] **Step 1: Vérifier que le workflow de déploiement a réussi**

```bash
gh run list --workflow=deploy-edge-functions.yml --limit 3
```

Attendu : le run déclenché par le merge est `completed / success`.

- [ ] **Step 2: Vérifier que la version déployée a augmenté**

Via le MCP Supabase, outil `get_edge_function`, nom `export-recipe-cookidoo`.

Attendu : `version` supérieure à la précédente (8 au dernier relevé). Si elle n'a pas bougé alors que le workflow est vert, ne pas redéployer à l'aveugle — chercher pourquoi (chemins `paths` du workflow, échec silencieux).

- [ ] **Step 3: Exporter une recette réelle depuis l'application**

Attendu, dans l'ordre : le dialogue se ferme immédiatement, le toast « Envoi lancé » apparaît, puis le toast final dans les ~15 secondes.

- [ ] **Step 4: Contrôler le journal**

Via le MCP Supabase, outil `execute_sql` :

```sql
SELECT status, error_code, warnings, unguided_steps, diagnostics, duration_ms
FROM public.cookidoo_exports
ORDER BY created_at DESC
LIMIT 1;
```

Attendu : `status = 'success'`, `duration_ms` de l'ordre de 15 000, `diagnostics` renseigné avec des compteurs cohérents avec la recette exportée.

**Point d'attention** : si `steps_with_tm7` est nettement inférieur à `steps_total`, c'est le constat du backlog qui se confirme, et il pointe vers la génération IA — pas vers le connecteur. Le noter pour la suite, ne pas le traiter ici.

- [ ] **Step 5: Vérifier la RLS depuis le front**

Dans la console du navigateur, connecté :

```js
await window.supabase?.from('cookidoo_exports').select('*')
```

Attendu : uniquement ses propres lignes. Si `window.supabase` n'est pas exposé, vérifier plutôt qu'une insertion échoue :

```js
await window.supabase?.from('cookidoo_exports').insert({ user_id: '...', recipe_id: '...' })
```

Attendu : erreur RLS — aucune policy d'écriture n'existe.

- [ ] **Step 6: Mettre à jour la documentation**

Dans `supabase/functions/CLAUDE.md`, section `export-recipe-cookidoo`, indiquer que la fonction est asynchrone : elle répond `{ ok, export_id, status: 'pending' }` et journalise l'issue dans `public.cookidoo_exports`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/CLAUDE.md
git commit -m "docs: documente l'export Cookidoo asynchrone"
```

---

## Ordre et dépendances

```
Task 1 (migration) ──┬─→ Task 4 (edge function) ──┐
Task 2 (diagnostics) ┤                            ├─→ PR → merge → Task 8
Task 3 (run-export) ─┘                            │   (déploiement auto)
Task 1 ──→ Task 5 (types) ──→ Task 6 (hook) ──→ Task 7 (UI)
```

Les tâches 2 et 3 sont indépendantes l'une de l'autre et peuvent être menées dans n'importe quel ordre.

**Prérequis externe :** la PR #79 (`fix/toaster-manquant`) doit être mergée. Sans conteneur de toasts monté, aucun retour de ce plan ne s'affichera — et les tâches 7 et 8 sembleront échouer alors que le code sera correct.
