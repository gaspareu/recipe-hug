import { useState } from 'react';
import { Loader2, Trash2, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCookidooConnector } from '@/hooks/useCookidooConnector';

// Pays Cookidoo supportés (mappés vers une locale côté serveur).
const COUNTRIES = [
  { value: 'fr', label: 'France' },
  { value: 'be', label: 'Belgique' },
  { value: 'ch', label: 'Suisse' },
  { value: 'de', label: 'Allemagne' },
  { value: 'it', label: 'Italie' },
  { value: 'es', label: 'Espagne' },
  { value: 'pt', label: 'Portugal' },
  { value: 'nl', label: 'Pays-Bas' },
  { value: 'gb', label: 'Royaume-Uni' },
  { value: 'at', label: 'Autriche' },
  { value: 'au', label: 'Australie' },
];

export function CookidooSettingsContent() {
  const { status, saveCredentials, deleteCredentials } = useCookidooConnector();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('fr');

  const configured = status.data?.configured;

  const handleSave = async () => {
    if (!email.trim() || !password) {
      toast.error('Email et mot de passe requis');
      return;
    }
    try {
      await saveCredentials.mutateAsync({ email: email.trim(), password, country });
      setPassword('');
      setEmail('');
      toast.success('Identifiants Cookidoo enregistrés');
    } catch (err) {
      toast.error("Échec de l'enregistrement", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteCredentials.mutateAsync();
      toast.success('Identifiants Cookidoo supprimés');
    } catch (err) {
      toast.error('Échec de la suppression', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connectez votre compte Cookidoo pour envoyer vos recettes vers votre Thermomix.
        Le mot de passe est chiffré côté serveur et n'est jamais réaffiché.
      </p>

      {status.isLoading ? (
        <div className="h-10 animate-pulse bg-muted rounded-md" />
      ) : configured ? (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>
              Connecté&nbsp;: <span className="font-mono">{status.data?.email_masked}</span>
              {status.data?.country && (
                <span className="text-muted-foreground"> ({status.data.country.toUpperCase()})</span>
              )}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={deleteCredentials.isPending}
            title="Supprimer les identifiants"
          >
            {deleteCredentials.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="cookidoo-email">Email Cookidoo</Label>
          <Input
            id="cookidoo-email"
            type="email"
            autoComplete="off"
            placeholder={configured ? 'Modifier l’email…' : 'vous@exemple.com'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cookidoo-password">Mot de passe Cookidoo</Label>
          <Input
            id="cookidoo-password"
            type="password"
            autoComplete="new-password"
            placeholder={configured ? 'Modifier le mot de passe…' : '••••••••'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cookidoo-country">Pays du compte</Label>
          <select
            id="cookidoo-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={handleSave} disabled={saveCredentials.isPending} className="w-full">
          {saveCredentials.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enregistrement…
            </>
          ) : (
            configured ? 'Mettre à jour les identifiants' : 'Connecter mon compte Cookidoo'
          )}
        </Button>
        <p className="text-xs text-muted-foreground">
          Astuce&nbsp;: si l'envoi échoue avec « accès bloqué », Cookidoo filtre les serveurs.
          Le connecteur en ligne de commande (dossier <code>connector/cookidoo</code>) reste utilisable depuis votre machine.
        </p>
      </div>
    </div>
  );
}
