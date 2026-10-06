import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../api";
import { CloseIcon, HeartIcon, StarIcon } from "./Icons";

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-danger/40 p-4 text-sm text-danger">
      {message}
      {onRetry && <button className="ml-3 font-semibold underline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function PageHeader({ title, back, backState, actions }: {
  title: string; back?: string; backState?: unknown; actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {back && (
        <Link to={back} state={backState} className="-ml-2 rounded-full p-2 text-muted hover:bg-card" aria-label="Back">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 5l-7 7 7 7" /></svg>
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight">{title}</h1>
      {actions}
    </div>
  );
}

export function Stars({ value, onChange, size = "h-6 w-6" }: {
  value: number | null; onChange?: (v: number) => void; size?: string;
}) {
  return (
    <div className="flex items-center text-accent" aria-label={`Rated ${value ?? 0} of 5`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onChange ? (
          // Tapping the current rating again clears it.
          <button key={n} type="button" className="p-0.5" aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange(value === n ? 0 : n)}>
            <StarIcon className={size} filled={(value ?? 0) >= n} />
          </button>
        ) : (
          <StarIcon key={n} className={size} filled={(value ?? 0) >= n} />
        ),
      )}
    </div>
  );
}

export function FavouriteButton({ on, onToggle, className = "" }: { on: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} aria-label={on ? "Remove favourite" : "Add favourite"}
      className={`rounded-full p-2 transition active:scale-90 ${on ? "text-rose-500" : "text-muted"} ${className}`}>
      <HeartIcon filled={on} />
    </button>
  );
}

export function RecipePhoto({ src, title, className = "" }: { src: string | null; title: string; className?: string }) {
  if (src) return <img src={mediaUrl(src) ?? src} alt="" loading="lazy" className={`object-cover ${className}`} />;
  // No photo: a soft tile with the first letter, tinted from the title so cards differ.
  const hue = [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <div className={`flex items-center justify-center text-4xl font-bold text-white/90 ${className}`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 45% 55%), hsl(${(hue + 40) % 360} 50% 42%))` }}>
      {title.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

/** Bottom sheet on phones, centred dialog on wider screens. Escape or a tap outside closes it. */
export function Sheet({ title, onClose, children, footer }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  // A ref, so a new onClose each render doesn't re-run the effect (and lose the saved overflow).
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind shouldn't scroll with the sheet
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className="pb-safe flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl bg-card shadow-xl md:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">{title}</div>
          <button className="-mr-1 rounded-full p-1.5 text-muted hover:bg-bg" onClick={onClose} aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
