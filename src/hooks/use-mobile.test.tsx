import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  });
}

let mediaQueryListener: (() => void) | null = null;

beforeEach(() => {
  mediaQueryListener = null;

  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      mediaQueryListener = listener;
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

describe("useIsMobile", () => {
  it("returns true when window width is below 768px", () => {
    setWindowWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false when window width is 768px or above", () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns false at exactly 768px (the breakpoint)", () => {
    setWindowWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true at exactly 767px (one below breakpoint)", () => {
    setWindowWidth(767);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when viewport width changes", () => {
    setWindowWidth(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setWindowWidth(500);
      if (mediaQueryListener) mediaQueryListener();
    });

    expect(result.current).toBe(true);
  });
});
