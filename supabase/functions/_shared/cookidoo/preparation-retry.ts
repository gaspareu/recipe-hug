/** Miroir des plafonds de consume_cookidoo_preparation_quota (fenêtres fixes). */
export interface PreparationBucket {
  bucket_key: string;
  scope: 'minute' | 'day';
  window_started_at: string;
  request_count: number;
}
export function preparationRetryAt(buckets: PreparationBucket[], now = Date.now()): string | null {
  let retryAt = now;
  for (const bucket of buckets) {
    const global = bucket.bucket_key === 'global';
    const limit = bucket.scope === 'minute' ? (global ? 10 : 2) : (global ? 100 : 10);
    const end = Date.parse(bucket.window_started_at) + (bucket.scope === 'minute' ? 60_000 : 86_400_000);
    if (bucket.request_count >= limit && Number.isFinite(end)) retryAt = Math.max(retryAt, end);
  }
  return retryAt > now ? new Date(retryAt).toISOString() : null;
}
