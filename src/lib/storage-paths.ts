/**
 * Chemin d'un objet image de recette dans le bucket storage `recipes`, scopé
 * par utilisateur. La policy RLS du bucket exige que le 1er segment du chemin
 * (`storage.foldername(name)[1]`) soit l'uid de l'utilisateur, pour INSERT
 * comme pour UPDATE/DELETE : sans ce préfixe, l'opération est rejetée. Ce
 * helper garantit la cohérence entre l'upload front et la policy.
 */
export function buildRecipeImageObjectPath(userId: string, fileName: string): string {
  return `${userId}/${fileName}`;
}
