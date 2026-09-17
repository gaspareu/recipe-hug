import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FilterBar } from "./FilterBar";

function setup(overrides: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const props = {
    search: "",
    onSearchChange: vi.fn(),
    statusFilter: "all" as const,
    onStatusFilterChange: vi.fn(),
    favoritesOnly: false,
    onFavoritesOnlyChange: vi.fn(),
    seasonFilter: "all",
    onSeasonFilterChange: vi.fn(),
    ...overrides,
  };
  render(<FilterBar {...props} />);
  return props;
}

describe("FilterBar", () => {
  it("propage la saisie de recherche", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.type(screen.getByPlaceholderText(/rechercher une recette/i), "a");
    expect(props.onSearchChange).toHaveBeenCalledWith("a");
  });

  it("bascule le filtre favoris", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByLabelText("Favoris uniquement"));
    expect(props.onFavoritesOnlyChange).toHaveBeenCalledWith(true);
  });

  it("n'affiche pas le bouton d'effacement sans filtre actif", () => {
    setup();
    expect(screen.queryByText("✕")).not.toBeInTheDocument();
  });

  it("affiche et applique l'effacement de tous les filtres", async () => {
    const user = userEvent.setup();
    const props = setup({ search: "tomate" });

    const clear = screen.getByText("✕");
    expect(clear).toBeInTheDocument();

    await user.click(clear);
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("all");
    expect(props.onFavoritesOnlyChange).toHaveBeenCalledWith(false);
    expect(props.onSeasonFilterChange).toHaveBeenCalledWith("all");
    expect(props.onSearchChange).toHaveBeenCalledWith("");
  });
});
