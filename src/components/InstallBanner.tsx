import { useState } from 'react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { useIsMobile } from '@/hooks/use-mobile';

const DISMISS_KEY = 'install-banner-dismissed-until';
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function isDismissed(): boolean {
  const until = localStorage.getItem(DISMISS_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

export function InstallBanner() {
  const { canInstall, isIosSafari, isStandalone, triggerInstall } = useInstallPrompt();
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(() => isDismissed());

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DURATION_MS));
    setDismissed(true);
  };

  // Ne pas afficher si : déjà installée, déjà dismissée, pas mobile, ou aucun prompt dispo
  if (isStandalone || dismissed || !isMobile) return null;
  if (!canInstall && !isIosSafari) return null;

  return (
    <div
      role="banner"
      className="w-full bg-primary text-primary-foreground px-4 py-3 shadow-lg"
    >
      {isIosSafari ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Installer l'app pour un accès rapide</p>
          <p className="text-primary-foreground/80">
            Appuyer sur <strong>Partager</strong> (
            <span aria-label="icône partager">⎙</span>
            ) → <strong>Ajouter à l'écran d'accueil</strong>
          </p>
          <button
            onClick={handleDismiss}
            className="mt-1 self-end text-xs underline opacity-80"
            aria-label="Fermer la bannière d'installation"
          >
            Plus tard
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-medium">Installer l'app pour un accès rapide</p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={triggerInstall}
              className="rounded bg-primary-foreground text-primary px-3 py-1 font-semibold text-xs"
            >
              Installer
            </button>
            <button
              onClick={handleDismiss}
              className="text-xs underline opacity-80"
              aria-label="Fermer la bannière d'installation"
            >
              Plus tard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
