import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCookidooConnector, type ThermomixTool } from '@/hooks/useCookidooConnector';

const TOOLS: { value: ThermomixTool; label: string }[] = [
  { value: 'TM7', label: 'TM7' },
  { value: 'TM6', label: 'TM6' },
  { value: 'TM5', label: 'TM5' },
  { value: 'TM31', label: 'TM31' },
];

// Messages d'erreur lisibles pour les échecs classifiés par l'edge function.
const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: 'Identifiants Cookidoo refusés. Vérifiez votre email/mot de passe dans le profil.',
  ip_blocked: 'Cookidoo a bloqué le serveur. Utilisez le connecteur en ligne de commande depuis votre machine.',
  rate_limited: 'Trop de requêtes vers Cookidoo. Réessayez dans une minute.',
  decrypt_failed: 'Mot de passe illisible. Reconfigurez vos identifiants Cookidoo.',
  not_configured: 'Identifiants Cookidoo non configurés.',
};

interface ExportToCookidooButtonProps {
  recipeId: string;
  /** Ouverture contrôlée (pour piloter le dialog depuis un menu externe). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Affiche le bouton déclencheur intégré (défaut). Mettre à false en mode contrôlé. */
  showTrigger?: boolean;
}

export function ExportToCookidooButton({ recipeId, open: controlledOpen, onOpenChange, showTrigger = true }: ExportToCookidooButtonProps) {
  const { status, exportRecipe } = useCookidooConnector();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [tool, setTool] = useState<ThermomixTool>('TM7');

  const configured = status.data?.configured;

  const handleExport = async () => {
    try {
      const result = await exportRecipe.mutateAsync({ recipeId, tools: [tool] });
      if (result.ok) {
        toast.success('Recette envoyée vers Cookidoo', {
          description: result.url ? 'Disponible dans « Mes recettes créées ».' : undefined,
          action: result.url
            ? { label: 'Ouvrir', onClick: () => window.open(result.url, '_blank') }
            : undefined,
        });
        setOpen(false);
      } else {
        toast.error('Échec de l’envoi', {
          description: ERROR_MESSAGES[result.error ?? ''] ?? result.message ?? 'Erreur inconnue',
        });
      }
    } catch (err) {
      toast.error('Échec de l’envoi', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

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
            <div className="space-y-2">
              <Label>Appareil Thermomix</Label>
              <div className="flex flex-wrap gap-2">
                {TOOLS.map((t) => (
                  <Button
                    key={t.value}
                    type="button"
                    variant={tool === t.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTool(t.value)}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleExport} disabled={exportRecipe.isPending} className="w-full">
              {exportRecipe.isPending ? (
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
