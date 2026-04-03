import { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShoppingCart, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface GroceryIngredient {
  name: string;
  quantity: number | string | null;
  unit: string | null;
  category: string;
}

interface GroceryListSheetProps {
  ingredients: GroceryIngredient[];
  customMeals: string[];
  hasMeals: boolean;
}

function aggregateIngredients(ingredients: GroceryIngredient[]) {
  // Map keyed by "name|unit" for numeric quantities, "name|non-numeric" for others
  const numericMap = new Map<string, { name: string; unit: string | null; total: number; category: string }>();
  const nonNumericList: { name: string; quantities: string[]; category: string }[] = [];

  for (const ing of ingredients) {
    const numericQty = typeof ing.quantity === 'number'
      ? ing.quantity
      : typeof ing.quantity === 'string' && ing.quantity.trim() !== '' && !isNaN(Number(ing.quantity))
        ? Number(ing.quantity)
        : null;

    if (numericQty !== null) {
      const unit = ing.unit?.trim() || '';
      const key = `${ing.name.toLowerCase().trim()}|${unit.toLowerCase()}`;
      const existing = numericMap.get(key);
      if (existing) {
        numericMap.set(key, { ...existing, total: existing.total + numericQty });
      } else {
        numericMap.set(key, {
          name: ing.name,
          unit: ing.unit || null,
          total: numericQty,
          category: ing.category || 'Autres',
        });
      }
    } else {
      // Non-numeric quantity: keep distinct, group by name
      const qtyStr = ing.quantity && ing.unit
        ? `${ing.quantity} ${ing.unit}`
        : ing.quantity
          ? `${ing.quantity}`
          : '';
      const entry = nonNumericList.find(e => e.name.toLowerCase().trim() === ing.name.toLowerCase().trim());
      if (entry) {
        if (qtyStr && !entry.quantities.includes(qtyStr)) {
          entry.quantities.push(qtyStr);
        }
      } else {
        nonNumericList.push({
          name: ing.name,
          quantities: qtyStr ? [qtyStr] : [],
          category: ing.category || 'Autres',
        });
      }
    }
  }

  const numericResults = Array.from(numericMap.values()).map(({ name, unit, total, category }) => ({
    name,
    quantities: [unit ? `${total} ${unit}` : `${total}`],
    category,
  }));

  return [...numericResults, ...nonNumericList];
}

function groupByCategory(items: ReturnType<typeof aggregateIngredients>) {
  const groups: Record<string, typeof items> = {};
  for (const item of items) {
    const cat = item.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  // Sort categories, putting "Autres" last
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === 'Autres') return 1;
    if (b === 'Autres') return -1;
    return a.localeCompare(b, 'fr');
  });
}

export function GroceryListSheet({ ingredients, customMeals, hasMeals }: GroceryListSheetProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const aggregated = useMemo(() => aggregateIngredients(ingredients), [ingredients]);
  const grouped = useMemo(() => groupByCategory(aggregated), [aggregated]);

  const toggle = (name: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const copyToClipboard = () => {
    const lines: string[] = [];
    for (const [category, items] of grouped) {
      lines.push(`— ${category} —`);
      for (const item of items) {
        const qty = item.quantities.length > 0 ? ` (${item.quantities.join(' + ')})` : '';
        lines.push(`• ${item.name}${qty}`);
      }
      lines.push('');
    }
    if (customMeals.length > 0) {
      lines.push('— Plats sans recette (prévoir les ingrédients) —');
      customMeals.forEach(m => lines.push(`• ${m}`));
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    toast.success('Liste copiée !');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet onOpenChange={() => setChecked(new Set())}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!hasMeals}
        >
          <ShoppingCart className="h-4 w-4" />
          <span className="hidden sm:inline">Courses</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85dvh] flex flex-col">
        <SheetHeader className="flex-row items-center justify-between pr-8">
          <SheetTitle className="text-base">Liste de courses</SheetTitle>
          <Button variant="ghost" size="sm" onClick={copyToClipboard} className="gap-1.5 h-8">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span className="text-xs">{copied ? 'Copié' : 'Copier'}</span>
          </Button>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
          {aggregated.length === 0 && customMeals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun ingrédient à afficher pour cette semaine.
            </p>
          ) : (
            <div className="space-y-5 pb-6">
              {grouped.map(([category, items]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {items.map(item => {
                      const key = item.name.toLowerCase();
                      const isChecked = checked.has(key);
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggle(key)}
                          />
                          <span className={`text-sm flex-1 ${isChecked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {item.name}
                          </span>
                          {item.quantities.length > 0 && (
                            <span className={`text-xs shrink-0 ${isChecked ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                              {item.quantities.join(' + ')}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              {customMeals.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Plats sans recette
                  </h3>
                  <p className="text-xs text-muted-foreground/70 mb-2 italic">
                    Prévoir les ingrédients pour ces plats
                  </p>
                  <div className="space-y-1">
                    {customMeals.map((meal, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 px-2">
                        <span className="text-sm text-foreground">• {meal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
