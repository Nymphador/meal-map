import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, writeCache } from "../api";
import { useLive } from "../live";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from "../components/Icons";
import { useToast } from "../components/Toast";
import { ErrorBox, PageHeader, Sheet, Spinner } from "../components/ui";
import { addDays, isoDay, money, parseDay, shortDate, STORE_DOT, STORE_NAMES, STORES, unitPrice, weekRange } from "../format";
import type { PantryData, ShoppingData, ShopLine, Store } from "../types";

const CATEGORY_ORDER = ["produce", "meat", "seafood", "dairy", "bakery", "pantry", "frozen", "other"];
const CATEGORY_LABEL: Record<string, string> = {
  produce: "Fruit & veg", meat: "Meat", seafood: "Seafood", dairy: "Dairy & eggs", bakery: "Bakery",
  pantry: "Pantry", frozen: "Frozen", other: "Other",
};

function weekStartOf(iso: string): string {
  return addDays(iso, -((parseDay(iso).getDay() + 6) % 7));
}

function Totals({ data }: { data: ShoppingData }) {
  const { totals, recommendation: rec, spend } = data;
  const tile = (label: string, value: number, note: string | null, on: boolean, dot?: string) => (
    <div className={`rounded-xl border px-3 py-2 ${on ? "border-brand bg-brand-soft" : "border-line"}`}>
      <p className="flex items-center gap-1.5 text-xs text-muted">{dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}{label}</p>
      <p className="text-lg font-bold">{money(value)}</p>
      {note && <p className="text-[11px] text-muted">{note}</p>}
    </div>
  );
  const missing = (n: number) => (n ? `${n} item${n > 1 ? "s" : ""} not priced` : null);
  return (
    <section className="card mb-3 p-4">
      <div className="grid grid-cols-3 gap-2">
        {tile("All Woolworths", totals.woolworths.total, missing(totals.woolworths.missing), rec.mode === "woolworths", STORE_DOT.woolworths)}
        {tile("All Coles", totals.coles.total, missing(totals.coles.missing), rec.mode === "coles", STORE_DOT.coles)}
        {tile("Best split", totals.split, null, rec.mode === "split")}
      </div>
      <p className="mt-2 text-sm">{rec.text}</p>
      {data.budget ? (
        <p className={`mt-1 text-sm ${spend.total > data.budget ? "text-danger" : ""}`}>
          Budget {money(data.budget)}: {spend.total > data.budget
            ? `${money(spend.total - data.budget)} over`
            : `${money(data.budget - spend.total)} to spare`}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted">
        Your list: {money(spend.total)}
        {spend.woolworths > 0 && spend.coles > 0 && ` (Woolworths ${money(spend.woolworths)} + Coles ${money(spend.coles)})`}
        {spend.unpriced > 0 && ` · ${spend.unpriced} without a price`}
      </p>
    </section>
  );
}

function StoreChoice({ line, onPick }: { line: ShopLine; onPick: (s: Store | null) => void }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {STORES.map((s) => {
        const sp = line.stores[s];
        const on = line.chosen_store === s;
        return (
          <button key={s} type="button" disabled={!sp || sp.cost === null}
            onClick={() => onPick(on && line.store_overridden ? null : s)}
            className={`rounded-xl border p-2 text-left text-xs transition disabled:opacity-40 ${on ? "border-brand bg-brand-soft" : "border-line hover:bg-bg"}`}>
            <p className="flex items-center gap-1.5 font-semibold">
              <span className={`h-2 w-2 rounded-full ${STORE_DOT[s]}`} />{STORE_NAMES[s]}
              <span className="ml-auto">{sp?.cost != null ? money(sp.cost) : "—"}</span>
            </p>
            {sp?.buy_text ? <p className="mt-0.5 line-clamp-2 text-muted">{sp.buy_text}</p>
              : <p className="mt-0.5 text-muted">{sp?.problem ?? "Not matched yet"}</p>}
            {sp?.unit_price != null && <p className="text-muted">{unitPrice(sp.unit_price, sp.unit_measure)}</p>}
            {sp?.special && <p className="font-medium text-accent">{sp.special}</p>}
            {sp?.out_of_stock && <p className="text-danger">Out of stock online</p>}
            {sp?.stale && <p className="text-accent">Price from {shortDate(sp.price_date) || "a while ago"}: may be out of date</p>}
            {line.cheaper === s && <p className="font-semibold text-brand">Cheaper</p>}
          </button>
        );
      })}
    </div>
  );
}

function Line({ line, shopping, done, onChange, onHave }: {
  line: ShopLine; shopping: boolean; done: boolean;
  onChange: (changes: Record<string, unknown>) => void; onHave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [paid, setPaid] = useState(line.actual_price?.toString() ?? "");
  const sp = line.chosen_store ? line.stores[line.chosen_store] : undefined;
  const big = shopping && !done;

  return (
    <li className={`px-3 py-2.5 ${line.ticked && !done ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <button type="button" aria-pressed={line.ticked} disabled={done} aria-label={line.ticked ? "Untick" : "Tick"}
          onClick={() => onChange({ ticked: !line.ticked })}
          className={`mt-0.5 flex shrink-0 items-center justify-center rounded-lg border-2 transition ${big ? "h-8 w-8" : "h-6 w-6"} ${
            line.ticked ? "border-brand bg-brand text-brand-ink" : "border-line"}`}>
          {line.ticked && <CheckIcon className={big ? "h-5 w-5" : "h-4 w-4"} />}
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !shopping && !done && setOpen(!open)}>
          <p className={`font-semibold leading-snug ${line.ticked ? "line-through" : ""} ${big ? "text-lg" : ""}`}>
            {line.name.charAt(0).toUpperCase() + line.name.slice(1)}
            <span className="ml-2 font-normal text-muted">{line.needed_text}</span>
          </p>
          <p className="text-sm text-muted">
            {sp?.buy_text ?? (line.ingredient_id ? "No price yet" : "Extra")}
            {line.in_stock && ` · have ${line.in_stock}`}
          </p>
          {sp?.leftover_text && !shopping && <p className="text-xs text-muted">{sp.leftover_text} left over goes to the pantry</p>}
          {line.source.includes("staple") && !shopping && <p className="text-xs text-accent">Staple running low</p>}
          {line.unconverted.length > 0 && !shopping && (
            <p className="text-xs text-accent">Not counted: {line.unconverted.join("; ")}</p>
          )}
        </button>
        <div className="shrink-0 text-right">
          <p className={`font-semibold ${big ? "text-lg" : ""}`}>{line.est_price != null ? money(line.est_price) : ""}</p>
          {line.store_overridden && !shopping && <p className="text-[11px] text-muted">your pick</p>}
        </div>
      </div>

      {line.unknown_stock && !shopping && !done && (
        <div className="ml-9 mt-1.5 flex items-center gap-2 text-xs">
          <span className="text-muted">Staple not in your pantry yet.</span>
          <button type="button" className="font-semibold text-brand" onClick={onHave}>I have it</button>
        </div>
      )}

      {shopping && line.ticked && !done && (
        <label className="ml-11 mt-2 flex items-center gap-2 text-sm">
          <span className="text-muted">Paid $</span>
          <input className="input w-28 py-1.5" inputMode="decimal" value={paid} placeholder={line.est_price?.toFixed(2) ?? ""}
            onChange={(e) => setPaid(e.target.value)}
            onBlur={() => onChange({ actual_price: paid === "" ? null : Number(paid) })} />
        </label>
      )}

      {open && !shopping && !done && (
        <div className="ml-9 mt-2 space-y-2">
          {line.ingredient_id && <StoreChoice line={line} onPick={(s) => onChange({ chosen_store: s })} />}
          {line.meals.length > 0 && <p className="text-xs text-muted">For {line.meals.join(", ")}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {line.unit && (
              <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (qty) onChange({ qty_needed: Number(qty) }); setQty(""); }}>
                <input className="input w-24 py-1.5 text-sm" inputMode="decimal" placeholder={line.needed?.toFixed(0) ?? "Amount"}
                  value={qty} onChange={(e) => setQty(e.target.value)} />
                <span className="text-sm text-muted">{line.unit}</span>
                <button className="btn-secondary px-3 py-1.5 text-sm" disabled={!qty}>Set</button>
              </form>
            )}
            {line.qty_overridden && line.source !== "manual" && (
              <button type="button" className="text-sm font-semibold text-brand" onClick={() => onChange({ qty_needed: null })}>Use the worked-out amount</button>
            )}
            {line.ingredient_id && (
              <button type="button" className="text-sm font-semibold text-brand" onClick={onHave}>I have this</button>
            )}
            <button type="button" className="ml-auto text-sm font-semibold text-danger" onClick={() => onChange({ removed: true })}>Remove</button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function ShoppingPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const week = params.get("week");
  const [data, setData] = useState<ShoppingData | null>(null);
  const [expiring, setExpiring] = useState<PantryData["expiring"]>([]);
  const [error, setError] = useState("");
  const [shopping, setShopping] = useState(false);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareText, setShareText] = useState<string | null>(null);

  const listPath = week ? `/api/shopping/week/${week}` : "/api/shopping/current";
  function load() {
    setError("");
    api<ShoppingData>(listPath).then(setData).catch((e) => setError(e.message));
  }
  useLive(["shopping"], load);
  useEffect(() => {
    load();
    api<PantryData>("/api/pantry").then((p) => setExpiring(p.expiring)).catch(() => {});
  }, [week]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner label="Working out the list…" />;
  const d = data;
  const done = d.list.status === "done";
  const fail = (e: unknown) => toast((e as Error).message, { error: true });

  async function change(line: ShopLine, changes: Record<string, unknown>) {
    // Ticks feel instant; everything else waits for the recalculated list.
    const local = Object.keys(changes).every((k) => k === "ticked" || k === "actual_price");
    const optimistic = local ? { ...d, items: d.items.map((l) => (l.key === line.key ? { ...l, ...changes } as ShopLine : l)) } : d;
    if (local) setData(optimistic);
    try {
      // Ticks and prices paid are safe to send later: offline, they wait on the phone.
      const next = await api<ShoppingData>(`/api/shopping/${d.list.id}/items/${encodeURIComponent(line.key)}`,
        { method: "PATCH", body: changes, queue: local });
      setData(next);
      if (changes.removed) {
        toast(`Removed ${line.name}`, { action: { label: "Undo", run: () => { change(line, { removed: false }); } } });
      }
    } catch (e) {
      if (e instanceof ApiError && e.queued) {
        writeCache(listPath, optimistic); // so the ticks survive the app being closed before it syncs
        return;
      }
      fail(e);
      load();
    }
  }

  async function addExtra(e: React.FormEvent) {
    e.preventDefault();
    if (!extra.trim()) return;
    try {
      setData(await api<ShoppingData>(`/api/shopping/${d.list.id}/extras`, { body: { name: extra.trim() } }));
      setExtra("");
    } catch (err) {
      fail(err);
    }
  }

  async function have(line: ShopLine) {
    try {
      await api("/api/pantry", { body: { ingredient_id: line.ingredient_id, level: "have" } });
      toast(`Noted: you have ${line.name}`);
      load();
    } catch (e) {
      fail(e);
    }
  }

  async function finish() {
    const ticked = d.items.filter((l) => l.ticked).length;
    if (!ticked && !window.confirm("Nothing is ticked. Add the whole list to the pantry as bought?")) return;
    setBusy(true);
    try {
      const next = await api<ShoppingData>(`/api/shopping/${d.list.id}/done`, { body: { everything: !ticked } });
      setData(next);
      setShopping(false);
      const added = next.result?.added ?? 0;
      toast(`Shop done: ${added} item${added === 1 ? "" : "s"} added to the pantry`, {
        action: { label: "Undo", run: () => { api<ShoppingData>(`/api/shopping/${d.list.id}/reopen`, { method: "POST" }).then(setData).catch(fail); } },
      });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  /** The list as plain text for Notes, a message to your partner, etc. Unticked items only. */
  function listText(): string {
    const out = [`Shopping list, week of ${weekRange(d.list.week_start)}`];
    for (const { store, lines } of groups) {
      const todo = sortLines(lines).filter((l) => !l.ticked);
      if (!todo.length) continue;
      const total = todo.reduce((t, l) => t + (l.est_price ?? 0), 0);
      out.push("", store ? `${STORE_NAMES[store].toUpperCase()} (about ${money(total)})` : "OTHER");
      let cat = "";
      for (const l of todo) {
        if (store && l.category !== cat) {
          cat = l.category;
          out.push(`${CATEGORY_LABEL[cat] ?? cat}:`);
        }
        const sp = l.chosen_store ? l.stores[l.chosen_store] : undefined;
        const what = sp?.packs.length ? sp.packs.map((p) => `${p.count} x ${p.name}`).join(" + ") : l.needed_text;
        out.push(`- ${l.name.charAt(0).toUpperCase() + l.name.slice(1)}: ${what}${l.est_price != null ? ` (${money(l.est_price)})` : ""}`);
      }
    }
    return out.join("\n");
  }

  async function share() {
    const text = listText();
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string }) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "Shopping list", text });
        return;
      } catch {
        // cancelled, or not allowed here: fall back to copying
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Shopping list copied");
    } catch {
      setShareText(text); // no clipboard on plain http: show it to copy by hand
    }
  }

  async function reopen() {
    try {
      setData(await api<ShoppingData>(`/api/shopping/${d.list.id}/reopen`, { method: "POST" }));
      toast("Reopened: what the shop added to the pantry was taken back out");
    } catch (e) {
      fail(e);
    }
  }

  // Group by store (the one you'll buy from), then aisle; ticked items sink to the bottom while shopping.
  const groups: { store: Store | null; lines: ShopLine[] }[] = [];
  for (const store of [...STORES, null] as (Store | null)[]) {
    const lines = d.items.filter((l) => l.chosen_store === store);
    if (lines.length) groups.push({ store, lines });
  }
  const sortLines = (lines: ShopLine[]) => [...lines].sort((a, b) =>
    (shopping ? Number(a.ticked) - Number(b.ticked) : 0) ||
    CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name));
  const thisWeek = weekStartOf(isoDay(new Date()));
  const isCurrent = d.list.week_start === thisWeek;
  const tickedCount = d.items.filter((l) => l.ticked).length;

  const setAside = (
    <>
      {d.removed.length > 0 && (
        <details className="card mt-3 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Removed ({d.removed.length})</summary>
          <ul className="mt-2 space-y-1">
            {d.removed.map((l) => (
              <li key={l.key} className="flex items-center gap-2">
                <span className="flex-1">{l.name} <span className="text-muted">{l.needed_text}</span></span>
                {!done && <button type="button" className="font-semibold text-brand" onClick={() => change(l, { removed: false })}>Put back</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.covered.length > 0 && (
        <details className="card mt-3 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Already in the pantry ({d.covered.length})</summary>
          <ul className="mt-2 space-y-1 text-muted">
            {d.covered.map((c) => <li key={c.ingredient_id}>{c.name}: need {c.needed}, have {c.in_stock}</li>)}
          </ul>
        </details>
      )}
    </>
  );

  return (
    <>
      <PageHeader title={shopping ? "Shopping" : "Shopping list"}
        actions={d.items.length > 0 && (
          <div className="flex gap-2">
            {!shopping && <button type="button" className="btn-secondary px-3" onClick={share} title="Share or copy the list">Share</button>}
            {!done && (
              <button type="button" className={shopping ? "btn-secondary px-3" : "btn-primary px-3"} onClick={() => setShopping(!shopping)}>
                {shopping ? "Edit list" : "Start shopping"}
              </button>
            )}
          </div>
        )} />

      {!shopping && (
        <div className="mb-3 flex items-center gap-2">
          <button type="button" className="rounded-full p-2 text-muted hover:bg-card" aria-label="Previous week"
            onClick={() => setParams({ week: addDays(d.list.week_start, -7) })}><ChevronLeftIcon className="h-5 w-5" /></button>
          <p className="min-w-0 flex-1 text-center font-semibold">Week of {weekRange(d.list.week_start)}</p>
          <button type="button" className="rounded-full p-2 text-muted hover:bg-card" aria-label="Next week"
            onClick={() => setParams({ week: addDays(d.list.week_start, 7) })}><ChevronRightIcon className="h-5 w-5" /></button>
          {!isCurrent && <button type="button" className="chip" onClick={() => setParams({})}>This week</button>}
        </div>
      )}

      {/* Wide screens: the list on the left, totals and the rest in a column on the right. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start xl:gap-4">
      <aside className="xl:col-start-2 xl:row-start-1">
      {done && (
        <section className="card mb-3 flex flex-wrap items-center gap-3 border-brand/50 p-4">
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">Shop done.</span> What you bought is in the pantry, leftovers included.
          </p>
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={reopen}>Reopen</button>
        </section>
      )}

      {expiring.length > 0 && !shopping && (
        <section className="card mb-3 border-accent/50 p-3 text-sm">
          <span className="font-semibold">Use soon: </span>
          {expiring.slice(0, 4).map((i) => `${i.name} (${i.days_left !== null && i.days_left < 0 ? "expired" : i.days_left === 0 ? "today" : `${i.days_left}d`})`).join(", ")}
          {" · "}<Link to="/pantry" className="text-brand">Pantry</Link>
        </section>
      )}

      {d.items.length === 0 && !done ? (
        <div className="card p-6 text-center text-sm text-muted">
          Nothing to buy for this week. Plan some dinners on <Link to={`/?week=${d.list.week_start}`} className="text-brand">This week</Link>,
          or add an extra below.
        </div>
      ) : !shopping && <Totals data={d} />}

      {!done && !shopping && (
        <form onSubmit={addExtra} className="mb-3 flex gap-2">
          <input className="input" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Add an item, e.g. toilet paper or milk" />
          <button className="btn-secondary px-3" disabled={!extra.trim()} aria-label="Add"><PlusIcon className="h-5 w-5" /></button>
        </form>
      )}
      {!shopping && <div className="hidden xl:block">{setAside}</div>}
      </aside>

      <div className="min-w-0 xl:col-start-1 xl:row-start-1">

      <div className="space-y-3">
        {groups.map(({ store, lines }) => {
          const cats = shopping ? [null] : CATEGORY_ORDER.filter((c) => lines.some((l) => l.category === c));
          return (
            <section key={store ?? "none"} className="card overflow-hidden">
              <h2 className="flex items-center gap-2 border-b border-line px-3 py-2 font-semibold">
                {store && <span className={`h-2.5 w-2.5 rounded-full ${STORE_DOT[store]}`} />}
                {store ? STORE_NAMES[store] : "No price yet / extras"}
                <span className="ml-auto text-sm font-normal text-muted">
                  {store && money(lines.reduce((t, l) => t + (l.est_price ?? 0), 0))} · {lines.filter((l) => l.ticked).length}/{lines.length}
                </span>
              </h2>
              {cats.map((cat) => (
                <div key={cat ?? "all"}>
                  {cat && <p className="bg-bg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted">{CATEGORY_LABEL[cat] ?? cat}</p>}
                  <ul className="divide-y divide-line">
                    {sortLines(cat ? lines.filter((l) => l.category === cat) : lines).map((l) => (
                      <Line key={l.key} line={l} shopping={shopping} done={done} onChange={(c) => change(l, c)} onHave={() => have(l)} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {shopping && !done && (
        <button type="button" className="btn-primary mt-4 w-full py-3 text-base" disabled={busy} onClick={finish}>
          <CheckIcon className="h-5 w-5" /> {busy ? "Saving…" : `Mark shop done (${tickedCount}/${d.items.length} ticked)`}
        </button>
      )}
      </div>
      </div>

      {!shopping && <div className="xl:hidden">{setAside}</div>}
      {shareText && (
        <Sheet title={<p className="font-semibold">Copy the list</p>} onClose={() => setShareText(null)}>
          <textarea className="input min-h-[50vh] font-mono text-xs" readOnly value={shareText} onFocus={(e) => e.target.select()} />
          <p className="mt-2 text-xs text-muted">Tap the text, select all, and copy.</p>
        </Sheet>
      )}

      {!shopping && d.unlinked.length > 0 && (
        <p className="mt-3 flex items-center gap-1 text-xs text-muted"><CloseIcon className="h-4 w-4" /> Not on the list (no ingredient linked): {d.unlinked.join(", ")}</p>
      )}
    </>
  );
}
