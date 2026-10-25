/** Corpus synthétique, aucune donnée production ni écriture Cookidoo. */
import {
  callAINonStreaming,
  type ChatMessage,
} from "../../supabase/functions/_shared/ai-providers.ts";
import { generateAdaptation } from "../../supabase/functions/_shared/cookidoo/adaptation-generation.ts";
import { ADAPTATION_JSON_SCHEMA, ADAPTATION_REPAIR_JSON_SCHEMA } from "../../supabase/functions/_shared/cookidoo/adaptation-format.ts";
import { adaptationFailureDiagnostic } from "../../supabase/functions/_shared/cookidoo/adaptation-diagnostics.ts";
import {
  type BenchmarkSample,
  benchmarkSummary,
} from "../../supabase/functions/_shared/cookidoo/benchmark.ts";
import { mapRecipeToCookidoo } from "../../supabase/functions/_shared/cookidoo/mapper.ts";
import { validateCookidooPayload } from "../../supabase/functions/_shared/cookidoo/validate.ts";
import type { Recipe } from "../../supabase/functions/_shared/cookidoo/types.ts";

const ingredient = (name: string, quantity: number, unit: string) => ({
  name,
  quantity,
  unit,
});
const fixtures: Array<
  { id: string; source: Recipe; technicalWaterMl?: number }
> = [
  {
    id: "pizza",
    source: {
      title: "Pizza de vérification",
      ingredients: [
        ingredient("farine", 300, "g"),
        ingredient("eau", 180, "ml"),
        ingredient("levure", 3, "g"),
      ],
      steps: [
        {
          order: 1,
          text:
            "Mélanger les ingrédients dans un saladier, puis pétrir 8 minutes.",
        },
        { order: 2, text: "Laisser lever 1 heure. Façonner une pizza." },
        { order: 3, text: "Cuire au four à 250°C pendant 10 minutes." },
      ],
    },
  },
  {
    id: "salade",
    source: {
      title: "Salade de vérification",
      ingredients: [
        ingredient("lentilles", 100, "g"),
        ingredient("boulgour", 80, "g"),
        ingredient("huile", 2, "c. à soupe"),
        ingredient("sel", 1, "pincée"),
      ],
      steps: [{
        order: 1,
        text:
          "Cuire les lentilles dans une casserole d'eau pendant 25 minutes. Égoutter et laisser tiédir.",
      }, {
        order: 2,
        text:
          "Couvrir le boulgour d'eau bouillante dans un saladier. Laisser gonfler 10 minutes.",
      }, {
        order: 3,
        text:
          "Mélanger l'huile avec le sel. Mélanger délicatement avec les lentilles et le boulgour.",
      }],
    },
  },
  {
    id: "crepes",
    source: {
      title: "Crêpes de vérification",
      ingredients: [
        ingredient("beurre", 30, "g"),
        ingredient("farine", 150, "g"),
        ingredient("lait", 300, "ml"),
        ingredient("œufs", 2, "pièce"),
      ],
      steps: [{
        order: 1,
        text:
          "Faire fondre le beurre dans une casserole jusqu'à ce qu'il prenne une couleur noisette. Laisser tiédir.",
      }, {
        order: 2,
        text:
          "Mélanger la farine et les œufs. Incorporer le lait progressivement, puis le beurre noisette.",
      }, {
        order: 3,
        text: "Laisser reposer 1 heure. Cuire les crêpes à la poêle.",
      }],
    },
  },
  {
    id: "buns",
    source: {
      title: "Buns de vérification",
      ingredients: [
        ingredient("farine", 300, "g"),
        ingredient("lait", 180, "ml"),
        ingredient("levure", 5, "g"),
      ],
      steps: [
        {
          order: 1,
          text:
            "Mélanger le lait et la levure, puis incorporer la farine et pétrir.",
        },
        { order: 2, text: "Laisser lever 1 heure. Former 6 buns." },
        { order: 3, text: "Préchauffer le four à 180°C. Cuire 18 minutes." },
      ],
    },
  },
  {
    id: "vapeur",
    technicalWaterMl: 500,
    source: {
      title: "Légumes vapeur de vérification",
      ingredients: [ingredient("carottes", 300, "g")],
      steps: [{
        order: 1,
        text:
          "Couper les carottes en rondelles. Cuire les carottes à la vapeur pendant 20 minutes.",
      }],
    },
  },
];

