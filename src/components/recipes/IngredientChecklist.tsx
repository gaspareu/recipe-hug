import { useState, useMemo, useEffect } from 'react';
import { CheckCheck, RotateCcw } from 'lucide-react';
import { Ingredient } from '@/types/recipe';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CheckedState {
  [key: string]: boolean;
}

// Hook for managing checklist state
// eslint-disable-next-line react-refresh/only-export-components -- hook compagnon des composants du fichier, co-localisation volontaire
export function useIngredientChecklist(ingredients: Ingredient[], recipeId?: string) {
  const storageKey = recipeId ? `recipe-${recipeId}-checklist` : null;

  const [checked, setChecked] = useState<CheckedState>(() => {
    if (!storageKey) return {};
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || '{}');
    } catch {
      return {};
    }
  });

  const allChecked = useMemo(() => {
    if (ingredients.length === 0) return false;
    return ingredients.every((_, index) => {
      const ingredient = ingredients[index];
      const key = `${index}-${ingredient.name}`;
      return checked[key];
    });
  }, [ingredients, checked]);

  const updateChecked = (newState: CheckedState) => {
    setChecked(newState);
    if (storageKey) {
      sessionStorage.setItem(storageKey, JSON.stringify(newState));
    }
  };

  const checkAll = () => {
    const newChecked: CheckedState = {};
    ingredients.forEach((ingredient, index) => {
      const key = `${index}-${ingredient.name}`;
      newChecked[key] = true;
    });
    updateChecked(newChecked);
  };

  const uncheckAll = () => {
    updateChecked({});
  };

  const toggleChecked = (key: string) => {
    const newState = { ...checked, [key]: !checked[key] };
    updateChecked(newState);
  };

  const isChecked = (key: string) => checked[key] ?? false;

  return {
    allChecked,
    checkAll,
    uncheckAll,
    toggleChecked,
    isChecked,
  };
}

