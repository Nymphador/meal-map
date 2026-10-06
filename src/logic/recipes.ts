// Saving recipes and turning them into the shapes the screens use. Every way of adding a recipe ends here.

import { db, nextId, nowIso } from "../data/db";
import type { IngredientRow, RecipeRow, TagRow } from "../data/schema";
import type { RecipeDraft, TagIn } from "../types";
import { ApiError } from "./errors";
import { autoResolveLines, ingredientMap, resolveIngredientId } from "./ingredients";
import { macrosOut, MACROS, recipeNutrition, type Macro, type Nutrition } from "./nutrition";

export const QUICK_MINUTES = 30;

export function getRecipe(id: number): RecipeRow {
  const r = db().recipes.find((x) => x.id === id && !x.deleted);
  if (!r) throw new ApiError(404, "Recipe not found");
  return r;
}

export function totalMinutes(r: RecipeRow): number | null {
  if (r.prep_min === null && r.cook_min === null) return null;
  return (r.prep_min ?? 0) + (r.cook_min ?? 0);
}

export function tagsFor(names: TagIn[]): TagRow[] {
  const out: TagRow[] = [];
  const seen = new Set<string>();
  for (const t of names) {
    const name = t.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    let tag = db().tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (tag) {
      tag.deleted = false;
    } else {
      tag = { id: nextId("tags"), name, kind: t.kind || "custom", deleted: false };
      db().tags.push(tag);
    }
    out.push(tag);
  }
  return out;
}

function clampInt(v: unknown, lo: number, hi: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
}

/** Creates or replaces a recipe from a draft, then links every line to an ingredient. Doesn't commit. */
export function saveRecipe(draft: RecipeDraft, existing?: RecipeRow): RecipeRow {
  const title = (draft.title ?? "").trim();
  if (!title) throw new ApiError(422, "A recipe needs a title");
  const now = nowIso();
  const r: RecipeRow = existing ?? {
    id: nextId("recipes"), title, description: "", source: "own", source_url: null, servings: 2, prep_min: null,
    cook_min: null, method: [], photo_path: null, rating: null, is_favourite: false, last_cooked: null,
    times_cooked: 0, nutrition: null, tag_ids: [], lines: [], created_at: now, updated_at: now, deleted: false,
  };
  r.title = title;
  r.description = (draft.description ?? "").trim();
  r.servings = clampInt(draft.servings, 1, 100) ?? 2;
  r.prep_min = clampInt(draft.prep_min, 0, 100000);
  r.cook_min = clampInt(draft.cook_min, 0, 100000);
  r.method = (draft.method ?? []).map((s) => s.trim()).filter(Boolean);
  r.photo_path = draft.photo_path || null;
  r.source = draft.source || "own";
  r.source_url = draft.source_url || null;
  r.rating = clampInt(draft.rating, 1, 5);
  r.is_favourite = !!draft.is_favourite;
  r.nutrition = draft.nutrition && Object.keys(draft.nutrition).length ? draft.nutrition : null;
  r.updated_at = now;
  r.lines = (draft.ingredients ?? []).filter((l) => l.name?.trim()).map((l) => {
    const name = l.name.trim();
    return {
      quantity: l.quantity === null || l.quantity === undefined || Number.isNaN(Number(l.quantity)) ? null : Number(l.quantity),
      unit: l.unit || null, name, raw_text: l.raw_text || name, note: l.note?.trim() || null, optional: !!l.optional,
      ingredient_id: l.ingredient_id || resolveIngredientId(name),
    };
  });
  r.tag_ids = tagsFor(draft.tags ?? []).map((t) => t.id);
  if (!existing) db().recipes.push(r);
  autoResolveLines([r.id]);
  return r;
}

// --- API shapes ------------------------------------------------------------------------

function tagOut(t: TagRow) {
  return { id: t.id, name: t.name, kind: t.kind, recipe_count: 0 };
}

function recipeTags(r: RecipeRow) {
  const byId = new Map(db().tags.map((t) => [t.id, t]));
  return r.tag_ids.map((id) => byId.get(id)).filter((t): t is TagRow => !!t && !t.deleted)
    .sort((a, b) => a.name.localeCompare(b.name)).map(tagOut);
}

