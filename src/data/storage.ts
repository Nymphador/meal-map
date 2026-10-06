// Where the data physically lives. On the phone: data.json and a photos folder in the app's private
// storage (Android's automatic backup copies both to the user's Google Drive). In a desktop browser
// (development): IndexedDB.
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

export const native = Capacitor.isNativePlatform();

const DATA_FILE = "data.json";
const PHOTO_DIR = "photos";

// --- browser: a tiny IndexedDB key/value store ----------------------------------------

let idbPromise: Promise<IDBDatabase> | null = null;

function idb(): Promise<IDBDatabase> {
  idbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("meal-planner", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

async function idbRun<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction("kv", mode).objectStore("kv"));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

// --- the data document ---------------------------------------------------------------

export async function readData(): Promise<string | null> {
  if (!native) return (await idbRun<string | undefined>("readonly", (s) => s.get(DATA_FILE))) ?? null;
  try {
    const r = await Filesystem.readFile({ path: DATA_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === "string" ? r.data : await r.data.text();
  } catch {
    return null; // first run
  }
}

/** Written to a temporary file first and then swapped in, so a crash mid-write never leaves half a file. */
export async function writeData(text: string): Promise<void> {
  if (!native) {
    await idbRun("readwrite", (s) => s.put(text, DATA_FILE));
    return;
  }
  const tmp = `${DATA_FILE}.tmp`;
  await Filesystem.writeFile({ path: tmp, data: text, directory: Directory.Data, encoding: Encoding.UTF8 });
  await Filesystem.rename({ from: tmp, to: DATA_FILE, directory: Directory.Data, toDirectory: Directory.Data });
}

// --- photos ----------------------------------------------------------------------------

let photoBase = ""; // file URI of the photos folder on the phone
const browserPhotos = new Map<string, string>(); // name -> object URL (browser only)

/** Run once at startup, before anything shows a photo. */
export async function initPhotos(): Promise<void> {
  if (native) {
    try {
      await Filesystem.mkdir({ path: PHOTO_DIR, directory: Directory.Data, recursive: true });
    } catch {
      // already there
    }
    photoBase = (await Filesystem.getUri({ path: PHOTO_DIR, directory: Directory.Data })).uri;
    return;
  }
  const keys = await idbRun<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
  for (const key of keys) {
    if (typeof key !== "string" || !key.startsWith(`${PHOTO_DIR}/`)) continue;
    const blob = await idbRun<Blob>("readonly", (s) => s.get(key));
    browserPhotos.set(key.slice(PHOTO_DIR.length + 1), URL.createObjectURL(blob));
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Stores a photo and returns its reference ("photo:<name>") for photo_path. */
export async function savePhoto(data: Blob): Promise<string> {
  const ext = data.type === "image/png" ? "png" : data.type === "image/webp" ? "webp" : "jpg";
  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  if (native) {
    const bytes = new Uint8Array(await data.arrayBuffer());
    await Filesystem.writeFile({ path: `${PHOTO_DIR}/${name}`, data: bytesToBase64(bytes), directory: Directory.Data });
  } else {
    await idbRun("readwrite", (s) => s.put(data, `${PHOTO_DIR}/${name}`));
    browserPhotos.set(name, URL.createObjectURL(data));
  }
  return `photo:${name}`;
}

/** What an <img> needs for a stored photo reference (remote URLs pass through). */
export function photoUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (!ref.startsWith("photo:")) return ref;
  const name = ref.slice(6);
  return native ? Capacitor.convertFileSrc(`${photoBase}/${name}`) : (browserPhotos.get(name) ?? null);
}

/** Stores a photo under a given name (restoring a backup keeps the names the recipes refer to). */
export async function savePhotoNamed(name: string, data: Blob): Promise<void> {
  const safe = name.replace(/[^\w.-]/g, "");
  if (native) {
    const bytes = new Uint8Array(await data.arrayBuffer());
    await Filesystem.writeFile({ path: `${PHOTO_DIR}/${safe}`, data: bytesToBase64(bytes), directory: Directory.Data });
  } else {
    await idbRun("readwrite", (s) => s.put(data, `${PHOTO_DIR}/${safe}`));
    browserPhotos.set(safe, URL.createObjectURL(data));
  }
}

/** A spare copy of the data document (taken before a restore replaces everything). */
export async function writeSpare(name: string, text: string): Promise<void> {
  if (!native) {
    await idbRun("readwrite", (s) => s.put(text, name));
    return;
  }
  await Filesystem.writeFile({ path: name, data: text, directory: Directory.Data, encoding: Encoding.UTF8 });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((b) => bytesToBase64(new Uint8Array(b)));
}

export function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type });
}

export async function readPhoto(ref: string): Promise<Blob | null> {
  const name = ref.replace(/^photo:/, "");
  try {
    if (native) {
      const r = await Filesystem.readFile({ path: `${PHOTO_DIR}/${name}`, directory: Directory.Data });
      if (typeof r.data !== "string") return r.data;
      const bin = atob(r.data);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new Blob([bytes], { type: name.endsWith(".png") ? "image/png" : "image/jpeg" });
    }
    return (await idbRun<Blob | undefined>("readonly", (s) => s.get(`${PHOTO_DIR}/${name}`))) ?? null;
  } catch {
    return null;
  }
}
