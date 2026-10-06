# Meal Planner (public app)

The Play Store version of the user's personal Meal Planner (`Documents\MealPlanner`, a separate repo with a
FastAPI server and Woolworths/Coles price tracking). This one runs entirely on the phone: no server, no
accounts, no store prices. Users price ingredients themselves. Free with ads (a banner, and a rewarded video
before generating a meal plan); a one-time $3.99 purchase removes them. It ships with no recipes.

**Status:** phase 1 (on-device core: data, recipes, imports, ingredients with manual prices, costing) built,
awaiting the user's check. Plan: 2 = planner, nutrition limits, pantry, shopping list, backup export/import;
3 = AdMob banner + rewarded ad before Generate + upsell popup, Play Billing remove-ads with restore, consent;
4 = store-ready (icon, name/app ID, signed AAB, privacy policy, listing). Build phase by phase; commit only
when the user says "commit it".

## Rules from the user
- No Woolworths/Coles pricing, no Claude in Chrome, no mention of HelloFresh anywhere (code, comments, UI,
  tags, notes). Recipe-card PDFs from meal kits are still read, described generically.
- No paid services without asking. Features that need a server or a secret key (photo reading via Claude,
  Spoonacular Discover) are out.

## Stack
- React 19 + Router 7 + Vite 8 + Tailwind 4 + TypeScript, Capacitor 8 (`android/`). Tests: `npm test` (vitest,
  `src/**/*.test.ts`). `npm run build` = type-check + build. Dev: `npx vite` (desktop browser; data in IndexedDB).
- Android: `build-android.bat` (debug APK for now). Android Studio is at `F:\Applications\Android Studio`; its Java
  is 25, so the Gradle wrapper is 9.1. One Gradle build at a time.

## Architecture
- `src/data/db.ts`: the whole database is one in-memory JSON document (`schema.ts`), saved after every change
  (`commit(topics)` saves and notifies pages; `useLive` in `live.ts` reloads them). Recipe lines and tag ids live
  inside recipes, aliases inside ingredients. `storage.ts`: `data.json` + `photos/` in the app's files dir on the
  phone (Capacitor Filesystem; Android Auto Backup covers it), IndexedDB in a browser. Photos are referenced as
  `photo:<file>`; `photoUrl` turns that into an `<img>` src.
- `src/server/`: the old HTTP API answered in-process. Pages still call `api("/api/...")` (`src/api.ts` ->
  `dispatch`). Add routes with `route(method, "/api/x/:id", handler)`; results are structuredClone'd.
- `src/logic/`: pure, tested logic ported from the Python backend: `parse.ts` (ingredient lines), `conversions.ts`,
  `names.ts`, `ingredients.ts` (resolve/suggest/link aliases/auto-create with built-in nutrition), `nutrition.ts`
  (+ `tables.ts`, generated from the Python tables), `recipes.ts` (save/list/filters), `costing.ts` (manual
  prices: `price` for `price_amount` `price_unit`), `urlImport.ts` (JSON-LD), `textImport.ts`, `recipeCard.ts`
  (positional meal-kit card reader), `kitSizes.ts` (packets -> amounts).
- `src/data/pdf.ts`: pdf.js on the device; rebuilds pdfplumber-style words (spaces/gaps > 3 pt/font change split
  words; top = height - (baseline + size*(1+descent))) so `recipeCard.ts` works unchanged. Renders with
  `intent: "print"` (the default waits for animation frames). Loaded lazily (it's big).
- `src/data/net.ts`: web pages/images via CapacitorHttp on the phone (no CORS), the dev server's `/__fetch` in a
  browser (vite.config.ts). Never add bot-protection workarounds.
- Phase 2 pages from the personal app are parked in `later/` (not compiled) to be adapted.

## Conventions
- Colours are CSS variables with dark mode (`src/index.css`, `theme.ts`); use semantic Tailwind colours.
- Every logic change gets a vitest test; port the matching Python test when porting a feature.
