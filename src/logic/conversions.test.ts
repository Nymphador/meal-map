import { describe, expect, it } from "vitest";
import { ConversionError, toMeasure, type Convertible } from "./conversions";

const ing = (name: string, density: number | null = null, each: number | null = null): Convertible =>
  ({ name, density_g_per_ml: density, grams_per_each: each });
const FLOUR = ing("plain flour", 0.6);
const OIL = ing("olive oil", 0.91);
const ONION = ing("onion", null, 150);
const GARLIC = ing("garlic", null, 50); // sold by the bulb
const EGG = ing("egg", null, 55);
const MILK = ing("milk", 1.03);
const PLAIN = ing("mystery");

describe("toMeasure", () => {
  it.each([
    [500, "g", "kg", PLAIN, 0.5],
    [1.5, "kg", "kg", PLAIN, 1.5],
    [250, "ml", "l", PLAIN, 0.25],
    [1, "cup", "l", MILK, 0.25], // 1 cup = 250 ml
    [1, "cup", "kg", FLOUR, 0.15], // 1 cup flour ~150 g
    [1, "tbsp", "kg", OIL, 0.01365], // 1 tbsp oil ~14 g
    [2, "tsp", "l", PLAIN, 0.01],
    [2, null, "kg", ONION, 0.3], // "2 onions" by weight
    [2, "each", "each", ONION, 2],
    [2, "clove", "each", GARLIC, 0.2], // 2 cloves = a fifth of a bulb
    [3, "each", "kg", EGG, 0.165],
    [300, "g", "each", ONION, 2], // 300 g of onions = 2 onions
    [500, "g", "l", MILK, 500 / 1.03 / 1000], // weight -> volume
    [1, "can", "kg", PLAIN, 0.4], // a standard can
  ] as const)("%s %s -> %s", (qty, unit, measure, i, expected) => {
    expect(toMeasure(qty, unit, measure, i)).toBeCloseTo(expected, 8);
  });

  it.each([
    [1, "cup", "kg", PLAIN, "density"],
    [2, null, "kg", PLAIN, "grams per item"],
    [100, "g", "each", PLAIN, "grams per item"],
    [1, "cup", "each", ONION, "density"],
  ] as const)("says what to set: %s %s -> %s", (qty, unit, measure, i, needs) => {
    expect(() => toMeasure(qty, unit, measure, i)).toThrow(ConversionError);
    try {
      toMeasure(qty, unit, measure, i);
    } catch (e) {
      expect((e as Error).message).toContain(needs);
      expect((e as Error).message).toContain(i.name);
    }
  });

  it("refuses unknown units", () => {
    expect(() => toMeasure(1, "smidgen", "kg", PLAIN)).toThrow(ConversionError);
  });
});
