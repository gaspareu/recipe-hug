import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { applyAdaptation } from "./adaptation.ts";
import {
  buildCookidooMachinePrompt,
  MachineSchema,
} from "./machine-contract.ts";
import { adaptationFailureDiagnostic } from "./adaptation-diagnostics.ts";
import { findUnguidedSteps } from "./client.ts";
import { mapRecipeToCookidoo } from "./mapper.ts";
import { adaptationInput, sourceParts } from "./source-parts.ts";
import { benchmarkSummary } from "./benchmark.ts";
import { generateAdaptation } from "./adaptation-generation.ts";

const source = {
  title: "Pâte",
  ingredients: [{ name: "farine", quantity: 300, unit: "g" }],
  steps: [
    { order: 1, text: "Mélanger la farine. Laisser reposer 20 minutes." },
  ],
};
const output = () => ({
  steps: [
    {
      source_orders: [1],
      tm7: { mode: "knead", seconds: 240 },
      uses: [{ ingredient_index: 0 }],
    },
    {
      source_orders: [1],
      source_parts: [{ order: 1, part: 1 }],
      tm7: null,
      uses: [],
    },
  ],
  changes: [],
  notes: [],
  blockers: [],
});

Deno.test("contrat compact : référence manuelle exacte, total unique repris sans calcul IA", () => {
  const before = JSON.stringify(source);
  const result = applyAdaptation(source, JSON.stringify(output()));
  assertEquals(result.recipe.steps[1].text, "Laisser reposer 20 minutes.");
  assertEquals(result.recipe.steps[0].text.includes("300 g de farine"), true);
  assertEquals(JSON.stringify(source), before);
  assertEquals(sourceParts("Ajouter 2.5 g de sel. Mélanger."), [
    "Ajouter 2.5 g de sel.",
    "Mélanger.",
  ]);
  assertEquals(
    JSON.stringify(adaptationInput(source)).includes('"parts"'),
    true,
  );
});

Deno.test("fragments manuels : servir avant cuisson est rejeté, y compris entre deux étapes", () => {
  const manualSource = {
    ...source,
    steps: [{ order: 1, text: "Cuire le poulet à cœur. Servir le poulet." }],
  };
  const manual = {
    source_orders: [1],
    source_parts: [{ order: 1, part: 1 }, { order: 1, part: 0 }],
    tm7: null,
    uses: [{ ingredient_index: 0 }],
  };
  assertThrows(() =>
    applyAdaptation(
      manualSource,
      JSON.stringify({ ...output(), steps: [manual] }),
    )
  );
  assertThrows(() =>
    applyAdaptation(
      manualSource,
      JSON.stringify({
        ...output(),
        steps: [
          { ...manual, source_parts: [{ order: 1, part: 1 }] },
          { ...manual, source_parts: [{ order: 1, part: 0 }], uses: [] },
        ],
      }),
    )
  );
});

Deno.test("contrat compact : une commande bol ne remplace ni le four ni un repos omis", () => {
  const oven = {
    ...source,
    steps: [{ order: 1, text: "Cuire au four à 250°C pendant 10 minutes." }],
  };
  const machine = {
    source_orders: [1],
    tm7: { mode: "cook", seconds: 600, speed: "1", temperature: 100 },
    uses: [{ ingredient_index: 0 }],
  };
  assertThrows(
    () =>
      applyAdaptation(oven, JSON.stringify({ ...output(), steps: [machine] })),
    Error,
    "four",
  );
  assertThrows(
    () =>
      applyAdaptation(
        source,
        JSON.stringify({ ...output(), steps: [machine] }),
      ),
    Error,
    "actions",
  );
  const mixedSource = {
    ...source,
    steps: [{
      order: 1,
      text: "Mélanger la farine. Cuire au four à 250°C pendant 10 minutes.",
    }],
  };
  const mixed = {
    ...output(),
    steps: [machine, {
      source_orders: [1],
      source_parts: [{ order: 1, part: 1 }],
      tm7: null,
      uses: [],
    }],
  };
  assertEquals(
    applyAdaptation(mixedSource, JSON.stringify(mixed)).recipe.steps[1].text
      .includes("four"),
    true,
  );
});

Deno.test("référence inventée, répétée ou associée à une commande machine refusée", () => {
  const value = output();
  value.steps[1].source_parts![0].part = 99;
  assertThrows(() => applyAdaptation(source, JSON.stringify(value)));
  const repeated = output();
  repeated.steps.push(repeated.steps[1]);
  assertThrows(() => applyAdaptation(source, JSON.stringify(repeated)));
  const mixed = output();
  const mixedOutput = {
    ...mixed,
    steps: [
      { ...mixed.steps[0], source_parts: [{ order: 1, part: 0 }] },
      mixed.steps[1],
    ],
  };
  assertThrows(() => applyAdaptation(source, JSON.stringify(mixedOutput)));
});

