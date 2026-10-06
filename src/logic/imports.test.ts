import { describe, expect, it } from "vitest";
import { convertKitLine } from "./kitSizes";
import type { ParsedLine } from "./parse";
import { looksLikeRecipeCard, parseRecipeCard, type Page, type Word } from "./recipeCard";
import { parseText } from "./textImport";
import { draftFromJsonld, findRecipeJsonld, isoMinutes, parseYield } from "./urlImport";

// --- meal-kit packets ------------------------------------------------------------------

const line = (qty: number | null, unit: string | null, name: string, note: string | null = null): ParsedLine =>
  ({ quantity: qty, unit, name, note, raw_text: `${qty} ${unit} ${name}`, optional: false });

describe("convertKitLine", () => {
  it.each([
    [1, "packet", "chat potatoes", null, [400, "g", "1 packet (amount estimated)"]],
    [2, "packet", "chat potatoes", null, [800, "g", "2 packets (amount estimated)"]],
    [1, "packet", "trimmed green beans", "medium", [150, "g", "1 medium packet (amount estimated)"]],
    [1, "packet", "trimmed green beans", "large", [225, "g", "1 large packet (amount estimated)"]],
    [1, "packet", "baby spinach leaves", "small", [35, "g", "1 small packet (amount estimated)"]],
    [1, "packet", "garlic paste", null, [2, "tsp", "1 packet (amount estimated)"]],
    [1, "packet", "Mexican fiesta spice blend", null, [2, "tsp", "1 packet (amount estimated)"]],
    [1, "packet", "smoky BBQ glaze", null, [50, "g", "1 packet (amount estimated)"]],
    [1, "bunch", "baby broccoli", null, [175, "g", "1 bunch (amount estimated)"]],
    [2, "bunch", "baby broccoli", null, [350, "g", "2 bunches (amount estimated)"]],
    [1, "can", "sweetcorn", null, [125, "g", "1 tin (amount estimated)"]],
  ] as const)("%s %s %s", (qty, unit, name, size, expected) => {
    const out = convertKitLine(line(qty, unit, name), size);
    expect([out.quantity, out.unit, out.note]).toEqual(expected);
  });

  it("leaves other lines alone", () => {
    expect(convertKitLine(line(1, "bunch", "coriander")).unit).toBe("bunch"); // a supermarket bunch is fine
    expect(convertKitLine(line(300, "g", "pork loin steaks")).quantity).toBe(300);
    expect(convertKitLine(line(null, null, "olive oil")).quantity).toBeNull();
    const unknown = convertKitLine(line(1, "packet", "mystery crumb"));
    expect(unknown.unit).toBe("packet");
    expect(unknown.note).toContain("size not known");
  });

  it("handles mixed sizes and free text", () => {
    const mixed = convertKitLine(line(2.5, "packet", "trimmed green beans"), null, "1 medium + 1 large packets");
    expect([mixed.quantity, mixed.note]).toEqual([380, "1 medium + 1 large packets (amount estimated)"]);
    const free = convertKitLine({ ...line(1, "each", "packet baby spinach", "medium"), raw_text: "" });
    expect([free.quantity, free.unit, free.name]).toEqual([60, "g", "baby spinach"]);
  });
});

// --- a made-up meal-kit recipe card ---------------------------------------------------------

function words(text: string, x0: number, top: number, size = 8.5, font = "AAA+Body-Regular"): Word[] {
  const out: Word[] = [];
  let x = x0;
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const x1 = x + token.length * size * 0.45;
    out.push({ text: token, x0: x, x1, top, bottom: top + size, fontname: font, size });
    x = x1 + size * 0.3;
  }
  return out;
}

const HEAD = "BBB+Heading-Medium";

