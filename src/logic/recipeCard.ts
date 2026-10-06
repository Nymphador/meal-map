// Reads meal-kit recipe-card PDFs: a cover page (title, "with ..." subtitle, badges, Prep in / Ready in,
// blurb, big photo) and a recipe page with an ingredients table on the left (one column per plan size,
// 2P to 6P), the nutrition panel under it, and numbered steps in a grid on the right. The text is real
// text, so this needs no OCR: words are placed by their coordinates.
//
// Works on plain word objects (text, x0, x1, top, bottom, fontname, size), so it can be tested without a PDF.

import { convertKitLine, sizeOf } from "./kitSizes";
import type { ParsedLine } from "./parse";
import type { RecipeDraft, TagIn } from "../types";

export interface Word {
  text: string;
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  fontname: string;
  size: number;
}

export interface Page {
  width: number;
  height: number;
  words: Word[];
}

/** A card has an Ingredients table with plan-size columns ("2P 3P 4P"). */
export function looksLikeRecipeCard(text: string): boolean {
  return /ingredients/i.test(text) && (text.match(/\b[1-9]P\b/g) ?? []).length >= 2;
}

// --- small helpers -----------------------------------------------------------------------

/** Words grouped into lines (by top), each line left to right. */
export function linesOf(words: Word[], tolerance = 2.5): Word[][] {
  const out: Word[][] = [];
  for (const w of [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0].top - w.top) <= tolerance) last.push(w);
    else out.push([w]);
  }
  return out.map((line) => [...line].sort((a, b) => a.x0 - b.x0));
}

/** Joins words with a space only where there's a visible gap, so "fan-forced" + "." stays "fan-forced.". */
export function joinWords(line: Word[]): string {
  let text = "";
  let prev: Word | null = null;
  for (const w of line) {
    if (prev && w.x0 - prev.x1 > 0.8) text += " ";
    text += w.text;
    prev = w;
  }
  return text;
}

const clean = (text: string) => text.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const minTop = (ws: Word[]) => Math.min(...ws.map((w) => w.top));
const centre = (w: Word) => (w.x0 + w.x1) / 2;
const isUpper = (s: string) => s !== s.toLowerCase() && s === s.toUpperCase();

// --- cover page ------------------------------------------------------------------------------

/** Title + the "with ..." line under it. The kit number sits far right in the title's font; skip it. */
function title(cover: Page): string {
  const top = cover.words.filter((w) => w.top < cover.height * 0.25 && w.x0 < cover.width * 0.78);
  if (!top.length) return "";
  const biggest = Math.max(...top.map((w) => w.size));
  const titleLines = linesOf(top.filter((w) => Math.abs(w.size - biggest) < 0.5));
  let text = titleLines.map(joinWords).join(" ");
  const bottom = Math.max(...titleLines.flat().map((w) => w.bottom));
  const sub = linesOf(top.filter((w) => w.size < biggest - 0.5)).filter((l) => l[0].top - bottom >= 0 && l[0].top - bottom < 30);
  if (sub.length && joinWords(sub[0]).toLowerCase().startsWith("with ")) text = `${text} ${joinWords(sub[0])}`;
  return clean(text);
}

function minutes(text: string, label: string): number | null {
  const m = new RegExp(`${label}:\\s*(\\d+)(?:\\s*-\\s*(\\d+))?\\s*min`, "i").exec(text);
  return m ? Number(m[2] ?? m[1]) : null; // the top of a range: better to over-allow time than under
}

