// One form for three jobs: a new recipe, editing one, and reviewing an import before saving.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { originOf } from "../nav";
import { api } from "../api";
import { CameraIcon, ChevronDownIcon, ChevronUpIcon, CloseIcon, PlusIcon } from "../components/Icons";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, RecipePhoto, Spinner } from "../components/ui";
import { hostOf, UNITS } from "../format";
import type { IngredientLine, Recipe, RecipeDraft, Settings, Tag, TagIn } from "../types";

type Row = { key: number; qty: string; unit: string; name: string; note: string; raw_text: string; optional: boolean };

// Editable text for an amount: 1.5 -> "1 1/2", 0.333 -> "1/3", 2.25 -> "2 1/4".
function qtyText(q: number | null): string {
  if (q === null) return "";
  const whole = Math.floor(q);
  const rest = q - whole;
  for (const [v, s] of [[1 / 8, "1/8"], [1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]] as const) {
    if (Math.abs(rest - v) < 0.01) return whole ? `${whole} ${s}` : s;
  }
  return String(Number(q.toFixed(3)));
}

let rowKey = 0;
const toRow = (l: IngredientLine): Row => ({
  key: ++rowKey, qty: qtyText(l.quantity),
  unit: l.unit ?? "", name: l.name, note: l.note ?? "", raw_text: l.raw_text, optional: l.optional,
});
const emptyRow = (): Row => ({ key: ++rowKey, qty: "", unit: "", name: "", note: "", raw_text: "", optional: false });

/** "1 1/2" | "1/2" | "0.5" | "1,5" -> number. Returns NaN for anything else. */
function parseQty(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return /^\d*\.?\d+$/.test(t) ? Number(t) : NaN;
}

/** Scaled amounts rounded the way you'd measure them: 333 g -> 335 g, 19.3 ml -> 19 ml, 2/3 cup stays 2/3. */
function niceQty(q: number, unit: string | null): number {
  if (unit === "g" || unit === "ml") return q >= 20 ? Math.round(q / 5) * 5 : q >= 3 ? Math.round(q) : Math.round(q * 10) / 10;
  return Math.round(q * 1000) / 1000;
}

const KIND_LABELS: Record<string, string> = { cuisine: "Cuisine", protein: "Protein", diet: "Diet", other: "Other", custom: "My tags" };

function blankDraft(servings: number): RecipeDraft {
  return {
    title: "", description: "", servings, prep_min: null, cook_min: null, method: [], ingredients: [],
    photo_path: null, source: "own", source_url: null, source_ref: null, tags: [], rating: null,
    is_favourite: false, nutrition: null,
  };
}

function recipeToDraft(r: Recipe): RecipeDraft {
  return {
    title: r.title, description: r.description, servings: r.servings, prep_min: r.prep_min, cook_min: r.cook_min,
    method: r.method, ingredients: r.ingredients, photo_path: r.photo_path, source: r.source,
    source_url: r.source_url, source_ref: r.source_ref, tags: r.tags.map((t) => ({ name: t.name, kind: t.kind })),
    rating: r.rating, is_favourite: r.is_favourite, nutrition: r.nutrition,
  };
}

