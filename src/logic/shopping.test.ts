import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../data/db";
import type { IngredientRow, RecipeRow } from "../data/schema";
import { dispatch } from "../server";
import { addDays, setToday } from "./dates";
import { createIngredient } from "./ingredients";
import { packPlan } from "./shopping";
import { buildContext } from "./planner";
import { saveRecipe } from "./recipes";
import { emptyDraft } from "./textImport";

const api = <T = any>(method: string, path: string, body?: unknown) => dispatch(method, path, body) as Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Line = { key: string; ingredient_id: number | null; name: string; needed: number | null; needed_text: string; est_price: number | null;
  pack: { count: number; bought: number; leftover: number; buy_text: string } | null; source: string; unknown_stock: boolean; qty_overridden: boolean };
type List = { list: { id: number; status: string }; items: Line[]; removed: Line[]; covered: { ingredient_id: number }[]; totals: { estimate: number; spend: number; unpriced: number }; result?: { added: number; prices: number } };

function ing(name: string, values: Partial<IngredientRow>): IngredientRow {
  const i = createIngredient(name, values.category, values.default_unit ?? "g");
  Object.assign(i, values);
  return i;
}

function recipe(title: string, lines: [IngredientRow, number | null, string | null][], servings = 2): RecipeRow {
  return saveRecipe({
    ...emptyDraft(), title, servings,
    ingredients: lines.map(([i, quantity, unit]) => ({ quantity, unit, name: i.name, note: null, raw_text: i.name, optional: false, ingredient_id: i.id })),
  });
}

let k: Record<string, IngredientRow> = {};
let a: RecipeRow, b: RecipeRow;

beforeEach(() => {
  resetDb();
  setToday("2040-04-02");
  k = {
    rice: ing("rice", { category: "pantry", price: 3, price_amount: 1, price_unit: "kg" }),
    chicken: ing("chicken", { category: "meat", price: 6, price_amount: 500, price_unit: "g" }),
    onion: ing("onion", { category: "produce", default_unit: "each", grams_per_each: 150, price: 0.8, price_amount: 1, price_unit: "each" }),
    oil: ing("oil", { category: "pantry", default_unit: "ml", is_staple: true, low_threshold: 200, price: 6, price_amount: 750, price_unit: "ml" }),
    cabbage: ing("cabbage", { category: "produce", default_unit: "g", price: 4, price_amount: 1, price_unit: "kg" }),
    salt: ing("salt", { category: "pantry" }), // never priced
  };
  a = recipe("Chicken rice", [[k.rice, 200, "g"], [k.chicken, 600, "g"], [k.onion, 1, null], [k.oil, 1, "tbsp"]]);
  b = recipe("Fried rice", [[k.rice, 0.5, "kg"], [k.onion, 2, null], [k.salt, 1, "tsp"]]);
});

async function planWith(day: string, recipeIds: number[]) {
  const p = await api<{ id: number; meals: { id: number }[] }>("GET", `/api/plans/week/${day}`);
  for (let i = 0; i < recipeIds.length; i++) await api("PATCH", `/api/plans/${p.id}/meals/${p.meals[i].id}`, { recipe_id: recipeIds[i] });
  return api<{ id: number; meals: { id: number }[] }>("GET", `/api/plans/week/${day}`);
}

const line = (d: List, i: IngredientRow) => d.items.find((l) => l.ingredient_id === i.id);
const stockOf = (i: IngredientRow) => Math.round(db().pantry.filter((r) => !r.deleted && r.ingredient_id === i.id).reduce((t, r) => t + (r.quantity ?? 0), 0) * 1000) / 1000;

describe("packs", () => {
  it("rounds up to whole packs of the priced size", () => {
    expect(packPlan(k.chicken, 600)).toMatchObject({ count: 2, bought: 1000, leftover: 400, cost: 12, buy_text: "2 × 500 g" });
    expect(packPlan(k.rice, 700)).toMatchObject({ count: 1, bought: 1000, cost: 3, buy_text: "1 × 1 kg" });
    expect(packPlan(k.rice, 1020)!.count).toBe(1); // 2% over a pack doesn't buy another
    expect(packPlan(k.onion, 3)).toMatchObject({ count: 3, cost: 2.4, buy_text: "3" });
    expect(packPlan(k.salt, 5)).toBeNull(); // no price
    const onions = ing("brown onion", { category: "produce", default_unit: "each", grams_per_each: 150, price: 3.5, price_amount: 1, price_unit: "kg" });
    expect(packPlan(onions, 3)).toMatchObject({ count: 1, buy_text: "1 × 1 kg", leftover_text: "4" }); // counted in onions, bought by the kilo
    expect(createIngredient("water").never_buy).toBe(true);
  });
});

