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
    await user.type(screen.getByRole("textbox", { name: "Rechercher une recette" }), "a");
    expect(props.onSearchChange).toHaveBeenCalledWith("a");
  });

  it("nomme les filtres indépendamment de leur valeur", () => {
    setup();
    expect(screen.getByRole("combobox", { name: "Filtrer par statut" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrer par saison" })).toBeInTheDocument();
  });

  it("annonce les valeurs sélectionnées des filtres", () => {
    setup({ statusFilter: "draft", seasonFilter: "hiver" });
    expect(screen.getByRole("combobox", { name: "Filtrer par statut" })).toHaveAccessibleDescription("Brouillon");
    expect(screen.getByRole("combobox", { name: "Filtrer par saison" })).toHaveAccessibleDescription("Hiver");
  });

  it("bascule le filtre favoris", async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByLabelText("Favoris uniquement"));
    expect(props.onFavoritesOnlyChange).toHaveBeenCalledWith(true);
  });

  it("n'affiche pas le bouton d'effacement sans filtre actif", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Effacer tous les filtres" })).not.toBeInTheDocument();
  });

  it("affiche et applique l'effacement de tous les filtres", async () => {
    const user = userEvent.setup();
    const props = setup({ search: "tomate" });

    const clear = screen.getByRole("button", { name: "Effacer tous les filtres" });

    clear.focus();
    await user.keyboard("{Enter}");
    expect(props.onStatusFilterChange).toHaveBeenCalledWith("all");
    expect(props.onFavoritesOnlyChange).toHaveBeenCalledWith(false);
    expect(props.onSeasonFilterChange).toHaveBeenCalledWith("all");
    expect(props.onSearchChange).toHaveBeenCalledWith("");
  });
});
