// Weekly meal plans: creating weeks, generating them with the weighting rules, ranking
// alternatives for Replace, and the small edits (move, lock, skip, cooked).
//
// Every day has a dinner. Breakfast and lunch exist only on days the user has opened up (expandDay):
// those rows are what makes a day "expanded", and only then does Generate plan them, from recipes
// switched on for that meal.
//
// Everything a generation needs is gathered once (recipes, tags, costs, past usage, pantry), so a
// full week comes back in milliseconds however big the library is.

import { db, nextId, nowIso } from "../data/db";
import type { IngredientRow, MealRow, MealStatus, MealType, PlanRow, RecipeRow } from "../data/schema";
import { getSetting, allSettings } from "../server/settings";
import { makeRng } from "./amounts";
import { recipeCosting } from "./costing";
import { addDays, DAY_NAMES, daysBetween, today, weekday, weekStartOf } from "./dates";
import { ApiError } from "./errors";
import { ingredientMap } from "./ingredients";
import { normaliseName } from "./names";
import { describeLimits, limitsProblem, macrosOut, MACROS, recipeNutrition, type Nutrition } from "./nutrition";
import { deduct, expiringSoon, hasSome, lineAmount, putBack, stock } from "./pantry";
import { MEAL_TYPES, mealTypes, totalMinutes } from "./recipes";

export const STATUSES: MealStatus[] = ["planned", "cooked", "skipped", "leftovers", "eating_out"];
const NO_RECIPE = new Set<MealStatus>(["skipped", "leftovers", "eating_out"]); // no ingredients needed
export const HAS_RECIPE = new Set<MealStatus>(["planned", "cooked"]);
export const FRESH = new Set(["produce", "meat", "seafood", "dairy", "bakery"]); // sharing these saves waste

// Hard-rule problem text -> how the "nights left empty" note summarises it.
const RULE_REASONS: [string, string][] = [["Not tagged", "lack your dietary tags"], ["Contains", "contain a dislike"],
  ["Takes", "take too long"], ["Nutrition not known", "have unknown nutrition"], ["per serve", "are outside your nutrition limits"]];

// --- weeks -----------------------------------------------------------------------------

export function getPlan(id: number): PlanRow {
  const p = db().plans.find((x) => x.id === id);
  if (!p) throw new ApiError(404, "Plan not found");
  return p;
}

const slotOrder = (slot: string) => { const i = MEAL_TYPES.indexOf(slot as MealType); return i < 0 ? 9 : i; };
const slotName = (meal: MealRow) => (meal.slot === "dinner" ? DAY_NAMES[weekday(meal.date)] : `${DAY_NAMES[weekday(meal.date)]} ${meal.slot}`);

export function planMeals(plan: PlanRow): MealRow[] {
  return db().meals.filter((m) => m.plan_id === plan.id)
    .sort((a, b) => a.date.localeCompare(b.date) || slotOrder(a.slot) - slotOrder(b.slot));
}

const EXTRA_SLOTS: MealType[] = ["breakfast", "lunch"];

function checkDay(plan: PlanRow, date: string) {
  if (date < plan.week_start || date > addDays(plan.week_start, 6)) throw new ApiError(422, "That day isn't in this week");
}

/** Adds breakfast and lunch to a day. Returns whether anything was added. Doesn't commit. */
export function expandDay(plan: PlanRow, date: string): boolean {
  checkDay(plan, date);
  const have = new Set(planMeals(plan).filter((m) => m.date === date).map((m) => m.slot));
  const servings = getSetting<number>("default_servings") || 2;
  let added = false;
  for (const slot of EXTRA_SLOTS) {
    if (have.has(slot)) continue;
    db().meals.push({ id: nextId("meals"), plan_id: plan.id, date, slot, recipe_id: null, servings, status: "planned",
      locked: false, prev_last_cooked: null, pantry_used: null });
    added = true;
  }
  return added;
}

/** Takes breakfast and lunch off a day again (just dinner). Cooked ones have to be un-cooked first,
 * so the pantry stays right. Returns how many meals went. Doesn't commit. */
