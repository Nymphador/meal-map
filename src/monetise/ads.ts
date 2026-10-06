// AdMob: the always-on bottom banner and the opt-in rewarded video before planning a week.
// Consent comes first (Google's consent form, shown only where the law needs it, e.g. the EU/UK);
// ads are only requested once Google says they can be. Nothing here runs once ads are removed.
// In a desktop browser there's no AdMob, so a grey placeholder banner and a pretend video stand in.
import {
  AdMob, AdmobConsentStatus, BannerAdPluginEvents, BannerAdPosition, BannerAdSize, MaxAdContentRating,
  RewardAdPluginEvents,
} from "@capacitor-community/admob";
import { useSyncExternalStore } from "react";
import { native } from "../data/storage";
import { BANNER_ID, REWARDED_ID, TEST_ADS } from "./config";
import { isAdFree, onAdFreeChange } from "./premium";

const PLACEHOLDER_HEIGHT = 50;
// AdMob drops loaded rewarded ads after an hour; reload a little before that.
const REWARDED_MAX_AGE_MS = 50 * 60 * 1000;

let started = false;
let privacyRequired = false;
let bannerHeight = 0;
let rewardedAt = 0; // when the waiting rewarded ad loaded; 0 = none ready
let preparing: Promise<void> | null = null;
let bannerRetry: number | undefined;
const listeners = new Set<() => void>();

function setBannerHeight(h: number) {
  bannerHeight = Math.max(0, Math.round(h));
  // Layout pads the tab bar, sheets and toasts by this so the banner never covers them.
  document.documentElement.style.setProperty("--ad-h", `${bannerHeight}px`);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The banner's height in CSS px (0 when there's no banner). */
export function useBannerHeight(): number {
  return useSyncExternalStore(subscribe, () => bannerHeight);
}

/** Whether Settings must offer "Ad privacy choices" (Google requires it wherever consent was asked). */
export function usePrivacyOptionsRequired(): boolean {
  return useSyncExternalStore(subscribe, () => privacyRequired);
}

export async function showPrivacyOptions() {
  if (native) await AdMob.showPrivacyOptionsForm();
}

/** Called once at start. Removing ads later takes the banner away at once; a refund brings it back. */
export async function initAds() {
  onAdFreeChange(() => {
    if (isAdFree()) stopAds();
    else startAds().catch((e) => console.warn("ads failed to start", e));
  });
  if (!isAdFree()) await startAds().catch((e) => console.warn("ads failed to start", e));
}

async function startAds() {
  if (!native) {
    setBannerHeight(PLACEHOLDER_HEIGHT);
    return;
  }
  if (!started) {
    let info = await AdMob.requestConsentInfo();
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) info = await AdMob.showConsentForm();
    privacyRequired = String(info.privacyOptionsRequirementStatus) === "REQUIRED"; // the enum isn't exported
    listeners.forEach((l) => l());
    if (!info.canRequestAds) return; // no ads (and Generate works without one)
    await AdMob.initialize({ maxAdContentRating: MaxAdContentRating.ParentalGuidance });
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => setBannerHeight(isAdFree() ? 0 : size.height));
    await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      setBannerHeight(0);
      window.clearTimeout(bannerRetry);
      bannerRetry = window.setTimeout(showBanner, 60_000); // offline or no fill: try again in a minute
    });
    started = true;
  }
  if (isAdFree()) return;
  await showBanner();
  prepareRewarded().catch(() => {}); // ready by the time they tap Generate
}

async function showBanner() {
  if (!started || isAdFree()) return;
  await AdMob.showBanner({
    adId: BANNER_ID, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0,
    isTesting: TEST_ADS,
  }).catch((e) => console.warn("banner failed", e));
}

function stopAds() {
  window.clearTimeout(bannerRetry);
  setBannerHeight(0);
  if (native && started) AdMob.removeBanner().catch(() => {});
}

function prepareRewarded(): Promise<void> {
  if (rewardedAt && Date.now() - rewardedAt < REWARDED_MAX_AGE_MS) return Promise.resolve();
  if (!preparing) {
    preparing = AdMob.prepareRewardVideoAd({ adId: REWARDED_ID, isTesting: TEST_ADS })
      .then(() => { rewardedAt = Date.now(); })
      .finally(() => { preparing = null; });
  }
  return preparing;
}

// One watched video covers planning (and regenerating) for a while, so trying a few weeks isn't an ad each.
const COVER_KEY = "mp_ad_cover_until";
const COVER_MS = 15 * 60 * 1000;

export function markAdWatched() {
  try {
    localStorage.setItem(COVER_KEY, String(Date.now() + COVER_MS));
  } catch {
    // private browser window: no cover, they'll be asked again
  }
}

/** Minutes left (rounded up) on the last watched video's cover; 0 = Generate asks for a video again. */
export function adCoverMinutesLeft(now = Date.now()): number {
  try {
    const until = Number(localStorage.getItem(COVER_KEY));
    const left = until - now;
    // A clock moved back can't stretch the cover past its length.
    return left > 0 ? Math.ceil(Math.min(left, COVER_MS) / 60_000) : 0;
  } catch {
    return 0;
  }
}

export type AdOutcome = "rewarded" | "skipped" | "unavailable";

/** Plays the rewarded video. "rewarded" = watched to the end; "skipped" = closed early;
 * "unavailable" = no ad could be shown (offline, no consent, nothing to show), so don't hold the user up. */
export async function showRewardedAd(): Promise<AdOutcome> {
  if (isAdFree()) return "rewarded";
  if (!native) return pretendVideo();
  if (!started) return "unavailable";
  try {
    await Promise.race([prepareRewarded(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000))]);
  } catch {
    return "unavailable";
  }
  rewardedAt = 0; // this one gets used up
  // showRewardVideoAd only resolves on a reward (never if they close early), so the events decide.
  const outcome = await new Promise<AdOutcome>((resolve) => {
    let rewarded = false;
    const handles = [
      AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true; }),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => finish(rewarded ? "rewarded" : "skipped")),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish("unavailable")),
    ];
    function finish(result: AdOutcome) {
      handles.forEach((h) => h.then((x) => x.remove()));
      resolve(result);
    }
    AdMob.showRewardVideoAd().catch(() => finish(rewarded ? "rewarded" : "unavailable"));
  });
  prepareRewarded().catch(() => {}); // the next one
  return outcome;
}

/** Browser stand-in for the video: a 5-second countdown that can be closed early. */
function pretendVideo(): Promise<AdOutcome> {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;inset:0;z-index:100;background:#111;color:#fff;display:flex;flex-direction:column;"
      + "align-items:center;justify-content:center;gap:16px;font:600 18px system-ui";
    const label = document.createElement("div");
    const close = document.createElement("button");
    close.textContent = "Close";
    close.style.cssText = "position:absolute;top:24px;right:24px;color:#fff;background:#333;border-radius:999px;padding:6px 14px";
    box.append(label, close);
    document.body.append(box);
    let left = 5;
    const tick = () => { label.textContent = left > 0 ? `Test video ad: ${left}s` : "Reward earned. Close to continue."; };
    tick();
    const timer = window.setInterval(() => { left--; tick(); if (left <= 0) window.clearInterval(timer); }, 1000);
    close.onclick = () => {
      window.clearInterval(timer);
      box.remove();
      resolve(left <= 0 ? "rewarded" : "skipped");
    };
  });
}
