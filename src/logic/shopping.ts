// The weekly shopping list, worked out live from the meal plan and the pantry.
//
// 1. Needs: every planned meal's ingredients, scaled to its servings, merged per ingredient in the
//    ingredient's base unit (200 g + 0.5 kg = 700 g).
// 2. Minus what's in the pantry. Staples (oil, onions...) join only when the week would leave them below
//    their low-stock threshold, and then enough is bought to end the week above it.
// 3. Rounded up to whole packs of the size the user priced ("$3.50 for 500 g" -> 2 packs for 700 g).
//    What's left over goes into the pantry when the shop is done.
//
// The user's changes (removed lines, amounts, ticks, prices paid, extras like toilet paper) are stored as
// shopping items and applied on top, so they survive plan changes. A done shop is frozen as a snapshot.

import { db, nextId, nowIso } from "../data/db";
import type { IngredientRow, PlanRow, ShoppingItemRow, ShoppingListRow } from "../data/schema";
import { getSetting } from "../server/settings";
import { fmtAmount } from "./amounts";
import { hasPrice, priceText } from "./costing";
import { baseUnit, toUnit } from "./conversions";
import { today } from "./dates";
import { ApiError } from "./errors";
import { ingredientMap, resolveIngredientId } from "./ingredients";
import { addStock, emptyStock, lineAmount, stock, type Stock } from "./pantry";

const TOLERANCE = 0.97; // recipe amounts are rough: being 3% short of a pack doesn't buy another pack

export interface Need {
  ingredient: IngredientRow;
  qty: number; // base unit
  as_needed: boolean; // some recipe line gave no amount ("salt to taste")
  meals: string[];
  unconverted: string[];
}

/** What the week's planned (not yet cooked) meals need, per ingredient. */
export function planNeeds(plan: PlanRow): [Map<number, Need>, string[]] {
  const ings = ingredientMap();
  const recipes = new Map(db().recipes.filter((r) => !r.deleted).map((r) => [r.id, r]));
  const needs = new Map<number, Need>();
  const unlinked: string[] = [];
  for (const meal of db().meals) {
    if (meal.plan_id !== plan.id || meal.status !== "planned" || !meal.recipe_id) continue;
    const recipe = recipes.get(meal.recipe_id);
    if (!recipe) continue;
    const factor = recipe.servings ? meal.servings / recipe.servings : 1;
    for (const line of recipe.lines) {
      if (line.optional) continue;
      const ing = line.ingredient_id ? ings.get(line.ingredient_id) : undefined;
      if (!ing) {
        unlinked.push(line.name);
        continue;
      }
      if (ing.never_buy) continue;
      let n = needs.get(ing.id);
      if (!n) needs.set(ing.id, (n = { ingredient: ing, qty: 0, as_needed: false, meals: [], unconverted: [] }));
      if (!n.meals.includes(recipe.title)) n.meals.push(recipe.title);
      if (line.quantity === null) {
        n.as_needed = true;
        continue;
      }
      const amount = lineAmount(line.quantity * factor, line.unit, ing);
      if (amount === null) n.unconverted.push(line.raw_text || line.name);
      else n.qty += amount;
    }
  }
  return [needs, unlinked];
}

/** The pack the user priced, in the ingredient's base unit (500 g, 1000 ml, 6 each). */
export function packSize(ing: IngredientRow): number | null {
  if (!hasPrice(ing)) return null;
  try {
    const size = toUnit(ing.price_amount!, ing.price_unit, baseUnit(ing), ing);
    return size > 0 ? size : null;
  } catch {
    return null;
  }
}

export interface PackPlan {
  count: number;
  size: number; // base unit
  size_text: string; // "500 g"
  price_each: number;
  cost: number;
  bought: number;
  leftover: number;
  buy_text: string; // "2 × 500 g"
  leftover_text: string | null;
}

