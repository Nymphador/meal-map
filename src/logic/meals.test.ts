import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealType, RecipeRow } from "../data/schema";

// Premium (breakfast and lunch) is read from localStorage at start; tests run without one, so stand one in.
const store = new Map<string, string>([["mp_ad_free", "1"]]);
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});

const { db, resetDb } = await import("../data/db");
const { dispatch } = await import("../server");
const { saveRecipe, mealTypes } = await import("./recipes");
const { emptyDraft } = await import("./textImport");
const { setToday } = await import("./dates");
const { draftFromJsonld } = await import("./urlImport");

type Meal = { id: number; date: string; slot: string; status: string; recipe: { id: number; title: string } | null };
type Plan = { id: number; meals: Meal[]; notes: string[]; nutrition: { meals: number; dinners: number } };

const api = <T = any>(method: string, path: string, body?: unknown) => dispatch(method, path, body) as Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
const week = () => api<Plan>("GET", "/api/plans/week/2031-01-08");
const expand = (p: Plan, date: string) => api<Plan>("POST", `/api/plans/${p.id}/days/${date}/expand`);
const collapse = (p: Plan, date: string) => api<Plan>("POST", `/api/plans/${p.id}/days/${date}/collapse`);
const generate = (p: Plan) => api<Plan>("POST", `/api/plans/${p.id}/generate`, { seed: 3 });

function add(title: string, types?: MealType[]): RecipeRow {
  return saveRecipe({
    ...emptyDraft(), title, servings: 2, meal_types: types,
    ingredients: [{ quantity: 1, unit: null, name: `${title} thing`, note: null, raw_text: title, optional: false }],
  });
}

beforeEach(() => {
  resetDb();
  setToday("2031-01-08");
  store.set("mp_ad_free", "1");
});

describe("recipe meal types", () => {
  it("new recipes are dinners; old ones without the field count as dinners; an edit keeps them", async () => {
    const r = add("Stew");
    expect(r.meal_types).toEqual(["dinner"]);
    delete r.meal_types;
    expect(mealTypes(r)).toEqual(["dinner"]);
    const patched = await api("PATCH", `/api/recipes/${r.id}`, { meal_types: ["dinner", "lunch", "brunch"] });
    expect(patched.meal_types).toEqual(["lunch", "dinner"]); // unknown names dropped, kept in meal order
    await api("PUT", `/api/recipes/${r.id}`, { ...emptyDraft(), title: "Stew 2" }); // the editor doesn't send them
    expect(db().recipes.find((x) => x.id === r.id)!.meal_types).toEqual(["lunch", "dinner"]);
    await expect(api("PATCH", `/api/recipes/${r.id}`, { meal_types: [] })).rejects.toThrow(/at least one meal/);
  });

  it("an imported recipe's category hints at the meal", () => {
    expect(draftFromJsonld({ name: "Pancakes", recipeCategory: "Breakfast" }, null).meal_types).toEqual(["breakfast"]);
    expect(draftFromJsonld({ name: "Frittata", recipeCategory: ["Brunch"] }, null).meal_types).toEqual(["breakfast", "lunch"]);
    expect(draftFromJsonld({ name: "Curry", recipeCategory: "Main course" }, null).meal_types).toEqual(["dinner"]);
    expect(draftFromJsonld({ name: "Soup" }, null).meal_types).toBeUndefined();
  });
});

