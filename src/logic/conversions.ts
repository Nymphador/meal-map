// Recipe amounts -> a common measure (per kg, per L or per each), for pricing and nutrition.
//
// Every recipe unit belongs to one dimension (mass in g, volume in ml, or a count). Crossing
// dimensions needs the ingredient's density (volume <-> mass) or its average weight per item
// (count <-> mass), so "1 cup flour" or "2 onions" can be priced.

// Australian metric measures: 1 cup flour ~150 g, 1 tbsp oil ~14 g.
export const CUP_ML = 250;
export const TBSP_ML = 15;
export const TSP_ML = 5;

type Dimension = "mass" | "volume" | "count";

export const UNIT_DIMENSIONS: Record<string, [Dimension, number]> = {
  g: ["mass", 1], kg: ["mass", 1000], oz: ["mass", 28.35], lb: ["mass", 453.6],
  ml: ["volume", 1], l: ["volume", 1000],
  tsp: ["volume", TSP_ML], tbsp: ["volume", TBSP_ML], cup: ["volume", CUP_ML],
  each: ["count", 1], piece: ["count", 1], head: ["count", 1], bunch: ["count", 1],
  packet: ["count", 1], sheet: ["count", 1], jar: ["count", 1],
  // Small measures that are really weights; rough, but they're tiny amounts.
  clove: ["mass", 5], pinch: ["mass", 0.4], dash: ["volume", 0.6], handful: ["mass", 30],
  sprig: ["mass", 1], stalk: ["mass", 50], slice: ["mass", 30],
  can: ["mass", 400], // a standard 400 g can when the recipe doesn't say
};

const MEASURE_DIMENSION: Record<string, Dimension> = { kg: "mass", l: "volume", each: "count" };

/** What conversions need to know about an ingredient. */
export interface Convertible {
  name: string;
  density_g_per_ml: number | null;
  grams_per_each: number | null;
}

/** Says what's missing, e.g. "Set grams per item for onion". */
export class ConversionError extends Error {}

/** (2, "tbsp") -> ["volume", 30]. A missing unit means a count ("2 onions"). */
export function toBase(qty: number, unit: string | null | undefined): [Dimension, number] {
  const dim = UNIT_DIMENSIONS[unit || "each"];
  if (!dim) throw new ConversionError(`Unknown unit '${unit}'`);
  return [dim[0], qty * dim[1]];
}

/** A recipe amount in kg, l or each.
 * (500, "g", "kg") -> 0.5; (1, "cup", "kg", flour@0.6 g/ml) -> 0.15; (2, null, "kg", onion@150 g) -> 0.3 */
export function toMeasure(qty: number, unit: string | null | undefined, measure: string, ing: Convertible | null): number {
  const target = MEASURE_DIMENSION[measure];
  if (!target) throw new ConversionError(`Unknown measure '${measure}'`);
  let [dim, amount] = toBase(qty, unit);
  const name = ing?.name ?? "this ingredient";
  const density = ing?.density_g_per_ml;
  const eachG = ing?.grams_per_each;
  const by = (t: Dimension) => (t === "mass" ? "weight" : t === "volume" ? "volume" : "the item");

  // Everything goes through grams when the dimensions differ.
  if (dim !== target) {
    if (dim === "volume") {
      if (!density) throw new ConversionError(`Set a density (grams per ml) for ${name} to measure it by ${by(target)}`);
      amount *= density;
      dim = "mass";
    } else if (dim === "count") {
      if (!eachG) throw new ConversionError(`Set grams per item for ${name} to measure it by ${by(target)}`);
      amount *= eachG;
      dim = "mass";
    }
    if (dim !== target) { // now mass; on to volume or count
      if (target === "volume") {
        if (!density) throw new ConversionError(`Set a density (grams per ml) for ${name} to measure it by volume`);
        amount /= density;
      } else if (target === "count") {
        if (!eachG) throw new ConversionError(`Set grams per item for ${name} to measure it per item`);
        amount /= eachG;
      }
    }
  }
  return target === "count" ? amount : amount / 1000;
}

// The pantry and shopping list keep amounts in each ingredient's base unit.
const BASE_UNITS: Record<string, [string, number]> = { g: ["kg", 1000], ml: ["l", 1000], each: ["each", 1] };

/** Any recipe amount -> g, ml or each. (0.5, "kg", "g") -> 500; (2, null, "g", onion@150 g) -> 300 */
export function toUnit(qty: number, unit: string | null | undefined, base: string, ing: Convertible | null): number {
  const [measure, factor] = BASE_UNITS[base] ?? BASE_UNITS.g;
  return toMeasure(qty, unit, measure, ing) * factor;
}

export function baseUnit(ing: { default_unit: string }): string {
  return ing.default_unit in BASE_UNITS ? ing.default_unit : "g";
}

/** The measure a price unit is quoted in: g/kg -> kg, ml/l -> l, each -> each. */
export function measureOf(unit: string): string {
  return unit === "g" || unit === "kg" ? "kg" : unit === "ml" || unit === "l" ? "l" : "each";
}

export function dimensionOf(unit: string | null | undefined): Dimension | null {
  return UNIT_DIMENSIONS[unit || "each"]?.[0] ?? null;
}
