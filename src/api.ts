// What every page calls to read and change data. There's no server: requests are answered inside
// the app from the data on this phone (src/server), so everything works offline.
import { dispatch } from "./server";
import { native, photoUrl } from "./data/storage";
import { ApiError } from "./logic/errors";

export { ApiError };

export function isNative(): boolean {
  return native;
}

/** What an <img> needs for a recipe photo (stored on the phone, or a web link). */
export function mediaUrl(src: string | null | undefined): string | null {
  return photoUrl(src);
}

type Options = { method?: string; body?: unknown; form?: FormData };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
  try {
    return (await dispatch(method, path, opts.body, opts.form)) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error(e);
    throw new ApiError(500, (e as Error).message || "Something went wrong");
  }
}

/** Builds a query string, repeating keys for arrays and skipping empty values. */
export function qs(params: Record<string, string | number | boolean | (string | number)[] | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, String(v)));
    else sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
