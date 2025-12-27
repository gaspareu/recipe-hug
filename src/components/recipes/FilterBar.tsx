import { Search, Star, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import type { RecipeStatus } from '@/types/recipe';

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: RecipeStatus | 'all';
  onStatusFilterChange: (value: RecipeStatus | 'all') => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
}

export function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher une recette..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>
      
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as RecipeStatus | 'all')}>
          <SelectTrigger className="w-[140px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="tested">Testé</SelectItem>
            <SelectItem value="validated">Validé</SelectItem>
            <SelectItem value="archived">Archivé</SelectItem>
          </SelectContent>
        </Select>
        
        <Toggle
          pressed={favoritesOnly}
          onPressedChange={onFavoritesOnlyChange}
          aria-label="Favoris uniquement"
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Star className="h-4 w-4" />
        </Toggle>
      </div>
    </div>
  );
}
