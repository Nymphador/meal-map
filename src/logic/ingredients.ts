// Canonical ingredients: every spelling a recipe uses ("boneless skinless chicken thighs",
// "chicken thigh fillets") resolves to one ingredient. Saving a recipe links every line straight away:
// to an existing ingredient when it's clearly the same thing, otherwise to a new one. Linking a line
// by hand remembers the spelling, so it links automatically everywhere from then on.

import { db, nextId } from "../data/db";
import type { IngredientRow } from "../data/schema";
import { DESCRIPTORS, guessCategory, guessDefaultUnit, nameWords, normaliseName } from "./names";
import { fillBuiltin } from "./nutrition";
import { DEFAULT_DENSITY, DEFAULT_GRAMS_EACH } from "./tables";

export function liveIngredients(): IngredientRow[] {
  return db().ingredients.filter((i) => !i.deleted);
}

export function ingredientMap(): Map<number, IngredientRow> {
  return new Map(db().ingredients.map((i) => [i.id, i]));
}

export function getIngredient(id: number): IngredientRow | undefined {
  return db().ingredients.find((i) => i.id === id && !i.deleted);
}

export function resolveIngredientId(name: string): number | null {
  const key = normaliseName(name);
  if (!key) return null;
  const live = liveIngredients();
  return (live.find((i) => i.aliases.includes(key)) ?? live.find((i) => i.name === key))?.id ?? null;
}

/** Existing ingredients that a recipe's wording probably means, best first.
 * Score = share of the ingredient's own words found in the text (all of "chicken breast" appears in
 * "boneless chicken breasts"), with a small bonus for covering more of the text. */
export function suggestExisting(rawName: string, limit = 5): [IngredientRow, number][] {
  const wanted = nameWords(rawName);
  if (!wanted.size) return [];
  const scored: [IngredientRow, number][] = [];
  for (const ing of liveIngredients()) {
    let best = 0;
    for (const candidate of [ing.name, ...ing.aliases]) {
      const words = nameWords(candidate);
      if (!words.size) continue;
      const common = [...wanted].filter((w) => words.has(w)).length;
      if (common) best = Math.max(best, common / words.size + (0.1 * common) / wanted.size);
    }
    if (best >= 0.5) scored.push([ing, Math.round(best * 1000) / 1000]);
  }
  scored.sort((a, b) => b[1] - a[1] || a[0].name.length - b[0].name.length);
  return scored.slice(0, limit);
}

export function newIngredient(name: string, category: string, defaultUnit: string): IngredientRow {
  return {
    id: 0, name, category, default_unit: defaultUnit, grams_per_each: null, density_g_per_ml: null,
    is_staple: false, low_threshold: null, never_buy: false,
    kcal_100g: null, protein_100g: null, carbs_100g: null, fat_100g: null, nutrition_source: null,
    price: null, price_amount: null, price_unit: null, price_updated: null, aliases: [], deleted: false,
  };
}

/** Finds or makes an ingredient by name (a deleted one comes back). New ones get the built-in
 * nutrition and rough conversions for their category. Doesn't commit. */
// Things a recipe uses that nobody shops for.
const NEVER_BUY = new Set(["water", "ice", "boiling water", "hot water", "cold water", "warm water", "tap water", "ice cube"]);

export function createIngredient(name: string, category?: string, defaultUnit = "g"): IngredientRow {
  const clean = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!clean) throw new Error("An ingredient needs a name");
  const existing = db().ingredients.find((i) => i.name === clean);
  if (existing) {
    existing.deleted = false;
    return existing;
  }
  const cat = category ?? guessCategory(clean);
  const ing = newIngredient(clean, cat, defaultUnit);
  ing.id = nextId("ingredients");
  const guessedEach = DEFAULT_GRAMS_EACH[cat] ?? 100;
  ing.density_g_per_ml = DEFAULT_DENSITY[cat] ?? 1;
  ing.grams_per_each = guessedEach;
  fillBuiltin(ing, guessedEach); // may replace the guessed item weight with a known one
  ing.never_buy = NEVER_BUY.has(normaliseName(clean));
  const key = normaliseName(clean);
  if (key !== clean) addAlias(ing, key);
  db().ingredients.push(ing);
  return ing;
}

/** Gives an alias to one ingredient (aliases are unique across ingredients). */
function addAlias(ing: IngredientRow, key: string) {
  for (const other of db().ingredients) {
    if (other !== ing) other.aliases = other.aliases.filter((a) => a !== key);
  }
  if (key !== ing.name && !ing.aliases.includes(key)) ing.aliases.push(key);
}

/** Remembers rawName as a spelling of ing and links every recipe line that uses it, including lines
 * the app had linked to something else (that's how a wrong guess gets fixed). Returns how many recipe
 * lines changed. Doesn't commit. */
export function linkAlias(rawName: string, ing: IngredientRow): number {
  const key = normaliseName(rawName);
  if (!key) return 0;
  addAlias(ing, key);
  let linked = 0;
  for (const recipe of db().recipes) {
    for (const line of recipe.lines) {
      if (line.ingredient_id !== ing.id && normaliseName(line.name) === key) {
        line.ingredient_id = ing.id;
        linked++;
      }
    }
  }
  return linked;
}

// Extra words that don't change what you'd buy: "coriander leaves" is coriander.
const SOFT_EXTRA = new Set(["leaf", "sprig", "stalk", "clove", "piece", "bunch", "can", "tin", "jar", "packet", "fillet",
  "stick", "head", "bulb", "wedge", "zest", "juice"]);

/** Links recipe wording to an existing ingredient when it's clearly the same thing, otherwise creates
 * one. "salt and pepper" -> salt; "baking soda / bi-carb" -> baking soda. */
export function resolveOne(raw: string, unit: string | null): IngredientRow | null {
  const text = raw.split(",")[0];
  const parts = [text, text.split(/\s+(?:and|or|&)\s+|\s*\/\s*/)[0]];
  for (const candidate of parts) {
    const wanted = nameWords(candidate);
    for (const [ing] of suggestExisting(candidate, 5)) {
      const words = nameWords(ing.name);
      const inside = [...words].every((w) => wanted.has(w));
      const extra = [...wanted].filter((w) => !words.has(w));
      if (words.size && inside && extra.every((w) => SOFT_EXTRA.has(w))) return ing;
    }
  }
  const first = parts[parts.length - 1];
  const name = normaliseName(first).split(" ").filter((w) => w && !DESCRIPTORS.has(w)).join(" ");
  if (!name) return null;
  return createIngredient(name, guessCategory(name), guessDefaultUnit(unit));
}

/** Gives every unlinked line of these recipes an ingredient. Returns how many lines were linked.
 * Doesn't commit. */
export function autoResolveLines(recipeIds?: number[]): number {
  let linked = 0;
  const seen = new Set<string>();
  for (const recipe of db().recipes) {
    if (recipe.deleted || (recipeIds && !recipeIds.includes(recipe.id))) continue;
    for (const line of recipe.lines) {
      if (line.ingredient_id) continue;
      const key = normaliseName(line.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const ing = resolveOne(line.name, line.unit);
      if (ing) linked += linkAlias(line.name, ing);
    }
  }
  return linked;
}

/** How many (live) recipes use each ingredient. */
export function recipeCounts(): Map<number, number> {
  const counts = new Map<number, number>();
  for (const r of db().recipes) {
    if (r.deleted) continue;
    for (const id of new Set(r.lines.map((l) => l.ingredient_id).filter((x): x is number => !!x))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}
