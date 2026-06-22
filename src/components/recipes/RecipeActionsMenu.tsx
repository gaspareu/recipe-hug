import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical, Pencil, Share2, UtensilsCrossed, Sparkles, History, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShareRecipeDialog } from './ShareRecipeDialog';
import { ExportToCookidooButton } from './ExportToCookidooButton';

interface RecipeActionsMenuProps {
  recipeId: string;
  onAnalyzeAndGenerate: () => void;
  isAnalyzing: boolean;
  onOpenHistory: () => void;
}

/**
 * Regroupe les actions secondaires de la fiche recette dans un menu « … »,
 * pour désencombrer le haut de la page (cf. refonte #5). Le favori reste un
 * bouton direct ; le menu pilote les dialogs Partage / Cookidoo (contrôlés).
 */
export function RecipeActionsMenu({ recipeId, onAnalyzeAndGenerate, isAnalyzing, onOpenHistory }: RecipeActionsMenuProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80"
            aria-label="Plus d'actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link to={`/recipes/${recipeId}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />Éditer
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShareOpen(true)}>
            <Share2 className="mr-2 h-4 w-4" />Partager
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setExportOpen(true)}>
            <UtensilsCrossed className="mr-2 h-4 w-4" />Exporter vers Cookidoo
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAnalyzeAndGenerate()} disabled={isAnalyzing}>
            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Analyser &amp; générer l'image
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenHistory()}>
            <History className="mr-2 h-4 w-4" />Historique des versions
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareRecipeDialog recipeId={recipeId} open={shareOpen} onOpenChange={setShareOpen} showTrigger={false} />
      <ExportToCookidooButton recipeId={recipeId} open={exportOpen} onOpenChange={setExportOpen} showTrigger={false} />
    </>
  );
}
