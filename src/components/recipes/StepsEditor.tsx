import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
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
    const reordered = filtered.map((step, i) => ({ ...step, order: i + 1 }));
    onChange(reordered);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const sorted = [...steps].sort((a, b) => a.order - b.order);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const reordered = sorted.map((step, i) => {
      if (i === index) return { ...step, order: targetIndex + 1 };
      if (i === targetIndex) return { ...step, order: index + 1 };
      return step;
    });
    onChange(reordered.sort((a, b) => a.order - b.order));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
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
        {[...steps]
          .sort((a, b) => a.order - b.order)
          .map((step, index) => (
            <div key={index} className="flex items-start gap-2 p-2 border rounded-lg bg-muted/30">
              <div className="flex flex-col items-center gap-0.5 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveStep(index, 'up')}
                  disabled={index === 0}
                  className="h-6 w-6 text-muted-foreground disabled:opacity-30"
                  aria-label="Monter l'étape"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <span className="text-sm font-medium w-6 text-center">{step.order}.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => moveStep(index, 'down')}
                  disabled={index === steps.length - 1}
                  className="h-6 w-6 text-muted-foreground disabled:opacity-30"
                  aria-label="Descendre l'étape"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
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
