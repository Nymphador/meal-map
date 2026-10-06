// Amounts in an ingredient's base unit (g, ml, each) as people say them.

const trim = (s: string) => s.replace(/\.?0+$/, "");

/** 1500 g -> "1.5 kg"; 250 ml -> "250 ml"; 2 each -> "2" */
export function fmtAmount(qty: number | null | undefined, unit: string): string {
  if (qty === null || qty === undefined) return "as needed";
  if (unit === "g" && qty >= 1000) return `${trim((qty / 1000).toFixed(2))} kg`;
  if (unit === "ml" && qty >= 1000) return `${trim((qty / 1000).toFixed(2))} L`;
  if (unit === "each") return trim(qty.toFixed(1));
  return `${Math.round(qty)} ${unit}`;
}

/** Repeatable randomness for tests (mulberry32); Math.random otherwise. */
export function makeRng(seed?: number | null): () => number {
  if (seed === undefined || seed === null) return Math.random;
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
