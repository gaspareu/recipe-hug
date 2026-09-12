import { BookOpen, CalendarDays, MessageCircle, UserRound } from 'lucide-react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface AppBookmarkRailProps {
  /** Home calcule sa hauteur depuis le viewport visuel iOS. */
  viewportHeight?: 'app' | 'dynamic';
}

const bookmarks = [
  { label: 'Chef', to: '/home', icon: MessageCircle, matches: ['/home'] },
  { label: 'Livre', to: '/dashboard', icon: BookOpen, matches: ['/dashboard', '/recipes/*'] },
  { label: 'Prévoir', to: '/meal-planning', icon: CalendarDays, matches: ['/meal-planning'] },
  { label: 'Profil', to: '/profile', icon: UserRound, matches: ['/profile'] },
] as const;

export function AppBookmarkRail({ viewportHeight = 'dynamic' }: AppBookmarkRailProps) {
  const location = useLocation();

  return (
    <TooltipProvider>
      <nav
        aria-label="Navigation principale"
        className={cn(
          'fixed right-0 z-30 flex w-[var(--bookmark-rail-width)] flex-col items-end overflow-visible',
          viewportHeight === 'app'
            ? 'top-[var(--app-vh-top,0px)] h-[var(--app-vh,100dvh)]'
            : 'top-0',
        )}
      >
      <div className="flex flex-col gap-2">
        {bookmarks.map(({ label, to, icon: Icon, matches }) => {
          const active = to === '/dashboard'
            ? Boolean(matchPath('/dashboard', location.pathname)) || location.pathname.startsWith('/recipes/')
            : matches.some((pattern) => Boolean(matchPath(pattern, location.pathname)));

          return (
            <Tooltip key={to}>
              <TooltipTrigger asChild>
                <Link
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  aria-label={label}
                  className={cn(
                    'bookmark-rail-link group relative flex h-11 w-11 items-center justify-center border border-r-0 border-[hsl(var(--book-ink)/0.2)] bg-[hsl(var(--book-surface))] text-[hsl(var(--book-ink))] outline-none transition-[color,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-[hsl(var(--book-accent))] focus-visible:ring-offset-2',
                    active
                      ? 'bookmark-rail-link-active h-[104px] flex-col gap-1 rounded-l-md bg-[hsl(var(--book-rail-active))] text-[hsl(var(--book-rail-active-foreground))]'
                      : 'rounded-l-md hover:bg-[hsl(var(--book-organize)/0.22)]',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {active && (
                    <span className="bookmark-rail-label text-xs font-bold tracking-wide">{label}</span>
                  )}
                  {!active && <span className="sr-only">{label}</span>}
                </Link>
              </TooltipTrigger>
              {!active && <TooltipContent side="left">{label}</TooltipContent>}
            </Tooltip>
          );
        })}
      </div>
      </nav>
    </TooltipProvider>
  );
}
