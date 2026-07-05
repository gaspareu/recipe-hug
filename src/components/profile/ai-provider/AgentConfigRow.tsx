import { useState } from 'react';
import { AlertCircle, ChevronDown, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  AIProvider,
  PROVIDER_INFO,
  AgentType,
  AGENT_LABELS,
  AGENT_REQUIRED_CAPABILITIES,
  getCompatibleModels,
  AgentConfig,
  ProviderApiKeys,
} from '@/hooks/useAISettings';
import { cn } from '@/lib/utils';
import { ProviderBadge } from './ProviderBadge';
import { CapabilityBadge } from './CapabilityBadge';

interface AgentConfigRowProps {
  agentType: AgentType;
  config?: AgentConfig;
  globalProvider: AIProvider;
  providerApiKeys: ProviderApiKeys;
  onChange: (config: AgentConfig | undefined) => void;
}

// Ligne dépliable de configuration d'un agent : choix fournisseur/modèle avec repli sur le global.
export const AgentConfigRow = ({
  agentType,
  config,
  globalProvider,
  providerApiKeys,
  onChange,
}: AgentConfigRowProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const compatibleModels = getCompatibleModels(agentType);
  const requiredCapabilities = AGENT_REQUIRED_CAPABILITIES[agentType];

  // Determine effective provider (from config or global fallback)
  const effectiveProvider = config?.provider || globalProvider;
  const effectiveModel = config?.model || null;
  const isCustomized = !!config?.provider || !!config?.model;

  // Filter compatible models by selected provider
  const availableModels = compatibleModels.filter(m =>
    effectiveProvider === 'anthropic' || m.provider === effectiveProvider
  );

  // Check if provider has API key (anthropic = clé serveur, toujours disponible)
  const hasApiKey = effectiveProvider === 'anthropic' || !!providerApiKeys[effectiveProvider as Exclude<AIProvider, 'anthropic'>];

  const handleProviderChange = (provider: AIProvider) => {
    if (provider === globalProvider && !config?.model) {
      // Reset to global if selecting global provider with no custom model
      onChange(undefined);
    } else {
      // Find first compatible model for this provider
      const providerModels = compatibleModels.filter(m =>
        provider === 'anthropic' || m.provider === provider
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
  const requiresApiKey = effectiveProvider !== 'anthropic';
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
                {(['anthropic', 'gemini', 'openai'] as AIProvider[]).map((provider) => {
                  const providerHasKey = provider === 'anthropic' || !!providerApiKeys[provider as Exclude<AIProvider, 'anthropic'>];
                  return (
                    <SelectItem key={provider} value={provider}>
                      <div className="flex items-center gap-2">
                        <ProviderBadge provider={provider} size="sm" />
                        <span>{PROVIDER_INFO[provider].name}</span>
                        {provider === globalProvider && !isCustomized && (
                          <span className="text-xs text-muted-foreground">(par défaut)</span>
                        )}
                        {provider !== 'anthropic' && !providerHasKey && (
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
