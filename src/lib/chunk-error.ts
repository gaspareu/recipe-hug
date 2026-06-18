/**
 * Détecte les erreurs de chargement de chunk (import dynamique échoué).
 * Survient typiquement en PWA après un déploiement : l'app en cache demande un
 * ancien chunk lazy qui n'existe plus. Recharger récupère la nouvelle version.
 *
 * Couvre les messages des trois moteurs : Chrome, Firefox, Safari.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror/i.test(
    message,
  );
}
