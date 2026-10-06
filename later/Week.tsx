import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { originHere } from "../nav";
import { api } from "../api";
import {
  CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, DotsIcon, GripIcon, HeartIcon, HistoryIcon, LockIcon,
  ShuffleIcon, SparkIcon, UsersIcon,
} from "../components/Icons";
import RefreshReport from "../components/RefreshReport";
import { LeftoversCard, SpecialsCard } from "../components/WeekExtras";
import ReplaceSheet from "../components/ReplaceSheet";
import { useLive } from "../live";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, RecipePhoto, Spinner } from "../components/ui";
import { addDays, dayParts, formatMinutes, money, parseDay, weekRange } from "../format";
import type { MealState, MealStatus, Plan, PlanMeal } from "../types";

const snap = (m: PlanMeal): MealState =>
  ({ id: m.id, recipe_id: m.recipe?.id ?? null, servings: m.servings, status: m.status, locked: m.locked });

function weekStartOf(iso: string): string {
  return addDays(iso, -((parseDay(iso).getDay() + 6) % 7));
}

const STATUS_TEXT: Record<string, { title: string; note: string }> = {
  eating_out: { title: "Eating out", note: "No ingredients needed" },
  leftovers: { title: "Leftovers", note: "No ingredients needed" },
  skipped: { title: "Skipped", note: "No dinner planned" },
};

type MenuAction =
  | { kind: "shuffle" } | { kind: "library" } | { kind: "clear" }
  | { kind: "status"; status: MealStatus } | { kind: "servings"; n: number } | { kind: "move"; to: PlanMeal };

