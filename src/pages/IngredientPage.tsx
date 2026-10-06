import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { CloseIcon } from "../components/Icons";
import PriceEditor from "../components/PriceEditor";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import { shortDate } from "../format";
import type { IngredientDetail } from "../types";

const CATEGORIES = ["produce", "meat", "seafood", "dairy", "bakery", "pantry", "frozen", "other"];
const UNIT_LABEL: Record<string, string> = { g: "g", ml: "ml", each: "items" };
const FIELDS = ["name", "category", "default_unit", "grams_per_each", "density_g_per_ml", "is_staple", "low_threshold",
  "never_buy", "kcal_100g", "protein_100g", "carbs_100g", "fat_100g"] as const;

type Form = Pick<IngredientDetail, (typeof FIELDS)[number]>;

const toForm = (x: IngredientDetail): Form => Object.fromEntries(FIELDS.map((k) => [k, x[k]])) as Form;

export default function IngredientPage() {
  const { id } = useParams();
  const toast = useToast();
  const [d, setD] = useState<IngredientDetail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = (x: IngredientDetail) => {
    setD(x);
    setForm(toForm(x));
  };

  useEffect(() => {
    api<IngredientDetail>(`/api/ingredients/${id}`).then(apply).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!d || !form) return <Spinner />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const num = (v: string) => (v === "" ? null : Number(v));
  const unit = UNIT_LABEL[form.default_unit] ?? form.default_unit;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      apply(await api<IngredientDetail>(`/api/ingredients/${id}`, { method: "PUT", body: form }));
      toast("Saved");
    } catch (err) {
      toast((err as Error).message, { error: true });
    } finally {
      setSaving(false);
    }
  }

  async function removeAlias(alias: string) {
    try {
      apply(await api<IngredientDetail>(`/api/ingredients/${id}/aliases/${encodeURIComponent(alias)}`, { method: "DELETE" }));
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={d.name.charAt(0).toUpperCase() + d.name.slice(1)} back="/ingredients" />

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">What you pay</h2>
        {form.never_buy ? (
          <p className="text-sm text-muted">Marked as never bought, so it isn't costed or put on shopping lists.</p>
        ) : (
          <>
            <PriceEditor key={`${d.price}-${d.price_amount}-${d.price_unit}`} ingredient={d} onSaved={apply} />
            <p className="text-xs text-muted">
              {d.price_text
                ? <>{d.unit_price_text}{d.price_updated && ` · updated ${shortDate(d.price_updated)}`}. </>
                : "No price yet. "}
              The pack you usually buy is best ("$3.50 for 500 g"): the shopping list rounds up to whole packs of it.
            </p>
          </>
        )}
      </section>

      <form onSubmit={save} className="space-y-4">
        <section className="card grid gap-3 p-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Details</h2>
          <label>
            <span className="label">Name</span>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </label>
          <label>
            <span className="label">Category</span>
            <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Usually bought</span>
            <select className="input" value={form.default_unit} onChange={(e) => set("default_unit", e.target.value)}>
              <option value="g">by weight</option>
              <option value="ml">by volume</option>
              <option value="each">by the item</option>
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pb-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_staple} onChange={(e) => set("is_staple", e.target.checked)} /> Staple</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.never_buy} onChange={(e) => set("never_buy", e.target.checked)} /> Never buy</label>
          </div>
          {form.is_staple && (
            <label>
              <span className="label">Running low below ({unit})</span>
              <input className="input" inputMode="decimal" value={form.low_threshold ?? ""} onChange={(e) => set("low_threshold", num(e.target.value))} />
            </label>
          )}
        </section>

        <section className="card grid gap-3 p-4 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <h2 className="font-semibold">Nutrition per 100 g</h2>
            <p className="text-xs text-muted">
              {d.nutrition_source === "builtin" ? "Typical values from the app's table. Change them to match what you buy (it's on the packet)."
                : d.nutrition_source === "user" ? "Your values. The app won't change them."
                : "Not known yet. Add them (from the packet) so recipes using this can be measured."}
            </p>
          </div>
          {([["kcal_100g", "Calories (kcal)"], ["protein_100g", "Protein (g)"], ["carbs_100g", "Carbs (g)"], ["fat_100g", "Fat (g)"]] as const).map(([k, label]) => (
            <label key={k}>
              <span className="label">{label}</span>
              <input className="input" inputMode="decimal" value={form[k] ?? ""} onChange={(e) => set(k, num(e.target.value))} />
            </label>
          ))}
        </section>

        <section className="card grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <h2 className="font-semibold">Converting recipe amounts</h2>
            <p className="text-xs text-muted">So “2 onions” or “1 cup flour” can be priced and measured for nutrition.</p>
          </div>
          <label>
            <span className="label">Grams per item</span>
            <input className="input" inputMode="decimal" value={form.grams_per_each ?? ""} placeholder="e.g. 150 for an onion"
              onChange={(e) => set("grams_per_each", num(e.target.value))} />
          </label>
          <label>
            <span className="label">Grams per ml (density)</span>
            <input className="input" inputMode="decimal" value={form.density_g_per_ml ?? ""} placeholder="e.g. 0.6 for flour, 0.91 for oil"
              onChange={(e) => set("density_g_per_ml", num(e.target.value))} />
          </label>
        </section>

        <button className="btn-primary w-full" disabled={saving}>{saving ? "Saving…" : "Save ingredient"}</button>
      </form>

      {d.recipes.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Used in</h2>
          <div className="flex flex-wrap gap-1.5">
            {d.recipes.map((r) => <Link key={r.id} to={`/recipes/${r.id}`} className="chip py-1 hover:border-brand">{r.title}</Link>)}
          </div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">Other spellings</h2>
        <p className="mb-2 text-xs text-muted">Recipe text with any of these links here automatically.</p>
        <div className="flex flex-wrap gap-1.5">
          {d.aliases.map((a) => (
            <span key={a} className="chip py-1">
              {a}
              <button onClick={() => removeAlias(a)} aria-label={`Remove ${a}`} className="text-muted hover:text-danger">
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          {d.aliases.length === 0 && <span className="text-sm text-muted">None yet.</span>}
        </div>
      </section>
    </div>
  );
}
