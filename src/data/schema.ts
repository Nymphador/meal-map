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
  /** Which meals it suits. Missing on recipes saved before breakfast and lunch existed: read it with
   * `mealTypes()` (logic/recipes.ts), which treats those as dinners. */
  meal_types?: MealType[];
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export type MealType = "breakfast" | "lunch" | "dinner";

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

// --- meal planner -----------------------------------------------------------------------

/** One week, Monday to Sunday. Past weeks are kept so a whole week can be reused. */
export interface PlanRow {
  id: number;
  week_start: string; // YYYY-MM-DD, always a Monday
  budget: number | null; // null = the weekly_budget setting
  created_at: string;
}

export type MealStatus = "planned" | "cooked" | "skipped" | "leftovers" | "eating_out";

export interface PantryUse { pantry_item_id: number; quantity: number; emptied: boolean }

/** One per day and slot (dinner). */
export interface MealRow {
  id: number;
  plan_id: number;
  date: string; // YYYY-MM-DD
  slot: string;
  recipe_id: number | null;
  servings: number;
  status: MealStatus;
  locked: boolean; // kept when the rest of the week is regenerated
  prev_last_cooked: string | null; // so Undo of Mark cooked puts the recipe's last_cooked back
  pantry_used: PantryUse[] | null; // what Mark cooked took from the pantry, for Undo
}

// --- pantry and shopping ---------------------------------------------------------------

/** One batch of something in stock. Cooking uses the batch that expires first. */
export interface PantryRow {
  id: number;
  ingredient_id: number;
  quantity: number | null; // in `unit`; null for items tracked by level only
  unit: string; // g | ml | each (the ingredient's base unit)
  level: "have" | "low" | "out" | null; // for spices and sauces, where the amount doesn't matter
  location: "pantry" | "fridge" | "freezer";
  purchased_on: string | null;
  expires_on: string | null;
  deleted: boolean;
}

/** One per week. Its items are worked out live; only the user's changes are stored. */
export interface ShoppingListRow {
  id: number;
  plan_id: number;
  status: "open" | "done";
  done_at: string | null;
  snapshot: Record<string, unknown> | null; // the list as it was when the shop was done, plus what to undo
}

/** A change to a worked-out line ("i:<ingredient id>"), or an extra the user added ("m:<random>"). */
export interface ShoppingItemRow {
  id: number;
  list_id: number;
  key: string;
  ingredient_id: number | null;
  is_manual: boolean;
  name: string | null; // extras: what to buy ("toilet paper")
  qty_needed: number | null; // an override of the amount, in `unit`
  unit: string | null;
  removed: boolean;
  ticked: boolean;
  actual_price: number | null;
  position: number;
}

export interface DbData {
  version: 1;
  next_id: Record<string, number>;
  recipes: RecipeRow[];
  tags: TagRow[];
  ingredients: IngredientRow[];
  settings: Record<string, unknown>;
  plans: PlanRow[];
  meals: MealRow[];
  pantry: PantryRow[];
  shopping_lists: ShoppingListRow[];
  shopping_items: ShoppingItemRow[];
}

export function emptyDb(): DbData {
  return {
    version: 1, next_id: {}, recipes: [], tags: [], ingredients: [], settings: {},
    plans: [], meals: [], pantry: [], shopping_lists: [], shopping_items: [],
  };
}
