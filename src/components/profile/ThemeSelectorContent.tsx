import { Sun, Moon, Monitor } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTheme } from '@/hooks/useTheme';
import { Skeleton } from '@/components/ui/skeleton';

export function ThemeSelectorContent() {
  const { theme, setTheme, isLoading } = useTheme();

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
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
  );
}
