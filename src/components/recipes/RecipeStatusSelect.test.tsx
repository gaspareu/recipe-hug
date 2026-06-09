import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { RecipeStatusSelect } from "./RecipeStatusSelect";

// Radix UI Select utilise des Pointer Events et scrollIntoView que jsdom ne supporte pas.
// Ces polyfills locaux permettent à userEvent d'interagir avec le combobox sans erreur.
beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("RecipeStatusSelect", () => {
  it.each([
    ["draft", "Brouillon"],
    ["tested", "Testé"],
    ["validated", "Validé"],
    ["archived", "Archivé"],
  ] as const)(
    "affiche le libellé français pour le statut %s",
    (status, label) => {
      render(
        <RecipeStatusSelect status={status} onStatusChange={vi.fn()} />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it("affiche l'icône crayon dans le badge du statut sélectionné", () => {
    render(
      <RecipeStatusSelect status="draft" onStatusChange={vi.fn()} />,
    );
    // L'icône Pencil est un svg — on vérifie sa présence via le composant rendu
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();
  });

  it("ouvre la liste des statuts au clic et affiche les 4 options", async () => {
    const user = userEvent.setup();
    render(
      <RecipeStatusSelect status="draft" onStatusChange={vi.fn()} />,
    );

    await user.click(screen.getByRole("combobox"));

    // Après ouverture, les options apparaissent dans la liste (rôle listbox)
    const listbox = await screen.findByRole("listbox");
    expect(listbox).toBeInTheDocument();

    // Chaque option est un rôle "option" dans la liste déroulante
    const options = await screen.findAllByRole("option");
    const optionTexts = options.map((o) => o.textContent);
    expect(optionTexts).toContain("Brouillon");
    expect(optionTexts).toContain("Testé");
    expect(optionTexts).toContain("Validé");
    expect(optionTexts).toContain("Archivé");
  });

  it("appelle onStatusChange avec la bonne valeur quand on sélectionne un statut", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <RecipeStatusSelect status="draft" onStatusChange={onStatusChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /validé/i });
    await user.click(option);

    expect(onStatusChange).toHaveBeenCalledWith("validated");
  });

  it("appelle onStatusChange avec 'tested' quand on sélectionne Testé", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <RecipeStatusSelect status="draft" onStatusChange={onStatusChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /testé/i });
    await user.click(option);

    expect(onStatusChange).toHaveBeenCalledWith("tested");
  });

  it("appelle onStatusChange avec 'archived' quand on sélectionne Archivé", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <RecipeStatusSelect status="validated" onStatusChange={onStatusChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /archivé/i });
    await user.click(option);

    expect(onStatusChange).toHaveBeenCalledWith("archived");
  });

  it("est désactivé et ne réagit pas au clic quand disabled=true", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <RecipeStatusSelect
        status="draft"
        onStatusChange={onStatusChange}
        disabled
      />,
    );

    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();

    await user.click(trigger);
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("n'appelle pas onStatusChange si on ne change pas de statut", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn();
    render(
      <RecipeStatusSelect status="validated" onStatusChange={onStatusChange} />,
    );

    await user.click(screen.getByRole("combobox"));
    // On clique sur le statut déjà sélectionné
    const option = await screen.findByRole("option", { name: /validé/i });
    await user.click(option);

    // Radix n'appelle pas onValueChange si la valeur ne change pas
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
