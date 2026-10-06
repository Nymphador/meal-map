// Cards for the This week screen: specials worth planning around, and leftovers to use up.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import { money, STORE_DOT } from "../format";
import { useLive } from "../live";
import type { Leftover, Special } from "../types";
import { originHere } from "../nav";

export function SpecialsCard() {
  const location = useLocation();
  const [specials, setSpecials] = useState<Special[] | null>(null);
  const [all, setAll] = useState(false);
  const [tick, setTick] = useState(0);
  useLive(["prices"], () => setTick((t) => t + 1));
  useEffect(() => { api<Special[]>("/api/prices/specials?limit=12").then(setSpecials).catch(() => {}); }, [tick]);

  const useful = (specials ?? []).filter((s) => s.recipe_count > 0);
  if (!useful.length) return null;
  const shown = all ? useful : useful.slice(0, 3);
  return (
    <section className="card mb-3 p-4">
      <h2 className="font-semibold">On special this week</h2>
      <p className="text-xs text-muted">Only deals on things a recipe uses a good amount of (at least a quarter of the pack).</p>
      <ul className="mt-2 space-y-3">
        {shown.map((s) => (
          <li key={`${s.ingredient_id}-${s.store}`} className="text-sm">
            <p className="flex items-start gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STORE_DOT[s.store]}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{s.headline}</span>
                <span className="text-muted">
                  {" "}· {money(s.price)}{s.was_price ? ` (was ${money(s.was_price)})` : ""}{s.saving_pct ? `, ${s.saving_pct}% off` : ""}
                </span>
              </span>
            </p>
            <p className="ml-4 mt-1 flex flex-wrap gap-1.5">
              {s.recipes.map((r) => (
                <Link key={r.id} to={`/recipes/${r.id}`} state={originHere(location)} className="chip max-w-full py-1 text-xs hover:border-brand">
                  <span className="truncate">{r.title}</span> <span className="shrink-0 text-muted">uses {r.uses_text}</span>
                </Link>
              ))}
              {s.recipe_count > s.recipes.length && <span className="py-1 text-xs text-muted">+{s.recipe_count - s.recipes.length} more</span>}
            </p>
          </li>
        ))}
      </ul>
      {useful.length > 3 && (
        <button type="button" className="mt-2 text-sm font-semibold text-brand" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${useful.length}`}
        </button>
      )}
    </section>
  );
}

export function LeftoversCard({ planId, mealsKey, onAdd }: {
  planId: number; mealsKey: string; onAdd: (recipeId: number, title: string) => void;
}) {
  const location = useLocation();
  const [items, setItems] = useState<Leftover[] | null>(null);
  useEffect(() => {
    api<Leftover[]>(`/api/plans/${planId}/leftovers`).then(setItems).catch(() => setItems([]));
  }, [planId, mealsKey]);

  const useful = (items ?? []).filter((l) => l.recipes.length);
  if (!useful.length) return null;
  return (
    <section className="card mb-3 p-4">
      <h2 className="font-semibold">Leftovers to use up</h2>
      <p className="text-xs text-muted">Packs that won't be finished this week, and recipes that would use the rest.</p>
      <ul className="mt-2 space-y-3 text-sm">
        {useful.slice(0, 3).map((l) => (
          <li key={l.ingredient_id}>
            <p><span className="font-medium">{l.name.charAt(0).toUpperCase() + l.name.slice(1)}</span>: {l.text} left after shopping</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {l.recipes.map((r) => (
                <span key={r.id} className="chip max-w-full gap-2 py-1 text-xs">
                  <Link to={`/recipes/${r.id}`} state={originHere(location)} className="truncate hover:text-brand">
                    {r.title}{r.uses_text ? ` (uses ${r.uses_text})` : ""}
                  </Link>
                  <button type="button" className="shrink-0 font-semibold text-brand" onClick={() => onAdd(r.id, r.title)}>Add</button>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
