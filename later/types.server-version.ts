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

export interface SearchResult {
  provider: string;
  ref: string;
  title: string;
  image: string | null;
  ready_min: number | null;
  saved_recipe_id: number | null;
}

export interface SearchOut {
  provider: string;
  results: SearchResult[];
  notice: string | null;
}

export interface Settings {
  default_servings: number;
  scale_imports: boolean;
  postcode: string;
  woolworths_store_id: string;
  coles_store_id: string;
  auto_refresh: boolean;
  refresh_day: string;
  refresh_time: string;
  timezone: string;
  meal_slots: string[];
  dietary: string[];
  dislikes: string[];
  max_cook_min: number | null;
  weekly_budget: number | null;
  mix_favourites: number;
  mix_new: number;
  no_repeat_days: number;
  min_split_saving: number;
  nutrition_limits: NutritionLimits;
  auto_backup: boolean;
  backup_time: string;
}

export interface NightlyBackups {
  folder: string;
  keep: number;
  backups: { name: string; size: number; saved_at: string }[];
}

// --- Prices (phase 2) ---

export type Store = "woolworths" | "coles";

export interface StorePrice {
  store_product_id: number;
  store: Store;
  name: string;
  brand: string | null;
  url: string | null;
  image_url: string | null;
  store_sku: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  search_term: string;
  match_source: "auto" | "user";
  price: number | null;
  was_price: number | null;
  unit_price: number | null;
  unit_measure: string | null;
  special_label: string | null;
  special_ends: string | null;
  in_stock: boolean | null;
  source: string | null;
  captured_at: string | null;
  stale: boolean;
}

export interface TrackedProduct {
  key: string;
  title: string;
  ingredient_id: number | null;
  woolworths: StorePrice | null;
  coles: StorePrice | null;
  cheaper: Store | "same" | null;
  saving_pct: number | null;
}

export interface RunLogEntry {
  store_product_id?: number;
  store?: string;
  name?: string;
  status: string;
  message?: string;
  price?: number;
  old_price?: number | null;
  unit?: string;
  special?: string | null;
  confidence?: string;
  blocked?: boolean;
}

export interface PriceRun {
  id: number;
  method: "auto" | "chrome" | "manual" | "match";
  trigger?: "scheduled" | "manual" | null;
  status: "running" | "done" | "error";
  started_at: string;
  finished_at: string | null;
  total: number;
  updated: number;
  unchanged: number;
  failed: number;
  not_found: number;
  log: RunLogEntry[] | null;
}

export interface PriceStatus {
  running: boolean;
  latest: PriceRun | null;
  latest_auto: PriceRun | null;
  banner: string | null;
  schedule_enabled: boolean;
  next_run: string | null; // local time with offset
  overdue: boolean;
}

export interface ImportPreviewRow {
  index: number;
  tracked_product_id: number;
  store: string;
  name: string;
  status: "new" | "up" | "down" | "unchanged" | "new_special" | "special_ended" | "stock" | "not_found" | "invalid";
  old_price: number | null;
  new_price: number | null;
  unit_price?: number | null;
  unit_measure?: string | null;
  special: string | null;
  confidence: string;
  notes: string;
  message: string;
  importable: boolean;
  selected: boolean;
}

// --- Ingredients & matching (phase 3) ---

export interface IngredientSummary {
  id: number;
  name: string;
  category: string;
  default_unit: string;
  is_staple: boolean;
  never_buy: boolean;
  recipe_count: number;
  matched: Record<Store, boolean>;
}

export interface LinkedProduct extends StorePrice {
  is_preferred: boolean;
}

