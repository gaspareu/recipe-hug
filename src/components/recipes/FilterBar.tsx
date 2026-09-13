import { Filter, Heart, Leaf, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Toggle } from '@/components/ui/toggle';
import { BOOK_SEASONS, type RecipeBookSort } from '@/lib/recipe-book-filters';
import type { RecipeStatus } from '@/types/recipe';

const SEASON_LABELS: Record<(typeof BOOK_SEASONS)[number], string> = {
  printemps: 'Printemps',
  été: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
};

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: RecipeStatus | 'all';
  onStatusFilterChange: (value: RecipeStatus | 'all') => void;
  favoritesOnly: boolean;
  onFavoritesOnlyChange: (value: boolean) => void;
  seasonFilter: string;
  onSeasonFilterChange: (value: string) => void;
  sortBy?: RecipeBookSort;
  onSortByChange?: (value: RecipeBookSort) => void;
  onShowAll: () => void;
  onClearAll: () => void;
}

interface SecondaryControlsProps {
  statusFilter: RecipeStatus | 'all';
  onStatusFilterChange: (value: RecipeStatus | 'all') => void;
  sortBy: RecipeBookSort;
  onSortByChange: (value: RecipeBookSort) => void;
}

function SecondaryControls({ statusFilter, onStatusFilterChange, sortBy, onSortByChange }: SecondaryControlsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="recipe-status-filter">Statut</label>
        <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as RecipeStatus | 'all')}>
          <SelectTrigger id="recipe-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="tested">Testé</SelectItem>
            <SelectItem value="validated">Validé</SelectItem>
            <SelectItem value="archived">Archivé</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="recipe-sort">Ordre</label>
        <Select value={sortBy} onValueChange={(value) => onSortByChange(value as RecipeBookSort)}>
          <SelectTrigger id="recipe-sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Plus récentes</SelectItem>
            <SelectItem value="alpha">A à Z</SelectItem>
            <SelectItem value="favorites">Favoris en tête</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function FilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  favoritesOnly,
  onFavoritesOnlyChange,
  seasonFilter,
  onSeasonFilterChange,
  sortBy = 'recent',
  onSortByChange = () => undefined,
  onShowAll,
  onClearAll,
}: FilterBarProps) {
  const hasActiveFacets = statusFilter !== 'all' || favoritesOnly || seasonFilter !== 'all';
  const activeControlCount = Number(statusFilter !== 'all')
    + Number(favoritesOnly)
    + Number(seasonFilter !== 'all')
    + Number(sortBy !== 'recent');
  const hasActiveFilters = activeControlCount > 0 || search !== '';
  const secondary = <SecondaryControls {...{ statusFilter, onStatusFilterChange, sortBy, onSortByChange }} />;

  return (
    <div className="space-y-3" aria-label="Filtres du livre">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          aria-label="Rechercher une recette"
          placeholder="Rechercher une recette..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="border-[hsl(var(--book-ink)/0.25)] bg-transparent pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={hasActiveFacets ? 'outline' : 'secondary'}
          size="sm"
          onClick={onShowAll}
          aria-pressed={!hasActiveFacets}
        >
          Toutes
        </Button>
        <Select value={seasonFilter} onValueChange={onSeasonFilterChange}>
          <SelectTrigger className="h-9 w-auto min-w-32" aria-label="Saison">
            <Leaf className="mr-1.5 h-4 w-4" aria-hidden="true" />
            <SelectValue placeholder="Saison" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Saison : toutes</SelectItem>
            {BOOK_SEASONS.map((season) => <SelectItem key={season} value={season}>{SEASON_LABELS[season]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Toggle pressed={favoritesOnly} onPressedChange={onFavoritesOnlyChange} aria-label="Favoris uniquement" className="h-9 gap-1.5 px-3 data-[state=on]:bg-[hsl(var(--book-bookmark))] data-[state=on]:text-[hsl(var(--book-bookmark-foreground))]">
          <Heart className="h-4 w-4" aria-hidden="true" /> Favoris
        </Toggle>

        <div className="sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-label="Filtres et tri">
                <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Filtres et tri{activeControlCount > 0 ? ` (${activeControlCount})` : ''}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader><SheetTitle>Filtres et tri</SheetTitle></SheetHeader>
              <div className="mt-6">{secondary}</div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden sm:block">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" aria-label="Filtres et tri">
                <Filter className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Filtres et tri{activeControlCount > 0 ? ` (${activeControlCount})` : ''}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end">{secondary}</PopoverContent>
          </Popover>
        </div>

        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={onClearAll} aria-label="Réinitialiser les filtres">
            ✕ <span className="sr-only">Réinitialiser les filtres</span>
          </Button>
        )}
      </div>
    </div>
  );
}
