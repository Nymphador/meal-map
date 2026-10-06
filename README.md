# Meal Planner

A meal planner, recipe box and shopping list that runs entirely on your phone. No account, no server:
your recipes and prices stay on the device (and in Android's own backup).

## What it does (so far)

- **Recipes:** add your own, import from a recipe website link, read a recipe PDF (including meal-kit recipe
  cards, whose "1 packet" amounts become real measurements), or paste recipe text. Search, favourites, ratings,
  tags, quick meals, and nutrition filters and sorting (calories, protein, carbs, fat per serve).
- **Nutrition:** worked out per serve from the recipe's own panel, or estimated from the ingredients using
  built-in typical values that you can correct.
- **Prices:** enter what you pay for each ingredient ("$4.50 for 1 kg") on the Ingredients tab or a recipe's
  Prices page. Every recipe's cost and cost per serve adds up from those.

Coming next: the weekly meal planner, pantry and shopping list.

## Development

```
npm install
npx vite           # run in a desktop browser
npm test           # logic tests
npm run build      # type-check and build
build-android.bat  # test APK (needs Android Studio)
```

## Phases

1. ~~On-device core: recipes, imports, ingredients and prices~~ (awaiting check)
2. Meal planner, pantry, shopping list, backup
3. Ads and the remove-ads purchase
4. Store-ready release
