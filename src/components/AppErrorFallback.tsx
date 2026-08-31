import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Secours hors route pour les erreurs React qui échappent au data router. */
export function AppErrorFallback() {
  return (
    <div
      role="alert"
      className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 p-6 text-center bg-background"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Une erreur est survenue</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Quelque chose s&apos;est mal passé. Vous pouvez actualiser la page ou revenir à l&apos;accueil.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Button className="flex-1" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Actualiser
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => window.location.assign('/home')}>
          <Home className="mr-2 h-4 w-4" aria-hidden="true" />
          Accueil
        </Button>
      </div>
    </div>
  );
}
