import { Button } from '@/components/ui/button';

export function QueryError({ message, onRetry, retrying }: {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
      <p role="alert" className="text-sm text-foreground">{message}</p>
      <Button type="button" variant="outline" className="min-h-11" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Nouvelle tentative…' : 'Réessayer'}
      </Button>
    </div>
  );
}
