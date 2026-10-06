// What's in stock. Amounts are kept in each ingredient's base unit (g, ml or each); things where the
// exact amount doesn't matter (spices, sauces) can be tracked by level instead: have, low or out.
//
// Several batches of one ingredient can exist (bought on different days, different use-by dates).
// Cooking takes from the batch that expires first.

import { db, nextId } from "../data/db";
import type { IngredientRow, PantryRow, PantryUse } from "../data/schema";
import { baseUnit, ConversionError, toUnit } from "./conversions";
import { addDays, today } from "./dates";

export const LOCATIONS = ["pantry", "fridge", "freezer"] as const;
export const LEVELS = ["have", "low", "out"] as const;
export const EXPIRY_ALERT_DAYS = 3;
// Produce that keeps in the cupboard rather than the fridge.
const CUPBOARD_PRODUCE = new Set(["onion", "red onion", "brown onion", "garlic", "potato", "sweet potato", "pumpkin",
  "banana", "shallot", "chat potato", "baby potato"]);

export function defaultLocation(ing: IngredientRow): PantryRow["location"] {
  if (["meat", "seafood", "dairy"].includes(ing.category)) return "fridge";
  if (ing.category === "frozen") return "freezer";
  if (ing.category === "produce" && !CUPBOARD_PRODUCE.has(ing.name)) return "fridge";
  return "pantry";
}

export interface Stock {
  quantity: number; // base unit, from rows with an amount
  level: PantryRow["level"]; // the best level among level-only rows: have > low > out
  rows: number;
  earliest_expiry: string | null;
  unit: string;
}

export const hasSome = (s: Stock) => s.quantity > 0 || s.level === "have" || s.level === "low";

export function liveRows(ingredientIds?: Set<number>): PantryRow[] {
  return db().pantry.filter((r) => !r.deleted && (!ingredientIds || ingredientIds.has(r.ingredient_id)));
}

export function inBase(row: PantryRow, ing: IngredientRow): number | null {
  if (row.quantity === null) return null;
  const base = baseUnit(ing);
  if (row.unit === base) return row.quantity;
  try {
    return toUnit(row.quantity, row.unit, base, ing);
  } catch {
    return null;
  }
}

export function emptyStock(ing: IngredientRow): Stock {
  return { quantity: 0, level: null, rows: 0, earliest_expiry: null, unit: baseUnit(ing) };
}

const RANK: Record<string, number> = { have: 3, low: 2, out: 1 };

export function stock(ingredients: Map<number, IngredientRow>): Map<number, Stock> {
  const out = new Map<number, Stock>();
  for (const row of liveRows(new Set(ingredients.keys()))) {
    const ing = ingredients.get(row.ingredient_id)!;
    let s = out.get(row.ingredient_id);
    if (!s) out.set(row.ingredient_id, (s = emptyStock(ing)));
    s.rows++;
    const amount = inBase(row, ing);
    if (amount !== null) s.quantity += Math.max(amount, 0);
    else if (row.level && (RANK[row.level] ?? 0) > (RANK[s.level ?? ""] ?? 0)) s.level = row.level;
    if (row.expires_on && (!s.earliest_expiry || row.expires_on < s.earliest_expiry)) s.earliest_expiry = row.expires_on;
  }
  return out;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Adds stock, converted to the ingredient's base unit. A matching batch (same place, same use-by
 * date) is topped up instead of adding a row; setting a level replaces the old level row. Doesn't commit. */
export function addStock(ing: IngredientRow, quantity: number | null, unit: string | null, opts: {
  location?: PantryRow["location"] | null; expires_on?: string | null; purchased_on?: string | null;
  level?: PantryRow["level"]; merge?: boolean;
} = {}): PantryRow {
  const base = baseUnit(ing);
  const qty = quantity === null ? null : (unit || base) === base ? quantity : toUnit(quantity, unit, base, ing);
  const location = opts.location || defaultLocation(ing);
  const expires = opts.expires_on ?? null;
  const rows = liveRows(new Set([ing.id]));
  let row: PantryRow | undefined;
  const fresh = (): PantryRow => ({
    id: nextId("pantry"), ingredient_id: ing.id, quantity: null, unit: base, level: null, location,
    purchased_on: null, expires_on: expires, deleted: false,
  });
  if (qty === null) {
    row = rows.find((r) => r.quantity === null);
    if (!row) db().pantry.push((row = fresh()));
    row.level = opts.level || "have";
    row.location = location;
    row.expires_on = expires ?? row.expires_on;
  } else {
    row = opts.merge === false ? undefined
      : rows.find((r) => r.quantity !== null && r.unit === base && r.location === location && r.expires_on === expires);
    if (!row) db().pantry.push((row = { ...fresh(), quantity: 0 }));
    row.quantity = round3((row.quantity ?? 0) + qty);
    row.level = null;
  }
  row.purchased_on = opts.purchased_on ?? row.purchased_on;
  return row;
}

function fifo(rows: PantryRow[]): PantryRow[] {
  return [...rows].sort((a, b) => (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999")
    || (a.purchased_on ?? "9999").localeCompare(b.purchased_on ?? "9999") || a.id - b.id);
}

/** Takes `quantity` (base unit) out of stock, earliest expiry first. Returns what was taken from each
 * row so Undo can put it back. Running short just empties what's there. Doesn't commit. */
export function deduct(ing: IngredientRow, quantity: number): PantryUse[] {
  const taken: PantryUse[] = [];
  let left = quantity;
  for (const row of fifo(liveRows(new Set([ing.id])).filter((r) => r.quantity))) {
    if (left <= 1e-9) break;
    const have = inBase(row, ing);
    if (!have || have <= 0) continue;
    const use = Math.min(have, left);
    const ratio = row.quantity! / have; // the row's own unit per base unit (1 unless stored oddly)
    row.quantity = round3(row.quantity! - use * ratio);
    const emptied = row.quantity <= 1e-6;
    taken.push({ pantry_item_id: row.id, quantity: round3(use * ratio), emptied });
    if (emptied) {
      row.quantity = 0;
      row.deleted = true;
    }
    left -= use;
  }
  return taken;
}

export function putBack(taken: PantryUse[] | null) {
  for (const t of taken ?? []) {
    const row = db().pantry.find((r) => r.id === t.pantry_item_id);
    if (!row) continue;
    row.quantity = round3((row.quantity ?? 0) + t.quantity);
    row.deleted = false;
  }
}

/** A recipe line's amount in the ingredient's base unit, or null when it can't be converted. */
export function lineAmount(quantity: number, unit: string | null, ing: IngredientRow): number | null {
  try {
    return toUnit(quantity, unit, baseUnit(ing), ing);
  } catch (e) {
    if (e instanceof ConversionError) return null;
    throw e;
  }
}

export function expiringSoon(): string {
  return addDays(today(), EXPIRY_ALERT_DAYS);
}
