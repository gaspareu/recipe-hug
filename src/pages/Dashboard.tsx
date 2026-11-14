import { useId, useMemo, useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageGallery } from '@/components/ui/image-gallery';
import { FilterBar } from '@/components/recipes/FilterBar';
import { FilterBadge } from '@/components/ui/filter-badge';
import { useRecipeCards } from '@/hooks/useRecipeCards';
import { QueryError } from '@/components/ui/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { useToggleFavorite } from '@/hooks/useRecipes';
import { useCompositions } from '@/hooks/useCompositions';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import type { RecipeStatus } from '@/types/recipe';

const STATUS_LABELS: Record<RecipeStatus, string> = {
  draft: 'Brouillon',
  tested: 'Testé',
  validated: 'Validé',
  archived: 'Archivé',
};

const SEASON_LABELS: Record<string, string> = {
  printemps: 'Printemps',
  été: 'Été',
  automne: 'Automne',
  hiver: 'Hiver',
};

export default function Dashboard() {
  const sortValueId = useId();
  // Swipe right to navigate back to chat
  const { handlers: swipeHandlers, style: swipeStyle } = useSwipeNavigation({
    targetRoute: '/',
    direction: 'right',
    threshold: 80,
  });
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const restored = useRef(false);
  const scrollKey = `grimoire-livre:${location.key}`;
  const setParam = (key: string, value: string, defaultValue = '') => {
    const next = new URLSearchParams(params);
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const search = params.get('q') ?? '';
  const status = params.get('status');
  const statusFilter = status && Object.hasOwn(STATUS_LABELS, status) ? status as RecipeStatus : 'all';
  const favoritesOnly = params.get('favoris') === '1';
  const season = params.get('saison');
  const seasonFilter = season && Object.hasOwn(SEASON_LABELS, season) ? season : 'all';
  const sort = params.get('tri');
  const sortBy = sort === 'alpha' || sort === 'favorites' ? sort : 'recent';
  const tab = params.get('section');
  const section = tab === 'dishes' || tab === 'menus' || tab === 'unclassified' ? tab : 'preparations';
  const setSearch = (value: string) => setParam('q', value);
  const setStatusFilter = (value: string) => setParam('status', value, 'all');
  const setFavoritesOnly = (value: boolean) => setParam('favoris', value ? '1' : '');
  const setSeasonFilter = (value: string) => setParam('saison', value, 'all');

  const showRecipes = section !== 'menus';
  const showCompositions = section === 'menus' || section === 'dishes';
  const recipes = useRecipeCards({
    search,
    entryKind: section === 'preparations' ? 'preparation' : section === 'dishes' ? 'complete_dish' : null,
    status: statusFilter === 'all' ? undefined : statusFilter,
    season: seasonFilter === 'all' ? undefined : seasonFilter,
    favoritesOnly,
    sort: sortBy,
  }, showRecipes);
  const compositionQuery = useCompositions(showCompositions);
  const { data: compositions = [] } = compositionQuery;
  const toggleFavorite = useToggleFavorite();
  const filteredRecipes = useMemo(() =>
    [...new Map(recipes.data?.pages.flatMap(page => page.rows).map(recipe => [recipe.id, recipe])).values()],
  [recipes.data]);

  const loading = (showRecipes && (recipes.isPending || recipes.isSearchPending)) ||
    (showCompositions && compositionQuery.isPending);
  const failed = (showRecipes && recipes.isError) || (showCompositions && compositionQuery.isError);

  useLayoutEffect(() => {
    if (loading || navigationType !== 'POP' || restored.current) return;
    const saved = sessionStorage.getItem(scrollKey);
    if (saved === null) return;
    const frame = requestAnimationFrame(() => {
      restored.current = true;
      sessionStorage.removeItem(scrollKey);
      window.scrollTo(0, Number(saved));
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, navigationType, scrollKey]);

  const rememberPosition = () => sessionStorage.setItem(scrollKey, String(window.scrollY));

  const visibleCompositions = useMemo(() => compositions.filter(composition =>
    composition.kind === (section === 'menus' ? 'menu' : 'dish') &&
    (section === 'menus' || section === 'dishes') &&
    composition.title.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr')),
  ), [compositions, section, search]);

  const handleToggleFavorite = (id: string, isFavorite: boolean) => {
    toggleFavorite.mutate({ id, is_favorite: isFavorite });
  };

  const hasActiveFilters = search || (showRecipes && (statusFilter !== 'all' || favoritesOnly || seasonFilter !== 'all'));

  return (
    <MainLayout>
      <div
        className="space-y-4"
        {...swipeHandlers}
        style={swipeStyle}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-solitreo font-bold text-foreground">Le Livre</h1>
            <p className="text-muted-foreground">
              Préparations, plats et menus à composer
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showRecipes && <Select value={sortBy} onValueChange={v => setParam('tri', v, 'recent')}>
              <SelectTrigger aria-label="Trier les recettes" aria-describedby={sortValueId} className="w-auto text-sm h-11">
                <SelectValue id={sortValueId} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Plus récentes</SelectItem>
                <SelectItem value="alpha">A-Z</SelectItem>
                <SelectItem value="favorites">Favoris en tête</SelectItem>
              </SelectContent>
            </Select>}
            <Button asChild className="h-11">
              <Link to="/recipes/new">
                <Plus className="mr-2 h-4 w-4" />
                Nouvelle
              </Link>
            </Button>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Sections du Livre">
          {([
            ['preparations', 'Préparations'], ['dishes', 'Plats'], ['menus', 'Menus'], ['unclassified', 'À classer'],
          ] as const).map(([key, label]) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} onClick={() => setParam('section', key, 'preparations')}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${section === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{label}</button>)}
        </nav>
        {(section === 'dishes' || section === 'menus') && <Button asChild variant="outline" className="min-h-11"><Link to={`/compositions/new?kind=${section === 'menus' ? 'menu' : 'dish'}`}><Plus className="mr-2 h-4 w-4" /> {section === 'menus' ? 'Créer un menu' : 'Composer un plat'}</Link></Button>}

        {showRecipes ? <FilterBar
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          favoritesOnly={favoritesOnly}
          onFavoritesOnlyChange={setFavoritesOnly}
          seasonFilter={seasonFilter}
          onSeasonFilterChange={setSeasonFilter}
        /> : <Input type="search" aria-label="Rechercher un menu" placeholder="Rechercher un menu…" value={search} onChange={event => setSearch(event.target.value)} />}

        {/* Active Filters Display */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {search && (
              <FilterBadge
                variant="pill"
                label="Recherche"
                value={search}
                onRemove={() => setSearch('')}
              />
            )}
            {showRecipes && statusFilter !== 'all' && (
              <FilterBadge
                variant="pill"
                label="Statut"
                value={STATUS_LABELS[statusFilter]}
                onRemove={() => setStatusFilter('all')}
              />
            )}
            {showRecipes && seasonFilter !== 'all' && (
              <FilterBadge
                variant="pill"
                label="Saison"
                value={SEASON_LABELS[seasonFilter]}
                onRemove={() => setSeasonFilter('all')}
              />
            )}
            {showRecipes && favoritesOnly && (
              <FilterBadge
                variant="pill"
                label="Favoris"
                value="Oui"
                onRemove={() => setFavoritesOnly(false)}
              />
            )}
          </div>
        )}

        {visibleCompositions.length > 0 && <section className="space-y-2" aria-label={section === 'menus' ? 'Menus enregistrés' : 'Plats composés'}>
          <h2 className="font-solitreo text-xl">{section === 'menus' ? 'Menus enregistrés' : 'Plats composés'}</h2>
          <div className="grid gap-2 sm:grid-cols-2">{visibleCompositions.map(composition => <Link key={composition.id} to={`/compositions/${composition.id}`} state={{ fromBook: true }} onClick={rememberPosition} className="block rounded-2xl border border-border bg-card p-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">{composition.kind === 'menu' ? 'Menu' : 'Plat composé'}</span>
            <h3 className="font-solitreo text-xl">{composition.title}</h3>
            <p className="text-sm text-muted-foreground">{composition.items.length} élément{composition.items.length > 1 ? 's' : ''}</p>
          </Link>)}</div>
        </section>}

        {showCompositions && compositionQuery.isError && (
          <QueryError message="Impossible de charger les compositions." onRetry={() => void compositionQuery.refetch()} retrying={compositionQuery.isFetching} />
        )}
        {showRecipes && recipes.isError && !recipes.isFetchNextPageError && (
          <QueryError message="Impossible de charger les recettes." onRetry={() => void recipes.refetch()} retrying={recipes.isFetching} />
        )}
        {loading && (
          <div role="status" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4">
            <span className="sr-only">Chargement du Livre…</span>
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        )}
        {!loading && !failed && filteredRecipes.length === 0 && visibleCompositions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <BookOpen aria-hidden="true" className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="font-solitreo text-lg font-semibold text-foreground">
              {hasActiveFilters ? 'Aucun résultat' : 'Cette section est vide'}
            </h2>
            {hasActiveFilters && <p className="mt-1 text-sm text-muted-foreground">Modifiez la recherche ou les filtres.</p>}
          </div>
        )}
        {showRecipes && !recipes.isSearchPending && filteredRecipes.length > 0 && (
          <ImageGallery
            items={filteredRecipes.map(recipe => ({
              id: recipe.id,
              title: recipe.title,
              imageUrl: recipe.source_image_url,
              isFavorite: recipe.is_favorite ?? false,
            }))}
            onOpen={rememberPosition}
            onToggleFavorite={handleToggleFavorite}
            isTogglingFavorite={toggleFavorite.isPending}
          />
        )}
        {showRecipes && !recipes.isSearchPending && recipes.hasNextPage && (
          recipes.isFetchNextPageError ? (
            <QueryError message="Impossible de charger les recettes suivantes." onRetry={() => void recipes.fetchNextPage()} retrying={recipes.isFetching} />
          ) : (
            <div className="flex justify-center">
              <Button type="button" variant="outline" className="min-h-11" disabled={recipes.isFetching} onClick={() => void recipes.fetchNextPage()}>
                {recipes.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de recettes'}
              </Button>
            </div>
          )
        )}
      </div>
    </MainLayout>
  );
}
