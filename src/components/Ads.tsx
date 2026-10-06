import { useEffect, useState } from "react";
import { native } from "../data/storage";
import { showRewardedAd, useBannerHeight, type AdOutcome } from "../monetise/ads";
import { buyMessage, buyRemoveAds, useRemoveAdsPrice } from "../monetise/premium";
import { CheckIcon, CloseIcon, SparkIcon } from "./Icons";
import { useToast } from "./Toast";
import { Sheet } from "./ui";

/** Browser only: where the phone's banner ad would sit (the real one is drawn by Android over the page). */
export function BannerPlaceholder() {
  const height = useBannerHeight();
  if (native || !height) return null;
  return (
    <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-[60] box-content flex items-center justify-center bg-line text-xs font-semibold uppercase tracking-wide text-muted"
      style={{ height }}>
      Test banner ad
    </div>
  );
}

/** Buys Premium and says how it went. Resolves true when it's unlocked. */
export function useBuyRemoveAds() {
  const toast = useToast();
  return async () => {
    const result = await buyRemoveAds();
    const message = buyMessage(result);
    if (message) toast(message.text, { error: message.error });
    return result === "bought" || result === "owned";
  };
}

/** What Premium gets you, for the sheets and Settings. */
export function PremiumPerks() {
  return (
    <ul className="space-y-1 text-sm">
      {["No ads, ever", "Plan breakfast and lunch as well as dinner", "One payment, no subscription; comes back on a new phone"].map((t) => (
        <li key={t} className="flex items-start gap-2"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{t}</li>
      ))}
    </ul>
  );
}

/** Offered when a free user reaches for breakfast and lunch. */
export function PremiumSheet({ onClose }: { onClose: () => void }) {
  const price = useRemoveAdsPrice();
  const buy = useBuyRemoveAds();
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={<h2 className="font-semibold">Breakfast &amp; lunch are part of Premium</h2>} onClose={() => !busy && onClose()}>
      <PremiumPerks />
      <div className="mt-4 grid gap-2 pb-1">
        <button type="button" className="btn-primary" disabled={busy}
          onClick={async () => { setBusy(true); const ok = await buy(); setBusy(false); if (ok) onClose(); }}>
          Get Premium · {price} once
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>Not now</button>
      </div>
    </Sheet>
  );
}

/** Asked before planning a week while ads are on: watch a short video (opt-in, as AdMob requires for
 * rewarded ads), or go Premium. onDone(outcome) is told how it went, or "bought". */
export function AdGateSheet({ onClose, onDone }: { onClose: () => void; onDone: (outcome: AdOutcome | "bought") => void }) {
  const price = useRemoveAdsPrice();
  const buy = useBuyRemoveAds();
  const [busy, setBusy] = useState(false);

  async function watch() {
    setBusy(true);
    const outcome = await showRewardedAd();
    setBusy(false);
    onDone(outcome);
  }

  async function remove() {
    setBusy(true);
    const bought = await buy();
    setBusy(false);
    if (bought) onDone("bought");
  }

  return (
    <Sheet title={<h2 className="font-semibold">Plan your week</h2>} onClose={() => !busy && onClose()}>
      <p className="text-sm text-muted">
        Planning is free with a short video ad, which keeps the app free for everyone. Or go Premium with a one-time
        purchase: no ads, plus breakfast and lunch planning.
      </p>
      <div className="mt-4 grid gap-2 pb-1">
        <button type="button" className="btn-primary" onClick={watch} disabled={busy}>
          <SparkIcon className="h-5 w-5" /> {busy ? "Loading…" : "Watch an ad and plan"}
        </button>
        <button type="button" className="btn-secondary" onClick={remove} disabled={busy}>
          Go Premium · {price} once
        </button>
      </div>
    </Sheet>
  );
}

/** The small reminder after a video ad that ads can be removed. Closes itself after a while. */
export function UpsellPopup({ onClose }: { onClose: () => void }) {
  const price = useRemoveAdsPrice();
  const buy = useBuyRemoveAds();
  useEffect(() => {
    const timer = window.setTimeout(onClose, 12_000);
    return () => window.clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 md:top-4">
      <div role="status" className="pt-safe pointer-events-auto mt-16 w-full max-w-md md:mt-0">
        <div className="flex items-start gap-3 rounded-xl border border-line bg-card p-3 shadow-lg">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Tired of ads?</p>
            <p className="text-muted">Premium removes them for good and adds breakfast and lunch planning. {price}, once.</p>
            <button type="button" className="mt-2 font-semibold text-brand"
              onClick={async () => { if (await buy()) onClose(); }}>
              Go Premium
            </button>
          </div>
          <button type="button" className="-mr-1 rounded-full p-1.5 text-muted hover:bg-bg" onClick={onClose} aria-label="Close">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
