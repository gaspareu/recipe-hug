import { useState } from 'react';
import { Plus, X, Save, ChefHat, Utensils, AlertTriangle, Heart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  useUserPreferences, 
  TastePreferences,
  KitchenEquipment,
  CulinaryStyle,
  DietaryConstraints
} from '@/hooks/useUserPreferences';

interface TagInputProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  placeholder: string;
  suggestions?: string[];
}

// Helper to normalize tag for comparison (lowercase, trimmed)
const normalizeTag = (tag: string): string => tag.trim().toLowerCase();

// Helper to dedupe array (case-insensitive)
const dedupeArray = (arr: string[]): string[] => {
  const seen = new Set<string>();
  return arr.filter(item => {
    const normalized = normalizeTag(item);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

function TagInput({ tags, onAdd, onRemove, placeholder, suggestions = [] }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  
  // Dedupe tags for display
  const uniqueTags = dedupeArray(tags);

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    // Case-insensitive duplicate check
    const isDuplicate = uniqueTags.some(t => normalizeTag(t) === normalizeTag(trimmed));
    if (trimmed && !isDuplicate) {
      onAdd(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  // Case-insensitive filtering for suggestions
  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(inputValue.toLowerCase()) && 
         !uniqueTags.some(t => normalizeTag(t) === normalizeTag(s))
  ).slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" size="icon" variant="secondary" onClick={handleAdd} disabled={!inputValue.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Suggestions */}
      {inputValue && filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {filteredSuggestions.map(suggestion => (
            <Badge
              key={suggestion}
              variant="outline"
              className="cursor-pointer hover:bg-accent"
              onClick={() => {
                onAdd(suggestion);
                setInputValue('');
              }}
            >
              + {suggestion}
            </Badge>
          ))}
        </div>
      )}
      
      {/* Current tags - use uniqueTags to display */}
      <div className="flex flex-wrap gap-1.5">
        {uniqueTags.map(tag => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              className="ml-1 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

// Common suggestions
const FLAVOR_SUGGESTIONS = ['Sucré', 'Salé', 'Épicé', 'Acide', 'Amer', 'Umami', 'Fumé', 'Piquant'];
const CUISINE_SUGGESTIONS = ['Française', 'Italienne', 'Japonaise', 'Mexicaine', 'Indienne', 'Thaïlandaise', 'Chinoise', 'Méditerranéenne', 'Américaine', 'Libanaise'];
const EQUIPMENT_SUGGESTIONS = ['Four', 'Mixeur', 'Robot pâtissier', 'Thermomix', 'Wok', 'Plancha', 'Barbecue', 'Cocotte-minute', 'Sorbetière', 'Machine à pâtes'];
const ALLERGY_SUGGESTIONS = ['Gluten', 'Lactose', 'Arachides', 'Fruits à coque', 'Œufs', 'Fruits de mer', 'Soja', 'Sésame'];
const DIET_SUGGESTIONS = ['Végétarien', 'Vegan', 'Sans porc', 'Halal', 'Casher', 'Pescétarien', 'Flexitarien'];

interface EditablePrefs {
  taste_preferences: TastePreferences;
  kitchen_equipment: KitchenEquipment;
  culinary_style: CulinaryStyle;
  dietary_constraints: DietaryConstraints;
}

export function CulinaryPreferencesEditor() {
  const { preferences, isLoading, updatePreferences, isUpdating } = useUserPreferences();
  
  // Local state for editing
  const [localPrefs, setLocalPrefs] = useState<EditablePrefs | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    taste: true,
    constraints: true,
    equipment: false,
    style: false,
  });

  // Initialize local state from preferences - with deduplication
  const getEditablePrefs = (): EditablePrefs => {
    if (localPrefs) return localPrefs;
    
    const taste = preferences?.taste_preferences || {
      liked_flavors: [],
      disliked_flavors: [],
      liked_ingredients: [],
      disliked_ingredients: [],
    };
    
    const equipment = preferences?.kitchen_equipment || {
      available: [],
      unavailable: [],
    };
    
    const style = preferences?.culinary_style || {
      favorite_cuisines: [],
      favorite_techniques: [],
      preferred_difficulty: null,
    };
    
    const constraints = preferences?.dietary_constraints || {
      allergies: [],
      diets: [],
      restrictions: [],
    };
    
    // Dedupe all arrays on load
    return {
      taste_preferences: {
        liked_flavors: dedupeArray(taste.liked_flavors),
        disliked_flavors: dedupeArray(taste.disliked_flavors),
        liked_ingredients: dedupeArray(taste.liked_ingredients),
        disliked_ingredients: dedupeArray(taste.disliked_ingredients),
      },
      kitchen_equipment: {
        available: dedupeArray(equipment.available),
        unavailable: dedupeArray(equipment.unavailable),
      },
      culinary_style: {
        favorite_cuisines: dedupeArray(style.favorite_cuisines),
        favorite_techniques: dedupeArray(style.favorite_techniques),
        preferred_difficulty: style.preferred_difficulty,
      },
      dietary_constraints: {
        allergies: dedupeArray(constraints.allergies),
        diets: dedupeArray(constraints.diets),
        restrictions: dedupeArray(constraints.restrictions),
      },
    };
  };

  const updateLocalPrefs = <K extends keyof EditablePrefs>(
    category: K,
    field: keyof EditablePrefs[K],
    value: EditablePrefs[K][keyof EditablePrefs[K]]
  ) => {
    const current = getEditablePrefs();
    setLocalPrefs({
      ...current,
      [category]: {
        ...current[category],
        [field]: value,
      },
    });
    setHasChanges(true);
  };

  const addToArray = (category: keyof EditablePrefs, field: string, value: string) => {
    const current = getEditablePrefs();
    const categoryData = current[category] as unknown as Record<string, string[]>;
    const currentArray = categoryData[field] || [];
    // Case-insensitive duplicate check
    const isDuplicate = currentArray.some(v => normalizeTag(v) === normalizeTag(value));
    if (!isDuplicate) {
      const updated = { ...current[category], [field]: [...currentArray, value] };
      setLocalPrefs({ ...current, [category]: updated });
      setHasChanges(true);
    }
  };

  const removeFromArray = (category: keyof EditablePrefs, field: string, value: string) => {
    const current = getEditablePrefs();
    const categoryData = current[category] as unknown as Record<string, string[]>;
    const currentArray = categoryData[field] || [];
    // Remove all variations of this tag (case-insensitive)
    const updated = { ...current[category], [field]: currentArray.filter(v => normalizeTag(v) !== normalizeTag(value)) };
    setLocalPrefs({ ...current, [category]: updated });
    setHasChanges(true);
  };

  const handleSave = () => {
    const prefs = getEditablePrefs();
    updatePreferences(prefs, {
      onSuccess: () => {
        toast.success('Préférences enregistrées !');
        setHasChanges(false);
        setLocalPrefs(null);
      },
      onError: () => {
        toast.error('Erreur lors de la sauvegarde');
      },
    });
  };

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const prefs = getEditablePrefs();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              Mes préférences culinaires
            </CardTitle>
            <CardDescription>
              Ces informations aident le Chef à personnaliser ses suggestions
            </CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={handleSave} disabled={isUpdating} size="sm">
              <Save className="mr-2 h-4 w-4" />
              {isUpdating ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contraintes alimentaires - Prioritaire */}
        <Collapsible open={openSections.constraints} onOpenChange={() => toggleSection('constraints')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-3 h-auto">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="font-medium">Contraintes alimentaires</span>
                {(prefs.dietary_constraints.allergies.length > 0 || prefs.dietary_constraints.diets.length > 0) && (
                  <Badge variant="destructive" className="ml-2">
                    {prefs.dietary_constraints.allergies.length + prefs.dietary_constraints.diets.length}
                  </Badge>
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-4 px-1">
            <div className="space-y-2">
              <Label>Allergies ⚠️</Label>
              <TagInput
                tags={prefs.dietary_constraints.allergies}
                onAdd={(v) => addToArray('dietary_constraints', 'allergies', v)}
                onRemove={(v) => removeFromArray('dietary_constraints', 'allergies', v)}
                placeholder="Ajouter une allergie..."
                suggestions={ALLERGY_SUGGESTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Régimes alimentaires</Label>
              <TagInput
                tags={prefs.dietary_constraints.diets}
                onAdd={(v) => addToArray('dietary_constraints', 'diets', v)}
                onRemove={(v) => removeFromArray('dietary_constraints', 'diets', v)}
                placeholder="Ajouter un régime..."
                suggestions={DIET_SUGGESTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Autres restrictions</Label>
              <TagInput
                tags={prefs.dietary_constraints.restrictions}
                onAdd={(v) => addToArray('dietary_constraints', 'restrictions', v)}
                onRemove={(v) => removeFromArray('dietary_constraints', 'restrictions', v)}
                placeholder="Ex: faible en sel, diabétique..."
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Goûts */}
        <Collapsible open={openSections.taste} onOpenChange={() => toggleSection('taste')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-3 h-auto">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <span className="font-medium">Goûts</span>
                {(prefs.taste_preferences.liked_ingredients.length > 0 || prefs.taste_preferences.disliked_ingredients.length > 0) && (
                  <Badge variant="secondary" className="ml-2">
                    {prefs.taste_preferences.liked_ingredients.length + prefs.taste_preferences.disliked_ingredients.length}
                  </Badge>
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-4 px-1">
            <div className="space-y-2">
              <Label>Saveurs aimées 💚</Label>
              <TagInput
                tags={prefs.taste_preferences.liked_flavors}
                onAdd={(v) => addToArray('taste_preferences', 'liked_flavors', v)}
                onRemove={(v) => removeFromArray('taste_preferences', 'liked_flavors', v)}
                placeholder="Ajouter une saveur..."
                suggestions={FLAVOR_SUGGESTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Saveurs évitées 🚫</Label>
              <TagInput
                tags={prefs.taste_preferences.disliked_flavors}
                onAdd={(v) => addToArray('taste_preferences', 'disliked_flavors', v)}
                onRemove={(v) => removeFromArray('taste_preferences', 'disliked_flavors', v)}
                placeholder="Ajouter une saveur..."
                suggestions={FLAVOR_SUGGESTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Ingrédients favoris 💚</Label>
              <TagInput
                tags={prefs.taste_preferences.liked_ingredients}
                onAdd={(v) => addToArray('taste_preferences', 'liked_ingredients', v)}
                onRemove={(v) => removeFromArray('taste_preferences', 'liked_ingredients', v)}
                placeholder="Ex: ail, citron, parmesan..."
              />
            </div>
            <div className="space-y-2">
              <Label>Ingrédients évités 🚫</Label>
              <TagInput
                tags={prefs.taste_preferences.disliked_ingredients}
                onAdd={(v) => addToArray('taste_preferences', 'disliked_ingredients', v)}
                onRemove={(v) => removeFromArray('taste_preferences', 'disliked_ingredients', v)}
                placeholder="Ex: coriandre, olives..."
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Équipement */}
        <Collapsible open={openSections.equipment} onOpenChange={() => toggleSection('equipment')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-3 h-auto">
              <div className="flex items-center gap-2">
                <Utensils className="h-4 w-4" />
                <span className="font-medium">Équipement de cuisine</span>
                {prefs.kitchen_equipment.available.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {prefs.kitchen_equipment.available.length}
                  </Badge>
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-4 px-1">
            <div className="space-y-2">
              <Label>Équipement disponible ✓</Label>
              <TagInput
                tags={prefs.kitchen_equipment.available}
                onAdd={(v) => addToArray('kitchen_equipment', 'available', v)}
                onRemove={(v) => removeFromArray('kitchen_equipment', 'available', v)}
                placeholder="Ajouter un équipement..."
                suggestions={EQUIPMENT_SUGGESTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Équipement non disponible ✗</Label>
              <TagInput
                tags={prefs.kitchen_equipment.unavailable}
                onAdd={(v) => addToArray('kitchen_equipment', 'unavailable', v)}
                onRemove={(v) => removeFromArray('kitchen_equipment', 'unavailable', v)}
                placeholder="Ex: four, thermomix..."
                suggestions={EQUIPMENT_SUGGESTIONS}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Style culinaire */}
        <Collapsible open={openSections.style} onOpenChange={() => toggleSection('style')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-3 h-auto">
              <div className="flex items-center gap-2">
                <ChefHat className="h-4 w-4" />
                <span className="font-medium">Style culinaire</span>
                {prefs.culinary_style.favorite_cuisines.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {prefs.culinary_style.favorite_cuisines.length}
                  </Badge>
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-4 px-1">
            <div className="space-y-2">
              <Label>Cuisines favorites</Label>
              <TagInput
                tags={prefs.culinary_style.favorite_cuisines}
                onAdd={(v) => addToArray('culinary_style', 'favorite_cuisines', v)}
                onRemove={(v) => removeFromArray('culinary_style', 'favorite_cuisines', v)}
                placeholder="Ajouter une cuisine..."
                suggestions={CUISINE_SUGGESTIONS}
              />
            </div>
            <div className="space-y-2">
              <Label>Techniques appréciées</Label>
              <TagInput
                tags={prefs.culinary_style.favorite_techniques}
                onAdd={(v) => addToArray('culinary_style', 'favorite_techniques', v)}
                onRemove={(v) => removeFromArray('culinary_style', 'favorite_techniques', v)}
                placeholder="Ex: cuisson lente, wok, pâtisserie..."
              />
            </div>
            <div className="space-y-2">
              <Label>Niveau de difficulté préféré</Label>
              <Select
                value={prefs.culinary_style.preferred_difficulty || 'none'}
                onValueChange={(v) => {
                  const current = getEditablePrefs();
                  setLocalPrefs({
                    ...current,
                    culinary_style: {
                      ...current.culinary_style,
                      preferred_difficulty: v === 'none' ? null : v as 'facile' | 'moyen' | 'difficile',
                    },
                  });
                  setHasChanges(true);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un niveau" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pas de préférence</SelectItem>
                  <SelectItem value="facile">Facile</SelectItem>
                  <SelectItem value="moyen">Moyen</SelectItem>
                  <SelectItem value="difficile">Difficile</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
