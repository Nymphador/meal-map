import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { useLive } from "../live";
import { PlusIcon, TrashIcon } from "../components/Icons";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, Spinner } from "../components/ui";
import type { PantryData, PantryItem, PantryLevel, PantryLocation, StapleStatus } from "../types";

const LOCATIONS: { key: PantryLocation; label: string }[] = [
  { key: "fridge", label: "Fridge" }, { key: "freezer", label: "Freezer" }, { key: "pantry", label: "Pantry" },
];
const LEVELS: PantryLevel[] = ["have", "low", "out"];
const UNITS = ["g", "kg", "ml", "l", "each"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function expiryText(i: PantryItem) {
  if (i.days_left === null) return null;
  if (i.days_left < 0) return "expired";
  if (i.days_left === 0) return "expires today";
  if (i.days_left === 1) return "expires tomorrow";
  return `expires in ${i.days_left} days`;
}

function LevelButtons({ value, onPick }: { value: PantryLevel | null; onPick: (l: PantryLevel) => void }) {
  return (
    <div className="flex gap-1">
      {LEVELS.map((l) => (
        <button key={l} type="button" onClick={() => onPick(l)}
          className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${value === l
            ? l === "have" ? "border-brand bg-brand text-brand-ink" : l === "low" ? "border-accent bg-accent text-accent-ink" : "border-danger bg-danger text-danger-ink"
            : "border-line text-muted"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");
  const [location, setLocation] = useState<string>("");
  const [expires, setExpires] = useState("");
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    api<{ name: string }[]>("/api/ingredients?status=all").then((r) => setNames(r.map((i) => i.name))).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/pantry", {
        body: {
          name: name.trim(), quantity: qty === "" ? null : Number(qty), unit: qty === "" ? null : unit,
          level: qty === "" ? "have" : null, location: location || null, expires_on: expires || null,
        },
      });
      toast(`Added ${name.trim()}`);
      setName(""); setQty(""); setExpires("");
      onAdded();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  }

  return (
    <form onSubmit={submit} className="card mb-4 grid gap-2 p-4 sm:grid-cols-6">
      <input className="input sm:col-span-2" list="ingredient-names" placeholder="What is it? e.g. chicken thigh" value={name}
        onChange={(e) => setName(e.target.value)} required />
      <datalist id="ingredient-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="flex gap-1 sm:col-span-2">
        <input className="input" inputMode="decimal" placeholder="Amount (blank = have some)" value={qty} onChange={(e) => setQty(e.target.value)} />
        <select className="input w-24" value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNITS.map((u) => <option key={u} value={u}>{u === "l" ? "L" : u}</option>)}
        </select>
      </div>
      <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
        <option value="">Usual place</option>
        {LOCATIONS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
      </select>
      <input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Use by" title="Use by (optional)" />
      <button className="btn-primary sm:col-span-6" disabled={!name.trim()}><PlusIcon className="h-5 w-5" /> Add to pantry</button>
    </form>
  );
}

function ItemRow({ item, onSave, onDelete }: {
  item: PantryItem; onSave: (changes: Record<string, unknown>) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(item.quantity?.toString() ?? "");
  const exp = expiryText(item);
  return (
    <li className="px-3 py-2.5">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)}>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{cap(item.name)}</span>
          {exp && <span className={`ml-2 text-xs font-medium ${item.expiring ? "text-danger" : "text-muted"}`}>{exp}</span>}
        </span>
        <span className={`text-sm ${item.level === "low" ? "text-accent" : item.level === "out" ? "text-danger" : "text-muted"}`}>
          {item.amount_text ?? (item.level === "have" ? "have some" : item.level === "low" ? "running low" : "out")}
        </span>
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); onSave({ quantity: qty === "" ? null : Number(qty) }); }}>
            <input className="input w-24 py-1.5 text-sm" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Amount" />
            <span className="text-sm text-muted">{item.unit}</span>
            <button className="btn-secondary px-3 py-1.5 text-sm">Save</button>
          </form>
          <LevelButtons value={item.level} onPick={(l) => onSave({ level: l })} />
          <select className="input w-auto py-1.5 text-sm" value={item.location} onChange={(e) => onSave({ location: e.target.value })}>
            {LOCATIONS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <input className="input w-auto py-1.5 text-sm" type="date" value={item.expires_on ?? ""} aria-label="Use by"
            onChange={(e) => onSave(e.target.value ? { expires_on: e.target.value } : { clear_expiry: true })} />
          <button type="button" className="ml-auto rounded-full p-2 text-danger hover:bg-bg" aria-label="Remove" onClick={onDelete}>
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      )}
    </li>
  );
}

