import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useLive } from "../live";
import { originHere } from "../nav";
import { api, qs } from "../api";
import { BoltIcon, ClockIcon, HeartIcon, LinkIcon, PlusIcon, SearchIcon } from "../components/Icons";
import { useToast } from "../components/Toast";
import { cleanLimits, describeLimits, LIMIT_KEYS, LimitsEditor, macroLine } from "../components/Nutrition";
import { ErrorBox, FavouriteButton, PageHeader, RecipePhoto, Spinner, Stars } from "../components/ui";
import { formatMinutes } from "../format";
import type { NutritionLimits, RecipeSummary, Settings, Tag } from "../types";

export default function Recipes() {
  return (
    <>
      <PageHeader title="Recipes" actions={
        <div className="flex gap-2">
          <Link to="/recipes/import" className="btn-secondary px-3" title="Import from a link, PDF or text">
            <LinkIcon className="h-5 w-5" /><span className="hidden sm:inline">Import</span>
          </Link>
          <Link to="/recipes/new" className="btn-primary px-3" title="New recipe">
            <PlusIcon className="h-5 w-5" /><span className="hidden sm:inline">New</span>
          </Link>
        </div>
      } />
      <Library />
    </>
  );
}

function Library() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const toast = useToast();
  const q = params.get("q") ?? "";
  const fav = params.get("fav") === "1";
  const quick = params.get("quick") === "1";
  const sort = params.get("sort") ?? "title";
  const tagIds = (params.get("tags") ?? "").split(",").filter(Boolean).map(Number);
  const limitsKey = LIMIT_KEYS.map((k) => params.get(k) ?? "").join(",");
  const limits: NutritionLimits = cleanLimits(Object.fromEntries(
    LIMIT_KEYS.filter((k) => params.get(k)).map((k) => [k, Number(params.get(k))])));
  const hasLimits = Object.keys(limits).length > 0;

  const [search, setSearch] = useState(q);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [error, setError] = useState("");

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // Search as you type, debounced so each keystroke isn't a request.
  useEffect(() => {
    const t = window.setTimeout(() => { if (search !== q) update({ q: search || null }); }, 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    api<Tag[]>("/api/tags").then(setTags).catch(() => {});
  }, []);

  const tagKey = tagIds.join(",");
  const load = useCallback(() => {
    setError("");
    api<RecipeSummary[]>(`/api/recipes${qs({ q, favourite: fav, quick, sort, tag: tagKey ? tagKey.split(",") : [], ...limits })}`)
      .then(setRecipes)
      .catch((e) => setError(e.message));
  }, [q, fav, quick, sort, tagKey, limitsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(load, [load]);
  useLive(["recipes"], load);

  const toggleTag = (id: number) => {
    const next = tagIds.includes(id) ? tagIds.filter((t) => t !== id) : [...tagIds, id];
    update({ tags: next.length ? next.join(",") : null });
  };

  async function toggleFavourite(r: RecipeSummary) {
    setRecipes((list) => list?.map((x) => (x.id === r.id ? { ...x, is_favourite: !r.is_favourite } : x)) ?? null);
    try {
      await api(`/api/recipes/${r.id}`, { method: "PATCH", body: { is_favourite: !r.is_favourite } });
    } catch (e) {
      toast((e as Error).message, { error: true });
      load();
    }
  }

  const usedTags = tags.filter((t) => t.recipe_count > 0 || tagIds.includes(t.id));
  const filtered = q || fav || quick || tagIds.length > 0 || hasLimits;
  const [showNutrition, setShowNutrition] = useState(hasLimits);
  const setLimits = (next: NutritionLimits) =>
    update(Object.fromEntries(LIMIT_KEYS.map((k) => [k, next[k] != null ? String(next[k]) : null])));

  return (
    <>
      <div className="relative mb-3">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input className="input pl-10" placeholder="Search recipes or ingredients" value={search}
          onChange={(e) => setSearch(e.target.value)} type="search" />
      </div>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <button className={`chip ${fav ? "chip-on" : ""}`} onClick={() => update({ fav: fav ? null : "1" })}>
          <HeartIcon className="h-4 w-4" filled={fav} /> Favourites
        </button>
        <button className={`chip ${quick ? "chip-on" : ""}`} onClick={() => update({ quick: quick ? null : "1" })}>
          <BoltIcon className="h-4 w-4" /> Under 30 min
        </button>
        <button className={`chip ${hasLimits ? "chip-on" : ""}`} onClick={() => setShowNutrition(!showNutrition)}>
          {hasLimits ? describeLimits(limits) : "Nutrition"}
        </button>
        {usedTags.map((t) => (
          <button key={t.id} className={`chip ${tagIds.includes(t.id) ? "chip-on" : ""}`} onClick={() => toggleTag(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      {showNutrition && <NutritionPanel limits={limits} onChange={setLimits} />}

      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>{recipes ? `${recipes.length} recipe${recipes.length === 1 ? "" : "s"}` : ""}</span>
        <label className="flex items-center gap-2">
          Sort
          <select className="rounded-lg border border-line bg-card px-2 py-1 text-ink" value={sort}
            onChange={(e) => update({ sort: e.target.value === "title" ? null : e.target.value })}>
            <option value="title">A–Z</option>
            <option value="recent">Newest</option>
            <option value="rating">Top rated</option>
            <option value="quickest">Quickest</option>
            <option value="cooked">Most cooked</option>
            <option value="kcal">Fewest calories</option>
            <option value="protein">Most protein</option>
            <option value="carbs">Fewest carbs</option>
            <option value="fat">Least fat</option>
          </select>
        </label>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!recipes && !error && <Spinner />}
      {recipes && recipes.length === 0 && (
        <div className="card p-8 text-center text-muted">
          {filtered ? "No recipes match those filters." : "No recipes yet. Add your own, or import one from a web link, a PDF or pasted text."}
        </div>
      )}
      {recipes && recipes.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {recipes.map((r) => (
            <div key={r.id} className="card group relative overflow-hidden">
              <Link to={`/recipes/${r.id}`} state={originHere(location)} className="block">
                <RecipePhoto src={r.photo_path} title={r.title} className="aspect-[4/3] w-full" />
                <div className="p-3">
                  <h3 className="line-clamp-2 font-semibold leading-snug">{r.title}</h3>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                    {r.total_min ? <span className="flex items-center gap-1"><ClockIcon className="h-3.5 w-3.5" />{formatMinutes(r.total_min)}</span> : null}
                    {r.rating ? <Stars value={r.rating} size="h-3.5 w-3.5" /> : null}
                  </div>
                  {macroLine(r.macros) && <p className="mt-1 text-xs text-muted">{macroLine(r.macros)}</p>}
                </div>
              </Link>
              <FavouriteButton on={r.is_favourite} onToggle={() => toggleFavourite(r)}
                className="absolute right-1.5 top-1.5 bg-black/30 text-white! backdrop-blur-xs hover:bg-black/40" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Per-serving macro filters, plus a switch to make the meal planner follow them. */
function NutritionPanel({ limits, onChange }: { limits: NutritionLimits; onChange: (l: NutritionLimits) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState<NutritionLimits>(limits);
  const [planner, setPlanner] = useState<NutritionLimits | null>(null);

  useEffect(() => {
    api<Settings>("/api/settings").then((s) => setPlanner(s.nutrition_limits ?? {})).catch(() => {});
  }, []);
  // Typing "600" shouldn't search for 6, then 60, then 600.
  useEffect(() => {
    const t = window.setTimeout(() => { if (JSON.stringify(draft) !== JSON.stringify(limits)) onChange(draft); }, 400);
    return () => window.clearTimeout(t);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const same = planner !== null && JSON.stringify(cleanLimits(planner)) === JSON.stringify(cleanLimits(draft));
  async function usePlanner() {
    try {
      const s = await api<Settings>("/api/settings", { method: "PUT", body: { nutrition_limits: cleanLimits(draft) } });
      setPlanner(s.nutrition_limits);
      const text = describeLimits(s.nutrition_limits);
      toast(text ? `The meal planner will only pick meals with ${text} per serve` : "The meal planner has no nutrition limits now");
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  }

  return (
    <div className="card mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">Nutrition per serve</p>
        {Object.keys(draft).length > 0 && (
          <button type="button" className="text-sm font-semibold text-brand" onClick={() => setDraft({})}>Clear</button>
        )}
      </div>
      <LimitsEditor value={draft} onChange={setDraft} />
      <p className="mt-2 text-xs text-muted">Recipes whose nutrition isn't fully known are hidden while a limit is set.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <p className="min-w-0 flex-1 text-sm text-muted">
          Meal planner: {planner === null ? "…" : describeLimits(planner) || "no nutrition limits"}
        </p>
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={same || planner === null} onClick={usePlanner}>
          {Object.keys(draft).length ? "Use for meal planner" : "Remove planner limits"}
        </button>
      </div>
    </div>
  );
}