function coverDetails(cover: Page): { prep: number | null; cook: number | null; description: string; tags: TagIn[] } {
  const lines = linesOf(cover.words);
  const text = lines.map(joinWords).join(" ");
  const prep = minutes(text, "Prep in"), ready = minutes(text, "Ready in");
  const cook = prep !== null && ready !== null && ready > prep ? ready - prep : null;

  let description = "";
  const labelLines = lines.filter((l) => /^(prep in|ready in)/i.test(joinWords(l)));
  if (labelLines.length) {
    // The blurb sits right of the "Prep in: 10-20 mins / Ready in: 35-45 mins" labels.
    const edge = Math.max(...labelLines.map((l) => l.find((w) => w.text.toLowerCase().startsWith("min"))?.x1 ?? l[l.length - 1].x1));
    const from = labelLines[0][0].top - 2;
    description = clean(linesOf(cover.words.filter((w) => w.top >= from && w.x0 > edge + 1)).map(joinWords).join(" "));
  }

  const tags: TagIn[] = [];
  const upper = text.toUpperCase();
  for (const [marker, name, kind] of [["KID FRIENDLY", "Kid-friendly", "other"], ["VEGGIE", "Vegetarian", "diet"],
    ["VEGETARIAN", "Vegetarian", "diet"], ["CARB SMART", "Carb Smart", "custom"],
    ["CALORIE SMART", "Calorie Smart", "custom"], ["PROTEIN SMART", "Protein Smart", "custom"]]) {
    if (upper.includes(marker) && tags.every((t) => t.name !== name)) tags.push({ name, kind });
  }
  return { prep, cook, description, tags };
}

// --- ingredients table -----------------------------------------------------------------------

const UNIT_WORDS: Record<string, string | null> = {
  packet: "packet", packets: "packet", sachet: "packet", bag: "packet", tub: "packet",
  bunch: "bunch", bunches: "bunch", gram: "g", grams: "g", g: "g", kg: "kg", ml: "ml",
  tin: "can", tins: "can", can: "can", tbs: "tbsp", tbsp: "tbsp", tsp: "tsp", cup: "cup",
  cups: "cup", clove: "clove", cloves: "clove", slice: "slice", slices: "slice", unit: null,
  units: null, piece: null, pieces: null, medium: null, large: null, small: null,
};
const SIZES: Record<string, string> = { S: "small", M: "medium", L: "large" };
const QTY_TOKEN = /^(?:\d+(?:\.\d+)?|\d+\/\d+|½|¼|¾)(?:g|kg|ml|l|S|M|L)?$|^\+$/i;
const NUM = String.raw`(\d+(?:\.\d+)?|\d+/\d+|½|¼|¾)`;

function number(raw: string): number {
  raw = ({ "½": "0.5", "¼": "0.25", "¾": "0.75" } as Record<string, string>)[raw] ?? raw;
  if (raw.includes("/")) {
    const [a, b] = raw.split("/");
    return Number(a) / Number(b);
  }
  return Number(raw);
}

const g = (n: number) => String(Math.round(n * 1000) / 1000);

/** "300g" -> [300, "g", null]; "1M" with (packet(s)) -> [1, "packet", "medium packet"];
 * "2" with (bunch(es)) -> [2, "bunch", null]. For packets, S/M/L is the packet size, not litres. */
function amount(text: string, unitWord: string | null): [number | null, string | null, string | null] {
  if (text.includes("+")) { // "1M + 1L": mixed packet sizes, counted as standard (medium) packets
    const parts = text.split("+").map((p) => new RegExp(`^${NUM}\\s*([SML])?$`).exec(p.trim()));
    if (!parts.every(Boolean)) return [null, null, null];
    const factor: Record<string, number> = { S: 0.6, M: 1.0, L: 1.5 };
    const qty = parts.reduce((t, m) => t + number(m![1]) * (factor[m![2] ?? "M"] ?? 1), 0);
    const sizes = parts.map((m) => `${g(number(m![1]))} ${SIZES[m![2] ?? "M"]}`).join(" + ");
    return [qty, unitWord, `${sizes} packets`];
  }
  let m = new RegExp(`^${NUM}\\s*([SML])$`).exec(text.trim());
  if (m && !(unitWord === null || ["ml", "l", "g", "kg"].includes(unitWord))) {
    const qty = number(m[1]);
    return [qty, unitWord, `${SIZES[m[2]]} packet${qty > 1 ? "s" : ""}`];
  }
  m = new RegExp(`^${NUM}\\s*(g|kg|ml|l)?$`, "i").exec(text.trim());
  if (!m) return [null, null, null];
  return [number(m[1]), (m[2] ?? "").toLowerCase() || unitWord, null];
}

