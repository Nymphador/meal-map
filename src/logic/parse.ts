// Turns recipe ingredient text ("1 1/2 cups plain flour, sifted") into quantity/unit/name/note.
//
// Deliberately rule-based and forgiving: the raw text is always kept, and every parsed field
// can be corrected on the review screen.

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5",
  "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6", "⅚": "5/6", "⅛": "1/8",
  "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

// Normalised unit -> spellings. Imperial weights are converted to grams on the way in (the app is metric).
const UNIT_SPELLINGS: Record<string, string[]> = {
  g: ["g", "gm", "gms", "gr", "gram", "grams", "gramme", "grammes"],
  kg: ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"],
  ml: ["ml", "mls", "millilitre", "millilitres", "milliliter", "milliliters"],
  l: ["l", "lt", "ltr", "litre", "litres", "liter", "liters"],
  tsp: ["tsp", "tsps", "tspn", "tspns", "teasp", "teaspoon", "teaspoons"],
  tbsp: ["tbsp", "tbsps", "tbs", "tbl", "tbls", "tblsp", "tblsps", "tbspn", "tblspn", "tablespoon", "tablespoons"],
  cup: ["cup", "cups"],
  oz: ["oz", "ounce", "ounces"],
  lb: ["lb", "lbs", "pound", "pounds"],
  clove: ["clove", "cloves"],
  can: ["can", "cans", "tin", "tins"],
  jar: ["jar", "jars"],
  bunch: ["bunch", "bunches"],
  pinch: ["pinch", "pinches"],
  dash: ["dash", "dashes"],
  handful: ["handful", "handfuls"],
  slice: ["slice", "slices"],
  sprig: ["sprig", "sprigs"],
  stalk: ["stalk", "stalks", "stick", "sticks", "rib", "ribs"],
  packet: ["packet", "packets", "pack", "packs", "pkt", "pkts", "sachet", "sachets"],
  sheet: ["sheet", "sheets"],
  head: ["head", "heads"],
  piece: ["piece", "pieces"],
  each: ["each", "whole"],
};
const UNIT_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(UNIT_SPELLINGS).flatMap(([unit, spellings]) => spellings.map((s) => [s, unit])));

const GRAMS_PER: Record<string, number> = { oz: 28.35, lb: 453.6 };
const SIZE_WORDS = ["extra large", "extra-large", "large", "medium", "small"];

const NUM = String.raw`\d+(?:\.\d+)?`;
const FRACTION = String.raw`\d+\s*/\s*\d+`;
const MIXED = String.raw`\d+\s+${FRACTION}`;
const AMOUNT = `(?:${MIXED}|${FRACTION}|${NUM})`;
// "1 1/2", "2-3", "2 to 3"; a range keeps the upper bound (safer for shopping).
const QTY_RE = new RegExp(String.raw`^(?<a>${AMOUNT})(?:\s*(?:-|–|—|to)\s*(?<b>${AMOUNT}))?\s*`);
// "2 x 400g cans", "2 (400 g) tins", "400g can": a multiplied pack size.
// The separator after the count is mandatory, or "400g" could backtrack into "40" x "0g".
const PACK_RE = new RegExp(
  String.raw`^(?:(?<n>${NUM})(?:\s*[x×]\s*|\s*\(\s*|\s+))?(?<size>${NUM})\s*(?<unit>g|kg|ml|l)\s*\)?\s*` +
  String.raw`(?:cans?|tins?|jars?|packets?|packs?|bottles?|tubs?|bags?|blocks?)\b\s*`, "i");
