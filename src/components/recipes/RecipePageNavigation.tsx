import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Recipe } from '@/types/recipe';

interface RecipePageNavigationProps {
  previous: Recipe | null;
  next: Recipe | null;
  search: string;
}

function PageLink({ recipe, direction, search }: { recipe: Recipe | null; direction: 'previous' | 'next'; search: string }) {
  const previous = direction === 'previous';
  const label = previous ? 'Recette précédente' : 'Recette suivante';
  const content = <><span className="text-xs uppercase tracking-wide">{label}</span><span className="mt-1 flex items-center gap-1 font-medium">{previous ? <ArrowLeft className="h-4 w-4" aria-hidden="true" /> : null}<span className="truncate">{recipe?.title ?? 'Aucune recette'}</span>{!previous ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}</span></>;

  if (!recipe) return <span aria-disabled="true" className={cn('min-h-11 max-w-[48%] text-sm opacity-45', previous ? 'text-left' : 'text-right')}>{content}</span>;
  return <Link aria-label={`${label} : ${recipe.title}`} to={`/recipes/${recipe.id}${search}`} className={cn('min-h-11 max-w-[48%] rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--book-accent))]', previous ? 'text-left' : 'text-right')}>{content}</Link>;
}

export function RecipePageNavigation({ previous, next, search }: RecipePageNavigationProps) {
  return <nav aria-label="Feuilletage des recettes" className="mt-8 flex items-start justify-between border-t border-[hsl(var(--book-ink)/0.18)] pt-4"><PageLink recipe={previous} direction="previous" search={search} /><PageLink recipe={next} direction="next" search={search} /></nav>;
}
