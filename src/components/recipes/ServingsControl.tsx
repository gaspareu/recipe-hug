import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Réglage partagé entre une fiche seule et une composition. */
export function ServingsControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const id = useId();
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <Label htmlFor={id} className="text-base">Portions</Label>
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Réduire les portions" disabled={value <= 1} onClick={() => onChange(value - 1)}><Minus className="h-4 w-4" aria-hidden="true" /></Button>
      <Input id={id} type="number" min={1} step={1} value={value} onChange={event => {
        const next = Number(event.target.value);
        if (Number.isSafeInteger(next) && next > 0) onChange(next);
      }} className="h-11 w-16 text-center tabular-nums" />
      <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Augmenter les portions" onClick={() => onChange(value + 1)}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
    </div>
  </div>;
}
