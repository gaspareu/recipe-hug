/** Bootstrap de test local : Supabase dev réel, fournisseur IA simulé, Cookidoo bloqué. */
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/cookidoo\.fr|vorwerk|cloudinary/.test(target)) throw new Error("Le test interdit tout accès Cookidoo.");
  if (target === "https://api.anthropic.com/v1/messages") {
    const body = JSON.parse(String(init?.body));
    const request = JSON.parse(body.messages.at(-1).content);
    const recipe = request.recipe;
    const uses = recipe.ingredients.map((ingredient: { quantity: number }, index: number) => ({ ingredient_index: index, quantity: ingredient.quantity > 0 ? ingredient.quantity : null }));
    const manual = (order: number, duration_minutes: number) => ({ source_orders: [order], source_parts: recipe.steps.find((s: { order: number }) => s.order === order).parts.map((_: string, part: number) => ({ order, part })), duration_minutes, tm7: null, uses: [] });
    const steps: Record<string, unknown>[] = [
      { source_orders: [1], tm7: { mode: "knead", seconds: 120 }, uses: uses.filter((_: unknown, i: number) => i !== recipe.ingredients.length - 1 || !request.technical_water_ml) },
      manual(2, 90),
      request.technical_water_ml
        ? { source_orders: [3], tm7: { mode: "steam", seconds: 600, speed: "1", temperature: "Varoma", accessory: "varoma" }, uses: [] }
        : manual(3, 30),
    ];
    if (request.technical_water_ml) steps.splice(2, 0, { source_orders: [3], manual_action: "empty_bowl", tm7: null, uses: [] }, { source_orders: [3], manual_action: "add_steam_water", tm7: null, uses: [uses.at(-1)] });
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ steps, changes: ["Pétrissage dans le bol."], notes: [], blockers: [] }) }] }), { headers: { "Content-Type": "application/json" } });
  }
  return originalFetch(input, init);
};
await import("../../supabase/functions/export-recipe-cookidoo/index.ts");
