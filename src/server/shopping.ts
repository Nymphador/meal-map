import { commit } from "../data/db";
import { today } from "../logic/dates";
import { ApiError } from "../logic/errors";
import { getOrCreatePlan } from "../logic/planner";
import { addExtra, buildList, completeShop, editItem, getList, getListById, reopenShop } from "../logic/shopping";
import { int, route } from "./router";

const TOPICS = ["shopping", "pantry", "ingredients", "plans", "recipes"];

function listFor(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ApiError(422, "Not a date");
  const [plan, createdPlan] = getOrCreatePlan(day);
  const [lst, createdList] = getList(plan);
  if (createdPlan || createdList) commit([]);
  return buildList(plan, lst);
}

route("GET", "/api/shopping/current", () => listFor(today()));
route("GET", "/api/shopping/week/:day", ({ params }) => listFor(params.day));

const EDITABLE = ["removed", "ticked", "qty_needed", "actual_price"] as const;

route("PATCH", "/api/shopping/:id/items/:key", ({ params, body }) => {
  const [lst, plan] = getListById(int(params.id));
  const changes = Object.fromEntries(EDITABLE.filter((k) => k in body).map((k) => [k, body[k]]));
  for (const k of ["qty_needed", "actual_price"] as const) {
    if (changes[k] !== undefined && changes[k] !== null) {
      const n = Number(changes[k]);
      if (!Number.isFinite(n) || n < 0) throw new ApiError(422, "Amounts and prices can't be negative");
      changes[k] = n;
    }
  }
  if (lst.status === "done" && Object.keys(changes).some((k) => k !== "actual_price")) {
    throw new ApiError(422, "This shop is done. Reopen it to change the list.");
  }
  editItem(lst, params.key, changes);
  commit(["shopping"]);
  return buildList(plan, lst);
});

route("POST", "/api/shopping/:id/extras", ({ params, body }) => {
  const [lst, plan] = getListById(int(params.id));
  if (lst.status === "done") throw new ApiError(422, "This shop is done. Reopen it to change the list.");
  const name = String(body.name ?? "").trim();
  if (!name) throw new ApiError(422, "Say what to add");
  addExtra(lst, name.slice(0, 120), body.quantity ?? null, body.unit ?? null);
  commit(["shopping"]);
  return buildList(plan, lst);
});

/** Ticked items (or everything) go into the pantry; prices paid update the ingredients' prices. */
route("POST", "/api/shopping/:id/done", ({ params, body }) => {
  const [lst, plan] = getListById(int(params.id));
  if (lst.status === "done") throw new ApiError(422, "Already marked done");
  const result = completeShop(plan, lst, !!body?.everything);
  commit(TOPICS);
  return { ...buildList(plan, lst), result };
});

/** Undo for Mark shop done. */
route("POST", "/api/shopping/:id/reopen", ({ params }) => {
  const [lst, plan] = getListById(int(params.id));
  if (lst.status !== "done") throw new ApiError(422, "This shop isn't done");
  reopenShop(lst);
  commit(TOPICS);
  return buildList(plan, lst);
});