describe("the shopping list", () => {
  it("merges the week's needs, rounds to packs, and totals them", async () => {
    await planWith("2040-04-02", [a.id, b.id]);
    const d = await api<List>("GET", "/api/shopping/week/2040-04-02");
    expect(line(d, k.rice)).toMatchObject({ needed: 700, est_price: 3 });
    expect(line(d, k.chicken)).toMatchObject({ needed: 600, est_price: 12 });
    expect(line(d, k.onion)).toMatchObject({ needed: 3, needed_text: "3", est_price: 2.4 });
    expect(line(d, k.oil)).toMatchObject({ source: "plan+staple", unknown_stock: true }); // staple with no stock recorded
    expect(line(d, k.salt)).toMatchObject({ est_price: null });
    expect(d.totals).toEqual({ estimate: 3 + 12 + 2.4 + 6, spend: 23.4, unpriced: 1 });
  });

  it("takes off pantry stock and keeps the user's edits", async () => {
    await planWith("2040-03-05", [a.id, b.id]);
    await api("POST", "/api/pantry", { ingredient_id: k.rice.id, quantity: 0.5, unit: "kg" });
    await api("POST", "/api/pantry", { ingredient_id: k.chicken.id, quantity: 1, unit: "kg" });
    let d = await api<List>("GET", "/api/shopping/week/2040-03-05");
    expect(line(d, k.rice)!.needed).toBe(200); // 700 - 500 in stock
    expect(line(d, k.chicken)).toBeUndefined(); // covered...
    expect(d.covered.some((c) => c.ingredient_id === k.chicken.id)).toBe(true); // ...and shown as such
    const id = d.list.id;
    d = await api<List>("PATCH", `/api/shopping/${id}/items/i:${k.rice.id}`, { qty_needed: 1500 });
    expect(line(d, k.rice)).toMatchObject({ needed: 1500, qty_overridden: true, est_price: 6 });
    d = await api<List>("PATCH", `/api/shopping/${id}/items/i:${k.onion.id}`, { removed: true });
    expect(line(d, k.onion)).toBeUndefined();
    expect(d.removed.some((r) => r.ingredient_id === k.onion.id)).toBe(true);
    d = await api<List>("POST", `/api/shopping/${id}/extras`, { name: "Toilet paper" });
    expect(d.items.find((l) => l.name === "Toilet paper")).toMatchObject({ source: "manual", est_price: null });
  });

  it("keeps the pantry right through a whole week", async () => {
    const plan = await planWith("2040-04-02", [a.id, b.id]);
    const d = await api<List>("GET", "/api/shopping/week/2040-04-02");
    const id = d.list.id;
    await api("PATCH", `/api/shopping/${id}/items/i:${k.rice.id}`, { ticked: true, actual_price: 2.5 });
    await api("PATCH", `/api/shopping/${id}/items/i:${k.chicken.id}`, { ticked: true, actual_price: 13 });
    await api("PATCH", `/api/shopping/${id}/items/i:${k.onion.id}`, { ticked: true });
    const done = await api<List>("POST", `/api/shopping/${id}/done`, {});
    expect([done.list.status, done.result]).toEqual(["done", { added: 3, prices: 2 }]);
    await expect(api("PATCH", `/api/shopping/${id}/items/i:${k.rice.id}`, { removed: true })).rejects.toThrow(/Reopen/);
    expect([stockOf(k.rice), stockOf(k.chicken), stockOf(k.onion)]).toEqual([1000, 1000, 3]); // whole packs
    expect([k.rice.price, k.chicken.price]).toEqual([2.5, 6.5]); // prices paid become the price per pack

    for (const meal of plan.meals.slice(0, 2)) await api("PATCH", `/api/plans/${plan.id}/meals/${meal.id}`, { status: "cooked" });
    expect([stockOf(k.rice), stockOf(k.chicken), stockOf(k.onion)]).toEqual([300, 400, 0]);
    await api("PATCH", `/api/plans/${plan.id}/meals/${plan.meals[1].id}`, { status: "planned" }); // Undo one
    expect([stockOf(k.rice), stockOf(k.onion)]).toEqual([800, 2]);
    await api("PATCH", `/api/plans/${plan.id}/meals/${plan.meals[1].id}`, { status: "cooked" });

    await planWith("2040-04-09", [a.id]); // next week, the leftovers count
    const next = await api<List>("GET", "/api/shopping/week/2040-04-09");
    expect(line(next, k.rice)).toBeUndefined(); // needs 200 g, 300 g left
    expect(line(next, k.chicken)!.needed).toBe(200);

    await api("POST", `/api/shopping/${id}/reopen`, {}); // takes back the pantry stock and the prices
    expect([stockOf(k.chicken), stockOf(k.rice), k.rice.price, k.chicken.price]).toEqual([0, 0, 3, 6]);
  });

  it("cooks from the batch expiring first", async () => {
    const later = await api<{ id: number }>("POST", "/api/pantry", { ingredient_id: k.chicken.id, quantity: 500, unit: "g", expires_on: "2040-04-11" });
    const soon = await api<{ id: number }>("POST", "/api/pantry", { ingredient_id: k.chicken.id, quantity: 400, unit: "g", expires_on: "2040-04-04" });
    const plan = await planWith("2040-04-02", [a.id]);
    await api("PATCH", `/api/plans/${plan.id}/meals/${plan.meals[0].id}`, { status: "cooked" });
    const rows = new Map(db().pantry.map((r) => [r.id, r]));
    expect([rows.get(soon.id)!.deleted, rows.get(later.id)!.quantity]).toEqual([true, 300]);
  });
});

