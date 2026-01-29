import { Plus, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Step } from '@/types/recipe';

interface StepsEditorProps {
  steps: Step[];
  onChange: (steps: Step[]) => void;
}

export function StepsEditor({ steps, onChange }: StepsEditorProps) {
  const addStep = () => {
    const newOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.order)) + 1 : 1;
    onChange([...steps, { order: newOrder, text: '' }]);
  };

  const updateStep = (index: number, text: string) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], text };
    onChange(updated);
  };

  const removeStep = (index: number) => {
    const filtered = steps.filter((_, i) => i !== index);
    // Réordonne les étapes
    const reordered = filtered.map((step, i) => ({ ...step, order: i + 1 }));
    onChange(reordered);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Étapes</h3>
        <Button type="button" variant="outline" size="sm" onClick={addStep}>
          <Plus className="mr-1 h-4 w-4" />
          Ajouter
        </Button>
      </div>
      
      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
          Aucune étape. Cliquez sur "Ajouter" pour commencer.
        </p>
      )}
      
      <div className="space-y-2">
        {steps
          .sort((a, b) => a.order - b.order)
          .map((step, index) => (
            <div key={index} className="flex items-start gap-2 p-2 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-1 pt-2 text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                <span className="text-sm font-medium w-6">{step.order}.</span>
              </div>
              <Textarea
                placeholder={`Décrivez l'étape ${step.order}...`}
                value={step.text}
                onChange={(e) => updateStep(index, e.target.value)}
                className="flex-1 min-h-[60px]"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeStep(index)}
                className="h-8 w-8 text-destructive mt-1"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
}
