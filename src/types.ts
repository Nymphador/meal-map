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
}

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
