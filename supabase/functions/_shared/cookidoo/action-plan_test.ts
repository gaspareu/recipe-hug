import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { applyActionPlan, validateActionPlan } from "./action-plan.ts";
import { PlanError } from "./plan-errors.ts";
import { applyTargetedRepair } from "./targeted-repair.ts";
import { mapRecipeToCookidoo } from "./mapper.ts";

const ref = (order: number, part = 0) => ({ order, part });
const source = {
  title: "Parmentier synthétique",
  ingredients: [{ name: "graisse", quantity: 2, unit: "c. à soupe" }, {
    name: "échalotes",
    quantity: 4,
    unit: "pièce",
  }],
  steps: [
    { order: 1, text: "Faire chauffer la graisse dans une poêle." },
    { order: 2, text: "Ajouter les échalotes et cuire 5 minutes." },
  ],
};
const base = () => ({
  changes: ["Adaptation partielle."],
  notes: ["À confirmer."],
  blockers: [],
  steps: [
    {
      kind: "keep",
      source_orders: [1],
      source_parts: [ref(1)],
      tm7: null,
      uses: [{ ingredient_index: 0 }],
    },
    {
      kind: "transfer",
      source_orders: [1],
      source_parts: [],
      preparation_from: [ref(1)],
      manual_action: "transfer_to_bowl",
      tm7: null,
      uses: [],
    },
    {
      kind: "replace",
      source_orders: [2],
      source_parts: [ref(2)],
      preparation_from: [ref(1)],
      tm7: { mode: "cook", seconds: 300, speed: "1", temperature: 100 },
      uses: [{ ingredient_index: 1 }],
    },
  ],
});

Deno.test("Parmentier : une préparation manuelle est transférée puis réutilisée sans nouvel ajout", () => {
  const before = JSON.stringify(source);
  const result = applyActionPlan(source, base());
  assertEquals(result.blockers, []);
  assertEquals(
    result.recipe.steps[1].text,
    "Reprendre la préparation réservée et la mettre dans le bol.",
  );
  assertEquals(result.recipe.steps[2].text.includes("graisse"), false);
  assertEquals(result.recipe.steps[2].text.includes("4 échalotes"), true);
  assertEquals(JSON.stringify(source), before);
});

Deno.test("Parmentier : conserver la poêle et remplacer le même fragment dans le bol est refusé", () => {
  const plan = base();
  const duplicate = {
    ...plan.steps[2],
    source_orders: [1],
    source_parts: [ref(1)],
  };
  const error = assertThrows(() =>
    validateActionPlan(source, {
      ...plan,
      steps: [plan.steps[0], plan.steps[1], duplicate],
    })
  );
  assertEquals((error as PlanError).reason, "action_duplicate");
  assertEquals((error as PlanError).step_indexes, [0, 2]);
});

Deno.test("Parmentier : un ajout manuel implicite ne peut être caché par un ajout structuré ultérieur", () => {
  const plan = base();
  const first = { ...plan.steps[0], uses: [] };
  const second = {
    ...plan.steps[2],
    uses: [{ ingredient_index: 0 }, { ingredient_index: 1 }],
  };
  const error = assertThrows(() =>
    validateActionPlan(source, {
      ...plan,
      steps: [first, plan.steps[1], second],
    })
  );
  assertEquals((error as PlanError).reason, "ingredient_mismatch");
  assertEquals((error as PlanError).step_indexes, [0, 2]);
});

Deno.test("un transfert ne peut ajouter d'ingrédient, viser le futur ou être omis entre poêle et bol", () => {
  const plan = base();
  for (
    const transfer of [
      { ...plan.steps[1], uses: [{ ingredient_index: 0 }] },
      { ...plan.steps[1], preparation_from: [ref(2)] },
    ]
  ) {
    assertThrows(() =>
      validateActionPlan(source, {
        ...plan,
        steps: [plan.steps[0], transfer, plan.steps[2]],
      })
    );
  }
  assertThrows(() =>
    validateActionPlan(source, {
      ...plan,
      steps: [plan.steps[0], plan.steps[2]],
    })
  );
});

