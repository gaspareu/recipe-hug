// Informations de version injectées au build (voir `define` dans vite.config.ts).
// Permet de vérifier quel build est réellement servi (utile avec le cache PWA).

export const appVersion = {
  version: __APP_VERSION__,
  commit: __APP_COMMIT__,
  buildDate: __APP_BUILD_DATE__,
};

/** Libellé compact : "v1.0.0 (1faa132) — 10/06/2026 14:32" */
export function formatAppVersion(): string {
  const date = new Date(appVersion.buildDate);
  const formatted = isNaN(date.getTime())
    ? appVersion.buildDate
    : date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  return `v${appVersion.version} (${appVersion.commit}) — ${formatted}`;
}
