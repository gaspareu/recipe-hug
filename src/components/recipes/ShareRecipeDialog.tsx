import { useState } from 'react';
import { Share2, Mail, Phone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { z } from 'zod';

const emailSchema = z.string().trim().email("Adresse email invalide").max(255);
const phoneSchema = z.string().trim().regex(/^\+?[0-9]{7,15}$/, "Numéro de téléphone invalide");

interface ShareRecipeDialogProps {
  recipeId: string;
  /** Ouverture contrôlée (pour piloter le dialog depuis un menu externe). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Affiche le bouton déclencheur intégré (défaut). Mettre à false en mode contrôlé. */
  showTrigger?: boolean;
}

export function ShareRecipeDialog({ recipeId, open: controlledOpen, onOpenChange, showTrigger = true }: ShareRecipeDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (!isControlled) setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleShare = async () => {
    const schema = tab === 'email' ? emailSchema : phoneSchema;
    const result = schema.safeParse(value);
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Valeur invalide');
      return;
    }
    setValidationError(null);

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('share-recipe', {
        body: {
          recipeId,
          identifier: result.data,
          identifierType: tab,
        },
      });

      if (error) throw error;

      toast.success('Recette partagée !');
      setValue('');
      setOpen(false);
    } catch (err) {
      console.error('Share error:', err);
      toast.error('Erreur lors du partage. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80">
            <Share2 className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Partager la recette</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => { setTab(v as 'email' | 'phone'); setValue(''); setValidationError(null); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />Email
            </TabsTrigger>
            <TabsTrigger value="phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" />Téléphone
            </TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label htmlFor="share-email">Adresse email du destinataire</Label>
              <Input
                id="share-email"
                type="email"
                placeholder="ami@exemple.com"
                value={value}
                onChange={(e) => { setValue(e.target.value); setValidationError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
              />
              {validationError && tab === 'email' && (
                <p className="text-destructive text-sm">{validationError}</p>
              )}
            </div>
          </TabsContent>
          <TabsContent value="phone" className="space-y-3 mt-4">
            <div className="space-y-2">
              <Label htmlFor="share-phone">Numéro de téléphone</Label>
              <Input
                id="share-phone"
                type="tel"
                placeholder="+33612345678"
                value={value}
                onChange={(e) => { setValue(e.target.value); setValidationError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
              />
              {validationError && tab === 'phone' && (
                <p className="text-destructive text-sm">{validationError}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end">
          <Button onClick={handleShare} disabled={loading || !value.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
            Partager
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
