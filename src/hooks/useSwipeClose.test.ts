import { vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSwipeClose } from "./useSwipeClose";

// ---------------------------------------------------------------------------
// Helpers — fabrication d'événements tactiles React synthétiques
// ---------------------------------------------------------------------------

/**
 * Crée un faux `React.TouchEvent` pour handleTouchStart et handleTouchMove.
 * La propriété `touches` (liste des contacts actifs) est utilisée par ces deux handlers.
 */
function makeTouchEvent(x: number, y: number): React.TouchEvent {
  return {
    touches: [{ clientX: x, clientY: y }],
    changedTouches: [{ clientX: x, clientY: y }],
  } as unknown as React.TouchEvent;
}

/**
 * Crée un faux `React.TouchEvent` pour handleTouchEnd.
 * La propriété `changedTouches` (contacts levés) est utilisée par ce handler.
 */
function makeEndEvent(x: number, y: number): React.TouchEvent {
  return {
    touches: [],
    changedTouches: [{ clientX: x, clientY: y }],
  } as unknown as React.TouchEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useSwipeClose", () => {
  describe("Valeurs initiales", () => {
    it("retourne les handlers et le style initial", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      expect(typeof result.current.onTouchStart).toBe("function");
      expect(typeof result.current.onTouchMove).toBe("function");
      expect(typeof result.current.onTouchEnd).toBe("function");
      expect(result.current.style).toEqual({
        transition: "transform 0.2s ease-out",
        transform: undefined,
      });
    });
  });

  describe("Swipe vers la droite (direction='right', défaut)", () => {
    it("appelle onClose quand le swipe dépasse le seuil par défaut (100px)", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchMove(makeTouchEvent(50, 0));
        result.current.onTouchEnd(makeEndEvent(110, 0));
      });

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("n'appelle pas onClose quand le swipe est en dessous du seuil", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchMove(makeTouchEvent(50, 0));
        result.current.onTouchEnd(makeEndEvent(90, 0));
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("n'appelle pas onClose pour un swipe vers la gauche quand direction='right'", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(200, 0));
        result.current.onTouchMove(makeTouchEvent(50, 0));
        result.current.onTouchEnd(makeEndEvent(50, 0));
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("respecte un seuil personnalisé", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() =>
        useSwipeClose({ onClose, threshold: 50 }),
      );

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchMove(makeTouchEvent(30, 0));
        result.current.onTouchEnd(makeEndEvent(60, 0));
      });

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("n'appelle pas onClose exactement au seuil (non strict)", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose, threshold: 100 }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchEnd(makeEndEvent(100, 0));
      });

      // deltaX = 100, isSwipeRight = 100 > 100 = false → onClose NON appelé
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Swipe vers la gauche (direction='left')", () => {
    it("appelle onClose quand le swipe gauche dépasse le seuil", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() =>
        useSwipeClose({ onClose, direction: "left" }),
      );

      act(() => {
        result.current.onTouchStart(makeTouchEvent(200, 0));
        result.current.onTouchMove(makeTouchEvent(100, 0));
        result.current.onTouchEnd(makeEndEvent(50, 0));
      });

      expect(onClose).toHaveBeenCalledOnce();
    });

    it("n'appelle pas onClose pour un swipe vers la droite quand direction='left'", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() =>
        useSwipeClose({ onClose, direction: "left" }),
      );

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchMove(makeTouchEvent(100, 0));
        result.current.onTouchEnd(makeEndEvent(110, 0));
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it("n'appelle pas onClose si le swipe gauche est en dessous du seuil", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() =>
        useSwipeClose({ onClose, direction: "left" }),
      );

      act(() => {
        result.current.onTouchStart(makeTouchEvent(200, 0));
        result.current.onTouchEnd(makeEndEvent(110, 0));
      });

      // deltaX = 110 - 200 = -90, seuil = 100 → -90 < -100 est false → pas d'appel
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Style / translation pendant le swipe", () => {
    it("met à jour le style.transform pendant le glissement horizontal vers la droite", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        // Mouvement horizontal suffisamment grand pour déclencher isHorizontalSwipe=true
        result.current.onTouchMove(makeTouchEvent(50, 0));
      });

      expect(result.current.style.transform).toBe("translateX(50px)");
      expect(result.current.style.transition).toBeUndefined();
    });

    it("remet translateX à 0 après touchEnd (transition restaurée)", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchMove(makeTouchEvent(50, 0));
        result.current.onTouchEnd(makeEndEvent(50, 0));
      });

      expect(result.current.style.transform).toBeUndefined();
      expect(result.current.style.transition).toBe("transform 0.2s ease-out");
    });

    it("n'applique pas de translation pour un swipe vertical", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        // Mouvement principalement vertical
        result.current.onTouchMove(makeTouchEvent(5, 50));
      });

      expect(result.current.style.transform).toBeUndefined();
    });

    it("n'applique pas de translation si la direction est opposée (droite attendue, gauche détectée)", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose, direction: "right" }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(200, 0));
        result.current.onTouchMove(makeTouchEvent(150, 0));
      });

      // deltaX = -50 (vers la gauche) → direction='right' et deltaX < 0 → pas de translation
      expect(result.current.style.transform).toBeUndefined();
    });
  });

  describe("Cas limites et robustesse", () => {
    it("handleTouchEnd sans touchStart préalable remet translateX à 0 sans erreur", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        // Appel de touchEnd directement sans touchStart
        result.current.onTouchEnd(makeEndEvent(100, 0));
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(result.current.style.transform).toBeUndefined();
    });

    it("handleTouchMove sans touchStart préalable ne provoque pas d'erreur", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      expect(() => {
        act(() => {
          result.current.onTouchMove(makeTouchEvent(100, 0));
        });
      }).not.toThrow();
    });

    it("le type de swipe est déterminé dès le premier mouvement significatif (>10px)", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        // Premier mouvement >10px en X → classé horizontal
        result.current.onTouchMove(makeTouchEvent(15, 3));
        // Deuxième mouvement
        result.current.onTouchMove(makeTouchEvent(60, 5));
      });

      // Translation appliquée car horizontal + direction right + deltaX > 0
      expect(result.current.style.transform).toBe("translateX(60px)");
    });

    it("réinitialise correctement après un cycle complet start→move→end", () => {
      const onClose = vi.fn();
      const { result } = renderHook(() => useSwipeClose({ onClose }));

      // Premier cycle (pas assez loin)
      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchMove(makeTouchEvent(50, 0));
        result.current.onTouchEnd(makeEndEvent(50, 0));
      });
      expect(onClose).not.toHaveBeenCalled();

      // Deuxième cycle (assez loin)
      act(() => {
        result.current.onTouchStart(makeTouchEvent(0, 0));
        result.current.onTouchMove(makeTouchEvent(110, 0));
        result.current.onTouchEnd(makeEndEvent(110, 0));
      });
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
