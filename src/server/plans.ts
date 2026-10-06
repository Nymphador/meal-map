import { commit, db } from "../data/db";
import type { MealStatus } from "../data/schema";
import { macrosOut } from "../logic/nutrition";
import { today } from "../logic/dates";
import { ApiError } from "../logic/errors";
import { leftoverSuggestions, planLeftovers } from "../logic/leftovers";
import {
  alternatives, collapseDay, copyWeek, expandDay, generate, getMeal, getOrCreatePlan, getPlan, HAS_RECIPE, moveMeal, planMeals,
  planOut, setRecipe, setStatus, shuffleMeal, STATUSES,
} from "../logic/planner";
import { isPremium } from "../monetise/premium";
import { int, route } from "./router";

const TOPICS = ["plans", "shopping", "recipes", "pantry"];

function weekOf(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ApiError(422, "Not a date");
  const [plan, created] = getOrCreatePlan(day);
  if (created) commit([]); // saved quietly: opening a week isn't a change anyone needs to reload for
  return plan;
}

route("GET", "/api/plans/current", () => planOut(weekOf(today())));
route("GET", "/api/plans/week/:day", ({ params }) => planOut(weekOf(params.day)));

/** Weeks that had meals planned, newest first, for Reuse a week. */
route("GET", "/api/plans", ({ query }) => {
  const limit = Math.min(200, Number(query.get("limit") ?? 30));
  const titles = new Map(db().recipes.filter((r) => !r.deleted).map((r) => [r.id, r.title]));
  return [...db().plans].sort((a, b) => b.week_start.localeCompare(a.week_start))
    .map((p) => ({ p, list: planMeals(p).filter((m) => HAS_RECIPE.has(m.status) && m.recipe_id && titles.has(m.recipe_id)).map((m) => titles.get(m.recipe_id!)!) }))
    .filter((x) => x.list.length).slice(0, limit)
    .map(({ p, list }) => ({ id: p.id, week_start: p.week_start, meal_count: list.length, titles: list }));
});

route("POST", "/api/plans/:id/generate", ({ params, body }) => {
  const started = performance.now();
  const plan = getPlan(int(params.id));
  const notes = generate(plan, body?.seed ?? null);
  commit(TOPICS);
  return planOut(plan, notes, Math.round(performance.now() - started));
});

route("PATCH", "/api/plans/:id/meals/:meal", ({ params, body }) => {
  const plan = getPlan(int(params.id));
  const meal = getMeal(plan, int(params.meal));
  if ("recipe_id" in body && body.recipe_id !== null && !db().recipes.some((r) => r.id === body.recipe_id && !r.deleted)) {
    throw new ApiError(404, "Recipe not found");
  }
  // Undo of Mark cooked sends status and recipe together; the status goes first.
  if (body.status) setStatus(meal, body.status as MealStatus);
  if ("recipe_id" in body) setRecipe(meal, body.recipe_id);
  if (body.servings !== undefined && body.servings !== null) meal.servings = Math.min(50, Math.max(1, Math.round(Number(body.servings))));
  if (body.locked !== undefined && body.locked !== null) meal.locked = !!body.locked;
  commit(TOPICS);
  return planOut(plan);
});

route("POST", "/api/plans/:id/meals/:meal/move", ({ params, body }) => {
  const plan = getPlan(int(params.id));
  const meal = getMeal(plan, int(params.meal)), target = getMeal(plan, Number(body.to_meal_id));
  if (meal.id !== target.id) moveMeal(meal, target);
  commit(TOPICS);
  return planOut(plan);
});

/** Breakfast and lunch on a day: part of Premium (the one-time purchase that also removes ads). */
route("POST", "/api/plans/:id/days/:date/expand", ({ params }) => {
  if (!isPremium()) throw new ApiError(403, "Breakfast and lunch are part of Meal Map Premium");
  const plan = getPlan(int(params.id));
  if (expandDay(plan, params.date)) commit(TOPICS);
  return planOut(plan);
});

route("POST", "/api/plans/:id/days/:date/collapse", ({ params }) => {
  const plan = getPlan(int(params.id));
  if (collapseDay(plan, params.date)) commit(TOPICS);
  return planOut(plan);
});

route("GET", "/api/plans/:id/meals/:meal/alternatives", ({ params, query }) => {
  const plan = getPlan(int(params.id));
  const meal = getMeal(plan, int(params.meal));
  let left = new Map();
  try {
    left = planLeftovers(plan);
  } catch {
    // a hint for Replace; never let it break the sheet
  }
  return alternatives(plan, meal, Math.min(20, Number(query.get("limit") ?? 5)), left).map(({ info, fit, notes, warning }) => ({
    recipe: { id: info.recipe.id, title: info.recipe.title, photo_path: info.recipe.photo_path, total_min: info.total_min,
      is_favourite: info.recipe.is_favourite, rating: info.recipe.rating, servings: info.recipe.servings,
      times_cooked: info.recipe.times_cooked, last_cooked: info.recipe.last_cooked },
    cost_per_serve: info.per_serve, cost_complete: info.cost_complete, fit, notes, warning, macros: macrosOut(info.macros),
  }));
});

route("POST", "/api/plans/:id/meals/:meal/shuffle", ({ params, body }) => {
  const plan = getPlan(int(params.id));
  const meal = getMeal(plan, int(params.meal));
  if (!shuffleMeal(plan, meal, body?.seed ?? null)) throw new ApiError(422, "No other recipes fit your rules");
  commit(TOPICS);
  return planOut(plan);
});

/** Undo for Generate, Reuse week and status changes: the meals exactly as they were. */
route("POST", "/api/plans/:id/restore", ({ params, body }) => {
  const plan = getPlan(int(params.id));
  for (const state of body.meals ?? []) {
    const meal = getMeal(plan, Number(state.id));
    if (meal.status === "cooked" || state.status === "cooked" || !STATUSES.includes(state.status)) continue; // cooked changes only via Mark cooked
    meal.recipe_id = HAS_RECIPE.has(state.status) ? state.recipe_id : null;
    meal.servings = state.servings;
    meal.status = state.status;
    meal.locked = !!state.locked;
  }
  commit(TOPICS);
  return planOut(plan);
});

route("GET", "/api/plans/:id/leftovers", ({ params }) => leftoverSuggestions(getPlan(int(params.id))));

route("POST", "/api/plans/:id/copy", ({ params, body }) => {
  const plan = getPlan(int(params.id));
  const source = getPlan(Number(body.source_plan_id));
  if (source.id === plan.id) throw new ApiError(422, "That's this week");
  copyWeek(plan, source);
  commit(TOPICS);
  return planOut(plan);
});
