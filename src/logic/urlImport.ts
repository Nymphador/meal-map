// Import a recipe from a web page via its schema.org Recipe JSON-LD, which most recipe sites embed
// for Google. The result is a draft for review.

import { decodeEntities, ingredientLines, stripHtml } from "./parse";
import { emptyDraft } from "./textImport";
import { ApiError } from "./errors";
import type { RecipeDraft, TagIn } from "../types";

type Node = Record<string, unknown>;

function* iterNodes(data: unknown): Generator<Node> {
  if (Array.isArray(data)) {
    for (const item of data) yield* iterNodes(item);
  } else if (data && typeof data === "object") {
    const node = data as Node;
    yield node;
    for (const key of ["@graph", "mainEntity", "itemListElement"]) if (key in node) yield* iterNodes(node[key]);
  }
}

function isRecipe(node: Node): boolean {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).some((x) => typeof x === "string" && x.split("/").pop() === "Recipe");
}

export function findRecipeJsonld(html: string): Node | null {
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let data: unknown;
    try {
      // Some sites leave raw newlines inside strings; JSON.parse refuses those, so flatten them.
      data = JSON.parse(m[1].trim().replace(/[\r\n\t]+/g, " "));
    } catch {
      continue;
    }
    for (const node of iterNodes(data)) if (isRecipe(node)) return node;
  }
  return null;
}

/** "PT1H30M" -> 90. null for missing/unparseable values. */
export function isoMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim().toUpperCase());
  if (!m || !m.slice(1).some(Boolean)) return null;
  const [d, h, mi, s] = m.slice(1).map((x) => (x ? Number(x) : 0));
  return Math.round(d * 1440 + h * 60 + mi + s / 60);
}

export function parseYield(value: unknown, fallback = 4): number {
  for (const v of Array.isArray(value) ? value : [value]) {
    if (typeof v === "number" && v > 0) return Math.floor(v);
    if (typeof v === "string") {
      const m = /\d+/.exec(v);
      if (m && Number(m[0]) > 0) return Number(m[0]);
    }
  }
  return fallback;
}

function firstImage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length) return firstImage(value[0]);
  if (value && typeof value === "object") {
    const v = value as Node;
    return (v.url as string) || (v.contentUrl as string) || null;
  }
  return null;
}

export function methodSteps(value: unknown): string[] {
  if (typeof value === "string") {
    return decodeEntities(value).split(/\n+|<br\s*\/?>|<\/p>|<\/li>/i).map(stripHtml).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(methodSteps);
  if (value && typeof value === "object") {
    const v = value as Node;
    if ("itemListElement" in v) return methodSteps(v.itemListElement); // HowToSection
    const s = stripHtml(String(v.text || v.name || ""));
    return s ? [s] : [];
  }
  return [];
}

function asList(value: unknown): string[] {
  if (typeof value === "string") return value.split(",").map((v) => v.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean);
  return [];
}

function nutrition(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Node;
  const keys: Record<string, string> = { calories: "calories", proteinContent: "protein", fatContent: "fat",
    carbohydrateContent: "carbohydrates", fiberContent: "fibre", sodiumContent: "sodium" };
  const out: Record<string, string> = {};
  for (const [k, label] of Object.entries(keys)) if (v[k]) out[label] = String(v[k]);
  return Object.keys(out).length ? out : null;
}

export function draftFromJsonld(node: Node, url: string | null): RecipeDraft {
  const prep = isoMinutes(node.prepTime);
  let cook = isoMinutes(node.cookTime);
  const total = isoMinutes(node.totalTime);
  if (cook === null && total !== null) cook = Math.max(total - (prep ?? 0), 0);

  const tags: TagIn[] = asList(node.recipeCuisine).map((c) => ({ name: c, kind: "cuisine" }));
  const diets = asList(node.suitableForDiet).join(" ").toLowerCase();
  if (diets.includes("vegan")) tags.push({ name: "Vegan", kind: "diet" });
  if (diets.includes("vegetarian") || diets.includes("vegan")) tags.push({ name: "Vegetarian", kind: "diet" });

  let raw = node.recipeIngredient ?? node.ingredients ?? [];
  if (typeof raw === "string") raw = [raw];
  return {
    ...emptyDraft("url"),
    title: stripHtml(String(node.name ?? "")) || "Untitled recipe",
    description: stripHtml(String(node.description ?? "")).slice(0, 1000),
    servings: parseYield(node.recipeYield),
    prep_min: prep, cook_min: cook,
    method: methodSteps(node.recipeInstructions),
    ingredients: ingredientLines((raw as unknown[]).map(String)),
    photo_path: firstImage(node.image),
    source_url: url, tags, nutrition: nutrition(node.nutrition),
  };
}

export function importFromHtml(html: string, url = ""): RecipeDraft {
  const node = findRecipeJsonld(html);
  if (node) return draftFromJsonld(node, url || null);
  throw new ApiError(422, "No recipe found on that page. You can still add it by hand, or paste the recipe text.");
}