Deno.test("tous les fragments source doivent être traités, y compris les gestes manuels internes", () => {
  const extended = {
    ...source,
    steps: [{
      ...source.steps[0],
      text: `${source.steps[0].text} Laisser tiédir.`,
    }, source.steps[1]],
  };
  const error = assertThrows(() => validateActionPlan(extended, base()));
  assertEquals((error as PlanError).reason, "action_missing");
  assertEquals((error as PlanError).source_parts, [ref(1, 1)]);
});

Deno.test("four et vapeur non précisée : conserver la source manuelle est accepté", () => {
  const manualSource = {
    ...source,
    ingredients: [source.ingredients[0]],
    steps: [{ order: 1, text: "Faire cuire la graisse au four." }],
  };
  const plan = { ...base(), steps: [base().steps[0]] };
  assertEquals(applyActionPlan(manualSource, plan).blockers, []);
  const machine = {
    ...plan,
    steps: [{
      ...plan.steps[0],
      kind: "replace",
      tm7: { mode: "cook", seconds: 60, speed: "1", temperature: 100 },
    }],
  };
  assertThrows(() => applyActionPlan(manualSource, machine));
  const steam = {
    ...plan,
    steps: [{
      ...plan.steps[0],
      kind: "replace",
      tm7: { mode: "steam", seconds: 60, speed: "1", temperature: "Varoma" },
    }],
  };
  assertThrows(() => applyActionPlan(manualSource, steam));
});

Deno.test("une décision manuelle explicite ne devient pas une commande en rencontrant Varoma", () => {
  const manualSource = {
    ...source,
    ingredients: [source.ingredients[0]],
    steps: [{ order: 1, text: "Mettre la graisse dans le Varoma." }],
  };
  const result = applyActionPlan(manualSource, {
    ...base(),
    steps: [base().steps[0]],
  });
  const payload = mapRecipeToCookidoo(result.recipe);
  assertEquals(result.recipe.steps[0].manual_only, true);
  assertEquals(
    payload.instructions[0].annotations.some((a) => a.type !== "INGREDIENT"),
    false,
  );
});

Deno.test("patch : seuls les indices autorisés changent, source et métadonnées restent identiques", () => {
  const plan = base();
  const before = JSON.stringify(plan);
  const patched = applyTargetedRepair(
    plan,
    {
      edits: [{
        index: 2,
        steps: [{
          ...plan.steps[2],
          tm7: { mode: "cook", seconds: 120, speed: "1", temperature: 100 },
        }],
      }],
    },
    [2],
  ) as typeof plan;
  assertEquals(patched.steps.slice(0, 2), plan.steps.slice(0, 2));
  assertEquals(patched.notes, plan.notes);
  assertEquals(JSON.stringify(plan), before);
  assertThrows(() =>
    applyTargetedRepair(
      plan,
      { edits: [{ index: 0, steps: [] }] },
      [2],
    )
  );
  assertThrows(() =>
    applyTargetedRepair(
      plan,
      { edits: [{ index: 2, steps: [] }], blockers: [] },
      [2],
    )
  );
  assertThrows(() =>
    applyTargetedRepair(
      plan,
      {
        edits: [{ index: 2, steps: [] }, { index: 2, steps: [] }],
      },
      [2],
    )
  );
});

Deno.test("une action remplacée ne peut oublier la graisse restée dans la poêle", () => {
  const explicit = {
    ...source,
    steps: [source.steps[0], {
      order: 2,
      text: "Ajouter les échalotes dans la graisse chaude et cuire 5 minutes.",
    }],
  };
  const plan = base();
  const error = assertThrows(() =>
    applyActionPlan(explicit, {
      ...plan,
      steps: [plan.steps[0], { ...plan.steps[2], preparation_from: [] }],
    })
  );
  assertEquals((error as PlanError).reason, "ingredient_mismatch");
  const implicit = {
    ...source,
    steps: [{
      order: 1,
      text:
        "Faire chauffer la graisse dans une poêle. Ajouter les échalotes et cuire 5 minutes.",
    }],
  };
  const second = {
    ...plan.steps[2],
    source_orders: [1],
    source_parts: [ref(1, 1)],
    preparation_from: [],
  };
  const contextual = assertThrows(() =>
    applyActionPlan(implicit, { ...plan, steps: [plan.steps[0], second] })
  );
  assertEquals((contextual as PlanError).reason, "preparation_unavailable");
});

