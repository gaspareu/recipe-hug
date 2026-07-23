import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, Loader2, ExternalLink } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCookidooConnector } from '@/hooks/useCookidooConnector';
import { useCookidooExport } from '@/hooks/useCookidooExport';

// Messages d'erreur lisibles pour les échecs classifiés par l'edge function.
const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: 'Identifiants Cookidoo refusés. Vérifiez votre email/mot de passe dans le profil.',
  ip_blocked: 'Cookidoo a bloqué le serveur. Utilisez le connecteur en ligne de commande depuis votre machine.',
  rate_limited: 'Trop de requêtes vers Cookidoo. Réessayez dans une minute.',
  decrypt_failed: 'Mot de passe illisible. Reconfigurez vos identifiants Cookidoo.',
  not_configured: 'Identifiants Cookidoo non configurés.',
  partial_created: 'Une recette vide subsiste sur Cookidoo : supprimez-la depuis votre compte.',
};

// Avertissements non bloquants renvoyés en cas de succès (l'export a réussi).
const WARNING_MESSAGES: Record<string, string> = {
  no_image: 'Astuce : ajoutez une image à la recette pour l’afficher sur Cookidoo.',
  image_not_transferred: 'L’image n’a pas pu être transférée cette fois.',
  title_not_updated: 'Le titre n’a pas pu être mis à jour sur Cookidoo (contenu à jour).',
  steps_not_guided: 'Certaines étapes n’ont pas été reconnues comme guidées par Cookidoo.',
};

/** Titre unique pour tous les échecs d'export — un seul endroit à faire évoluer. */
function showExportError(description: string) {
  toast.error('Échec de l’envoi', { description });
}

/** Traduit un code d'échec, avec repli sur le message brut du serveur. */
function resolveErrorMessage(code?: string | null, message?: string | null): string {
  return ERROR_MESSAGES[code ?? ''] ?? message ?? 'Erreur inconnue';
}

interface ExportToCookidooButtonProps {
  recipeId: string;
  /** Ouverture contrôlée (pour piloter le dialog depuis un menu externe). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Affiche le bouton déclencheur intégré (défaut). Mettre à false en mode contrôlé. */
  showTrigger?: boolean;
}

export function ExportToCookidooButton({ recipeId, open: controlledOpen, onOpenChange, showTrigger = true }: ExportToCookidooButtonProps) {
  const { status } = useCookidooConnector();
  const { startExport, reset, job, isStarting, timedOut } = useCookidooExport();
  const [internalOpen, setInternalOpen] = useState(false);
  // Identifiant du job déjà notifié par toast, pour n'en émettre qu'un seul
  // par export (y compris si l'utilisateur a navigué ailleurs entretemps).
  const [notifiedId, setNotifiedId] = useState<string | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };

  const configured = status.data?.configured;

  // L'export rend la main immédiatement : seul un refus synchrone (recette non
  // exportable) est connu ici. L'issue réelle arrive par `job`, traitée dans
  // l'effet ci-dessous.
  const handleExport = async () => {
    let response;
    try {
      response = await startExport(recipeId);
    } catch (err) {
      // Erreur de transport (edge function 5xx, coupure réseau) : `startExport`
      // rejette au lieu de renvoyer `ok:false`. Sans ce filet, la promesse
      // partirait en rejet non géré et l'utilisateur ne verrait aucun retour.
      showExportError(err instanceof Error ? err.message : 'Erreur réseau, réessayez.');
      return;
    }
    if (!response.ok) {
      showExportError(resolveErrorMessage(response.error, response.message));
      return;
    }
    toast.info('Envoi lancé vers Cookidoo…', {
      description: 'Vous pouvez continuer, le résultat s’affichera ici.',
    });
    setOpen(false);
  };

  // Le toast final doit partir une seule fois par export, y compris si
  // l'utilisateur a navigué ailleurs entretemps.
  useEffect(() => {
    if (!job || job.status === 'pending' || job.id === notifiedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réagit à l'arrivée d'un job async terminé (polling) et garde le « notifié une seule fois ».
    setNotifiedId(job.id);

    if (job.status === 'success') {
      const warnings = (job.warnings ?? []).map((w) => WARNING_MESSAGES[w]).filter(Boolean);
      const base = job.cookidoo_url ? 'Disponible dans « Mes recettes créées ».' : undefined;
      toast.success(job.updated ? 'Recette mise à jour sur Cookidoo' : 'Recette envoyée vers Cookidoo', {
        description: [base, ...warnings].filter(Boolean).join(' ') || undefined,
        action: job.cookidoo_url
          ? { label: 'Ouvrir', onClick: () => window.open(job.cookidoo_url!, '_blank') }
          : undefined,
      });
    } else {
      showExportError(resolveErrorMessage(job.error_code, job.error_message));
    }
    reset();
  }, [job, notifiedId, reset]);

  // Au-delà du délai d'attente, on ne sait plus rien : le dire franchement
  // plutôt que laisser un spinner tourner sans fin.
  useEffect(() => {
    if (!timedOut) return;
    toast.warning('Envoi toujours en cours', {
      description: 'Vérifiez dans quelques instants sur Cookidoo avant de relancer.',
    });
    reset();
  }, [timedOut, reset]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80"
              >
                <UtensilsCrossed className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent><p>Envoyer vers Cookidoo</p></TooltipContent>
        </Tooltip>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoyer vers Cookidoo</DialogTitle>
          <DialogDescription>
            La recette sera créée dans « Mes recettes créées » de votre compte Cookidoo.
          </DialogDescription>
        </DialogHeader>

        {status.isLoading ? (
          <div className="h-10 animate-pulse bg-muted rounded-md" />
        ) : !configured ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Aucun compte Cookidoo connecté. Configurez vos identifiants dans votre profil.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/profile">
                Configurer Cookidoo <ExternalLink className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Optimisée pour votre <span className="font-medium text-foreground">Thermomix TM7</span> :
              étapes guidées, temps, températures et vitesses prêts à l'emploi.
            </p>
            <Button onClick={handleExport} disabled={isStarting} className="w-full">
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <UtensilsCrossed className="mr-2 h-4 w-4" />
                  Envoyer la recette
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