function Stocktake({ data, onSave, onLevelNew, onDone }: {
  data: PantryData; onSave: (i: PantryItem, c: Record<string, unknown>) => void;
  onLevelNew: (s: StapleStatus, l: PantryLevel) => void; onDone: () => void;
}) {
  const inPantry = new Set(data.items.map((i) => i.ingredient_id));
  const missing = data.staples.filter((s) => !inPantry.has(s.ingredient_id));
  return (
    <>
      <p className="mb-3 text-sm text-muted">Correct amounts quickly. For spices and sauces, have / low / out is enough. Changes save as you go.</p>
      <ul className="card divide-y divide-line">
        {[...data.items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 font-medium">{cap(i.name)}</span>
            {i.quantity !== null && (
              <span className="flex items-center gap-1">
                <input className="input w-20 py-1 text-sm" inputMode="decimal" defaultValue={i.quantity}
                  onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && v !== i.quantity) onSave(i, { quantity: v }); }} />
                <span className="w-8 text-xs text-muted">{i.unit}</span>
              </span>
            )}
            <LevelButtons value={i.level} onPick={(l) => onSave(i, { level: l })} />
          </li>
        ))}
        {missing.map((s) => (
          <li key={`s${s.ingredient_id}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 font-medium">{cap(s.name)} <span className="text-xs font-normal text-muted">staple, not recorded</span></span>
            <LevelButtons value={null} onPick={(l) => onLevelNew(s, l)} />
          </li>
        ))}
      </ul>
      <button type="button" className="btn-primary mt-4 w-full" onClick={onDone}>Finished stocktake</button>
    </>
  );
}

export default function PantryPage() {
  const toast = useToast();
  const [data, setData] = useState<PantryData | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [stocktake, setStocktake] = useState(false);

  const load = () => api<PantryData>("/api/pantry").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useLive(["pantry"], load);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner />;
  const fail = (e: unknown) => toast((e as Error).message, { error: true });

  async function save(item: PantryItem, changes: Record<string, unknown>) {
    try {
      await api(`/api/pantry/${item.id}`, { method: "PATCH", body: changes, queue: true });
      load();
    } catch (e) {
      if (e instanceof ApiError && e.queued) return toast("Offline: saved on this device, it'll sync later");
      fail(e);
    }
  }

  async function remove(item: PantryItem) {
    try {
      await api(`/api/pantry/${item.id}`, { method: "DELETE" });
      load();
      toast(`Removed ${item.name}`, { action: { label: "Undo", run: () => { api(`/api/pantry/${item.id}/restore`, { method: "POST" }).then(load).catch(fail); } } });
    } catch (e) {
      fail(e);
    }
  }

  async function levelNew(s: StapleStatus, level: PantryLevel) {
    try {
      await api("/api/pantry", { body: { ingredient_id: s.ingredient_id, level } });
      load();
    } catch (e) {
      fail(e);
    }
  }

  const lowStaples = data.staples.filter((s) => s.low);
  return (
    <>
      <PageHeader title={stocktake ? "Stocktake" : "Pantry"} actions={
        <div className="flex gap-2">
          {!stocktake && (
            <button type="button" className="btn-secondary px-3" onClick={() => setAdding(!adding)} aria-label="Add item">
              <PlusIcon className="h-5 w-5" /><span className="hidden sm:inline">Add</span>
            </button>
          )}
          <button type="button" className={stocktake ? "btn-primary px-3" : "btn-secondary px-3"} onClick={() => setStocktake(!stocktake)}>
            {stocktake ? "Done" : "Stocktake"}
          </button>
        </div>
      } />

      {stocktake ? <Stocktake data={data} onSave={save} onLevelNew={levelNew} onDone={() => setStocktake(false)} /> : (
        <>
          {adding && <AddForm onAdded={load} />}

          {data.expiring.length > 0 && (
            <section className="card mb-3 border-danger/40 p-3">
              <h2 className="mb-1 font-semibold">Use soon</h2>
              <ul className="space-y-0.5 text-sm">
                {data.expiring.map((i) => <li key={i.id}>{cap(i.name)} <span className="text-danger">{expiryText(i)}</span></li>)}
              </ul>
              <p className="mt-1 text-xs text-muted">The meal planner favours recipes that use these.</p>
            </section>
          )}

          {data.items.length === 0 && (
            <div className="card mb-3 p-6 text-center text-sm text-muted">
              Nothing recorded yet. Marking a shop done adds what you bought; you can also add things here or do a stocktake.
            </div>
          )}

          {/* Two columns of shelves on wide screens. */}
          <div className="xl:columns-2 xl:gap-4">
            {LOCATIONS.map(({ key, label }) => {
              const items = data.items.filter((i) => i.location === key).sort((a, b) => a.name.localeCompare(b.name));
              if (!items.length) return null;
              return (
                <section key={key} className="card mb-3 break-inside-avoid overflow-hidden">
                  <h2 className="border-b border-line px-3 py-2 font-semibold">{label} <span className="text-sm font-normal text-muted">{items.length}</span></h2>
                  <ul className="divide-y divide-line">
                    {items.map((i) => <ItemRow key={`${i.id}-${i.quantity}-${i.level}`} item={i} onSave={(c) => save(i, c)} onDelete={() => remove(i)} />)}
                  </ul>
                </section>
              );
            })}

            {data.staples.length > 0 && (
              <section className="card mb-3 break-inside-avoid p-3">
                <h2 className="font-semibold">Staples</h2>
                <p className="mb-2 text-xs text-muted">
                  Always kept in. One joins the <Link to="/shopping" className="text-brand">shopping list</Link> when it's below its low-stock level.
                  Mark an ingredient as a staple on its page.
                </p>
                <ul className="space-y-1 text-sm">
                  {data.staples.map((s) => (
                    <li key={s.ingredient_id} className="flex items-center gap-2">
                      <Link to={`/ingredients/${s.ingredient_id}`} className="min-w-0 flex-1 hover:text-brand">{cap(s.name)}</Link>
                      <span className={s.low ? "text-accent" : "text-muted"}>{s.stock_text}{s.low ? " · on the list" : ""}</span>
                    </li>
                  ))}
                </ul>
                {lowStaples.length > 0 && <p className="mt-2 text-xs text-muted">{lowStaples.length} running low or not recorded.</p>}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
