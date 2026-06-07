import { render, screen } from "@testing-library/react";
import { RecipeStatusBadge } from "./RecipeStatusBadge";

describe("RecipeStatusBadge", () => {
  it.each([
    ["draft", "Brouillon"],
    ["tested", "Testé"],
    ["validated", "Validé"],
    ["archived", "Archivé"],
  ] as const)("affiche le libellé français pour le statut %s", (status, label) => {
    render(<RecipeStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
