import { Search, Filter, Leaf, Heart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import type { RecipeStatus } from '@/types/recipe';
const SEASONS = ['printemps', 'été', 'automne', 'hiver', 'toutes saisons'];
interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: RecipeStatus | 'all';
  onStatusFilterChange: (value: RecipeStatus | 'all') => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
  seasonFilter: string;
  onSeasonFilterChange: (value: string) => void;
}
export function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  favoritesOnly,
  onFavoritesOnlyChange,
  seasonFilter,
  onSeasonFilterChange
}: FilterBarProps) {
  const hasActiveFilters = statusFilter !== 'all' || favoritesOnly || seasonFilter !== 'all';
  const clearAllFilters = () => {
    onStatusFilterChange('all');
    onFavoritesOnlyChange(false);
    onSeasonFilterChange('all');
  };
  return <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher une recette..." value={search} onChange={e => onSearchChange(e.target.value)} className="pl-9" />
      </div>

      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={v => onStatusFilterChange(v as RecipeStatus | 'all')}>
          <SelectTrigger className="flex-1 min-w-0">
            <Filter className="mr-1.5 h-4 w-4 shrink-0" />
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

        <Select value={seasonFilter} onValueChange={onSeasonFilterChange}>
          <SelectTrigger className="flex-1 min-w-0">
            <Leaf className="mr-1.5 h-4 w-4 shrink-0" />
            <SelectValue placeholder="Saison" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            {SEASONS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        
        <Toggle pressed={favoritesOnly} onPressedChange={onFavoritesOnlyChange} aria-label="Favoris uniquement" className="shrink-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          <Heart className="h-4 w-4" />
        </Toggle>

        {hasActiveFilters && <Badge variant="secondary" className="shrink-0 cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={clearAllFilters}>
            ✕
          </Badge>}
      </div>
    </div>;
}