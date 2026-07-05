import { useState } from 'react';
import { Sparkles, ChevronDown, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { AIProvider, PROVIDER_INFO } from '@/hooks/useAISettings';
import { cn } from '@/lib/utils';
import { ProviderBadge } from './ProviderBadge';
import { ApiKeyStatusIndicator } from './ApiKeyStatusIndicator';
import { ProviderApiKeyInput } from './ProviderApiKeyInput';

interface ProviderCardProps {
  provider: AIProvider;
  isDefault: boolean;
  apiKey: string;
  hasExistingKey: boolean;
  maskedKey?: string | null;
  onApiKeyChange: (key: string) => void;
  onValidate: () => void;
  onSetDefault: () => void;
  isValidating: boolean;
  validationStatus: 'idle' | 'valid' | 'invalid';
  validationError: string | null;
}

// Carte dépliable d'un fournisseur : gestion de la clé API et définition du fournisseur par défaut.
export const ProviderCard = ({
  provider,
  isDefault,
  apiKey,
  hasExistingKey,
  maskedKey,
  onApiKeyChange,
  onValidate,
  onSetDefault,
  isValidating,
  validationStatus,
  validationError,
}: ProviderCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const providerInfo = PROVIDER_INFO[provider];
  const isAnthropic = provider === 'anthropic';
  const hasKey = isAnthropic || !!apiKey.trim() || hasExistingKey;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
            isDefault ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
          )}
        >
          <ProviderBadge provider={provider} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{providerInfo.name}</span>
              {isDefault && (
                <Badge variant="default" className="text-xs">
                  Par défaut
                </Badge>
              )}
              {isAnthropic && (
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                  Inclus
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {providerInfo.description}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isAnthropic && (
              <ApiKeyStatusIndicator
                hasKey={hasKey}
                isValidated={validationStatus === 'valid'}
                isValidating={isValidating}
              />
            )}
            <ChevronDown className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isOpen && 'rotate-180'
            )} />
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-3 pb-1">
        <div className="space-y-4 pl-2 border-l-2 border-muted ml-4">
          {!isAnthropic && (
            <div className="pl-4">
              <Label className="text-sm mb-2 block">Clé API</Label>
              {hasExistingKey && !apiKey.trim() && maskedKey && (
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Clé configurée : <span className="font-mono">{maskedKey}</span>
                </p>
              )}
              <ProviderApiKeyInput
                provider={provider as Exclude<AIProvider, 'anthropic'>}
                apiKey={apiKey}
                onApiKeyChange={onApiKeyChange}
                onValidate={onValidate}
                isValidating={isValidating}
                validationStatus={validationStatus}
                validationError={validationError}
              />
              {hasExistingKey && !apiKey.trim() && (
                <p className="text-xs text-muted-foreground mt-1">
                  Saisissez une nouvelle clé pour remplacer l'existante
                </p>
              )}
            </div>
          )}

          {isAnthropic && (
            <div className="pl-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Aucune configuration requise</p>
                  <p className="mt-1">
                    Fournisseur par défaut (modèles Claude). La clé est gérée côté serveur.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isDefault && (
            <div className="pl-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onSetDefault}
                disabled={!isAnthropic && !hasKey}
              >
                Définir par défaut
              </Button>
              {!isAnthropic && !hasKey && (
                <p className="text-xs text-muted-foreground mt-1">
                  Ajoutez une clé API pour utiliser ce fournisseur par défaut
                </p>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
