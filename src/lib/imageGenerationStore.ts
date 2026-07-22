import { useSyncExternalStore } from 'react';

/**
 * Store d'état éphémère « recettes dont l'image IA est en cours de génération ».
 *
 * La génération d'image tourne en fire-and-forget hors du scope React (voir
 * `useHomeChat` et `useRecipes`) : impossible de suivre son avancement avec un
 * état local de composant. Ce store module-level, exposé via `useSyncExternalStore`,
 * permet à n'importe quelle carte/fiche d'afficher un indicateur pendant la
 * génération, sans provider ni prop drilling.
 *
 * L'état est immutable : chaque mutation crée un nouveau `Set` pour que
 * `useSyncExternalStore` détecte le changement.
 */

type Listener = () => void;

let generatingIds: ReadonlySet<string> = new Set();
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Marque une recette comme ayant une génération d'image en cours. */
export function startImageGeneration(recipeId: string): void {
  if (generatingIds.has(recipeId)) return;
  const next = new Set(generatingIds);
  next.add(recipeId);
  generatingIds = next;
  emit();
}

/** Retire une recette du suivi (génération terminée, réussie ou échouée). */
export function finishImageGeneration(recipeId: string): void {
  if (!generatingIds.has(recipeId)) return;
  const next = new Set(generatingIds);
  next.delete(recipeId);
  generatingIds = next;
  emit();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hook réactif : `true` tant que l'image de la recette est en cours de génération. */
export function useIsGeneratingImage(recipeId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => generatingIds.has(recipeId),
    () => false,
  );
}
