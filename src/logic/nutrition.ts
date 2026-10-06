// Calories and macros per serving: from the recipe's own nutrition panel when it has one (many recipe
// sites and recipe cards publish it), otherwise estimated from the ingredients.
//
// Estimates use each ingredient's nutrition per 100 g. New ingredients get values from the built-in
// table (typical reference values for raw or as-sold foods); anything the table doesn't know can be
// typed in on the ingredient's page, and typed values are never overwritten.

import type { IngredientRow, LineRow, RecipeRow } from "../data/schema";
import { ConversionError, toBase, toMeasure } from "./conversions";
import { normaliseName } from "./names";
import { BUILTIN, BUILTIN_EACH, SOFT, SOFT_TAIL } from "./tables";

export const MACROS = ["kcal", "protein", "carbs", "fat"] as const;
export type Macro = (typeof MACROS)[number];
const NEGLIGIBLE = 15; // g or ml: an unknown ingredient this small (a tsp of spice) can't move the totals much
const KJ_PER_KCAL = 4.184;

const TABLE = new Map(Object.entries(BUILTIN).map(([k, v]) => [normaliseName(k), v]));
const EACH = new Map(Object.entries(BUILTIN_EACH).map(([k, v]) => [normaliseName(k), v]));

/** Spellings to try, most specific first: as written, then without leading descriptive words
 * ("extra lean beef mince" -> "lean beef mince"), without any, and without a trailing part word. */
export function nameCandidates(name: string): string[] {
  const words = normaliseName(name).split(" ").filter(Boolean);
  if (words.length && words[words.length - 1] === "leave") words[words.length - 1] = "leaf"; // "leaves" -> "leave"
  const out = [words.join(" ")];
  for (let start = 1; start < words.length; start++) {
    if (!SOFT.has(words[start - 1])) break;
    out.push(words.slice(start).join(" "));
  }
  let core = words.filter((w) => !SOFT.has(w));
  if (!core.length) core = words;
  out.push(core.join(" "));
  while (core.length > 1 && SOFT_TAIL.has(core[core.length - 1])) {
    core = core.slice(0, -1);
    out.push(core.join(" "));
  }
  return out.filter(Boolean).map(normaliseName);
}

export function builtinValues(name: string): [number, number, number, number] | null {
  for (const c of nameCandidates(name)) {
    const v = TABLE.get(c);
    if (v) return v;
  }
  return null;
}

export function builtinEach(name: string): number | null {
  for (const c of nameCandidates(name)) {
    const v = EACH.get(c);
    if (v !== undefined) return v;
  }
  return null;
}

/** Gives an ingredient the table's values if it has none yet. Typed-in values are never touched.
 * `guessedEach` is the category guess it may have been given; a known item weight replaces it. */
export function fillBuiltin(ing: IngredientRow, guessedEach: number | null = null): boolean {
  if (ing.nutrition_source === "user" || ing.kcal_100g !== null) return false;
  const values = builtinValues(ing.name);
  if (!values) return false;
  [ing.kcal_100g, ing.protein_100g, ing.carbs_100g, ing.fat_100g] = values;
  ing.nutrition_source = "builtin";
  const each = builtinEach(ing.name);
  if (each && (ing.grams_per_each === null || ing.grams_per_each === guessedEach)) ing.grams_per_each = each;
  return true;
}

/** "431 kcal" -> 431; "1800 kJ" -> 430 (kcal); "46 g" -> 46; "450 calories" -> 450 */
export function parseNutritionAmount(text: unknown, kind: string): number | null {
  if (text === null || text === undefined) return null;
  if (typeof text === "number") return text;
  const m = /(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)/.exec(String(text));
  if (!m) return null;
  let value = Number(m[1].replace(",", "."));
  const unit = m[2].toLowerCase();
  if (kind === "kcal" && ["kj", "kilojoule", "kilojoules"].includes(unit)) value /= KJ_PER_KCAL;
  if (kind !== "kcal" && unit === "mg") value /= 1000;
  return value;
}

const RECIPE_KEYS: Record<Macro, string> = { kcal: "calories", protein: "protein", carbs: "carbohydrates", fat: "fat" };

export interface Nutrition {
  per_serve: Record<Macro, number | null>;
  source: "recipe" | "estimate" | "mixed";
  complete: boolean; // every macro known; estimates count only when no real ingredient is missing
  missing: string[]; // ingredients whose amount or nutrition is unknown
  missing_ids: (number | null)[]; // their ingredient ids (null: unlinked line)
}

/** The API shape: rounded whole numbers. */
export function macrosOut(n: Nutrition) {
  const r = (v: number | null) => (v === null ? null : Math.round(v));
  return {
    kcal: r(n.per_serve.kcal), protein: r(n.per_serve.protein), carbs: r(n.per_serve.carbs), fat: r(n.per_serve.fat),
    source: n.source, complete: n.complete, missing: n.missing, missing_ids: n.missing_ids,
  };
}

