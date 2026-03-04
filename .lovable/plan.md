

## Fonctionnalite de partage de recette

### Concept

Un utilisateur partage une recette (version actuelle) avec quelqu'un via email ou telephone. Le destinataire recoit une copie dans son compte. Si le destinataire n'a pas encore de compte, le partage est mis en attente et se declenche automatiquement a la creation du compte.

### Architecture

```text
Expediteur                    Backend                         Destinataire
    |                            |                                |
    |-- Partager (email/tel) --> |                                |
    |                            |-- Cherche user par email/tel   |
    |                            |   Trouve? -> copie recette     |
    |                            |   Pas trouve? -> pending_share |
    |                            |                                |
    |                            |   (a la creation du compte)    |
    |                            |-- trigger -> copie recette --> |
```

### 1. Migration base de donnees

Creer une table `recipe_shares` :

```sql
CREATE TABLE public.recipe_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_identifier text NOT NULL,        -- email ou telephone
  identifier_type text NOT NULL CHECK (identifier_type IN ('email', 'phone')),
  recipe_snapshot jsonb NOT NULL,            -- copie complete (titre, ingredients, steps, etc.)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired')),
  recipient_id uuid,                         -- rempli quand le partage est reclame
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);

ALTER TABLE public.recipe_shares ENABLE ROW LEVEL SECURITY;

-- L'expediteur peut voir ses partages
CREATE POLICY "Senders can view their shares"
  ON public.recipe_shares FOR SELECT
  USING (auth.uid() = sender_id);

-- L'expediteur peut creer un partage
CREATE POLICY "Senders can create shares"
  ON public.recipe_shares FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Fonction pour reclamer les partages (appelee par trigger ou edge function)
CREATE OR REPLACE FUNCTION public.claim_pending_shares()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reclamer par email
  UPDATE public.recipe_shares
  SET status = 'claimed', recipient_id = NEW.id, claimed_at = now()
  WHERE status = 'pending'
    AND identifier_type = 'email'
    AND lower(recipient_identifier) = lower(NEW.email);

  -- Reclamer par telephone
  IF NEW.phone IS NOT NULL THEN
    UPDATE public.recipe_shares
    SET status = 'claimed', recipient_id = NEW.id, claimed_at = now()
    WHERE status = 'pending'
      AND identifier_type = 'phone'
      AND recipient_identifier = NEW.phone;
  END IF;

  -- Creer les recettes pour l'utilisateur
  INSERT INTO public.recipes (user_id, title, servings, ingredients, steps, season, nutrition_tags, source_type, ai_summary, source_image_url, status)
  SELECT
    NEW.id,
    (snapshot->>'title'),
    (snapshot->>'servings')::int,
    COALESCE(snapshot->'ingredients', '[]'::jsonb),
    COALESCE(snapshot->'steps', '[]'::jsonb),
    snapshot->>'season',
    CASE WHEN snapshot->'nutrition_tags' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(snapshot->'nutrition_tags'))
      ELSE NULL END,
    'ai',
    'Recette partagee par un ami',
    snapshot->>'source_image_url',
    'draft'
  FROM public.recipe_shares
  WHERE recipient_id = NEW.id AND claimed_at = now()
    AND status = 'claimed';

  RETURN NEW;
END;
$$;

-- Trigger sur creation d'utilisateur pour reclamer les partages en attente
CREATE TRIGGER on_auth_user_created_claim_shares
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_pending_shares();
```

**Note importante** : Le trigger sur `auth.users` n'est pas autorise via les migrations standard car c'est un schema reserve. A la place, on utilisera une **edge function** appelee au moment du partage pour gerer les deux cas (utilisateur existant / en attente).

### 2. Approche revisee sans trigger sur auth.users

Puisqu'on ne peut pas toucher au schema `auth`, voici l'approche corrigee :

**Table `recipe_shares`** : meme structure mais sans trigger sur `auth.users`.

**Edge function `share-recipe`** :
- Recoit `{ recipeId, identifier, identifierType }` 
- Verifie que l'expediteur possede la recette
- Cree un snapshot de la recette (titre, ingredients, steps, servings, season, tags, image)
- Cherche si un utilisateur existe avec cet email/telephone dans `auth.users` (via service role)
- Si oui : cree directement la recette dans le compte du destinataire + status `claimed`
- Si non : insere en `pending` dans `recipe_shares`

**Edge function `claim-shares`** (ou logique dans le flow d'auth existant) :
- Appelee apres login/signup (cote client dans `useAuth`)
- Cherche les `recipe_shares` en `pending` correspondant a l'email/telephone de l'utilisateur connecte
- Pour chaque partage trouve : cree la recette et met a jour le status

### 3. Composant UI `ShareRecipeDialog`

- Dialog accessible depuis la page `RecipeDetail` (nouveau bouton "Partager" dans la barre d'actions)
- Champs : email OU telephone (toggle entre les deux)
- Validation du format (zod)
- Appel a l'edge function `share-recipe`
- Toast de confirmation

### 4. Hook `useClaimShares`

- Appele dans `useAuth` apres un login/signup reussi
- Invoque l'edge function `claim-shares` avec le token de l'utilisateur
- Silencieux (pas d'UI), mais affiche un toast si des recettes ont ete ajoutees

### Fichiers a creer/modifier

| Fichier | Action |
|---------|--------|
| Migration SQL | Creer table `recipe_shares` + RLS |
| `supabase/functions/share-recipe/index.ts` | Edge function de partage |
| `supabase/functions/claim-shares/index.ts` | Edge function de reclamation |
| `src/components/recipes/ShareRecipeDialog.tsx` | Dialog de partage |
| `src/pages/RecipeDetail.tsx` | Ajouter bouton partage |
| `src/hooks/useAuth.tsx` | Appeler claim-shares apres login |

