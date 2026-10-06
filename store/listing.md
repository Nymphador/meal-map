# Meal Map: Google Play release guide

Everything needed to publish, in order. Text to paste into the Play Console is in the boxes.

## 1. One-time setup

1. **Logo.** Save your logo as `assets/logo.png` (square, 1024×1024), then run `make-icons.bat`. It makes the launcher
   icons, splash screens, `store/icon-512.png`, `store/feature-graphic.png` and `site/icon.png`.
2. **Google Play developer account** at play.google.com/console (one-off US$25, identity check).
   New personal accounts must run a **closed test with at least 12 testers for 14 days** before they can publish to
   everyone. Start that early (friends and family with Android phones; they join through a link).
3. **Upload key.** Run `make-upload-key.bat` once. Back up `meal-map-upload.jks`, `android\keystore.properties` and the
   password somewhere other than this PC (e.g. a USB stick or password manager).
4. **Website for the privacy policy and app-ads.txt.** Put the contents of the `site` folder on a free website.
   The easiest is GitHub Pages: create a public repository named `nymphador.github.io`, upload the
   files in `site/` to it, and they appear at `https://nymphador.github.io/`.
   (Done: the contact email in `site/privacy.html` is mealmapsupport@gmail.com.)
   `app-ads.txt` must sit at the root of that site (it will), and the same site goes in the Play listing's
   "Website" field so AdMob can verify it.

## 2. AdMob (apps.admob.com)

1. Apps → Add app → Android → "No" (not published yet) → name **Meal Map**. Copy the **App ID**
   (`ca-app-pub-6639853780627086~…`) into `admobAppId` in `store-config.json`.
2. In that app, Ad units → Add ad unit:
   - **Banner** named "Bottom banner". Copy its id (`ca-app-pub-6639853780627086/…`) into `bannerAdUnit`.
   - **Rewarded** named "Plan the week", reward amount 1, item "plan". Copy its id into `rewardedAdUnit`.
3. Privacy & messaging → create a **European regulations (GDPR)** message for Meal Map and publish it (this is the
   consent form the app shows in the EU/UK). Optionally also a **US states** message.
4. Payments: add your payment details when AdMob asks (payouts start once earnings pass the threshold).
5. Never tap your own real ads. Test builds (`build-android.bat`) always show test ads, so use those on your phone.

## 3. First upload

1. `build-release.bat` → `MealMap-release-1.0.0.aab`.
2. Play Console → Create app: name **Meal Map**, app (not game), free, accept the declarations.
3. Testing → Internal testing → Create release → upload the .aab. (Choose "Use Google-generated key" for Play App
   Signing when asked.) Add yourself as a tester and install it from the link on your phone.
4. **Premium product** (only possible after a build is uploaded): Monetise → Products → One-time products → Create:
   - Product ID: `remove_ads` (must match exactly; it keeps this id from when it only removed ads, ids can't change)
   - Name: Meal Map Premium
   - Description: No ads, plus breakfast and lunch planning. One payment, no subscription.
   - Purchase option: `lifetime`, Buy. Price: AUD 9.99 (let Play set the other countries) → Save → Activate.
5. Settings → License testing: add your Google account, so your test purchases aren't charged.
6. Then Closed testing with your 12+ testers for 14 days, then apply for production.
7. After it's live: in AdMob, open the app → App settings → link it to the Play Store listing.

Before each later upload, raise `versionCode` by 1 in `store-config.json` (and `versionName`, e.g. 1.0.1).

## 4. Store listing (Grow → Store presence → Main store listing)

**App name** (30 max)
```
Meal Map: Meal Planner
```

**Short description** (80 max)
```
Plan the week from your recipes, get a costed shopping list. No account needed.
```

**Full description**
```
Meal Map plans your meals from your own recipes, then turns the week into a shopping list that knows what you already have.

YOUR RECIPES
• Add recipes by hand, import them from a recipe website link, paste the text, or read a recipe PDF (including meal-kit recipe cards)
• Photos, ratings, favourites, tags and quick-meal filters
• Nutrition per serve: calories, protein, carbs and fat, from the recipe or estimated from the ingredients

PLAN THE WEEK
• One tap plans the week from your library, following your rules: dietary tags, dislikes, cooking time, nutrition limits, favourites, how often meals can repeat, and your budget
• Swap any night with suggestions, shuffle, drag meals between days, lock the ones you want to keep, or mark nights as eating out or leftovers
• Reuse a past week in seconds
• Premium: open up any day to plan breakfast and lunch too, from recipes you've marked for those meals

SHOP SMARTER
• A shopping list built from the week, minus what's in your pantry, rounded up to the pack sizes you actually buy
• Enter what you pay and every recipe shows its cost and cost per serve, plus an estimated weekly total
• Tick items off in the shop, share the list, and your pantry updates when you're done

PANTRY AND LEFTOVERS
• Track what you have, with use-by dates; cooking uses the oldest first
• Half-used packs get recipe suggestions so less food goes in the bin

PRIVATE BY DESIGN
• No account, no sign-up. Your recipes and data stay on your phone
• Save a backup file whenever you like, and restore it on a new phone

Meal Map is free with ads. Meal Map Premium is a single one-time purchase: no ads, plus breakfast and lunch planning. No subscription.
```

**Graphics**
- App icon: `store/icon-512.png`
- Feature graphic: `store/feature-graphic.png`
- Phone screenshots: 2–8 (portrait). Take them on your phone with a few recipes in: This week, Shopping list,
  a recipe, Pantry, Prices.

**Category:** Food & Drink. **Tags:** Meal planner, Recipes, Shopping list.
**Contact details:** mealmapsupport@gmail.com; website `https://nymphador.github.io/`.
**Privacy policy:** `https://nymphador.github.io/privacy.html`

## 5. App content (Policy → App content)

- **Privacy policy:** the URL above.
- **Ads:** Yes, the app contains ads.
- **App access:** All functionality is available without special access (no login).
- **Target audience:** 18 and over. (Including under-13s would bring in the Families policy and its ad rules.)
- **Content rating:** fill in the questionnaire: category "Utility, productivity, communication or other";
  answer No to violence, sexuality, language, controlled substances, gambling; users can't interact or share
  content with each other; no location sharing. Expect "Everyone" / PEGI 3.
- **Advertising ID:** Yes, the app uses it, for **Advertising or marketing** (it comes with AdMob).
- **Government apps / financial features / health:** No.
- **Data safety:**
  - Does the app collect or share user data? **Yes** (AdMob, Google's ad SDK).
  - Is all collected data encrypted in transit? **Yes**.
  - Can users request deletion? Choose **No** (there's nothing on our side to delete: app data lives only on the
    phone and is removed on uninstall; ad data is handled by Google).
  - Data types, each **Collected and Shared**, processed ephemerally: **No**, collection **required** (users can't
    turn it off, short of buying Premium), purposes **Advertising or marketing, Analytics, Fraud prevention, security, and compliance**:
    - Location → **Approximate location** (from IP address)
    - App activity → **Other user-generated content**: No. → **App interactions**: Yes
    - App info and performance → **Crash logs** and **Diagnostics**
    - Device or other IDs → **Device or other IDs**
  - Not collected: personal info, financial info (Google Play handles payments), messages, photos (recipe photos
    stay on the phone), files, calendar, contacts, health.
