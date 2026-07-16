-- §C — Cohérence des policies du bucket storage `recipes`.
--
-- La policy INSERT autorisait l'écriture dans un dossier partagé littéral
-- `recipe-images/` (`(storage.foldername(name))[1] = 'recipe-images'`), alors
-- que les policies UPDATE et DELETE exigent `<uid>/`
-- (`(storage.foldername(name))[1] = auth.uid()::text`). Conséquences :
--   - les images uploadées vivaient dans un espace partagé entre utilisateurs ;
--   - elles n'étaient jamais modifiables/supprimables par leur propriétaire
--     (le chemin ne correspondait pas aux policies UPDATE/DELETE) → orphelines.
--
-- On aligne l'INSERT sur `<uid>/`, comme le bucket `recipe-images` et comme
-- UPDATE/DELETE. Le front (RecipeDetail) est modifié en parallèle pour écrire
-- sous `<uid>/` (voir src/lib/storage-paths.ts). Les images déjà stockées sous
-- `recipe-images/` restent lisibles (bucket public en lecture) ; seul le chemin
-- des nouveaux uploads change.
DROP POLICY IF EXISTS "Users can upload recipe images" ON storage.objects;

CREATE POLICY "Users can upload recipe images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recipes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
