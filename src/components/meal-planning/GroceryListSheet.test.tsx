import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroceryListSheet } from "./GroceryListSheet";

const INGREDIENTS = [
  { name: "Farine", quantity: 200, unit: "g", category: "Épicerie" },
  { name: "Farine", quantity: 300, unit: "g", category: "Épicerie" },
  { name: "Tomate", quantity: 3, unit: null, category: "Légumes" },
];

describe("GroceryListSheet", () => {
  it("désactive le bouton quand il n'y a aucun repas", () => {
    render(<GroceryListSheet ingredients={[]} customMeals={[]} hasMeals={false} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("active le bouton quand des repas existent", () => {
    render(<GroceryListSheet ingredients={INGREDIENTS} customMeals={[]} hasMeals />);
    expect(screen.getByRole("button", { name: /courses/i })).toBeEnabled();
  });

  it("ouvre la liste et affiche les ingrédients agrégés et les plats sans recette", async () => {
    const user = userEvent.setup();
    render(
      <GroceryListSheet
        ingredients={INGREDIENTS}
        customMeals={["Pizza maison"]}
        hasMeals
      />,
    );

    await user.click(screen.getByRole("button", { name: /courses/i }));

    // Ingrédients regroupés par catégorie
    expect(await screen.findByText("Farine")).toBeInTheDocument();
    expect(screen.getByText("Tomate")).toBeInTheDocument();
    // Farine 200g + 300g => 500 g agrégés
    expect(screen.getByText("500 g")).toBeInTheDocument();
    // Plat sans recette
    expect(screen.getByText("• Pizza maison")).toBeInTheDocument();
  });

  it("affiche un message quand il n'y a rien à acheter", async () => {
    const user = userEvent.setup();
    render(<GroceryListSheet ingredients={[]} customMeals={[]} hasMeals />);

    await user.click(screen.getByRole("button", { name: /courses/i }));

    expect(
      await screen.findByText(/Aucun ingrédient à afficher/i),
    ).toBeInTheDocument();
  });
});
