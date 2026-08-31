import * as React from 'react';
import * as Sentry from '@sentry/react';
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from 'react-router';
import { appVersion } from '@/lib/version';
import {
  redactSentryEvent,
  safeRouteName,
  setErrorMonitoringInitialized,
} from '@/lib/error-monitoring';

function getTracePropagationTargets(): Array<string | RegExp> {
  const targets: Array<string | RegExp> = ['localhost'];
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) return targets;

  try {
    const origin = new URL(supabaseUrl).origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    targets.push(new RegExp(`^${origin}/functions/v1/`));
  } catch {
    // Une URL Supabase invalide ne doit jamais empêcher le démarrage de l'app.
  }

  return targets;
}

function safeNavigationName(name: string): string {
  try {
    return safeRouteName(new URL(name, window.location.origin).pathname);
  } catch {
    return safeRouteName(name.split('?')[0]);
  }
}

function redactSentrySpan(span: Parameters<NonNullable<Parameters<typeof Sentry.init>[0]['beforeSendSpan']>>[0]) {
  return {
    ...span,
    // Les descriptions et attributs HTTP peuvent inclure URL, paramètres ou identifiants.
    data: {},
    description: 'Span masqué par recipe-hug',
  };
}

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: `recipe-hug@${appVersion.version}+${appVersion.commit}`,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      urlQueryParams: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
      databaseQueryData: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
        beforeStartSpan: (options) => ({ ...options, name: safeNavigationName(options.name) }),
        // Les requêtes Supabase peuvent porter un identifiant de recette ou d'utilisateur.
        // Le diagnostic réseau reste assuré par les erreurs Edge normalisées.
        shouldCreateSpanForRequest: () => false,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    tracePropagationTargets: getTracePropagationTargets(),
    // Les recettes et conversations ne doivent jamais devenir des fil d'Ariane.
    beforeBreadcrumb: () => null,
    beforeSend: redactSentryEvent,
    beforeSendSpan: redactSentrySpan,
    beforeSendTransaction: (event) => {
      event.transaction = safeNavigationName(event.transaction ?? '');
      event.user = undefined;
      event.request = undefined;
      event.contexts = undefined;
      event.extra = undefined;
      event.breadcrumbs = undefined;
      return event;
    },
  });
  setErrorMonitoringInitialized(true);
}
