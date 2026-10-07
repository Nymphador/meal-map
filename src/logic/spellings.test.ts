import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../data/db";
import { dispatch } from "../server";
import { saveRecipe } from "./recipes";
import { emptyDraft } from "./textImport";

const api = <T = any>(method: string, path: string, body?: unknown) => dispatch(method, path, body) as Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Detail = { id: number; name: string; aliases: string[] };
type Result = { ingredient: Detail; linked: number; merged: string | null; undo: unknown };

function recipe(title: string, line: string) {
  return saveRecipe({ ...emptyDraft(), title, ingredients: [{ quantity: 50, unit: "g", name: line, note: null, raw_text: line, optional: false }] });
}
const lineIngredient = (id: number) => db().recipes.find((r) => r.id === id)!.lines[0].ingredient_id;
const byName = (name: string) => db().ingredients.find((i) => i.name === name)!;

beforeEach(() => resetDb());

describe("other spellings", () => {
  it("suggests recipe wordings, merges look-alike ingredients with undo, and links future recipes", async () => {
    const crumb = (await api<Detail>("POST", "/api/ingredients", { name: "breadcrumb", category: "pantry", default_unit: "g" })).id;
    const fish = recipe("Crumbed fish", "fine breadcrumbs");
    const rissoles = recipe("Rissoles", "dried breadcrumbs");
    const fine = byName("fine breadcrumb"); // the app made each wording an ingredient of its own
    db().pantry.push({ id: 900, ingredient_id: fine.id, quantity: 200, unit: "g", level: null, location: "pantry",
      purchased_on: null, expires_on: null, deleted: false });

    const suggested = await api<{ text: string; recipes: number; linked_to: { name: string } | null }[]>("GET", `/api/ingredients/${crumb}/spellings/suggest`);
    expect(suggested.map((s) => s.text).sort()).toEqual(["dried breadcrumb", "fine breadcrumb"]);
    expect(suggested.find((s) => s.text === "fine breadcrumb")!.linked_to!.name).toBe("fine breadcrumb");

    const r = await api<Result>("POST", `/api/ingredients/${crumb}/spellings`, { text: "Fine Breadcrumbs" });
    expect(r.merged).toBe("fine breadcrumb");
    expect(r.linked).toBe(1);
    expect(r.ingredient.aliases).toContain("fine breadcrumb");
    expect(lineIngredient(fish.id)).toBe(crumb);
    expect(fine.deleted).toBe(true);
    expect(db().pantry.find((p) => p.id === 900)!.ingredient_id).toBe(crumb);
    expect(recipe("Schnitzel", "fine breadcrumbs").lines[0].ingredient_id).toBe(crumb); // later recipes too

    await api("POST", "/api/ingredients/spellings/undo", r.undo);
    expect(fine.deleted).toBe(false);
    expect(lineIngredient(fish.id)).toBe(fine.id);
    expect(db().pantry.find((p) => p.id === 900)!.ingredient_id).toBe(fine.id);
    expect(byName("breadcrumb").aliases).not.toContain("fine breadcrumb");

    await api("POST", `/api/ingredients/${crumb}/spellings`, { text: "dried breadcrumbs" });
    expect(lineIngredient(rissoles.id)).toBe(crumb);
    const plain = await api<Result>("POST", `/api/ingredients/${crumb}/spellings`, { text: "panko breadcrumbs" });
    expect(plain.merged).toBeNull();
    expect(recipe("Katsu", "panko breadcrumbs").lines[0].ingredient_id).toBe(crumb);
    await expect(api("POST", `/api/ingredients/${crumb}/spellings`, { text: " " })).rejects.toThrow();
  });
});
