import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Ingredient } from '@/types/recipe';

interface IngredientEditorProps {
  ingredients: Ingredient[];
  onChange: (ingredients: Ingredient[]) => void;
}

const categories = [
  'Légume',
  'Fruit',
  'Viande',
  'Poisson',
  'Produit laitier',
  'Céréale',
  'Épice',
  'Autre',
];

const units = ['g', 'kg', 'ml', 'L', 'pièce', 'c. à soupe', 'c. à café', 'pincée'];

export function IngredientEditor({ ingredients, onChange }: IngredientEditorProps) {
  const addIngredient = () => {
    onChange([...ingredients, { name: '', category: 'Autre', quantity: 1, unit: 'pièce' }]);
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeIngredient = (index: number) => {
    onChange(ingredients.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Ingrédients</h3>
        <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
          <Plus className="mr-1 h-4 w-4" />
          Ajouter
        </Button>
      </div>
      
      {ingredients.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          Aucun ingrédient. Cliquez sur "Ajouter" pour commencer.
        </p>
      )}
      
      <div className="space-y-2">
        {ingredients.map((ingredient, index) => (
          <div key={index} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30">
            <Input
              placeholder="Nom"
              value={ingredient.name}
              onChange={(e) => updateIngredient(index, 'name', e.target.value)}
              className="flex-1"
            />
            <Input
              type="number"
              placeholder="Qté"
              value={ingredient.quantity}
              onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
              className="w-20"
            />
            <Select value={ingredient.unit} onValueChange={(v) => updateIngredient(index, 'unit', v)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ingredient.category || 'Autre'} onValueChange={(v) => updateIngredient(index, 'category', v)}>
              <SelectTrigger className="w-32 hidden sm:flex">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeIngredient(index)}
              className="h-8 w-8 text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