function MealMenu({ meal, meals, onAction }: { meal: PlanMeal; meals: PlanMeal[]; onAction: (a: MenuAction) => void }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const act = (a: MenuAction) => { setOpen(false); onAction(a); };
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg";
  const hasRecipe = !!meal.recipe && meal.status === "planned";

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label="More actions" className="rounded-full p-1.5 text-muted hover:bg-bg hover:text-ink"
        onClick={(e) => {
          // Open upwards when the menu wouldn't fit above the phone's bottom tab bar.
          const rect = e.currentTarget.getBoundingClientRect();
          const below = window.innerHeight - rect.bottom - 72;
          setUp(below < 380 && rect.top > below);
          setMoving(false);
          setOpen(!open);
        }}>
        <DotsIcon className="h-5 w-5" />
      </button>
      {open && (
        <div className={`absolute right-0 z-30 w-60 rounded-xl border border-line bg-card p-1 shadow-lg ${up ? "bottom-full mb-1" : "top-full mt-1"}`}>
          {moving ? (
            <>
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Move to</p>
              {meals.filter((m) => m.id !== meal.id).map((m) => (
                <button key={m.id} type="button" className={item} disabled={m.status === "cooked"} onClick={() => act({ kind: "move", to: m })}>
                  <span className="w-24 font-medium">{dayParts(m.date).long}</span>
                  <span className="truncate text-xs text-muted">{m.recipe?.title ?? STATUS_TEXT[m.status]?.title ?? "Empty"}</span>
                </button>
              ))}
            </>
          ) : meal.status === "cooked" ? (
            <button type="button" className={item} onClick={() => act({ kind: "status", status: "planned" })}>Undo Mark cooked</button>
          ) : (
            <>
              {hasRecipe && (
                <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <UsersIcon className="h-4 w-4 text-muted" />
                  <span className="flex-1">Serves</span>
                  <button type="button" className="h-7 w-7 rounded-full border border-line" aria-label="Fewer serves"
                    disabled={meal.servings <= 1} onClick={() => onAction({ kind: "servings", n: meal.servings - 1 })}>−</button>
                  <span className="w-5 text-center font-semibold">{meal.servings}</span>
                  <button type="button" className="h-7 w-7 rounded-full border border-line" aria-label="More serves"
                    onClick={() => onAction({ kind: "servings", n: meal.servings + 1 })}>+</button>
                </div>
              )}
              <button type="button" className={item} onClick={() => act({ kind: "shuffle" })}><ShuffleIcon className="h-4 w-4" /> Shuffle</button>
              <button type="button" className={item} onClick={() => act({ kind: "library" })}>Pick from library</button>
              {hasRecipe && <button type="button" className={item} onClick={() => act({ kind: "status", status: "cooked" })}><CheckIcon className="h-4 w-4" /> Mark cooked</button>}
              <div className="my-1 border-t border-line" />
              {(["leftovers", "eating_out", "skipped"] as MealStatus[]).filter((s) => s !== meal.status).map((s) => (
                <button key={s} type="button" className={item} onClick={() => act({ kind: "status", status: s })}>
                  {s === "skipped" ? "Skip" : STATUS_TEXT[s].title}
                </button>
              ))}
              {meal.status !== "planned" && <button type="button" className={item} onClick={() => act({ kind: "status", status: "planned" })}>Plan a meal</button>}
              {hasRecipe && <button type="button" className={item} onClick={() => act({ kind: "clear" })}>Clear</button>}
              <button type="button" className={item} onClick={() => setMoving(true)}>Move to another day…</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function WeekPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const weekParam = params.get("week");
  const reloadKey = params.get("r"); // set by Undo on the Past weeks page
  const [plan, setPlan] = useState<Plan | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sheet, setSheet] = useState<{ meal: PlanMeal; tab: "suggest" | "library" } | null>(null);
  const [drag, setDrag] = useState<{ meal: PlanMeal; x: number; y: number; over: number | null } | null>(null);

  function load() {
    setError("");
    api<Plan>(weekParam ? `/api/plans/week/${weekParam}` : "/api/plans/current").then(setPlan).catch((e) => setError(e.message));
  }
  useEffect(() => { setNotes([]); load(); }, [weekParam, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(["plans"], load);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!plan) return <Spinner />;
  const p = plan;

  const fail = (e: unknown) => toast((e as Error).message, { error: true });
  const restore = (states: MealState[]) => api<Plan>(`/api/plans/${p.id}/restore`, { body: { meals: states } });
  const patchMeal = (m: PlanMeal, body: Record<string, unknown>) =>
    api<Plan>(`/api/plans/${p.id}/meals/${m.id}`, { method: "PATCH", body });

  /** Applies a change, then offers Undo (which puts the previous plan state back). */
  async function change(request: Promise<Plan>, message?: (next: Plan) => string, undo?: () => Promise<Plan>) {
    try {
      const next = await request;
      setPlan(next);
      if (message) {
        toast(message(next), undo ? { action: { label: "Undo", run: () => { undo().then(setPlan).catch(fail); } } } : {});
      }
    } catch (e) {
      fail(e);
    }
  }

  async function generate() {
    const before = p.meals.map(snap);
    setGenerating(true);
    try {
      const next = await api<Plan>(`/api/plans/${p.id}/generate`, { method: "POST" });
      setPlan(next);
      setNotes(next.notes);
      const ms = next.elapsed_ms ?? 0;
      toast(`Week planned in ${ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}`, { action: { label: "Undo", run: () => { restore(before).then(setPlan).catch(fail); } } });
    } catch (e) {
      fail(e);
    } finally {
      setGenerating(false);
    }
  }

  const titleOn = (next: Plan, m: PlanMeal) => next.meals.find((x) => x.id === m.id)?.recipe?.title ?? "";

  function pick(meal: PlanMeal, recipeId: number, title: string) {
    setSheet(null);
    change(patchMeal(meal, { recipe_id: recipeId }), () => `${dayParts(meal.date).long}: ${title}`, () => restore([snap(meal)]));
  }

  /** Leftovers card: put the recipe on the first night with nothing planned. */
  function addLeftoverRecipe(recipeId: number, title: string) {
    const free = p.meals.find((m) => m.status === "planned" && !m.recipe);
    if (!free) return toast("Every night has a meal. Use Replace on one to swap this in.", { error: true });
    pick(free, recipeId, title);
  }

  function shuffle(meal: PlanMeal) {
    setSheet(null);
    change(api<Plan>(`/api/plans/${p.id}/meals/${meal.id}/shuffle`, { method: "POST" }),
      (next) => `${dayParts(meal.date).long}: ${titleOn(next, meal)}`, () => restore([snap(meal)]));
  }

  function move(meal: PlanMeal, to: PlanMeal) {
    if (to.status === "cooked" || meal.status === "cooked") return toast("Cooked meals stay on the day they were cooked", { error: true });
    // Swap locally first so the drop feels instant; the server's answer replaces it a moment later.
    const swapped = p.meals.map((m) =>
      m.id === meal.id ? { ...to, id: m.id, date: m.date } : m.id === to.id ? { ...meal, id: m.id, date: m.date } : m);
    setPlan({ ...p, meals: swapped });
    const call = () => api<Plan>(`/api/plans/${p.id}/meals/${meal.id}/move`, { body: { to_meal_id: to.id } });
    call()
      .then((next) => {
        setPlan(next);
        toast(`Moved to ${dayParts(to.date).long}`, { action: { label: "Undo", run: () => { call().then(setPlan).catch(fail); } } });
      })
      .catch((e) => { fail(e); load(); });
  }

  function onAction(meal: PlanMeal, a: MenuAction) {
    switch (a.kind) {
      case "shuffle": return shuffle(meal);
      case "library": return setSheet({ meal, tab: "library" });
      case "servings": return change(patchMeal(meal, { servings: a.n }));
      case "clear": return change(patchMeal(meal, { recipe_id: null }), () => "Cleared", () => restore([snap(meal)]));
      case "move": return move(meal, a.to);
      case "status":
        if (a.status === "cooked") {
          return change(patchMeal(meal, { status: "cooked" }), () => `Cooked ${meal.recipe?.title}: ingredients taken from the pantry`,
            () => patchMeal(meal, { status: "planned" }));
        }
        if (meal.status === "cooked") return change(patchMeal(meal, { status: "planned" }));
        if (a.status === "planned") return setSheet({ meal, tab: "suggest" });
        return change(patchMeal(meal, { status: a.status }),
          () => `${dayParts(meal.date).long}: ${STATUS_TEXT[a.status].title}`, () => restore([snap(meal)]));
    }
  }

  // Drag to move: pointer events, so it works with a finger as well as a mouse.
  function dragStart(e: React.PointerEvent, meal: PlanMeal) {
    if (meal.status === "cooked") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ meal, x: e.clientX, y: e.clientY, over: meal.id });
  }
  function dragMove(e: React.PointerEvent) {
    if (!drag) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-meal-id]");
    if (e.clientY < 80) window.scrollBy(0, -12);
    else if (e.clientY > window.innerHeight - 120) window.scrollBy(0, 12);
    setDrag({ ...drag, x: e.clientX, y: e.clientY, over: el ? Number(el.dataset.mealId) : null });
  }
  function dragEnd() {
    const d = drag;
    setDrag(null);
    const target = d && d.over !== d.meal.id ? p.meals.find((m) => m.id === d.over) : undefined;
    if (d && target) move(d.meal, target);
  }

  const thisWeek = weekStartOf(p.today);
  const isCurrent = p.week_start === thisWeek;
  const anyPlanned = p.meals.some((m) => m.recipe || m.status !== "planned");
  const budget = p.budget;
  const unpriced = p.planned_meals - p.costed_meals;

  return (
    <>
      <PageHeader title={isCurrent ? "This week" : p.week_start > thisWeek ? "Coming up" : "Past week"}
        actions={
          <Link to={`/plans/history?into=${p.week_start}`} className="btn-ghost px-3 py-2 text-sm">
            <HistoryIcon className="h-5 w-5" /> <span className="hidden sm:inline">Past weeks</span>
          </Link>
        } />

      <div className="mb-3 flex items-center gap-2">
        <button type="button" className="rounded-full p-2 text-muted hover:bg-card" aria-label="Previous week"
          onClick={() => setParams({ week: addDays(p.week_start, -7) })}>
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 text-center font-semibold">{weekRange(p.week_start)}</p>
        <button type="button" className="rounded-full p-2 text-muted hover:bg-card" aria-label="Next week"
          onClick={() => setParams({ week: addDays(p.week_start, 7) })}>
          <ChevronRightIcon className="h-5 w-5" />
        </button>
        {!isCurrent && <button type="button" className="chip" onClick={() => setParams({})}>This week</button>}
      </div>

      {/* Wide screens: the week's meals on the left, the summary cards in a column on the right. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-4">
      <aside className="xl:col-start-2 xl:row-start-1">
      <section className="card mb-3 flex flex-wrap items-center gap-4 p-4">
        <div className="min-w-[13rem] flex-1">
          {anyPlanned ? (
            <>
              <p className="text-sm text-muted">Estimated cost</p>
              <p className="text-2xl font-bold">
                {money(p.est_cost)}
                {budget ? <span className="ml-1 text-base font-medium text-muted">of {money(budget)} budget</span> : null}
              </p>
              {budget ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <div className={`h-full rounded-full ${p.est_cost > budget ? "bg-danger" : "bg-brand"}`}
                    style={{ width: `${Math.min(100, (p.est_cost / budget) * 100)}%` }} />
                </div>
              ) : null}
              {p.nutrition?.average && (
                <p className="mt-1 text-sm">
                  Average dinner: {p.nutrition.average.kcal} kcal · {p.nutrition.average.protein} g protein
                  <span className="text-muted"> ({p.nutrition.meals} of {p.planned_meals} known)</span>
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                {unpriced > 0 && `${unpriced} meal${unpriced > 1 ? "s" : ""} not fully priced yet. `}
                What the recipes use; the <Link to={`/shopping?week=${p.week_start}`} className="text-brand">shopping list</Link> rounds
                up to whole packs and takes off what's in the pantry.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Nothing planned yet</p>
              <p className="text-sm text-muted">Generate fills the week with dinners from your library, using your rules in Settings.</p>
            </>
          )}
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:items-end">
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={generate} disabled={generating}>
            <SparkIcon className="h-5 w-5" /> {generating ? "Planning…" : anyPlanned ? "Regenerate" : "Generate plan"}
          </button>
          {anyPlanned && <p className="text-[11px] text-muted">Keeps locked, cooked and skipped nights</p>}
        </div>
        {p.nutrition_rules.length > 0 && (
          <p className="w-full border-t border-line pt-2 text-xs text-muted">
            Only meals with <span className="font-semibold text-ink">{p.nutrition_rules.join(" · ")}</span> per serve
            {" · "}<Link to="/settings" className="text-brand">change</Link>
          </p>
        )}
      </section>

      {isCurrent && <RefreshReport />}
      {isCurrent && <SpecialsCard />}
      <LeftoversCard planId={p.id} mealsKey={p.meals.map((m) => `${m.id}:${m.recipe?.id ?? m.status}:${m.servings}`).join(",")}
        onAdd={addLeftoverRecipe} />
      </aside>

      <div className="min-w-0 xl:col-start-1 xl:row-start-1">

      {notes.length > 0 && (
        <section className="card mb-3 border-accent/50 p-3 text-sm">
          <div className="flex items-start gap-2">
            <ul className="flex-1 list-disc space-y-1 pl-5">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
            <button type="button" className="text-xs font-semibold text-muted" onClick={() => setNotes([])}>Dismiss</button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {p.meals.map((m) => {
          const day = dayParts(m.date);
          const isToday = m.date === p.today;
          const past = m.date < p.today;
          const status = STATUS_TEXT[m.status];
          const dragging = drag?.meal.id === m.id;
          const over = drag && drag.over === m.id && !dragging;
          return (
            <div key={m.id} data-meal-id={m.id}
              className={`card flex gap-3 p-3 transition ${over ? "border-brand ring-2 ring-brand/30" : ""} ${
                dragging ? "opacity-40" : ""} ${isToday ? "border-brand/60" : ""}`}>
              <div className={`w-10 shrink-0 pt-0.5 text-center ${past ? "opacity-60" : ""}`}>
                <p className="text-xs font-semibold uppercase text-muted">{day.short}</p>
                <p className="text-lg font-bold leading-tight">{parseDay(m.date).getDate()}</p>
                {isToday && <p className="text-[10px] font-bold uppercase text-brand">Today</p>}
              </div>

              <div className="min-w-0 flex-1">
                {m.recipe && (m.status === "planned" || m.status === "cooked") ? (
                  <div className="flex gap-3">
                    <Link to={`/recipes/${m.recipe.id}`} state={originHere(location)} className="shrink-0">
                      <RecipePhoto src={m.recipe.photo_path} title={m.recipe.title} className="h-16 w-16 rounded-xl text-2xl" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/recipes/${m.recipe.id}`} state={originHere(location)} className="line-clamp-2 font-semibold leading-snug hover:text-brand">
                        {m.recipe.is_favourite && <HeartIcon filled className="mr-1 inline h-4 w-4 -translate-y-px text-rose-500" />}
                        {m.recipe.title}
                      </Link>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                        {m.recipe.total_min !== null && <span className="flex items-center gap-1"><ClockIcon className="h-4 w-4" />{formatMinutes(m.recipe.total_min)}</span>}
                        <span title={m.cost_stale ? "Some prices are over a week old" : m.cost_complete ? "" : "Some ingredients aren't priced yet"}>
                          {m.cost === null ? "Cost —" : `${money(m.cost)}${m.cost_complete ? "" : "+"}`}
                          {m.cost_stale && m.cost !== null && <span className="ml-1 text-xs text-accent">old prices</span>}
                        </span>
                        <span>{m.servings} serves</span>
                        {m.macros?.complete && m.macros.kcal !== null && <span>{m.macros.kcal} kcal</span>}
                      </p>
                      {m.status === "cooked" ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand"><CheckIcon className="h-4 w-4" /> Cooked</p>
                      ) : m.specials[0] ? (
                        <p className="mt-1 truncate text-xs font-medium text-accent">{m.specials[0]}</p>
                      ) : null}
                    </div>
                  </div>
                ) : status ? (
                  <div className="py-1">
                    <p className="font-semibold text-muted">{status.title}</p>
                    <p className="text-sm text-muted">{status.note}</p>
                  </div>
                ) : (
                  <div className="py-1">
                    <p className="font-semibold text-muted">Nothing planned</p>
                    <button type="button" className="mt-1 text-sm font-semibold text-brand" onClick={() => setSheet({ meal: m, tab: "suggest" })}>
                      Choose a dinner
                    </button>
                  </div>
                )}

                {m.status === "planned" && m.recipe && (
                  <div className="mt-2 flex items-center gap-1">
                    <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setSheet({ meal: m, tab: "suggest" })}>Replace</button>
                    <button type="button" className="rounded-full p-2 text-muted hover:bg-bg hover:text-ink" aria-label="Shuffle" title="Shuffle"
                      onClick={() => shuffle(m)}>
                      <ShuffleIcon className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="-mr-1 flex shrink-0 flex-col items-center gap-0.5">
                <MealMenu meal={m} meals={p.meals} onAction={(a) => onAction(m, a)} />
                {m.status === "planned" && m.recipe && (
                  <button type="button" aria-pressed={m.locked} aria-label={m.locked ? "Unlock" : "Lock"}
                    title={m.locked ? "Locked: kept when you regenerate" : "Lock to keep when you regenerate"}
                    className={`rounded-full p-1.5 ${m.locked ? "bg-brand-soft text-brand" : "text-muted hover:bg-bg hover:text-ink"}`}
                    onClick={() => change(patchMeal(m, { locked: !m.locked }))}>
                    <LockIcon open={!m.locked} className="h-5 w-5" />
                  </button>
                )}
                {m.status !== "cooked" && (
                  <button type="button" aria-label="Drag to another day" title="Drag to another day"
                    className="touch-none cursor-grab rounded-full p-1.5 text-muted hover:bg-bg active:cursor-grabbing"
                    onPointerDown={(e) => dragStart(e, m)} onPointerMove={dragMove} onPointerUp={dragEnd}
                    onPointerCancel={() => setDrag(null)}>
                    <GripIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
      </div>

      {drag && (
        <div className="pointer-events-none fixed z-50 max-w-56 truncate rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-brand-ink shadow-lg"
          style={{ left: drag.x + 14, top: drag.y - 18 }}>
          {drag.meal.recipe?.title ?? STATUS_TEXT[drag.meal.status]?.title ?? "Empty night"}
        </div>
      )}

      {sheet && (
        <ReplaceSheet plan={p} meal={sheet.meal} initialTab={sheet.tab} onClose={() => setSheet(null)}
          onPick={(id, title) => pick(sheet.meal, id, title)} onShuffle={() => shuffle(sheet.meal)} />
      )}
    </>
  );
}
