import { useEffect, useState } from 'react';

/** Horloge partagée par le temps écoulé et le délai de reprise, sans appel réseau. */
export function useCookidooClock(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}
