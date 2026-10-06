import { commit, db } from "../data/db";
import type { IngredientRow, PantryRow } from "../data/schema";
import { fmtAmount } from "../logic/amounts";
import { baseUnit, ConversionError, toUnit } from "../logic/conversions";
import { daysBetween, today } from "../logic/dates";
import { ApiError } from "../logic/errors";
import { createIngredient, getIngredient, ingredientMap, resolveIngredientId } from "../logic/ingredients";
import { guessCategory, guessDefaultUnit } from "../logic/names";
import { addStock, emptyStock, EXPIRY_ALERT_DAYS, inBase, LEVELS, liveRows, LOCATIONS, stock } from "../logic/pantry";
import { int, route } from "./router";

const TOPICS = ["pantry", "shopping", "plans"];

function out(row: PantryRow, ing: IngredientRow) {
  const days = row.expires_on ? daysBetween(today(), row.expires_on) : null;
  const amount = inBase(row, ing);
  return {
    id: row.id, ingredient_id: ing.id, name: ing.name, category: ing.category, quantity: row.quantity, unit: row.unit,
    amount_text: amount !== null ? fmtAmount(amount, baseUnit(ing)) : null, level: row.level, location: row.location,
    purchased_on: row.purchased_on, expires_on: row.expires_on, days_left: days,
    expiring: days !== null && days <= EXPIRY_ALERT_DAYS, is_staple: ing.is_staple, low_threshold: ing.low_threshold,
  };
}

function check(level: unknown, location: unknown) {
  if (level && !LEVELS.includes(level as never)) throw new ApiError(422, "Level must be have, low or out");
  if (location && !LOCATIONS.includes(location as never)) throw new ApiError(422, "Location must be pantry, fridge or freezer");
}

function getRow(id: string): PantryRow {
  const row = db().pantry.find((r) => r.id === int(id) && !r.deleted);
  if (!row) throw new ApiError(404, "Not in the pantry");
  return row;
}

const conversion = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ConversionError) throw new ApiError(422, e.message);
    throw e;
  }
};

/** Everything in stock, plus every staple (with whether it's running low). */
route("GET", "/api/pantry", () => {
  const ings = ingredientMap();
  const items = liveRows().filter((r) => ings.has(r.ingredient_id)).map((r) => out(r, ings.get(r.ingredient_id)!))
    .sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999) || a.name.localeCompare(b.name));
  const staples = db().ingredients.filter((i) => i.is_staple && !i.deleted).sort((a, b) => a.name.localeCompare(b.name));
  const st = stock(new Map(staples.map((i) => [i.id, i])));
  return {
    items, today: today(), expiring: items.filter((i) => i.expiring),
    staples: staples.map((ing) => {
      const s = st.get(ing.id) ?? emptyStock(ing);
      const low = ((s.level === "low" || s.level === "out") && s.quantity <= 0) || s.rows === 0 || (s.level === null && s.quantity < (ing.low_threshold ?? 0));
      return {
        ingredient_id: ing.id, name: ing.name, low_threshold: ing.low_threshold, unit: baseUnit(ing), low, known: s.rows > 0,
        stock_text: s.quantity > 0 ? fmtAmount(s.quantity, baseUnit(ing))
          : ({ have: "have some", low: "running low", out: "out" } as Record<string, string>)[s.level ?? ""] ?? "none recorded",
      };
    }),
  };
});

route("POST", "/api/pantry", ({ body }) => {
  check(body.level, body.location);
  let ing: IngredientRow | undefined;
  if (body.ingredient_id) ing = getIngredient(Number(body.ingredient_id));
  else if (String(body.name ?? "").trim()) {
    const id = resolveIngredientId(body.name);
    ing = id ? getIngredient(id) : createIngredient(body.name, guessCategory(body.name), guessDefaultUnit(body.unit));
  } else throw new ApiError(422, "Say what it is");
  if (!ing) throw new ApiError(404, "Ingredient not found");
  const quantity = body.quantity === null || body.quantity === undefined || body.quantity === "" ? null : Number(body.quantity);
  let row!: PantryRow;
  conversion(() => {
    row = addStock(ing!, quantity, body.unit ?? null, {
      location: body.location, expires_on: body.expires_on || null, purchased_on: today(), level: quantity === null ? body.level : null,
    });
  });
  commit([...TOPICS, "ingredients"]);
  return out(row, ing);
});

route("PATCH", "/api/pantry/:id", ({ params, body }) => {
  const row = getRow(params.id);
  check(body.level, body.location);
  const ing = getIngredient(row.ingredient_id)!;
  if ("quantity" in body) {
    if (body.quantity === null) {
      row.quantity = null;
      row.level = body.level || row.level || "have";
    } else {
      conversion(() => {
        const q = Number(body.quantity);
        row.quantity = (body.unit || row.unit) === row.unit ? q : toUnit(q, body.unit, baseUnit(ing), ing);
      });
      if (body.unit) row.unit = baseUnit(ing);
      row.level = null;
    }
  } else if (body.level) {
    row.quantity = null; // switching to level tracking ("have / low / out")
    row.level = body.level;
  }
  if (body.location) row.location = body.location;
  if (body.expires_on) row.expires_on = body.expires_on;
  if (body.clear_expiry) row.expires_on = null;
  commit(TOPICS);
  return out(row, ing);
});

route("DELETE", "/api/pantry/:id", ({ params }) => {
  getRow(params.id).deleted = true; // kept so Undo can bring it back
  commit(TOPICS);
});

route("POST", "/api/pantry/:id/restore", ({ params }) => {
  const row = db().pantry.find((r) => r.id === int(params.id));
  if (!row) throw new ApiError(404, "Not in the pantry");
  row.deleted = false;
  commit(TOPICS);
  return out(row, getIngredient(row.ingredient_id)!);
});
