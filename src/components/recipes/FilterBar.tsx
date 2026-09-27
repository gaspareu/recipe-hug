import { useId } from 'react';
import { Search, Filter, Leaf, Heart, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import type { RecipeStatus } from '@/types/recipe';
const SEASONS = [
  { value: 'printemps', label: 'Printemps' },
  { value: 'été', label: 'Été' },
  { value: 'automne', label: 'Automne' },
  { value: 'hiver', label: 'Hiver' }
];
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
  const statusValueId = useId();
  const seasonValueId = useId();
  const hasActiveFilters = statusFilter !== 'all' || favoritesOnly || seasonFilter !== 'all' || search !== '';
  const clearAllFilters = () => {
    onStatusFilterChange('all');
    onFavoritesOnlyChange(false);
    onSeasonFilterChange('all');
    onSearchChange('');
  };
  return <div className="space-y-3">
      <div className="relative">
        <Label htmlFor="recipe-search" className="sr-only">Rechercher une recette</Label>
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input id="recipe-search" placeholder="Rechercher une recette..." value={search} onChange={e => onSearchChange(e.target.value)} className="h-11 pl-9" />
      </div>

      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={v => onStatusFilterChange(v as RecipeStatus | 'all')}>
          <SelectTrigger aria-label="Filtrer par statut" aria-describedby={statusValueId} className="flex-1 min-w-0 h-11">
            <Filter className="mr-1.5 h-4 w-4 shrink-0" />
            <SelectValue id={statusValueId} placeholder="Statut" />
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
          <SelectTrigger aria-label="Filtrer par saison" aria-describedby={seasonValueId} className="flex-1 min-w-0 h-11">
            <Leaf className="mr-1.5 h-4 w-4 shrink-0" />
            <SelectValue id={seasonValueId} placeholder="Saison" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            {SEASONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Toggle pressed={favoritesOnly} onPressedChange={onFavoritesOnlyChange} aria-label="Favoris uniquement" className="shrink-0 h-11 w-11 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          <Heart className="h-4 w-4" />
        </Toggle>

        {hasActiveFilters && (
          <Button type="button" variant="secondary" size="icon" className="shrink-0 h-11 w-11" onClick={clearAllFilters} aria-label="Effacer tous les filtres">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>;
}