export default function RecipeEditor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const incoming = (location.state as { draft?: RecipeDraft; origin?: string } | null) ?? null;
  const reviewing = !id && !!incoming?.draft;

  const [draft, setDraft] = useState<RecipeDraft | null>(incoming?.draft ?? null);
  const [rows, setRows] = useState<Row[]>(() => (incoming?.draft?.ingredients ?? []).map(toRow));
  const [methodText, setMethodText] = useState((incoming?.draft?.method ?? []).join("\n\n"));
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Set when an import was converted to the user's servings, so it can be put back.
  const [scaledFrom, setScaledFrom] = useState<{ servings: number; rows: Row[] } | null>(null);

  useEffect(() => {
    api<Tag[]>("/api/tags").then(setAllTags).catch(() => {});
    if (incoming?.draft) {
      api<Settings>("/api/settings").then((s) => {
        const original = incoming.draft!;
        if (!s.scale_imports || !original.servings || original.servings === s.default_servings) return;
        const factor = s.default_servings / original.servings;
        setScaledFrom({ servings: original.servings, rows: original.ingredients.map(toRow) });
        setRows(original.ingredients.map((l) => toRow(l.quantity === null ? l : { ...l, quantity: niceQty(l.quantity * factor, l.unit) })));
        setDraft((d) => (d ? { ...d, servings: s.default_servings } : d));
      }).catch(() => {});
    }
    if (id) {
      api<Recipe>(`/api/recipes/${id}`)
        .then((r) => {
          const d = recipeToDraft(r);
          setDraft(d);
          setRows(d.ingredients.map(toRow));
          setMethodText(d.method.join("\n\n"));
        })
        .catch((e) => setError(e.message));
    } else if (!incoming?.draft) {
      api<Settings>("/api/settings")
        .then((s) => setDraft(blankDraft(s.default_servings)))
        .catch(() => setDraft(blankDraft(2)));
      setRows([emptyRow(), emptyRow(), emptyRow()]);
    }
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!draft) return <Spinner />;

  const set = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) => setDraft({ ...draft, [key]: value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft!.title.trim()) return toast("Give the recipe a title", { error: true });
    const bad = rows.find((r) => r.name.trim() && Number.isNaN(parseQty(r.qty)));
    if (bad) return toast(`Check the amount for “${bad.name}” (use 1.5 or 1 1/2)`, { error: true });

    const body: RecipeDraft = {
      ...draft!,
      ingredients: rows.filter((r) => r.name.trim()).map((r) => ({
        quantity: parseQty(r.qty), unit: r.unit || (r.qty.trim() ? "each" : null), name: r.name.trim(),
        note: r.note.trim() || null, raw_text: r.raw_text || [r.qty, r.unit, r.name].filter(Boolean).join(" "),
        optional: r.optional,
      })),
      method: methodText.split(/\n+/).map((s) => s.trim()).filter(Boolean),
    };
    setSaving(true);
    try {
      const saved = id
        ? await api<Recipe>(`/api/recipes/${id}`, { method: "PUT", body })
        : await api<Recipe>("/api/recipes", { body });
      toast(id ? "Recipe updated" : "Saved to your library");
      navigate(`/recipes/${saved.id}`, { replace: true, state: originOf(location) });
    } catch (err) {
      toast((err as Error).message, { error: true });
    } finally {
      setSaving(false);
    }
  }

  const title = id ? "Edit recipe" : reviewing ? "Review & save" : "New recipe";
  const site = hostOf(draft.source_url);

  return (
    <form onSubmit={save} className="mx-auto max-w-3xl">
      <PageHeader title={title} back={id ? `/recipes/${id}` : originOf(location)?.from ?? "/recipes"}
        backState={id ? originOf(location) : undefined} />

      {reviewing && (
        <div className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-ink">
          {incoming?.origin === "file" ? "Read from your PDF" : incoming?.origin === "text" ? "Read from the text you pasted" : `Imported${site ? ` from ${site}` : ""}`}.
          {" "}Check the ingredients look right (amounts, units, names), then save.
          {scaledFrom && (
            <span className="mt-1 block">
              Converted from {scaledFrom.servings} servings to {draft.servings}, as set in Settings.{" "}
              <button type="button" className="font-semibold text-brand underline" onClick={() => {
                setRows(scaledFrom.rows);
                set("servings", scaledFrom.servings);
                setScaledFrom(null);
              }}>Keep the original {scaledFrom.servings} servings</button>
            </span>
          )}
        </div>
      )}

      <div className="space-y-5">
        <PhotoField value={draft.photo_path} title={draft.title || "New"} onChange={(p) => set("photo_path", p)} />

        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input text-lg font-semibold" value={draft.title} required
            onChange={(e) => set("title", e.target.value)} placeholder="e.g. Nonna's lasagne" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Serves" value={draft.servings} min={1} onChange={(v) => set("servings", v ?? 1)} />
          <NumberField label="Prep (min)" value={draft.prep_min} onChange={(v) => set("prep_min", v)} />
          <NumberField label="Cook (min)" value={draft.cook_min} onChange={(v) => set("cook_min", v)} />
        </div>

        <div>
          <label className="label" htmlFor="desc">Description <span className="font-normal">(optional)</span></label>
          <textarea id="desc" className="input min-h-[4.5rem]" value={draft.description}
            onChange={(e) => set("description", e.target.value)} />
        </div>

        <IngredientsField rows={rows} setRows={setRows} />

        <div>
          <label className="label" htmlFor="method">Method <span className="font-normal">· one step per line</span></label>
          <textarea id="method" className="input min-h-[12rem] leading-relaxed" value={methodText}
            onChange={(e) => setMethodText(e.target.value)}
            placeholder={"Heat the oil in a large pan…\n\nAdd the onion and cook until soft…"} />
        </div>

        <TagsField all={allTags} value={draft.tags} onChange={(t) => set("tags", t)} />
      </div>

      <div className="bottom-above-nav sticky z-20 -mx-4 mt-6 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-sm md:bottom-[var(--ad-h,0px)] md:mx-0 md:rounded-xl md:border">
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn-primary flex-1" disabled={saving}>
            {saving ? "Saving…" : id ? "Save changes" : reviewing ? "Save to library" : "Save recipe"}
          </button>
        </div>
      </div>
    </form>
  );
}

function NumberField({ label, value, onChange, min = 0 }: {
  label: string; value: number | null; onChange: (v: number | null) => void; min?: number;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type="number" inputMode="numeric" min={min} value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.max(min, Math.round(Number(e.target.value))))} />
    </div>
  );
}