export function collapseDay(plan: PlanRow, date: string): number {
  checkDay(plan, date);
  const extra = planMeals(plan).filter((m) => m.date === date && m.slot !== "dinner");
  if (extra.some((m) => m.status === "cooked")) throw new ApiError(422, "Undo Mark cooked on that breakfast or lunch first");
  const gone = new Set(extra.map((m) => m.id));
  db().meals = db().meals.filter((m) => !gone.has(m.id));
  return extra.length;
}

export function getMeal(plan: PlanRow, id: number): MealRow {
  const m = db().meals.find((x) => x.id === id && x.plan_id === plan.id);
  if (!m) throw new ApiError(404, "Meal not found");
  return m;
}

/** The plan for the week containing `day`, with every day's meal slots. Returns [plan, created anything]. */
export function getOrCreatePlan(day: string): [PlanRow, boolean] {
  const start = weekStartOf(day);
  let changed = false;
  let plan = db().plans.find((p) => p.week_start === start);
  if (!plan) {
    plan = { id: nextId("plans"), week_start: start, budget: null, created_at: nowIso() };
    db().plans.push(plan);
    changed = true;
  }
  const slots = getSetting<string[]>("meal_slots") || ["dinner"];
  const servings = getSetting<number>("default_servings") || 2;
  const have = new Set(planMeals(plan).map((m) => `${m.date}|${m.slot}`));
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    for (const slot of slots) {
      if (have.has(`${date}|${slot}`)) continue;
      db().meals.push({ id: nextId("meals"), plan_id: plan.id, date, slot, recipe_id: null, servings, status: "planned",
        locked: false, prev_last_cooked: null, pantry_used: null });
      changed = true;
    }
  }
  return [plan, changed];
}

// --- what the planner knows about each recipe --------------------------------------------

export interface Info {
  recipe: RecipeRow;
  types: Set<string>; // meals it suits: breakfast | lunch | dinner
  tags: Set<string>;
  total_min: number | null;
  per_serve: number | null;
  cost_complete: boolean;
  fresh: Map<number, string>; // ingredient id -> name
  other: Map<number, string>;
  macros: Nutrition;
  group: "fav" | "new" | "other"; // mix control
  problem: string | null; // why it breaks a hard rule (dietary, dislikes, cook time, nutrition)
}

/** Which dislike an ingredient name ends with: "olives" catches "kalamata olives" but not "olive oil". */
export function dislikeHit(dislikes: string[], names: Set<string>): string | null {
  for (const d of dislikes) {
    const word = normaliseName(d);
    if (word && [...names].some((n) => n === word || n.endsWith(" " + word))) return d.trim();
  }
  return null;
}

function ruleProblem(info: Info, settings: Record<string, any>, names: Set<string>): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const tag of settings.dietary ?? []) {
    if (!info.tags.has(String(tag).toLowerCase())) return `Not tagged ${tag}`;
  }
  const disliked = dislikeHit(settings.dislikes ?? [], names);
  if (disliked) return `Contains ${disliked}`;
  const limit = settings.max_cook_min;
  if (limit && info.total_min !== null && info.total_min > limit) return `Takes ${info.total_min} min (your limit is ${limit})`;
  return limitsProblem(info.macros, settings.nutrition_limits ?? {});
}

export interface Context {
  plan: PlanRow;
  settings: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  infos: Map<number, Info>;
  usage: Map<number, string[]>; // when each recipe is eaten outside this week (other plans, last cooked)
  pantry: Map<number, number>; // ingredient id -> amount in stock
  expiring: Map<number, string>; // in stock and expiring within 3 days
  ingredients: Map<number, IngredientRow>;
}

/** Recipes that fit the hard rules, and suit this meal when one is given. */
const eligible = (ctx: Context, slot?: string) =>
  [...ctx.infos.values()].filter((i) => i.problem === null && (!slot || i.types.has(slot)));

function gap(ctx: Context, recipeId: number, day: string): number | null {
  const dates = ctx.usage.get(recipeId);
  return dates?.length ? Math.min(...dates.map((u) => Math.abs(daysBetween(u, day)))) : null;
}

function repeatOk(ctx: Context, recipeId: number, day: string): boolean {
  const g = gap(ctx, recipeId, day);
  return g === null || g >= (ctx.settings.no_repeat_days || 0);
}

