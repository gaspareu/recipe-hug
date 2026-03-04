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
}

export function ShareRecipeDialog({ recipeId }: ShareRecipeDialogProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'email' | 'phone'>('email');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    const schema = tab === 'email' ? emailSchema : phoneSchema;
    const result = schema.safeParse(value);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('share-recipe', {
        body: {
          recipeId,
          identifier: result.data,
          identifierType: tab,
        },
      });

      if (error) throw error;

      if (data.status === 'claimed') {
        toast.success('Recette envoyée avec succès !');
      } else {
        toast.success('Partage enregistré. La recette sera ajoutée quand le destinataire créera son compte.');
      }
      setValue('');
      setOpen(false);
    } catch (err) {
      console.error('Share error:', err);
      toast.error('Impossible de partager la recette');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 bg-background/60 backdrop-blur-sm hover:bg-background/80">
          <Share2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Partager la recette</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => { setTab(v as 'email' | 'phone'); setValue(''); }}>
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
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
              />
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
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleShare()}
              />
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
