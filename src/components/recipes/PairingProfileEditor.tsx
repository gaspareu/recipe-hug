import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePairingProfile, useSavePairingProfile } from '@/hooks/usePairings';
import { toast } from '@/components/ui/sonner';
import type { PairingProfile } from '@/types/livre';

type EditableProfile = Omit<PairingProfile, 'user_id' | 'updated_at'>;
const emptyProfile = (recipeId: string): EditableProfile => ({
  recipe_id: recipeId, roles: [], flavors: [], textures: [], equipment: [], allergens: [],
  allergen_review_state: 'unknown', dietary_compatibilities: [], dietary_exclusions: [],
  dietary_review_state: 'unknown', active_minutes: null, make_ahead: false,
});
const roles = [
  ['base', 'Base'], ['accompagnement', 'Accompagnement'], ['sauce', 'Sauce'],
  ['garniture', 'Garniture'], ['entree', 'Entrée'], ['dessert', 'Dessert'],
] as const;
const parseList = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);

export function PairingProfileEditor({ recipeId }: { recipeId: string }) {
  const { data: saved } = usePairingProfile(recipeId);
  const save = useSavePairingProfile();
  const [profile, setProfile] = useState<EditableProfile>(() => emptyProfile(recipeId));
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- profil distant vers formulaire éditable */
    setProfile(saved ? {
      recipe_id: saved.recipe_id, roles: saved.roles, flavors: saved.flavors,
      textures: saved.textures, equipment: saved.equipment, allergens: saved.allergens,
      allergen_review_state: saved.allergen_review_state,
      dietary_compatibilities: saved.dietary_compatibilities,
      dietary_exclusions: saved.dietary_exclusions,
      dietary_review_state: saved.dietary_review_state,
      active_minutes: saved.active_minutes, make_ahead: saved.make_ahead,
    } : emptyProfile(recipeId));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [saved, recipeId]);
  const setList = (key: 'flavors' | 'textures' | 'equipment' | 'allergens' | 'dietary_compatibilities' | 'dietary_exclusions', value: string) =>
    setProfile(current => ({ ...current, [key]: parseList(value) }));
  const handleSave = async () => {
    try { await save.mutateAsync(profile); toast('Profil d’accord enregistré'); }
    catch { toast('Impossible d’enregistrer le profil d’accord'); }
  };
  return <details className="rounded-2xl border border-border bg-card p-4">
    <summary className="min-h-11 cursor-pointer font-solitreo text-xl">Décrire cette fiche pour les accords</summary>
    <div className="space-y-4 pt-4">
      <fieldset className="space-y-2"><legend className="text-sm font-semibold">Rôles culinaires</legend><div className="flex flex-wrap gap-3">{roles.map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={profile.roles.includes(key)} onChange={event => setProfile(current => ({ ...current, roles: event.target.checked ? [...current.roles, key] : current.roles.filter(role => role !== key) }))} />{label}</label>)}</div></fieldset>
      {([
        ['flavors', 'Saveurs dominantes', 'acidulé, épicé…'],
        ['textures', 'Textures', 'croquant, crémeux…'],
        ['equipment', 'Équipement nécessaire', 'four, robot…'],
        ['allergens', 'Allergènes présents', 'lait, arachide…'],
        ['dietary_compatibilities', 'Régimes compatibles', 'végétarien…'],
        ['dietary_exclusions', 'Régimes incompatibles', 'végan…'],
      ] as const).map(([key, label, placeholder]) => <div key={key} className="space-y-1"><Label htmlFor={`profile-${key}`}>{label}</Label><Input id={`profile-${key}`} defaultValue={profile[key].join(', ')} key={`${recipeId}-${key}-${saved?.updated_at ?? 'new'}`} placeholder={placeholder} onChange={event => setList(key, event.target.value)} /></div>)}
      <div className="space-y-1"><Label htmlFor="profile-active-minutes">Temps actif (minutes)</Label><Input id="profile-active-minutes" type="number" min={0} value={profile.active_minutes ?? ''} onChange={event => setProfile(current => ({ ...current, active_minutes: event.target.value ? Number(event.target.value) : null }))} /></div>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={profile.make_ahead} onChange={event => setProfile(current => ({ ...current, make_ahead: event.target.checked }))} /> Peut se préparer à l’avance</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={profile.allergen_review_state === 'reviewed'} onChange={event => setProfile(current => ({ ...current, allergen_review_state: event.target.checked ? 'reviewed' : 'unknown' }))} /> J’ai vérifié les allergènes de cette fiche</label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={profile.dietary_review_state === 'reviewed'} onChange={event => setProfile(current => ({ ...current, dietary_review_state: event.target.checked ? 'reviewed' : 'unknown' }))} /> J’ai vérifié les compatibilités alimentaires</label>
      <p className="text-xs text-muted-foreground">Une fiche sans revue reste exclue des accords automatiques si une contrainte alimentaire stricte est déclarée.</p>
      <Button onClick={handleSave} disabled={save.isPending}>{save.isPending ? 'Enregistrement…' : 'Enregistrer ce profil'}</Button>
    </div>
  </details>;
}
