// What a recipe costs, from the prices the user enters on each ingredient ("$4.50 for 1 kg").
// This is the cost of what the recipe uses (proportional); rounding up to whole packs belongs to
// the shopping list.

import type { IngredientRow, LineRow, PriceUnit, RecipeRow } from "../data/schema";
import { ConversionError, measureOf, toMeasure } from "./conversions";

export const PRICE_UNITS: PriceUnit[] = ["g", "kg", "ml", "l", "each"];

export function hasPrice(ing: IngredientRow): boolean {
  return ing.price !== null && ing.price >= 0 && !!ing.price_amount && ing.price_amount > 0 && !!ing.price_unit;
}

/** Dollars per kg, per L or per item, from the entered price. */
export function unitPrice(ing: IngredientRow): { value: number; measure: string } | null {
  if (!hasPrice(ing)) return null;
  const measure = measureOf(ing.price_unit!);
  const amount = toMeasure(ing.price_amount!, ing.price_unit, measure, null); // same dimension: no ingredient needed
  return amount > 0 ? { value: ing.price! / amount, measure } : null;
}

/** "$4.50 for 1 kg" */
export function priceText(ing: IngredientRow): string | null {
  if (!hasPrice(ing)) return null;
  const amount = ing.price_unit === "each"
    ? `${ing.price_amount} item${ing.price_amount === 1 ? "" : "s"}`
    : `${ing.price_amount} ${ing.price_unit}`;
  return `$${ing.price!.toFixed(2)} for ${amount}`;
}

export interface LineCost {
  index: number;
  name: string;
  ingredient_id: number | null;
  ingredient_name: string | null;
  status: "ok" | "skip" | "unlinked" | "no_price" | "problem";
  message: string;
  cost: number | null; // at the costing's servings
}

/** One line's cost, or why it can't be worked out. `factor` scales the recipe's amounts. */
export function lineCost(line: LineRow, ing: IngredientRow | undefined, factor: number, index = 0): LineCost {
  const out: LineCost = {
    index, name: line.name, ingredient_id: ing?.id ?? null, ingredient_name: ing?.name ?? null,
    status: "ok", message: "", cost: null,
  };
  if (!ing) return { ...out, status: "unlinked", message: "Not linked to an ingredient" };
  if (ing.never_buy) return { ...out, status: "skip", message: "Never bought" };
  if (line.quantity === null) return { ...out, status: "skip", message: "No amount (to taste)" };
  const unit = unitPrice(ing);
  if (!unit) return { ...out, status: "no_price", message: "No price yet" };
  try {
    out.cost = Math.round(toMeasure(line.quantity * factor, line.unit, unit.measure, ing) * unit.value * 10000) / 10000;
  } catch (e) {
    if (!(e instanceof ConversionError)) throw e;
    return { ...out, status: "problem", message: e.message };
  }
  return out;
}

export interface Costing {
  recipe_id: number;
  servings: number;
  lines: LineCost[];
  total: number | null; // what's priced so far
  per_serve: number | null;
  complete: boolean; // every line that's bought has a cost
  priced: number;
  needs_price: number; // lines still missing a price or conversion
}

export function recipeCosting(recipe: RecipeRow, ingredients: Map<number, IngredientRow>, servings?: number): Costing {
  const serves = servings || recipe.servings || 1;
  const factor = recipe.servings ? serves / recipe.servings : 1;
  const lines = recipe.lines.map((l, i) => lineCost(l, l.ingredient_id ? ingredients.get(l.ingredient_id) : undefined, factor, i));
  const counted = lines.filter((l) => l.status !== "skip");
  const costs = counted.filter((l) => l.cost !== null).map((l) => l.cost!);
  const total = costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  return {
    recipe_id: recipe.id, servings: serves, lines,
    total, per_serve: total !== null ? Math.round((total / serves) * 100) / 100 : null,
    complete: costs.length === counted.length,
    priced: costs.length, needs_price: counted.length - costs.length,
  };
}
