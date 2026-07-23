import { ReactNode } from 'react';
import { Header } from './Header';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Le safe-area-inset-top est porté par le <header> sticky lui-même
          (cf. Header.tsx) pour qu'il reste sous la barre de statut iOS une fois
          collé en haut. Ici on ne gère que le bas. */}
      <div className="pb-[env(safe-area-inset-bottom)]">
        <Header />
        <main className="container px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
