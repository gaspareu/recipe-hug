import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}

// Le clavier tactile reste multiligne en paysage et sur tablette, indépendamment
// du breakpoint utilisé pour la mise en page.
const MOBILE_INPUT_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse)`;

function subscribeToInputDevice(callback: () => void) {
  const query = window.matchMedia(MOBILE_INPUT_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

export function useIsMobileInput() {
  return React.useSyncExternalStore(
    subscribeToInputDevice,
    () => window.matchMedia(MOBILE_INPUT_QUERY).matches,
    () => false,
  );
}