/** Whole packs covering `need` (base unit), or null when the ingredient has no usable price. */
export function packPlan(ing: IngredientRow, need: number | null): PackPlan | null {
  const size = packSize(ing);
  if (size === null || need === null) return null;
  const unit = baseUnit(ing);
  const count = Math.max(1, Math.ceil((need * TOLERANCE) / size - 1e-9));
  const bought = count * size;
  const leftover = Math.max(0, bought - need);
  // Packs are described the way the user priced them ("1 kg" of onions), whatever unit the pantry counts in.
  const amount = Math.round(ing.price_amount! * 1000) / 1000;
  const single = ing.price_unit === "each" && amount === 1;
  const sizeText = ing.price_unit === "each" ? (single ? "1" : `pack of ${amount}`) : `${amount} ${ing.price_unit === "l" ? "L" : ing.price_unit}`;
  const leftoverShown = unit === "each" ? Math.round(leftover) : leftover;
  return {
    count, size, size_text: sizeText, price_each: ing.price!, cost: Math.round(count * ing.price! * 100) / 100, bought, leftover,
    buy_text: single ? `${count}` : `${count} × ${sizeText}`,
    leftover_text: leftoverShown >= Math.max(1e-6, size * 0.02) ? fmtAmount(leftoverShown, unit) : null,
  };
}

export function getList(plan: PlanRow): [ShoppingListRow, boolean] {
  let lst = db().shopping_lists.find((l) => l.plan_id === plan.id);
  if (lst) return [lst, false];
  lst = { id: nextId("shopping_lists"), plan_id: plan.id, status: "open", done_at: null, snapshot: null };
  db().shopping_lists.push(lst);
  return [lst, true];
}

export function getListById(id: number): [ShoppingListRow, PlanRow] {
  const lst = db().shopping_lists.find((l) => l.id === id);
  if (!lst) throw new ApiError(404, "Shopping list not found");
  const plan = db().plans.find((p) => p.id === lst.plan_id)!;
  return [lst, plan];
}

function overrides(lst: ShoppingListRow): Map<string, ShoppingItemRow> {
  return new Map(db().shopping_items.filter((i) => i.list_id === lst.id)
    .sort((a, b) => a.position - b.position || a.id - b.id).map((i) => [i.key, i]));
}

function stockText(s: Stock, unit: string): string | null {
  if (s.quantity > 0) return fmtAmount(s.quantity, unit);
  return ({ have: "have some", low: "running low", out: "out" } as Record<string, string>)[s.level ?? ""] ?? null;
}

function needText(qty: number | null, unit: string): string {
  if (qty !== null && qty <= 1e-3) return "1 pack"; // a staple to restock: the pack rounding decides how much
  if (unit === "each" && qty !== null) return String(Math.ceil(qty - 0.05)); // nobody buys 1.8 heads of garlic
  return fmtAmount(qty, unit);
}

export interface ShopLine {
  key: string;
  ingredient_id: number | null;
  name: string;
  category: string;
  source: "plan" | "staple" | "plan+staple" | "manual" | "edited";
  meals: string[];
  needed: number | null;
  unit: string | null;
  needed_text: string;
  in_stock: string | null;
  unknown_stock: boolean;
  qty_overridden: boolean;
  unconverted: string[];
  price_text: string | null; // what the user entered: "$3.50 for 500 g"
  pack: PackPlan | null;
  est_price: number | null;
  removed: boolean;
  ticked: boolean;
  actual_price: number | null;
  position: number;
}

function line(key: string, ing: IngredientRow, qty: number | null, need: Need | undefined, s: Stock, source: ShopLine["source"],
  edit: ShoppingItemRow | undefined, unknownStock: boolean, overridden: boolean, name?: string | null): ShopLine {
  const unit = baseUnit(ing);
  const pack = packPlan(ing, qty);
  return {
    key, ingredient_id: ing.id, name: name || ing.name, category: ing.category, source, meals: need?.meals ?? [],
    needed: qty, unit, needed_text: needText(qty, unit), in_stock: stockText(s, unit), unknown_stock: unknownStock,
    qty_overridden: overridden, unconverted: need?.unconverted ?? [], price_text: priceText(ing),
    pack, est_price: pack?.cost ?? null, removed: !!edit?.removed, ticked: !!edit?.ticked,
    actual_price: edit?.actual_price ?? null, position: edit?.position ?? 0,
  };
}

export function buildList(plan: PlanRow, lstIn?: ShoppingListRow) {
  const lst = lstIn ?? getList(plan)[0];
  const info = { id: lst.id, plan_id: plan.id, week_start: plan.week_start, status: lst.status, done_at: lst.done_at };
  if (lst.status === "done" && lst.snapshot) return { ...(lst.snapshot as object), list: info } as ReturnType<typeof liveList>;
  return liveList(plan, lst, info);
}

