import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NavLink } from "./NavLink";

function renderNavLink({
  to,
  initialEntries = ["/"],
  className,
  activeClassName,
  pendingClassName,
  children = "Accueil",
}: {
  to: string;
  initialEntries?: string[];
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
  children?: React.ReactNode;
}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="*"
          element={
            <NavLink
              to={to}
              className={className}
              activeClassName={activeClassName}
              pendingClassName={pendingClassName}
            >
              {children}
            </NavLink>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NavLink", () => {
  it("rend un lien avec le bon texte", () => {
    renderNavLink({ to: "/recettes", initialEntries: ["/autre"] });
    expect(screen.getByRole("link", { name: "Accueil" })).toBeInTheDocument();
  });

  it("rend le bon href", () => {
    renderNavLink({ to: "/recettes", initialEntries: ["/autre"] });
    expect(screen.getByRole("link")).toHaveAttribute("href", "/recettes");
  });

  it("applique la className de base", () => {
    renderNavLink({ to: "/recettes", className: "nav-item", initialEntries: ["/autre"] });
    expect(screen.getByRole("link")).toHaveClass("nav-item");
  });

  it("applique activeClassName quand la route correspond", () => {
    renderNavLink({
      to: "/recettes",
      className: "nav-item",
      activeClassName: "active",
      initialEntries: ["/recettes"],
    });
    expect(screen.getByRole("link")).toHaveClass("active");
  });

  it("n'applique pas activeClassName quand la route ne correspond pas", () => {
    renderNavLink({
      to: "/recettes",
      className: "nav-item",
      activeClassName: "active",
      initialEntries: ["/autre"],
    });
    expect(screen.getByRole("link")).not.toHaveClass("active");
  });

  it("applique à la fois className et activeClassName quand actif", () => {
    renderNavLink({
      to: "/recettes",
      className: "nav-item",
      activeClassName: "active",
      initialEntries: ["/recettes"],
    });
    const link = screen.getByRole("link");
    expect(link).toHaveClass("nav-item");
    expect(link).toHaveClass("active");
  });

  it("n'applique pas activeClassName quand inactif, mais garde className", () => {
    renderNavLink({
      to: "/recettes",
      className: "nav-item",
      activeClassName: "active",
      initialEntries: ["/autre"],
    });
    const link = screen.getByRole("link");
    expect(link).toHaveClass("nav-item");
    expect(link).not.toHaveClass("active");
  });

  it("fonctionne sans className ni activeClassName", () => {
    renderNavLink({ to: "/recettes", initialEntries: ["/recettes"] });
    expect(screen.getByRole("link")).toBeInTheDocument();
  });

  it("rend les enfants passés en prop", () => {
    renderNavLink({
      to: "/recettes",
      initialEntries: ["/recettes"],
      children: <span>Recettes</span>,
    });
    expect(screen.getByText("Recettes")).toBeInTheDocument();
  });
});
