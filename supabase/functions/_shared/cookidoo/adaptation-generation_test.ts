import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  generateAdaptation,
  type GenerationEvent,
} from "./adaptation-generation.ts";
import type { ChatMessage } from "../ai-providers.ts";

const source = {
  title: "Recette privée",
  ingredients: [{ name: "farine", quantity: 300, unit: "g" }],
  steps: [{ order: 1, text: "Mélanger." }, {
    order: 2,
    text: "Laisser reposer.",
  }],
};
function candidate(speed: unknown = "2") {
  return {
    steps: [
      {
        source_orders: [1],
        text: "Mélanger.",
        tm7: { mode: "mix", seconds: 20, speed },
        uses: [{ ingredient_index: 0, quantity: 300 }],
      },
      { source_orders: [2], text: "Laisser reposer.", tm7: null, uses: [] },
    ],
    changes: [],
    notes: [],
    blockers: [],
  };
}
function setup(outputs: Array<string | Error>) {
  const calls: ChatMessage[][] = [];
  const signals: AbortSignal[] = [];
  const events: GenerationEvent[] = [];
  const generate = (messages: ChatMessage[], signal: AbortSignal) => {
    calls.push(messages);
    signals.push(signal);
    const output = outputs[calls.length - 1];
    if (output instanceof Error) return Promise.reject(output);
    return Promise.resolve(output);
  };
  const run = (signal = new AbortController().signal) =>
    generateAdaptation({
      source,
      signal,
      generate,
      onEvent: (event) => events.push(event),
    });
  return { run, calls, signals, events };
}

Deno.test("réponse valide : un seul appel, recette source intacte", async () => {
  const before = JSON.stringify(source);
  const test = setup([JSON.stringify(candidate())]);
  const result = await test.run();
  assertEquals(result.recipe.steps[0].tm7?.speed, "2");
  assertEquals(test.calls.length, 1);
  assertEquals(JSON.stringify(source), before);
});

Deno.test("vitesse numérique valide normalisée sans appel de réparation", async () => {
  for (const speed of [0.5, 2, 2.5, 10]) {
    const test = setup([JSON.stringify(candidate(speed))]);
    const result = await test.run();
    assertEquals(result.recipe.steps[0].tm7?.speed, String(speed));
    assertEquals(test.calls.length, 1);
    assertEquals(
      test.events.some((e) =>
        e.event === "normalized" && e.normalized_speeds === 1
      ),
      true,
    );
  }
});

Deno.test("vitesse invalide jamais arrondie ni acceptée après réparation", async () => {
  for (const speed of [0, -1, 2.2, 11, null, "Turbo"]) {
    const output = JSON.stringify(candidate(speed));
    const test = setup([output, output]);
    await assertRejects(() => test.run());
    assertEquals(test.calls.length, 2);
    assertEquals(test.events.some((e) => e.event === "normalized"), false);
  }
});

Deno.test("uses absent : une réparation explicite, jamais de tableau inventé", async () => {
  const broken = candidate();
  const { uses: _uses, ...manual } = broken.steps[1];
  const initial = { ...broken, steps: [broken.steps[0], manual] };
  const test = setup([JSON.stringify(initial), JSON.stringify(candidate())]);
  await test.run();
  assertEquals(test.calls.length, 2);
  const repair = test.calls[1];
  assertEquals(repair[2].role, "assistant");
  assertEquals(repair[2].content, JSON.stringify(initial));
  assertEquals(String(repair[3].content).includes("steps.1.uses"), true);
  assertEquals(test.signals[0], test.signals[1]);
  assertEquals(test.events.some((e) => e.event === "repair_succeeded"), true);
});

Deno.test("JSON invalide : une réparation puis validation complète", async () => {
  const test = setup(["```json\n{", JSON.stringify(candidate())]);
  await test.run();
  assertEquals(test.calls.length, 2);
  assertEquals(
    test.events.some((e) => e.diagnostic?.reason === "invalid_json"),
    true,
  );
});

Deno.test("quantité modifiée, ingrédient omis ou consigne reformulée restent bloqués", async () => {
  const quantity = candidate();
  quantity.steps[0].uses[0].quantity = 299;
  const missing = candidate();
  missing.steps[0].uses = [];
  const manual = candidate();
  manual.steps[1].text = "Texte privé inventé.";
  for (const broken of [quantity, missing, manual]) {
    const test = setup(["{}", JSON.stringify(broken)]);
    await assertRejects(() => test.run());
    assertEquals(test.calls.length, 2);
  }
});

Deno.test("contrainte fouet inchangée même après normalisation", async () => {
  const broken = candidate(5);
  const output = JSON.stringify({
    ...broken,
    steps: [{
      ...broken.steps[0],
      tm7: { ...broken.steps[0].tm7, accessory: "butterfly" },
    }, broken.steps[1]],
  });
  const test = setup([output, output]);
  await assertRejects(() => test.run());
});

Deno.test("erreur fournisseur : aucun nouvel appel", async () => {
  const test = setup([new Error("Anthropic error: 429")]);
  await assertRejects(() => test.run(), Error, "429");
  assertEquals(test.calls.length, 1);
});

Deno.test("délai partagé : aucune réparation après expiration", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assertRejects(() =>
    generateAdaptation({
      source,
      signal: controller.signal,
      generate: () => {
        calls++;
        controller.abort();
        return Promise.resolve("{}");
      },
    })
  );
  assertEquals(calls, 1);
});

Deno.test("les événements ne contiennent ni recette, ni sortie IA, ni message brut", async () => {
  const broken = candidate();
  broken.steps[1].text = "secret@example.com";
  const test = setup([JSON.stringify(broken), JSON.stringify(candidate())]);
  await test.run();
  const events = JSON.stringify(test.events);
  assertEquals(events.includes("secret@example.com"), false);
  assertEquals(events.includes("Recette privée"), false);
  assertEquals(events.includes("farine"), false);
});
