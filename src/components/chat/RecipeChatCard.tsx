import { useState, useMemo } from 'react';
import { ChefHat, ExternalLink, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { scaleIngredients } from '@/lib/recipe-scaling';
import type { RecipeCard } from '@/hooks/useChatEngine';
import type { Ingredient } from '@/types/recipe';

const PORTIONS_MIN = 1;
const PORTIONS_MAX = 12;

interface RecipeChatCardProps {
  card: RecipeCard;
  isSaving?: boolean;
  onCreate: (data: { title: string; servings: number; ingredients: Ingredient[] }) => void;
  onStartCooking: (recipeId: string, servings: number) => void;
  onOpenDetail: (recipeId: string) => void;
  className?: string;
}

/** Formate une quantité + unité pour l'affichage dans la liste d'ingrédients.
 *  - Quantité 0 → omise (« pincée », « qs »)
 *  - Unité vide → omise
 */
function formatQuantity(quantity: number, unit: string): string {
  const parts: string[] = [];
  if (quantity > 0) parts.push(String(quantity));
  if (unit.trim()) parts.push(unit.trim());
  return parts.join(' ');
}

export function RecipeChatCard({
  card,
  isSaving = false,
  onCreate,
  onStartCooking,
  onOpenDetail,
  className,
}: RecipeChatCardProps) {
  // Initialisé au montage uniquement (piège useState volontairement assumé) :
  // lors de la transition proposed → saved, le parent patche card.servings avec
  // la valeur que l'utilisateur vient de choisir ici — état local et prop
  // coïncident donc. Si un même message devait un jour porter une AUTRE recette,
  // le parent devra keyer le composant pour forcer un remontage.
  const [portions, setPortions] = useState(card.servings);

  const scaled = useMemo(
    () => scaleIngredients(card.ingredients, card.servings, portions),
    [card.ingredients, card.servings, portions],
  );

  const handleDecrement = () => setPortions(p => Math.max(PORTIONS_MIN, p - 1));
  const handleIncrement = () => setPortions(p => Math.min(PORTIONS_MAX, p + 1));

  const handleCreate = () => {
    onCreate({ title: card.title, servings: portions, ingredients: scaled });
  };

  const hasIntro = (card.intro && card.intro.length > 0) || card.introClosing;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Bulle intro */}
      {hasIntro && (
        <div className="rounded-xl bg-card border border-border px-4 py-3 text-sm text-foreground">
          {card.intro && card.intro.length > 0 && (
            <ul className="list-disc list-inside space-y-1 mb-1">
              {card.intro.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {card.introClosing && (
            <p className="text-muted-foreground">{card.introClosing}</p>
          )}
        </div>
      )}

      {/* Carte recette */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {/* En-tête */}
        <div className="px-4 pt-4 pb-3">
          <h3 className="font-solitreo text-xl text-foreground leading-tight">
            {card.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {card.ingredients.length} ingrédient{card.ingredients.length > 1 ? 's' : ''} · {card.stepsCount} étape{card.stepsCount > 1 ? 's' : ''}
          </p>
        </div>

        {/* Séparateur */}
        <div className="h-px bg-border mx-4" />

        {/* Portions */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium text-foreground">Portions</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handleDecrement}
              disabled={portions <= PORTIONS_MIN}
              aria-label="diminuer les portions"
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm font-medium text-foreground w-6 text-center">
              {portions}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={handleIncrement}
              disabled={portions >= PORTIONS_MAX}
              aria-label="augmenter les portions"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Séparateur */}
        <div className="h-px bg-border mx-4" />

        {/* Ingrédients */}
        <div className="px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Ingrédients
          </p>
          <ul className="space-y-1">
            {scaled.map((ing, i) => {
              const qtyPart = formatQuantity(ing.quantity, ing.unit);
              const display = [qtyPart, ing.name].filter(Boolean).join(' ');
              return (
                <li key={i} className="text-sm text-foreground">
                  {display}
                  {ing.preparation && (
                    <span className="text-muted-foreground"> · {ing.preparation}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Séparateur */}
        <div className="h-px bg-border mx-4" />

        {/* Boutons d'action */}
        <div className="px-4 py-3">
          {card.status === 'proposed' && (
            <Button className="w-full" onClick={handleCreate} disabled={isSaving}>
              {card.isUpdate ? 'Mettre à jour la recette' : 'Créer la recette'}
            </Button>
          )}

          {card.status === 'saved' && (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => onStartCooking(card.id!, portions)}
              >
                <ChefHat className="h-4 w-4" />
                Commencer à cuisiner
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Voir la recette"
                onClick={() => onOpenDetail(card.id!)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Astuce */}
      {card.tip && (
        <div className="rounded-xl bg-card border border-border px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Astuce : </span>
          {card.tip}
        </div>
      )}
    </div>
  );
}
