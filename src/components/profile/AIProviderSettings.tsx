import { useState, useEffect } from 'react';

import { Loader2, Settings2, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAISettings,
  AIProvider,
  PROVIDER_MODELS,
  PROVIDER_INFO,
  AgentType,
  AgentConfig,
  ProviderApiKeys
} from '@/hooks/useAISettings';
import { notifySaveSuccess, notifySaveError } from '@/lib/notify';
import { ProviderCard } from './ai-provider/ProviderCard';
import { AgentConfigRow } from './ai-provider/AgentConfigRow';

export function AIProviderSettings() {
  const { settings, isLoading, updateSettings, validateApiKey, hasApiKeyForProvider, getMaskedKeyForProvider } = useAISettings();

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('anthropic');
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
      /* eslint-disable react-hooks/set-state-in-effect -- seed du formulaire depuis les réglages chargés (async), pas un état dérivé calculable au rendu. */
      setSelectedProvider(settings.provider);
      // Don't populate providerApiKeys from settings - they contain encrypted blobs
      setSelectedModel(settings.preferred_model || '');
      setAgentConfigs(settings.agent_configs || {});
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [settings]);

  // Reset model when provider changes
  useEffect(() => {
    const models = PROVIDER_MODELS[selectedProvider];
    if (models.length > 0 && !models.find(m => m.value === selectedModel)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- retombe sur un modèle valide quand le provider change et n'expose pas le modèle courant.
      setSelectedModel(models[0].value);
    }
  }, [selectedProvider, selectedModel]);

  const handleApiKeyChange = (provider: Exclude<AIProvider, 'anthropic'>, key: string) => {
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

  const handleValidateKey = async (provider: Exclude<AIProvider, 'anthropic'>) => {
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
    const newKeysToValidate: { provider: Exclude<AIProvider, 'anthropic'>; key: string }[] = [];

    // Collect all new keys that need validation
    for (const provider of ['gemini', 'openai'] as Exclude<AIProvider, 'anthropic'>[]) {
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
        console.error('Invalid API keys detected');
        return;
      }
    }

    // All keys valid - proceed to save
    setSavePhase('saving');
    setIsSaving(true);

    try {
      const currentApiKey = selectedProvider === 'anthropic' ? null : providerApiKeys[selectedProvider] || null;

      await updateSettings.mutateAsync({
        provider: selectedProvider,
        api_key: currentApiKey,
        preferred_model: selectedModel || null,
        agent_configs: Object.keys(agentConfigs).length > 0 ? agentConfigs : null,
        provider_api_keys: providerApiKeys,
      });

      // Clear typed keys after successful save (they're now encrypted in DB)
      setProviderApiKeys({});
      notifySaveSuccess('Configuration IA enregistrée');
    } catch {
      // Le log détaillé est fait par updateSettings.onError (source unique) ;
      // ici on surface l'échec à l'utilisateur.
      notifySaveError("Échec de l'enregistrement de la configuration IA");
    } finally {
      setIsSaving(false);
      setSavePhase('idle');
    }
  };

  const providers: AIProvider[] = ['anthropic', 'gemini', 'openai'];
  const models = PROVIDER_MODELS[selectedProvider];

  const agentTypes: AgentType[] = [
    'chat',
    'analyze',
    'generate_image',
    'parse_image',
    'webhook',
  ];

  const hasChanges =
    selectedProvider !== (settings?.provider || 'anthropic') ||
    Object.values(providerApiKeys).some(k => k?.trim()) || // Any new key typed
    selectedModel !== (settings?.preferred_model || '') ||
    JSON.stringify(agentConfigs) !== JSON.stringify(settings?.agent_configs || {});

  // Check if current default provider has a valid key (new typed key OR existing key).
  // La présence d'une clé existante vient de maskedKeys (via hasApiKeyForProvider) :
  // settings.provider_api_keys n'est jamais peuplé côté client (blobs chiffrés).
  const defaultProviderHasKey =
    !!providerApiKeys[selectedProvider]?.trim() ||
    hasApiKeyForProvider(selectedProvider);

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
                  apiKey={provider === 'anthropic' ? '' : (providerApiKeys[provider as Exclude<AIProvider, 'anthropic'>] || '')}
                  hasExistingKey={provider !== 'anthropic' && hasApiKeyForProvider(provider)}
                  maskedKey={provider !== 'anthropic' ? getMaskedKeyForProvider(provider) : null}
                  onApiKeyChange={(key) => handleApiKeyChange(provider as Exclude<AIProvider, 'anthropic'>, key)}
                  onValidate={() => handleValidateKey(provider as Exclude<AIProvider, 'anthropic'>)}
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
