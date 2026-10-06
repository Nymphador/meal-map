// The app's database: one in-memory document, saved to the phone after every change.
// Small enough (a few MB even with hundreds of recipes) that whole-document saves are quick, and
// the logic can stay simple synchronous code over arrays.
//
// Storage is plugged in by main.tsx (see storage.ts); tests use the in-memory document only.

import { emptyDb, type DbData } from "./schema";

let data: DbData = emptyDb();
let persist: ((text: string) => Promise<void>) | null = null;
let saving: Promise<void> | null = null;
let dirty = false;

export function db(): DbData {
  return data;
}

/** Loads a saved document (or starts empty) and remembers where to save. */
export function openDb(text: string | null, save: ((text: string) => Promise<void>) | null) {
  data = text ? migrate(JSON.parse(text)) : emptyDb();
  persist = save;
}

/** Tests: a fresh empty database with no saving. */
export function resetDb() {
  data = emptyDb();
  persist = null;
}

function migrate(raw: Partial<DbData>): DbData {
  // Later versions add fields here; every collection must exist even in an old or hand-edited file.
  const base = emptyDb();
  return { ...base, ...raw, next_id: { ...raw.next_id }, settings: { ...raw.settings } } as DbData;
}

export function nextId(collection: string): number {
  const used = data.next_id[collection] ?? 0;
  data.next_id[collection] = used + 1;
  return used + 1;
}

export const nowIso = () => new Date().toISOString();

// --- change notifications (pages reload what they show) ------------------------------

type Listener = (topics: string[]) => void;
const listeners = new Set<Listener>();

export function onChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Call after every change: saves the document and tells open pages which topics changed. */
export function commit(topics: string[]) {
  scheduleSave();
  listeners.forEach((fn) => fn(topics));
}

function scheduleSave() {
  if (!persist) return;
  if (saving) {
    dirty = true; // one more save once the current one finishes
    return;
  }
  const write = persist;
  saving = write(JSON.stringify(data))
    .catch((e) => console.error("Saving failed", e))
    .finally(() => {
      saving = null;
      if (dirty) {
        dirty = false;
        scheduleSave();
      }
    });
}

/** Resolves once everything changed so far is on disk (backups, tests). */
export async function flushSaves(): Promise<void> {
  while (saving) await saving;
}
