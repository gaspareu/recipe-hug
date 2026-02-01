import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAISettings, AIProvider, PROVIDER_MODELS, PROVIDER_INFO } from '@/hooks/useAISettings';
import { cn } from '@/lib/utils';

// Provider icons/logos as simple colored badges
const ProviderBadge = ({ provider }: { provider: AIProvider }) => {
  const colors: Record<AIProvider, string> = {
    lovable: 'bg-primary text-primary-foreground',
    gemini: 'bg-blue-500 text-white',
    openai: 'bg-emerald-600 text-white',
    anthropic: 'bg-orange-500 text-white',
  };

  const initials: Record<AIProvider, string> = {
    lovable: 'L',
    gemini: 'G',
    openai: 'O',
    anthropic: 'A',
  };

  return (
    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold', colors[provider])}>
      {initials[provider]}
    </div>
  );
};

export function AIProviderSettings() {
  const { settings, isLoading, updateSettings, validateApiKey } = useAISettings();

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('lovable');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize from saved settings
  useEffect(() => {
    if (settings) {
      setSelectedProvider(settings.provider);
      setApiKey(settings.api_key || '');
      setSelectedModel(settings.preferred_model || '');
    }
  }, [settings]);

  // Reset model when provider changes
  useEffect(() => {
    const models = PROVIDER_MODELS[selectedProvider];
    if (models.length > 0 && !models.find(m => m.value === selectedModel)) {
      setSelectedModel(models[0].value);
    }
    // Reset validation when provider changes
    setValidationStatus('idle');
    setValidationError(null);
  }, [selectedProvider]);

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return;

    setIsValidating(true);
    setValidationStatus('idle');
    setValidationError(null);

    try {
      const result = await validateApiKey.mutateAsync({
        provider: selectedProvider,
        apiKey: apiKey.trim(),
      });

      if (result.valid) {
        setValidationStatus('valid');
      } else {
        setValidationStatus('invalid');
        setValidationError(result.error || 'Clé API invalide');
      }
    } catch (error) {
      setValidationStatus('invalid');
      setValidationError('Erreur lors de la validation');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      provider: selectedProvider,
      api_key: selectedProvider === 'lovable' ? null : apiKey.trim() || null,
      preferred_model: selectedModel || null,
    });
  };

  const providers: AIProvider[] = ['lovable', 'gemini', 'openai', 'anthropic'];
  const requiresApiKey = selectedProvider !== 'lovable';
  const models = PROVIDER_MODELS[selectedProvider];
  
  const hasChanges = 
    selectedProvider !== (settings?.provider || 'lovable') ||
    apiKey !== (settings?.api_key || '') ||
    selectedModel !== (settings?.preferred_model || '');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div className="space-y-3">
        <Label>Fournisseur IA</Label>
        <div className="grid gap-3">
          {providers.map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => setSelectedProvider(provider)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                selectedProvider === provider
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              )}
            >
              <ProviderBadge provider={provider} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{PROVIDER_INFO[provider].name}</div>
                <div className="text-sm text-muted-foreground truncate">
                  {PROVIDER_INFO[provider].description}
                </div>
              </div>
              {selectedProvider === provider && (
                <Check className="h-5 w-5 text-primary shrink-0" />
              )}
              {provider === 'lovable' && (
                <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full shrink-0">
                  Inclus
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* API Key Input (for external providers) */}
      {requiresApiKey && (
        <div className="space-y-2">
          <Label htmlFor="api-key">Clé API {PROVIDER_INFO[selectedProvider].name}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="api-key"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setValidationStatus('idle');
                }}
                placeholder={`Entrez votre clé API ${PROVIDER_INFO[selectedProvider].name}`}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleValidateKey}
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
            <p className="text-sm text-green-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              Clé API valide
            </p>
          )}
          {validationStatus === 'invalid' && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {validationError}
            </p>
          )}

          {/* Help text */}
          <p className="text-xs text-muted-foreground">
            {selectedProvider === 'gemini' && (
              <>Obtenez votre clé sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline">Google AI Studio</a></>
            )}
            {selectedProvider === 'openai' && (
              <>Obtenez votre clé sur <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">OpenAI Platform</a></>
            )}
            {selectedProvider === 'anthropic' && (
              <>Obtenez votre clé sur <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="underline">Anthropic Console</a></>
            )}
          </p>
        </div>
      )}

      {/* Model Selection */}
      <div className="space-y-2">
        <Label htmlFor="model">Modèle préféré</Label>
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger>
            <SelectValue placeholder="Choisir un modèle" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.value} value={model.value}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Info banner for Lovable */}
      {selectedProvider === 'lovable' && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Lovable AI est inclus dans votre abonnement</p>
            <p className="mt-1">
              Accès aux meilleurs modèles (Gemini, GPT-5) sans configuration supplémentaire.
            </p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={updateSettings.isPending || !hasChanges || (requiresApiKey && !apiKey.trim())}
        className="w-full"
      >
        {updateSettings.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enregistrement...
          </>
        ) : (
          'Enregistrer la configuration'
        )}
      </Button>
    </div>
  );
}
