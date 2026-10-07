// The starter recipes (data/starterRecipes.ts), added once on a fresh install or the first start
// after the update that brought them. Recipes already in the library (same source link) and ones the
// user deleted afterwards are never re-added: the `_starter_v1` flag is set the first time.
//
// Their photos ship only in closed-testing builds (STARTER_PHOTOS, from store-config.json
// "starterPhotos"); a build without them clears the photo paths those builds stored.
import store from "../../store-config.json";
import { db } from "../data/db";
import { STARTER_RECIPES } from "../data/starterRecipes";
import { ingredientLines } from "./parse";
import { saveRecipe } from "./recipes";
import { emptyDraft } from "./textImport";

export const STARTER_PHOTOS = (store as { starterPhotos?: boolean }).starterPhotos === true;
const PHOTO_DIR = "/starter/";

/** Adds the starter recipes if they haven't been yet, and drops photo paths a build can't show.
 * Returns how many recipes changed (the caller commits). */
export function addStarterRecipes(withPhotos = STARTER_PHOTOS): number {
  let changed = 0;
  if (!db().settings._starter_v1) {
    db().settings._starter_v1 = true;
    const have = new Set(db().recipes.map((r) => r.source_url).filter(Boolean));
    for (const s of STARTER_RECIPES) {
      if (have.has(s.source_url)) continue;
      saveRecipe({
        ...emptyDraft(), title: s.title, servings: s.servings, prep_min: s.prep_min, cook_min: s.cook_min,
        method: s.method, ingredients: ingredientLines(s.ingredients), source: "url", source_url: s.source_url,
        photo_path: withPhotos ? `${PHOTO_DIR}${s.slug}.jpg` : null, nutrition: { ...s.nutrition },
        tags: s.cuisine ? [{ name: s.cuisine, kind: "cuisine" }] : [], meal_types: ["dinner"],
      });
      changed++;
    }
  }
  if (!withPhotos) {
    for (const r of db().recipes) {
      if (r.photo_path?.startsWith(PHOTO_DIR)) {
        r.photo_path = null;
        changed++;
      }
    }
  }
  return changed;
}
