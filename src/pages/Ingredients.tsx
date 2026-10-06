import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, qs } from "../api";
import { useLive } from "../live";
import { SearchIcon } from "../components/Icons";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import type { IngredientSummary } from "../types";

const FILTERS = [["used", "In my recipes"], ["unpriced", "Needs a price"], ["all", "All"]] as const;

export default function Ingredients() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "used";
  const [q, setQ] = useState("");
  const [items, setItems] = useState<IngredientSummary[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api<IngredientSummary[]>(`/api/ingredients${qs({ q, status })}`).then(setItems).catch((e) => setError(e.message));
  }, [q, status]);
  useEffect(() => {
    const t = window.setTimeout(load, q ? 150 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);
  useLive(["ingredients"], load);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Prices" />
      <p className="-mt-3 mb-4 text-sm text-muted">
        Ingredients are added automatically from your recipes. Enter what you pay for each one and recipe costs add up from it.
      </p>

      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input className="input pl-10" type="search" placeholder="Search ingredients" aria-label="Search prices" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([v, label]) => (
          <button key={v} className={`chip ${status === v ? "chip-on" : ""}`} onClick={() => setParams({ status: v }, { replace: true })}>{label}</button>
        ))}
      </div>

      {error && <ErrorBox message={error} />}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && (
        <div className="card p-6 text-center text-sm text-muted">
          {status === "unpriced" && !q ? "Everything has a price." : q ? "Nothing matches." : "No ingredients yet: they appear as you add recipes."}
          {q && status !== "all" && (
            <button className="mt-2 block w-full font-semibold text-brand" onClick={() => setParams({ status: "all" }, { replace: true })}>
              Search all ingredients
            </button>
          )}
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="card divide-y divide-line">
          {items.map((i) => (
            <li key={i.id}>
              <Link to={`/ingredients/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-bg">
                <div className="min-w-0 flex-1">
                  <p className="font-medium capitalize">{i.name}</p>
                  <p className="text-xs text-muted">
                    {i.category}{i.recipe_count ? ` · in ${i.recipe_count} recipe${i.recipe_count > 1 ? "s" : ""}` : ""}
                    {i.is_staple && " · staple"}{i.never_buy && " · never bought"}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  {i.price_text ? (
                    <>
                      <p className="font-medium">{i.price_text}</p>
                      {i.unit_price_text && <p className="text-xs text-muted">{i.unit_price_text}</p>}
                    </>
                  ) : !i.never_buy ? <span className="text-xs font-semibold text-accent">Add price</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