Deno.test("une ancienne référence consommée ne peut reprendre une seconde fois la même pâte", () => {
  const dough = {
    title: "Pâte",
    ingredients: [{ name: "farine", quantity: 100, unit: "g" }],
    steps: [{ order: 1, text: "Mélanger la farine." }, {
      order: 2,
      text: "Pétrir la pâte.",
    }],
  };
  const steps = [
    {
      kind: "keep",
      source_orders: [1],
      source_parts: [ref(1)],
      tm7: null,
      uses: [{ ingredient_index: 0 }],
    },
    {
      kind: "transfer",
      source_orders: [1],
      source_parts: [],
      preparation_from: [ref(1)],
      manual_action: "transfer_to_bowl",
      tm7: null,
      uses: [],
    },
    {
      kind: "replace",
      source_orders: [2],
      source_parts: [ref(2)],
      preparation_from: [ref(1)],
      tm7: { mode: "knead", seconds: 120 },
      uses: [],
    },
    {
      kind: "transfer",
      source_orders: [2],
      source_parts: [],
      preparation_from: [ref(2)],
      manual_action: "empty_bowl",
      tm7: null,
      uses: [],
    },
    {
      kind: "transfer",
      source_orders: [2],
      source_parts: [],
      preparation_from: [ref(1)],
      manual_action: "transfer_to_bowl",
      tm7: null,
      uses: [],
    },
  ];
  const error = assertThrows(() =>
    applyActionPlan(dough, { ...base(), steps })
  );
  assertEquals((error as PlanError).reason, "preparation_unavailable");
  // La référence du résultat actuel reste réutilisable : pas de faux blocage.
  assertEquals(
    applyActionPlan(dough, {
      ...base(),
      steps: [...steps.slice(0, 4), {
        ...steps[4],
        preparation_from: [ref(2)],
      }],
    }).blockers,
    [],
  );
});

Deno.test("transférer les carottes externes au Varoma ne vide pas la farine du bol", () => {
  const vegetables = {
    title: "Test bol occupé",
    ingredients: [{ name: "farine", quantity: 100, unit: "g" }, {
      name: "carottes",
      quantity: 300,
      unit: "g",
    }],
    steps: [{ order: 1, text: "Mélanger la farine." }, {
      order: 2,
      text: "Couper les carottes.",
    }, { order: 3, text: "Cuire les carottes à la vapeur." }],
  };
  const steps = [
    {
      kind: "replace",
      source_orders: [1],
      source_parts: [ref(1)],
      tm7: { mode: "mix", seconds: 10, speed: "2" },
      uses: [{ ingredient_index: 0 }],
    },
    {
      kind: "keep",
      source_orders: [2],
      source_parts: [ref(2)],
      tm7: null,
      uses: [{ ingredient_index: 1 }],
    },
    {
      kind: "transfer",
      source_orders: [3],
      source_parts: [],
      preparation_from: [ref(2)],
      manual_action: "transfer_to_varoma",
      tm7: null,
      uses: [],
    },
    {
      kind: "technical",
      source_orders: [3],
      source_parts: [],
      manual_action: "add_steam_water",
      tm7: null,
      uses: [{ ingredient_index: 2 }],
    },
    {
      kind: "replace",
      source_orders: [3],
      source_parts: [ref(3)],
      preparation_from: [ref(2)],
      tm7: { mode: "steam", seconds: 600, speed: "1", temperature: "Varoma" },
      uses: [],
    },
  ];
  const error = assertThrows(() =>
    applyActionPlan(vegetables, { ...base(), steps }, 500)
  );
  assertEquals((error as PlanError).reason, "bowl_not_empty_before_water");
  const emptied = {
    kind: "transfer",
    source_orders: [1],
    source_parts: [],
    preparation_from: [ref(1)],
    manual_action: "empty_bowl",
    tm7: null,
    uses: [],
  };
  assertEquals(
    applyActionPlan(vegetables, {
      ...base(),
      steps: [...steps.slice(0, 3), emptied, ...steps.slice(3)],
    }, 500).blockers,
    [],
  );
});

