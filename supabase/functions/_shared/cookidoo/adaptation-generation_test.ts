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

Deno.test("nouveau défaut localisable : reprise depuis le dernier candidat", async () => {
  const wrong = candidate();
  wrong.steps[0].uses[0].quantity = 299;
  const missing = {
    ...candidate().steps[0],
    source_parts: [{ order: 2, part: 0 }],
  };
  const test = setup([
    JSON.stringify(wrong),
    patch([missing]),
    patch([candidate().steps[0]]),
  ]);
  const refused = await test.run();
  assertEquals(refused.status, "ready");
  assertEquals(test.calls.length, 3);
  assertEquals(test.events.some((e) => e.event === "repair_succeeded"), true);
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
    assertEquals((await test.run()).status, "failed");
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

Deno.test("risotto synthétique : trois écarts successifs, corrections acquises conservées", async () => {
  const risotto = {
    title: "Risotto de vérification",
    ingredients: [{ name: "bouillon", quantity: 700, unit: "ml" }, {
      name: "sel",
      quantity: 1,
      unit: "pincée",
    }, { name: "riz", quantity: 160, unit: "g" }],
    steps: [{ order: 1, text: "Chauffer le bouillon." }, {
      order: 2,
      text: "Ajouter le sel.",
    }, { order: 3, text: "Ajouter le riz." }],
  };
  const steps = risotto.steps.map((s, i) => ({
    kind: "replace",
    source_orders: [s.order],
    source_parts: [{ order: s.order, part: 0 }],
    tm7: { mode: "mix", seconds: 10, speed: "2" },
    uses: [{
      ingredient_index: i,
      quantity: risotto.ingredients[i].quantity - 0.5,
    }],
  }));
  const plan = { ...candidate(), steps };
  const seen: unknown[] = [];
  const signals: AbortSignal[] = [];
  const events: GenerationEvent[] = [];
  let calls = 0;
  const result = await generateAdaptation({
    source: risotto,
    signal: AbortSignal.timeout(60000),
    onEvent: (event) => events.push(event),
    generate: (messages, signal, phase) => {
      signals.push(signal);
      calls++;
      if (phase === "generate") return Promise.resolve(JSON.stringify(plan));
      const current = JSON.parse(String(messages.at(-2)!.content));
      seen.push(current);
      for (let i = 0; i < calls - 2; i++) {
        assertEquals(
          current.steps[i].uses[0].quantity,
          risotto.ingredients[i].quantity,
        );
      }
      const request = JSON.parse(String(messages.at(-1)!.content));
      assertEquals(request.diagnostic.rule, "total_quantity_changed");
      const index = calls - 2;
      return Promise.resolve(
        patch([{
          ...current.steps[index],
          uses: [{
            ingredient_index: index,
            quantity: risotto.ingredients[index].quantity,
          }],
        }], index),
      );
    },
  });
  assertEquals(result.status, "ready");
  assertEquals(calls, 4);
  assertEquals(seen.length, 3);
  assertEquals(signals.every((signal) => signal === signals[0]), true);
  assertEquals(events.at(-1)?.attempt, 4);
});

Deno.test("préparation réutilisée : distinguer référence manquante et nouvel ajout", async () => {
  const risotto = {
    title: "Préparations du risotto",
    ingredients: [{ name: "bouillon", quantity: 700, unit: "ml" }, {
      name: "riz",
      quantity: 160,
      unit: "g",
    }, { name: "sel", quantity: 1, unit: "pincée" }],
    steps: [{ order: 1, text: "Chauffer le bouillon." }, {
      order: 2,
      text: "Préparer le riz.",
    }, { order: 3, text: "Ajouter le bouillon au riz avec le sel." }],
  };
  const step = (order: number, ingredient: number) => ({
    kind: "keep",
    source_orders: [order],
    source_parts: [{ order, part: 0 }],
    tm7: null,
    uses: [{ ingredient_index: ingredient }],
  });
  const steps = [step(1, 0), step(2, 1), step(3, 2)];
  const events: GenerationEvent[] = [];
  let calls = 0;
  const result = await generateAdaptation({
    source: risotto,
    signal: new AbortController().signal,
    onEvent: (event) => events.push(event),
    generate: (messages, _signal, phase) => {
      calls++;
      if (phase === "generate") {
        return Promise.resolve(JSON.stringify({ ...candidate(), steps }));
      }
      const request = JSON.parse(String(messages.at(-1)!.content));
      assertEquals(request.diagnostic.rule, "preparation_reference_required");
      return Promise.resolve(
        patch([{
          ...steps[2],
          preparation_from: [{ order: 1, part: 0 }, { order: 2, part: 0 }],
        }], 2),
      );
    },
  });
  assertEquals(result.status, "ready");
  assertEquals(result.recipe!.ingredients, risotto.ingredients);
  assertEquals(calls, 2);
});

Deno.test("blocage identique : arrêt sans imposer une précision culinaire", async () => {
  const wrong = candidate();
  wrong.steps[0].uses[0].quantity = 299;
  const again = candidate();
  again.steps[0].uses[0].quantity = 298;
  const test = setup([JSON.stringify(wrong), patch([again.steps[0]])]);
  const result = await test.run();
  assertEquals(test.calls.length, 2);
  assertEquals(result.status, "failed");
  assertEquals(result.recipe, null);
  assertEquals(result.blockers.some((text) => text.includes("farine")), true);
  assertEquals(test.events.at(-1)?.stop_reason, "same_failure");
});

Deno.test("précision véritable : un plan valide bloqué reste needs_input sans boucle de patch", async () => {
  const test = setup([
    JSON.stringify({
      ...candidate(),
      blockers: ["Combien de portions souhaitez-vous préparer ?"],
    }),
  ]);
  assertEquals((await test.run()).status, "needs_input");
  assertEquals(test.calls.length, 1);
});

Deno.test("boucle : plafond de trois corrections sur des erreurs successives distinctes", async () => {
  const longSource = {
    ...source,
    steps: [1, 2, 3, 4, 5].map((order) => ({ order, text: "Mélanger." })),
  };
  const steps = longSource.steps.map((s, i) => ({
    ...candidate().steps[0],
    source_orders: [s.order],
    source_parts: [{ order: s.order, part: 0 }],
    tm7: { mode: "mix", seconds: i + 1, speed: "Turbo" },
    uses: i === 0 ? [{ ingredient_index: 0 }] : [],
  }));
  let calls = 0;
  const events: GenerationEvent[] = [];
  const result = await generateAdaptation({
    source: longSource,
    signal: new AbortController().signal,
    onEvent: (e) => events.push(e),
    generate: (messages, _signal, phase) => {
      calls++;
      if (phase === "generate") {
        return Promise.resolve(JSON.stringify({ ...candidate(), steps }));
      }
      // Tous les défauts Zod sont localisés ; corriger une seule étape par passage.
      const current = JSON.parse(String(messages.at(-2)!.content));
      const index = calls - 2;
      return Promise.resolve(
        patch([{
          ...current.steps[index],
          tm7: { ...current.steps[index].tm7, speed: "2" },
        }], index),
      );
    },
  });
  assertEquals(calls, 4);
  assertEquals(result.status, "failed");
  assertEquals(events.at(-1)?.stop_reason, "limit");
});

Deno.test("indices après insertion : chaque patch vise le candidat courant", async () => {
  const extended = {
    ...source,
    ingredients: [...source.ingredients, {
      name: "oignon",
      quantity: 2,
      unit: "pièce",
    }],
    steps: [...source.steps, { order: 3, text: "Mélanger l'oignon." }],
  };
  const initial = candidate("Turbo");
  const onion = {
    ...candidate().steps[0],
    source_orders: [3],
    source_parts: [{ order: 3, part: 0 }],
    uses: [{ ingredient_index: 1, quantity: 1 }],
  };
  const empty = {
    kind: "transfer",
    source_orders: [1],
    source_parts: [],
    preparation_from: [{ order: 1, part: 0 }],
    manual_action: "empty_bowl",
    tm7: null,
    uses: [],
  };
  const outputs = [
    JSON.stringify({ ...initial, steps: [...initial.steps, onion] }),
    patch([candidate().steps[0], empty], 0),
    patch([{ ...onion, uses: [{ ingredient_index: 1, quantity: 2 }] }], 3),
  ];
  let calls = 0;
  const result = await generateAdaptation({
    source: extended,
    signal: new AbortController().signal,
    generate: (messages) => {
      if (calls === 2) {
        const request = JSON.parse(String(messages.at(-1)!.content));
        assertEquals(request.allowed_step_indexes, [3]);
        const current = JSON.parse(String(messages.at(-2)!.content));
        assertEquals(current.steps[0].tm7.speed, "2");
        assertEquals(current.steps[1].manual_action, "empty_bowl");
      }
      return Promise.resolve(outputs[calls++]);
    },
  });
  assertEquals(result.status, "ready");
  assertEquals(calls, 3);
});

Deno.test("expiration pendant une réparation : aucun appel ultérieur", async () => {
  const controller = new AbortController();
  const wrong = candidate();
  wrong.steps[0].uses[0].quantity = 299;
  let calls = 0;
  await assertRejects(() =>
    generateAdaptation({
      source,
      signal: controller.signal,
      generate: () => {
        calls++;
        if (calls === 2) controller.abort();
        return Promise.resolve(
          calls === 1 ? JSON.stringify(wrong) : patch([candidate().steps[0]]),
        );
      },
    })
  );
  assertEquals(calls, 2);
});
