import { describe, expect, it } from "vitest";
import { REMOVE_ADS_PRODUCT } from "./config";
import { buyErrorResult, needsAcknowledging, ownsRemoveAds } from "./entitlement";

const purchase = (over: Record<string, unknown> = {}) =>
  ({ productIdentifier: REMOVE_ADS_PRODUCT, purchaseState: "1", isAcknowledged: true, purchaseToken: "tok", ...over });

describe("remove-ads entitlement", () => {
  it("owns it only once the payment has completed", () => {
    expect(ownsRemoveAds([])).toBe(false);
    expect(ownsRemoveAds([purchase()])).toBe(true);
    expect(ownsRemoveAds([purchase({ purchaseState: "2" })])).toBe(false); // pending
    expect(ownsRemoveAds([purchase({ productIdentifier: "something_else" })])).toBe(false);
  });

  it("acknowledges completed purchases Play hasn't been told about", () => {
    expect(needsAcknowledging([purchase()])).toEqual([]);
    expect(needsAcknowledging([purchase({ isAcknowledged: false })])).toEqual(["tok"]);
    expect(needsAcknowledging([purchase({ isAcknowledged: false, purchaseState: "2" })])).toEqual([]);
  });

  it("reads why a purchase didn't happen", () => {
    expect(buyErrorResult({ code: "USER_CANCELED", message: "x" })).toBe("cancelled");
    expect(buyErrorResult({ code: "ITEM_ALREADY_OWNED" })).toBe("owned");
    expect(buyErrorResult(new Error("Purchase is pending"))).toBe("pending");
    expect(buyErrorResult(new Error("Billing unavailable"))).toBe("failed");
    expect(buyErrorResult(null)).toBe("failed");
  });
});
