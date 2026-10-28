import { useState } from 'react';
import { Loader2, CookingPot } from 'lucide-react';
import { useCookidooClock } from '@/hooks/useCookidooClock';

export function CookidooActivity({ sending, verifying, startedAt }: { sending: boolean; verifying: boolean; startedAt?: string }) {
  const [openedAt] = useState(Date.now);
  const now = useCookidooClock(true);
  const start = startedAt ? Date.parse(startedAt) : openedAt;
  const seconds = Math.max(0, Math.floor((now - (Number.isFinite(start) ? start : openedAt)) / 1000));
  return <div className="rounded-xl border border-primary/20 bg-primary/5 p-5" role="status" aria-live="polite">
    <div className="flex items-center gap-4">
      <div className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-background text-primary">
        <CookingPot className="size-6 motion-safe:animate-pulse" aria-hidden="true" />
        <Loader2 className="absolute -inset-1 size-14 motion-safe:animate-spin motion-reduce:hidden opacity-40" aria-hidden="true" />
      </div>
      <div><p className="font-medium">{verifying ? 'Vérification sur Cookidoo…' : sending ? 'Envoi vers Cookidoo…' : 'Adaptation pour votre TM7…'}</p>
        <p className="mt-1 text-muted-foreground">{sending ? 'Nous attendons la confirmation de Cookidoo.' : 'Les ingrédients et les étapes sont adaptés aux commandes du TM7.'}</p></div>
    </div>
    <p className="mt-4 text-muted-foreground">{seconds >= 45 ? 'Cela prend un peu plus de temps. Vous pouvez fermer cette fenêtre et revenir consulter le résultat.' : 'Vous pouvez fermer cette fenêtre : le travail continue et vous retrouverez le résultat ici.'}</p>
    <p className="mt-2 text-xs tabular-nums text-muted-foreground" aria-live="off">Temps écoulé : {Math.floor(seconds / 60)} min {seconds % 60} s</p>
  </div>;
}
