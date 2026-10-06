import { commit, db, nowIso } from "../data/db";
import { fetchBlob, fetchText } from "../data/net";
import { savePhoto } from "../data/storage";
import { recipeCosting } from "../logic/costing";
import { ApiError } from "../logic/errors";
import { ingredientMap } from "../logic/ingredients";
import { LIMIT_KEYS } from "../logic/nutrition";
import { ingredientLines } from "../logic/parse";
import { cleanMealTypes, getRecipe, listRecipes, recipeOut, saveRecipe } from "../logic/recipes";
import { parseText } from "../logic/textImport";
import { importFromHtml } from "../logic/urlImport";
import type { RecipeDraft } from "../types";
import { getSetting } from "./settings";
import { int, numOrNull, route } from "./router";

const TOPICS = ["recipes", "plans", "shopping"];

/** A photo from the web (an imported recipe) is downloaded onto the phone; if that fails the link stays. */
async function keepPhoto(draft: RecipeDraft): Promise<RecipeDraft> {
  if (draft.photo_path && /^https?:\/\//.test(draft.photo_path)) {
    const blob = await fetchBlob(draft.photo_path);
    if (blob && blob.type.startsWith("image/")) return { ...draft, photo_path: await savePhoto(blob) };
  }
  return draft;
}

route("GET", "/api/recipes", ({ query }) => {
  const limits = Object.fromEntries(LIMIT_KEYS.filter((k) => query.get(k)).map((k) => [k, Number(query.get(k))]));
  return listRecipes({
    q: query.get("q") ?? undefined,
    tags: query.getAll("tag").map(Number),
    favourite: query.get("favourite") === "true",
    quick: query.get("quick") === "true",
    max_min: numOrNull(query.get("max_min")),
    sort: query.get("sort") ?? "title",
    limits,
  });
});

route("GET", "/api/recipes/:id", ({ params }) => recipeOut(getRecipe(int(params.id))));

route("GET", "/api/recipes/:id/costing", ({ params, query }) => {
  const servings = numOrNull(query.get("servings"));
  if (servings !== null && !(servings >= 1 && servings <= 100)) throw new ApiError(422, "servings must be between 1 and 100");
  return recipeCosting(getRecipe(int(params.id)), ingredientMap(), servings ?? undefined);
});

route("POST", "/api/recipes", async ({ body }) => {
  const r = saveRecipe(await keepPhoto(body as RecipeDraft));
  commit(TOPICS);
  return recipeOut(r);
});

route("PUT", "/api/recipes/:id", async ({ params, body }) => {
  const existing = getRecipe(int(params.id));
  const r = saveRecipe(await keepPhoto(body as RecipeDraft), existing);
  commit(TOPICS);
  return recipeOut(r);
});

route("PATCH", "/api/recipes/:id", ({ params, body }) => {
  const r = getRecipe(int(params.id));
  if (body.is_favourite !== undefined && body.is_favourite !== null) r.is_favourite = !!body.is_favourite;
  if (body.rating !== undefined && body.rating !== null) r.rating = Math.min(5, Math.max(0, Number(body.rating))) || null;
  if (body.meal_types !== undefined) {
    const types = cleanMealTypes(body.meal_types);
    if (!types) throw new ApiError(422, "A recipe needs at least one meal: breakfast, lunch or dinner");
    r.meal_types = types;
  }
  r.updated_at = nowIso();
  commit(TOPICS);
  return recipeOut(r);
});

route("DELETE", "/api/recipes/:id", ({ params }) => {
  const r = getRecipe(int(params.id));
  r.deleted = true; // kept so Undo can bring it back
  r.updated_at = nowIso();
  commit(TOPICS);
});

route("POST", "/api/recipes/:id/restore", ({ params }) => {
  const r = db().recipes.find((x) => x.id === int(params.id));
  if (!r) throw new ApiError(404, "Recipe not found");
  r.deleted = false;
  r.updated_at = nowIso();
  commit(TOPICS);
  return recipeOut(r);
});

// --- imports: each returns an unsaved draft for the review screen ----------------------------

route("POST", "/api/recipes/import-url", async ({ body }) => {
  const url = String(body.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) throw new ApiError(422, "Paste a full link starting with http:// or https://");
  return importFromHtml(await fetchText(url), url);
});

route("POST", "/api/recipes/import-html", ({ body }) => importFromHtml(String(body.html ?? ""), String(body.url ?? "").trim()));

route("POST", "/api/recipes/import-text", ({ body }) => {
  const draft = parseText(String(body.text ?? ""), "own");
  if (!draft.ingredients.length && !draft.method.length) {
    throw new ApiError(422, "Couldn't find the recipe in that text. Put the ingredients under a line saying \"Ingredients\" and the steps under \"Method\".");
  }
  return draft;
});

route("POST", "/api/recipes/import-file", async ({ form }) => {
  const file = form?.get("file");
  if (!(file instanceof Blob)) throw new ApiError(422, "Choose a file");
  const { readPdf } = await import("../data/pdf"); // pdf.js is big: loaded only when a PDF is imported
  const { draft, photo } = await readPdf(file, getSetting<number>("default_servings") || 2);
  return photo ? { ...draft, photo_path: await savePhoto(photo) } : draft;
});

route("POST", "/api/recipes/parse-ingredients", ({ body }) => ingredientLines((body.lines ?? []).map(String)));

route("POST", "/api/media", async ({ form }) => {
  const file = form?.get("file");
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) throw new ApiError(422, "Choose a photo");
  return { path: await savePhoto(file) };
});

// --- tags -----------------------------------------------------------------------------------

route("GET", "/api/tags", () => {
  const counts = new Map<number, number>();
  for (const r of db().recipes) if (!r.deleted) for (const id of r.tag_ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return db().tags.filter((t) => !t.deleted).sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({ id: t.id, name: t.name, kind: t.kind, recipe_count: counts.get(t.id) ?? 0 }));
});
