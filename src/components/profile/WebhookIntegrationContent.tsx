import { useState } from "react";
import { Copy, RefreshCw, Webhook, ChevronDown, ChevronUp, ExternalLink, BookOpen, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useWebhookToken } from "@/hooks/useWebhookToken";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function WebhookIntegrationContent() {
  const { webhookToken, isLoading, isGenerating, generateToken, copyToClipboard } = useWebhookToken();
  const [showInstructions, setShowInstructions] = useState(false);
  const [showApiDocs, setShowApiDocs] = useState(false);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-recipe`;

  const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Votre recette ici...",
    "webhook_token": "${webhookToken || '<votre-token>'}"
  }'`;

  const shortcutsExample = `URL: ${webhookUrl}
Méthode: POST
Headers: Content-Type: application/json
Corps (JSON):
{
  "text": "[Texte de la recette]",
  "webhook_token": "${webhookToken || '<votre-token>'}"
}`;

  return (
    <div className="space-y-4">
      {/* Webhook URL */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">URL du Webhook</label>
        <div className="flex gap-2">
          <Input value={webhookUrl} readOnly className="font-mono text-xs" />
          <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)} title="Copier l'URL">
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
            <Input value={webhookToken} readOnly type="password" className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookToken)} title="Copier le token">
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={generateToken}
              disabled={isGenerating}
              title="Régénérer le token"
            >
              <RefreshCw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
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
        <p className="text-xs text-muted-foreground">Ce token est secret. Ne le partagez pas publiquement.</p>
      </div>

      {/* Integration Examples */}
      {webhookToken && (
        <Collapsible open={showInstructions} onOpenChange={setShowInstructions}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Exemples d'intégration
              </span>
              {showInstructions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* cURL Example */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ExternalLink className="h-3 w-3" />
                cURL / Terminal
              </h4>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto text-foreground whitespace-pre-wrap">{curlExample}</pre>
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

            {/* iOS Shortcuts */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ExternalLink className="h-3 w-3" />
                Raccourcis iOS / macOS
              </h4>
              <div className="relative">
                <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto text-foreground whitespace-pre-wrap">{shortcutsExample}</pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-6 w-6"
                  onClick={() => copyToClipboard(shortcutsExample)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Utilisez l'action "Obtenir le contenu de l'URL" avec la méthode POST.
              </p>
            </div>

            {/* Zapier / Make */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ExternalLink className="h-3 w-3" />
                Zapier / Make / n8n
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 pl-4">
                <li>• Créez un webhook HTTP POST vers l'URL ci-dessus</li>
                <li>• Header: <code className="bg-muted px-1 rounded">Content-Type: application/json</code></li>
                <li>• Corps JSON avec <code className="bg-muted px-1 rounded">text</code> et <code className="bg-muted px-1 rounded">webhook_token</code></li>
              </ul>
            </div>

            {/* Payload Format */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Format du Payload</h4>
              <pre className="bg-muted p-3 rounded-md text-xs text-foreground">
{`{
  "text": "Contenu de la recette (texte brut, HTML, ou URL)",
  "webhook_token": "${webhookToken || '<votre-token>'}"
}`}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* API Documentation */}
      {webhookToken && (
        <Collapsible open={showApiDocs} onOpenChange={setShowApiDocs}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Documentation API
              </span>
              {showApiDocs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* Endpoint */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Endpoint</h4>
              <div className="bg-muted p-3 rounded-md">
                <code className="text-xs text-foreground">
                  <span className="text-green-600 dark:text-green-400 font-semibold">POST</span> /functions/v1/webhook-recipe
                </code>
              </div>
            </div>

            {/* Request Body */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Corps de la requête</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-foreground">Paramètre</th>
                      <th className="text-left py-2 pr-4 font-medium text-foreground">Type</th>
                      <th className="text-left py-2 pr-4 font-medium text-foreground">Requis</th>
                      <th className="text-left py-2 font-medium text-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">text</code></td>
                      <td className="py-2 pr-4">string</td>
                      <td className="py-2 pr-4">✓</td>
                      <td className="py-2">Contenu de la recette (texte, HTML, URL)</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><code className="bg-muted px-1 rounded">webhook_token</code></td>
                      <td className="py-2 pr-4">string</td>
                      <td className="py-2 pr-4">✓</td>
                      <td className="py-2">Votre token d'authentification</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Success Response */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Réponse succès (201)</h4>
              <pre className="bg-muted p-3 rounded-md text-xs text-foreground overflow-x-auto">
{`{
  "success": true,
  "recipe": {
    "id": "uuid",
    "title": "Titre extrait",
    "ingredients": [...],
    "steps": [...],
    "servings": 4,
    "status": "draft"
  }
}`}
              </pre>
            </div>

            {/* Error Codes */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Codes d'erreur</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-foreground">Code</th>
                      <th className="text-left py-2 pr-4 font-medium text-foreground">Erreur</th>
                      <th className="text-left py-2 font-medium text-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4"><code className="bg-destructive/20 text-destructive px-1 rounded">400</code></td>
                      <td className="py-2 pr-4">Bad Request</td>
                      <td className="py-2">Paramètres manquants ou invalides</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4"><code className="bg-destructive/20 text-destructive px-1 rounded">401</code></td>
                      <td className="py-2 pr-4">Unauthorized</td>
                      <td className="py-2">Token invalide ou expiré</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4"><code className="bg-destructive/20 text-destructive px-1 rounded">405</code></td>
                      <td className="py-2 pr-4">Method Not Allowed</td>
                      <td className="py-2">Seule la méthode POST est acceptée</td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4"><code className="bg-destructive/20 text-destructive px-1 rounded">422</code></td>
                      <td className="py-2 pr-4">Unprocessable Entity</td>
                      <td className="py-2">Impossible d'extraire une recette du texte</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4"><code className="bg-destructive/20 text-destructive px-1 rounded">500</code></td>
                      <td className="py-2 pr-4">Internal Error</td>
                      <td className="py-2">Erreur serveur</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Example Error Response */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Exemple de réponse erreur</h4>
              <pre className="bg-muted p-3 rounded-md text-xs text-foreground overflow-x-auto">
{`{
  "success": false,
  "error": "Invalid or missing webhook_token"
}`}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
