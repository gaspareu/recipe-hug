import type { Tm7StepParams } from "../thermomix/reference.ts";

/** Texte explicite : les accessoires restent visibles même sans commande Cookidoo dédiée. */
export function formatExportSettings(tm7: Tm7StepParams): string {
  const accessories: Record<string, string> = { butterfly: "fouet", basket: "panier cuisson", varoma: "Varoma", spatula: "spatule", measuring_cup: "gobelet doseur", blade: "couteaux" };
  return [
    tm7.mode === "knead" ? "Pétrin" : tm7.mode === "high_temp" ? "Rissoler" : null,
    tm7.seconds ? `${tm7.seconds} s` : null,
    tm7.temperature !== undefined ? `${tm7.temperature}${typeof tm7.temperature === "number" ? "°C" : ""}` : null,
    tm7.speed ? `vitesse ${tm7.speed}` : null, tm7.reverse ? "sens inverse" : null,
    tm7.accessory ? accessories[tm7.accessory] : null, tm7.power ? `puissance ${tm7.power}` : null,
  ].filter(Boolean).join(" / ");
}
