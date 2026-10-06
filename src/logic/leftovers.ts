// Leftover planning: packs rarely match a recipe exactly ("half a cabbage", "300 g of a 1 kg pack of
// chicken"). Once the shopping list is worked out, fresh leftovers are matched with recipes that would
// use them, so a second meal that week finishes them off instead of the bin.

import { db } from "../data/db";
import type { PlanRow, RecipeRow } from "../data/schema";
import { getSetting } from "../server/settings";
import { fmtAmount } from "./amounts";
import { ingredientMap } from "./ingredients";
import { lineAmount } from "./pantry";
import { buildContext, FRESH, HAS_RECIPE, planMeals } from "./planner";
import { totalMinutes } from "./recipes";
import { buildList } from "./shopping";

const MIN_SHARE = 0.25; // at least a quarter of what's bought...
const MIN_AMOUNT: Record<string, number> = { g: 100, ml: 100, each: 1 }; // ...and enough to be worth a meal

export interface Leftover { ingredient_id: number; name: string; leftover: number; unit: string; bought: number; share: number; text: string }

/** Fresh ingredient id -> what this week's packs leave over. */
export function planLeftovers(plan: PlanRow): Map<number, Leftover> {
  const out = new Map<number, Leftover>();
  for (const l of buildList(plan).items) {
    if (!l.pack || !l.ingredient_id || !l.unit || !FRESH.has(l.category)) continue;
    const { leftover, bought } = l.pack;
    if (bought <= 0 || leftover < (MIN_AMOUNT[l.unit] ?? 1) || leftover / bought < MIN_SHARE) continue;
    const share = leftover / bought;
    out.set(l.ingredient_id, {
      ingredient_id: l.ingredient_id, name: l.name, leftover: Math.round(leftover * 100) / 100, unit: l.unit,
      bought: Math.round(bought * 100) / 100, share: Math.round(share * 100) / 100,
      text: fmtAmount(leftover, l.unit) + (share >= 0.4 && share <= 0.6 ? " (half the pack)" : ""),
    });
  }
  return out;
}

export function leftoverSuggestions(plan: PlanRow, perItem = 3) {
  const leftovers = planLeftovers(plan);
  if (!leftovers.size) return [];
  const ctx = buildContext(plan);
  const inWeek = new Set(planMeals(plan).filter((m) => m.recipe_id && HAS_RECIPE.has(m.status)).map((m) => m.recipe_id));
  const servings = getSetting<number>("default_servings") || 2;
  const ings = ingredientMap();
  const byIng = new Map<number, [RecipeRow, number | null][]>();
  for (const r of db().recipes) {
    const info = ctx.infos.get(r.id);
    if (!info || info.problem || inWeek.has(r.id)) continue; // breaks a rule or already planned
    for (const line of r.lines) {
      if (!line.ingredient_id || !leftovers.has(line.ingredient_id)) continue;
      const ing = ings.get(line.ingredient_id)!;
      const factor = r.servings ? servings / r.servings : 1;
      const use = line.quantity === null ? null : lineAmount(line.quantity * factor, line.unit, ing);
      const list = byIng.get(ing.id) ?? [];
      list.push([r, use]);
      byIng.set(ing.id, list);
    }
  }
  const out = [];
  for (const [iid, left] of leftovers) {
    const options = byIng.get(iid);
    if (!options?.length) continue;
    const amount = left.leftover;
    // Best: uses most of the leftover without needing much more than is left.
    const key = ([r, use]: [RecipeRow, number | null]) => [
      use && use > amount * 1.3 ? 1 : 0, Math.round((Math.abs((use ?? amount / 2) - amount) / amount) * 100) / 100,
      r.is_favourite ? 0 : 1, -(r.rating ?? 0)] as number[];
    const sorted = [...options].sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return a[0].title.toLowerCase().localeCompare(b[0].title.toLowerCase());
    });
    const seen = new Set<number>();
    const picks = [];
    for (const [r, use] of sorted) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      picks.push({ id: r.id, title: r.title, photo_path: r.photo_path, total_min: totalMinutes(r), is_favourite: r.is_favourite,
        uses_text: use ? fmtAmount(use, left.unit) : null });
      if (picks.length >= perItem) break;
    }
    out.push({ ...left, recipes: picks });
  }
  return out.sort((a, b) => b.share - a.share);
}
