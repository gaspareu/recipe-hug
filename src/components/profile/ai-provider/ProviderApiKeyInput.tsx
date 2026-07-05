import { useState } from 'react';
import { Eye, EyeOff, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AIProvider, PROVIDER_INFO } from '@/hooks/useAISettings';

interface ProviderApiKeyInputProps {
  provider: Exclude<AIProvider, 'anthropic'>;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onValidate: () => void;
  isValidating: boolean;
  validationStatus: 'idle' | 'valid' | 'invalid';
  validationError: string | null;
}

// Champ de saisie d'une clé API avec bascule d'affichage, bouton de test et retour de validation.
export const ProviderApiKeyInput = ({
  provider,
  apiKey,
  onApiKeyChange,
  onValidate,
  isValidating,
  validationStatus,
  validationError,
}: ProviderApiKeyInputProps) => {
  const [showKey, setShowKey] = useState(false);
  const providerInfo = PROVIDER_INFO[provider];

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={`Clé API ${providerInfo.name}`}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onValidate}
          disabled={!apiKey.trim() || isValidating}
        >
          {isValidating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : validationStatus === 'valid' ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            'Tester'
          )}
        </Button>
      </div>

      {/* Validation feedback */}
      {validationStatus === 'valid' && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <Check className="h-3 w-3" />
          Clé API valide
        </p>
      )}
      {validationStatus === 'invalid' && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {validationError}
        </p>
      )}

      {/* Help text */}
      {providerInfo.keyUrl && (
        <p className="text-xs text-muted-foreground">
          Obtenez votre clé sur{' '}
          <a href={providerInfo.keyUrl} target="_blank" rel="noopener noreferrer" className="underline">
            {providerInfo.name}
          </a>
        </p>
      )}
    </div>
  );
};
