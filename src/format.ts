import type { IngredientLine } from "./types";

export const UNITS = [
  "", "g", "kg", "ml", "l", "tsp", "tbsp", "cup", "each", "clove", "can", "jar", "bunch", "pinch",
  "dash", "handful", "slice", "sprig", "stalk", "packet", "sheet", "head", "piece",
];

// Units where "1/2" reads better than "0.5".
const FRACTION_UNITS = new Set(["tsp", "tbsp", "cup", "each", "clove", "can", "jar", "bunch", "pinch",
  "handful", "slice", "sprig", "stalk", "packet", "sheet", "head", "piece", ""]);

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"],
];

const PLURALS: Record<string, string> = {
  clove: "cloves", can: "cans", jar: "jars", bunch: "bunches", pinch: "pinches", dash: "dashes",
  handful: "handfuls", slice: "slices", sprig: "sprigs", stalk: "stalks", packet: "packets",
  sheet: "sheets", head: "heads", piece: "pieces", cup: "cups",
};

function fractionText(q: number): string {
  const whole = Math.floor(q);
  const rest = q - whole;
  if (rest < 0.04) return String(whole);
  if (rest > 0.96) return String(whole + 1);
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(rest - value) < 0.04) return whole ? `${whole}${glyph}` : glyph;
  }
  return trimNumber(q, 1);
}

function trimNumber(q: number, places: number): string {
  return String(Number(q.toFixed(places)));
}

/** Quantity + unit for display, e.g. "1½ cups", "750 g", "1.2 kg", "2". */
export function formatAmount(quantity: number | null, unit: string | null): string {
  if (quantity === null || quantity === undefined) return unit && unit !== "each" ? unit : "";
  let q = quantity;
  let u = unit ?? "";
  if (u === "g" && q >= 1000) [q, u] = [q / 1000, "kg"];
  if (u === "ml" && q >= 1000) [q, u] = [q / 1000, "l"];

  let num: string;
  if (FRACTION_UNITS.has(u)) num = fractionText(q);
  else if (u === "g" || u === "ml") num = q >= 20 ? String(Math.round(q / 5) * 5) : trimNumber(q, 1);
  else num = trimNumber(q, 2);

  if (u === "each" || u === "") return num;
  const label = q > 1 && PLURALS[u] ? PLURALS[u] : u === "l" ? "L" : u;
  return `${num} ${label}`;
}

export function scaleLine(line: IngredientLine, factor: number): IngredientLine {
  return line.quantity === null ? line : { ...line, quantity: line.quantity * factor };
}

export function formatMinutes(min: number | null | undefined): string {
  if (!min) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}


export function money(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `$${v.toFixed(2)}`;
}

export function unitPrice(value: number | null | undefined, measure: string | null | undefined): string {
  if (value === null || value === undefined || !measure) return "";
  return `$${value.toFixed(2)}/${measure === "l" ? "L" : measure}`;
}

/** "5 Oct, 10:02" in the phone's time, or "5 Oct" when the time doesn't matter. */
export function shortDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  // The API sends UTC; a bare timestamp without an offset is UTC too.
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  return d.toLocaleString("en-AU", {
    day: "numeric", month: "short",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

// Plan dates are plain YYYY-MM-DD days (no time zone), so they're parsed as local dates.
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** "Mon", "6 Oct", "Monday" */
export function dayParts(iso: string) {
  const d = parseDay(iso);
  return {
    short: d.toLocaleDateString("en-AU", { weekday: "short" }),
    long: d.toLocaleDateString("en-AU", { weekday: "long" }),
    date: d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
  };
}

/** "6 – 12 Oct" or "29 Sep – 5 Oct" */
export function weekRange(weekStart: string): string {
  const a = parseDay(weekStart);
  const b = parseDay(addDays(weekStart, 6));
  const month = (d: Date) => d.toLocaleDateString("en-AU", { month: "short" });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
}
