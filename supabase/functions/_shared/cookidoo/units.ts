/** Unités françaises comprises par l'éditeur Cookidoo ; aucune conversion de densité. */
export function normalizeCookidooUnit(raw: string): string {
  if (raw.trim() === "L") return "L";
  const unit = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(?:cuillères?|c\.)\s*à soupe$|^càs$/.test(unit)) return "c. à soupe";
  if (/^(?:cuillères?|c\.)\s*à café$|^càc$/.test(unit)) return "c. à café";
  const aliases: Record<string, string> = {
    gramme: "g", grammes: "g", kilogramme: "kg", kilogrammes: "kg",
    millilitre: "ml", millilitres: "ml", litre: "l", litres: "l",
  };
  return aliases[unit] ?? unit;
}

export function hasAmbiguousUnit(raw: string): boolean {
  return /^(?:cuillères?|verres?|tasses?)$/i.test(raw.trim());
}
