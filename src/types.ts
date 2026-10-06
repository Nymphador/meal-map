// Mirrors backend/app/schemas.py.

export interface User {
  id: number;
  username: string;
  display_name: string;
}

export interface Tag {
  id: number;
  name: string;
  kind: TagKind;
  recipe_count: number;
}

export type TagKind = "cuisine" | "protein" | "diet" | "other" | "custom";

export interface TagIn {
  name: string;
  kind: TagKind | string;
}

export interface IngredientLine {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  raw_text: string;
  optional: boolean;
  ingredient_id?: number | null;
}

export type Macro = "kcal" | "protein" | "carbs" | "fat";

/** Per serving. complete=false means some ingredient's amount or nutrition is unknown. */
export interface Macros {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  source: "recipe" | "estimate" | "mixed";
  complete: boolean;
  missing: string[];
  missing_ids: (number | null)[];
}

/** Per-serving limits, e.g. { kcal_max: 600, protein_min: 30 }. */
export type NutritionLimits = Partial<Record<`${Macro}_${"min" | "max"}`, number | null>>;

export interface RecipeSummary {
  id: number;
  title: string;
  photo_path: string | null;
  prep_min: number | null;
  cook_min: number | null;
  total_min: number | null;
  servings: number;
  rating: number | null;
  is_favourite: boolean;
  source: string;
  times_cooked: number;
  last_cooked: string | null;
  tags: Tag[];
  updated_at: string;
  macros: Macros | null;
  meal_types: MealType[];
}

export interface Recipe extends RecipeSummary {
  description: string;
  method: string[];
  ingredients: IngredientLine[];
  source_url: string | null;
  source_ref: string | null;
  nutrition: Record<string, string> | null;
  created_at: string;
}

/** What the editor submits, and what URL/API imports return for review. */
export interface RecipeDraft {
  title: string;
  description: string;
  servings: number;
  prep_min: number | null;
  cook_min: number | null;
  method: string[];
  ingredients: IngredientLine[];
  photo_path: string | null;
  source: string;
  source_url: string | null;
  source_ref: string | null;
  tags: TagIn[];
  rating: number | null;
  is_favourite: boolean;
  nutrition: Record<string, string> | null;
  meal_types?: MealType[];
}

export type MealType = "breakfast" | "lunch" | "dinner";

export interface Settings {
  default_servings: number;
  scale_imports: boolean;
  meal_slots: string[];
  dietary: string[];
  dislikes: string[];
  max_cook_min: number | null;
  weekly_budget: number | null;
  mix_favourites: number;
  mix_new: number;
  no_repeat_days: number;
  nutrition_limits: NutritionLimits;
}

// --- Ingredients and prices ---

export type PriceUnit = "g" | "kg" | "ml" | "l" | "each";

/** The price the user pays: `price` dollars for `price_amount` `price_unit`. */
export interface PriceFields {
  price: number | null;
  price_amount: number | null;
  price_unit: PriceUnit | null;
  price_text: string | null; // "$4.50 for 1 kg"
  unit_price_text: string | null; // "$4.50 / kg"
}

export interface IngredientSummary extends PriceFields {
  id: number;
  name: string;
  category: string;
  default_unit: string;
  is_staple: boolean;
  never_buy: boolean;
  recipe_count: number;
}

export interface IngredientDetail extends PriceFields {
  id: number;
  name: string;
  category: string;
  default_unit: string;
  grams_per_each: number | null;
  density_g_per_ml: number | null;
  is_staple: boolean;
  low_threshold: number | null;
  never_buy: boolean;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  nutrition_source: "builtin" | "user" | null;
  price_updated: string | null;
  aliases: string[];
  recipe_count: number;
  recipes: { id: number; title: string }[];
  linked: number;
}

export interface IngredientSuggest {
  matches: { id: number; name: string; category: string; score: number }[];
  proposed_name: string;
  proposed_category: string;
  proposed_unit: string;
}

