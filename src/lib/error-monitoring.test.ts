import { beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

vi.mock('@sentry/react', () => sentry);

describe('error-monitoring', () => {
  beforeEach(() => {
    vi.resetModules();
    sentry.captureException.mockReset();
    sentry.init.mockReset();
  });

  it('reste inactif sans DSN', async () => {
    const { reportRouteError } = await import('./error-monitoring');

    reportRouteError(new Error('erreur locale'), '/home', false);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('retire les données sensibles avant l’envoi', async () => {
    const { redactSentryEvent } = await import('./error-monitoring');
    const event = redactSentryEvent({
      type: 'error',
      user: { id: 'user-id' },
      request: { data: 'message privé' },
      breadcrumbs: [{ message: 'recette privée' }],
      extra: { token: 'secret' },
      contexts: { device: { name: 'iPhone' } },
      transaction: '/recipes/secret-id',
      exception: {
        values: [{ type: 'TypeError', value: 'email@example.test', stacktrace: { frames: [{ vars: { password: 'secret' } }] } }],
      },
    } as unknown as Parameters<typeof redactSentryEvent>[0]);

    expect(event).toMatchObject({
      exception: { values: [{ type: 'TypeError', value: 'Message d’erreur masqué par recipe-hug', stacktrace: { frames: [{ vars: undefined }] } }] },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.contexts).toBeUndefined();
    expect(event.transaction).toBeUndefined();
  });

  it('normalise la route et le message avant de capturer une erreur de route', async () => {
    const { reportRouteError, setErrorMonitoringInitialized } = await import('./error-monitoring');
    setErrorMonitoringInitialized(true);
    reportRouteError(new TypeError('email@example.test'), '/recipes/secret-id', false);

    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'TypeError', message: 'Rendu de route échoué' }),
      { tags: { source: 'route-error', route: '/recipes/:id', chunk_load: 'false' } },
    );
  });
});
