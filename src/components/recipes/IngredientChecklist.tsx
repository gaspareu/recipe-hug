import { useState, useMemo } from 'react';
import { CheckCheck, RotateCcw } from 'lucide-react';
import { Ingredient } from '@/types/recipe';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CheckedState {
  [key: string]: boolean;
}

interface IngredientChecklistProps {
  ingredients: Ingredient[];
  toggleButton?: React.ReactNode;
}

// Hook for managing checklist state - can be used externally to control the button
export function useIngredientChecklist(ingredients: Ingredient[]) {
  const [checked, setChecked] = useState<CheckedState>({});

  const allChecked = useMemo(() => {
    if (ingredients.length === 0) return false;
    return ingredients.every((ingredient, index) => {
      const key = `${index}-${ingredient.name}`;
      return checked[key];
    });
  }, [ingredients, checked]);

  const checkAll = () => {
    const newChecked: CheckedState = {};
    ingredients.forEach((ingredient, index) => {
      const key = `${index}-${ingredient.name}`;
      newChecked[key] = true;
    });
    setChecked(newChecked);
  };

  const uncheckAll = () => {
    setChecked({});
  };

  const toggleChecked = (key: string) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isChecked = (key: string) => checked[key] ?? false;

  return {
    checked,
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
    <Button
      variant="ghost"
      size="sm"
      onClick={allChecked ? onUncheckAll : onCheckAll}
      className="text-muted-foreground hover:text-foreground"
    >
      {allChecked ? (
        <>
          <RotateCcw className="h-4 w-4 mr-2" />
          Tout décocher
        </>
      ) : (
        <>
          <CheckCheck className="h-4 w-4 mr-2" />
          Tout cocher
        </>
      )}
    </Button>
  );
}

// Main checklist component - includes its own state
export function IngredientChecklist({ ingredients }: IngredientChecklistProps) {
  const { allChecked, checkAll, uncheckAll, toggleChecked, isChecked } = useIngredientChecklist(ingredients);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  // Group ingredients by category
  const groupedIngredients = useMemo(() => {
    const groups: Record<string, (Ingredient & { _index: number })[]> = {};
    
    ingredients.forEach((ingredient, index) => {
      const category = ingredient.category || 'Autres';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push({ ...ingredient, _index: index });
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

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const getIngredientKey = (ingredient: Ingredient & { _index: number }) => {
    return `${ingredient._index}-${ingredient.name}`;
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
                "text-lg font-solitreo text-primary transition-transform duration-200",
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
                const key = getIngredientKey(ingredient);
                const checked = isChecked(key);
                
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
                        checked 
                          ? "border-primary bg-primary/10" 
                          : "border-muted-foreground/40 group-hover:border-primary/60"
                      )}
                      style={{
                        transform: 'rotate(-2deg)',
                      }}
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
                          style={{
                            transform: 'rotate(2deg) scale(1.3)',
                          }}
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
                    
                    {/* Ingredient text */}
                    <span 
                      className={cn(
                        "transition-all duration-200",
                        checked && "line-through text-muted-foreground/60"
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

      {/* CSS for checkmark animation */}
      <style>{`
        @keyframes draw-check {
          from {
            stroke-dashoffset: 30;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </div>
  );
}

// Wrapper component that includes the toggle button inline
export function IngredientChecklistWithHeader({ 
  ingredients, 
  renderHeader 
}: { 
  ingredients: Ingredient[];
  renderHeader?: (toggleButton: React.ReactNode) => React.ReactNode;
}) {
  const { allChecked, checkAll, uncheckAll, toggleChecked, isChecked } = useIngredientChecklist(ingredients);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const toggleButton = (
    <IngredientToggleButton 
      allChecked={allChecked} 
      onCheckAll={checkAll} 
      onUncheckAll={uncheckAll} 
    />
  );

  // Group ingredients by category
  const groupedIngredients = useMemo(() => {
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

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const getIngredientKey = (ingredient: Ingredient & { _index: number }) => {
    return `${ingredient._index}-${ingredient.name}`;
  };

  return (
    <>
      {renderHeader && renderHeader(toggleButton)}
      <div className={cn("space-y-4", renderHeader && "px-6 pb-6")}>
        {groupedIngredients.map(({ category, ingredients: categoryIngredients }) => (
          <Collapsible
            key={category}
            open={openCategories[category] ?? true}
            onOpenChange={() => toggleCategory(category)}
          >
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
              <span 
                className={cn(
                  "text-lg font-solitreo text-primary transition-transform duration-200",
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
                  const key = getIngredientKey(ingredient);
                  const checked = isChecked(key);
                  
                  return (
                    <li 
                      key={key}
                      onClick={() => toggleChecked(key)}
                      className="flex items-center gap-3 py-1.5 cursor-pointer group"
                    >
                      <div 
                        className={cn(
                          "relative h-5 w-5 border-2 rounded-sm transition-all",
                          checked 
                            ? "border-primary bg-primary/10" 
                            : "border-muted-foreground/40 group-hover:border-primary/60"
                        )}
                        style={{
                          transform: 'rotate(-2deg)',
                        }}
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
                            style={{
                              transform: 'rotate(2deg) scale(1.3)',
                            }}
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
                          "transition-all duration-200",
                          checked && "line-through text-muted-foreground/60"
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

        <style>{`
          @keyframes draw-check {
            from {
              stroke-dashoffset: 30;
            }
            to {
              stroke-dashoffset: 0;
            }
          }
        `}</style>
      </div>
    </>
  );
}