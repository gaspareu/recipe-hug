import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff, Check, Loader2, Sparkles, AlertCircle, ChevronDown, Settings2, Key, CheckCircle2, XCircle } from 'lucide-react';
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
  FlatModelInfo,
  ProviderApiKeys
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

// API Key status indicator
const ApiKeyStatusIndicator = ({ 
  hasKey, 
  isValidated,
  isValidating,
  size = 'sm' 
}: { 
  hasKey: boolean; 
  isValidated?: boolean;
  isValidating?: boolean;
  size?: 'sm' | 'md';
}) => {
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

// Provider API Key input component
const ProviderApiKeyInput = ({
  provider,
  apiKey,
  onApiKeyChange,
  onValidate,
  isValidating,
  validationStatus,
  validationError,
}: {
  provider: Exclude<AIProvider, 'lovable'>;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onValidate: () => void;
  isValidating: boolean;
  validationStatus: 'idle' | 'valid' | 'invalid';
  validationError: string | null;
}) => {
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

// Provider card with API key management
const ProviderCard = ({
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
}: {
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const providerInfo = PROVIDER_INFO[provider];
  const isLovable = provider === 'lovable';
  const hasKey = isLovable || !!apiKey.trim() || hasExistingKey;

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
              {isLovable && (
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
            {!isLovable && (
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
          {!isLovable && (
            <div className="pl-4">
              <Label className="text-sm mb-2 block">Clé API</Label>
              {hasExistingKey && !apiKey.trim() && maskedKey && (
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Clé configurée : <span className="font-mono">{maskedKey}</span>
                </p>
              )}
              <ProviderApiKeyInput
                provider={provider as Exclude<AIProvider, 'lovable'>}
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
          
          {isLovable && (
            <div className="pl-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Aucune configuration requise</p>
                  <p className="mt-1">
                    Accès aux meilleurs modèles (Gemini, GPT-5) inclus dans votre abonnement.
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
                disabled={!isLovable && !hasKey}
              >
                Définir par défaut
              </Button>
              {!isLovable && !hasKey && (
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

// Agent configuration row component
const AgentConfigRow = ({
  agentType,
  config,
  globalProvider,
  providerApiKeys,
  onChange,
}: {
  agentType: AgentType;
  config?: AgentConfig;
  globalProvider: AIProvider;
  providerApiKeys: ProviderApiKeys;
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

  // Check if provider has API key
  const hasApiKey = effectiveProvider === 'lovable' || !!providerApiKeys[effectiveProvider as Exclude<AIProvider, 'lovable'>];

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
              {showApiKeyWarning && (
                <AlertCircle className="h-4 w-4 text-amber-500" />
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
                {(['lovable', 'gemini', 'openai', 'anthropic'] as AIProvider[]).map((provider) => {
                  const providerHasKey = provider === 'lovable' || !!providerApiKeys[provider as Exclude<AIProvider, 'lovable'>];
                  return (
                    <SelectItem key={provider} value={provider}>
                      <div className="flex items-center gap-2">
                        <ProviderBadge provider={provider} size="sm" />
                        <span>{PROVIDER_INFO[provider].name}</span>
                        {provider === globalProvider && !isCustomized && (
                          <span className="text-xs text-muted-foreground">(par défaut)</span>
                        )}
                        {provider !== 'lovable' && !providerHasKey && (
                          <XCircle className="h-3 w-3 text-muted-foreground/50" />
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {showApiKeyWarning && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Configurez d'abord une clé API pour {PROVIDER_INFO[effectiveProvider].name} dans l'onglet Global
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
  const { settings, isLoading, updateSettings, validateApiKey, maskedKeys } = useAISettings();

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('lovable');
  const [providerApiKeys, setProviderApiKeys] = useState<ProviderApiKeys>({});
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [agentConfigs, setAgentConfigs] = useState<Partial<Record<AgentType, AgentConfig>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [savePhase, setSavePhase] = useState<'idle' | 'validating' | 'saving'>('idle');
  
  // Validation state per provider
  const [validationStates, setValidationStates] = useState<Record<string, {
    isValidating: boolean;
    status: 'idle' | 'valid' | 'invalid';
    error: string | null;
  }>>({});

  // Initialize from saved settings (API keys are NOT populated - they're encrypted in DB)
  useEffect(() => {
    if (settings) {
      setSelectedProvider(settings.provider);
      // Don't populate providerApiKeys from settings - they contain encrypted blobs
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
  }, [selectedProvider]);

  const handleApiKeyChange = (provider: Exclude<AIProvider, 'lovable'>, key: string) => {
    setProviderApiKeys(prev => ({
      ...prev,
      [provider]: key,
    }));
    // Reset validation when key changes
    setValidationStates(prev => ({
      ...prev,
      [provider]: { isValidating: false, status: 'idle', error: null },
    }));
  };

  const handleValidateKey = async (provider: Exclude<AIProvider, 'lovable'>) => {
    const apiKey = providerApiKeys[provider];
    if (!apiKey?.trim()) return;

    setValidationStates(prev => ({
      ...prev,
      [provider]: { isValidating: true, status: 'idle', error: null },
    }));

    try {
      const result = await validateApiKey.mutateAsync({
        provider,
        apiKey: apiKey.trim(),
      });

      setValidationStates(prev => ({
        ...prev,
        [provider]: {
          isValidating: false,
          status: result.valid ? 'valid' : 'invalid',
          error: result.valid ? null : (result.error || 'Clé API invalide'),
        },
      }));
    } catch (error) {
      setValidationStates(prev => ({
        ...prev,
        [provider]: {
          isValidating: false,
          status: 'invalid',
          error: 'Erreur lors de la validation',
        },
      }));
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
    const newKeysToValidate: { provider: Exclude<AIProvider, 'lovable'>; key: string }[] = [];
    
    // Collect all new keys that need validation
    for (const provider of ['gemini', 'openai', 'anthropic'] as Exclude<AIProvider, 'lovable'>[]) {
      const key = providerApiKeys[provider];
      if (key?.trim()) {
        // Skip if already validated as valid
        const state = validationStates[provider];
        if (state?.status !== 'valid') {
          newKeysToValidate.push({ provider, key: key.trim() });
        }
      }
    }

    // Validate all new keys before saving
    if (newKeysToValidate.length > 0) {
      setIsSaving(true);
      setSavePhase('validating');
      
      let allValid = true;
      
      // Validate all keys in parallel
      const validationPromises = newKeysToValidate.map(async ({ provider, key }) => {
        setValidationStates(prev => ({
          ...prev,
          [provider]: { isValidating: true, status: 'idle', error: null },
        }));

        try {
          const result = await validateApiKey.mutateAsync({ provider, apiKey: key });
          
          setValidationStates(prev => ({
            ...prev,
            [provider]: {
              isValidating: false,
              status: result.valid ? 'valid' : 'invalid',
              error: result.valid ? null : (result.error || 'Clé API invalide'),
            },
          }));
          
          if (!result.valid) allValid = false;
        } catch {
          setValidationStates(prev => ({
            ...prev,
            [provider]: {
              isValidating: false,
              status: 'invalid',
              error: 'Erreur lors de la validation',
            },
          }));
          allValid = false;
        }
      });
      
      await Promise.all(validationPromises);
      
      if (!allValid) {
        setIsSaving(false);
        setSavePhase('idle');
        toast.error('Certaines clés API sont invalides. Corrigez-les avant d\'enregistrer.');
        return;
      }
    }

    // All keys valid - proceed to save
    setSavePhase('saving');
    setIsSaving(true);
    
    try {
      const currentApiKey = selectedProvider === 'lovable' ? null : providerApiKeys[selectedProvider] || null;
      
      await updateSettings.mutateAsync({
        provider: selectedProvider,
        api_key: currentApiKey,
        preferred_model: selectedModel || null,
        agent_configs: Object.keys(agentConfigs).length > 0 ? agentConfigs : null,
        provider_api_keys: providerApiKeys,
      });
      
      // Clear typed keys after successful save (they're now encrypted in DB)
      setProviderApiKeys({});
    } finally {
      setIsSaving(false);
      setSavePhase('idle');
    }
  };

  const providers: AIProvider[] = ['lovable', 'gemini', 'openai', 'anthropic'];
  const externalProviders: Exclude<AIProvider, 'lovable'>[] = ['gemini', 'openai', 'anthropic'];
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
    Object.values(providerApiKeys).some(k => k?.trim()) || // Any new key typed
    selectedModel !== (settings?.preferred_model || '') ||
    JSON.stringify(agentConfigs) !== JSON.stringify(settings?.agent_configs || {});

  // Check if current default provider has a valid key (new typed key OR existing encrypted key)
  const defaultProviderHasKey = selectedProvider === 'lovable' || 
    !!providerApiKeys[selectedProvider]?.trim() ||
    !!settings?.provider_api_keys?.[selectedProvider as Exclude<AIProvider, 'lovable'>];

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
            <Key className="h-4 w-4 mr-2" />
            Clés API
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex-1">
            <Settings2 className="h-4 w-4 mr-2" />
            Par fonction
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-6 mt-4">
          {/* API Keys Overview */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Key className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Configuration des fournisseurs IA</p>
              <p className="mt-1">
                Configurez vos clés API pour chaque fournisseur. Seul le fournisseur par défaut sera utilisé, 
                sauf si vous personnalisez les agents dans l'onglet "Par fonction".
              </p>
            </div>
          </div>

          {/* Provider Cards */}
          <div className="space-y-2">
            {providers.map((provider) => {
              const state = validationStates[provider] || { isValidating: false, status: 'idle', error: null };
              return (
                <ProviderCard
                  key={provider}
                  provider={provider}
                  isDefault={selectedProvider === provider}
                  apiKey={provider === 'lovable' ? '' : (providerApiKeys[provider as Exclude<AIProvider, 'lovable'>] || '')}
                  hasExistingKey={provider !== 'lovable' && !!settings?.provider_api_keys?.[provider as Exclude<AIProvider, 'lovable'>]}
                  maskedKey={provider !== 'lovable' ? maskedKeys?.[provider as Exclude<AIProvider, 'lovable'>]?.masked : null}
                  onApiKeyChange={(key) => handleApiKeyChange(provider as Exclude<AIProvider, 'lovable'>, key)}
                  onValidate={() => handleValidateKey(provider as Exclude<AIProvider, 'lovable'>)}
                  onSetDefault={() => setSelectedProvider(provider)}
                  isValidating={state.isValidating}
                  validationStatus={state.status}
                  validationError={state.error}
                />
              );
            })}
          </div>

          {/* Model Selection for default provider */}
          <div className="space-y-2">
            <Label htmlFor="model">Modèle préféré par défaut ({PROVIDER_INFO[selectedProvider].name})</Label>
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
                providerApiKeys={providerApiKeys}
                onChange={(config) => handleAgentConfigChange(agentType, config)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={isSaving || updateSettings.isPending || !hasChanges || !defaultProviderHasKey}
        className="w-full"
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {savePhase === 'validating' ? 'Validation des clés API...' : 'Enregistrement...'}
          </>
        ) : (
          'Enregistrer la configuration'
        )}
      </Button>
      
      {!defaultProviderHasKey && (
        <p className="text-sm text-center text-amber-600">
          Ajoutez une clé API pour {PROVIDER_INFO[selectedProvider].name} avant d'enregistrer
        </p>
      )}
    </div>
  );
}
