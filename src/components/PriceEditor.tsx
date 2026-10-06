// "$ [4.50] for [1] [kg]": what you pay for an ingredient. Recipe costs, weekly estimates and
// shopping totals all add up from these.
import { useState } from "react";
import { api } from "../api";
import type { IngredientDetail, PriceUnit } from "../types";
import { useToast } from "./Toast";

const UNITS: [PriceUnit, string][] = [["g", "g"], ["kg", "kg"], ["ml", "ml"], ["l", "L"], ["each", "items"]];
const DEFAULT_UNIT: Record<string, PriceUnit> = { g: "kg", ml: "l", each: "each" };

type Priceable = { id: number; price: number | null; price_amount: number | null; price_unit: PriceUnit | null; default_unit: string };

export default function PriceEditor({ ingredient, onSaved, compact = false }: {
  ingredient: Priceable; onSaved?: (d: IngredientDetail) => void; compact?: boolean;
}) {
  const toast = useToast();
  const [price, setPrice] = useState(ingredient.price?.toString() ?? "");
  const [amount, setAmount] = useState(ingredient.price_amount?.toString() ?? "1");
  const [unit, setUnit] = useState<PriceUnit>(ingredient.price_unit ?? DEFAULT_UNIT[ingredient.default_unit] ?? "kg");
  const [busy, setBusy] = useState(false);

  const dirty = price !== (ingredient.price?.toString() ?? "") || amount !== (ingredient.price_amount?.toString() ?? "1")
    || unit !== (ingredient.price_unit ?? DEFAULT_UNIT[ingredient.default_unit] ?? "kg");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api<IngredientDetail>(`/api/ingredients/${ingredient.id}/price`, {
        method: "PATCH", body: price.trim() === "" ? { price: null } : { price: Number(price), price_amount: Number(amount), price_unit: unit },
      });
      onSaved?.(d);
      toast(price.trim() === "" ? "Price removed" : "Price saved");
    } catch (err) {
      toast((err as Error).message, { error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input className={`input pl-6 ${compact ? "w-[4.5rem] py-1.5" : "w-24"}`} inputMode="decimal" value={price} placeholder="0.00"
          aria-label="Price" onChange={(e) => setPrice(e.target.value)} />
      </div>
      <span className="text-sm text-muted">for</span>
      <input className={`input ${compact ? "w-14 py-1.5" : "w-20"}`} inputMode="decimal" value={amount} aria-label="Amount"
        onChange={(e) => setAmount(e.target.value)} />
      <select className={`input w-auto ${compact ? "py-1.5" : ""}`} value={unit} aria-label="Unit" onChange={(e) => setUnit(e.target.value as PriceUnit)}>
        {UNITS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      <button className={`btn-primary ${compact ? "px-3 py-1.5 text-sm" : "px-4"}`} disabled={busy || !dirty}>Save</button>
    </form>
  );
}