function card(): Page[] {
  const cover = [
    ...words("Lemony Chicken & Rice", 177, 29, 22, HEAD), ...words("12", 798, 29, 22, HEAD),
    ...words("with Peas & Herbs", 177, 52, 13, "CCC+Heading-Regular"),
    ...words("EASY KID FRIENDLY", 183, 71, 8),
    ...words("Prep in: 10-20 mins", 13.5, 543), ...words("Ready in: 30 mins", 13.5, 553),
    ...words("A bright weeknight dinner.", 90, 553), ...words("Carb Smart", 32, 570),
  ];
  const recipe = [
    ...words("Ingredients", 14, 102, 12, HEAD),
    ...words("2P", 93, 117, 7, HEAD), ...words("3P", 114, 117, 7, HEAD), ...words("4P", 135, 117, 7, HEAD),
    ...words("olive oil*", 15, 126, 7), ...words("refer to method", 93, 126, 7),
    ...words("chicken thigh", 15, 136, 7), ...words("300g", 89, 136, 7), ...words("450g", 110, 136, 7),
    ...words("600g", 131, 136, 7), ...words("(grams)", 15, 144, 7),
    ...words("jasmine rice", 15, 153, 7), ...words("1", 91, 157, 7), ...words("1", 112, 157, 7),
    ...words("2", 133, 157, 7), ...words("(packet(s))", 15, 161, 7),
    ...words("peas (packet(s))", 15, 170, 7), ...words("1M", 89, 170, 7), ...words("1L", 110, 170, 7),
    ...words("2M", 131, 170, 7),
    ...words("Pantry Items", 17, 190, 7), ...words("Nutrition", 14, 200, 12, HEAD),
    ...words("Energy (kJ) 2000kJ (478Cal) 400kJ (96Cal)", 15, 210, 7),
    ...words("Protein (g) 30g 6g", 15, 219, 7), ...words("Fat, total (g) 12g 2.4g", 15, 228, 7),
    ...words("Carbohydrate (g) 55g 11g", 15, 237, 7),
    // steps: a 2x2 grid of numbered boxes
    ...words("1", 228, 19, 12, HEAD), ...words("2", 539, 19, 12, HEAD),
    ...words("Cook the rice", 221, 176, 12, HEAD),
    ...words("• Boil water.", 221, 192), ...words("• Add rice and simmer,", 221, 203),
    ...words("12 minutes.", 229, 214), ...words("Little cooks: Stir the rice!", 221, 225),
    ...words("Cook the chicken", 531, 176, 12, HEAD), ...words("• Pan-fry chicken", 531, 192),
    ...words("3", 228, 275, 12, HEAD), ...words("4", 539, 275, 12, HEAD),
    ...words("Add peas", 221, 432, 12, HEAD), ...words("• Stir peas through rice.", 221, 448),
    ...words("TIP: Use frozen peas.", 221, 460),
    ...words("Serve", 531, 432, 12, HEAD), ...words("• Divide between plates.", 531, 448),
    ...words("ELEVATE ME: Add lemon.", 531, 470),
    ...words("CUSTOM", 228, 552, 8.5), ...words("CHICKEN BREAST", 431, 545, 7.5), ...words(":", 500, 545, 7.5),
    ...words("Cook until done.", 431, 553, 7.5),
  ];
  return [{ width: 841.89, height: 595.28, words: cover }, { width: 841.89, height: 595.28, words: recipe }];
}

describe("parseRecipeCard", () => {
  it("reads the whole card", () => {
    const r = parseRecipeCard(card(), 2);
    expect(r.title).toBe("Lemony Chicken & Rice with Peas & Herbs");
    expect([r.prep_min, r.cook_min, r.servings]).toEqual([20, 10, 2]);
    expect(r.description).toBe("A bright weeknight dinner.");
    expect(r.tags.map((t) => t.name)).toEqual(["Kid-friendly", "Carb Smart"]); // no brand tag
    expect(r.ingredients.map((i) => [i.quantity, i.unit, i.name, i.note])).toEqual([
      [null, null, "olive oil", "pantry item, as needed"],
      [300, "g", "chicken thigh", null],
      [150, "g", "jasmine rice", "1 packet (amount estimated)"], // packets become measurements
      [100, "g", "peas", "1 medium packet (amount estimated)"],
    ]);
    expect(r.method).toEqual([
      "Cook the rice. Boil water. Add rice and simmer, 12 minutes.", // kids' job dropped
      "Cook the chicken. Pan-fry chicken.",
      "Add peas. Stir peas through rice. TIP: Use frozen peas.",
      "Serve. Divide between plates.", // optional extras and the footer dropped
    ]);
    expect(r.nutrition).toEqual({ calories: "478 kcal", protein: "30 g", fat: "12 g", carbohydrates: "55 g" });
  });

  it.each([
    [4, 4, 600, [200, "2 medium packets"]],
    [3, 3, 450, [150, "1 large packet"]], // "1L" in a packets row is a large packet, not a litre
    [6, 4, 600, [200, "2 medium packets"]], // no 6P column: the nearest
    [1, 2, 300, [100, "1 medium packet"]],
  ] as const)("plan size follows servings %s", (servings, plan, chicken, peas) => {
    const r = parseRecipeCard(card(), servings);
    expect(r.servings).toBe(plan);
    expect(r.ingredients[1].quantity).toBe(chicken);
    const p = r.ingredients[3];
    expect([p.quantity, p.unit, p.note]).toEqual([peas[0], "g", `${peas[1]} (amount estimated)`]);
  });

  it("recognises a card by its layout", () => {
    expect(looksLikeRecipeCard("Ingredients 2P 3P 4P ... foodinfo")).toBe(true);
    expect(looksLikeRecipeCard("Ingredients 2 cups flour")).toBe(false);
  });
});

// --- plain text --------------------------------------------------------------------------

