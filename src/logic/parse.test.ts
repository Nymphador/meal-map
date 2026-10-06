import { describe, expect, it } from "vitest";
import { guessCategory, normaliseName } from "./names";
import { parseLine, splitQuantity } from "./parse";

describe("parseLine", () => {
  it.each([
    ["500 g chicken thigh fillets, diced", 500, "g", "chicken thigh fillets", "diced"],
    ["1 1/2 cups plain flour, sifted", 1.5, "cup", "plain flour", "sifted"],
    ["½ tsp salt", 0.5, "tsp", "salt", null],
    ["1½ cups milk", 1.5, "cup", "milk", null],
    ["2 large onions, finely chopped", 2, "each", "onions", "large, finely chopped"],
    ["1 x 400g can diced tomatoes", 400, "g", "diced tomatoes", null],
    ["2 (400 g) tins chickpeas, drained", 800, "g", "chickpeas", "drained"],
    ["400g can coconut milk", 400, "g", "coconut milk", null],
    ["Salt and pepper, to taste", null, null, "Salt and pepper", "to taste"],
    ["2-3 cloves garlic, crushed", 3, "clove", "garlic", "crushed"],
    ["1kg beef mince", 1, "kg", "beef mince", null],
    ["a pinch of salt", 1, "pinch", "salt", null],
    ["1 lb ground beef", 454, "g", "ground beef", null],
    ["3 tbsp olive oil (or vegetable oil)", 3, "tbsp", "olive oil", "or vegetable oil"],
    ["Cloves, whole", null, null, "Cloves", "whole"],
    ["2 tablespoons of soy sauce", 2, "tbsp", "soy sauce", null],
    ["4 eggs", 4, "each", "eggs", null],
    ["• 250ml chicken stock", 250, "ml", "chicken stock", null],
    ["1.5 L water", 1.5, "l", "water", null],
    ["1/2 bunch coriander", 0.5, "bunch", "coriander", null],
  ])("%s", (raw, qty, unit, name, note) => {
    const p = parseLine(raw);
    if (qty === null) expect(p.quantity).toBeNull();
    else expect(p.quantity).toBeCloseTo(qty);
    expect([p.unit, p.name, p.note]).toEqual([unit, name, note]);
  });

  it("removes the optional flag from the name", () => {
    const p = parseLine("1 cup fresh coriander leaves (optional)");
    expect([p.optional, p.name, p.note]).toEqual([true, "fresh coriander leaves", null]);
  });

  it.each([
    // Real recipe-site lines: nested brackets, footnote markers, metric + imperial
    ["180g (6oz )  chicken breast (, thinly sliced)", 180, "g", "chicken breast", "thinly sliced", false],
    ["1/2 tsp baking soda / bi-carb ((optional, Note 1))", 0.5, "tsp", "baking soda / bi-carb", null, true],
    ["1 1/2 tbsp light soy sauce (, or all purpose soy(Note 3))", 1.5, "tbsp", "light soy sauce", "or all purpose soy", false],
    ["1 tbsp Chinese Cooking Wine (OR Mirin (Note 5))", 1, "tbsp", "Chinese Cooking Wine", "OR Mirin", false],
    ["2 cups (500ml) chicken stock)", 2, "cup", "chicken stock", null, false],
  ])("recipe-site quirks: %s", (raw, qty, unit, name, note, optional) => {
    const p = parseLine(raw);
    expect([p.quantity, p.unit, p.name, p.note, p.optional]).toEqual([qty, unit, name, note, optional]);
  });
});

describe("splitQuantity", () => {
  it("doesn't backtrack into a tiny pack", () => {
    expect(splitQuantity("400g can chickpeas").slice(0, 2)).toEqual([400, "g"]); // not 40 x "0g"
  });

  it("handles measure-only text", () => {
    expect(splitQuantity("1/2 cup")).toEqual([0.5, "cup", ""]);
    expect(splitQuantity("To taste")).toEqual([null, null, "To taste"]);
    expect(splitQuantity("1 tblsp").slice(0, 2)).toEqual([1, "tbsp"]);
  });
});

describe("normaliseName", () => {
  it.each([
    ["Chicken Thighs", "chicken thigh"],
    ["tomatoes", "tomato"],
    ["cherries", "cherry"],
    ["Boneless, skinless chicken thigh fillets", "boneless skinless chicken thigh fillet"],
    ["glass", "glass"],
  ])("%s", (raw, key) => expect(normaliseName(raw)).toBe(key));
});

describe("guessCategory", () => {
  it.each([
    ["cornflour", "pantry"], // not corn
    ["eggplant", "produce"], // not an egg
    ["corn kernels", "produce"],
    ["free range eggs", "dairy"],
    ["chicken thigh fillets", "meat"],
    ["frozen peas", "frozen"],
    ["spring onions", "produce"],
    ["soy sauce", "pantry"],
  ])("%s", (name, category) => expect(guessCategory(name)).toBe(category));
});
