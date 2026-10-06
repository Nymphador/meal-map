// The app's "server", running inside the app itself. The screens were written against an HTTP API
// (`api("/api/recipes")`), so the same paths are answered here from the phone's own data.

import { ApiError } from "../logic/errors";

export interface Req {
  params: Record<string, string>;
  query: URLSearchParams;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  form?: FormData;
}

type Handler = (req: Req) => unknown;
const routes: { method: string; re: RegExp; keys: string[]; fn: Handler }[] = [];

/** route("GET", "/api/recipes/:id", handler) */
export function route(method: string, pattern: string, fn: Handler) {
  const keys: string[] = [];
  const re = new RegExp("^" + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, re, keys, fn });
}

export async function dispatch(method: string, url: string, body?: unknown, form?: FormData): Promise<unknown> {
  const [path, search = ""] = url.split("?");
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const result = await r.fn({ params, query: new URLSearchParams(search), body: body ?? {}, form });
    // A copy, so a page changing what it got can't change the stored data behind the app's back.
    return result === undefined ? undefined : structuredClone(result);
  }
  throw new ApiError(404, `Not found: ${method} ${path}`);
}

export const int = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ApiError(404, "Not found");
  return n;
};

export const numOrNull = (v: string | null) => (v === null || v === "" ? null : Number(v));
