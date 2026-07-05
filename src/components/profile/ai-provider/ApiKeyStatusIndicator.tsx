import { Loader2, Key, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ApiKeyStatusIndicatorProps {
  hasKey: boolean;
  isValidated?: boolean;
  isValidating?: boolean;
  size?: 'sm' | 'md';
}

// Indicateur d'état de la clé API : validation en cours, absente, validée ou configurée.
export const ApiKeyStatusIndicator = ({
  hasKey,
  isValidated,
  isValidating,
  size = 'sm',
}: ApiKeyStatusIndicatorProps) => {
  const sizeClasses = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  if (isValidating) {
    return <Loader2 className={cn(sizeClasses, 'animate-spin text-muted-foreground')} />;
  }

  if (!hasKey) {
    return <XCircle className={cn(sizeClasses, 'text-muted-foreground/50')} />;
  }

  if (isValidated) {
    return <CheckCircle2 className={cn(sizeClasses, 'text-green-500')} />;
  }

  return <Key className={cn(sizeClasses, 'text-amber-500')} />;
};
