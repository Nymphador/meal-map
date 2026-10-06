// The shapes of everything the app stores on the phone. All of it lives in one JSON document
// (see db.ts); recipe lines and tag links sit inside their recipe, aliases inside their ingredient.

export interface LineRow {
  quantity: number | null;
  unit: string | null; // normalised: g, kg, ml, l, tsp, tbsp, cup, each, clove, can...
  name: string;
  raw_text: string;
  note: string | null;
  optional: boolean;
  ingredient_id: number | null;
}

export interface RecipeRow {
  id: number;
  title: string;
  description: string;
  source: string; // own | url | file
  source_url: string | null;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  method: string[];
  photo_path: string | null; // "photo:<file>" (stored on the phone) or a remote URL
  rating: number | null; // 1-5
  is_favourite: boolean;
  last_cooked: string | null; // YYYY-MM-DD
  times_cooked: number;
  nutrition: Record<string, string> | null; // the recipe's own panel, per serving
  tag_ids: number[];
  lines: LineRow[];
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface TagRow {
  id: number;
  name: string;
  kind: string; // cuisine | protein | diet | other | custom
  deleted: boolean;
}

export type PriceUnit = "g" | "kg" | "ml" | "l" | "each";

export interface IngredientRow {
  id: number;
  name: string; // lowercase, unique
  category: string; // produce | meat | seafood | dairy | bakery | pantry | frozen | other
  default_unit: string; // g | ml | each: how it's bought and kept in the pantry
  grams_per_each: number | null; // "2 onions" -> grams
  density_g_per_ml: number | null; // cups/spoons -> grams
  is_staple: boolean;
  low_threshold: number | null; // in default_unit
  never_buy: boolean; // water, etc.
  // Nutrition per 100 g, for estimating a recipe's macros from its ingredients.
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  nutrition_source: string | null; // builtin (the app's table) | user (typed in; never overwritten)
  // What the user pays: `price` dollars for `price_amount` `price_unit` ("$4.50 for 1 kg").
  price: number | null;
  price_amount: number | null;
  price_unit: PriceUnit | null;
  price_updated: string | null; // ISO time
  aliases: string[]; // other spellings (normalised) that link here
  deleted: boolean;
}

export interface DbData {
  version: 1;
  next_id: Record<string, number>;
  recipes: RecipeRow[];
  tags: TagRow[];
  ingredients: IngredientRow[];
  settings: Record<string, unknown>;
}

export function emptyDb(): DbData {
  return { version: 1, next_id: {}, recipes: [], tags: [], ingredients: [], settings: {} };
}
