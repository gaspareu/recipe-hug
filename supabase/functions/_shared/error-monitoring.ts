// Remontée minimale d'erreurs serveur vers Sentry. Les exceptions sont
// volontairement normalisées : aucun texte de chat, identifiant, mot de passe,
// JWT ou réponse Cookidoo n'est transmis à un tiers.
import * as Sentry from 'npm:@sentry/deno@^10.72.0';

let initialized = false;

export function initializeEdgeErrorMonitoring(dsn = Deno.env.get('SENTRY_DSN')): boolean {
  if (initialized) return false;

  if (!dsn) return false;

  Sentry.init({
    dsn,
    defaultIntegrations: false,
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
    tracesSampleRate: 0,
  });
  initialized = true;
  return true;
}

export async function captureEdgeException(functionName: string, errorCode: string): Promise<void> {
  if (!initialized) return;

  Sentry.withScope((scope) => {
    scope.setTag('function', functionName);
    scope.setTag('error_code', errorCode);
    scope.setLevel('error');
    // Ne jamais passer l'erreur d'origine : son message peut inclure une donnée privée.
    Sentry.captureException(new Error('Erreur Edge Function normalisée'));
  });

  // Les Edge Functions peuvent se terminer juste après le catch : laisser une
  // courte fenêtre d'envoi évite de perdre l'évènement sans bloquer le flux normal.
  await Sentry.flush(1_000).catch(() => undefined);
}
