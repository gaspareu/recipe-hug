import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { RecipeImageDisplay } from "./RecipeImageDisplay";

function renderRecipeImageDisplay(
  props: Partial<React.ComponentProps<typeof RecipeImageDisplay>> = {},
) {
  const defaultProps: React.ComponentProps<typeof RecipeImageDisplay> = {
    recipeId: "recipe-123",
    imageUrl: null,
    title: "Tarte aux pommes",
    onImageChange: vi.fn(),
    onImageRemove: vi.fn(),
    ...props,
  };
  return render(<RecipeImageDisplay {...defaultProps} />);
}

describe("RecipeImageDisplay", () => {
  it("propose une commande photo accessible même sans survol", () => {
    renderRecipeImageDisplay({ isEditable: true, showPlaceholder: false });
    expect(screen.getByRole('button', { name: 'Ajouter une photo' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it("masque les commandes d’édition en lecture seule", () => {
    renderRecipeImageDisplay({ isEditable: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it("propose le retrait d’une photo sans survol", () => {
    renderRecipeImageDisplay({ imageUrl: 'https://example.com/image.jpg' });
    expect(screen.getByRole('button', { name: 'Retirer la photo' })).toBeInTheDocument();
  });

  it("affiche l'image de la recette", () => {
    renderRecipeImageDisplay({ imageUrl: "https://example.com/image.jpg", title: "Quiche lorraine" });
    const img = screen.getByRole("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/image.jpg");
  });

  it("affiche le titre sur l'image", () => {
    renderRecipeImageDisplay({ title: "Crème brûlée" });
    expect(screen.getByText("Crème brûlée")).toBeInTheDocument();
  });

  it("masque le titre en overlay quand showTitleOverlay={false}", () => {
    renderRecipeImageDisplay({ title: "Crème brûlée", showTitleOverlay: false });
    expect(screen.queryByText("Crème brûlée")).toBeNull();
  });
});