Deno.test("ingrédient partagé : omission de quantité refusée, jamais une répartition inventée", () => {
  const value = output();
  const shared = {
    ...value,
    steps: [value.steps[0], {
      ...value.steps[1],
      uses: [{ ingredient_index: 0 }],
    }],
  };
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(shared)),
    Error,
    "Mesure manquante",
  );
});

Deno.test("réparation machine : règle fermée et chemin précis sans message privé", () => {
  const error = assertThrows(() =>
    MachineSchema.parse({
      mode: "high_temp",
      seconds: 240,
      temperature: 150,
      speed: "1",
    })
  );
  const diagnostic = adaptationFailureDiagnostic(error, "validation");
  assertEquals(diagnostic.issues?.[0], {
    code: "custom",
    rule: "browning_speed_forbidden",
    path: "speed",
  });
  assertEquals(
    buildCookidooMachinePrompt().includes(
      "Rissoler ne porte pas de vitesse manuelle",
    ),
    true,
  );
  for (
    const sample of [{ mode: "knead", seconds: 240 }, {
      mode: "high_temp",
      seconds: 240,
      temperature: 150,
      power: "Gentle",
    }, { mode: "mix", seconds: 20, speed: "2" }]
  ) assertEquals(MachineSchema.safeParse(sample).success, true);
});

Deno.test("Pétrin : annotation couvre le libellé et les quatre minutes", () => {
  const payload = mapRecipeToCookidoo(
    applyAdaptation(source, JSON.stringify(output())).recipe,
  );
  const step = payload.instructions[0];
  const annotation = step.annotations.find((a) => a.type === "MODE")!;
  assertEquals(
    step.text.slice(
      annotation.position.offset,
      annotation.position.offset + annotation.position.length,
    ),
    "Pétrin / 240 s",
  );
});

Deno.test("vue appareil : texte seul, autre mode ou autre durée ne prouvent pas le Pétrin", async () => {
  const payload = mapRecipeToCookidoo(
    applyAdaptation(source, JSON.stringify(output())).recipe,
  );
  for (
    const [type, intent, time, expected] of [
      ["CustomerText", "cooking-mode/Dough", "240", [0]],
      ["CustomerAnnotations", "cooking-mode/ManualValues", "240", [0]],
      ["CustomerAnnotations", "cooking-mode/Dough", "15", [0]],
      ["CustomerAnnotations", "cooking-mode/Dough", "240", []],
    ] as const
  ) {
    const ctx = {
      cookieHeader: "",
      lang: "fr-FR",
      fetchImpl: (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              PromptDetails: {
                Prompts: [{
                  Type: type,
                  PreparationStepIndex: 0,
                  Annotations: [{
                    IntentId: intent,
                    Parameters: [{ Name: "Time", Value: time }],
                  }],
                }],
              },
            }),
          ),
        )) as typeof fetch,
    };
    assertEquals(
      await findUnguidedSteps(ctx, "fixture", [0], payload.instructions),
      [...expected],
    );
  }
});

Deno.test("banc d'essai : le repli n'intervient qu'une fois après une réponse invalide", async () => {
  let smallCalls = 0;
  let largeCalls = 0;
  const result = await generateAdaptation({
    source,
    signal: new AbortController().signal,
    generate: () => {
      smallCalls++;
      return Promise.resolve("{}");
    },
    repair: () => {
      largeCalls++;
      return Promise.resolve(JSON.stringify(output()));
    },
  });
  assertEquals(result.recipe.steps[0].tm7?.mode, "knead");
  assertEquals([smallCalls, largeCalls], [1, 1]);
});

Deno.test("métriques : les échecs comptent dans le coût et ne deviennent pas des succès rapides", () => {
  const base = { policy: "test", input_tokens: 100, output_tokens: 10 };
  const summary = benchmarkSummary([
    { ...base, ok: false, duration_ms: 1, calls: 2 },
    { ...base, ok: true, duration_ms: 100, calls: 1 },
    { ...base, ok: true, duration_ms: 200, calls: 2 },
  ])[0];
  assertEquals(summary.valid_latency_median_ms, 100);
  assertEquals(summary.valid_latency_p95_ms, 200);
  assertEquals(summary.first_call_valid, 1);
  assertEquals(summary.failed, 1);
  assertEquals(summary.input_tokens_per_valid, 150);
  assertEquals(summary.second_call_rate, 2 / 3);
});
