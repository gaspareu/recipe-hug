import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { Step } from "@/types/recipe";
import { StepsEditor } from "./StepsEditor";

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

function makeSteps(...texts: string[]): Step[] {
  return texts.map((text, i) => ({ order: i + 1, text }));
}

function setup(steps: Step[], onChange = vi.fn()) {
  render(<StepsEditor steps={steps} onChange={onChange} />);
  return { onChange };
}

/**
 * Retourne les boutons de suppression (Trash2) en les distinguant
 * des boutons up/down (qui ont un aria-label) et du bouton "Ajouter"
 * (qui contient du texte visible "Ajouter").
 * Les boutons Trash2 n'ont ni aria-label ni texte visible, uniquement une SVG.
 */
function getDeleteButtons(): HTMLElement[] {
  return screen
    .getAllByRole("button")
    .filter(
      (btn) =>
        btn.querySelector("svg") !== null &&
        !btn.getAttribute("aria-label") &&
        !btn.textContent?.trim(),
    );
}

// ──────────────────────────────────────────────────────────
// Rendu de base
// ──────────────────────────────────────────────────────────

describe("StepsEditor — rendu", () => {
  it("affiche le titre « Étapes »", () => {
    setup([]);
    expect(screen.getByText("Étapes")).toBeInTheDocument();
  });

  it("affiche le message vide quand aucune étape", () => {
    setup([]);
    expect(screen.getByText(/aucune étape/i)).toBeInTheDocument();
  });

  it("n'affiche pas le message vide quand des étapes existent", () => {
    setup(makeSteps("Faire bouillir l'eau"));
    expect(screen.queryByText(/aucune étape/i)).not.toBeInTheDocument();
  });

  it("affiche le texte de chaque étape existante", () => {
    setup(makeSteps("Étape A", "Étape B"));
    expect(screen.getByDisplayValue("Étape A")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Étape B")).toBeInTheDocument();
  });

  it("affiche les numéros d'ordre de chaque étape", () => {
    setup(makeSteps("Étape A", "Étape B", "Étape C"));
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
    expect(screen.getByText("3.")).toBeInTheDocument();
  });

  it("affiche le bouton « Ajouter »", () => {
    setup([]);
    expect(screen.getByRole("button", { name: /ajouter/i })).toBeInTheDocument();
  });

  it("affiche un bouton de suppression par étape", () => {
    setup(makeSteps("A", "B", "C"));
    expect(getDeleteButtons()).toHaveLength(3);
  });
});

// ──────────────────────────────────────────────────────────
// Ajout d'une étape
// ──────────────────────────────────────────────────────────

describe("StepsEditor — ajout", () => {
  it("appelle onChange avec une nouvelle étape vide quand la liste est vide", async () => {
    const user = userEvent.setup();
    const { onChange } = setup([]);
    await user.click(screen.getByRole("button", { name: /ajouter/i }));
    expect(onChange).toHaveBeenCalledOnce();
    const [steps] = onChange.mock.calls[0] as [Step[]];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ order: 1, text: "" });
  });

  it("incrémente l'ordre max quand des étapes existent déjà", async () => {
    const user = userEvent.setup();
    const { onChange } = setup(makeSteps("Étape A", "Étape B"));
    await user.click(screen.getByRole("button", { name: /ajouter/i }));
    const [steps] = onChange.mock.calls[0] as [Step[]];
    expect(steps).toHaveLength(3);
    expect(steps[2]).toMatchObject({ order: 3, text: "" });
  });
});

// ──────────────────────────────────────────────────────────
// Suppression d'une étape
// ──────────────────────────────────────────────────────────

describe("StepsEditor — suppression", () => {
  it("supprime l'étape cliquée et réordonne", async () => {
    const user = userEvent.setup();
    const steps = makeSteps("Première", "Deuxième", "Troisième");
    const { onChange } = setup(steps);

    const deleteButtons = getDeleteButtons();
    expect(deleteButtons).toHaveLength(3);
    await user.click(deleteButtons[0]); // supprime "Première"

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Step[]];
    expect(result).toHaveLength(2);
    // Après suppression de "Première", les ordres sont réassignés à 1 et 2
    expect(result[0]).toMatchObject({ order: 1, text: "Deuxième" });
    expect(result[1]).toMatchObject({ order: 2, text: "Troisième" });
  });

  it("appelle onChange avec un tableau vide quand on supprime la seule étape", async () => {
    const user = userEvent.setup();
    const { onChange } = setup(makeSteps("Unique"));

    const deleteButtons = getDeleteButtons();
    expect(deleteButtons).toHaveLength(1);
    await user.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("supprime la bonne étape quand on clique sur le deuxième bouton de suppression", async () => {
    const user = userEvent.setup();
    const steps = makeSteps("Première", "Deuxième");
    const { onChange } = setup(steps);

    const deleteButtons = getDeleteButtons();
    await user.click(deleteButtons[1]); // supprime "Deuxième"

    const [result] = onChange.mock.calls[0] as [Step[]];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ order: 1, text: "Première" });
  });
});

