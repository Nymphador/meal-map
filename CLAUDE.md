# Meal Map (public app)

Meal Map (app id `com.nymphador.mealmap`, fixed forever once uploaded) is the Play Store version of the user's personal Meal Planner (`Documents\MealPlanner`, a separate repo with a
FastAPI server and Woolworths/Coles price tracking). This one runs entirely on the phone: no server, no
accounts, no store prices. Users price ingredients themselves. Free with ads (a banner, and a rewarded video
before generating a meal plan). Premium, a one-time $9.99 purchase (Play product id `remove_ads`, kept from when it only
removed ads), removes them and unlocks breakfast and lunch. Since 1.1.1 it adds 20 starter dinners once (see Starter recipes).

**Status:** phase 1 committed. Phases 2 (planner, pantry, shopping, backup), 3 (ads, remove-ads purchase, consent)
and 4 (Meal Map name/app id, icon pipeline, signed release build, privacy policy + app-ads.txt site, store listing
guide) built, awaiting the user's check. What's left is the user's: their logo, Play/AdMob accounts and ids
(`store/listing.md` is the step-by-step). Commit only when the user says "commit it".

## Rules from the user
- No Woolworths/Coles pricing, no Claude in Chrome, no mention of HelloFresh anywhere (code, comments, UI,
  tags, notes). Recipe-card PDFs from meal kits are still read, described generically.
- No paid services without asking. Features that need a server or a secret key (photo reading via Claude,
  Spoonacular Discover) are out.

## Stack
- React 19 + Router 7 + Vite 8 + Tailwind 4 + TypeScript, Capacitor 8 (`android/`). Tests: `npm test` (vitest,
  `src/**/*.test.ts`). `npm run build` = type-check + build. Dev: `npx vite` (desktop browser; data in IndexedDB).
- Android: `build-android.bat` = MealMap-test.apk (always test ads). `build-release.bat` = signed
  MealMap-release-<version>.aab (`vite build --mode release`, real ad ids; refuses without the upload key or the ids).
  `make-upload-key.bat` (scripts/make-upload-key.ps1) creates `meal-map-upload.jks` + `android/keystore.properties`
  (both gitignored, the user's secret; never create or read them yourself). `store-config.json` = app id, name,
  versionCode/versionName (bump per upload), AdMob app/unit ids, product id; read by `src/monetise/config.ts` and
  `android/app/build.gradle` (which sets `admob_app_id` per build type: debug = Google's test app id).
- Icons: `make-icons.bat` (scripts/make-icons.mjs, sharp) turns `assets/logo.png` (else the placeholder `assets/logo.svg`)
  into launcher icons (legacy + adaptive at 96/108 dp over the logo's corner colour), splash screens,
  `public/logo.png` (header/favicon), `site/icon.png`, `store/icon-512.png` and `store/feature-graphic.png`.
- `site/`: the public website (privacy policy with a CONTACT_EMAIL placeholder, app-ads.txt for publisher
  pub-6639853780627086). `store/listing.md`: Play Console steps, listing text, data safety answers. Keep the privacy
  policy and data safety answers true when adding anything that sends data off the phone.
- Android build machine: Android Studio is at `F:\Applications\Android Studio`; its Java
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
- Planner (`logic/planner.ts`), pantry (`logic/pantry.ts`), shopping (`logic/shopping.ts`) and leftovers are ports of the
  Python services with the same rules and tests. Shopping is single-source: whole packs of the size the user priced
  (`packPlan`, labelled in the priced unit: "1 × 1 kg" even for onions counted as items); a price paid at Mark shop done
  becomes the ingredient's price per pack (Reopen restores the old one). Dates are local YYYY-MM-DD (`logic/dates.ts`,
  `setToday` for tests); randomness is seedable (`makeRng`).
- Backup: `GET /api/backup` = the whole document + photos (base64) as one JSON; restore keeps
  `data.before-restore.json` first. Saving uses the share sheet on the phone (`native.ts shareFile`, @capacitor/share).
- Ads + purchase (`src/monetise/`): `config.ts` holds the ad unit ids (Google's public TEST ids until real ones are
  filled in; the AdMob app id is `admob_app_id` in android strings.xml and must change with them) and the product id.
  `premium.ts`: Play Billing via @capgo/native-purchases, no server; Play is the source of truth (checked at start and on
  resume, acknowledges anything unacknowledged, a refund brings ads back), cached in localStorage (`mp_ad_free`) so the
  app starts ad-free offline. `entitlement.ts` = the pure, tested rules. `ads.ts`: @capacitor-community/admob; consent
  (UMP) first, ads only if `canRequestAds`; banner = adaptive, bottom, its height goes to the CSS var `--ad-h`, which
  the tab bar (`pb-safe-ad`), sheets, toasts and sticky bars add (`bottom-above-nav`) since Android draws the banner over
  the web view. The rewarded ad is opt-in (AdMob policy): Generate opens `AdGateSheet` (Watch / Go Premium); watched =
  plan + `UpsellPopup` + 15 minutes of ad-free regenerating (`markAdWatched`/`adCoverMinutesLeft`, localStorage); closed early = no plan; no ad available = plan anyway. `showRewardVideoAd` only resolves on a
  reward, so the Dismissed event decides. In a desktop browser a grey placeholder banner, a 5 s pretend video and a
  confirm() "purchase" stand in (Settings → "Undo Premium" undoes it, dev only).
- Breakfast and lunch (Premium): every day has a dinner row; breakfast/lunch rows exist only on days the user opened up
  (`expandDay`/`collapseDay` in planner.ts, routes `/api/plans/:id/days/:date/expand|collapse`; expand checks
  `isPremium()`). Those rows ARE the "expanded" state. Recipes carry `meal_types` (read via `mealTypes()`: missing =
  dinner; the editor doesn't send it, so edits keep it; URL import guesses from recipeCategory); switched on the recipe
  page (`MealSwitches`, breakfast/lunch locked without Premium). Generate fills each open meal only from recipes whose
  types include its slot; the favourites/new mix counts dinners only; nothing repeats within a week across slots.
  Replace/Shuffle filter by slot; moves only to the same slot; "Average dinner" counts dinners only. Shopping and
  leftovers include every slot. Collapse Undo re-expands then restores the old states matched by slot (new row ids).
- Status bar: the app draws edge to edge; `pt-safe`/`pb-safe` (index.css) use max(env(), --safe-area-inset-*) because
  older Android web views report env() as 0 and Capacitor injects the variables.

## Conventions
- Colours are CSS variables with dark mode (`src/index.css`, `theme.ts`); use semantic Tailwind colours.
- Every logic change gets a vitest test; port the matching Python test when porting a feature.

## Starter recipes (1.1.1)
- `src/data/starterRecipes.ts`: 20 high-protein dinners (<750 kcal, >=35 g protein) adapted from BBC Good Food. Ingredient
  lines use Australian names and go through `ingredientLines` like an import; methods are written in our own words (never
  paste the original text); nutrition is the original per-serve panel; each keeps its `source_url`. No BBC descriptions.
- `src/logic/starter.ts` `addStarterRecipes` runs at boot after `seedIfNeeded`: once per install (`settings._starter_v1`),
  skips recipes whose source_url is already in the library, never re-adds deleted ones.
- Photos are BBC's, for CLOSED TESTING ONLY. They live in `starter-photos/` (gitignored: never commit or publish them) and
  the `starterPhotos` Vite plugin copies them into the build at /starter/ only while store-config.json
  `"starterPhotos": true`. **Set it to false before any production or open-testing release**: that build ships no photo
  files, and `addStarterRecipes` clears the /starter/ photo paths that testers' phones already stored.
