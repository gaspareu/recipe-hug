import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  generateAdaptation,
  type GenerationEvent,
  type GenerationPhase,
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
        kind: "replace",
        source_orders: [1],
        source_parts: [{ order: 1, part: 0 }],
        tm7: { mode: "mix", seconds: 20, speed },
        uses: [{ ingredient_index: 0, quantity: 300 }],
      },
      {
        kind: "keep",
        source_orders: [2],
        source_parts: [{ order: 2, part: 0 }],
        tm7: null,
        uses: [],
      },
    ],
    changes: [],
    notes: [],
    blockers: [],
  };
}
const patch = (steps: unknown[], index = 0) =>
  JSON.stringify({ edits: [{ index, steps }] });
function setup(outputs: Array<string | Error>) {
  const calls: {
    messages: ChatMessage[];
    phase: GenerationPhase;
    signal: AbortSignal;
  }[] = [];
  const events: GenerationEvent[] = [];
  const generate = (
    messages: ChatMessage[],
    signal: AbortSignal,
    phase: GenerationPhase,
  ) => {
    calls.push({ messages, signal, phase });
    const output = outputs[calls.length - 1];
    return output instanceof Error
      ? Promise.reject(output)
      : Promise.resolve(output);
  };
  const run = (signal = new AbortController().signal) =>
    generateAdaptation({
      source,
      signal,
      generate,
      onEvent: (e) => events.push(e),
    });
  return { calls, events, run };
}

Deno.test("plan valide : un appel et recette source intacte", async () => {
  const before = JSON.stringify(source);
  const test = setup([JSON.stringify(candidate())]);
  assertEquals((await test.run()).recipe!.steps[0].tm7?.speed, "2");
  assertEquals(test.calls.length, 1);
  assertEquals(test.calls[0].phase, "generate");
  assertEquals(JSON.stringify(source), before);
});

Deno.test("vitesse numérique exacte : normalisation sans réparation ni arrondi", async () => {
  for (const speed of [0.5, 2, 2.5, 10]) {
    const test = setup([JSON.stringify(candidate(speed))]);
    assertEquals((await test.run()).recipe!.steps[0].tm7?.speed, String(speed));
    assertEquals(test.calls.length, 1);
    assertEquals(test.events.some((e) => e.event === "normalized"), true);
  }
  for (const speed of [0, -1, 2.2, 11, null, "Turbo"]) {
    const test = setup([
      JSON.stringify(candidate(speed)),
      patch([candidate(speed).steps[0]]),
    ]);
    assertEquals((await test.run()).recipe, null);
    assertEquals(test.calls.length, 2);
    assertEquals(
      test.events.some((e) => e.event === "repair_succeeded"),
      false,
    );
  }
});

Deno.test("quantité erronée : correction localisée, autre étape et métadonnées protégées", async () => {
  const wrong = candidate();
  wrong.steps[0].uses[0].quantity = 299;
  const test = setup([JSON.stringify(wrong), patch([candidate().steps[0]])]);
  const result = await test.run();
  assertEquals(result.recipe!.steps[1].text, "Laisser reposer.");
  assertEquals(result.notes, wrong.notes);
  assertEquals(test.calls.map((c) => c.phase), ["generate", "repair"]);
  const request = JSON.parse(String(test.calls[1].messages.at(-1)!.content));
  assertEquals(request.allowed_step_indexes, [0]);
  assertEquals(request.diagnostic.ingredient_indexes, [0]);
  assertEquals(test.calls[0].signal, test.calls[1].signal);
  assertEquals(test.events.some((e) => e.event === "repair_succeeded"), true);
});

Deno.test("uses absent : patch de l'étape fautive puis validation complète", async () => {
  const initial = candidate();
  const { uses: _uses, ...step } = initial.steps[1];
  const test = setup([
    JSON.stringify({ ...initial, steps: [initial.steps[0], step] }),
    patch([initial.steps[1]], 1),
  ]);
  await test.run();
  assertEquals(test.calls.length, 2);
});

Deno.test("patch hors périmètre et réécriture de recette complète sont refusés", async () => {
  const wrong = candidate();
  wrong.steps[0].uses[0].quantity = 299;
  for (
    const repair of [
      patch([candidate().steps[1]], 1),
      JSON.stringify(candidate()),
      JSON.stringify({
        edits: [{ index: 0, steps: [candidate().steps[0]] }],
        blockers: [],
      }),
    ]
  ) {
    const test = setup([JSON.stringify(wrong), repair]);
    assertEquals((await test.run()).recipe, null);
    assertEquals(test.calls.length, 2);
  }
});

Deno.test("nouveau défaut introduit par le patch : rejet définitif, aucun troisième appel", async () => {
  const wrong = candidate();
  wrong.steps[0].uses[0].quantity = 299;
  const missing = {
    ...candidate().steps[0],
    source_parts: [{ order: 2, part: 0 }],
  };
  const test = setup([JSON.stringify(wrong), patch([missing])]);
  const refused = await test.run();
  assertEquals(refused.recipe, null);
  assertEquals(refused.blockers.length > 0, true);
  assertEquals(test.calls.length, 2);
  assertEquals(test.events.some((e) => e.event === "repair_succeeded"), false);
});

Deno.test("JSON illisible ou métadonnée invalide : aucune régénération globale aveugle", async () => {
  for (
    const output of [
      "```json\n{",
      "{}",
      JSON.stringify({ ...candidate(), notes: null }),
    ]
  ) {
    const test = setup([output]);
    await assertRejects(() => test.run());
    assertEquals(test.calls.length, 1);
  }
});

Deno.test("erreur fournisseur : aucun repli ni patch", async () => {
  const test = setup([new Error("Anthropic error: 429")]);
  await assertRejects(() => test.run());
  assertEquals(test.calls.length, 1);
});

Deno.test("délai expiré après le premier appel : aucune réparation", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assertRejects(() =>
    generateAdaptation({
      source,
      signal: controller.signal,
      generate: () => {
        calls++;
        controller.abort();
        return Promise.resolve(JSON.stringify(candidate()));
      },
    })
  );
  assertEquals(calls, 1);
});

Deno.test("diagnostics d'autocorrection : références seulement, jamais le contenu privé", async () => {
  const wrong = candidate();
  wrong.steps[0].uses[0].quantity = 299;
  const test = setup([JSON.stringify(wrong), patch([candidate().steps[0]])]);
  await test.run();
  const events = JSON.stringify(test.events);
  for (const text of ["Recette privée", "farine", "Laisser reposer"]) {
    assertEquals(events.includes(text), false);
  }
});