const budgetOf = (ctx: Context): number | null => ctx.plan.budget ?? ctx.settings.weekly_budget ?? null;

export function buildContext(plan: PlanRow): Context {
  const settings = allSettings() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const recipes = db().recipes.filter((r) => !r.deleted);
  const tagNames = new Map(db().tags.filter((t) => !t.deleted).map((t) => [t.id, t.name.toLowerCase()]));
  const ingredients = ingredientMap();
  const weekEnd = addDays(plan.week_start, 6);
  const window = Math.max(60, (settings.no_repeat_days || 0) + 7);
  const from = addDays(plan.week_start, -window), to = addDays(weekEnd, window);

  const usage = new Map<number, string[]>();
  const use = (id: number, day: string) => { const l = usage.get(id) ?? []; l.push(day); usage.set(id, l); };
  for (const m of db().meals) {
    if (m.plan_id === plan.id || !m.recipe_id || !HAS_RECIPE.has(m.status) || m.date < from || m.date > to) continue;
    use(m.recipe_id, m.date);
  }
  for (const r of recipes) {
    if (r.last_cooked && !(plan.week_start <= r.last_cooked && r.last_cooked <= weekEnd)) use(r.id, r.last_cooked);
  }

  const infos = new Map<number, Info>();
  for (const r of recipes) {
    const costing = recipeCosting(r, ingredients, settings.default_servings || r.servings);
    const fresh = new Map<number, string>(), other = new Map<number, string>();
    for (const line of r.lines) {
      const ing = line.ingredient_id ? ingredients.get(line.ingredient_id) : undefined;
      if (!ing || ing.never_buy || ing.is_staple || line.quantity === null) continue;
      (FRESH.has(ing.category) ? fresh : other).set(ing.id, ing.name);
    }
    const info: Info = {
      recipe: r, types: new Set(mealTypes(r)), tags: new Set(r.tag_ids.map((id) => tagNames.get(id)).filter((x): x is string => !!x)),
      total_min: totalMinutes(r), per_serve: costing.per_serve, cost_complete: costing.complete,
      fresh, other, macros: recipeNutrition(r, ingredients), group: "other", problem: null,
    };
    const earlier = (usage.get(r.id) ?? []).filter((u) => u < plan.week_start);
    info.group = r.is_favourite ? "fav" : r.times_cooked === 0 && !earlier.length ? "new" : "other";
    const names = new Set(r.lines.map((l) => normaliseName(l.name)));
    for (const l of r.lines) if (l.ingredient_id && ingredients.has(l.ingredient_id)) names.add(normaliseName(ingredients.get(l.ingredient_id)!.name));
    info.problem = ruleProblem(info, settings, names);
    infos.set(r.id, info);
  }

  const st = stock(ingredients);
  const soon = expiringSoon();
  const pantry = new Map<number, number>(), expiring = new Map<number, string>();
  for (const [id, s] of st) {
    if (!hasSome(s)) continue;
    pantry.set(id, s.quantity || 1);
    if (s.earliest_expiry && s.earliest_expiry <= soon) expiring.set(id, s.earliest_expiry);
  }
  return { plan, settings, infos, usage, pantry, expiring, ingredients };
}

// --- scoring ---------------------------------------------------------------------------

/** Ingredient names this recipe shares with the week's other meals: [fresh, other]. */
function sharedWith(info: Info, week: Info[]): [string[], string[]] {
  const fresh = new Set(week.flatMap((w) => [...w.fresh.keys()]));
  const other = new Set(week.flatMap((w) => [...w.other.keys()]));
  return [[...info.fresh].filter(([i]) => fresh.has(i)).map(([, n]) => n), [...info.other].filter(([i]) => other.has(i)).map(([, n]) => n)];
}

export function mealCost(info: Info, servings: number): number | null {
  return info.per_serve !== null ? Math.round(info.per_serve * servings * 100) / 100 : null;
}

export function budgetPenalty(info: Info, servings: number, target: number | null): number {
  if (target === null) return 0;
  const cost = mealCost(info, servings);
  if (cost === null) return 0.2; // unknown cost: a little less attractive while a budget is set
  return Math.min(4, 1.5 * Math.max(0, cost / Math.max(target, 0.01) - 1));
}

