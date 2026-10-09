export const accountViews = ["favorites", "home", "messages", "news", "profile", "reservations"] as const;
export type AccountView = typeof accountViews[number];

export function accountView(value: unknown): AccountView {
  return typeof value === "string" && accountViews.some((view) => view === value)
    ? value as AccountView
    : "home";
}

export function accountViewHref(view: AccountView): string {
  return view === "home" ? "/muj-ucet" : `/muj-ucet?view=${view}`;
}

export function accountLoginHref(requestedView: unknown): string {
  return `/prihlaseni?returnTo=${encodeURIComponent(accountViewHref(accountView(requestedView)))}`;
}

export const clientNavigationItems = [
  { id: "schedule", label: "Rozvrh", href: "/rozvrh" },
  { id: "reservations", label: "Rezervace", href: accountViewHref("reservations") },
  { id: "news", label: "Novinky", href: accountViewHref("news") },
  { id: "messages", label: "Zprávy", href: accountViewHref("messages") },
  { id: "profile", label: "Profil", href: accountViewHref("profile") }
] as const;
