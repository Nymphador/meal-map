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

type SpellingSuggestion = { text: string; recipes: number; linked_to: { id: number; name: string } | null };
type SpellingResult = { ingredient: IngredientDetail; linked: number; merged: string | null; undo: unknown };

/** Other wordings recipes use for this ingredient ("fine breadcrumbs", "dried breadcrumbs"). Adding one links every
 * recipe line using it, now and in future recipes; if the app had made it an ingredient of its own, that one is
 * merged in (with Undo). Suggestions are wordings in your recipes that contain this ingredient's name. */
function OtherSpellings({ d, onChange, onRemove }: {
  d: IngredientDetail; onChange: (x: IngredientDetail) => void; onRemove: (alias: string) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<SpellingSuggestion[]>([]);
  const refresh = () => api<SpellingSuggestion[]>(`/api/ingredients/${d.id}/spellings/suggest`).then(setSuggestions).catch(() => setSuggestions([]));
  useEffect(() => { refresh(); }, [d.id, d.aliases.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(spelling: string) {
    if (!spelling.trim()) return;
    setBusy(true);
    try {
      const r = await api<SpellingResult>(`/api/ingredients/${d.id}/spellings`, { body: { text: spelling } });
      onChange(r.ingredient);
      setText("");
      const lines = `${r.linked} recipe line${r.linked === 1 ? "" : "s"}`;
      if (r.merged) {
        toast(`Merged "${r.merged}" into ${d.name}${r.linked ? ` (${lines})` : ""}`, { action: { label: "Undo", run: () => {
          api("/api/ingredients/spellings/undo", { body: r.undo }).then(() => api<IngredientDetail>(`/api/ingredients/${d.id}`)).then(onChange)
            .catch((e) => toast((e as Error).message, { error: true }));
        } } });
      } else {
        toast(r.linked ? `Linked ${lines}` : "Added: recipes with this wording will link here");
      }
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">Other spellings</h2>
        <p className="text-xs text-muted">Recipe wording with any of these links here, in recipes you have and ones you add later.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {d.aliases.map((a) => (
          <span key={a} className="chip py-1">
            {a}
            <button type="button" onClick={() => onRemove(a)} aria-label={`Remove ${a}`} className="text-muted hover:text-danger">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        {d.aliases.length === 0 && <span className="text-sm text-muted">None yet.</span>}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(text); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`e.g. fine ${d.name}`} />
        <button className="btn-secondary shrink-0" disabled={busy || !text.trim()}>Add</button>
      </form>
      {suggestions.length > 0 && (
        <div>
          <p className="label">In your recipes</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {suggestions.map((s) => (
              <li key={s.text} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.text}</p>
                  <p className="text-xs text-muted">
                    {s.recipes} recipe{s.recipes === 1 ? "" : "s"}
                    {s.linked_to ? ` · now its own ingredient, "${s.linked_to.name}" (adding merges it)` : " · not linked to anything"}
                  </p>
                </div>
                <button type="button" className="btn-secondary shrink-0 px-3 py-1.5 text-sm" disabled={busy} onClick={() => add(s.text)}>Add</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

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

      <OtherSpellings d={d} onChange={apply} onRemove={removeAlias} />
    </div>
  );
}