function generationScore(info: Info, day: string, servings: number, week: Info[], ctx: Context, target: number | null): number {
  let s = 1;
  if (info.recipe.is_favourite) s += 0.8; // favourites appear more often
  if (info.recipe.rating) s += 0.25 * (info.recipe.rating - 3);
  const [fresh, other] = sharedWith(info, week);
  s += 0.6 * Math.min(fresh.length, 3) + 0.15 * Math.min(other.length, 3);
  s += 0.5 * Math.min([...info.fresh.keys()].filter((i) => ctx.pantry.get(i)).length, 3); // uses pantry stock
  s += 0.8 * Math.min([...info.fresh.keys(), ...info.other.keys()].filter((i) => ctx.expiring.has(i)).length, 2); // before it goes off
  const g = gap(ctx, info.recipe.id, day);
  s += 0.4 * Math.min(1, (g ?? 120) / 60); // longer since last eaten
  return s - budgetPenalty(info, servings, target);
}

/** Weighted random rather than always the top score, so regenerating gives a different week. */
function pick(rng: () => number, options: Info[], score: (i: Info) => number): Info {
  const weights = options.map((o) => Math.exp(1.5 * Math.min(score(o), 10)));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

function shuffleInPlace<T>(arr: T[], rng: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function quotaLabels(open: number, favNeed: number, newNeed: number, rng: () => number): string[] {
  while (favNeed + newNeed > open) {
    if (newNeed >= favNeed && newNeed > 0) newNeed--;
    else favNeed--;
  }
  const labels = [...Array(favNeed).fill("fav"), ...Array(newNeed).fill("new"), ...Array(open - favNeed - newNeed).fill("any")];
  shuffleInPlace(labels, rng); // spread favourites through the week instead of bunching them on Monday
  return labels;
}

// --- generation --------------------------------------------------------------------------

/** Fills every planned, unlocked meal. Locked, cooked, skipped, leftovers and eating-out nights are
 * kept. Returns notes for anything the rules couldn't satisfy. Doesn't commit. */
export function generate(plan: PlanRow, seed?: number | null): string[] {
  const ctx = buildContext(plan);
  const rng = makeRng(seed);
  const meals = planMeals(plan);
  const openMeals = meals.filter((m) => m.status === "planned" && !m.locked);
  const openIds = new Set(openMeals.map((m) => m.id));
  const kept = meals.filter((m) => !openIds.has(m.id) && HAS_RECIPE.has(m.status) && m.recipe_id && ctx.infos.has(m.recipe_id));
  const week = kept.map((m) => ctx.infos.get(m.recipe_id!)!);
  const used = new Set(week.map((i) => i.recipe.id));
  const s = ctx.settings;
  // The favourites/new-recipes-per-week mix is about dinners; breakfasts and lunches take any recipe that suits.
  const openDinners = openMeals.filter((m) => m.slot === "dinner");
  const keptDinners = kept.filter((m) => m.slot === "dinner").map((m) => ctx.infos.get(m.recipe_id!)!);
  const dinnerLabels = quotaLabels(openDinners.length,
    Math.max(0, (s.mix_favourites || 0) - keptDinners.filter((i) => i.group === "fav").length),
    Math.max(0, (s.mix_new || 0) - keptDinners.filter((i) => i.group === "new").length), rng);
  const labels = openMeals.map((m) => (m.slot === "dinner" ? dinnerLabels[openDinners.indexOf(m)] : "any"));

  const budget = budgetOf(ctx);
  let spent = kept.reduce((t, m) => t + (mealCost(ctx.infos.get(m.recipe_id!)!, m.servings) ?? 0), 0);
  const shortfall = { fav: 0, new: 0 };
  const repeats: string[] = [], empty: MealRow[] = [];
  const noRepeat = s.no_repeat_days || 0;
  const pool0 = eligible(ctx);

  openMeals.forEach((meal, n) => {
    const label = labels[n];
    const pool = pool0.filter((i) => i.types.has(meal.slot) && !used.has(i.recipe.id));
    const inGroup = label === "any" ? pool : pool.filter((i) => i.group === label);
    const target = budget ? (budget - spent) / (openMeals.length - n) : null;
    let choice: Info | null = null;
    for (const options of [inGroup.filter((i) => repeatOk(ctx, i.recipe.id, meal.date)), pool.filter((i) => repeatOk(ctx, i.recipe.id, meal.date))]) {
      if (options.length) {
        choice = pick(rng, options, (i) => generationScore(i, meal.date, meal.servings, week, ctx, target));
        break;
      }
    }
    if (!choice && pool.length) {
      // Not enough recipes outside the no-repeat window: use whichever was eaten longest ago.
      const from = inGroup.length ? inGroup : pool;
      choice = from.map((i) => ({ i, k: gap(ctx, i.recipe.id, meal.date) ?? 0, r: rng() }))
        .sort((a, b) => b.k - a.k || b.r - a.r)[0].i;
      repeats.push(`${choice.recipe.title} on ${slotName(meal)} is only ${gap(ctx, choice.recipe.id, meal.date)} days from another night it's on the menu (you asked for ${noRepeat}): there weren't enough other recipes.`);
    }
    if (choice && label !== "any" && choice.group !== label) shortfall[label as "fav" | "new"]++;
    meal.recipe_id = choice ? choice.recipe.id : null;
    if (!choice) {
      empty.push(meal);
      return;
    }
    week.push(choice);
    used.add(choice.recipe.id);
    spent += mealCost(choice, meal.servings) ?? 0;
  });

  const notes: string[] = [];
  if (shortfall.fav) {
    const slots = `${shortfall.fav} favourite slot${shortfall.fav > 1 ? "s" : ""}`;
    notes.push(!pool0.some((i) => i.group === "fav")
      ? `You haven't hearted any recipes yet, so the ${slots} used other recipes. Tap the heart on recipes you love and they'll come up more.`
      : `Not enough favourites fit your rules, so ${slots} used other recipes. Heart more recipes to fill them.`);
  }
  if (shortfall.new) {
    notes.push(`No new recipes left to try, so ${shortfall.new} slot${shortfall.new > 1 ? "s" : ""} used ones you've had before. Add or import more recipes to try.`);
  }
  notes.push(...repeats);
  // Breakfasts and lunches left empty: almost always because no recipe is switched on for that meal yet.
  for (const slot of EXTRA_SLOTS) {
    const days = empty.filter((m) => m.slot === slot).map((m) => DAY_NAMES[weekday(m.date)]);
    if (!days.length) continue;
    const suits = [...ctx.infos.values()].filter((i) => i.types.has(slot));
    notes.push(!suits.length
      ? `No recipes are switched on for ${slot} yet, so ${slot} on ${days.join(", ")} is empty. Turn on ${slot[0].toUpperCase() + slot.slice(1)} on a recipe's page.`
      : `Not enough ${slot} recipes fit your rules, so ${slot} on ${days.join(", ")} is empty. Switch more recipes on for ${slot}.`);
  }
  const emptyDinners = empty.filter((m) => m.slot === "dinner").map((m) => DAY_NAMES[weekday(m.date)]);
  if (emptyDinners.length) {
    const fit = pool0.filter((i) => i.types.has("dinner")).length;
    const counts = new Map<string, number>();
    for (const i of ctx.infos.values()) {
      if (!i.problem) continue;
      const why = RULE_REASONS.find(([prefix]) => i.problem!.includes(prefix))?.[1] ?? "break a rule";
      counts.set(why, (counts.get(why) ?? 0) + 1);
    }
    const detail = counts.size ? ` (${[...counts].map(([why, k]) => `${k} ${why}`).join(", ")})` : "";
    notes.push(ctx.infos.size === 0
      ? "Your library is empty: add or import some recipes and Generate will plan your week from them."
      : `Only ${fit} dinner recipe${fit === 1 ? "" : "s"} in your library fit${fit === 1 ? "s" : ""} all your rules, so ${emptyDinners.join(", ")} ${emptyDinners.length === 1 ? "is" : "are"} empty${detail}. Add recipes or loosen the rules in Settings.`);
  }
  const unknown = [...ctx.infos.values()].filter((i) => (i.problem ?? "").startsWith("Nutrition not known"));
  if (unknown.length) {
    const many = unknown.length > 1;
    notes.push(`${unknown.length} recipe${many ? "s were" : " was"} left out of your nutrition limits because ${many ? "their" : "its"} nutrition isn't fully known, e.g. ${unknown[0].recipe.title}. Its page shows which ingredient needs values.`);
  }
  if (budget && spent > budget) {
    notes.push(`The week comes to about $${spent.toFixed(2)}, over your $${budget.toFixed(2)} budget, even with the cheapest recipes that fit.`);
  }
  return notes;
}

// --- Replace, Shuffle --------------------------------------------------------------------

function weekExcept(ctx: Context, meals: MealRow[], meal: MealRow): [MealRow, Info][] {
  return meals.filter((m) => m.id !== meal.id && HAS_RECIPE.has(m.status) && m.recipe_id && ctx.infos.has(m.recipe_id))
    .map((m) => [m, ctx.infos.get(m.recipe_id!)!]);
}

export interface Alternative { info: Info; fit: number; notes: string[]; warning: string | null }

/** Swaps ranked by fit: similar cost and cook time to the current meal, ingredients shared with the rest
 * of the week, pantry stock, leftovers and favourites. Each comes with notes saying why. */
export function alternatives(plan: PlanRow, meal: MealRow, limit = 5,
  leftovers: Map<number, { name: string; text: string }> = new Map()): Alternative[] {
  const ctx = buildContext(plan);
  const meals = planMeals(plan);
  const current = meal.recipe_id ? ctx.infos.get(meal.recipe_id) : undefined;
  const others = weekExcept(ctx, meals, meal);
  const taken = new Set([...others.map(([, i]) => i.recipe.id), ...(current ? [current.recipe.id] : [])]);
  const week = others.map(([, i]) => i);
  const budget = budgetOf(ctx);
  const target = budget ? budget - others.reduce((t, [m, i]) => t + (mealCost(i, m.servings) ?? 0), 0) : null;

  const ranked: Alternative[] = [];
  for (const info of eligible(ctx, meal.slot)) {
    if (taken.has(info.recipe.id)) continue;
    let fit = 0;
    const notes: string[] = [];
    if (current?.per_serve != null && info.per_serve !== null) {
      const diff = info.per_serve - current.per_serve;
      fit += 1 - Math.min(1, Math.abs(diff) / Math.max(current.per_serve, 1));
      if (Math.abs(diff) >= 0.25) notes.push(`$${Math.abs(diff).toFixed(2)}/serve ${diff < 0 ? "cheaper" : "more"}`);
    }
    if (current?.total_min != null && info.total_min !== null) {
      const dt = info.total_min - current.total_min;
      fit += 0.7 * (1 - Math.min(1, Math.abs(dt) / Math.max(current.total_min, 15)));
      if (Math.abs(dt) >= 10) notes.push(`${Math.abs(dt)} min ${dt < 0 ? "quicker" : "longer"}`);
    }
    const [fresh, other] = sharedWith(info, week);
    fit += 0.5 * Math.min(fresh.length, 3) + 0.1 * Math.min(other.length, 3);
    if (fresh.length) notes.push(`Uses ${fresh.slice(0, 2).join(", ")} like other meals this week`);
    const all = new Map([...info.fresh, ...info.other]);
    const expiring = [...all].filter(([i]) => ctx.expiring.has(i)).map(([, n]) => n);
    const inStock = [...info.fresh].filter(([i, n]) => ctx.pantry.get(i) && !expiring.includes(n)).map(([, n]) => n);
    if (expiring.length) {
      fit += 0.8 * Math.min(expiring.length, 2);
      notes.push(`Uses up ${expiring.slice(0, 2).join(", ")} before it expires`);
    }
    if (inStock.length) {
      fit += 0.5 * Math.min(inStock.length, 3);
      notes.push(`Uses ${inStock.slice(0, 2).join(", ")} you already have`);
    }
    const usesUp = [...info.fresh.keys()].filter((i) => leftovers.has(i)).map((i) => leftovers.get(i)!);
    if (usesUp.length) {
      fit += 0.6 * Math.min(usesUp.length, 2);
      notes.push(`Uses up leftover ${usesUp[0].name} (${usesUp[0].text} left after shopping)`);
    }
    if (info.recipe.is_favourite) fit += 0.4;
    if (info.recipe.rating) fit += 0.15 * (info.recipe.rating - 3);
    fit -= budgetPenalty(info, meal.servings, target);
    let warning: string | null = null;
    if (!repeatOk(ctx, info.recipe.id, meal.date)) {
      fit -= 2;
      warning = `Also on the menu ${gap(ctx, info.recipe.id, meal.date)} days away`;
    }
    ranked.push({ info, fit: Math.round(fit * 1000) / 1000, notes, warning });
  }
  ranked.sort((a, b) => b.fit - a.fit || a.info.recipe.title.toLowerCase().localeCompare(b.info.recipe.title.toLowerCase()));
  return ranked.slice(0, limit);
}

/** A random alternative that fits the rules (and the no-repeat window when possible). Doesn't commit. */
export function shuffleMeal(plan: PlanRow, meal: MealRow, seed?: number | null): RecipeRow | null {
  const ctx = buildContext(plan);
  const taken = new Set(weekExcept(ctx, planMeals(plan), meal).map(([, i]) => i.recipe.id));
  if (meal.recipe_id) taken.add(meal.recipe_id);
  const pool = eligible(ctx, meal.slot).filter((i) => !taken.has(i.recipe.id));
  const fresh = pool.filter((i) => repeatOk(ctx, i.recipe.id, meal.date));
  const from = fresh.length ? fresh : pool;
  if (!from.length) return null;
  const choice = from[Math.floor(makeRng(seed)() * from.length)];
  setRecipe(meal, choice.recipe.id);
  return choice.recipe;
}

// --- edits -------------------------------------------------------------------------------

export function setRecipe(meal: MealRow, recipeId: number | null) {
  if (meal.status === "cooked" && recipeId !== meal.recipe_id) throw new ApiError(422, "Undo Mark cooked before changing this meal");
  meal.recipe_id = recipeId;
  if (recipeId && NO_RECIPE.has(meal.status)) meal.status = "planned"; // picking a recipe for a skipped night plans it again
}

/** Takes the meal's ingredients (scaled to its servings) out of the pantry, earliest expiry first.
 * Lines whose amount can't be converted, and level-only items (spices), are left alone. */
function cookFromPantry(meal: MealRow, recipe: RecipeRow) {
  const factor = recipe.servings ? meal.servings / recipe.servings : 1;
  const ings = ingredientMap();
  const used = [];
  for (const line of recipe.lines) {
    const ing = line.ingredient_id ? ings.get(line.ingredient_id) : undefined;
    if (!ing || ing.never_buy || line.quantity === null || line.optional) continue;
    const qty = lineAmount(line.quantity * factor, line.unit, ing);
    if (qty !== null) used.push(...deduct(ing, qty));
  }
  return used;
}

export function setStatus(meal: MealRow, status: MealStatus) {
  if (!STATUSES.includes(status)) throw new ApiError(422, `Unknown status ${status}`);
  if (status === meal.status) return;
  const recipe = meal.recipe_id ? db().recipes.find((r) => r.id === meal.recipe_id) : undefined;
  if (status === "cooked") {
    if (!recipe) throw new ApiError(422, "Pick a recipe before marking it cooked");
    meal.pantry_used = cookFromPantry(meal, recipe);
    meal.prev_last_cooked = recipe.last_cooked;
    recipe.times_cooked++;
    if (!recipe.last_cooked || meal.date > recipe.last_cooked) recipe.last_cooked = meal.date;
  } else if (meal.status === "cooked" && recipe) {
    recipe.times_cooked = Math.max(0, recipe.times_cooked - 1);
    recipe.last_cooked = meal.prev_last_cooked;
    meal.prev_last_cooked = null;
    putBack(meal.pantry_used); // Undo puts the ingredients back
    meal.pantry_used = null;
  }
  if (NO_RECIPE.has(status)) {
    meal.recipe_id = null;
    meal.locked = false;
  }
  meal.status = status;
}

/** Drag and drop: the two days swap meals (dropping on an empty day just moves it). Breakfast moves to
 * another breakfast, lunch to lunch, dinner to dinner. */
export function moveMeal(meal: MealRow, target: MealRow) {
  if (meal.status === "cooked" || target.status === "cooked") throw new ApiError(422, "Cooked meals stay on the day they were cooked");
  if (meal.slot !== target.slot) throw new ApiError(422, `A ${meal.slot} can only move to another day's ${meal.slot}`);
  for (const k of ["recipe_id", "servings", "status", "locked"] as const) {
    const a = meal[k], b = target[k];
    (meal as unknown as Record<string, unknown>)[k] = b;
    (target as unknown as Record<string, unknown>)[k] = a;
  }
}

/** Reuses a past week, day by day. Locked and cooked meals in this week are kept. */
export function copyWeek(plan: PlanRow, source: PlanRow): number {
  const live = new Set(db().recipes.filter((r) => !r.deleted).map((r) => r.id));
  const byDay = new Map(planMeals(source).map((m) => [`${weekday(m.date)}|${m.slot}`, m]));
  let copied = 0;
  for (const meal of planMeals(plan)) {
    const src = byDay.get(`${weekday(meal.date)}|${meal.slot}`);
    if (!src || meal.locked || meal.status === "cooked") continue;
    meal.status = src.status === "cooked" ? "planned" : src.status;
    meal.recipe_id = src.recipe_id && live.has(src.recipe_id) && HAS_RECIPE.has(meal.status) ? src.recipe_id : null;
    meal.servings = src.servings;
    if (meal.recipe_id) copied++;
  }
  return copied;
}

// --- API shape -----------------------------------------------------------------------------

export function planOut(plan: PlanRow, notes: string[] = [], elapsedMs: number | null = null) {
  const meals = planMeals(plan);
  const ingredients = ingredientMap();
  const recipes = new Map(db().recipes.filter((r) => !r.deleted).map((r) => [r.id, r]));
  let est = 0, costed = 0, withRecipe = 0;
  const outMeals = meals.map((m) => {
    const recipe = m.recipe_id ? recipes.get(m.recipe_id) : undefined;
    const costing = recipe ? recipeCosting(recipe, ingredients, m.servings) : null;
    const cost = costing?.total ?? null;
    if (recipe && HAS_RECIPE.has(m.status)) {
      withRecipe++;
      if (cost !== null) {
        est += cost;
        costed++;
      }
    }
    const macros = recipe ? macrosOut(recipeNutrition(recipe, ingredients)) : null;
    return {
      id: m.id, date: m.date, slot: m.slot, status: m.status, locked: m.locked, servings: m.servings,
      recipe: recipe ? {
        id: recipe.id, title: recipe.title, photo_path: recipe.photo_path, total_min: totalMinutes(recipe),
        is_favourite: recipe.is_favourite, rating: recipe.rating, servings: recipe.servings,
        times_cooked: recipe.times_cooked, last_cooked: recipe.last_cooked,
      } : null,
      cost, cost_per_serve: costing?.per_serve ?? null, cost_complete: !!costing?.complete, macros,
    };
  });
  // "Average dinner" on the week's summary: breakfasts and lunches would drag it down.
  const known = outMeals.filter((m) => m.slot === "dinner" && m.recipe && HAS_RECIPE.has(m.status) && m.macros?.complete).map((m) => m.macros!);
  return {
    id: plan.id, week_start: plan.week_start, status: "active", today: today(),
    meals: outMeals, est_cost: Math.round(est * 100) / 100, costed_meals: costed, planned_meals: withRecipe,
    budget: plan.budget ?? getSetting<number | null>("weekly_budget") ?? null, notes, elapsed_ms: elapsedMs,
    nutrition_rules: describeLimits(getSetting("nutrition_limits")),
    nutrition: {
      meals: known.length,
      dinners: outMeals.filter((m) => m.slot === "dinner" && m.recipe && HAS_RECIPE.has(m.status)).length,
      average: known.length ? Object.fromEntries(MACROS.map((k) => [k, Math.round(known.reduce((t, x) => t + (x[k] ?? 0), 0) / known.length)])) : null,
    },
  };
}
