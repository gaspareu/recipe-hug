import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useProfile } from '@/hooks/useProfile';

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-20 w-full border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4 pr-[calc(var(--bookmark-rail-width,0px)+env(safe-area-inset-right)+1rem)]">
        <div className="flex items-center gap-2" aria-label="Grimoire">
          <img src="/brand/recipe-book-logo.png" alt="Grimoire" className="mt-0.5 h-8 w-8 object-contain" />
          <span className="text-lg font-bold text-foreground">Grimoire</span>
        </div>
        {user && <ProfileMenu user={user} signOut={signOut} />}
      </div>
    </header>
  );
}

function ProfileMenu({ user, signOut }: { user: NonNullable<ReturnType<typeof useAuth>['user']>; signOut: () => Promise<void> }) {
  const { data: profile } = useProfile(user.id);

  const getInitials = () => {
    if (profile?.display_name) {
      return profile.display_name.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatar_url || undefined} alt="Avatar" />
                  <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  {profile?.display_name && (
                    <p className="font-medium text-foreground">{profile.display_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuContent>
    </DropdownMenu>
  );
}
