import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  applyAdaptation,
  signConfirmation,
  sourceFingerprint,
  verifyConfirmation,
} from "./adaptation.ts";
import type { Recipe } from "./types.ts";
const source: Recipe = {
  title: "Pain",
  servings: 4,
  ingredients: [{ name: "farine", quantity: 300, unit: "g" }, {
    name: "eau",
    quantity: 180,
    unit: "ml",
  }],
  steps: [{ order: 1, text: "Mélanger dans un saladier." }, {
    order: 2,
    text: "Laisser reposer puis façonner.",
  }],
};
const output = (): {
  steps: Array<
    {
      source_orders: number[];
      text: string;
      duration_minutes?: number;
      tm7: Record<string, unknown> | null;
      uses: Array<{ ingredient_index: number; quantity: number | null }>;
      manual_action?: string;
    }
  >;
  changes: string[];
  notes: string[];
  blockers: string[];
} => ({
  steps: [{
    source_orders: [1],
    text: "Mettre la farine et l'eau dans le bol, pétrir.",
    tm7: { mode: "knead", seconds: 120 },
    uses: [{ ingredient_index: 0, quantity: 300 }, {
      ingredient_index: 1,
      quantity: 180,
    }],
  }, {
    source_orders: [2],
    text: "Laisser reposer.",
    duration_minutes: 60,
    tm7: null,
    uses: [],
  }, {
    source_orders: [2],
    text: "façonner.",
    tm7: null,
    uses: [],
  }],
  changes: ["Pétrissage dans le bol au lieu du saladier."],
  notes: [],
  blockers: [],
});
Deno.test("adapte un mélange au saladier et découpe les actions sans changer les ingrédients ni la source", () => {
  const before = JSON.stringify(source);
  const result = applyAdaptation(source, JSON.stringify(output()));
  assertEquals(result.recipe.steps.length, 3);
  assertEquals(result.recipe.steps[0].tm7?.mode, "knead");
  assertEquals(result.recipe.steps[0].text.includes("300 g de farine"), true);
  assertEquals(result.recipe.ingredients, source.ingredients);
  assertEquals(JSON.stringify(source), before);
});
Deno.test("rejette une quantité changée, un ingrédient ou une action omis", () => {
  const changed = output();
  changed.steps[0].uses[0].quantity = 299;
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(changed)),
    Error,
    "quantités",
  );
  const missing = output();
  missing.steps[0].uses.pop();
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(missing)),
    Error,
    "ingrédient",
  );
  const action = output();
  action.steps = action.steps.slice(0, 1);
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(action)),
    Error,
    "actions",
  );
});
Deno.test("répartit les quantités sans les doubler", () => {
  const divided = output();
  divided.steps[0].uses[0].quantity = 200;
  divided.steps[1].uses = [{ ingredient_index: 0, quantity: 100 }];
  assertEquals(
    applyAdaptation(source, JSON.stringify(divided)).recipe.steps[1].text
      .includes("100 g de farine"),
    true,
  );
});
Deno.test("vapeur sans eau technique : bloque l'envoi sans inventer d'eau", () => {
  const steam = output();
  steam.steps[0].tm7 = {
    mode: "steam",
    seconds: 600,
    speed: "1",
    temperature: "Varoma",
  } as typeof steam.steps[0]["tm7"];
  const result = applyAdaptation(source, JSON.stringify(steam));
  assertEquals(result.blockers.length, 1);
  assertEquals(result.recipe.ingredients.length, 2);
});
Deno.test("eau technique fournie explicitement : uniquement dans la copie", () => {
  const steam = output();
  steam.steps.splice(1, 0, {
    source_orders: [1],
    text: "Réserver.",
    tm7: null,
    manual_action: "empty_bowl",
    uses: [],
  }, {
    source_orders: [1],
    text: "Eau technique.",
    tm7: null,
    manual_action: "add_steam_water",
    uses: [{ ingredient_index: 2, quantity: 500 }],
  }, {
    source_orders: [1],
    text: "Vapeur.",
    tm7: { mode: "steam", seconds: 600, speed: "1", temperature: "Varoma" },
    uses: [],
  });
  const result = applyAdaptation(source, JSON.stringify(steam), 500);
  assertEquals(result.recipe.ingredients.length, 3);
  assertEquals(source.ingredients.length, 2);
});
Deno.test("le four et les accessoires incompatibles restent bloqués", () => {
  const oven = output();
  oven.steps[0].text = "Enfourner le pain au four.";
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(oven)),
    Error,
    "four",
  );
  const bad = output();
  bad.steps[0].tm7 = {
    mode: "mix",
    seconds: 10,
    speed: "10",
    accessory: "butterfly",
  } as typeof bad.steps[0]["tm7"];
  assertThrows(() => applyAdaptation(source, JSON.stringify(bad)));
});
Deno.test("empreinte : titre ignoré, cuisine et portions prises en compte", async () => {
  const hash = await sourceFingerprint(source);
  assertEquals(
    await sourceFingerprint({ ...source, title: "Autre titre" }),
    hash,
  );
  assertEquals(
    await sourceFingerprint({ ...source, servings: 8 }) === hash,
    false,
  );
  assertEquals(
    await sourceFingerprint({
      ...source,
      ingredients: [
        { ...source.ingredients[0], quantity: 301 },
        source.ingredients[1],
      ],
    }) === hash,
    false,
  );
  assertEquals(
    await sourceFingerprint({
      ...source,
      steps: [{ ...source.steps[0], text: "Pétrir." }, source.steps[1]],
    }) === hash,
    false,
  );
});
Deno.test("confirmation liée au propriétaire, à la recette, à l'adaptation et aux révisions ; renouvelable sans IA", async () => {
  const binding = {
    userId: "u1",
    recipeId: "r1",
    adaptationId: "a1",
    revision: "v1",
    adaptationRevision: "a-v1",
  };
  const token = await signConfirmation(binding, "secret", 1000);
  assertEquals(await verifyConfirmation(token, binding, "secret", 2000), true);
  for (const key of Object.keys(binding)) {
    assertEquals(
      await verifyConfirmation(
        token,
        { ...binding, [key]: "other" },
        "secret",
        2000,
      ),
      false,
    );
  }
  assertEquals(
    await verifyConfirmation(token, binding, "secret", 1000000),
    false,
  );
  assertEquals(
    await verifyConfirmation(
      await signConfirmation(binding, "secret", 1000000),
      binding,
      "secret",
      1001000,
    ),
    true,
  );
});

