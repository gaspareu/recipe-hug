import { Badge } from '@/components/ui/badge';
import type { RecipeStatus } from '@/types/recipe';

interface RecipeStatusBadgeProps {
  status: RecipeStatus;
}

const statusConfig: Record<RecipeStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  tested: { label: 'Testé', variant: 'outline' },
  validated: { label: 'Validé', variant: 'default' },
  archived: { label: 'Archivé', variant: 'destructive' },
};

export function RecipeStatusBadge({ status }: RecipeStatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}
