import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CookidooHttpError,
  createRecipe,
  isAllowedImageUrl,
  deleteRecipe,
  fillRecipe,
  getRecipe,
  type ClientCtx,
  type RetryPolicy,
} from "./client.ts";
import type { CookidooRecipePayload } from "./types.ts";

// Backoff quasi nul : les délais réels sont neutralisés par sleepImpl.
const FAST_RETRY: RetryPolicy = { maxAttempts: 3, base429Ms: 1, base5xxMs: 1, maxDelayMs: 5 };

/** Contexte de test : fetch scripté, sleep no-op, compteur d'appels. */
function testCtx(respond: (call: number) => Response): ClientCtx & { calls: () => number } {
  let calls = 0;
  const ctx: ClientCtx = {
    cookieHeader: "c",
    lang: "fr-FR",
    sleepImpl: () => Promise.resolve(),
    retry: FAST_RETRY,
    fetchImpl: ((() => {
      calls++;
      return Promise.resolve(respond(calls));
    }) as unknown) as typeof fetch,
  };
  return Object.assign(ctx, { calls: () => calls });
}

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

Deno.test("createRecipe: 429 puis succès → rejoué", async () => {
  const ctx = testCtx((call) =>
    call === 1 ? new Response("rate", { status: 429 }) : okJson({ id: "r1" })
  );
  assertEquals(await createRecipe(ctx, "Test"), "r1");
  assertEquals(ctx.calls(), 2);
});

Deno.test("createRecipe: 429 avec Retry-After → rejoué", async () => {
  const ctx = testCtx((call) =>
    call === 1
      ? new Response("rate", { status: 429, headers: { "retry-after": "1" } })
      : okJson({ id: "r2" })
  );
  assertEquals(await createRecipe(ctx, "Test"), "r2");
  assertEquals(ctx.calls(), 2);
});

Deno.test("createRecipe: 5xx NON rejoué (réponse ambiguë → risque de doublon)", async () => {
  const ctx = testCtx(() => new Response("boom", { status: 500 }));
  await assertRejects(() => createRecipe(ctx, "Test"));
  assertEquals(ctx.calls(), 1);
});

Deno.test("createRecipe: 4xx non rejoué (auth/permission)", async () => {
  const ctx = testCtx(() => new Response("forbidden", { status: 403 }));
  await assertRejects(() => createRecipe(ctx, "Test"));
  assertEquals(ctx.calls(), 1);
});

Deno.test("CookidooHttpError expose le statut (404 distinguable d'un échec transitoire)", async () => {
  const ctx = testCtx(() => new Response("not found", { status: 404 }));
  const err = await assertRejects(() => getRecipe(ctx, "r1"));
  assertEquals(err instanceof CookidooHttpError, true);
  assertEquals((err as CookidooHttpError).status, 404);
  assertEquals(ctx.calls(), 1); // 404 non rejoué
});

Deno.test("deleteRecipe: 5xx rejoué (idempotent) puis succès", async () => {
  const ctx = testCtx((call) =>
    call === 1 ? new Response("err", { status: 503 }) : okJson({})
  );
  await deleteRecipe(ctx, "r1");
  assertEquals(ctx.calls(), 2);
});

Deno.test("deleteRecipe: abandon après maxAttempts", async () => {
  const ctx = testCtx(() => new Response("err", { status: 503 }));
  await assertRejects(() => deleteRecipe(ctx, "r1"));
  assertEquals(ctx.calls(), FAST_RETRY.maxAttempts);
});

Deno.test("fillRecipe: 3 PATCH, le 1er rejoué sur 5xx", async () => {
  const payload = {
    name: "T",
    image: null,
    isImageOwnedByUser: false,
    tools: ["TM7"],
    yield: { value: 4, unitText: "portion" },
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    ingredients: [{ type: "INGREDIENT", text: "200 g de farine" }],
    instructions: [{ type: "STEP", text: "Mélanger.", annotations: [] }],
    hints: "",
    workStatus: "PRIVATE",
    recipeMetadata: { requiresAnnotationsCheck: false },
  } as CookidooRecipePayload;

  const ctx = testCtx((call) => (call === 1 ? new Response("err", { status: 502 }) : okJson({})));
  await fillRecipe(ctx, "r1", payload);
  // 1 échec + 1 rejeu réussi, puis 2 PATCH restants = 4 appels
  assertEquals(ctx.calls(), 4);
});

// ── Garde-fou anti-SSRF de l'upload d'image ─────────────────────────────────

Deno.test("isAllowedImageUrl: n'accepte que le stockage Supabase en https", () => {
  const host = "abc.supabase.co";
  assertEquals(isAllowedImageUrl("https://abc.supabase.co/storage/v1/img.png", host), true);
  // Origines interdites : autre hôte, http, réseau interne, métadonnées cloud
  assertEquals(isAllowedImageUrl("https://evil.example/img.png", host), false);
  assertEquals(isAllowedImageUrl("http://abc.supabase.co/img.png", host), false);
  assertEquals(isAllowedImageUrl("http://169.254.169.254/latest/meta-data/", host), false);
  assertEquals(isAllowedImageUrl("http://localhost:8000/x", host), false);
  assertEquals(isAllowedImageUrl("pas-une-url", host), false);
});