describe("breakfast and lunch on expanded days", () => {
  it("a week is dinners only until a day is expanded; collapsing takes them away again", async () => {
    let p = await week();
    expect(p.meals.every((m) => m.slot === "dinner")).toBe(true);
    p = await expand(p, "2031-01-08");
    expect(p.meals.filter((m) => m.date === "2031-01-08").map((m) => m.slot)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(p.meals).toHaveLength(9);
    p = await expand(p, "2031-01-08"); // twice is harmless
    expect(p.meals).toHaveLength(9);
    await expect(expand(p, "2031-02-01")).rejects.toThrow(/isn't in this week/);
    p = await collapse(p, "2031-01-08");
    expect(p.meals).toHaveLength(7);
  });

  it("is Premium only", async () => {
    store.delete("mp_ad_free");
    vi.resetModules(); // premium reads its cache when first loaded
    const fresh = await import("../server");
    const p = await fresh.dispatch("GET", "/api/plans/week/2031-01-08", undefined) as Plan;
    await expect(fresh.dispatch("POST", `/api/plans/${p.id}/days/2031-01-08/expand`, undefined)).rejects.toThrow(/Premium/);
  });

  it("Generate fills breakfast and lunch only from recipes switched on for them", async () => {
    for (let i = 0; i < 9; i++) add(`Dinner ${i}`);
    add("Porridge", ["breakfast"]);
    add("Eggs", ["breakfast"]);
    add("Wrap", ["lunch"]);
    add("Salad", ["lunch", "dinner"]);
    let p = await expand(await week(), "2031-01-07");
    p = await expand(p, "2031-01-09");
    p = await generate(p);
    const title = (date: string, slot: string) => p.meals.find((m) => m.date === date && m.slot === slot)?.recipe?.title;
    const breakfasts = [title("2031-01-07", "breakfast"), title("2031-01-09", "breakfast")];
    expect(breakfasts.sort()).toEqual(["Eggs", "Porridge"]);
    const lunches = [title("2031-01-07", "lunch"), title("2031-01-09", "lunch")];
    expect(lunches.sort()).toEqual(["Salad", "Wrap"]);
    expect(p.meals.filter((m) => m.slot === "dinner").every((m) => m.recipe && !["Porridge", "Eggs", "Wrap"].includes(m.recipe.title))).toBe(true);
    expect(new Set(p.meals.map((m) => m.recipe!.id)).size).toBe(11); // nothing twice in a week
    expect(p.nutrition.dinners).toBe(7);
  });

  it("says when no recipe suits breakfast yet", async () => {
    for (let i = 0; i < 8; i++) add(`Dinner ${i}`);
    const p = await generate(await expand(await week(), "2031-01-10"));
    expect(p.meals.find((m) => m.slot === "breakfast")!.recipe).toBeNull();
    expect(p.notes.join(" ")).toMatch(/No recipes are switched on for breakfast yet/);
    // and lunch never borrows a dinner recipe: only ones switched on for lunch
    expect(p.meals.find((m) => m.slot === "lunch")!.recipe).toBeNull();
  });

  it("Replace suggests and Shuffle picks only recipes for that meal; meals move only to the same meal", async () => {
    for (let i = 0; i < 4; i++) add(`Dinner ${i}`);
    const porridge = add("Porridge", ["breakfast"]);
    add("Toast", ["breakfast"]);
    let p = await expand(await week(), "2031-01-08");
    p = await expand(p, "2031-01-09");
    const b1 = p.meals.find((m) => m.date === "2031-01-08" && m.slot === "breakfast")!;
    const alts = await api<{ recipe: { title: string } }[]>("GET", `/api/plans/${p.id}/meals/${b1.id}/alternatives?limit=20`);
    expect(alts.map((a) => a.recipe.title).sort()).toEqual(["Porridge", "Toast"]);
    p = await api<Plan>("POST", `/api/plans/${p.id}/meals/${b1.id}/shuffle`, { seed: 1 });
    expect(["Porridge", "Toast"]).toContain(p.meals.find((m) => m.id === b1.id)!.recipe!.title);

    const dinner = p.meals.find((m) => m.date === "2031-01-08" && m.slot === "dinner")!;
    await expect(api("POST", `/api/plans/${p.id}/meals/${b1.id}/move`, { to_meal_id: dinner.id })).rejects.toThrow(/another day's breakfast/);
    const b2 = p.meals.find((m) => m.date === "2031-01-09" && m.slot === "breakfast")!;
    p = await api<Plan>("POST", `/api/plans/${p.id}/meals/${b1.id}/move`, { to_meal_id: b2.id });
    expect(p.meals.find((m) => m.id === b2.id)!.recipe).not.toBeNull();
    expect(porridge.meal_types).toEqual(["breakfast"]);
  });

  it("a cooked breakfast has to be un-cooked before the day collapses", async () => {
    const porridge = add("Porridge", ["breakfast"]);
    let p = await expand(await week(), "2031-01-08");
    const b = p.meals.find((m) => m.slot === "breakfast")!;
    p = await api<Plan>("PATCH", `/api/plans/${p.id}/meals/${b.id}`, { recipe_id: porridge.id });
    p = await api<Plan>("PATCH", `/api/plans/${p.id}/meals/${b.id}`, { status: "cooked" });
    await expect(collapse(p, "2031-01-08")).rejects.toThrow(/Undo Mark cooked/);
  });

  it("the shopping list includes breakfast and lunch ingredients", async () => {
    const porridge = add("Porridge", ["breakfast"]);
    let p = await expand(await week(), "2031-01-08");
    const b = p.meals.find((m) => m.slot === "breakfast")!;
    p = await api<Plan>("PATCH", `/api/plans/${p.id}/meals/${b.id}`, { recipe_id: porridge.id });
    const list = await api<{ items: { name: string }[] }>("GET", "/api/shopping/current");
    expect(list.items.map((l) => l.name)).toContain("porridge thing");
  });
});

describe("Prices search", () => {
  it("matches every word anywhere in the name", async () => {
    saveRecipe({ ...emptyDraft(), title: "Roast", ingredients: [
      { quantity: 1, unit: null, name: "chicken breast", note: null, raw_text: "chicken breast", optional: false },
      { quantity: 1, unit: null, name: "beef mince", note: null, raw_text: "beef mince", optional: false }] });
    const names = async (q: string) => (await api<{ name: string }[]>("GET", `/api/ingredients?status=all&q=${encodeURIComponent(q)}`)).map((i) => i.name);
    expect(await names("chick brea")).toEqual(["chicken breast"]);
    expect(await names("mince")).toEqual(["beef mince"]);
    expect(await names("breast beef")).toEqual([]);
  });
});
