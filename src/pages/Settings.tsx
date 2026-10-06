import { useEffect, useState } from "react";
import { api, isNative } from "../api";
import { LimitsEditor } from "../components/Nutrition";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import { getTheme, setTheme, type Theme } from "../theme";
import type { Settings, Tag } from "../types";


function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

const num = (v: string) => (v === "" ? null : Number(v));

/** Light, dark or follow the device. Per device, so it applies straight away (no Save). */
function AppearanceSection() {
  const [theme, pick] = useState<Theme>(getTheme());
  const options: [Theme, string][] = [["system", "Follow this device"], ["light", "Light"], ["dark", "Dark"]];
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Appearance</h2>
      <p className="mt-0.5 text-xs text-muted">Just this {isNative() ? "phone" : "device"}.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {options.map(([value, label]) => (
          <button key={value} type="button" className={`chip ${theme === value ? "chip-on" : ""}`} aria-pressed={theme === value}
            onClick={() => { setTheme(value); pick(value); }}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [dietTags, setDietTags] = useState<Tag[]>([]);
  const [dislikes, setDislikes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Settings>("/api/settings").then((x) => { setS(x); setDislikes(x.dislikes.join(", ")); }).catch((e) => setError(e.message));
    api<Tag[]>("/api/tags").then((t) => setDietTags(t.filter((x) => x.kind === "diet"))).catch(() => {});
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!s) return <Spinner />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...s!, dislikes: dislikes.split(",").map((d) => d.trim()).filter(Boolean) };
      setS(await api<Settings>("/api/settings", { method: "PUT", body }));
      toast("Settings saved");
    } catch (err) {
      toast((err as Error).message, { error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    // Wide screens: what the Save button saves on the left, things that apply straight away on the right.
    <form onSubmit={save} className="mx-auto max-w-2xl xl:grid xl:max-w-6xl xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:items-start xl:gap-6">
      <div className="xl:col-span-2"><PageHeader title="Settings" /></div>
      <div className="space-y-4">

      <Section title="Meals" note="Dinners only for now; lunches can be added later.">
        <Field label="Servings I cook for">
          <input className="input" type="number" min={1} value={s.default_servings}
            onChange={(e) => set("default_servings", Math.max(1, Number(e.target.value) || 1))} />
        </Field>
        <Field label="Max cook time (min)">
          <input className="input" type="number" min={0} value={s.max_cook_min ?? ""} placeholder="No limit"
            onChange={(e) => set("max_cook_min", num(e.target.value))} />
        </Field>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={s.scale_imports} onChange={(e) => set("scale_imports", e.target.checked)} />
          <span>
            Convert imported recipes to {s.default_servings} serving{s.default_servings === 1 ? "" : "s"}
            <span className="block text-xs text-muted">Recipes also open scaled to this, planned meals use it, and recipe cards with several plan sizes use the nearest.</span>
          </span>
        </label>
        <Field label="Dietary rules (every planned meal must have these tags)" wide>
          <div className="flex flex-wrap gap-1.5">
            {dietTags.map((t) => {
              const on = s.dietary.includes(t.name);
              return (
                <button type="button" key={t.id} className={`chip ${on ? "chip-on" : ""}`}
                  onClick={() => set("dietary", on ? s.dietary.filter((d) => d !== t.name) : [...s.dietary, t.name])}>
                  {t.name}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Dislikes (comma separated)" wide>
          <input className="input" value={dislikes} onChange={(e) => setDislikes(e.target.value)} placeholder="e.g. olives, coriander" />
        </Field>
      </Section>

      <Section title="Planner" note="Used when the week is generated: favourites and new recipes per week, and how long before a meal can repeat.">
        <Field label="Favourites per week">
          <input className="input" type="number" min={0} max={7} value={s.mix_favourites}
            onChange={(e) => set("mix_favourites", Number(e.target.value))} />
        </Field>
        <Field label="New recipes per week">
          <input className="input" type="number" min={0} max={7} value={s.mix_new}
            onChange={(e) => set("mix_new", Number(e.target.value))} />
        </Field>
        <Field label="Don't repeat a meal within (days)">
          <input className="input" type="number" min={0} value={s.no_repeat_days}
            onChange={(e) => set("no_repeat_days", Number(e.target.value))} />
        </Field>
        <Field label="Weekly budget ($)">
          <input className="input" type="number" min={0} step="1" value={s.weekly_budget ?? ""} placeholder="None"
            onChange={(e) => set("weekly_budget", num(e.target.value))} />
        </Field>
      </Section>

      <Section title="Nutrition per serve"
        note="The planner only picks meals inside these limits (and whose nutrition is known). You can also set them from the Nutrition filter on Recipes.">
        <div className="sm:col-span-2">
          <LimitsEditor value={s.nutrition_limits ?? {}} onChange={(v) => set("nutrition_limits", v)} />
        </div>
      </Section>

      <button className="btn-primary w-full xl:sticky xl:bottom-6 xl:shadow-lg" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
      </div>

      <div className="mt-4 space-y-4 xl:mt-0">
      <AppearanceSection />

      <section className="card p-4 text-sm">
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-0.5 text-xs text-muted">
          Everything (recipes, prices, plans) is stored on this {isNative() ? "phone" : "device"} only; nothing is uploaded.
          {isNative() && " Android's automatic backup copies it to your Google account."}
        </p>
      </section>
      </div>
    </form>
  );
}