export function summary(r: RecipeRow, ings: Map<number, IngredientRow>, nutrition?: Nutrition) {
  return {
    id: r.id, title: r.title, photo_path: r.photo_path, prep_min: r.prep_min, cook_min: r.cook_min,
    total_min: totalMinutes(r), servings: r.servings, rating: r.rating, is_favourite: r.is_favourite,
    source: r.source, times_cooked: r.times_cooked, last_cooked: r.last_cooked, tags: recipeTags(r),
    updated_at: r.updated_at, macros: macrosOut(nutrition ?? recipeNutrition(r, ings)),
  };
}

export function recipeOut(r: RecipeRow) {
  const ings = ingredientMap();
  return {
    ...summary(r, ings),
    description: r.description, method: r.method,
    ingredients: r.lines.map((l) => ({ ...l })),
    source_url: r.source_url, source_ref: null, nutrition: r.nutrition, created_at: r.created_at,
  };
}

export interface ListFilters {
  q?: string;
  tags?: number[];
  favourite?: boolean;
  quick?: boolean;
  max_min?: number | null;
  sort?: string;
  limits?: Record<string, number>;
}

// sort name -> highest first?
const MACRO_SORTS: Record<string, [Macro, boolean]> = {
  kcal: ["kcal", false], protein: ["protein", true], carbs: ["carbs", false], fat: ["fat", false],
};

function fitsLimits(m: ReturnType<typeof macrosOut>, limits: Record<string, number>): boolean {
  if (!m.complete) return false; // unknown nutrition can't be shown as "under 600 kcal"
  return Object.entries(limits).every(([key, bound]) => {
    const [macro, side] = key.split("_") as [Macro, string];
    const value = m[macro];
    return value !== null && !(side === "max" && value > bound) && !(side === "min" && value < bound);
  });
}

export function listRecipes(f: ListFilters) {
  const ings = ingredientMap();
  let rows = db().recipes.filter((r) => !r.deleted);
  const q = f.q?.trim().toLowerCase();
  if (q) { // the title or any ingredient, so "spinach" finds everything that uses it
    rows = rows.filter((r) => r.title.toLowerCase().includes(q) || r.lines.some((l) => l.name.toLowerCase().includes(q)));
  }
  for (const tagId of f.tags ?? []) rows = rows.filter((r) => r.tag_ids.includes(tagId)); // every tag must match
  if (f.favourite) rows = rows.filter((r) => r.is_favourite);
  const limitMin = [f.quick ? QUICK_MINUTES : null, f.max_min ?? null].filter((x): x is number => x !== null);
  if (limitMin.length) { // recipes with no times recorded don't count as quick
    const cap = Math.min(...limitMin);
    rows = rows.filter((r) => { const t = totalMinutes(r); return t !== null && t <= cap; });
  }

  const byTitle = (a: RecipeRow, b: RecipeRow) => a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  const sorts: Record<string, (a: RecipeRow, b: RecipeRow) => number> = {
    title: byTitle,
    recent: (a, b) => b.created_at.localeCompare(a.created_at),
    rating: (a, b) => Number(b.is_favourite) - Number(a.is_favourite) || (b.rating ?? 0) - (a.rating ?? 0) || byTitle(a, b),
    cooked: (a, b) => b.times_cooked - a.times_cooked || byTitle(a, b),
    quickest: (a, b) => ((a.prep_min ?? 0) + (a.cook_min ?? 0)) - ((b.prep_min ?? 0) + (b.cook_min ?? 0)) || byTitle(a, b),
  };
  rows = [...rows].sort(sorts[f.sort ?? "title"] ?? byTitle);
  let out = rows.map((r) => summary(r, ings));

  // Macros are worked out per recipe, so these filters and sorts run after.
  if (f.limits && Object.keys(f.limits).length) out = out.filter((r) => fitsLimits(r.macros, f.limits!));
  const macroSort = f.sort ? MACRO_SORTS[f.sort] : undefined;
  if (macroSort) {
    const [macro, descending] = macroSort;
    const known = out.filter((r) => r.macros.complete && r.macros[macro] !== null);
    const unknown = out.filter((r) => !known.includes(r)); // can't be ranked, so they go last
    known.sort((a, b) => (descending ? -1 : 1) * (a.macros[macro]! - b.macros[macro]!));
    out = [...known, ...unknown];
  }
  return out;
}

export { MACROS };
