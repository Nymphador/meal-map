import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../data/db";
import type { RecipeDraft } from "../types";
import { lineCost, priceText, recipeCosting, unitPrice } from "./costing";
import { createIngredient, getIngredient, ingredientMap, linkAlias, resolveIngredientId } from "./ingredients";
import { listRecipes, saveRecipe } from "./recipes";
import { emptyDraft } from "./textImport";

beforeEach(resetDb);

function draft(title: string, lines: [number | null, string | null, string][], extra: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    ...emptyDraft(), title, servings: 2, ...extra,
    ingredients: lines.map(([quantity, unit, name]) => ({ quantity, unit, name, note: null, raw_text: name, optional: false })),
  };
}

describe("saving recipes", () => {
  it("links every line to an ingredient, reusing existing ones", () => {
    const a = saveRecipe(draft("Stir fry", [[500, "g", "chicken thigh fillets"], [2, null, "onions"]]));
    const b = saveRecipe(draft("Curry", [[400, "g", "Chicken Thigh Fillet"], [1, "tbsp", "coriander leaves"], [1, null, "brown onion"]]));
    expect(a.lines.every((l) => l.ingredient_id)).toBe(true);
    expect(b.lines[0].ingredient_id).toBe(a.lines[0].ingredient_id); // same thing, different spelling
    const onion = getIngredient(a.lines[1].ingredient_id!)!;
    expect(onion.name).toBe("onion");
    expect(onion.grams_per_each).toBe(150); // known item weight beats the category guess
    expect(onion.kcal_100g).toBe(40); // built-in nutrition
    expect(getIngredient(b.lines[1].ingredient_id!)!.name).toBe("coriander leaf");
  });

  it("learns a corrected spelling everywhere", () => {
    const r = saveRecipe(draft("Salad", [[1, null, "eschalots"]]));
    const shallot = createIngredient("shallot", "produce", "each");
    expect(linkAlias("eschalots", shallot)).toBe(1);
    expect(r.lines[0].ingredient_id).toBe(shallot.id);
    expect(resolveIngredientId("Eschalot")).toBe(shallot.id);
  });

  it("refuses an empty title and clamps numbers", () => {
    expect(() => saveRecipe(draft("  ", []))).toThrow(/title/);
    const r = saveRecipe(draft("Big pot", [], { servings: 500, rating: 9 }));
    expect([r.servings, r.rating]).toEqual([100, 5]);
  });
});

describe("listing", () => {
  it("searches titles and ingredients, filters quick meals, sorts", () => {
    saveRecipe(draft("Spinach pie", [[200, "g", "spinach"]], { prep_min: 20, cook_min: 40 }));
    saveRecipe(draft("Beef tacos", [[500, "g", "beef mince"], [60, "g", "baby spinach"]], { prep_min: 10, cook_min: 15 }));
    saveRecipe(draft("Mystery stew", [[1, "kg", "beef mince"]]));
    expect(listRecipes({ q: "spinach" }).map((r) => r.title)).toEqual(["Beef tacos", "Spinach pie"]);
    expect(listRecipes({ quick: true }).map((r) => r.title)).toEqual(["Beef tacos"]); // no times: not quick
    expect(listRecipes({ sort: "quickest" }).map((r) => r.title)[0]).toBe("Mystery stew"); // 0 min recorded sorts first
    expect(listRecipes({ sort: "kcal" }).map((r) => r.title)).toEqual(["Beef tacos", "Spinach pie", "Mystery stew"].sort((a, b) =>
      ({ "Spinach pie": 1, "Beef tacos": 2, "Mystery stew": 3 } as Record<string, number>)[a] -
      ({ "Spinach pie": 1, "Beef tacos": 2, "Mystery stew": 3 } as Record<string, number>)[b]));
  });

  it("only lets known nutrition through limits", () => {
    saveRecipe(draft("Light", [[200, "g", "spinach"]]));
    saveRecipe(draft("Unknown", [[300, "g", "dragon fruit"]]));
    expect(listRecipes({ limits: { kcal_max: 600 } }).map((r) => r.title)).toEqual(["Light"]);
  });
});

describe("costing from entered prices", () => {
  it("prices by weight, volume and item, scaled to servings", () => {
    const r = saveRecipe(draft("Pasta", [[500, "g", "beef mince"], [1, "cup", "milk"], [2, null, "onions"], [null, null, "salt"]],
      { servings: 4 }));
    const [mince, milk, onion] = r.lines.map((l) => getIngredient(l.ingredient_id!)!);
    Object.assign(mince, { price: 12, price_amount: 1, price_unit: "kg" }); // $12/kg
    Object.assign(milk, { price: 3.1, price_amount: 2, price_unit: "l" }); // $1.55/L
    Object.assign(onion, { price: 4, price_amount: 1, price_unit: "kg" }); // by weight: 2 onions = 300 g
    expect(unitPrice(milk)).toEqual({ value: 1.55, measure: "l" });
    expect(priceText(mince)).toBe("$12.00 for 1 kg");

    const c = recipeCosting(r, ingredientMap());
    expect(c.lines.map((l) => l.cost)).toEqual([6, 0.3875, 1.2, null]);
    expect([c.total, c.per_serve, c.complete, c.needs_price]).toEqual([7.59, 1.9, true, 0]); // salt has no amount: skipped
    const half = recipeCosting(r, ingredientMap(), 2);
    expect([half.total, half.per_serve]).toEqual([3.79, 1.9]);
  });

  it("says what's missing", () => {
    const r = saveRecipe(draft("Bake", [[2, "cup", "dragon fruit"], [100, "g", "sugar"]]));
    const fruit = getIngredient(r.lines[0].ingredient_id!)!;
    Object.assign(fruit, { price: 5, price_amount: 1, price_unit: "each", grams_per_each: null, density_g_per_ml: null });
    const c = recipeCosting(r, ingredientMap());
    expect(c.lines.map((l) => l.status)).toEqual(["problem", "no_price"]);
    expect(c.lines[0].message).toMatch(/density/);
    expect([c.total, c.complete, c.needs_price]).toEqual([null, false, 2]);
    expect(lineCost(r.lines[0], undefined, 1).status).toBe("unlinked");
  });

  it("keeps everything in one document", () => {
    saveRecipe(draft("One", [[1, null, "egg"]]));
    expect(db().recipes).toHaveLength(1);
    expect(db().ingredients.map((i) => i.name)).toEqual(["egg"]);
    expect(db().next_id).toEqual({ recipes: 1, ingredients: 1 });
  });
});
