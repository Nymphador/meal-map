// A recipe's ingredients against store products. The app does the matching itself (cheapest genuine
// match at each store); this page shows the result, its progress, and lets you correct anything.
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { originOf } from "../nav";
import { api } from "../api";
import IngredientResolver from "../components/IngredientResolver";
import ProductMatcher from "../components/ProductMatcher";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import { formatAmount, money, STORE_DOT, STORE_NAMES, STORES, unitPrice } from "../format";
import type { Costing, IngredientDetail, LineCost, PriceStatus, Recipe } from "../types";

const STATUS_LABEL: Record<LineCost["status"], { text: string; cls: string }> = {
  ok: { text: "Ready", cls: "bg-brand-soft text-brand" },
  skip: { text: "Not costed", cls: "bg-bg text-muted" },
  unlinked: { text: "Needs ingredient", cls: "bg-danger/15 text-danger" },
  no_product: { text: "No product yet", cls: "bg-accent/20 text-ink" },
  no_price: { text: "No price", cls: "bg-accent/20 text-ink" },
  partial: { text: "One store", cls: "bg-accent/20 text-ink" },
};

export default function RecipeMatch() {
  const { id } = useParams();
  const location = useLocation();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [costing, setCosting] = useState<Costing | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [r, c, st] = await Promise.all([
        api<Recipe>(`/api/recipes/${id}`), api<Costing>(`/api/recipes/${id}/costing`), api<PriceStatus>("/api/prices/status"),
      ]);
      setRecipe(r);
      setCosting(c);
      setRunning(st.running);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // While the app is searching the stores (it starts by itself after a recipe is saved),
  // refresh every few seconds so matches appear as they're found.
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(load, 3000);
    return () => window.clearInterval(t);
  }, [running, load]);

  async function matchNow() {
    try {
      await api("/api/prices/match", { method: "POST" });
      setRunning(true);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  if (error) return <ErrorBox message={error} />;
  if (!recipe || !costing) return <Spinner />;

  const lines = onlyProblems ? costing.lines.filter((l) => !["ok", "skip"].includes(l.status)) : costing.lines;
  const ready = costing.matched;
  const pct = costing.line_count ? Math.round((ready / costing.line_count) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Store products & prices" back={`/recipes/${id}`} backState={originOf(location)} />
      <p className="-mt-3 mb-4 text-sm text-muted">{recipe.title} · serves {costing.servings}</p>

      <div className="card mb-4 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{ready} of {costing.line_count} ingredients ready</span>
          <span className="text-muted">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          <Total label="Cost per serve" value={costing.per_serve} note={costing.needs_attention === 0 ? "best of both" : "so far"} strong />
          <Total label="All Woolworths" value={costing.totals.woolworths} />
          <Total label="All Coles" value={costing.totals.coles} />
        </div>
        {running ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-brand" />
            Finding the cheapest products at each store… this page updates as they come in.
          </p>
        ) : !costing.complete && (
          <div className="mt-3 space-y-2">
            {costing.lines.some((l) => l.status === "no_product") && (
              <button className="btn-primary w-full" onClick={matchNow}>Find products automatically</button>
            )}
            <p className="text-xs text-muted">
              Totals fill in once every ingredient has a price at both stores. When Coles blocks automatic searches,
              its prices come from the <Link to="/prices/chrome?only=stale" className="font-semibold text-brand">Claude in Chrome check</Link>.
            </p>
          </div>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 rounded-xl border border-line bg-card p-1 text-sm font-semibold">
        {[true, false].map((v) => (
          <button key={String(v)} onClick={() => setOnlyProblems(v)}
            className={`rounded-lg py-2 ${onlyProblems === v ? "bg-brand text-brand-ink" : "text-muted"}`}>
            {v ? `Not ready (${costing.needs_attention})` : `All (${costing.line_count})`}
          </button>
        ))}
      </div>

      {lines.length === 0 && (
        <div className="card p-6 text-center">
          <p className="font-semibold">Every ingredient is matched and priced.</p>
          <p className="mt-1 text-sm text-muted">The cheaper store for each one is shown under “All”.</p>
        </div>
      )}

      <ul className="space-y-2">
        {lines.map((l) => (
          <LineRow key={l.index} line={l} open={open === l.index}
            onToggle={() => setOpen(open === l.index ? null : l.index)} onChanged={load} />
        ))}
      </ul>
    </div>
  );
}

function Total({ label, value, note, strong }: { label: string; value: number | null; note?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-bg px-2 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tabular-nums ${strong ? "text-lg font-bold" : "font-semibold"}`}>{money(value)}</p>
      {note && value !== null && <p className="text-[11px] text-muted">{note}</p>}
    </div>
  );
}

function LineRow({ line, open, onToggle, onChanged }: {
  line: LineCost; open: boolean; onToggle: () => void; onChanged: () => void;
}) {
  const status = STATUS_LABEL[line.status];
  const amount = formatAmount(line.quantity, line.unit);
  return (
    <li className="card overflow-hidden">
      <button className="w-full p-3 text-left" onClick={onToggle} aria-expanded={open}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{amount && <span className="tabular-nums">{amount} </span>}{line.name}</p>
            {line.ingredient_name && line.ingredient_name !== line.name.toLowerCase() && (
              <p className="text-xs text-muted">as {line.ingredient_name}</p>
            )}
          </div>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${status.cls}`}>{status.text}</span>
        </div>

        {Object.keys(line.stores).length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {STORES.map((s) => {
              const c = line.stores[s];
              const winner = line.cheaper === s;
              return (
                <div key={s} className={`rounded-lg border px-2 py-1.5 text-xs ${winner ? "border-brand bg-brand-soft/40" : "border-line"}`}>
                  <p className="flex items-center gap-1 font-semibold text-muted">
                    <span className={`h-2 w-2 rounded-full ${STORE_DOT[s]}`} />{STORE_NAMES[s]}
                    {winner && <span className="ml-auto text-brand">cheaper</span>}
                  </p>
                  {c ? (
                    <>
                      <p className="truncate text-muted" title={c.product_name}>{c.product_name}</p>
                      <p className="tabular-nums">
                        {c.cost !== null ? <span className="font-semibold text-ink">{money(c.cost)}</span> : <span className="text-muted">—</span>}
                        {c.unit_price !== null && <span className="text-muted"> · {unitPrice(c.unit_price, c.unit_measure)}</span>}
                      </p>
                    </>
                  ) : <p className="text-muted">Not matched</p>}
                </div>
              );
            })}
          </div>
        )}
        {line.message && line.status !== "ok" && <p className="mt-1.5 text-xs text-muted">{line.message}</p>}
      </button>

      {open && (
        <div className="border-t border-line bg-bg/50 p-3">
          {line.ingredient_id === null ? (
            <IngredientResolver rawName={line.name} unit={line.unit} onResolved={onChanged} />
          ) : (
            <IngredientFixer ingredientId={line.ingredient_id} lineName={line.name} message={line.message} onChanged={onChanged} />
          )}
        </div>
      )}
    </li>
  );
}

