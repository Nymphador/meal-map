import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../data/db";
import { dispatch } from "../server";
import { budgetPenalty, dislikeHit, type Info } from "./planner";
import { saveRecipe } from "./recipes";
import { emptyDraft } from "./textImport";
import { setToday } from "./dates";
import type { RecipeRow } from "../data/schema";

type Plan = { id: number; meals: { id: number; date: string; status: string; locked: boolean; servings: number; recipe: { id: number; title: string; is_favourite: boolean; times_cooked: number; total_min: number | null; last_cooked: string | null } | null }[]; notes: string[]; planned_meals: number; elapsed_ms: number };

const api = <T = any>(method: string, path: string, body?: unknown) => dispatch(method, path, body) as Promise<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ids = (p: Plan) => p.meals.map((m) => m.recipe?.id ?? null);
const plan = (day: string) => api<Plan>("GET", `/api/plans/week/${day}`);
const generate = (p: Plan, seed = 1) => api<Plan>("POST", `/api/plans/${p.id}/generate`, { seed });
const patch = (p: Plan, i: number, body: object) => api<Plan>("PATCH", `/api/plans/${p.id}/meals/${p.meals[i].id}`, body);

function add(title: string, names: string[], extra: Partial<RecipeRow> = {}, tags: string[] = []): RecipeRow {
  const r = saveRecipe({
    ...emptyDraft(), title, servings: 2, prep_min: 10, cook_min: 20, tags: tags.map((name) => ({ name, kind: "diet" })),
    ingredients: names.map((name) => ({ quantity: 1, unit: null, name, note: null, raw_text: name, optional: false })),
  });
  Object.assign(r, extra);
  return r;
}

/** 15 recipes, 7 favourites, sharing onion and garlic. */
function library(): number[] {
  return Array.from({ length: 15 }, (_, i) => add(`Dish ${i}`, ["onion", "garlic", `veg ${i % 5}`], { is_favourite: i < 7 }).id);
}

beforeEach(() => {
  resetDb();
  setToday("2031-01-08");
});

