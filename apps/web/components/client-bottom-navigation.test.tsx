import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ClientBottomNavigation } from "./client-bottom-navigation";
import { ClientRouteNavigation } from "./client-route-navigation";

function labels(html: string): string[] {
  return [...html.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]!);
}

describe("client section navigation", () => {
  it("exposes studio news and account messages in the same order on account and schedule screens", () => {
    const account = renderToStaticMarkup(<ClientBottomNavigation active="news" navigate={() => undefined} />);
    const schedule = renderToStaticMarkup(<ClientRouteNavigation active="schedule" />);
    expect(labels(account)).toEqual(["Rozvrh", "Rezervace", "Novinky", "Zprávy", "Profil"]);
    expect(labels(schedule)).toEqual(labels(account));
    expect(schedule).toContain('href="/muj-ucet?view=news"');
    expect(schedule).toContain('href="/muj-ucet?view=messages"');
    expect(account.match(/aria-current="page"/g)).toHaveLength(1);
    expect(account).toMatch(/<button aria-current="page"[^>]*>[\s\S]*?<span>Novinky<\/span><\/button>/);
    expect(schedule).toMatch(/<a aria-current="page" href="\/rozvrh"/);
  });

  it("keeps favorites within Profile without inventing unread counts", () => {
    const favorites = renderToStaticMarkup(<ClientBottomNavigation active="favorites" navigate={() => undefined} />);
    expect(favorites).toMatch(/<button aria-current="page"[^>]*>[\s\S]*?<span>Profil<\/span><\/button>/);
    expect(favorites.match(/aria-current="page"/g)).toHaveLength(1);
    expect(favorites).not.toMatch(/nepřečten|unread|badge/i);
  });
});
