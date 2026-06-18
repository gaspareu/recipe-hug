import { useRouteError, useNavigate } from 'react-router-dom';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isChunkLoadError } from '@/lib/chunk-error';

/**
 * Écran de récupération affiché par le data router (errorElement) lorsqu'une route
 * crashe. Évite l'écran blanc sans recours : propose Actualiser et Retour à l'accueil.
 */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const isChunk = isChunkLoadError(error);

  const title = isChunk ? 'Nouvelle version disponible' : 'Une erreur est survenue';
  const description = isChunk
    ? "L'application a été mise à jour. Actualisez pour charger la dernière version."
    : "Quelque chose s'est mal passé. Vous pouvez actualiser la page ou revenir à l'accueil.";

  return (
    <div
      role="alert"
      className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 p-6 text-center bg-background"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <Button className="flex-1" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Actualiser
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => navigate('/home')}>
          <Home className="mr-2 h-4 w-4" aria-hidden="true" />
          Accueil
        </Button>
      </div>
    </div>
  );
}