describe("weeks and generation", () => {
  it("creates a Monday-to-Sunday week", async () => {
    const p = await plan("2031-01-08"); // a Wednesday
    expect(p.meals.map((m) => m.date)).toEqual(["2031-01-06", "2031-01-07", "2031-01-08", "2031-01-09", "2031-01-10", "2031-01-11", "2031-01-12"]);
    expect((await api<Plan>("GET", "/api/plans/current")).id).toBe(p.id);
  });

  it("fills the week with different meals, repeatably by seed", async () => {
    library();
    const p = await generate(await plan("2031-01-06"), 5);
    expect(new Set(ids(p)).size).toBe(7);
    expect(ids(p).every(Boolean)).toBe(true);
    expect(p.elapsed_ms).toBeLessThan(1000);
    expect(ids(await generate(p, 5))).toEqual(ids(p));
    const weeks = new Set<string>();
    for (let s = 0; s < 6; s++) weeks.add(ids(await generate(p, s)).join(","));
    expect(weeks.size).toBeGreaterThan(1);
  });

  it("mixes favourites and new recipes", async () => {
    library();
    const p = await generate(await plan("2031-01-06"));
    expect(p.meals.filter((m) => m.recipe!.is_favourite)).toHaveLength(5);
    expect(p.meals.filter((m) => !m.recipe!.is_favourite).every((m) => m.recipe!.times_cooked === 0)).toBe(true);
  });

  it("never breaks dietary rules, dislikes or cook time, and says why nights are empty", async () => {
    library();
    add("Veggie curry", ["chickpeas", "spinach"], {}, ["Vegetarian"]);
    add("Mushroom pasta", ["mushrooms", "pasta"], {}, ["Vegetarian"]);
    add("Slow roast", ["lamb shoulder"], { cook_min: 240 }, ["Vegetarian"]);
    await api("PUT", "/api/settings", { dietary: ["Vegetarian"], dislikes: ["Mushrooms"], max_cook_min: 60 });
    const p = await generate(await plan("2031-01-06"));
    const titles = p.meals.map((m) => m.recipe?.title).filter(Boolean);
    expect(titles).toEqual(["Veggie curry"]);
    expect(p.notes.some((n) => n.includes("all your rules") && n.includes("contain a dislike") && n.includes("take too long"))).toBe(true);
  });

  it("explains an empty library", async () => {
    const p = await generate(await plan("2031-01-06"));
    expect(p.notes.some((n) => n.includes("library is empty"))).toBe(true);
  });

  it("matches dislikes on the main word", () => {
    expect(dislikeHit(["Olives"], new Set(["kalamata olive"]))).toBe("Olives");
    expect(dislikeHit(["olives"], new Set(["olive oil"]))).toBeNull();
    expect(dislikeHit([""], new Set(["onion"]))).toBeNull();
  });

  it("doesn't repeat across weeks, until the library runs out", async () => {
    library();
    const first = await generate(await plan("2031-01-06"));
    const second = await generate(await plan("2031-01-13"));
    expect(ids(first).filter((id) => ids(second).includes(id))).toEqual([]);
    await api("PUT", "/api/settings", { no_repeat_days: 30 });
    const third = await generate(await plan("2031-01-20"));
    expect(ids(third).every(Boolean)).toBe(true);
    expect(third.notes.some((n) => n.includes("days from another night"))).toBe(true); // 15 recipes, 21 nights, 30-day window
  });

  it("keeps locked, skipped and leftover nights when regenerating", async () => {
    library();
    let p = await generate(await plan("2031-01-06"));
    const monday = p.meals[0].recipe!.id;
    p = await patch(p, 0, { locked: true });
    p = await patch(p, 1, { status: "eating_out" });
    p = await patch(p, 2, { status: "leftovers" });
    for (let s = 2; s < 6; s++) {
      p = await generate(p, s);
      expect(p.meals[0].recipe!.id).toBe(monday);
      expect(p.meals.slice(1, 3).map((m) => [m.status, m.recipe])).toEqual([["eating_out", null], ["leftovers", null]]);
    }
    expect(p.planned_meals).toBe(5);
  });

  it("generates from 200 recipes quickly", async () => {
    for (let i = 0; i < 200; i++) add(`Bulk ${i}`, [`thing ${i % 40}`, `other ${i % 13}`, "salt"], { is_favourite: i % 4 === 0 });
    const t = performance.now();
    await generate(await plan("2031-01-06"));
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe("editing the week", () => {
  it("ranks alternatives with reasons and never suggests what's planned", async () => {
    library();
    const slaw = add("Zucchini slaw", ["zucchini", "onion"]);
    const fritters = add("Zucchini fritters", ["zucchini", "garlic"]);
    let p = await generate(await plan("2031-01-06"));
    p = await patch(p, 0, { recipe_id: slaw.id });
    const alts = await api<{ recipe: { id: number }; fit: number; notes: string[] }[]>("GET", `/api/plans/${p.id}/meals/${p.meals[1].id}/alternatives?limit=20`);
    expect(alts.length).toBeGreaterThanOrEqual(5);
    expect(alts.some((a) => ids(p).includes(a.recipe.id))).toBe(false);
    expect(alts.map((a) => a.fit)).toEqual([...alts.map((a) => a.fit)].sort((a, b) => b - a));
    const f = alts.find((a) => a.recipe.id === fritters.id)!;
    expect(f.notes.some((n) => n.includes("zucchini"))).toBe(true);
  });

  it("shuffles one night and re-plans a skipped night picked from the library", async () => {
    const lib = library();
    let p = await generate(await plan("2031-01-06"));
    const before = ids(p);
    const after = ids(await api<Plan>("POST", `/api/plans/${p.id}/meals/${p.meals[3].id}/shuffle`, { seed: 2 }));
    expect(before.includes(after[3])).toBe(false);
    expect([...after.slice(0, 3), ...after.slice(4)]).toEqual([...before.slice(0, 3), ...before.slice(4)]);
    p = await patch(p, 4, { status: "skipped" });
    p = await patch(p, 4, { recipe_id: lib[0] });
    expect([p.meals[4].status, p.meals[4].recipe!.id]).toEqual(["planned", lib[0]]);
  });

  it("swaps days when a meal is moved", async () => {
    library();
    let p = await generate(await plan("2031-01-06"));
    const [mon, tue] = [p.meals[0].recipe!.id, p.meals[1].recipe!.id];
    p = await patch(p, 0, { locked: true });
    p = await api<Plan>("POST", `/api/plans/${p.id}/meals/${p.meals[0].id}/move`, { to_meal_id: p.meals[1].id });
    expect([p.meals[0].recipe!.id, p.meals[1].recipe!.id, p.meals[1].locked]).toEqual([tue, mon, true]);
  });

  it("marks cooked and undoes it exactly", async () => {
    const lib = library();
    let p = await patch(await plan("2031-01-06"), 2, { recipe_id: lib[1] });
    p = await patch(p, 2, { status: "cooked" });
    const r = db().recipes.find((x) => x.id === lib[1])!;
    expect([r.times_cooked, r.last_cooked]).toEqual([1, "2031-01-08"]);
    await expect(patch(p, 2, { recipe_id: lib[2] })).rejects.toThrow(/Undo Mark cooked/);
    await expect(api("POST", `/api/plans/${p.id}/meals/${p.meals[2].id}/move`, { to_meal_id: p.meals[3].id })).rejects.toThrow(/Cooked meals/);
    p = await patch(p, 2, { status: "planned" });
    expect([r.times_cooked, r.last_cooked, p.meals[2].recipe!.id]).toEqual([0, null, lib[1]]);
    await expect(patch(p, 5, { status: "cooked" })).rejects.toThrow(/Pick a recipe/);
  });

  it("restores the week after a generate (Undo)", async () => {
    library();
    let p = await generate(await plan("2031-01-06"), 1);
    p = await patch(p, 6, { status: "skipped" });
    const snapshot = p.meals.map((m) => ({ id: m.id, servings: m.servings, status: m.status, locked: m.locked, recipe_id: m.recipe?.id ?? null }));
    expect(ids(await generate(p, 9))).not.toEqual(ids(p));
    const restored = await api<Plan>("POST", `/api/plans/${p.id}/restore`, { meals: snapshot });
    expect(ids(restored)).toEqual(ids(p));
    expect(restored.meals[6].status).toBe("skipped");
  });

  it("lists past weeks and reuses one", async () => {
    const lib = library();
    let source = await generate(await plan("2031-01-06"));
    source = await patch(source, 5, { status: "eating_out" });
    await patch(source, 0, { status: "cooked" });
    const history = await api<{ id: number; meal_count: number }[]>("GET", "/api/plans");
    expect(history.find((h) => h.id === source.id)!.meal_count).toBe(6);
    let target = await plan("2031-03-03");
    target = await patch(target, 1, { recipe_id: lib[3], locked: true });
    const copied = await api<Plan>("POST", `/api/plans/${target.id}/copy`, { source_plan_id: source.id });
    expect(copied.meals[0].recipe!.id).toBe(source.meals[0].recipe!.id);
    expect(copied.meals[0].status).toBe("planned"); // cooked last time, planned this time
    expect(copied.meals[1].recipe!.id).toBe(lib[3]); // locked meals stay
    expect(copied.meals[5].status).toBe("eating_out");
  });
});

describe("budget", () => {
  const info = (perServe: number | null) => ({ per_serve: perServe } as unknown as Info);
  it("penalises meals over the per-meal target", () => {
    expect(budgetPenalty(info(3), 2, null)).toBe(0); // no budget set
    expect(budgetPenalty(info(3), 2, 10)).toBe(0); // $6 meal, $10 to spend
    expect(budgetPenalty(info(10), 2, 10)).toBeCloseTo(1.5); // twice the target
    expect(budgetPenalty(info(50), 2, 10)).toBe(4); // capped
    expect(budgetPenalty(info(null), 2, 10)).toBe(0.2); // unknown cost
  });
});
