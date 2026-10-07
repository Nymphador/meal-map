// Other spellings for an ingredient ("fine breadcrumbs", "dried breadcrumbs" for breadcrumb). Adding one
// links every recipe line using that wording, now and later. When the app had already made the wording an
// ingredient of its own, that one is merged in: its recipe lines, spellings, pantry stock (and price, if
// this one has none) move here, and the returned undo puts everything back.

import { db } from "../data/db";
import type { IngredientRow, PriceUnit } from "../data/schema";
import { baseUnit } from "./conversions";
import { ApiError } from "./errors";
import { linkAlias } from "./ingredients";
import { normaliseName } from "./names";

export interface MergeUndo {
  target_id: number;
  merged_id: number;
  lines: { recipe_id: number; index: number }[];
  pantry_moved: number[];
  pantry_removed: number[];
  merged_aliases: string[];
  target_aliases: string[];
  target_price: { price: number | null; price_amount: number | null; price_unit: PriceUnit | null; price_updated: string | null } | null;
}

function merge(from: IngredientRow, into: IngredientRow): MergeUndo {
  const undo: MergeUndo = {
    target_id: into.id, merged_id: from.id, lines: [], pantry_moved: [], pantry_removed: [],
    merged_aliases: [...from.aliases], target_aliases: [...into.aliases], target_price: null,
  };
  for (const recipe of db().recipes) {
    recipe.lines.forEach((line, index) => {
      if (line.ingredient_id === from.id) {
        line.ingredient_id = into.id;
        undo.lines.push({ recipe_id: recipe.id, index });
      }
    });
  }
  // Pantry stock moves when it's counted the same way; otherwise it goes (as an amount it couldn't be added up).
  for (const row of db().pantry) {
    if (row.ingredient_id !== from.id || row.deleted) continue;
    if (row.quantity === null || row.unit === baseUnit(into)) {
      row.ingredient_id = into.id;
      undo.pantry_moved.push(row.id);
    } else {
      row.deleted = true;
      undo.pantry_removed.push(row.id);
    }
  }
  if (into.price === null && from.price !== null) {
    undo.target_price = { price: into.price, price_amount: into.price_amount, price_unit: into.price_unit, price_updated: into.price_updated };
    into.price = from.price;
    into.price_amount = from.price_amount;
    into.price_unit = from.price_unit;
    into.price_updated = from.price_updated;
  }
  into.aliases = [...new Set([...into.aliases, ...from.aliases, from.name])].filter((a) => a !== into.name);
  from.aliases = [];
  from.deleted = true;
  return undo;
}

/** Returns how many recipe lines now link here, the name of an ingredient merged in, and its undo. Doesn't commit. */
export function addSpelling(ing: IngredientRow, text: string): { linked: number; merged: string | null; undo: MergeUndo | null } {
  const key = normaliseName(text);
  if (!key) throw new ApiError(422, "Type the spelling to add");
  if (key === ing.name) return { linked: 0, merged: null, undo: null };
  const other = db().ingredients.find((i) => !i.deleted && i.id !== ing.id && i.name === key);
  if (other) {
    const undo = merge(other, ing);
    return { linked: undo.lines.length, merged: other.name, undo };
  }
  return { linked: linkAlias(text, ing), merged: null, undo: null };
}

/** Puts a merge back exactly. Doesn't commit. */
export function undoMerge(undo: MergeUndo) {
  const into = db().ingredients.find((i) => i.id === undo.target_id);
  const from = db().ingredients.find((i) => i.id === undo.merged_id);
  if (!into || !from) throw new ApiError(404, "Ingredient not found");
  from.deleted = false;
  from.aliases = [...undo.merged_aliases];
  into.aliases = [...undo.target_aliases];
  if (undo.target_price) Object.assign(into, undo.target_price);
  const recipes = new Map(db().recipes.map((r) => [r.id, r]));
  for (const { recipe_id, index } of undo.lines) {
    const line = recipes.get(recipe_id)?.lines[index];
    if (line && line.ingredient_id === into.id) line.ingredient_id = from.id;
  }
  for (const row of db().pantry) {
    if (undo.pantry_moved.includes(row.id)) row.ingredient_id = from.id;
    if (undo.pantry_removed.includes(row.id)) row.deleted = false;
  }
}

export interface SpellingSuggestion {
  text: string;
  recipes: number;
  linked_to: { id: number; name: string } | null;
}

/** Wordings in recipes that contain all of this ingredient's words ("fine breadcrumb" for breadcrumb) but
 * don't link here yet, most used first, with what they link to now. */
export function spellingSuggestions(ing: IngredientRow, limit = 20): SpellingSuggestion[] {
  const words = new Set(ing.name.split(" ").filter(Boolean));
  if (!words.size) return [];
  const names = new Map(db().ingredients.filter((i) => !i.deleted).map((i) => [i.id, i.name]));
  const found = new Map<string, { text: string; recipes: Set<number>; linked_to: SpellingSuggestion["linked_to"] }>();
  for (const recipe of db().recipes) {
    if (recipe.deleted) continue;
    for (const line of recipe.lines) {
      const key = normaliseName(line.name);
      if (!key || key === ing.name || ing.aliases.includes(key) || line.ingredient_id === ing.id) continue;
      const lineWords = new Set(key.split(" "));
      if (![...words].every((w) => lineWords.has(w))) continue;
      const entry = found.get(key) ?? { text: key, recipes: new Set<number>(), linked_to: null };
      entry.recipes.add(recipe.id);
      const linked = line.ingredient_id !== null ? names.get(line.ingredient_id) : undefined;
      if (linked && line.ingredient_id !== null) entry.linked_to = { id: line.ingredient_id, name: linked };
      found.set(key, entry);
    }
  }
  return [...found.values()]
    .sort((a, b) => b.recipes.size - a.recipes.size || a.text.localeCompare(b.text))
    .slice(0, limit)
    .map((e) => ({ text: e.text, recipes: e.recipes.size, linked_to: e.linked_to }));
}