function ingredients(page: Page, servings: number): [ParsedLine[], number, number] {
  const header = page.words.find((w) => w.text === "Ingredients");
  const cols = new Map<number, number>();
  for (const w of page.words) {
    if ((!header || w.top > header.top) && /^[1-9]P$/.test(w.text)) cols.set(Number(w.text[0]), centre(w));
  }
  if (!cols.size) return [[], servings, page.width * 0.25];
  const sizes = [...cols.keys()];
  const plan = cols.has(servings) ? servings
    : sizes.sort((a, b) => Math.abs(a - servings) - Math.abs(b - servings) || a - b)[0];
  const right = Math.max(...cols.values()) + 18;
  const headTop = minTop(page.words.filter((w) => /^[1-9]P$/.test(w.text)));
  const ends = page.words.filter((w) => w.x0 < right && (w.text === "Pantry" || w.text === "Nutrition") && w.top > headTop);
  const endTop = ends.length ? minTop(ends) : page.height;
  const firstCentre = Math.min(...cols.values());
  const region = page.words.filter((w) => w.x1 <= right + 8 && headTop + 3 < w.top && w.top < endTop - 1);
  const isQty = (w: Word) => QTY_TOKEN.test(w.text) && centre(w) >= firstCentre - 14;
  const qtyWords = region.filter(isQty);
  const nameLines = linesOf(region.filter((w) => !isQty(w)));

  // A new ingredient starts on any name line that isn't a "(packet(s))"-style continuation.
  const entries: Word[][][] = [];
  for (const line of nameLines) {
    if (entries.length && joinWords(line).startsWith("(")) entries[entries.length - 1].push(line);
    else entries.push([line]);
  }

  const out: ParsedLine[] = [];
  entries.forEach((entry, i) => {
    const top = entry[0][0].top - 4;
    const bottom = i + 1 < entries.length ? entries[i + 1][0][0].top - 4 : endTop;
    const cell = qtyWords.filter((w) => top <= w.top && w.top < bottom && Math.abs(centre(w) - cols.get(plan)!) <= 9)
      .sort((a, b) => a.top - b.top || a.x0 - b.x0);
    const amountText = cell.map((w) => w.text).join(" ");
    let text = clean(entry.map(joinWords).join(" "));
    const refer = /refer to method/i.test(text);
    text = text.replace(/refer to method/gi, "").trim();
    let unitWord: string | null = null;
    const paren = /\(([^()]*(?:\([^()]*\))?)\)\s*$/.exec(text);
    if (paren) {
      const key = paren[1].replace(/\(.*?\)/g, "").trim().toLowerCase();
      unitWord = UNIT_WORDS[key] ?? null;
      text = text.slice(0, paren.index).trim();
    }
    const pantry = text.endsWith("*");
    const name = text.replace(/\*+$/, "").trim();
    if (!name) return;
    const [qty, unit, note] = refer || !amountText ? [null, null, null] : amount(amountText, unitWord);
    const raw = [amountText, paren ? `(${paren[1]})` : "", name].filter(Boolean).join(" ");
    const line: ParsedLine = {
      quantity: qty, unit, name, raw_text: raw, optional: false,
      note: note || (pantry && qty === null ? "pantry item, as needed" : null),
    };
    // Packets -> grams/spoons you can buy and measure at home (estimated portion sizes).
    const mixed = note && note.includes("+") ? note : null;
    out.push(convertKitLine(line, mixed ? null : sizeOf(note ?? ""), mixed));
  });
  return [out, plan, right];
}

// --- nutrition -----------------------------------------------------------------------------

function nutrition(page: Page, right: number): Record<string, string> | null {
  const text = linesOf(page.words.filter((w) => w.x1 <= right + 8)).map(joinWords).join(" ");
  const found: Record<string, string> = {};
  for (const [key, pattern, unit] of [
    ["calories", /Energy \(kJ\)\s*\d+(?:\.\d+)?\s*kJ\s*\((\d+(?:\.\d+)?)\s*Cal\)/i, "kcal"],
    ["protein", /Protein \(g\)\s*(\d+(?:\.\d+)?)\s*g/i, "g"],
    ["fat", /Fat, total \(g\)\s*(\d+(?:\.\d+)?)\s*g/i, "g"],
    ["carbohydrates", /Carbohydrate \(g\)\s*(\d+(?:\.\d+)?)\s*g/i, "g"],
    ["fibre", /Dietary Fibre \(g\)\s*(\d+(?:\.\d+)?)\s*g/i, "g"],
    ["sodium", /Sodium \(mg\)\s*(\d+(?:\.\d+)?)\s*mg/i, "mg"],
  ] as [string, RegExp, string][]) {
    const m = pattern.exec(text);
    if (m) found[key] = `${g(Number(m[1]))} ${unit}`; // the first value is per serving; the second is per 100 g
  }
  return Object.keys(found).length ? found : null;
}

