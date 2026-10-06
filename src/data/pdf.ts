// Reads a recipe out of a PDF, on the phone (pdf.js; nothing is uploaded anywhere). Meal-kit recipe
// cards are read by word position (logic/recipeCard.ts); other PDFs with a text layer as plain text
// (Ingredients / Method sections). The biggest picture on the first pages becomes the recipe photo.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ApiError } from "../logic/errors";
import { looksLikeRecipeCard, linesOf, joinWords, parseRecipeCard, type Page, type Word } from "../logic/recipeCard";
import { looksComplete, parseText } from "../logic/textImport";
import type { RecipeDraft } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_BYTES = 20 * 1024 * 1024;
const MIN_PHOTO_SIDE = 300; // skip logos and icons when picking the meal photo
const X_TOLERANCE = 3; // points: a smaller gap between letters is the same word (as other PDF readers do)

type Doc = Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
type PdfPage = Awaited<ReturnType<Doc["getPage"]>>;

interface Char { ch: string; x0: number; x1: number; top: number; size: number; font: string }

/** A page's words with positions measured from the top-left, like the recipe-card reader expects. */
async function pageWords(page: PdfPage): Promise<Page> {
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const chars: Char[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str) continue;
    const [a, b, c, d, e, f] = item.transform as number[];
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01) continue; // rotated text: never part of a recipe
    const size = Math.hypot(c, d) || Math.abs(a);
    const descent = (content.styles[item.fontName]?.descent ?? -0.2);
    const top = vp.height - (f + size * (1 + descent));
    const each = item.width / item.str.length; // spread the run's width evenly over its letters
    [...item.str].forEach((ch, i) => chars.push({ ch, x0: e + i * each, x1: e + (i + 1) * each, top, size, font: item.fontName }));
  }

  // Lines first (by top), then words: a space, a gap, or a change of font ends a word.
  const words: Word[] = [];
  const lines: Char[][] = [];
  for (const ch of [...chars].sort((p, q) => p.top - q.top || p.x0 - q.x0)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].top - ch.top) <= 3) last.push(ch);
    else lines.push([ch]);
  }
  for (const line of lines) {
    let cur: Char[] = [];
    const flush = () => {
      if (!cur.length) return;
      words.push({
        text: cur.map((c) => c.ch).join(""), x0: cur[0].x0, x1: cur[cur.length - 1].x1,
        top: Math.min(...cur.map((c) => c.top)), bottom: Math.min(...cur.map((c) => c.top)) + cur[0].size,
        fontname: cur[0].font, size: Math.round(cur[0].size * 100) / 100,
      });
      cur = [];
    };
    for (const ch of line.sort((p, q) => p.x0 - q.x0)) {
      if (/\s/.test(ch.ch)) { flush(); continue; }
      const prev = cur[cur.length - 1];
      if (prev && (ch.x0 - prev.x1 > X_TOLERANCE || ch.font !== prev.font || Math.abs(ch.size - prev.size) > 0.01)) flush();
      cur.push(ch);
    }
    flush();
  }
  return { width: vp.width, height: vp.height, words };
}

/** The biggest picture on the first pages (the meal photo on most recipe cards), as a JPEG. */
async function biggestPhoto(doc: Doc): Promise<Blob | null> {
  let best: { pageNo: number; box: [number, number, number, number]; area: number } | null = null;
  for (let pageNo = 1; pageNo <= Math.min(2, doc.numPages); pageNo++) {
    const page = await doc.getPage(pageNo);
    const ops = await page.getOperatorList();
    let m = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const mul = (p: number[], q: number[]) => [
      p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3],
      p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];
    ops.fnArray.forEach((fn, i) => {
      if (fn === pdfjs.OPS.save) stack.push(m);
      else if (fn === pdfjs.OPS.restore) m = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      else if (fn === pdfjs.OPS.transform) m = mul(m, ops.argsArray[i] as number[]);
      else if (fn === pdfjs.OPS.paintImageXObject) {
        const [, w, h] = ops.argsArray[i] as [string, number, number];
        if (Math.min(w, h) < MIN_PHOTO_SIDE) return;
        // The image fills the unit square under the current matrix.
        const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]];
        const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
        const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        const area = w * h;
        if (!best || area > best.area) best = { pageNo, box, area };
      }
    });
  }
  if (!best) return null;
  const { pageNo, box } = best as { pageNo: number; box: [number, number, number, number] };
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 1600 / Math.max(1, box[2] - box[0]));
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  // "print" draws in one go; the default waits for animation frames, which a backgrounded app never gets.
  await page.render({ canvas, viewport: vp, intent: "print" }).promise;
  // PDF y runs upwards; the canvas's runs down.
  const sx = Math.max(0, box[0] * scale), sy = Math.max(0, (base.height - box[3]) * scale);
  const sw = Math.min(canvas.width - sx, (box[2] - box[0]) * scale), sh = Math.min(canvas.height - sy, (box[3] - box[1]) * scale);
  const out = document.createElement("canvas");
  out.width = Math.round(sw);
  out.height = Math.round(sh);
  out.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.85));
}

export async function readPdf(file: Blob, servings: number): Promise<{ draft: RecipeDraft; photo: Blob | null }> {
  if (!file.size) throw new ApiError(422, "That file is empty");
  if (file.size > MAX_BYTES) throw new ApiError(422, "That file is over 20 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    throw new ApiError(422, "That isn't a PDF. Photos of recipes can't be read yet: paste the recipe text instead, or add it by hand.");
  }
  const task = pdfjs.getDocument({ data: bytes });
  let doc: Doc;
  try {
    doc = await task.promise;
  } catch {
    throw new ApiError(422, "That PDF couldn't be opened");
  }
  try {
    const pages: Page[] = [];
    for (let i = 1; i <= Math.min(6, doc.numPages); i++) pages.push(await pageWords(await doc.getPage(i)));
    const text = pages.map((p) => linesOf(p.words).map(joinWords).join("\n")).join("\n");
    let draft: RecipeDraft;
    if (looksLikeRecipeCard(text)) {
      draft = parseRecipeCard(pages, servings);
    } else if (text.trim().length > 150) {
      draft = parseText(text);
      if (!draft.ingredients.length && !draft.method.length) {
        throw new ApiError(422, "Couldn't find Ingredients and Method sections in this PDF. Paste the recipe text instead, or add it by hand.");
      }
    } else {
      throw new ApiError(422, "This PDF has no readable text (it's probably a scan). Paste the recipe text instead, or add it by hand.");
    }
    if (!looksComplete(draft) && !draft.ingredients.length) {
      throw new ApiError(422, "Couldn't find a recipe in this PDF. Paste the recipe text instead, or add it by hand.");
    }
    let photo: Blob | null = null;
    try {
      photo = await biggestPhoto(doc);
    } catch {
      // a picture is a nice-to-have; never fail the import over it
    }
    return { draft, photo };
  } finally {
    task.destroy();
  }
}
