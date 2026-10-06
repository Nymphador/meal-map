// Remembers which list a recipe was opened from (My library with its filters, Discover, This week),
// so the recipe's back arrow returns there, not to whichever recipe sub-page was visited last.
import { useLocation, useNavigate, type Location } from "react-router-dom";

export type Origin = { from: string; fromIdx?: number };

/** React Router keeps the history position in history.state.idx. */
const historyIdx = (): number | undefined => {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : undefined;
};

/** State for a link that opens a recipe from the current page. */
export function originHere(location: Location): Origin {
  return { from: location.pathname + location.search, fromIdx: historyIdx() };
}

/** The origin carried by this page, to pass along to recipe sub-pages (edit, store products). */
export function originOf(location: Location): Origin | undefined {
  const s = location.state as Partial<Origin> | null;
  return s?.from ? { from: s.from, fromIdx: s.fromIdx } : undefined;
}

/** Back to where the recipe was opened from: pops the history to that entry when it's still there
 * (so the phone's back button stays sensible), otherwise opens it. */
export function useBackToOrigin(fallback: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const origin = originOf(location);
    const idx = historyIdx();
    if (origin?.fromIdx !== undefined && idx !== undefined && origin.fromIdx < idx) navigate(origin.fromIdx - idx);
    else navigate(origin?.from ?? fallback);
  };
}
