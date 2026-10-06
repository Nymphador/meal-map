import { describe, expect, it } from "vitest";
import type { IngredientRow, LineRow } from "../data/schema";
import { newIngredient } from "./ingredients";
import { builtinEach, builtinValues, estimate, limitsProblem, parseNutritionAmount } from "./nutrition";

describe("built-in table", () => {
  it.each([
    ["olive oil", 884],
    ["Extra virgin olive oil", 884],
    ["chicken thigh fillets", 146],
    ["brown onion", 40],
    ["extra lean beef mince", 176], // the nearest specific entry, not plain mince
    ["salt reduced soy sauce", 53],
    ["ground black pepper", 251],
    ["light coconut milk", 75],
    ["free range eggs", 143],
    ["baby spinach leaves", 23],
    ["almond milk", null], // not milk: unknown rather than wrong
    ["dragon fruit", null],
  ])("%s", (name, kcal) => expect(builtinValues(name)?.[0] ?? null).toBe(kcal));

  it("knows item weights", () => {
    expect(builtinEach("bay leaves")).toBe(0.2);
    expect(builtinEach("large brown onion")).toBe(150);
    expect(builtinEach("dragon fruit")).toBeNull();
  });
});

describe("parseNutritionAmount", () => {
  it.each([
    ["431 kcal", "kcal", 431],
    ["450 calories", "kcal", 450],
    ["46 g", "protein", 46],
    ["12.5g", "fat", 12.5],
    ["500 mg", "fat", 0.5],
    [null, "kcal", null],
    ["n/a", "kcal", null],
    [300, "kcal", 300],
  ] as const)("%s", (text, kind, expected) => expect(parseNutritionAmount(text, kind)).toBe(expected));

  it("converts kJ", () => expect(parseNutritionAmount("1800 kJ", "kcal")).toBeCloseTo(430.2, 1));
});

function ing(id: number, name: string, values: Partial<IngredientRow> = {}): IngredientRow {
  return { ...newIngredient(name, "pantry", "g"), id, ...values };
}
const macros = (kcal: number, p: number, c: number, f: number) =>
  ({ kcal_100g: kcal, protein_100g: p, carbs_100g: c, fat_100g: f });
const l = (id: number | null, qty: number | null, unit: string | null, name = "x", optional = false): LineRow =>
  ({ ingredient_id: id, quantity: qty, unit, name, raw_text: name, note: null, optional });

describe("estimate", () => {
  it("adds up per serving", () => {
    const ings = new Map([
      [1, ing(1, "chicken", macros(120, 22.5, 0, 2.6))], [2, ing(2, "rice", macros(360, 6.6, 79, 0.6))],
      [3, ing(3, "oil", { ...macros(884, 0, 0, 100), density_g_per_ml: 0.92 })],
      [4, ing(4, "onion", { ...macros(40, 1.1, 9.3, 0.1), grams_per_each: 150 })],
      [5, ing(5, "water", { never_buy: true })], [6, ing(6, "mystery spice")],
    ]);
    const lines = [l(1, 400, "g"), l(2, 0.2, "kg"), l(3, 1, "tbsp"), l(4, 1, null), l(5, 500, "ml"), l(6, 1, "tsp"),
      l(1, null, null), l(2, 100, "g", "x", true)];
    const n = estimate(lines, ings, 2);
    expect(n.per_serve.kcal).toBeCloseTo((4 * 120 + 2 * 360 + 15 * 0.92 * 8.84 + 1.5 * 40) / 2);
    expect(n.per_serve.protein).toBeCloseTo((4 * 22.5 + 2 * 6.6 + 1.5 * 1.1) / 2);
    expect([n.complete, n.missing]).toEqual([true, []]); // the tsp of unknown spice is too small to matter
  });

  it("flags real gaps", () => {
    const ings = new Map([[1, ing(1, "chicken", macros(120, 22.5, 0, 2.6))], [2, ing(2, "dragon fruit")]]);
    const n = estimate([l(1, 400, "g"), l(2, 200, "g"), l(null, 2, null, "widgets")], ings, 2);
    expect([n.complete, n.missing]).toEqual([false, ["dragon fruit", "widgets"]]);
    expect(limitsProblem(n, { kcal_max: 600 })).toMatch(/^Nutrition not known/);
  });
});
