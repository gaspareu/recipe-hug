import { ReactNode } from 'react';
import { Header } from './Header';
import { AppBookmarkRail } from './AppBookmarkRail';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-[100dvh] bg-background [--bookmark-rail-width:44px]">
      {/* Le safe-area-inset-top est porté par le <header> sticky lui-même
          (cf. Header.tsx) pour qu'il reste sous la barre de statut iOS une fois
          collé en haut. Ici on ne gère que le bas. */}
      <div className="pb-[env(safe-area-inset-bottom)]">
        <Header />
        <main className="container px-4 pr-[calc(var(--bookmark-rail-width)+env(safe-area-inset-right)+1rem)] py-6 sm:pr-[calc(var(--bookmark-rail-width)+env(safe-area-inset-right)+1.5rem)]">
          {children}
        </main>
      </div>
      <AppBookmarkRail />
    </div>
  );
}
