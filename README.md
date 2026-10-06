# Meal Map

A meal planner, recipe box and shopping list that runs entirely on your phone. No account, no server:
your recipes and prices stay on the device (and in Android's own backup).

## What it does (so far)

- **Recipes:** add your own, import from a recipe website link, read a recipe PDF (including meal-kit recipe
  cards, whose "1 packet" amounts become real measurements), or paste recipe text. Search, favourites, ratings,
  tags, quick meals, and nutrition filters and sorting (calories, protein, carbs, fat per serve).
- **Nutrition:** worked out per serve from the recipe's own panel, or estimated from the ingredients using
  built-in typical values that you can correct.
- **Prices:** enter what you pay for each ingredient ("$4.50 for 1 kg") on the Prices tab or a recipe's
  Prices page. Every recipe's cost and cost per serve adds up from those.
- **This week:** Generate plans dinners from your library with your rules (dietary tags, dislikes, cook time,
  nutrition limits, favourites and new recipes per week, no repeats within N days, budget). Replace suggests swaps
  with reasons, Shuffle, drag to another day, lock, skip, eating out, Mark cooked (takes the ingredients out of the
  pantry; Undo puts them back), reuse a past week. Leftover packs get recipe suggestions.
- **Shopping list:** worked out from the week, minus the pantry, rounded up to whole packs of the size you priced.
  Tick things off in the shop, enter what you paid (it updates the price), share the list, and Mark shop done puts
  what you bought into the pantry.
- **Pantry:** batches with use-by dates (cooking uses the oldest first), have/low/out for spices, staples, stocktake.
- **Backup:** Settings → Save a backup puts everything, photos included, in one file you can keep anywhere.
- **Free with ads:** a banner at the bottom, and a short video you choose to watch before planning a week (one video
  covers 15 minutes of regenerating).
- **Premium** (one-time purchase, Settings → Premium, with Restore purchase for a new phone): no ads, and breakfast and
  lunch. Open up a day on This week ("+ Breakfast & lunch") and Generate plans those too, from recipes switched on for
  that meal on their page ("Plan it for" switches). Days you don't open stay dinner only.

## Development

```
npm install
npx vite             # run in a desktop browser
npm test             # logic tests
npm run build        # type-check and build
build-android.bat    # MealMap-test.apk with test ads (needs Android Studio)
make-icons.bat       # icons, splash and store graphics from assets/logo.png
make-upload-key.bat  # once: the Google Play upload key
build-release.bat    # signed .aab for Google Play (real ads)
```

## Phases

1. ~~On-device core: recipes, imports, ingredients and prices~~
2. ~~Meal planner, pantry, shopping list, backup~~ (awaiting check)
3. ~~Ads and the remove-ads purchase~~ (awaiting check)
4. ~~Store-ready release~~ (awaiting check). Publishing steps: [store/listing.md](store/listing.md)