export interface IngredientDetail {
  id: number;
  name: string;
  category: string;
  default_unit: string;
  grams_per_each: number | null;
  density_g_per_ml: number | null;
  is_staple: boolean;
  low_threshold: number | null;
  never_buy: boolean;
  brand_pref: "any" | "store" | "brand";
  brand_name: string | null;
  organic: boolean;
  free_range: boolean;
  pack_min: number | null;
  pack_max: number | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  nutrition_source: "builtin" | "user" | null;
  aliases: { id: number; alias_text: string }[];
  products: LinkedProduct[];
  recipe_count: number;
  cheaper: Store | "same" | null;
  saving_pct: number | null;
  linked: number;
}

export interface Quote {
  store: Store;
  sku: string;
  name: string;
  price: number;
  brand: string | null;
  url: string | null;
  image_url: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  was_price: number | null;
  unit_price: number | null;
  unit_measure: string | null;
  special_label: string | null;
  special_ends: string | null;
  in_stock: boolean;
}

export interface SuggestionsOut {
  store: Store;
  query: string;
  results: Quote[];
  blocked: boolean;
  error: string | null;
}

export interface IngredientSuggest {
  matches: { id: number; name: string; category: string; score: number }[];
  proposed_name: string;
  proposed_category: string;
  proposed_unit: string;
}

export interface StoreLineCost {
  store_product_id: number;
  product_name: string;
  unit_price: number | null;
  unit_measure: string | null;
  cost: number | null;
  stale: boolean;
  problem: string | null;
}

export interface LineCost {
  index: number;
  name: string;
  raw_text: string;
  quantity: number | null;
  unit: string | null;
  ingredient_id: number | null;
  ingredient_name: string | null;
  status: "ok" | "skip" | "unlinked" | "no_product" | "no_price" | "partial";
  message: string;
  stores: Partial<Record<Store, StoreLineCost>>;
  cheaper: Store | "same" | null;
  best_cost: number | null;
}

export interface Costing {
  recipe_id: number;
  servings: number;
  lines: LineCost[];
  totals: Record<Store, number | null>;
  best_total: number | null;
  per_serve: number | null;
  complete: boolean;
  matched: number;
  needs_attention: number;
  line_count: number;
}

// --- Meal planner (phase 4) ---

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
  cost_stale: boolean;
  specials: string[];
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
  nutrition: { meals: number; average: Record<"kcal" | "protein" | "carbs" | "fat", number> | null } | null;
}

export interface Special {
  ingredient_id: number;
  ingredient: string;
  store: Store;
  headline: string;
  product: string;
  store_product_id: number;
  price: number;
  was_price: number | null;
  saving_pct: number | null;
  special: string;
  unit_price: number | null;
  unit_measure: string | null;
  recipes: { id: number; title: string; photo_path: string | null; is_favourite: boolean; uses_text: string; share: number }[];
  recipe_count: number;
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

// --- Pantry and shopping (phase 5) ---

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

export interface PackOut {
  store_product_id: number;
  name: string;
  count: number;
  pack: string;
  price: number;
  unit_price: number | null;
  unit_measure: string | null;
  special: string | null;
  was_price: number | null;
  stale: boolean;
  url: string | null;
  image_url: string | null;
}

export interface StorePlan {
  store: Store;
  cost: number | null;
  bought: number | null;
  leftover: number | null;
  loose: boolean;
  out_of_stock: boolean;
  problem: string | null;
  buy_text: string | null;
  leftover_text: string | null;
  packs: PackOut[];
  unit_price: number | null;
  unit_measure: string | null;
  special: string | null;
  stale: boolean;
  price_date: string | null;
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
  stores: Partial<Record<Store, StorePlan>>;
  cheaper: Store | "same" | null;
  chosen_store: Store | null;
  store_overridden: boolean;
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
  totals: { woolworths: { total: number; missing: number }; coles: { total: number; missing: number }; split: number };
  recommendation: { mode: Store | "split"; saving: number; min_saving: number; text: string; compared_items: number };
  spend: { woolworths: number; coles: number; total: number; unpriced: number };
  pantry_added?: unknown[];
  result?: { added: number; receipts: number };
  budget: number | null;
}