const UNIT_RE = /^(?<unit>[A-Za-z]+)\.?(?=[\s,(]|$)\s*/;

export interface ParsedLine {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  raw_text: string;
  optional: boolean;
}

export function parseAmount(text: string): number {
  text = text.trim();
  if (text.includes(" ") && text.includes("/")) {
    const [whole, ...rest] = text.split(/\s+/);
    return Number(whole) + parseAmount(rest.join(" "));
  }
  if (text.includes("/")) {
    const [num, den] = text.split("/", 2).map((p) => Number(p.trim()));
    return den ? num / den : 0;
  }
  return Number(text);
}

export function normaliseUnit(token: string | null | undefined): string | null {
  if (!token) return null;
  return UNIT_LOOKUP[token.trim().replace(/\.+$/, "").toLowerCase()] ?? null;
}

function clean(text: string): string {
  text = text.replace(/ /g, " ").trim();
  for (const [char, frac] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replace(new RegExp(String.raw`(\d)\s*${char}`, "g"), `$1 ${frac}`); // "1½" -> "1 1/2"
    text = text.split(char).join(frac);
  }
  text = text.replace(/^[-•*·▢□]+\s*/, ""); // list bullets / checkbox glyphs
  return text.replace(/\s+/g, " ");
}

function toMetric(qty: number | null, unit: string | null): [number | null, string | null] {
  if (qty !== null && unit !== null && unit in GRAMS_PER) return [Math.round(qty * GRAMS_PER[unit]), "g"];
  return [qty, unit];
}

/** Pulls a leading amount and unit off text: [quantity, unit, remainder]. */
export function splitQuantity(input: string): [number | null, string | null, string] {
  let text = clean(input);

  const pack = PACK_RE.exec(text);
  if (pack?.groups) {
    const n = Number(pack.groups.n ?? 1);
    const [qty, unit] = toMetric(n * Number(pack.groups.size), pack.groups.unit.toLowerCase());
    return [qty, unit, text.slice(pack[0].length)];
  }

  let qty: number | null = null;
  if (/^an?\s/i.test(text)) {
    qty = 1;
    text = text.replace(/^an?\s+/i, "");
  } else {
    const m = QTY_RE.exec(text);
    if (m?.groups) {
      qty = parseAmount(m.groups.b ?? m.groups.a);
      text = text.slice(m[0].length);
    }
  }

  let unit: string | null = null;
  const m = UNIT_RE.exec(text);
  // Without an amount, only "pinch of ..." style counts as a unit; otherwise "Cloves, whole"
  // would lose its name to the unit.
  if (m?.groups && normaliseUnit(m.groups.unit) && (qty !== null || /^of\s/i.test(text.slice(m[0].length)))) {
    unit = normaliseUnit(m.groups.unit);
    text = text.slice(m[0].length).replace(/^of\s+/i, "");
  }

  [qty, unit] = toMetric(qty, unit);
  return [qty, unit, text.trim()];
}

/** Top-level bracketed groups, tolerating nesting and stray brackets:
 * "180g (6oz ) chicken (, sliced (Note 1))" -> ["180g  chicken ", ["6oz ", ", sliced (Note 1)"]] */
function pullAsides(text: string): [string, string[]] {
  let rest = "", buf = "", depth = 0;
  const asides: string[] = [];
  for (const ch of text) {
    if (ch === "(") {
      depth++;
      if (depth > 1) buf += ch;
    } else if (ch === ")") {
      if (depth === 0) continue; // stray closing bracket
      depth--;
      if (depth === 0) {
        asides.push(buf);
        buf = "";
      } else {
        buf += ch;
      }
    } else if (depth) {
      buf += ch;
    } else {
      rest += ch;
    }
  }
  if (buf) asides.push(buf);
  return [rest, asides];
}

// "(6oz)" or "(1 cup)" next to a metric amount is just a conversion; drop it.
function isMeasure(text: string): boolean {
  const [qty, unit, rest] = splitQuantity(text);
  return qty !== null && unit !== null && !rest;
}

const strip = (s: string, chars: string) => {
  const set = new Set(chars);
  let a = 0, b = s.length;
  while (a < b && set.has(s[a])) a++;
  while (b > a && set.has(s[b - 1])) b--;
  return s.slice(a, b);
};

export function parseLine(raw: string): ParsedLine {
  const rawText = clean(raw);
  let [qty, unit, rest] = splitQuantity(rawText);

  // Recipe-site footnote markers ("(Note 3)") mean nothing outside the site.
  rest = rest.replace(/\bnotes?\s*\d+\b/gi, "");
  const optional = /\boptional\b/i.test(rest);
  rest = rest.replace(/\boptional\b/gi, "");

  // Bracketed asides become notes: "chicken thighs (skinless)".
  const notes: string[] = [];
  const [outside, asides] = pullAsides(rest);
  rest = outside;
  for (let aside of asides) {
    aside = strip(aside.replace(/[()]/g, " ").replace(/\s+/g, " "), " ,;:-");
    if (aside && !isMeasure(aside)) notes.push(aside);
  }

  const comma = rest.indexOf(",");
  let name = comma >= 0 ? rest.slice(0, comma) : rest;
  const after = comma >= 0 ? rest.slice(comma + 1).trim() : "";
  if (after) notes.push(after);

  name = strip(name.replace(/\s+/g, " "), " ,.;:-");
  const lower = name.toLowerCase();
  for (const size of SIZE_WORDS) {
    if (lower.startsWith(size + " ")) {
      notes.unshift(size);
      name = name.slice(size.length).trim();
      break;
    }
  }

  if (qty !== null && unit === null) unit = "each";
  const note = notes.filter(Boolean).join(", ") || null;
  return { quantity: qty, unit, name: name || rawText, note, raw_text: rawText, optional };
}

export function stripHtml(text: string): string {
  const decoded = decodeEntities((text || "").replace(/<[^>]+>/g, " "));
  return decoded.replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim(); // "<b>leeks</b>." -> "leeks."
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (_, e) =>
      ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" })[e as string] ?? _);
}

/** Lines of text -> parsed ingredient lines (blank lines dropped). */
export function ingredientLines(rawLines: string[]): ParsedLine[] {
  return rawLines.map((raw) => stripHtml(raw)).filter(Boolean).map(parseLine);
}
