import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, Loader2, Sparkles, AlertCircle, ChevronDown, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { 
  useAISettings, 
  AIProvider, 
  PROVIDER_MODELS, 
  PROVIDER_INFO,
  AgentType,
  AGENT_LABELS,
  AGENT_REQUIRED_CAPABILITIES,
  getCompatibleModels,
  AgentConfig,
  FlatModelInfo
} from '@/hooks/useAISettings';
import { cn } from '@/lib/utils';

// Provider icons/logos as simple colored badges
const ProviderBadge = ({ provider, size = 'md' }: { provider: AIProvider; size?: 'sm' | 'md' }) => {
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

  const sizeClasses = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';

  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold', sizeClasses, colors[provider])}>
      {initials[provider]}
    </div>
  );
};

// Capability badges
const CapabilityBadge = ({ capability }: { capability: string }) => {
  const labels: Record<string, string> = {
    text: 'Texte',
    streaming: 'Streaming',
    vision: 'Vision',
    tools: 'Outils',
    image_generation: 'Génération image',
  };

  return (
    <Badge variant="secondary" className="text-xs">
      {labels[capability] || capability}
    </Badge>
  );
};

// Agent configuration row component
const AgentConfigRow = ({
  agentType,
  config,
  globalProvider,
  globalApiKey,
  onChange,
}: {
  agentType: AgentType;
  config?: AgentConfig;
  globalProvider: AIProvider;
  globalApiKey: string | null;
  onChange: (config: AgentConfig | undefined) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const compatibleModels = getCompatibleModels(agentType);
  const requiredCapabilities = AGENT_REQUIRED_CAPABILITIES[agentType];

  // Determine effective provider (from config or global fallback)
  const effectiveProvider = config?.provider || globalProvider;
  const effectiveModel = config?.model || null;
  const isCustomized = !!config?.provider || !!config?.model;

  // Filter compatible models by selected provider
  const availableModels = compatibleModels.filter(m => 
    effectiveProvider === 'lovable' || m.provider === effectiveProvider
  );

  const handleProviderChange = (provider: AIProvider) => {
    if (provider === globalProvider && !config?.model) {
      // Reset to global if selecting global provider with no custom model
      onChange(undefined);
    } else {
      // Find first compatible model for this provider
      const providerModels = compatibleModels.filter(m => 
        provider === 'lovable' || m.provider === provider
      );
      const firstModel = providerModels[0]?.value || null;
      onChange({ provider, model: firstModel });
    }
  };

  const handleModelChange = (model: string) => {
    const modelInfo = compatibleModels.find(m => m.value === model);
    if (modelInfo) {
      onChange({ 
        provider: effectiveProvider, 
        model 
      });
    }
  };

  const handleReset = () => {
    onChange(undefined);
    setIsOpen(false);
  };

  // Check if selected provider requires API key and if it's configured
  const requiresApiKey = effectiveProvider !== 'lovable';
  const hasApiKey = !!globalApiKey && globalProvider === effectiveProvider;
  const showApiKeyWarning = requiresApiKey && !hasApiKey && isCustomized;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
            isCustomized ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/50'
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{AGENT_LABELS[agentType].name}</span>
              {isCustomized && (
                <Badge variant="outline" className="text-xs">
                  Personnalisé
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground truncate">
              {AGENT_LABELS[agentType].description}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ProviderBadge provider={effectiveProvider} size="sm" />
            <ChevronDown className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isOpen && 'rotate-180'
            )} />
          </div>
        </button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-3 pb-1">
        <div className="space-y-4 pl-2 border-l-2 border-muted ml-4">
          {/* Required capabilities info */}
          <div className="pl-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Capacités requises</Label>
            <div className="flex flex-wrap gap-1">
              {requiredCapabilities.map(cap => (
                <CapabilityBadge key={cap} capability={cap} />
              ))}
            </div>
          </div>

          {/* Provider selection */}
          <div className="pl-4 space-y-2">
            <Label>Fournisseur</Label>
            <Select value={effectiveProvider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['lovable', 'gemini', 'openai', 'anthropic'] as AIProvider[]).map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    <div className="flex items-center gap-2">
                      <ProviderBadge provider={provider} size="sm" />
                      <span>{PROVIDER_INFO[provider].name}</span>
                      {provider === globalProvider && !isCustomized && (
                        <span className="text-xs text-muted-foreground">(par défaut)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {showApiKeyWarning && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Configurez d'abord {PROVIDER_INFO[effectiveProvider].name} comme fournisseur par défaut avec une clé API
              </p>
            )}
          </div>

          {/* Model selection */}
          <div className="pl-4 space-y-2">
            <Label>Modèle</Label>
            <Select 
              value={effectiveModel || ''} 
              onValueChange={handleModelChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Utiliser le modèle par défaut" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    <div className="flex items-center gap-2">
                      <ProviderBadge provider={model.provider} size="sm" />
                      <span>{model.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reset button */}
          {isCustomized && (
            <div className="pl-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-muted-foreground"
              >
                Réinitialiser (utiliser global)
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
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
  const [agentConfigs, setAgentConfigs] = useState<Partial<Record<AgentType, AgentConfig>>>({});

  // Initialize from saved settings
  useEffect(() => {
    if (settings) {
      setSelectedProvider(settings.provider);
      setApiKey(settings.api_key || '');
      setSelectedModel(settings.preferred_model || '');
      setAgentConfigs(settings.agent_configs || {});
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

  const handleAgentConfigChange = (agentType: AgentType, config: AgentConfig | undefined) => {
    setAgentConfigs(prev => {
      const newConfigs = { ...prev };
      if (config) {
        newConfigs[agentType] = config;
      } else {
        delete newConfigs[agentType];
      }
      return newConfigs;
    });
  };

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      provider: selectedProvider,
      api_key: selectedProvider === 'lovable' ? null : apiKey.trim() || null,
      preferred_model: selectedModel || null,
      agent_configs: Object.keys(agentConfigs).length > 0 ? agentConfigs : null,
    });
  };

  const providers: AIProvider[] = ['lovable', 'gemini', 'openai', 'anthropic'];
  const requiresApiKey = selectedProvider !== 'lovable';
  const models = PROVIDER_MODELS[selectedProvider];
  
  const agentTypes: AgentType[] = [
    'chat', 
    'create_recipe', 
    'cooking', 
    'edit_recipe', 
    'generate_image', 
    'parse_image', 
    'timeline', 
    'webhook'
  ];

  const hasChanges = 
    selectedProvider !== (settings?.provider || 'lovable') ||
    apiKey !== (settings?.api_key || '') ||
    selectedModel !== (settings?.preferred_model || '') ||
    JSON.stringify(agentConfigs) !== JSON.stringify(settings?.agent_configs || {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="global" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="global" className="flex-1">
            <Sparkles className="h-4 w-4 mr-2" />
            Global
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex-1">
            <Settings2 className="h-4 w-4 mr-2" />
            Par fonction
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-6 mt-4">
          {/* Provider Selection */}
          <div className="space-y-3">
            <Label>Fournisseur IA par défaut</Label>
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
            <Label htmlFor="model">Modèle préféré par défaut</Label>
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
        </TabsContent>

        <TabsContent value="agents" className="space-y-4 mt-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Settings2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Configuration par fonction</p>
              <p className="mt-1">
                Personnalisez le fournisseur et le modèle pour chaque fonction IA. 
                Les fonctions non configurées utiliseront les paramètres globaux.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {agentTypes.map((agentType) => (
              <AgentConfigRow
                key={agentType}
                agentType={agentType}
                config={agentConfigs[agentType]}
                globalProvider={selectedProvider}
                globalApiKey={apiKey || null}
                onChange={(config) => handleAgentConfigChange(agentType, config)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

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
