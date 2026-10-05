import { Link } from 'react-router-dom';
import { usePairingProfile } from '@/hooks/usePairings';
import type { Recipe } from '@/types/recipe';

const roleLabels: Record<string, string> = {
  base: 'Base', accompagnement: 'Accompagnement', sauce: 'Sauce',
  garniture: 'Garniture', entree: 'Entrée', dessert: 'Dessert',
};

export function RecipeIdentity({ recipe }: { recipe: Recipe }) {
  const { data: profile } = usePairingProfile(recipe.entry_kind ? recipe.id : '');
  const roles = recipe.entry_kind === 'preparation'
    ? (profile?.roles ?? []).map(role => roleLabels[role]).filter(Boolean) : [];
  return <p className="text-sm font-medium text-primary">
    {recipe.entry_kind === 'preparation' ? 'Préparation' : recipe.entry_kind === 'complete_dish' ? 'Plat complet' : 'À classer'}
    {roles.length > 0 && ` · ${roles.join(' · ')}`}
    {!recipe.entry_kind && <> · <Link className="inline-flex min-h-11 items-center underline underline-offset-4" to={`/recipes/${recipe.id}/edit`}>Classer cette fiche</Link></>}
  </p>;
}
