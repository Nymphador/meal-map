// Fetching web pages (recipe links) and images. On the phone this goes through Capacitor's native
// HTTP, so a site's cross-origin rules don't block it. In a desktop browser (development) it goes
// through the dev server's /__fetch helper (see vite.config.ts).
import { CapacitorHttp } from "@capacitor/core";
import { native } from "./storage";
import { ApiError } from "../logic/errors";

function failure(status: number): ApiError {
  if (status === 401 || status === 403 || status === 429) {
    return new ApiError(422, "That site doesn't allow other apps to read its recipes. Use \"Paste page source\" or paste the recipe text instead.",
      { blocked: true });
  }
  return new ApiError(422, `The site returned an error (${status}).`);
}

const offline = () => new ApiError(422, "Couldn't reach that page. Check the link and your internet connection.");

export async function fetchText(url: string): Promise<string> {
  if (native) {
    let r;
    try {
      r = await CapacitorHttp.get({ url, responseType: "text", headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": navigator.userAgent } });
    } catch {
      throw offline();
    }
    if (r.status >= 400) throw failure(r.status);
    return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
  }
  let resp: Response;
  try {
    resp = await fetch(`/__fetch?url=${encodeURIComponent(url)}`);
  } catch {
    throw offline();
  }
  if (!resp.ok) throw failure(resp.status);
  return resp.text();
}

export async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    if (native) {
      const r = await CapacitorHttp.get({ url, responseType: "blob" });
      if (r.status >= 400 || typeof r.data !== "string") return null;
      const bin = atob(r.data);
      const type = String(r.headers["Content-Type"] ?? r.headers["content-type"] ?? "image/jpeg");
      return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type });
    }
    const resp = await fetch(`/__fetch?url=${encodeURIComponent(url)}`);
    return resp.ok ? await resp.blob() : null;
  } catch {
    return null;
  }
}