// Toggle button component
export function IngredientToggleButton({
  allChecked,
  onCheckAll,
  onUncheckAll
}: {
  allChecked: boolean;
  onCheckAll: () => void;
  onUncheckAll: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={allChecked ? onUncheckAll : onCheckAll}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {allChecked ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{allChecked ? 'Tout décocher' : 'Tout cocher'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Hook for managing category collapse state
function useCategoryState(categories: string[]) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialise l'état d'ouverture des nouvelles catégories tout en préservant les bascules utilisateur existantes.
    setOpenCategories(prev => {
      const initial: Record<string, boolean> = {};
      let hasNew = false;
      categories.forEach(category => {
        if (prev[category] === undefined) {
          initial[category] = true;
          hasNew = true;
        }
      });
      return hasNew ? { ...initial, ...prev } : prev;
    });
  }, [categories]);

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  return { openCategories, toggleCategory };
}

// Group ingredients by category
function useGroupedIngredients(ingredients: Ingredient[]) {
  return useMemo(() => {
    const groups: Record<string, (Ingredient & { _index: number })[]> = {};

    ingredients.forEach((ingredient, index) => {
      const category = ingredient.category || 'Autres';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push({ ...ingredient, _index: index });
    });

    const sortedCategories = Object.keys(groups).sort((a, b) => {
      if (a === 'Autres') return 1;
      if (b === 'Autres') return -1;
      return a.localeCompare(b, 'fr');
    });

    return sortedCategories.map(category => ({
      category,
      ingredients: groups[category],
    }));
  }, [ingredients]);
}

// Shared ingredient item component
function IngredientItem({
  ingredient,
  checked,
  onToggle
}: {
  ingredient: Ingredient & { _index: number };
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      onClick={onToggle}
      className="flex items-start gap-3 py-1.5 cursor-pointer group"
    >
      <div
        className={cn(
          "relative flex-shrink-0 h-5 w-5 min-h-5 min-w-5 max-h-5 max-w-5 border-2 rounded-sm transition-all mt-0.5",
          checked
            ? "border-primary bg-primary/10"
            : "border-muted-foreground/40 group-hover:border-primary/60"
        )}
      >
        {checked && (
          <svg
            className="absolute inset-0 text-primary overflow-visible"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M4 12 L9 18 L20 5"
              className="checkmark-path"
              style={{
                strokeDasharray: 30,
                strokeDashoffset: 30,
                animation: 'draw-check 0.3s ease-out forwards',
              }}
            />
          </svg>
        )}
      </div>

      <span
        className={cn(
          "transition-all duration-200 leading-6 text-foreground",
          checked && "line-through text-muted-foreground/60"
        )}
      >
        {(ingredient.quantity || ingredient.unit) && (
          <span className="font-medium">
            {[ingredient.quantity || null, ingredient.unit || null].filter(Boolean).join(' ')}
          </span>
        )}
        {(ingredient.quantity || ingredient.unit) ? ' ' : ''}
        <span>{ingredient.name}</span>
      </span>
    </li>
  );
}

// Category group component
function CategoryGroup({
  category,
  ingredients,
  isOpen,
  onToggle,
  isChecked,
  onToggleItem
}: {
  category: string;
  ingredients: (Ingredient & { _index: number })[];
  isOpen: boolean;
  onToggle: () => void;
  isChecked: (key: string) => boolean;
  onToggleItem: (key: string) => void;
}) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left group">
        <span
          className={cn(
            "text-sm font-solitreo text-primary transition-transform duration-200",
            isOpen ? "rotate-0" : "-rotate-90"
          )}
        >
          ▼
        </span>
        <span className="text-sm font-solitreo text-primary border-b border-dashed border-primary/30 flex-1">
          {category}
        </span>
        <span className="text-xs text-muted-foreground">
          ({ingredients.length})
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        <ul className="space-y-1 pl-6">
          {ingredients.map((ingredient) => {
            const key = `${ingredient._index}-${ingredient.name}`;
            return (
              <IngredientItem
                key={key}
                ingredient={ingredient}
                checked={isChecked(key)}
                onToggle={() => onToggleItem(key)}
              />
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// CSS for checkmark animation (rendered once)
function CheckmarkStyles() {
  return (
    <style>{`
      @keyframes draw-check {
        from { stroke-dashoffset: 30; }
        to { stroke-dashoffset: 0; }
      }
    `}</style>
  );
}

// Main checklist component
export function IngredientChecklist({ ingredients, recipeId }: { ingredients: Ingredient[]; recipeId?: string }) {
  const { allChecked, checkAll, uncheckAll, toggleChecked, isChecked } = useIngredientChecklist(ingredients, recipeId);
  const groupedIngredients = useGroupedIngredients(ingredients);
  const { openCategories, toggleCategory } = useCategoryState(
    groupedIngredients.map(g => g.category)
  );

  return (
    <div className="space-y-4">
      {groupedIngredients.map(({ category, ingredients: categoryIngredients }) => (
        <CategoryGroup
          key={category}
          category={category}
          ingredients={categoryIngredients}
          isOpen={openCategories[category] ?? true}
          onToggle={() => toggleCategory(category)}
          isChecked={isChecked}
          onToggleItem={toggleChecked}
        />
      ))}
      <CheckmarkStyles />
    </div>
  );
}

// Wrapper component that includes the toggle button inline
export function IngredientChecklistWithHeader({
  ingredients,
  recipeId,
  renderHeader
}: {
  ingredients: Ingredient[];
  recipeId?: string;
  renderHeader?: (toggleButton: React.ReactNode) => React.ReactNode;
}) {
  const { allChecked, checkAll, uncheckAll, toggleChecked, isChecked } = useIngredientChecklist(ingredients, recipeId);
  const groupedIngredients = useGroupedIngredients(ingredients);
  const { openCategories, toggleCategory } = useCategoryState(
    groupedIngredients.map(g => g.category)
  );

  const toggleButton = (
    <IngredientToggleButton
      allChecked={allChecked}
      onCheckAll={checkAll}
      onUncheckAll={uncheckAll}
    />
  );

  return (
    <>
      {renderHeader?.(toggleButton)}
      <div className={cn("space-y-4", renderHeader && "px-6 pb-6")}>
        {groupedIngredients.map(({ category, ingredients: categoryIngredients }) => (
          <CategoryGroup
            key={category}
            category={category}
            ingredients={categoryIngredients}
            isOpen={openCategories[category] ?? true}
            onToggle={() => toggleCategory(category)}
            isChecked={isChecked}
            onToggleItem={toggleChecked}
          />
        ))}
        <CheckmarkStyles />
      </div>
    </>
  );
}