// --- steps -----------------------------------------------------------------------------------

const DROP_LABELS = ["little cooks:", "elevate me:", "custom options"]; // kids' jobs and optional extras
const KEEP_LABELS = ["tip:"];

function steps(page: Page, left: number): string[] {
  const numbers = page.words.filter((w) => w.x0 > left && /^[1-9]$/.test(w.text) && w.size >= 10);
  if (!numbers.length) return [];
  const firstNumberTop = minTop(numbers);
  // The footer: "CUSTOM OPTIONS", "SCAN CODE", and all-caps protein swaps like "BEEF RUMP:".
  const footerWords = page.words.filter((w) => w.x0 > left && w.top > firstNumberTop + 20 && (
    ["CUSTOM", "SCAN", ":"].includes(w.text) ||
    (w.text.endsWith(":") && isUpper(w.text.slice(0, -1)) && w.text.length > 3 && w.text !== "TIP:")));
  const footer = footerWords.length ? minTop(footerWords) : page.height;
  const rows = linesOf(numbers, 4);
  const found: [number, string][] = [];
  rows.forEach((row, r) => {
    const rowTop = minTop(row);
    const rowBottom = r + 1 < rows.length ? minTop(rows[r + 1]) - 1 : footer - 1;
    row.forEach((num, c) => {
      const xFrom = num.x0 - 10;
      const xTo = c + 1 < row.length ? row[c + 1].x0 - 10 : page.width;
      const words = page.words.filter((w) => xFrom <= w.x0 && w.x0 < xTo && rowTop <= w.top && w.top < rowBottom && w !== num);
      const titleLines: Word[][] = [], bodyLines: Word[][] = [];
      for (const line of linesOf(words)) {
        (line[0].fontname === num.fontname && Math.abs(line[0].size - num.size) < 0.5 ? titleLines : bodyLines).push(line);
      }
      const segments: string[] = [];
      for (const line of bodyLines) {
        const text = clean(joinWords(line));
        const lower = text.toLowerCase();
        const starts = text.startsWith("•") || [...DROP_LABELS, ...KEEP_LABELS].some((l) => lower.startsWith(l));
        if (starts || !segments.length) segments.push(text);
        else segments[segments.length - 1] += " " + text;
      }
      const kept = segments.filter((s) => !DROP_LABELS.some((l) => s.toLowerCase().startsWith(l)))
        .map((s) => s.replace(/^[•\s]+/, "").trim());
      const body = kept.filter(Boolean).map((s) => (/[.!?]$/.test(s) ? s : s + ".")).join(" ");
      const head = clean(titleLines.map(joinWords).join(" "));
      if (head || body) found.push([Number(num.text), head && body ? `${head}. ${body}` : head || body]);
    });
  });
  return found.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).map(([, text]) => text);
}

// --- the whole card --------------------------------------------------------------------------

export function parseRecipeCard(pages: Page[], servings = 2): RecipeDraft {
  const recipePage = pages.find((p) => p.words.some((w) => w.text === "Ingredients")) ?? pages[pages.length - 1];
  const cover = pages.find((p) => p !== recipePage) ?? recipePage;
  const { prep, cook, description, tags } = coverDetails(cover);
  const [lines, plan, right] = ingredients(recipePage, servings);
  return {
    title: title(cover) || "Recipe card", description: description.slice(0, 600), servings: plan,
    prep_min: prep, cook_min: cook, ingredients: lines, method: steps(recipePage, right),
    photo_path: null, source: "file", source_url: null, source_ref: null, tags, rating: null, is_favourite: false,
    nutrition: nutrition(recipePage, right),
  };
}
