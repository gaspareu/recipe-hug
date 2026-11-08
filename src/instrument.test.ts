import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  reactRouterBrowserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
}));
vi.mock('@sentry/react', () => sentry);

beforeEach(() => {
  vi.resetModules();
  sentry.init.mockClear();
  vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.invalid/1');
});
afterEach(() => vi.unstubAllEnvs());

it.each([true, false])('anonymise une trace Sentry v11 avant envoi (racine : %s)', async (isRoot) => {
  await import('./instrument');
  expect(sentry.init).toHaveBeenCalledOnce();
  const span = {
    trace_id: '0123456789abcdef0123456789abcdef',
    span_id: '0123456789abcdef',
    start_timestamp: 1,
    end_timestamp: 2,
    is_segment: isRoot,
    status: 'ok',
    name: 'GET /recipes/private-id?token=private-token',
    attributes: {
      'url.full': 'https://example.invalid/recipes/private-id',
      'db.query.text': 'recette privée',
      'user.id': 'private-user',
    },
    links: [{
      trace_id: 'abcdef0123456789abcdef0123456789',
      span_id: 'abcdef0123456789',
      attributes: { 'user.id': 'linked-private-user' },
    }],
  };
  const original = structuredClone(span);
  const result = sentry.init.mock.calls[0][0].beforeSendSpan(span);

  expect(result.name).toBe('Span masqué par recipe-hug');
  expect(result.attributes).toEqual({});
  expect(result.links).toBeUndefined();
  expect(JSON.stringify(result)).not.toMatch(/private-id|private-token|recette privée|private-user/);
  expect(result.trace_id).toBe(span.trace_id);
  expect(result.span_id).toBe(span.span_id);
  expect(result.start_timestamp).toBe(1);
  expect(result.end_timestamp).toBe(2);
  expect(span).toEqual(original);
});
