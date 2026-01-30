import { useState } from "react";
import { Copy, RefreshCw, Webhook, ChevronDown, ChevronUp, ExternalLink, BookOpen, Zap, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useWebhookToken } from "@/hooks/useWebhookToken";
import { toast } from "sonner";

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

  const downloadShortcutGuide = () => {
    if (!webhookToken) {
      toast.error("Générez d'abord un token");
      return;
    }

    const guideContent = `# 📱 Guide : Raccourci iOS "Ajouter une Recette"

## Configuration rapide

**URL du Webhook:** ${webhookUrl}
**Votre Token:** ${webhookToken}

---

## 🛠️ Création du Raccourci (étape par étape)

### 1. Ouvrir l'app Raccourcis
Lancez l'application "Raccourcis" sur votre iPhone/iPad.

### 2. Créer un nouveau raccourci
Appuyez sur le "+" en haut à droite.

### 3. Ajouter l'action "Obtenir le contenu de l'URL"
- Recherchez "URL" dans la barre de recherche
- Sélectionnez "Obtenir le contenu de l'URL"

### 4. Configurer la requête

**URL:** ${webhookUrl}

**Méthode:** POST

**En-têtes:**
| Clé | Valeur |
|-----|--------|
| Content-Type | application/json |

**Corps de la requête:** JSON
\`\`\`json
{
  "text": "[Variable: Entrée du raccourci]",
  "webhook_token": "${webhookToken}"
}
\`\`\`

### 5. Configurer l'entrée
- Appuyez sur "Entrée du raccourci" en haut
- Activez "Afficher dans la feuille de partage"
- Sélectionnez les types : Texte, URL, Safari

### 6. Ajouter une notification (optionnel)
- Ajoutez l'action "Afficher la notification"
- Message : "Recette ajoutée ! 🎉"

### 7. Nommer et sauvegarder
- Appuyez sur le nom en haut
- Nommez-le "Ajouter Recette"
- Choisissez une icône (ex: 🍽️)

---

## 🚀 Utilisation

1. Ouvrez Safari sur une page de recette
2. Appuyez sur le bouton Partager
3. Sélectionnez "Ajouter Recette"
4. La recette sera automatiquement importée !

---

## ⚠️ Important

- Ne partagez JAMAIS votre token
- Si compromis, régénérez-le depuis l'app

---

Généré le ${new Date().toLocaleDateString('fr-FR')}
`;

    const blob = new Blob([guideContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guide-raccourci-recette.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Guide téléchargé", {
      description: "Ouvrez le fichier pour suivre les instructions"
    });
  };

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
                <Smartphone className="h-3 w-3" />
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
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Utilisez l'action "Obtenir le contenu de l'URL" avec la méthode POST.
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={downloadShortcutGuide}
                  className="w-full"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger le guide complet
                </Button>
              </div>
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
