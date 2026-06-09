import { vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInstallPrompt } from "./useInstallPrompt";

// ---------------------------------------------------------------------------
// Helpers pour simuler l'userAgent et matchMedia
// ---------------------------------------------------------------------------
function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: ua,
  });
}

function setMatchMedia(standaloneMatches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(display-mode: standalone)" ? standaloneMatches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// ---------------------------------------------------------------------------
// Fabrication d'un faux événement BeforeInstallPrompt
// ---------------------------------------------------------------------------
function createFakeBeforeInstallPromptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

// ---------------------------------------------------------------------------
// Setup global
// ---------------------------------------------------------------------------
const defaultUa =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

beforeEach(() => {
  setUserAgent(defaultUa);
  setMatchMedia(false);
  // Réinitialise la propriété `standalone` de navigator
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    value: undefined,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useInstallPrompt", () => {
  describe("Valeurs initiales", () => {
    it("canInstall est false au démarrage (pas d'événement beforeinstallprompt)", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.canInstall).toBe(false);
    });

    it("isIosSafari est false sur un user-agent Chrome Linux", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIosSafari).toBe(false);
    });

    it("isStandalone est false quand matchMedia ne correspond pas", () => {
      setMatchMedia(false);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isStandalone).toBe(false);
    });
  });

  describe("Détection iOS Safari", () => {
    it("détecte iOS Safari (iPhone + Safari sans Chrome)", () => {
      setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIosSafari).toBe(true);
    });

    it("ne détecte pas iOS Safari si Chrome est présent dans l'UA", () => {
      setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120 Safari/604.1",
      );
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIosSafari).toBe(false);
    });

    it("ne détecte pas iOS Safari sur iPad avec Firefox (FxiOS)", () => {
      setUserAgent(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120 Mobile/15E148 Safari/604.1",
      );
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIosSafari).toBe(false);
    });

    it("détecte iOS Safari sur iPod Touch", () => {
      setUserAgent(
        "Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      );
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isIosSafari).toBe(true);
    });
  });

  describe("Détection mode standalone", () => {
    it("isStandalone est true si matchMedia '(display-mode: standalone)' matche", () => {
      setMatchMedia(true);
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isStandalone).toBe(true);
    });

    it("isStandalone est true si navigator.standalone est true", () => {
      setMatchMedia(false);
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        value: true,
      });
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.isStandalone).toBe(true);
    });
  });

  describe("Événement beforeinstallprompt", () => {
    it("canInstall passe à true après réception de l'événement", () => {
      const { result } = renderHook(() => useInstallPrompt());
      expect(result.current.canInstall).toBe(false);

      act(() => {
        window.dispatchEvent(createFakeBeforeInstallPromptEvent());
      });

      expect(result.current.canInstall).toBe(true);
    });

    it("l'événement est empêché (preventDefault)", () => {
      const fakeEvent = createFakeBeforeInstallPromptEvent();
      const preventDefaultSpy = vi.spyOn(fakeEvent, "preventDefault");

      renderHook(() => useInstallPrompt());

      act(() => {
        window.dispatchEvent(fakeEvent);
      });

      expect(preventDefaultSpy).toHaveBeenCalledOnce();
    });
  });

  describe("triggerInstall", () => {
    it("ne fait rien si canInstall est false (pas de prompt enregistré)", async () => {
      const { result } = renderHook(() => useInstallPrompt());
      // Ne doit pas lever d'erreur
      await act(async () => {
        await result.current.triggerInstall();
      });
      expect(result.current.canInstall).toBe(false);
    });

    it("appelle prompt() et userChoice, puis canInstall repasse à false", async () => {
      const fakeEvent = createFakeBeforeInstallPromptEvent("accepted");

      const { result } = renderHook(() => useInstallPrompt());

      act(() => {
        window.dispatchEvent(fakeEvent);
      });
      expect(result.current.canInstall).toBe(true);

      await act(async () => {
        await result.current.triggerInstall();
      });

      expect(fakeEvent.prompt).toHaveBeenCalledOnce();
      expect(result.current.canInstall).toBe(false);
    });

    it("fonctionne aussi quand l'utilisateur refuse (dismissed)", async () => {
      const fakeEvent = createFakeBeforeInstallPromptEvent("dismissed");

      const { result } = renderHook(() => useInstallPrompt());

      act(() => {
        window.dispatchEvent(fakeEvent);
      });

      await act(async () => {
        await result.current.triggerInstall();
      });

      expect(fakeEvent.prompt).toHaveBeenCalledOnce();
      expect(result.current.canInstall).toBe(false);
    });
  });

  describe("Nettoyage du listener", () => {
    it("supprime le listener beforeinstallprompt au démontage", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const removeSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = renderHook(() => useInstallPrompt());

      // Vérifie que addEventListener a été appelé pour beforeinstallprompt
      expect(addSpy).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));

      unmount();

      // Vérifie que removeEventListener a été appelé pour beforeinstallprompt
      expect(removeSpy).toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
});
