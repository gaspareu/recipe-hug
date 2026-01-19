import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { History, RotateCcw, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useRecipeVersions, useRestoreVersion, type RecipeVersion } from '@/hooks/useRecipeVersions';
import { toast } from 'sonner';

interface RecipeVersionHistoryProps {
  recipeId: string;
  onRestore?: () => void;
}

export function RecipeVersionHistory({ recipeId, onRestore }: RecipeVersionHistoryProps) {
  const { data: versions, isLoading } = useRecipeVersions(recipeId);
  const restoreVersion = useRestoreVersion();
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (version: RecipeVersion) => {
    setRestoringId(version.id);
    try {
      await restoreVersion.mutateAsync({ version, recipeId });
      toast.success('Version restaurée', {
        description: `La recette a été restaurée à la version ${version.version_number}`,
      });
      onRestore?.();
    } catch (error) {
      toast.error('Erreur', {
        description: 'Impossible de restaurer cette version',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="text-center p-4 text-muted-foreground text-sm">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Aucun historique disponible</p>
        <p className="text-xs mt-1">Les versions seront sauvegardées lors des modifications</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-1">
        {versions.map((version) => (
          <Collapsible
            key={version.id}
            open={expandedVersion === version.id}
            onOpenChange={(open) => setExpandedVersion(open ? version.id : null)}
          >
            <div className="border rounded-lg overflow-hidden">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0">
                      v{version.version_number}
                    </Badge>
                    <span className="text-sm font-medium truncate">{version.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(version.created_at), 'dd MMM HH:mm', { locale: fr })}
                    </span>
                    {expandedVersion === version.id ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="px-3 pb-3 pt-1 border-t bg-muted/20 space-y-3">
                  {version.change_description && (
                    <p className="text-xs text-muted-foreground italic">
                      {version.change_description}
                    </p>
                  )}
                  
                  <div className="text-xs space-y-1">
                    <p><strong>Portions:</strong> {version.servings || 'Non spécifié'}</p>
                    <p><strong>Ingrédients:</strong> {version.ingredients.length}</p>
                    <p><strong>Étapes:</strong> {version.steps.length}</p>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        disabled={restoringId === version.id}
                      >
                        {restoringId === version.id ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Restaurer cette version
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Restaurer la version {version.version_number} ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          La recette actuelle sera remplacée par cette version. 
                          Une nouvelle version sera automatiquement créée pour sauvegarder l'état actuel.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleRestore(version)}>
                          Restaurer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </div>
    </ScrollArea>
  );
}
