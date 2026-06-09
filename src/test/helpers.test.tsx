import { renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { createQueryWrapper, createTestQueryClient } from "./query-client";
import { createSupabaseMock, createQueryBuilder } from "./supabase-mock";

describe("createSupabaseMock", () => {
  it("auth.getUser résout vers l'utilisateur fourni", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" } });
    const { data } = await supabase.auth.getUser();
    expect(data.user).toEqual({ id: "u1" });
  });

  it("auth.getSession résout vers la session fournie", async () => {
    const supabase = createSupabaseMock({ session: { access_token: "tok" } });
    const { data } = await supabase.auth.getSession();
    expect(data.session).toEqual({ access_token: "tok" });
  });

  it("from(table) awaité directement résout vers le résultat par défaut", async () => {
    const supabase = createSupabaseMock({ result: { data: [{ id: 1 }], error: null } });
    const res = await supabase.from("recipes").select("*").order("updated_at");
    expect(res).toEqual({ data: [{ id: 1 }], error: null });
  });

  it("resultsByTable est prioritaire sur le résultat par défaut", async () => {
    const supabase = createSupabaseMock({
      result: { data: [], error: null },
      resultsByTable: { recipes: { data: [{ id: "r1" }], error: null } },
    });
    const recipes = await supabase.from("recipes").select("*");
    const others = await supabase.from("profiles").select("*");
    expect(recipes).toEqual({ data: [{ id: "r1" }], error: null });
    expect(others).toEqual({ data: [], error: null });
  });

  it("single() et maybeSingle() résolvent vers le résultat", async () => {
    const supabase = createSupabaseMock({ result: { data: { id: "x" }, error: null } });
    expect(await supabase.from("recipes").select("*").eq("id", "x").single())
      .toEqual({ data: { id: "x" }, error: null });
    expect(await supabase.from("recipes").select("*").eq("id", "x").maybeSingle())
      .toEqual({ data: { id: "x" }, error: null });
  });

  it("createQueryBuilder propage les erreurs", async () => {
    const builder = createQueryBuilder({ data: null, error: { message: "boom" } });
    const res = await builder.select("*").eq("id", "1");
    expect(res.error).toEqual({ message: "boom" });
  });
});

describe("createQueryWrapper", () => {
  it("permet à un hook useQuery de s'exécuter", async () => {
    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result } = renderHook(
      () => useQuery({ queryKey: ["ping"], queryFn: () => Promise.resolve("pong") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("pong");
  });
});
