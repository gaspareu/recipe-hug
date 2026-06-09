import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FavoriteToggle } from "./FavoriteToggle";
import { TooltipProvider } from "@/components/ui/tooltip";

// Radix UI Tooltip utilise des Pointer Events et scrollIntoView que jsdom ne supporte pas.
// Ces polyfills locaux permettent à userEvent de déclencher hover sans erreur.
beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function renderFavoriteToggle(
  props: Partial<React.ComponentProps<typeof FavoriteToggle>> = {},
) {
  const defaultProps: React.ComponentProps<typeof FavoriteToggle> = {
    isFavorite: false,
    onToggle: vi.fn(),
    ...props,
  };
  // TooltipProvider est nécessaire quand tooltipText est fourni
  const result = render(
    <TooltipProvider>
      <FavoriteToggle {...defaultProps} />
    </TooltipProvider>,
  );
  return { ...result, props: defaultProps };
}

describe("FavoriteToggle", () => {
  it("rend un bouton accessible", () => {
    renderFavoriteToggle();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("appelle onToggle au clic", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderFavoriteToggle({ onToggle });

    await user.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("n'appelle pas onToggle quand disabled=true", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderFavoriteToggle({ disabled: true, onToggle });

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("le bouton n'est pas désactivé par défaut", () => {
    renderFavoriteToggle();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("le cœur a la classe fill-primary quand isFavorite=true", () => {
    renderFavoriteToggle({ isFavorite: true });
    // L'icône Heart est un svg à l'intérieur du bouton
    const svg = screen.getByRole("button").querySelector("svg");
    expect(svg).toHaveClass("fill-primary");
    expect(svg).toHaveClass("text-primary");
  });

  it("le cœur n'a pas fill-primary quand isFavorite=false", () => {
    renderFavoriteToggle({ isFavorite: false });
    const svg = screen.getByRole("button").querySelector("svg");
    expect(svg).not.toHaveClass("fill-primary");
    expect(svg).toHaveClass("text-muted-foreground");
  });

  it("affiche un tooltip quand tooltipText est fourni", async () => {
    const user = userEvent.setup();
    renderFavoriteToggle({ tooltipText: "Ajouter aux favoris" });

    await user.hover(screen.getByRole("button"));

    // Au moins un élément avec ce texte doit être dans le document
    const tooltipElements = await screen.findAllByText("Ajouter aux favoris");
    expect(tooltipElements.length).toBeGreaterThan(0);
  });

  it("n'affiche pas de tooltip quand tooltipText est absent", () => {
    renderFavoriteToggle();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("applique les classes overlay quand variant='overlay'", () => {
    renderFavoriteToggle({ variant: "overlay" });
    const button = screen.getByRole("button");
    expect(button).toHaveClass("rounded-full");
    expect(button).toHaveClass("bg-background/80");
  });

  it("n'applique pas les classes overlay quand variant='default'", () => {
    renderFavoriteToggle({ variant: "default" });
    const button = screen.getByRole("button");
    expect(button).not.toHaveClass("rounded-full");
  });

  it("appelle onToggle une seule fois par clic (pas de propagation double)", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderFavoriteToggle({ onToggle });

    await user.click(screen.getByRole("button"));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
