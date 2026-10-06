// Pure rules for the remove-ads purchase, kept apart from the plugin so they can be tested.
import { REMOVE_ADS_PRODUCT } from "./config";

export type PurchaseLike = { productIdentifier: string; purchaseState?: string; isAcknowledged?: boolean; purchaseToken?: string };

// Play Billing's Purchase.PurchaseState, passed through as a string by the plugin.
const PURCHASED = "1";

const isRemoveAds = (p: PurchaseLike) => p.productIdentifier === REMOVE_ADS_PRODUCT;

/** A completed remove-ads purchase (a pending one, e.g. paying cash at a shop, doesn't count yet). */
export function ownsRemoveAds(purchases: PurchaseLike[]): boolean {
  return purchases.some((p) => isRemoveAds(p) && (p.purchaseState === undefined || p.purchaseState === PURCHASED));
}

/** Completed purchases Play still needs acknowledging; unacknowledged ones are refunded after 3 days. */
export function needsAcknowledging(purchases: PurchaseLike[]): string[] {
  return purchases
    .filter((p) => isRemoveAds(p) && p.purchaseState === PURCHASED && p.isAcknowledged === false && p.purchaseToken)
    .map((p) => p.purchaseToken!);
}

export type BuyResult = "bought" | "pending" | "cancelled" | "owned" | "failed";

/** What a rejected purchaseProduct call means for the user. */
export function buyErrorResult(e: unknown): BuyResult {
  const err = e as { code?: string; message?: string } | null;
  const text = `${err?.code ?? ""} ${err?.message ?? ""}`;
  if (/USER_CANCEL/i.test(text)) return "cancelled";
  if (/ITEM_ALREADY_OWNED/i.test(text)) return "owned";
  if (/pending/i.test(text)) return "pending";
  return "failed";
}