function liveList(plan: PlanRow, lst: ShoppingListRow, info: { id: number; plan_id: number; week_start: string; status: string; done_at: string | null }) {
  const [needs, unlinked] = planNeeds(plan);
  const edits = overrides(lst);
  const ings = ingredientMap();
  const staples = db().ingredients.filter((i) => i.is_staple && !i.never_buy && !i.deleted);
  const manualIds = new Set([...edits.values()].filter((e) => e.is_manual && e.ingredient_id).map((e) => e.ingredient_id!));
  const editIds = [...edits].filter(([k, e]) => k.startsWith("i:") && e.qty_needed !== null).map(([k]) => Number(k.slice(2)));
  const allIds = new Set([...needs.keys(), ...staples.map((i) => i.id), ...manualIds, ...editIds].filter((id) => ings.has(id)));
  const st = stock(new Map([...allIds].map((id) => [id, ings.get(id)!])));

  const lines: ShopLine[] = [];
  const covered: { ingredient_id: number; name: string; needed: string; in_stock: string | null; meals: string[] }[] = [];
  for (const iid of [...allIds].filter((i) => !manualIds.has(i)).sort((a, b) => ings.get(a)!.name.localeCompare(ings.get(b)!.name))) {
    const ing = ings.get(iid)!;
    const unit = baseUnit(ing);
    const need = needs.get(iid);
    const s = st.get(iid) ?? emptyStock(ing);
    const edit = edits.get(`i:${iid}`);
    const planned = need?.qty ?? 0;
    let qty: number | null = Math.max(0, planned - s.quantity);
    if (s.quantity <= 0 && (s.level === "have" || s.level === "low")) qty = 0; // tracked by level only: there's some
    let source: ShopLine["source"] | null = need ? "plan" : null;
    let unknownStock = false;
    if (ing.is_staple) {
      const threshold = ing.low_threshold ?? 0;
      if (s.rows === 0) unknownStock = true;
      const low = ((s.level === "low" || s.level === "out") && s.quantity <= 0) || (s.level === null && s.quantity - planned < threshold) || s.rows === 0;
      if (low) {
        const restock = s.level === null || s.quantity > 0 ? planned - s.quantity + threshold : 0;
        qty = Math.max(qty, restock, 1e-6); // at least one pack
        source = need ? "plan+staple" : "staple";
      }
    }
    const hasSomeStock = s.quantity > 0 || s.level === "have" || s.level === "low";
    if (need && need.as_needed && !need.qty && !hasSomeStock) qty = null;
    const overridden = !!edit && edit.qty_needed !== null;
    if (overridden) {
      qty = edit!.qty_needed;
      source = source ?? "edited";
    }
    if (!source) continue;
    if (qty !== null && qty <= 1e-9 && !overridden) {
      if (need) covered.push({ ingredient_id: iid, name: ing.name, needed: fmtAmount(planned, unit), in_stock: stockText(s, unit), meals: need.meals });
      continue;
    }
    lines.push(line(`i:${iid}`, ing, qty, need, s, source, edit, unknownStock, overridden));
  }

  for (const [key, edit] of edits) {
    if (!edit.is_manual) continue;
    const ing = edit.ingredient_id ? ings.get(edit.ingredient_id) : undefined;
    if (ing) {
      lines.push(line(key, ing, edit.qty_needed, undefined, st.get(ing.id) ?? emptyStock(ing), "manual", edit, false, edit.qty_needed !== null, edit.name));
    } else {
      lines.push({
        key, ingredient_id: null, name: edit.name ?? "", category: "other", source: "manual", meals: [], needed: edit.qty_needed,
        unit: edit.unit, needed_text: edit.qty_needed ? `${edit.qty_needed} ${edit.unit ?? ""}`.trim() : "", in_stock: null,
        unknown_stock: false, qty_overridden: false, unconverted: [], price_text: null, pack: null, est_price: null,
        removed: edit.removed, ticked: edit.ticked, actual_price: edit.actual_price, position: edit.position,
      });
    }
  }

  const active = lines.filter((l) => !l.removed);
  const priced = active.filter((l) => l.est_price !== null);
  const spend = active.reduce((t, l) => t + (l.actual_price ?? l.est_price ?? 0), 0);
  return {
    list: info,
    items: active, removed: lines.filter((l) => l.removed), covered, unlinked: [...new Set(unlinked)].sort(),
    totals: {
      estimate: Math.round(priced.reduce((t, l) => t + l.est_price!, 0) * 100) / 100,
      spend: Math.round(spend * 100) / 100, // prices paid where entered, estimates for the rest
      unpriced: active.filter((l) => l.est_price === null && l.ingredient_id !== null).length,
    },
    budget: plan.budget ?? getSetting<number | null>("weekly_budget") ?? null,
  };
}

