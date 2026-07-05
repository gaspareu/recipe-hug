import { AIProvider } from '@/hooks/useAISettings';
import { cn } from '@/lib/utils';

interface ProviderBadgeProps {
  provider: AIProvider;
  size?: 'sm' | 'md';
}

const COLORS: Record<AIProvider, string> = {
  anthropic: 'bg-orange-500 text-white',
  gemini: 'bg-blue-500 text-white',
  openai: 'bg-emerald-600 text-white',
};

const INITIALS: Record<AIProvider, string> = {
  anthropic: 'A',
  gemini: 'G',
  openai: 'O',
};

// Logos des fournisseurs représentés par une pastille colorée avec initiale.
export const ProviderBadge = ({ provider, size = 'md' }: ProviderBadgeProps) => {
  const sizeClasses = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';

  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold', sizeClasses, COLORS[provider])}>
      {INITIALS[provider]}
    </div>
  );
};