describe("pantry", () => {
  it("adds, tops up, switches to levels, deletes and restores", async () => {
    const item = await api<{ id: number; quantity: number; unit: string; location: string }>("POST", "/api/pantry", { ingredient_id: k.onion.id, quantity: 300, unit: "g" });
    expect([item.quantity, item.unit, item.location]).toEqual([2, "each", "pantry"]); // 300 g of 150 g onions, cupboard produce
    const again = await api<{ id: number; quantity: number }>("POST", "/api/pantry", { ingredient_id: k.onion.id, quantity: 1 });
    expect([again.id, again.quantity]).toEqual([item.id, 3]);
    const low = await api<{ quantity: number | null; level: string }>("PATCH", `/api/pantry/${item.id}`, { level: "low" });
    expect([low.quantity, low.level]).toEqual([null, "low"]);
    expect((await api<{ name: string }>("POST", "/api/pantry", { name: "smoked paprika", level: "have" })).name).toBe("smoked paprika");
    await expect(api("POST", "/api/pantry", { ingredient_id: k.onion.id, level: "lots" })).rejects.toThrow(/Level/);
    await api("DELETE", `/api/pantry/${item.id}`);
    expect((await api<{ level: string }>("POST", `/api/pantry/${item.id}/restore`)).level).toBe("low");
    await api("PATCH", `/api/pantry/${item.id}`, { expires_on: addDays("2040-04-02", 1) });
    const listing = await api<{ expiring: { id: number }[]; staples: { name: string; low: boolean }[] }>("GET", "/api/pantry");
    expect(listing.expiring.map((e) => e.id)).toEqual([item.id]);
    expect(listing.staples).toEqual([expect.objectContaining({ name: "oil", low: true })]);
  });

  it("steers the planner towards food expiring soon", async () => {
    await api("POST", "/api/pantry", { ingredient_id: k.chicken.id, quantity: 600, expires_on: "2040-04-03" });
    const plan = await api<{ id: number; meals: { id: number }[] }>("GET", "/api/plans/week/2040-04-02");
    const ctx = buildContext(db().plans.find((p) => p.id === plan.id)!);
    expect(ctx.expiring.has(k.chicken.id)).toBe(true);
    const alts = await api<{ recipe: { id: number }; notes: string[] }[]>("GET", `/api/plans/${plan.id}/meals/${plan.meals[0].id}/alternatives?limit=20`);
    expect(alts.find((x) => x.recipe.id === a.id)!.notes.some((n) => n.includes("before it expires"))).toBe(true);
  });
});

describe("leftovers", () => {
  it("suggests a recipe that uses up a half-used pack", async () => {
    const slaw = recipe("Cabbage slaw", [[k.cabbage, 500, "g"]]);
    const rolls = recipe("Cabbage rolls", [[k.cabbage, 400, "g"]]);
    await planWith("2040-04-02", [slaw.id]);
    const plan = db().plans[0];
    const left = await api<{ ingredient_id: number; text: string; recipes: { id: number; uses_text: string }[] }[]>("GET", `/api/plans/${plan.id}/leftovers`);
    const cab = left.find((x) => x.ingredient_id === k.cabbage.id)!;
    expect(cab.text).toBe("500 g (half the pack)");
    expect(cab.recipes[0]).toMatchObject({ id: rolls.id, uses_text: "400 g" });
    expect(cab.recipes.some((r) => r.id === slaw.id)).toBe(false);
  });
});

describe("backup", () => {
  it("exports everything as one document", async () => {
    await planWith("2040-04-02", [a.id]);
    const backup = await api<{ app: string; data: { recipes: unknown[]; plans: unknown[]; ingredients: unknown[] }; photos: object }>("GET", "/api/backup");
    expect(backup.app).toBe("meal-planner-app");
    expect([backup.data.recipes.length, backup.data.plans.length, backup.data.ingredients.length]).toEqual([2, 1, 6]);
    await expect(api("POST", "/api/backup/restore", { text: "{\"app\":\"other\"}" })).rejects.toThrow(/isn't a Meal Map backup/);
  });
});
