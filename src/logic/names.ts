// Ingredient names: every spelling a recipe uses ("Boneless Chicken Thighs") is compared in a
// normalised form ("boneless chicken thigh": lowercase, singular last word).

import { dimensionOf } from "./conversions";

const IRREGULAR: Record<string, string> = { leaves: "leaf", loaves: "loaf", halves: "half" };

export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word in IRREGULAR) return IRREGULAR[word];
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("oes") || /(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** "Boneless Chicken Thighs!" -> "boneless chicken thigh" */
export function normaliseName(name: string): string {
  const words = name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(" ");
}

// Words that describe preparation or size rather than what you buy; ignored when comparing names.
export const DESCRIPTORS = new Set(["fresh", "large", "small", "medium", "boneless", "skinless", "finely", "roughly",
  "chopped", "sliced", "grated", "crushed", "ripe", "raw", "whole", "of", "and", "or", "the", "a", "to", "taste"]);

export function nameWords(text: string): Set<string> {
  return new Set(normaliseName(text).split(" ").filter((w) => w && !DESCRIPTORS.has(w)).map(singular));
}

const CATEGORY_WORDS: Record<string, string[]> = {
  meat: ["chicken", "beef", "pork", "lamb", "mince", "bacon", "sausage", "ham", "steak", "turkey", "veal", "chorizo"],
  seafood: ["fish", "salmon", "prawn", "tuna", "barramundi", "cod", "shrimp", "squid", "mussel", "snapper"],
  dairy: ["milk", "cheese", "butter", "yoghurt", "yogurt", "cream", "egg", "parmesan", "mozzarella", "feta", "ricotta"],
  produce: ["onion", "garlic", "carrot", "potato", "capsicum", "broccoli", "spinach", "tomato", "zucchini",
    "mushroom", "lemon", "lime", "avocado", "coriander", "parsley", "basil", "ginger", "celery",
    "cabbage", "lettuce", "cucumber", "apple", "banana", "pumpkin", "chilli", "leek", "kale", "bean sprout",
    "choy", "eggplant", "corn", "pea", "spring onion", "herb", "mint", "thyme", "rosemary"],
  frozen: ["frozen"],
  bakery: ["bread", "tortilla", "wrap", "roll", "bun", "pita", "naan"],
};

export function guessCategory(name: string): string {
  const text = normaliseName(name);
  if (text.includes("frozen")) return "frozen";
  // Whole words only: "cornflour" isn't corn, "eggplant" isn't an egg.
  const has = (w: string) => new RegExp(`(^| )${w}s?( |$)`).test(text);
  for (const [category, words] of Object.entries(CATEGORY_WORDS)) {
    if (words.some(has)) return category;
  }
  return "pantry";
}

export function guessDefaultUnit(recipeUnit: string | null | undefined): string {
  const dim = dimensionOf(recipeUnit) ?? "count";
  return dim === "mass" ? "g" : dim === "volume" ? "ml" : "each";
}

export const CATEGORIES = ["produce", "meat", "seafood", "dairy", "bakery", "pantry", "frozen", "other"];
