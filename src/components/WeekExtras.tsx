// Leftovers card for This week: packs the shopping list leaves part-used, and recipes that finish them.
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import type { Leftover } from "../types";
import { originHere } from "../nav";

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
