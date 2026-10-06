// The one-time Premium purchase (no ads, plus breakfast and lunch planning) through Google Play Billing (no server, no account: Play itself
// remembers the purchase, so reinstalling or a new phone gets it back with Restore, or automatically
// on start). The answer is cached in localStorage so the app starts ad-free offline.
import { App } from "@capacitor/app";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";
import { useSyncExternalStore } from "react";
import { native } from "../data/storage";
import { FALLBACK_PRICE, REMOVE_ADS_PRODUCT } from "./config";
import { buyErrorResult, needsAcknowledging, ownsRemoveAds, type BuyResult } from "./entitlement";

const KEY = "mp_ad_free";
const listeners = new Set<() => void>();
let adFree = readCache();
let price = FALLBACK_PRICE;

function readCache(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function setAdFree(value: boolean) {
  if (value === adFree) return;
  adFree = value;
  try {
    if (value) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // private browser window: lasts until the page closes
  }
  listeners.forEach((l) => l());
}

export function isAdFree(): boolean {
  return adFree;
}

/** Premium = the one-time purchase: no ads, plus breakfast and lunch. (The Play product is still called
 * remove_ads: a product id can never change.) */
export const isPremium = () => adFree;

export function onAdFreeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True once ads are removed; pages re-render when it changes. */
export function useAdFree(): boolean {
  return useSyncExternalStore(onAdFreeChange, isAdFree);
}

export const usePremium = useAdFree;

/** The localised price from Play ("$3.99", "A$3.99"...), or the fallback before it's known. */
export function useRemoveAdsPrice(): string {
  return useSyncExternalStore(onAdFreeChange, () => price);
}

/** Asks Play what this account owns. Leaves the cached answer alone if Play can't be reached. */
async function checkPurchases(): Promise<boolean> {
  const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
  for (const token of needsAcknowledging(purchases)) {
    await NativePurchases.acknowledgePurchase({ purchaseToken: token }).catch((e) => console.warn("acknowledge failed", e));
  }
  const owned = ownsRemoveAds(purchases);
  setAdFree(owned); // a refunded purchase brings the ads back
  return owned;
}

/** Called once at start: re-checks the purchase (and again whenever the app comes back to the front,
 * so a pending payment that cleared while away takes effect) and fetches the price. */
export async function initPremium() {
  if (!native) return;
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    if (!isBillingSupported) return;
  } catch {
    return;
  }
  checkPurchases().catch((e) => console.warn("purchase check failed", e));
  NativePurchases.getProduct({ productIdentifier: REMOVE_ADS_PRODUCT, productType: PURCHASE_TYPE.INAPP })
    .then(({ product }) => { if (product?.priceString) price = product.priceString; listeners.forEach((l) => l()); })
    .catch(() => {}); // not set up in the Play Console yet: keep the fallback price
  App.addListener("resume", () => { checkPurchases().catch(() => {}); });
}

export async function buyRemoveAds(): Promise<BuyResult> {
  if (!native) {
    // Browser testing only: there's no Play Store on a computer.
    if (!window.confirm(`Browser test: pretend to buy Premium for ${price}?`)) return "cancelled";
    setAdFree(true);
    return "bought";
  }
  try {
    await NativePurchases.purchaseProduct({
      productIdentifier: REMOVE_ADS_PRODUCT, productType: PURCHASE_TYPE.INAPP, quantity: 1, isConsumable: false,
      autoAcknowledgePurchases: true,
    });
    setAdFree(true);
    return "bought";
  } catch (e) {
    const result = buyErrorResult(e);
    if (result === "owned") {
      await checkPurchases().catch(() => setAdFree(true));
      return "owned";
    }
    if (result === "failed") console.warn("purchase failed", e);
    return result;
  }
}

/** Settings → Restore purchase. True if the purchase was found. */
export async function restoreRemoveAds(): Promise<boolean> {
  if (!native) return adFree;
  await NativePurchases.restorePurchases().catch(() => {});
  return checkPurchases();
}

/** Browser testing only: undo a pretend purchase. */
export function resetTestPurchase() {
  if (!native) setAdFree(false);
}

/** User-facing words for a purchase attempt; null when nothing needs saying (they backed out). */
export function buyMessage(result: BuyResult): { text: string; error?: boolean } | null {
  switch (result) {
    case "bought": return { text: "Premium unlocked: no ads, and breakfast and lunch. Thank you!" };
    case "owned": return { text: "You already have Premium, so it's switched on." };
    case "pending": return { text: "Payment pending: Premium switches on as soon as it clears." };
    case "failed": return { text: "The purchase didn't go through. Please try again.", error: true };
    default: return null;
  }
}
