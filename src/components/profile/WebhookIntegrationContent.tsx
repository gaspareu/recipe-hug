import { useState } from 'react';
import { Copy, RefreshCw, Webhook, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, XCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

  const pythonExample = webhookToken
    ? `import requests

response = requests.post(
    "${webhookUrl}",
    json={
        "text": "Tarte aux pommes: 4 pommes, 200g farine...",
        "webhook_token": "${webhookToken}"
    }
)
print(response.json())`
    : '';

  const jsExample = webhookToken
    ? `const response = await fetch("${webhookUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: "Tarte aux pommes: 4 pommes, 200g farine...",
    webhook_token: "${webhookToken}"
  })
});
const data = await response.json();
console.log(data);`
    : '';

  const shortcutsExample = webhookToken
    ? `URL: ${webhookUrl}
Method: POST
Headers: Content-Type: application/json
Body: {
  "text": "[Texte de la page Safari]",
  "webhook_token": "${webhookToken}"
}`
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

      {/* API Documentation */}
      {webhookToken && (
        <Collapsible open={showInstructions} onOpenChange={setShowInstructions}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              Documentation API
              {showInstructions ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-6 pt-4">
            {/* API Overview */}
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-foreground">
                  Envoyez du texte brut contenant une recette. L'IA extraira automatiquement le titre, les ingrédients et les étapes.
                </p>
              </div>
            </div>

            {/* Endpoint Details */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Endpoint</h4>
              <div className="bg-muted p-3 rounded-md space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-mono rounded">POST</span>
                  <code className="text-xs text-foreground break-all">{webhookUrl}</code>
                </div>
                <p className="text-xs text-muted-foreground">Content-Type: application/json</p>
              </div>
            </div>

            {/* Request Schema */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Corps de la requête</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 font-medium text-foreground">Champ</th>
                      <th className="text-left py-2 pr-2 font-medium text-foreground">Type</th>
                      <th className="text-left py-2 pr-2 font-medium text-foreground">Requis</th>
                      <th className="text-left py-2 font-medium text-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-2 font-mono text-foreground">webhook_token</td>
                      <td className="py-2 pr-2">string</td>
                      <td className="py-2 pr-2"><CheckCircle2 className="h-3 w-3 text-green-500" /></td>
                      <td className="py-2">Votre token personnel d'authentification</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-2 font-mono text-foreground">text</td>
                      <td className="py-2 pr-2">string</td>
                      <td className="py-2 pr-2"><CheckCircle2 className="h-3 w-3 text-green-500" /></td>
                      <td className="py-2">Texte de la recette (titre, ingrédients, étapes)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Response Schema */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Réponses</h4>
              
              {/* Success */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-mono rounded">201</span>
                  <span className="text-xs text-foreground">Succès</span>
                </div>
                <pre className="bg-muted p-3 rounded-md text-xs text-foreground overflow-x-auto">
{`{
  "success": true,
  "message": "Recette \\"Titre\\" créée avec succès",
  "recipe": {
    "id": "uuid-de-la-recette",
    "title": "Titre de la recette"
  }
}`}
                </pre>
              </div>

              {/* Errors */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-mono rounded">400</span>
                  <span className="text-xs text-foreground">Payload invalide</span>
                </div>
                <pre className="bg-muted p-3 rounded-md text-xs text-foreground overflow-x-auto">
{`{
  "error": "Invalid payload",
  "details": [...]
}`}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-mono rounded">401</span>
                  <span className="text-xs text-foreground">Token invalide</span>
                </div>
                <pre className="bg-muted p-3 rounded-md text-xs text-foreground overflow-x-auto">
{`{
  "error": "Invalid webhook token"
}`}
                </pre>
              </div>
            </div>

            {/* Code Examples */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Exemples de code</h4>
              <Tabs defaultValue="curl" className="w-full">
                <TabsList className="w-full grid grid-cols-4 h-auto">
                  <TabsTrigger value="curl" className="text-xs py-1.5">cURL</TabsTrigger>
                  <TabsTrigger value="js" className="text-xs py-1.5">JavaScript</TabsTrigger>
                  <TabsTrigger value="python" className="text-xs py-1.5">Python</TabsTrigger>
                  <TabsTrigger value="shortcuts" className="text-xs py-1.5">Shortcuts</TabsTrigger>
                </TabsList>
                
                <TabsContent value="curl" className="mt-3">
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
                </TabsContent>
                
                <TabsContent value="js" className="mt-3">
                  <div className="relative">
                    <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto text-foreground">
                      {jsExample}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => copyToClipboard(jsExample)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="python" className="mt-3">
                  <div className="relative">
                    <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto text-foreground">
                      {pythonExample}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => copyToClipboard(pythonExample)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="shortcuts" className="mt-3">
                  <div className="relative">
                    <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto text-foreground whitespace-pre-wrap">
                      {shortcutsExample}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => copyToClipboard(shortcutsExample)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Dans Shortcuts iOS, utilisez l'action "Obtenir le contenu de l'URL" avec ces paramètres.
                  </p>
                </TabsContent>
              </Tabs>
            </div>

            {/* Use Cases */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Cas d'usage</h4>
              <div className="grid gap-2">
                <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <ExternalLink className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Shortcuts iOS</p>
                    <p className="text-xs text-muted-foreground">Partagez une recette depuis Safari ou une app de notes</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <ExternalLink className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Zapier / Make / n8n</p>
                    <p className="text-xs text-muted-foreground">Automatisez l'import depuis emails, Google Docs, etc.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <ExternalLink className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Script personnel</p>
                    <p className="text-xs text-muted-foreground">Importez en masse depuis un fichier CSV ou une base de données</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="p-3 bg-muted/50 rounded-lg border border-border">
              <h4 className="text-sm font-semibold text-foreground mb-2">💡 Conseils</h4>
              <ul className="text-xs text-muted-foreground space-y-1.5">
                <li>• Plus le texte est structuré, meilleure sera l'extraction</li>
                <li>• Incluez les quantités avec leurs unités (ex: "200g de farine")</li>
                <li>• Les recettes sont créées en statut "brouillon" pour révision</li>
                <li>• Régénérez votre token si vous pensez qu'il a été compromis</li>
              </ul>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