export type ShoppingData = ReturnType<typeof liveList>;

// --- edits -----------------------------------------------------------------------------------

export function editItem(lst: ShoppingListRow, key: string, changes: Partial<ShoppingItemRow>) {
  let row = db().shopping_items.find((i) => i.list_id === lst.id && i.key === key);
  if (!row) {
    if (!key.startsWith("i:")) throw new ApiError(404, "Item not found");
    row = { id: nextId("shopping_items"), list_id: lst.id, key, ingredient_id: Number(key.slice(2)), is_manual: false, name: null,
      qty_needed: null, unit: null, removed: false, ticked: false, actual_price: null, position: 0 };
    db().shopping_items.push(row);
  }
  Object.assign(row, changes);
}

/** An extra like "toilet paper", or "milk" (which links to the ingredient so it gets priced). */
export function addExtra(lst: ShoppingListRow, name: string, quantity: number | null, unit: string | null) {
  const iid = resolveIngredientId(name);
  const ing = iid ? db().ingredients.find((i) => i.id === iid) : undefined;
  let qty = quantity;
  if (ing && quantity !== null) {
    qty = lineAmount(quantity, unit, ing);
    unit = baseUnit(ing);
  }
  db().shopping_items.push({
    id: nextId("shopping_items"), list_id: lst.id, key: `m:${Math.random().toString(36).slice(2, 14)}`, is_manual: true,
    name: name.trim(), ingredient_id: ing?.id ?? null, qty_needed: qty, unit, removed: false, ticked: false,
    actual_price: null, position: db().shopping_items.filter((i) => i.list_id === lst.id).length,
  });
}

// --- shop done ---------------------------------------------------------------------------

/** Bought items go into the pantry (whole packs, so leftovers count as stock). A price paid for a line
 * becomes that ingredient's price per pack, so costs stay true to what you pay. The list is then frozen. */
export function completeShop(plan: PlanRow, lst: ShoppingListRow, everything = false) {
  const data = liveList(plan, lst, { id: lst.id, plan_id: plan.id, week_start: plan.week_start, status: lst.status, done_at: lst.done_at });
  const bought = data.items.filter((l) => l.ticked || everything);
  const ings = ingredientMap();
  const added: { pantry_item_id: number; quantity: number }[] = [];
  const priceChanges: { ingredient_id: number; before: Pick<IngredientRow, "price" | "price_updated"> }[] = [];
  for (const l of bought) {
    const ing = l.ingredient_id ? ings.get(l.ingredient_id) : undefined;
    if (!ing) continue;
    const amount = l.pack?.bought ?? l.needed;
    if (amount) {
      const row = addStock(ing, amount, l.unit, { purchased_on: today() });
      added.push({ pantry_item_id: row.id, quantity: Math.round(amount * 1000) / 1000 });
    }
    if (l.actual_price !== null && l.pack) {
      priceChanges.push({ ingredient_id: ing.id, before: { price: ing.price, price_updated: ing.price_updated } });
      ing.price = Math.round((l.actual_price / Math.max(l.pack.count, 1)) * 100) / 100;
      ing.price_updated = nowIso();
    }
  }
  const { list: _l, ...rest } = data;
  lst.status = "done";
  lst.done_at = nowIso();
  lst.snapshot = { ...structuredClone(rest), pantry_added: added, price_changes: priceChanges };
  return { added: added.length, prices: priceChanges.length };
}

/** Undo for Mark shop done: takes back what it added to the pantry and the prices it updated. */
export function reopenShop(lst: ShoppingListRow) {
  const snap = (lst.snapshot ?? {}) as { pantry_added?: { pantry_item_id: number; quantity: number }[];
    price_changes?: { ingredient_id: number; before: { price: number | null; price_updated: string | null } }[] };
  for (const a of snap.pantry_added ?? []) {
    const row = db().pantry.find((r) => r.id === a.pantry_item_id);
    if (!row || row.quantity === null) continue;
    row.quantity = Math.round((row.quantity - a.quantity) * 1000) / 1000;
    if (row.quantity <= 1e-6) {
      row.quantity = 0;
      row.deleted = true;
    }
  }
  for (const c of snap.price_changes ?? []) {
    const ing = db().ingredients.find((i) => i.id === c.ingredient_id);
    if (ing) Object.assign(ing, c.before);
  }
  lst.status = "open";
  lst.done_at = null;
  lst.snapshot = null;
}
