// Turns meal-kit amounts ("1 packet chat potatoes", "1 medium bag baby spinach") into measurements
// you can buy and cook with at home ("400 g chat potatoes").
//
// Meal-kit recipe cards don't print what's in a packet, so these are typical portion sizes for a
// standard (medium) packet; small and large packets scale from it. Every converted line keeps the
// kit wording in its note so it's clear the amount is an estimate.

import type { ParsedLine } from "./parse";
import { nameCandidates } from "./nutrition";
import { BUNCH, CAN, PACKET } from "./tables";

const KIT_UNITS = new Set(["packet", "bunch", "can"]);
export const SIZE_FACTOR: Record<string, number> = { small: 0.6, medium: 1.0, large: 1.5 };

// When the name isn't in the tables, its kind still gives a sensible amount.
const FALLBACKS: [RegExp, [number, string]][] = [
  [/\b(spice|seasoning|blend|rub|masala|stock powder)\b/i, [2, "tsp"]],
  [/\bpaste\b/i, [1, "tbsp"]],
  [/\b(dressing|sauce|mayo|mayonnaise|aioli|pesto|chutney|relish|glaze)\b/i, [50, "g"]],
  [/\b(leaves|leaf|salad|spinach|rocket)\b/i, [60, "g"]],
  [/\b(cheese|feta|parmesan|mozzarella)\b/i, [50, "g"]],
  [/\b(rice|grain)\b/i, [150, "g"]],
  [/\b(pasta|noodles?|spaghetti)\b/i, [180, "g"]],
];

const KIT_WORDS: [string, string][] = [["packet", "packet"], ["bag", "packet"], ["sachet", "packet"], ["tub", "packet"],
  ["bunch", "bunch"], ["tin", "can"], ["can", "can"]];
const KIT_WORDING = /^(?:(small|medium|large)\s+)?(packets?|bags?|sachets?|tubs?|bunch(?:es)?|tins?|cans?)\s+(?:of\s+)?(.+)$/i;

const keyed = (table: Record<string, [number, string]>) =>
  new Map(Object.entries(table).map(([k, v]) => [nameCandidates(k)[0], v]));
const TABLES = { packet: keyed(PACKET), bunch: keyed(BUNCH), can: keyed(CAN) };

function lookup(name: string, table: Map<string, [number, string]>): [number, string] | null {
  for (const c of nameCandidates(name)) {
    const v = table.get(c);
    if (v) return v;
  }
  return null;
}

function roundAmount(amount: number, unit: string): number {
  if (unit === "tsp" || unit === "tbsp") return Math.max(0.25, Math.round(amount * 4) / 4);
  if (unit === "g" || unit === "ml") {
    const step = amount >= 300 ? 10 : 5;
    return Math.max(step, Math.round(amount / step) * step);
  }
  return amount;
}

export function sizeOf(text: string | null | undefined): string | null {
  const m = /\b(small|medium|large)\b/i.exec(text ?? "");
  return m ? m[1].toLowerCase() : null;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** One kit line -> a measured line. Lines that aren't packets, bunches or tins come back unchanged,
 * and so do packets of something the tables can't place (the note asks to check). */
export function convertKitLine<T extends ParsedLine>(input: T, size: string | null = null, wording: string | null = null): T {
  let line = input;
  // Free-text lines ("1 medium packet baby spinach") arrive with the packet word still in the name.
  const m = KIT_WORDING.exec(line.name);
  if (m && (line.unit === null || line.unit === "each") && line.quantity !== null) {
    const word = m[2].toLowerCase();
    const unit = KIT_WORDS.find(([prefix]) => word.startsWith(prefix))![1];
    line = { ...line, unit, name: m[3] };
    size = size || (m[1] ?? "").toLowerCase() || null;
  }
  if (!line.unit || !KIT_UNITS.has(line.unit) || line.quantity === null) return line;
  size = size || sizeOf(line.note) || sizeOf(line.raw_text);
  const name = line.name.replace(/^(small|medium|large)\s+/i, "");
  let per: [number, string] | null;
  if (line.unit === "packet") {
    per = lookup(name, TABLES.packet) ?? FALLBACKS.find(([re]) => re.test(name))?.[1] ?? null;
  } else {
    per = lookup(name, line.unit === "bunch" ? TABLES.bunch : TABLES.can);
  }
  const count = line.quantity;
  const words = ({ packet: ["packet", "packets"], bunch: ["bunch", "bunches"], can: ["tin", "tins"] } as Record<string, string[]>)[line.unit];
  const said = wording || `${fmt(count)} ${size ? size + " " : ""}${words[count > 1 ? 1 : 0]}`;
  if (!per) {
    return line.unit === "packet" ? { ...line, name, note: `${said}; size not known, check the packet` } : line;
  }
  const amount = roundAmount(per[0] * count * (SIZE_FACTOR[size ?? "medium"] ?? 1), per[1]);
  return { ...line, quantity: amount, unit: per[1], name, note: `${said} (amount estimated)` };
}
