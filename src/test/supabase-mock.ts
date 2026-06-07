import { vi } from "vitest";

export interface SupabaseResult {
  data: unknown;
  error: unknown;
}

const OK: SupabaseResult = { data: null, error: null };

// Méthodes de chaînage du query builder Supabase qui renvoient le builder.
const CHAIN_METHODS = [
  "select", "insert", "update", "delete", "upsert",
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "match", "filter", "order", "limit", "range", "contains", "or",
] as const;

/**
 * Construit un query builder Supabase factice.
 * - Toutes les méthodes de chaînage renvoient le builder (chaînage fluide).
 * - Le builder est "thenable" : `await supabase.from(...).select(...)` résout
 *   vers `result`.
 * - Les terminaux `single`/`maybeSingle` résolvent aussi vers `result`.
 */
export function createQueryBuilder(result: SupabaseResult = OK) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  for (const method of CHAIN_METHODS) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  // Rend le builder awaitable (résout vers result quand on l'await directement).
  builder.then = (
    onfulfilled?: (value: SupabaseResult) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onfulfilled, onrejected);
  return builder;
}

export interface SupabaseMockOptions {
  /** Utilisateur retourné par `auth.getUser()`. */
  user?: unknown;
  /** Session retournée par `auth.getSession()`. */
  session?: unknown;
  /** Résultat par défaut de toute requête `from(...)`. */
  result?: SupabaseResult;
  /** Résultats spécifiques par table (prioritaires sur `result`). */
  resultsByTable?: Record<string, SupabaseResult>;
}

/**
 * Crée un client Supabase factice couvrant les usages des hooks
 * (`auth.getUser`, `auth.getSession`, `from(table).<chaîne>`).
 *
 * Exemple :
 * ```ts
 * vi.mock("@/integrations/supabase/client", () => ({
 *   supabase: createSupabaseMock({
 *     user: { id: "u1" },
 *     resultsByTable: { recipes: { data: [{ id: "r1" }], error: null } },
 *   }),
 * }));
 * ```
 */
export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const defaultResult = options.result ?? OK;
  return {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({ data: { user: options.user ?? null }, error: null }),
      ),
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: options.session ?? null }, error: null }),
      ),
    },
    from: vi.fn((table: string) =>
      createQueryBuilder(options.resultsByTable?.[table] ?? defaultResult),
    ),
  };
}
