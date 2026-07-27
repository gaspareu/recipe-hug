interface RecipeDetailHeaderProps {
  title: string;
  description?: string | null;
}

/** Bloc éditorial de la fiche recette : titre serif + courte description. */
export function RecipeDetailHeader({ title, description }: RecipeDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="font-solitreo text-3xl leading-tight text-foreground text-balance">
        {title}
      </h1>
      {description && (
        <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
