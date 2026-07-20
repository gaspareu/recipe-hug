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