const live = Deno.args.includes("--live");
const value = (flag: string, fallback: string) => {
  const index = Deno.args.indexOf(flag);
  return index < 0 ? fallback : Deno.args[index + 1] ?? fallback;
};
const small = value("--small", "claude-haiku-5-5");
const large = value("--large", "claude-sonnet-5-5");
const rounds = Number(value("--rounds", "3"));
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) {
  throw new Error("rounds doit être compris entre 1 et 10");
}
const policies = [{ name: "sonnet", first: large, repair: large }, {
  name: "haiku-sonnet",
  first: small,
  repair: large,
}];
if (!live) {
  console.log(JSON.stringify({
    mode: "dry-run",
    provider_calls: 0,
    cookidoo_calls: 0,
    fixtures: fixtures.map((f) => f.id),
    rounds,
    policies,
    maximum_provider_calls: rounds * policies.length * fixtures.length * 2,
  }));
  Deno.exit(0);
}
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
if (!apiKey) {
  console.error(
    "Benchmark non exécuté : ANTHROPIC_API_KEY absente. Aucune clé ni configuration de production n'a été modifiée.",
  );
  Deno.exit(2);
}
const samples: BenchmarkSample[] = [];
for (let round = 0; round < rounds; round++) {
  // Alterner l'ordre pour limiter le biais temporel entre fournisseurs/politiques.
  for (const fixture of fixtures) {
    for (
      const policy of round % 2 ? [...policies].reverse() : policies
    ) {
      const sample = {
        policy: policy.name,
        ok: false,
        duration_ms: 0,
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
      };
      const started = performance.now();
      let stage: "generation" | "validation" = "generation";
      let needsInput = false;
      let diagnostic:
        | ReturnType<typeof adaptationFailureDiagnostic>
        | undefined;
      const generate =
        (model: string) => (messages: ChatMessage[], signal: AbortSignal, phase: "generate" | "repair") => {
          sample.calls++;
          return callAINonStreaming(
            {
              provider: "anthropic",
              model,
              apiKey,
              endpoint: "https://api.anthropic.com/v1/messages",
            },
            messages,
            signal,
            {
              jsonSchema: phase === "repair" ? ADAPTATION_REPAIR_JSON_SCHEMA : ADAPTATION_JSON_SCHEMA,
              onUsage: (usage) => {
                sample.input_tokens += usage.input_tokens;
                sample.output_tokens += usage.output_tokens;
              },
            },
          );
        };
      try {
        const result = await generateAdaptation({
          ...fixture,
          signal: AbortSignal.timeout(60000),
          generate: generate(policy.first),
          repair: generate(policy.repair),
          onEvent: (e) => {
            stage = e.event === "generation" ? "generation" : "validation";
          },
        });
        needsInput = result.blockers.length > 0;
        const payload = result.recipe ? mapRecipeToCookidoo(result.recipe) : null;
        sample.ok = !!payload && !needsInput && validateCookidooPayload(payload).ok &&
          payload.instructions.some((s) =>
            s.annotations.some((a) => a.type !== "INGREDIENT")
          );
      } catch (error) {
        diagnostic = adaptationFailureDiagnostic(error, stage);
      }
      sample.duration_ms = Math.round(performance.now() - started);
      samples.push(sample);
      console.log(
        JSON.stringify({
          fixture: fixture.id,
          round: round + 1,
          ...sample,
          needs_input: needsInput,
          ...(diagnostic ? { diagnostic } : {}),
        }),
      );
    }
  }
}
console.log(JSON.stringify({
  mode: "live",
  models: { small, large },
  summary: benchmarkSummary(samples),
  caveat:
    "Validité structurelle seulement : revue culinaire nécessaire ; aucun test Cookidoo/TM7. Aucun gain ne doit être conclu si les échecs ou replis augmentent.",
}));
