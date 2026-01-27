import { Sun, Moon, Monitor } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTheme } from '@/hooks/useTheme';
import { Skeleton } from '@/components/ui/skeleton';

export function ThemeSelector() {
  const { theme, setTheme, isLoading } = useTheme();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {theme === 'dark' ? (
            <Moon className="h-5 w-5" />
          ) : theme === 'light' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Monitor className="h-5 w-5" />
          )}
          Apparence
        </CardTitle>
        <CardDescription>
          Choisissez le thème de l'application
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleGroup
          type="single"
          value={theme}
          onValueChange={(value) => {
            if (value) setTheme(value as 'light' | 'dark' | 'system');
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="light" aria-label="Mode clair" className="gap-2">
            <Sun className="h-4 w-4" />
            <span>Clair</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Mode sombre" className="gap-2">
            <Moon className="h-4 w-4" />
            <span>Sombre</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="system" aria-label="Système" className="gap-2">
            <Monitor className="h-4 w-4" />
            <span>Système</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </CardContent>
    </Card>
  );
}
