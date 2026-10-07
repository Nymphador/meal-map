import { commit, db, nowIso } from "../data/db";
import type { IngredientRow, PriceUnit } from "../data/schema";
import { hasPrice, PRICE_UNITS, priceText, unitPrice } from "../logic/costing";
import { ApiError } from "../logic/errors";
import { createIngredient, getIngredient, linkAlias, recipeCounts, suggestExisting } from "../logic/ingredients";
import { CATEGORIES, guessCategory, guessDefaultUnit, normaliseName } from "../logic/names";
import { addSpelling, spellingSuggestions, undoMerge, type MergeUndo } from "../logic/spellings";
import { int, route } from "./router";

const TOPICS = ["ingredients", "recipes", "plans", "shopping"];
const NUTRITION_FIELDS = ["kcal_100g", "protein_100g", "carbs_100g", "fat_100g"] as const;
const EDITABLE = ["name", "category", "default_unit", "grams_per_each", "density_g_per_ml", "is_staple", "low_threshold",
  "never_buy", ...NUTRITION_FIELDS, "price", "price_amount", "price_unit"] as const;

function get(id: string): IngredientRow {
  const ing = getIngredient(int(id));
  if (!ing) throw new ApiError(404, "Ingredient not found");
  return ing;
}

function unitPriceText(ing: IngredientRow): string | null {
  const u = unitPrice(ing);
  if (!u) return null;
  return `$${u.value.toFixed(2)} / ${u.measure === "each" ? "item" : u.measure === "l" ? "L" : "kg"}`;
}

function summaryOut(ing: IngredientRow, counts: Map<number, number>) {
  return {
    id: ing.id, name: ing.name, category: ing.category, default_unit: ing.default_unit,
    recipe_count: counts.get(ing.id) ?? 0, is_staple: ing.is_staple, never_buy: ing.never_buy,
    price: ing.price, price_amount: ing.price_amount, price_unit: ing.price_unit,
    price_text: priceText(ing), unit_price_text: unitPriceText(ing),
  };
}

export function detailOut(ing: IngredientRow, linked = 0) {
  const recipes = db().recipes.filter((r) => !r.deleted && r.lines.some((l) => l.ingredient_id === ing.id))
    .map((r) => ({ id: r.id, title: r.title })).sort((a, b) => a.title.localeCompare(b.title));
  const { deleted: _d, ...fields } = ing;
  return {
    ...fields, price_text: priceText(ing), unit_price_text: unitPriceText(ing),
    recipe_count: recipes.length, recipes, linked,
  };
}

/** Every searched word appears somewhere: "chick thigh" finds chicken thigh fillet. */
function matchesWords(text: string, q: string): boolean {
  return q.split(/\s+/).filter(Boolean).every((w) => text.includes(w));
}

route("GET", "/api/ingredients", ({ query }) => {
  const q = (query.get("q") ?? "").trim().toLowerCase();
  const status = query.get("status") ?? "used";
  const counts = recipeCounts();
  return db().ingredients.filter((i) => !i.deleted)
    .filter((i) => matchesWords([i.name, ...i.aliases].join(" "), q))
    .filter((i) => status === "all" || (counts.get(i.id) ?? 0) > 0 || i.is_staple)
    .filter((i) => status !== "unpriced" || (!hasPrice(i) && !i.never_buy))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => summaryOut(i, counts));
});

route("GET", "/api/ingredients/suggest", ({ query }) => {
  const text = query.get("text") ?? "";
  const name = normaliseName(text);
  return {
    matches: suggestExisting(text, 8).map(([i, score]) => ({ id: i.id, name: i.name, category: i.category, score })),
    proposed_name: name, proposed_category: guessCategory(name), proposed_unit: guessDefaultUnit(query.get("unit")),
  };
});

route("GET", "/api/ingredients/:id", ({ params }) => detailOut(get(params.id)));

function checkNumber(value: unknown, label: string, max?: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(422, `${label} must be a positive number`);
  if (max !== undefined && n > max) throw new ApiError(422, `${label} looks too big (at most ${max})`);
  return n;
}

