import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { RecipeStatus } from '@/types/recipe';

interface RecipeStatusSelectProps {
  status: RecipeStatus;
  onStatusChange: (status: RecipeStatus) => void;
  disabled?: boolean;
}

const statusConfig: Record<RecipeStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  tested: { label: 'Testé', variant: 'outline' },
  validated: { label: 'Validé', variant: 'default' },
  archived: { label: 'Archivé', variant: 'destructive' },
};

const statusOrder: RecipeStatus[] = ['draft', 'tested', 'validated', 'archived'];

export function RecipeStatusSelect({ status, onStatusChange, disabled }: RecipeStatusSelectProps) {
  const config = statusConfig[status];

  return (
    <Select value={status} onValueChange={(value) => onStatusChange(value as RecipeStatus)} disabled={disabled}>
      <SelectTrigger className="w-auto h-auto border-0 p-0 shadow-none focus:ring-0 [&>svg]:hidden">
        <SelectValue>
          <Badge variant={config.variant} className="cursor-pointer">
            {config.label}
          </Badge>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {statusOrder.map((s) => {
          const cfg = statusConfig[s];
          return (
            <SelectItem key={s} value={s}>
              <Badge variant={cfg.variant}>{cfg.label}</Badge>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
