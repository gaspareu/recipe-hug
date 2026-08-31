import * as Sentry from '@sentry/react';

let initialized = false;

/** Indique à la remontée manuelle des erreurs que le SDK a été initialisé. */
export function setErrorMonitoringInitialized(value: boolean): void {
  initialized = value;
}

/**
 * Normalise les routes contenant un identifiant avant de les associer à une
 * erreur : l'observabilité ne doit pas devenir une source de données métier.
 */
export function safeRouteName(pathname: string): string {
  if (/^\/recipes\/[^/]+\/edit$/.test(pathname)) return '/recipes/:id/edit';
  if (/^\/recipes\/[^/]+$/.test(pathname)) return '/recipes/:id';

  const knownRoutes = new Set([
    '/', '/auth', '/home', '/dashboard', '/recipes/new', '/profile', '/meal-planning',
  ]);
  return knownRoutes.has(pathname) ? pathname : 'unknown';
}

/** Retire tout contexte susceptible de contenir une conversation ou une donnée utilisateur. */
export function redactSentryEvent(event: Parameters<NonNullable<Parameters<typeof Sentry.init>[0]['beforeSend']>>[0]) {
  event.user = undefined;
  event.request = undefined;
  event.breadcrumbs = undefined;
  event.extra = undefined;
  event.contexts = undefined;
  event.transaction = undefined;

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => ({
      type: exception.type ?? 'Error',
      // Le message original peut contenir un texte de chat ou une réponse amont.
      value: 'Message d’erreur masqué par recipe-hug',
      mechanism: exception.mechanism,
      stacktrace: exception.stacktrace
        ? {
            ...exception.stacktrace,
            frames: exception.stacktrace.frames?.map((frame) => ({ ...frame, vars: undefined })),
          }
        : undefined,
    }));
  }

  return event;
}

/** Envoie uniquement une erreur normalisée de route, jamais l'erreur brute. */
export function reportRouteError(error: unknown, pathname: string, isChunkLoadError: boolean): void {
  if (!initialized) return;

  const errorType = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]*Error$/.test(error.name)
    ? error.name
    : 'Error';
  const safeError = new Error(isChunkLoadError ? 'Chargement de module échoué' : 'Rendu de route échoué');
  safeError.name = errorType;

  Sentry.captureException(safeError, {
    tags: {
      source: 'route-error',
      route: safeRouteName(pathname),
      chunk_load: String(isChunkLoadError),
    },
  });
}
