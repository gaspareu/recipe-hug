import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BookPageFrameProps {
  children: ReactNode;
  className?: string;
}

/** Surface éditoriale : la gouttière du rail est déjà réservée par MainLayout. */
export function BookPageFrame({ children, className }: BookPageFrameProps) {
  return (
    <section
      className={cn(
        'book-surface mx-auto w-full max-w-3xl border border-[hsl(var(--book-ink)/0.18)] bg-[hsl(var(--book-surface))] p-4 text-[hsl(var(--book-ink))] sm:p-6',
        className,
      )}
    >
      {children}
    </section>
  );
}