function IngredientFixer({ ingredientId, lineName, message, onChanged }: {
  ingredientId: number; lineName: string; message: string; onChanged: () => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<IngredientDetail | null>(null);

  useEffect(() => {
    api<IngredientDetail>(`/api/ingredients/${ingredientId}`).then(setD).catch((e) => toast(e.message, { error: true }));
  }, [ingredientId, toast]);

  if (!d) return <p className="text-sm text-muted">Loading…</p>;
  const update = (next: IngredientDetail) => { setD(next); onChanged(); };
  const needsConversion = /grams per item|density/.test(message);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span>Ingredient: <b>{d.name}</b></span>
        <Link to={`/ingredients/${d.id}`} className="font-semibold text-brand">Edit ingredient</Link>
      </div>
      <WrongIngredient lineName={lineName} onChanged={onChanged} ingredientId={d.id} />
      {needsConversion && <ConversionFix d={d} onSaved={update} />}
      {d.never_buy ? (
        <p className="text-sm text-muted">Marked as never bought.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {STORES.map((s) => <ProductMatcher key={s} ingredient={d} store={s} onChange={update} compact />)}
        </div>
      )}
    </div>
  );
}

function ConversionFix({ d, onSaved }: { d: IngredientDetail; onSaved: (d: IngredientDetail) => void }) {
  const toast = useToast();
  const [each, setEach] = useState(d.grams_per_each?.toString() ?? "");
  const [density, setDensity] = useState(d.density_g_per_ml?.toString() ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      onSaved(await api<IngredientDetail>(`/api/ingredients/${d.id}`, {
        method: "PUT",
        body: { grams_per_each: each ? Number(each) : null, density_g_per_ml: density ? Number(density) : null },
      }));
      toast("Saved");
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  }

  return (
    <form onSubmit={save} className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">
      <p className="mb-2">To price this, the app needs to know how much it weighs:</p>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label text-xs">Grams per item</span>
          <input className="input py-1.5" inputMode="decimal" value={each} onChange={(e) => setEach(e.target.value)} placeholder="e.g. 150 for an onion" />
        </label>
        <label>
          <span className="label text-xs">Grams per ml</span>
          <input className="input py-1.5" inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} placeholder="e.g. 0.6 for flour" />
        </label>
      </div>
      <button className="btn-primary mt-2 w-full py-1.5 text-sm">Save</button>
    </form>
  );
}

/** When the app linked a recipe line to the wrong ingredient, pick the right one (or create it). */
function WrongIngredient({ lineName, ingredientId, onChanged }: { lineName: string; ingredientId: number; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button className="text-xs font-semibold text-brand" onClick={() => setOpen(true)}>Wrong ingredient?</button>;
  }
  return (
    <div className="rounded-lg border border-line p-3" key={ingredientId}>
      <IngredientResolver rawName={lineName} unit={null} onResolved={() => { setOpen(false); onChanged(); }} />
    </div>
  );
}
