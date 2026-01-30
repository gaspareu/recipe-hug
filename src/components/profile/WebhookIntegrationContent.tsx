import { useState } from 'react';
import { Copy, RefreshCw, Webhook, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useWebhookToken } from '@/hooks/useWebhookToken';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function WebhookIntegrationContent() {
  const { webhookToken, isLoading, isGenerating, generateToken, copyToClipboard } = useWebhookToken();
  const [showInstructions, setShowInstructions] = useState(false);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-recipe`;

  const curlExample = webhookToken
    ? `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Votre recette ici...",
    "webhook_token": "${webhookToken}"
  }'`
    : '';

  return (
    <div className="space-y-4">
      {/* Webhook URL */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">URL du Webhook</label>
        <div className="flex gap-2">
          <Input
            value={webhookUrl}
            readOnly
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => copyToClipboard(webhookUrl)}
            title="Copier l'URL"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Token */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Token Personnel</label>
        {isLoading ? (
          <div className="h-10 animate-pulse bg-muted rounded-md" />
        ) : webhookToken ? (
          <div className="flex gap-2">
            <Input
              value={webhookToken}
              readOnly
              type="password"
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(webhookToken)}
              title="Copier le token"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={generateToken}
              disabled={isGenerating}
              title="Régénérer le token"
            >
              <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        ) : (
          <Button onClick={generateToken} disabled={isGenerating} className="w-full">
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Webhook className="mr-2 h-4 w-4" />
                Générer mon token
              </>
            )}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Ce token est secret. Ne le partagez pas publiquement.
        </p>
      </div>

      {/* Instructions */}
      {webhookToken && (
        <Collapsible open={showInstructions} onOpenChange={setShowInstructions}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              Instructions d'utilisation
              {showInstructions ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* cURL Example */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Exemple cURL</h4>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto text-foreground">
                  {curlExample}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={() => copyToClipboard(curlExample)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Payload Format */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Format du Payload</h4>
              <pre className="bg-muted p-3 rounded-md text-xs text-foreground">
{`{
  "text": "Contenu de la recette...",
  "webhook_token": "votre-token"
}`}
              </pre>
            </div>

            {/* Use Cases */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Cas d'usage</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" />
                  Shortcuts iOS : Partagez une recette depuis Safari
                </li>
                <li className="flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" />
                  Zapier : Automatisez depuis vos apps préférées
                </li>
                <li className="flex items-center gap-2">
                  <ExternalLink className="h-3 w-3" />
                  Make : Créez des workflows avancés
                </li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
