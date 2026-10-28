import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { preparationRetryAt } from "./preparation-retry.ts";
const now = Date.parse('2026-10-25T10:00:30Z');
Deno.test('quota Cookidoo : plafond minute utilisateur et fenêtre expirée', () => {
  assertEquals(preparationRetryAt([{ bucket_key: 'user:1', scope: 'minute', window_started_at: '2026-10-25T10:00:00Z', request_count: 2 }], now), '2026-10-25T10:01:00.000Z');
  assertEquals(preparationRetryAt([{ bucket_key: 'user:1', scope: 'minute', window_started_at: '2026-10-25T09:59:00Z', request_count: 2 }], now), null);
});
Deno.test('quota Cookidoo : attendre la plus longue fenêtre bloquante, globale comprise', () => {
  assertEquals(preparationRetryAt([
    { bucket_key: 'user:1', scope: 'minute', window_started_at: '2026-10-25T10:00:00Z', request_count: 2 },
    { bucket_key: 'global', scope: 'day', window_started_at: '2026-10-25T08:00:00Z', request_count: 100 },
    { bucket_key: 'user:1', scope: 'day', window_started_at: '2026-10-25T09:00:00Z', request_count: 9 },
  ], now), '2026-10-26T08:00:00.000Z');
});
Deno.test('quota Cookidoo : aucun blocage sous les plafonds', () => {
  assertEquals(preparationRetryAt([
    { bucket_key: 'global', scope: 'minute', window_started_at: '2026-10-25T10:00:00Z', request_count: 9 },
    { bucket_key: 'user:1', scope: 'day', window_started_at: '2026-10-25T08:00:00Z', request_count: 9 },
  ], now), null);
});