export interface LineCost {
  index: number;
  name: string;
  ingredient_id: number | null;
  ingredient_name: string | null;
  status: "ok" | "skip" | "unlinked" | "no_price" | "problem";
  message: string;
  cost: number | null;
}

export interface Costing {
  recipe_id: number;
  servings: number;
  lines: LineCost[];
  total: number | null;
  per_serve: number | null;
  complete: boolean;
  priced: number;
  needs_price: number;
}

// --- Meal planner ---

export type MealStatus = "planned" | "cooked" | "skipped" | "leftovers" | "eating_out";

export interface PlanRecipe {
  id: number;
  title: string;
  photo_path: string | null;
  total_min: number | null;
  is_favourite: boolean;
  rating: number | null;
  servings: number;
  times_cooked: number;
  last_cooked: string | null;
}

export interface PlanMeal {
  id: number;
  date: string; // YYYY-MM-DD
  slot: string;
  status: MealStatus;
  locked: boolean;
  servings: number;
  recipe: PlanRecipe | null;
  cost: number | null;
  cost_per_serve: number | null;
  cost_complete: boolean;
  macros: Macros | null;
}

export interface Plan {
  id: number;
  week_start: string;
  status: string;
  today: string;
  meals: PlanMeal[];
  est_cost: number;
  costed_meals: number;
  planned_meals: number;
  budget: number | null;
  notes: string[];
  elapsed_ms: number | null;
  nutrition_rules: string[];
  nutrition: { meals: number; dinners: number; average: Record<"kcal" | "protein" | "carbs" | "fat", number> | null } | null;
}

export interface Leftover {
  ingredient_id: number;
  name: string;
  leftover: number;
  unit: string;
  text: string;
  share: number;
  recipes: { id: number; title: string; photo_path: string | null; total_min: number | null; uses_text: string | null }[];
}

export interface PlanSummary {
  id: number;
  week_start: string;
  meal_count: number;
  titles: string[];
}

export interface Alternative {
  recipe: PlanRecipe;
  cost_per_serve: number | null;
  cost_complete: boolean;
  fit: number;
  notes: string[];
  warning: string | null;
  macros: Macros | null;
}

/** A meal exactly as it was, for Undo (POST /api/plans/{id}/restore). */
export interface MealState {
  id: number;
  recipe_id: number | null;
  servings: number;
  status: MealStatus;
  locked: boolean;
}

// --- Pantry and shopping ---

export type PantryLevel = "have" | "low" | "out";
export type PantryLocation = "pantry" | "fridge" | "freezer";

export interface PantryItem {
  id: number;
  ingredient_id: number;
  name: string;
  category: string;
  quantity: number | null;
  unit: string; // g | ml | each
  amount_text: string | null;
  level: PantryLevel | null;
  location: PantryLocation;
  purchased_on: string | null;
  expires_on: string | null;
  days_left: number | null;
  expiring: boolean;
  is_staple: boolean;
  low_threshold: number | null;
}

export interface StapleStatus {
  ingredient_id: number;
  name: string;
  low_threshold: number | null;
  unit: string;
  stock_text: string;
  low: boolean;
  known: boolean;
}

export interface PantryData {
  items: PantryItem[];
  staples: StapleStatus[];
  expiring: PantryItem[];
  today: string;
}

export interface PackPlan {
  count: number;
  size: number;
  size_text: string;
  price_each: number;
  cost: number;
  bought: number;
  leftover: number;
  buy_text: string;
  leftover_text: string | null;
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
  price_text: string | null;
  pack: PackPlan | null;
  est_price: number | null;
  removed: boolean;
  ticked: boolean;
  actual_price: number | null;
  position: number;
}

export interface ShoppingData {
  list: { id: number; plan_id: number; week_start: string; status: "open" | "done"; done_at: string | null };
  items: ShopLine[];
  removed: ShopLine[];
  covered: { ingredient_id: number; name: string; needed: string; in_stock: string | null; meals: string[] }[];
  unlinked: string[];
  totals: { estimate: number; spend: number; unpriced: number };
  budget: number | null;
  result?: { added: number; prices: number };
}
