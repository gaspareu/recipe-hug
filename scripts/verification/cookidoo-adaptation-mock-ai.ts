/** Test local : DB/auth dev réels, quota et IA simulés, Cookidoo bloqué. */
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = typeof input === "string"
    ? input
    : input instanceof URL
    ? input.href
    : input.url;
  if (/cookidoo\.fr|vorwerk|cloudinary/.test(target)) {
    throw new Error("Le test interdit tout accès Cookidoo.");
  }
  // Les régressions ne consomment pas le quota quotidien du compte de test.
  // Ce bootstrap est exclusivement local ; la fonction déployée garde sa RPC réelle.
  if (target.endsWith("/rest/v1/rpc/consume_cookidoo_preparation_quota")) {
    return new Response("true", { headers: { "Content-Type": "application/json" } });
  }
  if (target === "https://api.anthropic.com/v1/messages") {
    const body = JSON.parse(String(init?.body));
    const request = JSON.parse(body.messages[0].content);
    if (request.clarifications?.includes("VERIFY_PROVIDER_FAILURE")) {
      return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "Simulation" } }), { status: 503 });
    }
    const recipe = request.recipe;
    const uses = recipe.ingredients.map((
      ingredient: { quantity: number },
      index: number,
    ) => ({
      ingredient_index: index,
      quantity: ingredient.quantity > 0 ? ingredient.quantity : null,
    }));
    const manual = (order: number, duration_minutes: number) => ({
      kind: "keep",
      source_orders: [order],
      source_parts: recipe.steps.find((s: { order: number }) =>
        s.order === order
      ).parts.map((_: string, part: number) => ({ order, part })),
      duration_minutes,
      tm7: null,
      uses: [],
    });
    const steps: Record<string, unknown>[] = [
      {
        kind: "replace",
        source_orders: [1],
        source_parts: [{ order: 1, part: 0 }],
        tm7: { mode: "knead", seconds: 120 },
        uses: uses.filter((_: unknown, i: number) =>
          i !== recipe.ingredients.length - 1 || !request.technical_water_ml
        ),
      },
      { ...manual(2, 90), preparation_from: [{ order: 1, part: 0 }] },
      request.technical_water_ml
        ? {
          kind: "replace",
          source_orders: [3],
          source_parts: [{ order: 3, part: 0 }],
          preparation_from: [{ order: 2, part: 0 }],
          tm7: {
            mode: "steam",
            seconds: 600,
            speed: "1",
            temperature: "Varoma",
            accessory: "varoma",
          },
          uses: [],
        }
        : manual(3, 30),
    ];
    steps.splice(1, 0, {
      kind: "transfer",
      source_orders: [1],
      source_parts: [],
      preparation_from: [{ order: 1, part: 0 }],
      manual_action: "empty_bowl",
      tm7: null,
      uses: [],
    });
    if (request.technical_water_ml) {
      steps.splice(3, 0, {
        kind: "transfer",
        source_orders: [3],
        source_parts: [],
        preparation_from: [{ order: 2, part: 0 }],
        manual_action: "transfer_to_varoma",
        tm7: null,
        uses: [],
      }, {
        kind: "technical",
        source_orders: [3],
        source_parts: [],
        manual_action: "add_steam_water",
        tm7: null,
        uses: [uses.at(-1)],
      });
    }
    const repair = !!body.output_config?.format?.schema?.properties?.edits;
    const validFirst = steps[0];
    if (!repair) {
      const firstUses =
        (steps[0].uses as Array<{ ingredient_index: number; quantity: number }>)
          .map((use, index) =>
            index ? use : { ...use, quantity: use.quantity + 1 }
          );
      steps[0] = { ...steps[0], uses: firstUses };
    }
    return new Response(
      JSON.stringify({
        content: [{
          type: "text",
          text: JSON.stringify(repair ? { edits: [{ index: 0, steps: [validFirst] }] } : {
            steps,
            changes: ["Pétrissage dans le bol."],
            notes: [],
            blockers: request.clarifications?.includes("VERIFY_NEEDS_INPUT") ? ["Souhaitez-vous conserver le façonnage manuel ?"] : [],
          }),
        }],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }
  return originalFetch(input, init);
};
await import("../../supabase/functions/export-recipe-cookidoo/index.ts");
