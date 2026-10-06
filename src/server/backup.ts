// Backups: everything (recipes, prices, plans, pantry, settings) and the recipe photos in one JSON file
// the user can save anywhere (Google Drive, email, Files). Restoring replaces everything; the current
// data is kept as a spare copy first.

import { commit, db, flushSaves, replaceData } from "../data/db";
import type { DbData } from "../data/schema";
import { base64ToBlob, blobToBase64, readPhoto, savePhotoNamed, writeSpare } from "../data/storage";
import { ApiError } from "../logic/errors";
import { route } from "./router";

const APP = "meal-planner-app"; // the backup format's id: kept from before the app was named, so old backups restore

route("GET", "/api/backup", async () => {
  await flushSaves();
  const photos: Record<string, { type: string; data: string }> = {};
  for (const r of db().recipes) {
    const ref = r.photo_path;
    if (!ref?.startsWith("photo:") || photos[ref.slice(6)]) continue;
    const blob = await readPhoto(ref);
    if (blob) photos[ref.slice(6)] = { type: blob.type || "image/jpeg", data: await blobToBase64(blob) };
  }
  return { app: APP, version: db().version, exported_at: new Date().toISOString(), data: db(), photos };
});

route("POST", "/api/backup/restore", async ({ body }) => {
  let parsed: { app?: string; version?: number; data?: Partial<DbData>; photos?: Record<string, { type: string; data: string }> };
  try {
    parsed = typeof body.text === "string" ? JSON.parse(body.text) : body;
  } catch {
    throw new ApiError(422, "That file isn't a Meal Map backup");
  }
  if (parsed.app !== APP || !parsed.data || !Array.isArray(parsed.data.recipes)) {
    throw new ApiError(422, "That file isn't a Meal Map backup");
  }
  if ((parsed.version ?? 1) > db().version) {
    throw new ApiError(422, "That backup is from a newer version of the app. Update the app, then restore it.");
  }
  await writeSpare("data.before-restore.json", JSON.stringify(db()));
  for (const [name, photo] of Object.entries(parsed.photos ?? {})) {
    await savePhotoNamed(name, base64ToBlob(photo.data, photo.type));
  }
  replaceData(parsed.data);
  commit(["*"]);
  await flushSaves();
  return { recipes: db().recipes.filter((r) => !r.deleted).length, photos: Object.keys(parsed.photos ?? {}).length };
});
