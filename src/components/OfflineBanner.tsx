import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export function OfflineBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-3 text-center text-sm font-medium shadow-lg"
    >
      Vous êtes hors ligne — certaines fonctionnalités sont indisponibles
    </div>
  );
}
