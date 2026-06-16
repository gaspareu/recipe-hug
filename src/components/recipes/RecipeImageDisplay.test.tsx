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
  it("affiche le badge caméra quand isEditable=true et isUploading=false", () => {
    renderRecipeImageDisplay({ isEditable: true });
    // Le badge est un div avec une icône Camera (svg)
    // On vérifie qu'un svg est présent dans le badge (bottom-2 right-2)
    const badge = document
      .querySelector(".absolute.bottom-2.right-2");
    expect(badge).toBeInTheDocument();
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("n'affiche pas le badge caméra quand isEditable=false", () => {
    renderRecipeImageDisplay({ isEditable: false });
    const badge = document
      .querySelector(".absolute.bottom-2.right-2");
    expect(badge).not.toBeInTheDocument();
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
});
