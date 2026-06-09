import { renderHook, act } from "@testing-library/react";
import { useNetworkStatus } from "./useNetworkStatus";

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}

afterEach(() => {
  setOnline(true);
});

describe("useNetworkStatus", () => {
  it("reflète l'état initial de navigator.onLine", () => {
    setOnline(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(false);
  });

  it("passe à false lors de l'événement offline", () => {
    setOnline(true);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("repasse à true lors de l'événement online", () => {
    setOnline(false);
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});
