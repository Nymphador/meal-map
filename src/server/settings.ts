import { commit, db } from "../data/db";
import { ApiError } from "../logic/errors";
import { route } from "./router";

// Defaults; only these keys can be set.
export const DEFAULTS: Record<string, unknown> = {
  default_servings: 2, // how many you cook for: planned meals, opening recipes, imports
  scale_imports: true, // imported recipes are converted to default_servings on the review screen
  meal_slots: ["dinner"],
  dietary: [], // tag names every planned meal must have, e.g. ["Vegetarian"]
  dislikes: [], // ingredient words to avoid
  max_cook_min: null,
  weekly_budget: null,
  mix_favourites: 5,
  mix_new: 2,
  no_repeat_days: 14,
  // Per-serving limits every planned meal must fit, e.g. {"kcal_max": 600, "protein_min": 30}.
  nutrition_limits: {},
};

export function allSettings(): Record<string, unknown> {
  return { ...DEFAULTS, ...Object.fromEntries(Object.entries(db().settings).filter(([k]) => k in DEFAULTS)) };
}

export function getSetting<T>(key: string): T {
  return (key in db().settings ? db().settings[key] : DEFAULTS[key]) as T;
}

// Seeded once: the diet tags the dietary rules choose from.
export function seedIfNeeded() {
  if (db().settings._seeded) return;
  db().settings._seeded = true;
  let id = db().next_id.tags ?? 0;
  for (const name of ["Vegetarian", "Vegan", "Gluten-free", "Dairy-free"]) {
    if (!db().tags.some((t) => t.name === name)) db().tags.push({ id: ++id, name, kind: "diet", deleted: false });
  }
  db().next_id.tags = id;
  commit([]);
}

route("GET", "/api/settings", () => allSettings());

route("PUT", "/api/settings", ({ body }) => {
  const unknown = Object.keys(body).filter((k) => !(k in DEFAULTS));
  if (unknown.length) throw new ApiError(422, `Unknown setting: ${unknown.join(", ")}`);
  Object.assign(db().settings, body);
  commit(["settings", "plans", "shopping", "recipes"]);
  return allSettings();
});
