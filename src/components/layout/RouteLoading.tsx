import { Skeleton } from '@/components/ui/skeleton';

export function RouteLoading({ label }: { label: string }) {
  return (
    <div role="status" className="min-h-dvh bg-background pt-[env(safe-area-inset-top)]">
      <div aria-hidden="true" className="h-16 border-b border-border" />
      <div className="container space-y-5 px-4 py-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Skeleton className="h-8 w-40 motion-reduce:animate-none" />
        <Skeleton className="h-32 w-full max-w-2xl motion-reduce:animate-none" />
      </div>
    </div>
  );
}
