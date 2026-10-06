import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { originOf, useBackToOrigin } from "../nav";
import { api } from "../api";
import { BackIcon, ClockIcon, EditIcon, ExternalIcon, TrashIcon, UsersIcon } from "../components/Icons";
import { MACROS } from "../components/Nutrition";
import { useToast } from "../components/Toast";
import { ErrorBox, FavouriteButton, RecipePhoto, Spinner, Stars } from "../components/ui";
import { formatAmount, formatMinutes, hostOf, money, scaleLine } from "../format";
import type { Costing, Recipe, Settings } from "../types";

/** Per-serve macros: the recipe's own panel when it has one, otherwise estimated from the ingredients. */
function NutritionSection({ recipe }: { recipe: Recipe }) {
  const m = recipe.macros;
  if (!m) return null;
  const extra = Object.entries(recipe.nutrition ?? {}).filter(([k]) => !["calories", "protein", "carbohydrates", "fat"].includes(k));
  const prefix = m.complete ? "" : "≥ ";
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-lg font-bold">Nutrition <span className="text-sm font-normal text-muted">per serve</span></h2>
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        {MACROS.map(({ key, label, unit }) => (
          <div key={key} className="card px-1 py-2">
            <p className="text-muted">{label}</p>
            <p className="font-semibold">{m[key] === null ? "—" : `${prefix}${m[key]}${key === "kcal" ? "" : ` ${unit}`}`}</p>
          </div>
        ))}
      </div>
      {extra.length > 0 && (
        <p className="mt-2 text-xs text-muted">{extra.map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v}`).join(" · ")}</p>
      )}
      <p className="mt-2 text-xs text-muted">
        {m.source === "recipe" ? "From the recipe's own nutrition information."
          : m.source === "mixed" ? "Partly from the recipe, the rest estimated from the ingredients."
          : "Estimated from the ingredients (typical values per 100 g; change them on an ingredient's page)."}
      </p>
      {!m.complete && m.missing.length > 0 && (
        <p className="mt-1 text-xs text-accent">
          Not counted yet:{" "}
          {m.missing.map((name, i) => (
            <span key={name}>
              {i > 0 && ", "}
              {m.missing_ids[i] ? <Link to={`/ingredients/${m.missing_ids[i]}`} className="underline">{name}</Link> : name}
            </span>
          ))}
          . Add their nutrition (or weight per item) so this recipe can be used with nutrition limits.
        </p>
      )}
    </div>
  );
}

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const back = useBackToOrigin("/recipes");
  const origin = originOf(location); // passed on to Edit and Store products so their back links keep it
  const toast = useToast();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(2);
  const [costing, setCosting] = useState<Costing | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRecipe(null);
    setCosting(null);
    // Recipes open scaled to the servings you cook for (Settings); the stepper and "show original" still work.
    Promise.all([api<Recipe>(`/api/recipes/${id}`), api<Settings>("/api/settings").catch(() => null)])
      .then(([r, s]) => { setRecipe(r); setServings(s?.default_servings ?? r.servings); })
      .catch((e) => setError(e.message));
    // Costing is extra: the recipe still shows if it fails.
    api<Costing>(`/api/recipes/${id}/costing`).then(setCosting).catch(() => {});
  }, [id]);

  if (error) return <ErrorBox message={error} />;
  if (!recipe) return <Spinner />;

  async function patch(body: { is_favourite?: boolean; rating?: number }) {
    const prev = recipe!;
    setRecipe({ ...prev, ...body, rating: body.rating !== undefined ? body.rating || null : prev.rating });
    try {
      setRecipe(await api<Recipe>(`/api/recipes/${prev.id}`, { method: "PATCH", body }));
    } catch (e) {
      setRecipe(prev);
      toast((e as Error).message, { error: true });
    }
  }

  async function remove() {
    const r = recipe!;
    try {
      await api(`/api/recipes/${r.id}`, { method: "DELETE" });
    } catch (e) {
      return toast((e as Error).message, { error: true });
    }
    navigate("/recipes");
    toast(`Deleted “${r.title}”`, {
      action: {
        label: "Undo",
        run: () => {
          api(`/api/recipes/${r.id}/restore`, { method: "POST" })
            .then(() => navigate(`/recipes/${r.id}`))
            .catch((e) => toast(e.message, { error: true }));
        },
      },
    });
  }

  const factor = servings / recipe.servings;
  const site = hostOf(recipe.source_url);

  return (
    <article className="mx-auto max-w-3xl">
      <div className="relative -mx-4 -mt-4 mb-4 md:mx-0 md:mt-0">
        <RecipePhoto src={recipe.photo_path} title={recipe.title}
          className="aspect-[16/10] w-full md:aspect-[16/7] md:rounded-2xl" />
        <button onClick={back} aria-label="Back"
          className="absolute left-3 top-3 rounded-full bg-black/40 p-2 text-white backdrop-blur-xs">
          <BackIcon className="h-5 w-5" />
        </button>
        <FavouriteButton on={recipe.is_favourite} onToggle={() => patch({ is_favourite: !recipe.is_favourite })}
          className="absolute right-3 top-3 bg-black/40 text-white! backdrop-blur-xs" />
      </div>

      <h1 className="text-2xl font-bold leading-tight md:text-3xl">{recipe.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <Stars value={recipe.rating} onChange={(v) => patch({ rating: v })} />
        {recipe.prep_min ? <span>Prep {formatMinutes(recipe.prep_min)}</span> : null}
        {recipe.cook_min ? <span>Cook {formatMinutes(recipe.cook_min)}</span> : null}
        {recipe.total_min ? (
          <span className="flex items-center gap-1 font-medium text-ink"><ClockIcon className="h-4 w-4" />{formatMinutes(recipe.total_min)}</span>
        ) : null}
      </div>

      {recipe.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {recipe.tags.map((t) => (
            <Link key={t.id} to={`/recipes?tags=${t.id}`} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
              {t.name}
            </Link>
          ))}
        </div>
      )}

      {recipe.description && <p className="mt-4 text-[15px] leading-relaxed text-muted">{recipe.description}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="card px-2 py-3">
          <p className="text-muted">Cooked</p>
          <p className="font-semibold">{recipe.times_cooked ? `${recipe.times_cooked}×` : "Never"}</p>
        </div>
        <div className="card px-2 py-3">
          <p className="text-muted">Last cooked</p>
          <p className="font-semibold">{recipe.last_cooked ? new Date(recipe.last_cooked).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}</p>
        </div>
        <Link to={`/recipes/${recipe.id}/prices`} state={origin} className="card px-2 py-3 hover:border-brand"
          title="From the prices you've entered for its ingredients">
          <p className="text-muted">Cost / serve</p>
          <p className="font-semibold">{money(costing?.per_serve)}</p>
          {costing && !costing.complete && <p className="text-[11px] text-muted">{costing.per_serve === null ? "add prices" : "so far"}</p>}
        </Link>
      </div>

      <div className="mt-6 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Ingredients</h2>
            <div className="flex items-center gap-1 rounded-xl border border-line bg-card p-1">
              <button className="h-8 w-8 rounded-lg text-lg font-semibold hover:bg-bg disabled:opacity-40"
                onClick={() => setServings((s) => Math.max(1, s - 1))} disabled={servings <= 1} aria-label="Fewer servings">−</button>
              <span className="flex min-w-[4.5rem] items-center justify-center gap-1 text-sm font-semibold">
                <UsersIcon className="h-4 w-4" /> {servings}
              </span>
              <button className="h-8 w-8 rounded-lg text-lg font-semibold hover:bg-bg"
                onClick={() => setServings((s) => s + 1)} aria-label="More servings">+</button>
            </div>
          </div>
          {servings !== recipe.servings && (
            <p className="mb-2 text-xs text-muted">
              Scaled from {recipe.servings} servings · <button className="text-brand underline" onClick={() => setServings(recipe.servings)}>show original</button>
            </p>
          )}
          <ul className="card divide-y divide-line">
            {recipe.ingredients.map((line, i) => {
              const l = scaleLine(line, factor);
              const amount = formatAmount(l.quantity, l.unit);
              return (
                <li key={i} className="flex gap-3 px-4 py-2.5 text-[15px]">
                  <span className="w-20 shrink-0 font-semibold tabular-nums">{amount}</span>
                  <span className="min-w-0 flex-1">
                    {l.name}
                    {l.note && <span className="text-muted">, {l.note}</span>}
                    {l.optional && <span className="ml-1 text-xs text-muted">(optional)</span>}
                  </span>
                  <LineCostBadge line={costing?.lines[i]} factor={factor} />
                </li>
              );
            })}
            {recipe.ingredients.length === 0 && <li className="px-4 py-3 text-sm text-muted">No ingredients listed.</li>}
          </ul>
          {costing && recipe.ingredients.length > 0 && (
            <Link to={`/recipes/${recipe.id}/prices`} state={origin} className="btn-secondary mt-2 w-full text-sm">
              {costing.needs_price ? `Prices (${costing.needs_price} to add)` : "Prices"}
            </Link>
          )}
        </section>

        <section className="mt-6 md:mt-0">
          <h2 className="mb-3 text-lg font-bold">Method</h2>
          <ol className="space-y-3">
            {recipe.method.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>
                <p className="pt-0.5 text-[15px] leading-relaxed">{step}</p>
              </li>
            ))}
            {recipe.method.length === 0 && <li className="text-sm text-muted">No method steps.</li>}
          </ol>

          <NutritionSection recipe={recipe} />
        </section>
      </div>

      {recipe.source_url && (
        <a href={recipe.source_url} target="_blank" rel="noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
          <ExternalIcon className="h-4 w-4" /> Original recipe{site ? ` on ${site}` : ""}
        </a>
      )}

      <div className="mt-8 flex gap-2 border-t border-line pt-4">
        <Link to={`/recipes/${recipe.id}/edit`} state={origin} className="btn-secondary flex-1"><EditIcon className="h-5 w-5" /> Edit</Link>
        <button onClick={remove} className="btn-secondary flex-1 text-danger!"><TrashIcon className="h-5 w-5" /> Delete</button>
      </div>
    </article>
  );
}

/** This line's cost, scaled with the servings stepper. */
function LineCostBadge({ line, factor }: { line: Costing["lines"][number] | undefined; factor: number }) {
  if (!line || line.cost === null) return null;
  return <span className="shrink-0 text-xs tabular-nums text-muted">{money(line.cost * factor)}</span>;
}
