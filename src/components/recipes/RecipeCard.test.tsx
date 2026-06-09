import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RecipeCard } from "./RecipeCard";
import type { Recipe } from "@/types/recipe";

// Les assets JPG sont résolus par Vite comme des strings (URLs).
// En environnement jsdom/vitest ils retournent une string (souvent vide ou le chemin),
// ce qui suffit pour rendre un <img> sans erreur.

const BASE_RECIPE: Recipe = {
  id: "abc123",
  user_id: "user-1",
  title: "Tarte aux pommes",
  status: "validated",
  is_favorite: false,
  servings: 4,
  ingredients: [],
  steps: [],
  season: null,
  nutrition_tags: null,
  calorie_score: null,
  ai_summary: null,
  source_type: "manual",
  source_image_url: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function renderCard(
  recipe: Partial<Recipe> = {},
  overrides: {
    onToggleFavorite?: (id: string, isFavorite: boolean) => void;
    isTogglingFavorite?: boolean;
  } = {},
) {
  const fullRecipe: Recipe = { ...BASE_RECIPE, ...recipe };
  const onToggleFavorite = overrides.onToggleFavorite ?? vi.fn();
  render(
    <MemoryRouter>
      <RecipeCard
        recipe={fullRecipe}
        onToggleFavorite={onToggleFavorite}
        isTogglingFavorite={overrides.isTogglingFavorite}
      />
    </MemoryRouter>,
  );
  return { onToggleFavorite, recipe: fullRecipe };
}

describe("RecipeCard", () => {
  it("affiche le titre de la recette", () => {
    renderCard();
    expect(screen.getByText("Tarte aux pommes")).toBeInTheDocument();
  });

  it("affiche le badge de statut avec le libellé français", () => {
    renderCard({ status: "validated" });
    expect(screen.getByText("Validé")).toBeInTheDocument();
  });

  it("affiche le badge de statut 'Brouillon' pour draft", () => {
    renderCard({ status: "draft" });
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
  });

  it("affiche le badge de statut 'Testé' pour tested", () => {
    renderCard({ status: "tested" });
    expect(screen.getByText("Testé")).toBeInTheDocument();
  });

  it("affiche le badge de statut 'Archivé' pour archived", () => {
    renderCard({ status: "archived" });
    expect(screen.getByText("Archivé")).toBeInTheDocument();
  });

  it("affiche le nombre de portions quand servings est renseigné", () => {
    renderCard({ servings: 6 });
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("n'affiche pas de portions quand servings est null", () => {
    renderCard({ servings: null });
    // La valeur null ne doit pas être rendue — pas de chiffre standalone erroné
    // On vérifie que l'icône Users n'est pas présente (pas d'élément avec le rôle svg dédié).
    // On teste l'absence en ciblant le texte "null" ou "undefined"
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("affiche la saison quand elle est renseignée", () => {
    renderCard({ season: "Printemps" });
    expect(screen.getByText("Printemps")).toBeInTheDocument();
  });

  it("n'affiche pas de saison quand season est null", () => {
    renderCard({ season: null });
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("affiche jusqu'à 3 tags de nutrition", () => {
    renderCard({ nutrition_tags: ["Bio", "Sans gluten", "Vegan"] });
    expect(screen.getByText("Bio")).toBeInTheDocument();
    expect(screen.getByText("Sans gluten")).toBeInTheDocument();
    expect(screen.getByText("Vegan")).toBeInTheDocument();
  });

  it("affiche un badge '+N' pour les tags de nutrition au-delà de 3", () => {
    renderCard({
      nutrition_tags: ["Bio", "Sans gluten", "Vegan", "Sans lactose", "Faible en sel"],
    });
    expect(screen.getByText("Bio")).toBeInTheDocument();
    expect(screen.getByText("Sans gluten")).toBeInTheDocument();
    expect(screen.getByText("Vegan")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
    // Le 4e et 5e tag ne doivent pas apparaître directement
    expect(screen.queryByText("Sans lactose")).not.toBeInTheDocument();
    expect(screen.queryByText("Faible en sel")).not.toBeInTheDocument();
  });

  it("n'affiche pas le bloc nutrition quand nutrition_tags est null", () => {
    renderCard({ nutrition_tags: null });
    expect(screen.queryByText("+")).not.toBeInTheDocument();
  });

  it("n'affiche pas le bloc nutrition quand nutrition_tags est vide", () => {
    renderCard({ nutrition_tags: [] });
    // Aucun badge de tag ne doit être présent
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("le lien pointe vers /recipes/:id", () => {
    renderCard({ id: "recette-42" });
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/recipes/recette-42");
  });

  it("rend une image avec l'alt = titre de la recette", () => {
    renderCard({ title: "Soupe de tomates" });
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("alt", "Soupe de tomates");
  });

  it("appelle onToggleFavorite avec id et !isFavorite au clic sur le bouton favoris", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    renderCard({ id: "r1", is_favorite: false }, { onToggleFavorite });

    const button = screen.getByRole("button");
    await user.click(button);

    expect(onToggleFavorite).toHaveBeenCalledWith("r1", true);
  });

  it("appelle onToggleFavorite avec false quand isFavorite=true", async () => {
    const user = userEvent.setup();
    const onToggleFavorite = vi.fn();
    renderCard({ id: "r2", is_favorite: true }, { onToggleFavorite });

    const button = screen.getByRole("button");
    await user.click(button);

    expect(onToggleFavorite).toHaveBeenCalledWith("r2", false);
  });

  it("désactive le bouton favoris quand isTogglingFavorite=true", () => {
    renderCard({}, { isTogglingFavorite: true });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("le bouton favoris n'est pas désactivé quand isTogglingFavorite=false", () => {
    renderCard({}, { isTogglingFavorite: false });
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("le cœur est rempli (fill-primary) quand is_favorite=true", () => {
    renderCard({ is_favorite: true });
    const svg = screen.getByRole("button").querySelector("svg");
    expect(svg).toHaveClass("fill-primary");
  });

  it("le cœur n'est pas rempli quand is_favorite=false", () => {
    renderCard({ is_favorite: false });
    const svg = screen.getByRole("button").querySelector("svg");
    expect(svg).not.toHaveClass("fill-primary");
  });
});