/** Validates and applies fields (any subset of EDITABLE). */
function apply(ing: IngredientRow, changes: Record<string, unknown>) {
  const next: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in changes) next[key] = changes[key];
  if ("name" in next) {
    const name = String(next.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!name || db().ingredients.some((i) => i.name === name && i.id !== ing.id && !i.deleted)) {
      throw new ApiError(422, "That name is empty or already used by another ingredient");
    }
    next.name = name;
  }
  if ("category" in next && !CATEGORIES.includes(String(next.category))) {
    throw new ApiError(422, `Category must be one of: ${CATEGORIES.join(", ")}`);
  }
  if ("default_unit" in next && !["g", "ml", "each"].includes(String(next.default_unit))) {
    throw new ApiError(422, "Usually bought must be g, ml or each");
  }
  // A pack size typed into the density box once made a 50 g jar count as 1 ml; real densities are 0.1-3.
  if ("density_g_per_ml" in next) {
    const d = checkNumber(next.density_g_per_ml, "Grams per ml", 3);
    if (d === 0) throw new ApiError(422, "Grams per ml can't be 0");
    next.density_g_per_ml = d;
  }
  if ("grams_per_each" in next) next.grams_per_each = checkNumber(next.grams_per_each, "Grams per item", 5000);
  if ("low_threshold" in next) next.low_threshold = checkNumber(next.low_threshold, "Running low below");
  for (const k of NUTRITION_FIELDS) if (k in next) next[k] = checkNumber(next[k], "Nutrition values", 1000);
  if ("price" in next) next.price = checkNumber(next.price, "Price", 100000);
  if ("price_amount" in next) next.price_amount = checkNumber(next.price_amount, "Amount", 1000000);
  if ("price_unit" in next && next.price_unit !== null && !PRICE_UNITS.includes(next.price_unit as PriceUnit)) {
    throw new ApiError(422, `Price unit must be one of: ${PRICE_UNITS.join(", ")}`);
  }
  for (const k of ["is_staple", "never_buy"]) if (k in next) next[k] = !!next[k];

  // The page sends every field on save, so only a changed value counts as typed in.
  if (NUTRITION_FIELDS.some((k) => k in next && next[k] !== ing[k])) ing.nutrition_source = "user";
  const priceChanged = ["price", "price_amount", "price_unit"].some((k) => k in next && next[k] !== ing[k as keyof IngredientRow]);
  Object.assign(ing, next);
  if (priceChanged) ing.price_updated = nowIso();
}

route("PUT", "/api/ingredients/:id", ({ params, body }) => {
  const ing = get(params.id);
  apply(ing, body);
  commit(TOPICS);
  return detailOut(ing);
});

/** Just the price: "$4.50 for 1 kg". An empty price clears it. */
route("PATCH", "/api/ingredients/:id/price", ({ params, body }) => {
  const ing = get(params.id);
  const cleared = body.price === null || body.price === "" || body.price === undefined;
  apply(ing, cleared ? { price: null, price_amount: null, price_unit: null }
    : { price: body.price, price_amount: body.price_amount, price_unit: body.price_unit });
  if (!cleared && !hasPrice(ing)) throw new ApiError(422, "Enter the price, how much it's for, and the unit");
  commit(TOPICS);
  return detailOut(ing);
});

route("POST", "/api/ingredients", ({ body }) => {
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError(422, "An ingredient needs a name");
  const ing = createIngredient(name, body.category || undefined, body.default_unit || "g");
  const linked = body.raw_name ? linkAlias(String(body.raw_name), ing) : 0;
  commit(TOPICS);
  return detailOut(ing, linked);
});

/** Remembers a recipe's spelling for this ingredient and links every recipe line using it. */
route("POST", "/api/ingredients/:id/link", ({ params, body }) => {
  const ing = get(params.id);
  const raw = String(body.raw_name ?? "").trim();
  if (!raw) throw new ApiError(422, "raw_name is required");
  const linked = linkAlias(raw, ing);
  commit(TOPICS);
  return detailOut(ing, linked);
});

/** Another spelling ("fine breadcrumbs"): recipe lines using it link here, now and later. If it was an
 * ingredient of its own, that one is merged in, and `undo` (for /spellings/undo) comes back. */
route("POST", "/api/ingredients/:id/spellings", ({ params, body }) => {
  const ing = get(params.id);
  const { linked, merged, undo } = addSpelling(ing, String(body.text ?? ""));
  commit([...TOPICS, "pantry"]);
  return { ingredient: detailOut(ing, linked), linked, merged, undo };
});

route("POST", "/api/ingredients/spellings/undo", ({ body }) => {
  undoMerge(body as unknown as MergeUndo);
  commit([...TOPICS, "pantry"]);
  return { ok: true };
});

/** Recipe wordings that mention this ingredient but don't link here yet. */
route("GET", "/api/ingredients/:id/spellings/suggest", ({ params }) => spellingSuggestions(get(params.id)));

route("DELETE", "/api/ingredients/:id/aliases/:alias", ({ params }) => {
  const ing = get(params.id);
  ing.aliases = ing.aliases.filter((a) => a !== params.alias);
  commit(TOPICS);
  return detailOut(ing);
});
