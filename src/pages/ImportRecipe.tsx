import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { CameraIcon, LinkIcon } from "../components/Icons";
import { PageHeader } from "../components/ui";
import type { RecipeDraft } from "../types";

export default function ImportRecipe() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setReading(file.name);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const draft = await api<RecipeDraft>("/api/recipes/import-file", { form });
      navigate("/recipes/new", { state: { draft, origin: "file" } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function run(path: string, body: object, origin: string) {
    setBusy(true);
    setError("");
    try {
      const draft = await api<RecipeDraft>(path, { body });
      navigate("/recipes/new", { state: { draft, origin } });
    } catch (e) {
      setError((e as Error).message);
      const detail = e instanceof ApiError ? (e.detail as { blocked?: boolean } | null) : null;
      if (detail?.blocked) setShowPaste(true);
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
    } catch {
      // the clipboard needs permission; the user can paste by hand
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Import a recipe" back="/recipes" />

      <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); run("/api/recipes/import-url", { url }, "url"); }}>
        <label className="label" htmlFor="url">Recipe link</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input id="url" className="input pl-10" type="url" inputMode="url" required value={url}
              onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          {"clipboard" in navigator && window.isSecureContext && (
            <button type="button" className="btn-secondary" onClick={pasteFromClipboard}>Paste</button>
          )}
        </div>
        <button className="btn-primary w-full" disabled={busy || !url.trim()}>{busy ? "Reading the page…" : "Import"}</button>
        <p className="text-xs text-muted">Works with most recipe websites. You'll check everything before it's saved.</p>
      </form>

      <div className="card space-y-3 p-4">
        <h2 className="font-semibold">Upload a PDF</h2>
        <p className="text-sm text-muted">
          A recipe card PDF from a meal kit, or any recipe saved as a PDF. It's read on this phone; nothing is uploaded.
        </p>
        <input ref={fileInput} type="file" accept="application/pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button type="button" className="btn-secondary w-full" disabled={!!reading} onClick={() => fileInput.current?.click()}>
          <CameraIcon className="h-5 w-5" /> {reading ? `Reading ${reading}…` : "Choose a PDF"}
        </button>
        <p className="text-xs text-muted">Meal-kit packets ("1 packet rice") are turned into amounts you can buy and measure at home.</p>
      </div>

      <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); run("/api/recipes/import-text", { text }, "text"); }}>
        <h2 className="font-semibold">Paste recipe text</h2>
        <p className="text-sm text-muted">
          Copy a recipe from anywhere (a message, a note, a website) and paste it here: the title on the first line, then the
          ingredients under "Ingredients" and the steps under "Method".
        </p>
        <textarea className="input min-h-[8rem] text-sm" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"Pea soup\nServes 4\nIngredients\n500 g split peas\n1 onion, diced\nMethod\n1. Rinse the peas…"} />
        <button className="btn-secondary w-full" disabled={busy || !text.trim()}>{busy ? "Reading…" : "Read the recipe"}</button>
      </form>

      {error && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>}

      <div>
        {!showPaste ? (
          <button className="text-sm font-semibold text-brand" onClick={() => setShowPaste(true)}>
            Site won't import? Paste the page source instead
          </button>
        ) : (
          <form className="card space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); run("/api/recipes/import-html", { html, url }, "url"); }}>
            <h2 className="font-semibold">Paste page source</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>Open the recipe in your browser.</li>
              <li>
                View the source: in Chrome on a phone, type <code className="text-ink">view-source:</code> in front of the address;
                on a computer press <kbd className="rounded-sm border border-line px-1">Ctrl</kbd>+<kbd className="rounded-sm border border-line px-1">U</kbd>.
              </li>
              <li>Select all, copy, and paste it below.</li>
            </ol>
            <textarea className="input min-h-[8rem] font-mono text-xs" value={html} onChange={(e) => setHtml(e.target.value)}
              placeholder="<!DOCTYPE html>…" />
            <button className="btn-primary w-full" disabled={busy || !html.trim()}>{busy ? "Reading…" : "Import from source"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
