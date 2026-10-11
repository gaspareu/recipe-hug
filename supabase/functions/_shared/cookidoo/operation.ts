/** Même délai pour la connexion et les écritures ; une réservation perdue ne peut plus écrire. */
export function boundedCookidooFetch(
  implementation: typeof fetch,
  deadline: number,
  assertActive?: () => Promise<void>,
  now = Date.now,
): typeof fetch {
  return async (input, init) => {
    const check = () => {
      if (now() >= deadline) throw new Error("export_deadline");
    };
    check();
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.href
      : input.url;
    const method =
      (init?.method ?? (input instanceof Request ? input.method : "GET"))
        .toUpperCase();
    if (
      /\/created-recipes(?:\/|$)/.test(new URL(url).pathname) &&
      !["GET", "HEAD", "OPTIONS"].includes(method)
    ) await assertActive?.();
    check();
    const timeout = AbortSignal.timeout(deadline - now());
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    return implementation(input, { ...init, signal });
  };
}
