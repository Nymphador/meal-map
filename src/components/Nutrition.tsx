import type { Macro, Macros, NutritionLimits } from "../types";

export const MACROS: { key: Macro; label: string; unit: string }[] = [
  { key: "kcal", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
];

export const LIMIT_KEYS = MACROS.flatMap((m) => [`${m.key}_min`, `${m.key}_max`] as const);

/** Drops empty values so {} means "no limits". */
export function cleanLimits(limits: NutritionLimits): NutritionLimits {
  return Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v)));
}

/** "≤ 600 kcal · ≥ 30 g protein" */
export function describeLimits(limits: NutritionLimits): string {
  return MACROS.flatMap(({ key, unit }) => {
    const lo = limits[`${key}_min`], hi = limits[`${key}_max`];
    const u = key === "kcal" ? "kcal" : `${unit} ${key}`;
    if (lo != null && hi != null) return [`${lo}–${hi} ${u}`];
    if (hi != null) return [`≤ ${hi} ${u}`];
    if (lo != null) return [`≥ ${lo} ${u}`];
    return [];
  }).join(" · ");
}

/** Min/max inputs per macro, per serving. */
export function LimitsEditor({ value, onChange }: { value: NutritionLimits; onChange: (v: NutritionLimits) => void }) {
  const set = (k: keyof NutritionLimits, raw: string) => onChange(cleanLimits({ ...value, [k]: raw === "" ? null : Number(raw) }));
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-x-2 gap-y-1.5 text-sm">
      <span />
      <span className="text-xs font-medium text-muted">Min</span>
      <span className="text-xs font-medium text-muted">Max</span>
      {MACROS.map(({ key, label, unit }) => (
        <div key={key} className="contents">
          <span className="pr-2 font-medium">{label} <span className="text-xs text-muted">({unit})</span></span>
          {(["min", "max"] as const).map((side) => (
            <input key={side} className="input py-1.5" type="number" inputMode="decimal" min={0} placeholder="Any"
              value={value[`${key}_${side}`] ?? ""} onChange={(e) => set(`${key}_${side}`, e.target.value)} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** "520 kcal · 35 g protein", or nothing when it isn't known. */
export function macroLine(m: Macros | null | undefined, full = false): string {
  if (!m || !m.complete || m.kcal === null) return "";
  const parts = [`${m.kcal} kcal`, `${m.protein ?? "?"} g protein`];
  if (full) parts.push(`${m.carbs ?? "?"} g carbs`, `${m.fat ?? "?"} g fat`);
  return parts.join(" · ");
}
