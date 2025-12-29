import { useState, useMemo } from 'react';
import { Check } from 'lucide-react';
import { Ingredient } from '@/types/recipe';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface IngredientChecklistProps {
  ingredients: Ingredient[];
}

interface CheckedState {
  [key: string]: boolean;
}

export function IngredientChecklist({ ingredients }: IngredientChecklistProps) {
  const [checked, setChecked] = useState<CheckedState>({});
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  // Group ingredients by category
  const groupedIngredients = useMemo(() => {
    const groups: Record<string, Ingredient[]> = {};
    
    ingredients.forEach((ingredient, index) => {
      const category = ingredient.category || 'Autres';
      if (!groups[category]) {
        groups[category] = [];
      }
      // Add original index to track uniqueness
      groups[category].push({ ...ingredient, _index: index } as Ingredient & { _index: number });
    });

    // Sort categories alphabetically, but put "Autres" at the end
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

  // Initialize all categories as open
  useMemo(() => {
    const initial: Record<string, boolean> = {};
    groupedIngredients.forEach(group => {
      if (openCategories[group.category] === undefined) {
        initial[group.category] = true;
      }
    });
    if (Object.keys(initial).length > 0) {
      setOpenCategories(prev => ({ ...initial, ...prev }));
    }
  }, [groupedIngredients]);

  const toggleChecked = (key: string) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const getIngredientKey = (ingredient: Ingredient & { _index?: number }) => {
    return `${ingredient._index ?? ''}-${ingredient.name}`;
  };

  return (
    <div className="space-y-4">
      {groupedIngredients.map(({ category, ingredients: categoryIngredients }) => (
        <Collapsible
          key={category}
          open={openCategories[category] ?? true}
          onOpenChange={() => toggleCategory(category)}
        >
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
            <span 
              className={cn(
                "text-lg font-solitreo text-primary transition-transform",
                openCategories[category] ? "rotate-0" : "-rotate-90"
              )}
            >
              ▼
            </span>
            <span className="text-lg font-solitreo text-primary border-b border-dashed border-primary/30 flex-1">
              {category}
            </span>
            <span className="text-sm text-muted-foreground">
              ({categoryIngredients.length})
            </span>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-2">
            <ul className="space-y-1 pl-6">
              {categoryIngredients.map((ingredient) => {
                const key = getIngredientKey(ingredient as Ingredient & { _index: number });
                const isChecked = checked[key] ?? false;
                
                return (
                  <li 
                    key={key}
                    onClick={() => toggleChecked(key)}
                    className="flex items-center gap-3 py-1.5 cursor-pointer group"
                  >
                    {/* Handwritten-style checkbox */}
                    <div 
                      className={cn(
                        "relative h-5 w-5 border-2 rounded-sm transition-all",
                        isChecked 
                          ? "border-primary bg-primary/10" 
                          : "border-muted-foreground/40 group-hover:border-primary/60"
                      )}
                      style={{
                        transform: 'rotate(-2deg)',
                      }}
                    >
                      {isChecked && (
                        <svg
                          className="absolute inset-0 text-primary"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: 'rotate(2deg) scale(1.3)',
                          }}
                        >
                          {/* Handwritten-style checkmark path */}
                          <path 
                            d="M4 12 L9 18 L20 5" 
                            className="animate-[draw_0.3s_ease-out_forwards]"
                            style={{
                              strokeDasharray: 30,
                              strokeDashoffset: 0,
                            }}
                          />
                        </svg>
                      )}
                    </div>
                    
                    {/* Ingredient text */}
                    <span 
                      className={cn(
                        "transition-all",
                        isChecked && "line-through text-muted-foreground/60"
                      )}
                    >
                      <span className="font-medium">{ingredient.quantity} {ingredient.unit}</span>
                      {' '}
                      <span>{ingredient.name}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}