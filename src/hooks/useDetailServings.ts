import { useState } from 'react';

/** Un choix de portions appartient à la fiche ouverte, pas à la route suivante. */
export function useDetailServings(id: string, baseServings: number | null | undefined) {
  const [choice, setChoice] = useState<{ id: string; value: number } | null>(null);
  const base = baseServings && baseServings > 0 ? baseServings : 2;
  return {
    servings: choice?.id === id ? choice.value : base,
    baseServings: base,
    setServings: (value: number) => setChoice({ id, value }),
  };
}
