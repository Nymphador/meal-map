// A plain recipe as text: a title, an Ingredients list and a Method. Good enough for most exported or
// printed web recipes, text PDFs, and recipe text pasted into the app.

import { ingredientLines } from "./parse";
import type { RecipeDraft } from "../types";

const HEADINGS_ING = /^\s*ingredients?\b\s*:?\s*$/i;
const HEADINGS_METHOD = /^\s*(method|instructions|directions|steps|preparation|how to make( it)?)\b\s*:?\s*$/i;
const STEP_START = /^\s*(?:step\s*)?(\d{1,2})[.):]?\s+(.*)$/i;
const BULLETS = /^[•\-*·▢\s]+/;

export function emptyDraft(source = "own"): RecipeDraft {
  return {
    title: "", description: "", servings: 2, prep_min: null, cook_min: null, method: [], ingredients: [],
    photo_path: null, source, source_url: null, source_ref: null, tags: [], rating: null, is_favourite: false,
    nutrition: null,
  };
}

export function parseText(input: string, source = "file"): RecipeDraft {
  const text = input.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const title = lines.find((l) => l && !HEADINGS_ING.test(l)) ?? "Imported recipe";
  const ingAt = lines.findIndex((l) => HEADINGS_ING.test(l));
  const methodAt = lines.findIndex((l, i) => HEADINGS_METHOD.test(l) && (ingAt < 0 || i > ingAt));
  let ingredients: string[] = [];
  const method: string[] = [];
  if (ingAt >= 0) {
    const end = methodAt >= 0 ? methodAt : lines.length;
    ingredients = lines.slice(ingAt + 1, end).filter(Boolean).map((l) => l.replace(BULLETS, "").trim());
  }
  if (methodAt >= 0) {
    for (const line of lines.slice(methodAt + 1)) {
      if (!line) continue;
      let m = STEP_START.exec(line);
      if (m && Number(m[1]) !== method.length + 1) m = null; // "5 minutes." wrapped onto its own line isn't step 5
      if (m || !method.length) method.push((m ? m[2] : line).replace(BULLETS, "").trim());
      else method[method.length - 1] += " " + line;
    }
  }
  const serves = /\b(?:serves|servings|makes)\s*:?\s*(\d{1,2})/i.exec(text);
  return {
    ...emptyDraft(source), title: title.slice(0, 200), servings: serves ? Number(serves[1]) : 2,
    ingredients: ingredientLines(ingredients), method,
  };
}

/** Enough to be worth showing for review: a couple of ingredients and at least one step. */
export function looksComplete(d: RecipeDraft): boolean {
  return d.ingredients.length >= 2 && d.method.length >= 1;
}