function grams(line: LineRow, ing: IngredientRow): number | null {
  try {
    return toMeasure(line.quantity!, line.unit, "kg", ing) * 1000;
  } catch (e) {
    if (!(e instanceof ConversionError)) throw e;
  }
  try { // a liquid with no density set: water's density is close enough for an estimate
    const [dim, amount] = toBase(line.quantity!, line.unit);
    return dim === "volume" ? amount : null;
  } catch {
    return null;
  }
}

export function estimate(lines: LineRow[], ingredients: Map<number, IngredientRow>, servings: number): Nutrition {
  const totals: Record<Macro, number> = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const missing: string[] = [];
  const missingIds: (number | null)[] = [];
  for (const line of lines) {
    const ing = line.ingredient_id ? ingredients.get(line.ingredient_id) ?? null : null;
    if (line.quantity === null || line.optional || ing?.never_buy) continue; // "salt to taste", garnish, water
    const g = ing ? grams(line, ing) : null;
    const known = ing !== null && ing.kcal_100g !== null;
    if (g === null || !known) {
      const small = g !== null && g <= NEGLIGIBLE;
      if (!small) {
        missing.push(ing ? ing.name : line.name);
        missingIds.push(ing ? ing.id : null);
      }
      continue;
    }
    for (const macro of MACROS) totals[macro] += (g / 100) * ((ing[`${macro}_100g`] as number | null) ?? 0);
  }
  const serves = Math.max(servings || 1, 1);
  return {
    per_serve: { kcal: totals.kcal / serves, protein: totals.protein / serves, carbs: totals.carbs / serves, fat: totals.fat / serves },
    source: "estimate", complete: missing.length === 0, missing, missing_ids: missingIds,
  };
}

/** The recipe's own panel where it gives a value (per serving), the ingredient estimate for anything it doesn't. */
export function recipeNutrition(recipe: RecipeRow, ingredients: Map<number, IngredientRow>): Nutrition {
  const est = estimate(recipe.lines, ingredients, recipe.servings);
  const panel = recipe.nutrition ?? {};
  const own = Object.fromEntries(MACROS.map((m) => [m, parseNutritionAmount(panel[RECIPE_KEYS[m]], m)])) as Record<Macro, number | null>;
  if (!MACROS.some((m) => own[m] !== null)) return est;
  const fromRecipe = MACROS.every((m) => own[m] !== null);
  return {
    per_serve: Object.fromEntries(MACROS.map((m) => [m, own[m] ?? est.per_serve[m]])) as Record<Macro, number | null>,
    source: fromRecipe ? "recipe" : "mixed",
    complete: fromRecipe || est.complete,
    missing: fromRecipe ? [] : est.missing,
    missing_ids: fromRecipe ? [] : est.missing_ids,
  };
}

// --- per-serving limits (the Nutrition filter and the planner's rules) ----------------------

export const LIMIT_KEYS = MACROS.flatMap((m) => [`${m}_min`, `${m}_max`]);
const LABELS: Record<Macro, string> = { kcal: "kcal", protein: "g protein", carbs: "g carbs", fat: "g fat" };

export function activeLimits(limits: Record<string, unknown> | null | undefined): Record<string, number> {
  return Object.fromEntries(Object.entries(limits ?? {})
    .filter(([k, v]) => LIMIT_KEYS.includes(k) && v !== null && v !== "" && v !== undefined)
    .map(([k, v]) => [k, Number(v)]));
}

/** Why a recipe falls outside per-serving limits, or null if it fits. Unknown nutrition never fits:
 * the planner can't promise "under 600 calories" for a recipe it can't measure. Compared on the same
 * rounded whole numbers the recipe list shows. */
export function limitsProblem(n: Nutrition, limits: Record<string, unknown> | null | undefined): string | null {
  const active = activeLimits(limits);
  if (!Object.keys(active).length) return null;
  if (!n.complete) return "Nutrition not known" + (n.missing.length ? ` (missing ${n.missing.slice(0, 2).join(", ")})` : "");
  for (const [key, bound] of Object.entries(active)) {
    const [macro, side] = key.split("_") as [Macro, string];
    const raw = n.per_serve[macro];
    if (raw === null) return "Nutrition not known";
    const value = Math.round(raw);
    if (side === "max" && value > bound) return `${value} ${LABELS[macro]} per serve (max ${bound})`;
    if (side === "min" && value < bound) return `${value} ${LABELS[macro]} per serve (min ${bound})`;
  }
  return null;
}

export function describeLimits(limits: Record<string, unknown> | null | undefined): string[] {
  const active = activeLimits(limits);
  const out: string[] = [];
  for (const macro of MACROS) {
    const lo = active[`${macro}_min`], hi = active[`${macro}_max`];
    if (lo !== undefined && hi !== undefined) out.push(`${lo}–${hi} ${LABELS[macro]}`);
    else if (hi !== undefined) out.push(`≤ ${hi} ${LABELS[macro]}`);
    else if (lo !== undefined) out.push(`≥ ${lo} ${LABELS[macro]}`);
  }
  return out;
}
