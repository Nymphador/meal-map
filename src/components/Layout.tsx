import { NavLink, Outlet } from "react-router-dom";
import { BannerPlaceholder } from "./Ads";
import { BookIcon, BoxIcon, CalendarIcon, CartIcon, GearIcon, TagIcon } from "./Icons";

const TABS = [
  { to: "/", label: "This week", Icon: CalendarIcon, end: true },
  { to: "/shopping", label: "Shopping", Icon: CartIcon, end: false },
  { to: "/recipes", label: "Recipes", Icon: BookIcon, end: false },
  { to: "/pantry", label: "Pantry", Icon: BoxIcon, end: false },
  { to: "/ingredients", label: "Prices", Icon: TagIcon, end: false },
];

/** Bottom tab bar on phones, side rail on wider screens. The banner ad (while ads are on) sits below both. */
export default function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line bg-card px-3 pt-5 pb-[calc(1.25rem+var(--ad-h,0px))] md:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-bold">Meal Map</span>
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition ${
                isActive ? "bg-brand-soft text-brand" : "text-muted hover:bg-bg hover:text-ink"}`}>
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/settings"
          className={({ isActive }) => `mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium ${
            isActive ? "bg-brand-soft text-brand" : "text-muted hover:bg-bg hover:text-ink"}`}>
          <GearIcon className="h-5 w-5" />
          Settings
        </NavLink>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="pt-safe sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-sm md:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg" />
              <span className="font-bold">Meal Map</span>
            </div>
            <NavLink to="/settings" className="rounded-full p-2 text-muted hover:bg-card" aria-label="Settings">
              <GearIcon className="h-6 w-6" />
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(7rem+var(--ad-h,0px))] pt-4 md:px-8 md:pb-[calc(3rem+var(--ad-h,0px))] md:pt-8 xl:max-w-[88rem]">
          <Outlet />
        </main>
      </div>

      <nav className="pb-safe-ad fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur-sm md:hidden">
        <div className="mx-auto flex max-w-md">
          {TABS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive ? "text-brand" : "text-muted"}`}>
              <Icon className="h-6 w-6" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <BannerPlaceholder />
    </div>
  );
}