// ──────────────────────────────────────────────────────────
// Édition du texte d'une étape
// ──────────────────────────────────────────────────────────

describe("StepsEditor — édition", () => {
  it("appelle onChange avec le texte mis à jour via fireEvent.change", () => {
    const steps = makeSteps("Texte initial");
    const { onChange } = setup(steps);

    const textarea = screen.getByDisplayValue("Texte initial");
    fireEvent.change(textarea, { target: { value: "Nouveau texte" } });

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Step[]];
    expect(result[0]).toMatchObject({ order: 1, text: "Nouveau texte" });
  });

  it("ne modifie pas les autres étapes lors de l'édition", () => {
    const steps = makeSteps("Étape A", "Étape B");
    const { onChange } = setup(steps);

    const textareaA = screen.getByDisplayValue("Étape A");
    fireEvent.change(textareaA, { target: { value: "X" } });

    const lastCall = onChange.mock.calls.at(-1) as [Step[]];
    // La deuxième étape reste inchangée
    expect(lastCall[0][1]).toMatchObject({ order: 2, text: "Étape B" });
  });

  it("appelle onChange à chaque caractère via fireEvent pour le texte complet", () => {
    const steps = makeSteps("A", "B", "C");
    const { onChange } = setup(steps);

    const textareas = screen.getAllByRole("textbox");
    // Modifie la deuxième étape (index 1)
    fireEvent.change(textareas[1], { target: { value: "Modifié" } });

    const [result] = onChange.mock.calls[0] as [Step[]];
    expect(result[0]).toMatchObject({ text: "A" });
    expect(result[1]).toMatchObject({ text: "Modifié" });
    expect(result[2]).toMatchObject({ text: "C" });
  });
});

// ──────────────────────────────────────────────────────────
// Réorganisation (monter / descendre)
// ──────────────────────────────────────────────────────────

describe("StepsEditor — réorganisation", () => {
  it("désactive le bouton « Monter » pour la première étape", () => {
    setup(makeSteps("A", "B"));
    const upButtons = screen.getAllByRole("button", { name: "Monter l'étape" });
    expect(upButtons[0]).toBeDisabled();
    expect(upButtons[1]).not.toBeDisabled();
  });

  it("désactive le bouton « Descendre » pour la dernière étape", () => {
    setup(makeSteps("A", "B"));
    const downButtons = screen.getAllByRole("button", { name: "Descendre l'étape" });
    expect(downButtons[0]).not.toBeDisabled();
    expect(downButtons[1]).toBeDisabled();
  });

  it("descend une étape : échange les ordres", async () => {
    const user = userEvent.setup();
    const steps = makeSteps("Première", "Deuxième");
    const { onChange } = setup(steps);

    const downButtons = screen.getAllByRole("button", { name: "Descendre l'étape" });
    await user.click(downButtons[0]); // descend "Première"

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Step[]];
    // "Première" passe en position 2, "Deuxième" en position 1
    const sorted = [...result].sort((a, b) => a.order - b.order);
    expect(sorted[0].text).toBe("Deuxième");
    expect(sorted[1].text).toBe("Première");
  });

  it("monte une étape : échange les ordres", async () => {
    const user = userEvent.setup();
    const steps = makeSteps("Première", "Deuxième");
    const { onChange } = setup(steps);

    const upButtons = screen.getAllByRole("button", { name: "Monter l'étape" });
    await user.click(upButtons[1]); // monte "Deuxième"

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [Step[]];
    const sorted = [...result].sort((a, b) => a.order - b.order);
    expect(sorted[0].text).toBe("Deuxième");
    expect(sorted[1].text).toBe("Première");
  });

  it("n'appelle pas onChange si on tente de monter la première étape (bouton désactivé)", async () => {
    const user = userEvent.setup();
    const steps = makeSteps("A", "B");
    const { onChange } = setup(steps);

    const upButtons = screen.getAllByRole("button", { name: "Monter l'étape" });
    // Le bouton est disabled, userEvent ne déclenche pas le click
    await user.click(upButtons[0]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("n'appelle pas onChange si on tente de descendre la dernière étape (bouton désactivé)", async () => {
    const user = userEvent.setup();
    const steps = makeSteps("A", "B");
    const { onChange } = setup(steps);

    const downButtons = screen.getAllByRole("button", { name: "Descendre l'étape" });
    await user.click(downButtons[1]); // dernier, désactivé

    expect(onChange).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────
// Placeholder des textareas
// ──────────────────────────────────────────────────────────

describe("StepsEditor — placeholders", () => {
  it("affiche le placeholder avec le numéro d'ordre", () => {
    setup([{ order: 1, text: "" }]);
    expect(screen.getByPlaceholderText("Décrivez l'étape 1...")).toBeInTheDocument();
  });

  it("affiche autant de textareas que d'étapes", () => {
    setup(makeSteps("A", "B", "C"));
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });
});
