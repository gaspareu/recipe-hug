/**
 * Joue un court signal sonore (deux bips) pour signaler la fin d'un minuteur,
 * via la Web Audio API — aucun fichier audio à charger.
 *
 * Échoue silencieusement si l'API n'est pas disponible (SSR, tests) ou si le
 * navigateur bloque l'audio sans interaction préalable.
 */
export function playChime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Deux bips brefs et chaleureux (la–do).
    [880, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.28;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });

    // Libère le contexte une fois la séquence jouée.
    window.setTimeout(() => { void ctx.close().catch(() => undefined); }, 800);
  } catch {
    // Audio indisponible : on ignore, la pastille visuelle suffit.
  }
}
