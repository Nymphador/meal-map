import { useEffect, useState } from "react";
import { api, qs } from "../api";
import { dayParts, formatMinutes, money } from "../format";
import type { Alternative, Macros, MealType, Plan, PlanMeal, RecipeSummary } from "../types";
import { ClockIcon, HeartIcon, SearchIcon, ShuffleIcon } from "./Icons";
import { macroLine } from "./Nutrition";
import { ErrorBox, RecipePhoto, Sheet, Spinner } from "./ui";

type Tab = "suggest" | "library";

function Row({ title, photo, minutes, perServe, favourite, notes = [], warning, badge, macros, onClick }: {
  title: string; photo: string | null; minutes: number | null; perServe?: number | null; favourite: boolean;
  notes?: string[]; warning?: string | null; badge?: string; macros?: Macros | null; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition hover:bg-bg active:scale-[0.99]">
      <RecipePhoto src={photo} title={title} className="h-14 w-14 shrink-0 rounded-lg text-xl" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 font-semibold leading-snug">
          <span className="truncate">{title}</span>
          {favourite && <HeartIcon filled className="h-4 w-4 shrink-0 text-rose-500" />}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-muted">
          {minutes !== null && <span className="flex items-center gap-1"><ClockIcon className="h-4 w-4" />{formatMinutes(minutes)}</span>}
          {perServe !== undefined && <span>{perServe === null ? "Cost unknown" : `${money(perServe)}/serve`}</span>}
          {badge && <span className="text-xs font-medium text-brand">{badge}</span>}
        </p>
        {macroLine(macros) && <p className="text-xs text-muted">{macroLine(macros)}</p>}
        {notes.slice(0, 3).map((n) => <p key={n} className="mt-0.5 text-xs text-brand">{n}</p>)}
        {warning && <p className="mt-0.5 text-xs text-accent">{warning}</p>}
      </div>
    </button>
  );
}

/** Replace a meal: alternatives ranked by fit, Shuffle, or anything from the library. */
export default function ReplaceSheet({ plan, meal, initialTab = "suggest", onPick, onShuffle, onClose }: {
  plan: Plan; meal: PlanMeal; initialTab?: Tab;
  onPick: (recipeId: number, title: string) => void; onShuffle: () => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [alts, setAlts] = useState<Alternative[] | null>(null);
  const [library, setLibrary] = useState<RecipeSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [error, setError] = useState("");
  const inWeek = new Set(plan.meals.filter((m) => m.id !== meal.id && m.recipe).map((m) => m.recipe!.id));

  useEffect(() => {
    api<Alternative[]>(`/api/plans/${plan.id}/meals/${meal.id}/alternatives`).then(setAlts).catch((e) => setError(e.message));
  }, [plan.id, meal.id]);

  useEffect(() => {
    if (tab !== "library") return;
    const t = window.setTimeout(() => {
      api<RecipeSummary[]>(`/api/recipes${qs({ q, favourite: favOnly, sort: "title" })}`)
        .then(setLibrary).catch((e) => setError(e.message));
    }, q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [tab, q, favOnly]);

  const day = dayParts(meal.date).long;
  return (
    <Sheet onClose={onClose}
      title={
        <>
          <p className="font-semibold">{meal.recipe ? `Replace ${day}'s ${meal.slot}` : `Choose ${day}'s ${meal.slot}`}</p>
          {meal.recipe && <p className="truncate text-sm text-muted">Now: {meal.recipe.title}</p>}
          <div className="mt-2 flex gap-1.5">
            <button type="button" className={`chip ${tab === "suggest" ? "chip-on" : ""}`} onClick={() => setTab("suggest")}>Suggestions</button>
            <button type="button" className={`chip ${tab === "library" ? "chip-on" : ""}`} onClick={() => setTab("library")}>Pick from library</button>
          </div>
        </>
      }
      footer={
        <button type="button" className="btn-secondary w-full" onClick={onShuffle}>
          <ShuffleIcon className="h-5 w-5" /> Shuffle: surprise me
        </button>
      }>
      {error && <ErrorBox message={error} />}
      {tab === "suggest" && (
        !alts ? <Spinner label="Finding good swaps…" /> : alts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Nothing else in your library fits your rules. Try Pick from library, or add more recipes.</p>
        ) : (
          <div className="-mx-2 space-y-1">
            <p className="px-2 pb-1 text-xs text-muted">Best fit first: similar cost and cook time, shared ingredients, specials.</p>
            {alts.map((a) => (
              <Row key={a.recipe.id} title={a.recipe.title} photo={a.recipe.photo_path} minutes={a.recipe.total_min}
                perServe={a.cost_per_serve} favourite={a.recipe.is_favourite} notes={a.notes} warning={a.warning} macros={a.macros}
                onClick={() => onPick(a.recipe.id, a.recipe.title)} />
            ))}
          </div>
        )
      )}
      {tab === "library" && (
        <>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input className="input pl-10" placeholder="Search recipes or ingredients" value={q} autoFocus
              onChange={(e) => setQ(e.target.value)} />
          </div>
          <button type="button" className={`chip mt-2 ${favOnly ? "chip-on" : ""}`} onClick={() => setFavOnly(!favOnly)}>
            <HeartIcon filled={favOnly} className="h-4 w-4" /> Favourites
          </button>
          {!library ? <Spinner /> : library.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No recipes match.</p>
          ) : (
            <div className="-mx-2 mt-2 space-y-1">
              {/* recipes switched on for this meal first */}
              {[...library].sort((a, b) => Number(b.meal_types.includes(meal.slot as MealType)) - Number(a.meal_types.includes(meal.slot as MealType))).map((r) => (
                <Row key={r.id} title={r.title} photo={r.photo_path} minutes={r.total_min} favourite={r.is_favourite} macros={r.macros}
                  badge={inWeek.has(r.id) ? "Already this week" : r.id === meal.recipe?.id ? "Current" : undefined}
                  onClick={() => onPick(r.id, r.title)} />
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
