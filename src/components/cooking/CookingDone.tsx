import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CookingDoneProps {
  recipeTitle: string;
  onRestart: () => void;
}

export function CookingDone({ recipeTitle, onRestart }: CookingDoneProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 p-8 text-center">
      <div className="flex h-[84px] w-[84px] animate-cook-pop items-center justify-center rounded-full bg-primary/10">
        <Check className="h-10 w-10 text-primary" aria-hidden="true" />
      </div>
      <h2 className="mt-2.5 font-solitreo text-[34px] text-foreground">Bon appétit ! 🌿</h2>
      <p className="m-0 max-w-[260px] font-crimson text-[17px] text-muted-foreground">
        Votre {recipeTitle.toLowerCase()} est prêt. Régalez-vous.
      </p>
      <Button variant="outline" onClick={onRestart} className="mt-4 gap-2 font-crimson font-bold">
        <RotateCcw className="h-[17px] w-[17px]" aria-hidden="true" />
        Recommencer
      </Button>
    </div>
  );
}