Deno.test("l'eau vapeur ne peut pas être incorporée à la pâte", () => {
  const bad = output();
  bad.steps[0].uses.push({ ingredient_index: 2, quantity: 500 });
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(bad), 500),
    Error,
    "eau technique",
  );
});
Deno.test("les instructions machine libres ne peuvent introduire des aliments ou mesures contradictoires", () => {
  const bad = output();
  bad.steps[0].text =
    "Ajouter 900 g de farine et 100 g de cacahuètes, puis pétrir.";
  const rendered =
    applyAdaptation(source, JSON.stringify(bad)).recipe.steps[0].text;
  assertEquals(rendered.includes("cacahuètes"), false);
  assertEquals(rendered.includes("900"), false);
  assertEquals(rendered.includes("300 g"), true);
  bad.steps[1].text = "Ajouter des cacahuètes.";
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(bad)),
    Error,
    "instruction manuelle",
  );
});

Deno.test("l'eau technique nécessite un bol vidé et ne peut être mélangée à la pâte ensuite", () => {
  const bad = output();
  bad.steps.splice(1, 0, {
    source_orders: [1],
    text: "Eau.",
    tm7: null,
    manual_action: "add_steam_water",
    uses: [{ ingredient_index: 2, quantity: 500 }],
  }, {
    source_orders: [1],
    text: "Vapeur.",
    tm7: { mode: "steam", seconds: 600, speed: "1", temperature: "Varoma" },
    uses: [],
  });
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(bad), 500),
    Error,
    "vider le bol",
  );
  bad.steps.splice(1, 0, {
    source_orders: [1],
    text: "Réserver.",
    tm7: null,
    manual_action: "empty_bowl",
    uses: [],
  });
  bad.steps.splice(3, 0, {
    source_orders: [1],
    text: "Mélanger.",
    tm7: { mode: "mix", seconds: 30, speed: "2" },
    uses: [],
  });
  assertThrows(
    () => applyAdaptation(source, JSON.stringify(bad), 500),
    Error,
    "autre action",
  );
});

Deno.test("une action machine ne peut pas simuler un vidage manuel", () => {
  const proposal = output();
  proposal.steps[0].manual_action = "empty_bowl";
  assertThrows(() => applyAdaptation(source, JSON.stringify(proposal)));
});
