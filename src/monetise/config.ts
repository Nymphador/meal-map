// Ad unit and product ids, from store-config.json (the one file to fill in for the store). Test builds
// always use Google's public test ids, which serve test ads that are safe to tap: tapping your own real
// ads gets an AdMob account suspended. Only a release build (vite --mode release, build-release.bat)
// uses the real ids. The AdMob *app* id is set per build type in android/app/build.gradle.
import store from "../../store-config.json";

const TEST_BANNER = "ca-app-pub-3940256099942544/9214589741"; // adaptive banner
const TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";

const RELEASE = import.meta.env.MODE === "release";

export const TEST_ADS = !RELEASE || !store.bannerAdUnit || !store.rewardedAdUnit;
export const BANNER_ID = TEST_ADS ? TEST_BANNER : store.bannerAdUnit;
export const REWARDED_ID = TEST_ADS ? TEST_REWARDED : store.rewardedAdUnit;

/** The one-time Premium product in the Play Console (a non-consumable): no ads, plus breakfast and lunch.
 * Its id is still remove_ads from when it only removed ads; Play product ids can never change. */
export const REMOVE_ADS_PRODUCT = store.removeAdsProduct;
/** Shown until Play reports the real, localised price. */
export const FALLBACK_PRICE = "$9.99";
