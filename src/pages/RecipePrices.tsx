// Every ingredient of one recipe with its price, so a recipe can be priced in one go. Each line also
// shows which ingredient it's linked to, and a wrong link can be changed (the app remembers it).
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { api, qs } from "../api";
import { useLive } from "../live";
import { originOf } from "../nav";
import PriceEditor from "../components/PriceEditor";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import { formatAmount, money } from "../format";
import type { Costing, IngredientDetail, IngredientSuggest, Recipe } from "../types";

type Ing = IngredientDetail;

export default function RecipePrices() {
  const { id } = useParams();
  const location = useLocation();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [costing, setCosting] = useState<Costing | null>(null);
  const [ings, setIngs] = useState<Record<number, Ing>>({});
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api<Recipe>(`/api/recipes/${id}`);
      const c = await api<Costing>(`/api/recipes/${id}/costing`);
      const ids = [...new Set(r.ingredients.map((l) => l.ingredient_id).filter((x): x is number => !!x))];
      const details = await Promise.all(ids.map((i) => api<Ing>(`/api/ingredients/${i}`)));
      setRecipe(r);
      setCosting(c);
      setIngs(Object.fromEntries(details.map((d) => [d.id, d])));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useLive(["ingredients", "recipes"], load);

  if (error) return <ErrorBox message={error} />;
  if (!recipe || !costing) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Prices" back={`/recipes/${recipe.id}`} backState={originOf(location)} />
      <section className="card mb-4 flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{recipe.title}</p>
          <p className="text-sm text-muted">
            {costing.needs_price
              ? `${costing.needs_price} ingredient${costing.needs_price > 1 ? "s" : ""} still to price.`
              : "Every ingredient is priced."}{" "}
            Prices are per ingredient, so each one only needs entering once for all your recipes.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted">Per serve</p>
          <p className="text-xl font-bold">{money(costing.per_serve)}{costing.complete || costing.per_serve === null ? "" : "+"}</p>
          {costing.total !== null && <p className="text-xs text-muted">{money(costing.total)} for {costing.servings}</p>}
        </div>
      </section>

      <ul className="card divide-y divide-line">
        {recipe.ingredients.map((line, i) => {
          const c = costing.lines[i];
          const ing = line.ingredient_id ? ings[line.ingredient_id] : undefined;
          return (
            <li key={i} className="space-y-2 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{formatAmount(line.quantity, line.unit)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{line.name}</p>
                  <LinkRow rawName={line.name} unit={line.unit} ing={ing} />
                </div>
                <span className="shrink-0 text-sm tabular-nums">{c?.cost !== null && c?.cost !== undefined ? money(c.cost) : ""}</span>
              </div>
              {ing && c && c.status !== "skip" && (
                <div className="sm:pl-[4.75rem]">
                  <PriceEditor compact key={`${ing.id}-${ing.price}-${ing.price_amount}-${ing.price_unit}`} ingredient={ing} />
                  {c.status === "problem" && (
                    <p className="mt-1 text-xs text-accent">
                      {c.message}: <Link to={`/ingredients/${ing.id}`} className="underline">open {ing.name}</Link>
                    </p>
                  )}
                </div>
              )}
              {c?.status === "skip" && <p className="text-xs text-muted sm:pl-[4.75rem]">{c.message}: not costed</p>}
            </li>
          );
        })}
        {recipe.ingredients.length === 0 && <li className="px-4 py-3 text-sm text-muted">No ingredients listed.</li>}
      </ul>
    </div>
  );
}

/** "Linked to chicken thigh · change": pick another ingredient (or a new one) for this wording. */
function LinkRow({ rawName, unit, ing }: { rawName: string; unit: string | null; ing: Ing | undefined }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<IngredientSuggest | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      api<IngredientSuggest>(`/api/ingredients/suggest${qs({ text: query || rawName, unit })}`).then(setData).catch(() => {});
    }, query ? 200 : 0);
    return () => window.clearTimeout(t);
  }, [open, query, rawName, unit]);

  async function choose(path: string, body: object, ok: string) {
    try {
      const d = await api<Ing>(path, { body });
      toast(d.linked > 1 ? `${ok} (${d.linked} recipe lines)` : ok);
      setOpen(false);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <div className="text-xs text-muted">
      {ing ? <>Linked to <Link to={`/ingredients/${ing.id}`} className="text-brand">{ing.name}</Link></> : "Not linked"}
      {" · "}
      <button type="button" className="font-semibold text-brand" onClick={() => setOpen(!open)}>{open ? "cancel" : "change"}</button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-bg p-2">
          <input className="input py-1.5 text-sm" value={query} placeholder={`Search, e.g. "${rawName}"`} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex flex-wrap gap-1.5">
            {data?.matches.filter((m) => m.id !== ing?.id).map((m) => (
              <button key={m.id} type="button" className="chip py-1 text-xs"
                onClick={() => choose(`/api/ingredients/${m.id}/link`, { raw_name: rawName }, `Linked to ${m.name}`)}>{m.name}</button>
            ))}
            {data && (
              <button type="button" className="chip py-1 text-xs"
                onClick={() => choose("/api/ingredients", { name: query || data.proposed_name, category: data.proposed_category,
                  default_unit: data.proposed_unit, raw_name: rawName }, "New ingredient added")}>
                + New: {query || data.proposed_name}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
