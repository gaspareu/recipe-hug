import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement, type ReactNode } from "react";

/**
 * QueryClient configuré pour les tests : pas de retry, et `gcTime: Infinity`
 * pour que les données pré-remplies via `setQueryData` (sans observer actif)
 * ne soient pas garbage-collectées pendant le test. Chaque test crée un
 * client neuf, donc aucune fuite de cache entre tests.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

/**
 * Wrapper à passer à `renderHook(..., { wrapper })` pour tester les hooks
 * TanStack Query (useRecipes, useToggleFavorite, etc.).
 */
export function createQueryWrapper(client: QueryClient = createTestQueryClient()) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/**
 * Rend un composant enveloppé dans un QueryClientProvider de test.
 * Retourne aussi le `client` pour inspecter/pré-remplir le cache.
 */
export function renderWithQueryClient(
  ui: ReactElement,
  options?: { client?: QueryClient } & Omit<RenderOptions, "wrapper">,
) {
  const client = options?.client ?? createTestQueryClient();
  return {
    client,
    ...render(ui, { wrapper: createQueryWrapper(client), ...options }),
  };
}
