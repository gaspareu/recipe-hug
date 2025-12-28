import { Search, Star, Filter, Leaf, Camera, Sparkles, PenLine } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Toggle } from '@/components/ui/toggle';
import type { RecipeStatus } from '@/types/recipe';

const AVAILABLE_TAGS = [
  'protéines', 'fibres', 'léger', 'végétarien', 'végan', 
  'sans gluten', 'sans lactose', 'vitamines', 'fer', 
  'oméga-3', 'énergétique', 'réconfortant'
];

const SEASONS = ['printemps', 'été', 'automne', 'hiver', 'toutes saisons'];

const SOURCES = [
  { value: 'manual', label: 'Manuel', icon: PenLine },
  { value: 'image', label: 'Image', icon: Camera },
  { value: 'ai', label: 'IA', icon: Sparkles },
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
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
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
  sourceFilter,
  onSourceFilterChange,
  tagFilter,
  onTagFilterChange,
}: FilterBarProps) {
  const hasActiveFilters = statusFilter !== 'all' || favoritesOnly || seasonFilter !== 'all' || sourceFilter !== 'all' || tagFilter !== 'all';

  const clearAllFilters = () => {
    onStatusFilterChange('all');
    onFavoritesOnlyChange(false);
    onSeasonFilterChange('all');
    onSourceFilterChange('all');
    onTagFilterChange('all');
  };

  return (
    <div className="space-y-3">
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
            <SelectTrigger className="w-[130px]">
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

      <div className="flex flex-wrap items-center gap-2">
        <Select value={seasonFilter} onValueChange={onSeasonFilterChange}>
          <SelectTrigger className="w-[150px]">
            <Leaf className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Saison" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes saisons</SelectItem>
            {SEASONS.map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={onSourceFilterChange}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes sources</SelectItem>
            {SOURCES.map(s => (
              <SelectItem key={s.value} value={s.value}>
                <span className="flex items-center gap-2">
                  <s.icon className="h-4 w-4" />
                  {s.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tagFilter} onValueChange={onTagFilterChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tag nutritionnel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les tags</SelectItem>
            {AVAILABLE_TAGS.map(tag => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Badge 
            variant="secondary" 
            className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
            onClick={clearAllFilters}
          >
            Réinitialiser filtres
          </Badge>
        )}
      </div>
    </div>
  );
}