function PhotoField({ value, title, onChange }: { value: string | null; title: string; onChange: (p: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const res = await api<{ path: string }>("/api/media", { form });
      onChange(res.path);
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line">
      <RecipePhoto src={value} title={title} className="aspect-[16/9] w-full" />
      <div className="absolute bottom-2 right-2 flex gap-2">
        {value && (
          <button type="button" className="rounded-full bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-xs"
            onClick={() => onChange(null)}>Remove</button>
        )}
        <button type="button" onClick={() => input.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-xs">
          <CameraIcon className="h-4 w-4" /> {uploading ? "Uploading…" : value ? "Change photo" : "Add photo"}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
    </div>
  );
}

function IngredientsField({ rows, setRows }: { rows: Row[]; setRows: (r: Row[]) => void }) {
  const toast = useToast();
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const update = (key: number, changes: Partial<Row>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...changes, raw_text: "" } : r)));
  const move = (i: number, by: number) => {
    const next = [...rows];
    const [r] = next.splice(i, 1);
    next.splice(i + by, 0, r);
    setRows(next);
  };

  async function addPasted() {
    const lines = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    try {
      const parsed = await api<IngredientLine[]>("/api/recipes/parse-ingredients", { body: { lines } });
      setRows([...rows.filter((r) => r.name.trim()), ...parsed.map(toRow)]);
      setPasteText("");
      setPasting(false);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label mb-0">Ingredients</span>
        <button type="button" className="text-sm font-semibold text-brand" onClick={() => setPasting(!pasting)}>
          {pasting ? "Cancel paste" : "Paste a list"}
        </button>
      </div>

      {pasting && (
        <div className="card mb-3 space-y-2 p-3">
          <textarea className="input min-h-[8rem] text-sm" value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder={"One ingredient per line, e.g.\n500 g chicken thigh fillets, diced\n2 tbsp soy sauce\n1 brown onion, chopped"} autoFocus />
          <button type="button" className="btn-primary w-full" onClick={addPasted}>Add these ingredients</button>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="card p-2">
            <div className="flex gap-2">
              <input className="input w-16 shrink-0 px-2 text-center" placeholder="Qty" value={r.qty} inputMode="decimal"
                aria-label="Quantity" onChange={(e) => update(r.key, { qty: e.target.value })} />
              <select className="input w-[5.5rem] shrink-0 px-2" value={UNITS.includes(r.unit) ? r.unit : ""} aria-label="Unit"
                onChange={(e) => update(r.key, { unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u || "unit"}</option>)}
              </select>
              <input className="input min-w-0 flex-1" placeholder="Ingredient" value={r.name} aria-label="Ingredient name"
                onChange={(e) => update(r.key, { name: e.target.value })} />
              <button type="button" className="shrink-0 rounded-lg px-1.5 text-muted hover:text-danger" aria-label="Remove ingredient"
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input className="input flex-1 py-1.5 text-sm" placeholder="Note, e.g. finely chopped" value={r.note}
                aria-label="Note" onChange={(e) => update(r.key, { note: e.target.value })} />
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
                <input type="checkbox" checked={r.optional} onChange={(e) => update(r.key, { optional: e.target.checked })} />
                Optional
              </label>
              <button type="button" className="text-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                <ChevronUpIcon className="h-5 w-5" />
              </button>
              <button type="button" className="text-muted disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                <ChevronDownIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-2 w-full" onClick={() => setRows([...rows, emptyRow()])}>
        <PlusIcon className="h-5 w-5" /> Add ingredient
      </button>
    </div>
  );
}

function TagsField({ all, value, onChange }: { all: Tag[]; value: TagIn[]; onChange: (t: TagIn[]) => void }) {
  const [newTag, setNewTag] = useState("");
  const selected = new Set(value.map((t) => t.name.toLowerCase()));

  // Existing tags grouped by kind, plus any not-yet-created ones an import brought in.
  const groups = useMemo(() => {
    const byKind: Record<string, TagIn[]> = {};
    const known = new Set(all.map((t) => t.name.toLowerCase()));
    for (const t of [...all, ...value.filter((v) => !known.has(v.name.toLowerCase()))]) {
      (byKind[t.kind] ??= []).push({ name: t.name, kind: t.kind });
    }
    return Object.keys(KIND_LABELS).filter((k) => byKind[k]).map((k) => [k, byKind[k]] as const);
  }, [all, value]);

  const toggle = (t: TagIn) =>
    onChange(selected.has(t.name.toLowerCase()) ? value.filter((v) => v.name.toLowerCase() !== t.name.toLowerCase()) : [...value, t]);

  function add() {
    const name = newTag.trim();
    if (name && !selected.has(name.toLowerCase())) onChange([...value, { name, kind: "custom" }]);
    setNewTag("");
  }

  return (
    <div>
      <span className="label">Tags</span>
      <div className="card space-y-3 p-3">
        {groups.map(([kind, tags]) => (
          <div key={kind}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{KIND_LABELS[kind]}</p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button type="button" key={t.name} onClick={() => toggle(t)}
                  className={`chip py-1 ${selected.has(t.name.toLowerCase()) ? "chip-on" : ""}`}>{t.name}</button>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <input className="input py-2 text-sm" placeholder="New tag, e.g. Date night" value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <button type="button" className="btn-secondary py-2" onClick={add}>Add</button>
        </div>
      </div>
    </div>
  );
}
