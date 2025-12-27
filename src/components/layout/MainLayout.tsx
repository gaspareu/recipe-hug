import { ReactNode } from 'react';
import { Header } from './Header';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Safe area padding pour iOS */}
      <div className="pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        <Header />
        <main className="container px-4 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
