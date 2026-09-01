import { Check, ListChecks, Minus, Plus, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { formatCookingQuantity } from '@/lib/cooking-ingredients';
import type { Ingredient } from '@/types/recipe';

interface CookingIngredientsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredients: Ingredient[];
  servings: number;
  canDecreaseServings: boolean;
  onDecreaseServings: () => void;
  onIncreaseServings: () => void;
  checkedIndexes: ReadonlySet<number>;
  onToggleIngredient: (index: number) => void;
}

export function CookingIngredientsSheet({
  open,
  onOpenChange,
  ingredients,
  servings,
  canDecreaseServings,
  onDecreaseServings,
  onIncreaseServings,
  checkedIndexes,
  onToggleIngredient,
}: CookingIngredientsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[82dvh] flex-col gap-0 rounded-t-[22px] p-0 [&>button]:flex [&>button]:h-11 [&>button]:w-11 [&>button]:items-center [&>button]:justify-center">
        <SheetHeader className="border-b border-border px-5 pb-3 pt-5 text-left">
          <SheetTitle className="flex items-center gap-2 font-solitreo text-2xl font-normal">
            <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />
            Tous les ingrédients
          </SheetTitle>
          <SheetDescription className="font-crimson text-sm">
            Ajustez les portions ou cochez les ingrédients déjà préparés.
          </SheetDescription>
          <div className="mt-1 flex items-center justify-between rounded-2xl bg-muted/60 py-1.5 pl-3 pr-1.5" role="group" aria-label="Nombre de portions">
            <span className="flex items-center gap-1.5 font-crimson text-sm font-bold text-foreground">
              <Users className="h-4 w-4" aria-hidden="true" />
              Quantités pour
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDecreaseServings}
                disabled={!canDecreaseServings}
                className="flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-xl bg-background text-primary transition-colors hover:bg-primary/10 disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Diminuer les portions"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-16 text-center font-crimson text-base font-bold text-foreground" aria-live="polite">
                {servings} portion{servings > 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={onIncreaseServings}
                className="flex h-11 w-11 touch-manipulation cursor-pointer items-center justify-center rounded-xl bg-background text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Augmenter les portions"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2">
          {ingredients.map((ingredient, index) => {
            const checked = checkedIndexes.has(index);
            const quantity = formatCookingQuantity(ingredient);
            return (
              <li key={`${ingredient.name}-${index}`}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => onToggleIngredient(index)}
                  className={cn(
                    'flex min-h-12 w-full touch-manipulation cursor-pointer items-center gap-3 border-b border-border/70 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    checked && 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-muted-foreground/50',
                      checked && 'border-primary bg-primary text-primary-foreground',
                    )}
                    aria-hidden="true"
                  >
                    {checked && <Check className="h-4 w-4" />}
                  </span>
                  {quantity && (
                    <strong className="min-w-[5.5rem] shrink-0 font-crimson text-base text-primary">
                      {quantity}
                    </strong>
                  )}
                  <span className={cn('font-crimson text-base text-foreground', checked && 'line-through text-muted-foreground')}>
                    {ingredient.name}
                    {ingredient.preparation && <span className="text-muted-foreground"> · {ingredient.preparation}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
