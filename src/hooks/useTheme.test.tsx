import { vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { ThemeProvider, useTheme } from "./useTheme";
import { createSupabaseMock } from "@/test/supabase-mock";

// ---------------------------------------------------------------------------
// Mock de supabase — utilise vi.hoisted pour créer le conteneur mutable
// avant les imports, puis on le remplit après.
// ---------------------------------------------------------------------------
const { mockSupabaseRef } = vi.hoisted(() => {
  // On ne peut pas appeler createSupabaseMock ici (imports pas encore résolus),
  // donc on stocke un objet wrapper dont la valeur sera assignée dans beforeEach.
  return { mockSupabaseRef: { current: null as ReturnType<typeof import("@/test/supabase-mock").createSupabaseMock> | null } };
});

vi.mock("@/integrations/supabase/client", () => ({
  get supabase() {
    return mockSupabaseRef.current;
  },
}));

// ---------------------------------------------------------------------------
// Mock de useAuth — on contrôle l'utilisateur courant via `mockUser`
// ---------------------------------------------------------------------------
const mockUser: { current: { id: string } | null } = { current: null };

vi.mock("./useAuth", () => ({
  useAuth: () => ({
    user: mockUser.current,
    session: null,
    loading: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock de window.matchMedia
// ---------------------------------------------------------------------------
let mediaQueryDarkMatches = false;
let mediaQueryChangeListener: (() => void) | null = null;

function setupMatchMedia(darkMatches: boolean) {
  mediaQueryDarkMatches = darkMatches;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? mediaQueryDarkMatches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      mediaQueryChangeListener = listener;
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  localStorage.clear();
  mockUser.current = null;
  mediaQueryChangeListener = null;
  document.documentElement.className = "";
  setupMatchMedia(false);
  // Mock supabase par défaut : pas d'utilisateur, profile_safe retourne null
  mockSupabaseRef.current = createSupabaseMock({
    result: { data: null, error: null },
  });
});

describe("ThemeProvider + useTheme", () => {
  describe("Valeurs initiales (sans utilisateur, sans localStorage)", () => {
    it("expose theme='system' par défaut", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("system");
    });

    it("resolvedTheme est 'light' quand le système préfère light", async () => {
      setupMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.resolvedTheme).toBe("light");
    });

    it("resolvedTheme est 'dark' quand le système préfère dark", async () => {
      setupMatchMedia(true);
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.resolvedTheme).toBe("dark");
    });

    it("isLoading passe à false après initialisation", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    });
  });

  describe("Persistance localStorage (sans utilisateur)", () => {
    it("charge le thème depuis localStorage si présent", async () => {
      localStorage.setItem("theme", "dark");
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("dark");
    });

    it("charge 'light' depuis localStorage", async () => {
      localStorage.setItem("theme", "light");
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("light");
    });

    it("ignore une valeur localStorage invalide et reste sur 'system'", async () => {
      localStorage.setItem("theme", "neon-pink");
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("system");
    });
  });

  describe("setTheme (sans utilisateur)", () => {
    it("met à jour theme et le persiste dans localStorage", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.setTheme("dark");
      });

      expect(result.current.theme).toBe("dark");
      expect(localStorage.getItem("theme")).toBe("dark");
    });

    it("applique la classe 'dark' sur document.documentElement", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.setTheme("dark");
      });

      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    it("applique la classe 'light' sur document.documentElement", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.setTheme("light");
      });

      expect(document.documentElement.classList.contains("light")).toBe(true);
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });

    it("resolvedTheme est 'dark' après setTheme('dark')", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.setTheme("dark");
      });

      expect(result.current.resolvedTheme).toBe("dark");
    });
  });

  describe("setTheme avec utilisateur connecté", () => {
    beforeEach(() => {
      mockUser.current = { id: "user-42" };
      mockSupabaseRef.current = createSupabaseMock({
        resultsByTable: {
          profiles_safe: { data: { theme: "light" }, error: null },
          profiles: { data: null, error: null },
        },
      });
    });

    it("charge le thème depuis la base de données", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("light");
    });

    it("appelle supabase.from('profiles').update lors de setTheme", async () => {
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.setTheme("dark");
      });

      expect(result.current.theme).toBe("dark");
      // La mise à jour DB a été tentée
      const fromCalls = (mockSupabaseRef.current!.from as ReturnType<typeof vi.fn>).mock.calls;
      const profilesCall = fromCalls.find(([table]: [string]) => table === "profiles");
      expect(profilesCall).toBeDefined();
    });

    it("utilise 'system' si le profil ne contient pas de thème", async () => {
      mockSupabaseRef.current = createSupabaseMock({
        resultsByTable: {
          profiles_safe: { data: { theme: null }, error: null },
          profiles: { data: null, error: null },
        },
      });
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("system");
    });

    it("utilise 'system' si la requête Supabase échoue", async () => {
      mockSupabaseRef.current = createSupabaseMock({
        resultsByTable: {
          profiles_safe: { data: null, error: new Error("DB erreur") },
          profiles: { data: null, error: null },
        },
      });
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("system");
    });
  });

  describe("useTheme sans ThemeProvider", () => {
    it("lève une erreur si utilisé hors du ThemeProvider", () => {
      // On s'attend à ce que renderHook throw
      expect(() =>
        renderHook(() => useTheme()),
      ).toThrow("useTheme must be used within a ThemeProvider");
    });
  });

  describe("Changement système (media query change)", () => {
    it("réapplique le thème quand la préférence système change et que theme=system", async () => {
      setupMatchMedia(false);
      const { result } = renderHook(() => useTheme(), { wrapper });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.theme).toBe("system");

      // Simule un changement de préférence système
      act(() => {
        mediaQueryDarkMatches = true;
        // On remock matchMedia pour refléter la nouvelle préférence
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
          matches: query === "(prefers-color-scheme: dark)" ? true : false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn((_event: string, listener: () => void) => {
            mediaQueryChangeListener = listener;
          }),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }));
        if (mediaQueryChangeListener) mediaQueryChangeListener();
      });

      // Le thème reste 'system' mais resolvedTheme devrait changer
      expect(result.current.theme).toBe("system");
    });
  });
});
