import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import { weekRange } from "../format";
import type { MealState, Plan, PlanSummary } from "../types";

/** Past (and future) weeks that had meals, with Reuse to copy one into the week you came from. */
export default function PlanHistory() {
  const [params] = useSearchParams();
  const into = params.get("into");
  const navigate = useNavigate();
  const toast = useToast();
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    api<PlanSummary[]>("/api/plans").then(setPlans).catch((e) => setError(e.message));
  }, []);

  async function reuse(source: PlanSummary) {
    if (!into) return;
    setBusy(source.id);
    try {
      const target = await api<Plan>(`/api/plans/week/${into}`);
      const before: MealState[] = target.meals.map((m) => ({
        id: m.id, recipe_id: m.recipe?.id ?? null, servings: m.servings, status: m.status, locked: m.locked,
      }));
      await api<Plan>(`/api/plans/${target.id}/copy`, { body: { source_plan_id: source.id } });
      navigate(`/?week=${into}`);
      toast(`Reused the week of ${weekRange(source.week_start)}`, {
        action: {
          label: "Undo",
          run: () => {
            api(`/api/plans/${target.id}/restore`, { body: { meals: before } })
              .then(() => navigate(`/?week=${into}&r=${Date.now()}`))
              .catch((e) => toast(e.message, { error: true }));
          },
        },
      });
    } catch (e) {
      toast((e as Error).message, { error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Past weeks" back={into ? `/?week=${into}` : "/"} />
      {into && <p className="mb-3 text-sm text-muted">Reuse copies a week, day for day, into {weekRange(into)}. Locked and cooked meals there are kept.</p>}
      {error && <ErrorBox message={error} />}
      {!plans && !error ? <Spinner /> : plans && plans.length === 0 ? (
        <div className="card p-6 text-center text-sm text-muted">No planned weeks yet. Weeks you plan show up here.</div>
      ) : (
        <div className="space-y-2">
          {plans?.filter((pl) => pl.week_start !== into).map((pl) => (
            <div key={pl.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{weekRange(pl.week_start)}</p>
                <p className="line-clamp-2 text-sm text-muted">{pl.titles.join(" · ")}</p>
              </div>
              <button type="button" className="btn-secondary px-3 py-2 text-sm" onClick={() => navigate(`/?week=${pl.week_start}`)}>View</button>
              {into && (
                <button type="button" className="btn-primary px-3 py-2 text-sm" disabled={busy !== null} onClick={() => reuse(pl)}>
                  {busy === pl.id ? "Copying…" : "Reuse"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