Deno.test("eau vapeur : un transfert externe conserve l'eau, une arrivée alimentaire au bol est refusée", () => {
  const vegetables = {
    title: "Carottes vapeur",
    ingredients: [{ name: "carottes", quantity: 300, unit: "g" }],
    steps: [{ order: 1, text: "Couper les carottes." }, {
      order: 2,
      text: "Cuire les carottes à la vapeur.",
    }],
  };
  const cut = {
    kind: "keep",
    source_orders: [1],
    source_parts: [ref(1)],
    tm7: null,
    uses: [{ ingredient_index: 0 }],
  };
  const water = {
    kind: "technical",
    source_orders: [2],
    source_parts: [],
    manual_action: "add_steam_water",
    tm7: null,
    uses: [{ ingredient_index: 1 }],
  };
  const transfer = {
    kind: "transfer",
    source_orders: [2],
    source_parts: [],
    preparation_from: [ref(1)],
    manual_action: "transfer_to_varoma",
    tm7: null,
    uses: [],
  };
  const steam = {
    kind: "replace",
    source_orders: [2],
    source_parts: [ref(2)],
    preparation_from: [ref(1)],
    tm7: { mode: "steam", seconds: 600, speed: "1", temperature: "Varoma" },
    uses: [],
  };
  const result = applyActionPlan(vegetables, {
    ...base(),
    steps: [cut, water, transfer, steam],
  }, 500);
  assertEquals(result.blockers, []);
  assertEquals(result.recipe.ingredients.length, 2);
  assertEquals(vegetables.ingredients.length, 1);
  // La farine réservée reste hors du bol rempli d'eau technique.
  const withFlour = {
    ...vegetables,
    ingredients: [...vegetables.ingredients, {
      name: "farine",
      quantity: 100,
      unit: "g",
    }],
    steps: [...vegetables.steps, { order: 3, text: "Réserver la farine." }],
  };
  const flour = {
    ...cut,
    source_orders: [3],
    source_parts: [ref(3)],
    uses: [{ ingredient_index: 1 }],
  };
  const intoBowl = {
    ...transfer,
    preparation_from: [ref(3)],
    manual_action: "transfer_to_bowl",
  };
  const error = assertThrows(() =>
    applyActionPlan(withFlour, {
      ...base(),
      steps: [
        flour,
        cut,
        transfer,
        { ...water, uses: [{ ingredient_index: 2 }] },
        intoBowl,
        steam,
      ],
    }, 500)
  ) as PlanError;
  assertEquals(error.reason, "technical_water_conflict");
  assertEquals(error.step_indexes, [3, 4]);
  assertThrows(() =>
    applyActionPlan(vegetables, {
      ...base(),
      steps: [cut, transfer, steam, water],
    }, 500)
  );
});

Deno.test("quantité nulle : refus localisable avant le rendu, répartition positive autorisée", () => {
  const flour = {
    title: "Farine partagée",
    ingredients: [{ name: "farine", quantity: 300, unit: "g" }],
    steps: [{ order: 1, text: "Mélanger la farine." }, {
      order: 2,
      text: "Ajouter la farine.",
    }],
  };
  const step = (order: number, quantity: number) => ({
    kind: "replace",
    source_orders: [order],
    source_parts: [ref(order)],
    tm7: { mode: "mix", seconds: 10, speed: "2" },
    uses: [{ ingredient_index: 0, quantity }],
  });
  const error = assertThrows(() =>
    validateActionPlan(flour, { ...base(), steps: [step(1, 0), step(2, 300)] })
  ) as PlanError;
  assertEquals(error.reason, "ingredient_mismatch");
  assertEquals(error.step_indexes, [0, 1]);
  assertEquals(
    applyActionPlan(flour, { ...base(), steps: [step(1, 100), step(2, 200)] })
      .blockers,
    [],
  );
});
