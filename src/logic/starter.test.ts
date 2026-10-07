import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../data/db";
import { STARTER_RECIPES } from "../data/starterRecipes";
import { ingredientLines } from "./parse";
import { recipeOut, saveRecipe } from "./recipes";
import { addStarterRecipes } from "./starter";
import { emptyDraft } from "./textImport";

beforeEach(() => resetDb());

describe("starter recipes", () => {
  it("are added once, with their links, tags and nutrition", () => {
    expect(addStarterRecipes(true)).toBe(STARTER_RECIPES.length);
    expect(db().recipes).toHaveLength(20);
    const karahi = db().recipes.find((r) => r.title === "Chicken karahi")!;
    expect(karahi.source_url).toBe("https://www.bbcgoodfood.com/recipes/chicken-karahi");
    expect(karahi.photo_path).toBe("/starter/chicken-karahi.jpg");
    expect(karahi.meal_types).toEqual(["dinner"]);
    expect(db().tags.some((t) => t.name === "Indian" && karahi.tag_ids.includes(t.id))).toBe(true);
    // Every one fits the brief: under 750 kcal and at least 35 g protein per serve, read from its panel.
    for (const r of db().recipes) {
      const m = recipeOut(r).macros;
      expect(m.kcal).toBeLessThan(750);
      expect(m.protein).toBeGreaterThanOrEqual(35);
      expect(r.lines.every((l) => l.ingredient_id !== null || l.quantity === null)).toBe(true);
    }
    expect(addStarterRecipes(true)).toBe(0); // not again
  });

  it("never comes back after being deleted, or duplicates a recipe already imported", () => {
    addStarterRecipes(true);
    db().recipes = db().recipes.filter((r) => r.title !== "Beef schnitzel");
    expect(addStarterRecipes(true)).toBe(0);
    expect(db().recipes.some((r) => r.title === "Beef schnitzel")).toBe(false);

    resetDb();
    saveRecipe({ ...emptyDraft("url"), title: "Imported earlier", source_url: STARTER_RECIPES[0].source_url });
    expect(addStarterRecipes(true)).toBe(19);
  });

  it("drops the photos in a build without them", () => {
    addStarterRecipes(true);
    expect(addStarterRecipes(false)).toBe(20);
    expect(db().recipes.every((r) => r.photo_path === null)).toBe(true);
  });

  it("parse into clean ingredient names", () => {
    for (const s of STARTER_RECIPES) {
      for (const line of ingredientLines(s.ingredients)) {
        expect(line.name, `${s.title}: ${line.raw_text}`).not.toMatch(/\d|,|\(|^(cm|bunch|few|handful|piece)\b/i);
      }
    }
  });
});