const TEXT_RECIPE = ["Grandma's Pea Soup", "Serves 4", "Ingredients", "500 g split peas", "1 brown onion, diced",
  "2 carrots, chopped", "2 L chicken stock", "Method", "1. Rinse the peas.",
  "2. Soften the onion and carrots in a large pot, about", "5 minutes.",
  "3. Add peas and stock and simmer for 1 hour."].join("\n");

describe("parseText", () => {
  it("reads title, servings, ingredients and steps", () => {
    const d = parseText(TEXT_RECIPE);
    expect([d.title, d.servings, d.source]).toEqual(["Grandma's Pea Soup", 4, "file"]);
    expect(d.ingredients.slice(0, 2).map((i) => [i.quantity, i.unit, i.name])).toEqual([[500, "g", "split peas"], [1, "each", "brown onion"]]);
    expect(d.method).toEqual(["Rinse the peas.", "Soften the onion and carrots in a large pot, about 5 minutes.",
      "Add peas and stock and simmer for 1 hour."]);
  });
});

// --- web pages ----------------------------------------------------------------------------

// Shaped like the Yoast @graph markup many WordPress recipe sites publish.
const PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Site"}</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"Page"},
  {"@type":["Recipe","NewsArticle"],
   "name":"Chicken &amp; Leek Pie",
   "description":"<p>A golden pie.</p>",
   "image":[{"@type":"ImageObject","url":"https://example.com/pie.jpg"}],
   "recipeYield":["6","6 serves"],
   "prepTime":"PT20M","totalTime":"PT1H15M",
   "recipeCuisine":["Australian"],
   "suitableForDiet":"https://schema.org/GlutenFreeDiet",
   "recipeIngredient":["800 g chicken thigh fillets, cut into 3cm pieces","2 leeks, sliced","1 sheet puff pastry","Salt, to taste"],
   "recipeInstructions":[
     {"@type":"HowToSection","name":"Filling","itemListElement":[
        {"@type":"HowToStep","text":"Brown the chicken."},
        {"@type":"HowToStep","text":"Add the <strong>leeks</strong>."}]},
     {"@type":"HowToStep","text":"Top with pastry and bake."}],
   "nutrition":{"@type":"NutritionInformation","calories":"520 kcal","proteinContent":"38 g"}}
]}
</script></head><body></body></html>`;

describe("web import", () => {
  it("finds the recipe inside @graph with a type list", () => {
    expect(findRecipeJsonld(PAGE)?.name).toBe("Chicken &amp; Leek Pie");
  });

  it("maps every field", () => {
    const d = draftFromJsonld(findRecipeJsonld(PAGE)!, "https://example.com/pie");
    expect(d.title).toBe("Chicken & Leek Pie");
    expect(d.description).toBe("A golden pie.");
    expect(d.servings).toBe(6);
    expect([d.prep_min, d.cook_min]).toEqual([20, 55]); // cook = total - prep when cookTime is missing
    expect(d.method).toEqual(["Brown the chicken.", "Add the leeks.", "Top with pastry and bake."]);
    expect(d.ingredients.map((i) => i.name)).toEqual(["chicken thigh fillets", "leeks", "puff pastry", "Salt"]);
    expect([d.ingredients[0].quantity, d.ingredients[0].unit]).toEqual([800, "g"]);
    expect(d.photo_path).toBe("https://example.com/pie.jpg");
    expect([d.source, d.source_url]).toEqual(["url", "https://example.com/pie"]);
    expect(d.tags.map((t) => t.name)).toEqual(["Australian"]);
    expect(d.nutrition).toEqual({ calories: "520 kcal", protein: "38 g" });
  });

  it("splits string instructions into steps", () => {
    const d = draftFromJsonld({ "@type": "Recipe", name: "x", recipeInstructions: "Step one.\nStep two.<br>Step three." }, "u");
    expect(d.method).toEqual(["Step one.", "Step two.", "Step three."]);
  });

  it("returns null when there's no recipe", () => {
    expect(findRecipeJsonld(`<script type="application/ld+json">${JSON.stringify({ "@type": "Article" })}</script>`)).toBeNull();
    expect(findRecipeJsonld("<script type='application/ld+json'>{broken</script>")).toBeNull();
  });

  it("reads ISO durations and yields", () => {
    expect(isoMinutes("PT1H30M")).toBe(90);
    expect(isoMinutes("P0DT0H20M")).toBe(20);
    expect(isoMinutes("PT45S")).toBe(1);
    expect([isoMinutes(""), isoMinutes(null), isoMinutes("PT")]).toEqual([null, null, null]);
    expect(parseYield("Serves 4")).toBe(4);
    expect(parseYield(["", "8 cookies"])).toBe(8);
    expect(parseYield(3)).toBe(3);
    expect(parseYield(null)).toBe(4);
  });
});
