import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "../app/page";
import { CreatorCredits, SiteFooter } from "./site-footer";

vi.mock("./public-analytics-link", () => ({
  PublicAnalyticsLink: ({ analyticsEvent, ...props }: ComponentProps<"a"> & { analyticsEvent: string }) => <a {...props} data-analytics-event={analyticsEvent} />,
}));

const creators = [
  { name: "VCode", href: "https://vcode.zeleznalady.cz/", event: "portfolio-vcode-click", asset: "vcode-af0610b52c23.svg", hash: "af0610b52c2376cba8d27d46ac8a09e0e3f5be779f170a2fcbbd4340308f715a" },
  { name: "Moje porce", href: "https://mojeporce.cz/", event: "portfolio-moje-porce-click", asset: "moje-porce-b244faa9e68a.svg", hash: "b244faa9e68ad8c723abd72029098cc8fd726bc65d4120f84ec4acb9ea9750c5" },
  { name: "Městem hrou", href: "https://mestemhrou.cz/", event: "portfolio-mestem-hrou-click", asset: "mestem-hrou-e40bec4cb730.png", hash: "e40bec4cb7307ac72fee93bfadb556ccbcc2c098883440d1e99ac29f0b07aad2" },
];

describe("SiteFooter creator credit", () => {
  it("also renders the shared credits on the homepage while preserving its studio logo and contact order", () => {
    const page: ReactElement<{ children: ReactNode }> = HomePage();
    // Render the actual homepage footer without unrelated sections that need the Next router.
    const homepageFooter = Children.toArray(page.props.children).find((child) => isValidElement(child) && child.type === "footer");
    expect(homepageFooter).toBeDefined();
    const html = renderToStaticMarkup(<>{homepageFooter}</>);
    const footer = html.match(/<footer id="kontakt" class="site-footer">([\s\S]*?)<\/footer>/)?.[1];

    expect(footer).toBeDefined();
    expect(footer).toContain(encodeURIComponent("/images/studio-balance/brand-logo.jpg"));
    expect(footer).toContain('alt="Studio Balance"');
    expect(footer?.indexOf("<h2>Kontakt</h2>")).toBeLessThan(footer?.indexOf("<h2>Rezervace</h2>") ?? -1);
    expect(footer).toContain(renderToStaticMarkup(<CreatorCredits />));
    expect(footer?.match(/class="footer-credits"/g)).toHaveLength(1);
    for (const { name, href, event } of creators) {
      expect(footer).toContain(`href="${href}"`);
      expect(footer).toContain(name);
      expect(footer).toContain(`data-analytics-event="${event}"`);
    }
  });

  it("keeps creator links separate from the studio's booking and contact links", () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    const credit = html.match(/<section class="footer-credits"[^>]*>([\s\S]*?)<\/section>/)?.[1];

    expect(credit).toBeDefined();
    expect(credit).toContain("Web a rezervační systém vytvořilo");
    expect(credit).toContain("Od stejného týmu také aplikace");
    const links = credit?.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
    for (const { name, href, event } of creators) {
      const link = links.find((candidate) => candidate.includes(`href="${href}"`));
      expect(link).toContain(`href="${href}" target="_blank" rel="noopener noreferrer"`);
      expect(link).toContain(name);
      expect(link).toContain(`data-analytics-event="${event}"`);
      expect(link?.match(/data-analytics-event=/g)).toHaveLength(1);
    }
    expect(credit?.match(/<a /g)).toHaveLength(3);
    expect(credit?.match(/data-analytics-event=/g)).toHaveLength(3);
    expect(credit).not.toContain('data-analytics-event="outbound-click"');
    expect(credit).not.toContain("?utm_");
    expect(html).toContain('href="/rozvrh"');
    expect(html).toContain('href="/muj-ucet"');
    expect(html).toContain('href="/kontakt"');
    expect(html).toContain('aria-label="Sociální sítě Studia Balance"');
  });

  it("uses exact official static icons from the same origin with decorative alternative text", () => {
    const html = renderToStaticMarkup(<SiteFooter />);
    const credit = html.match(/<section class="footer-credits"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    const icons = credit?.match(/<img\b[^>]*>/g);

    expect(icons).toHaveLength(3);
    for (const icon of icons ?? []) {
      expect(icon).toContain('alt=""');
      expect(icon).toContain('aria-hidden="true"');
      expect(icon).toContain('width="32"');
      expect(icon).toContain('height="32"');
      expect(icon).toContain('src="/images/creators/');
      expect(icon).not.toContain('src="https://');
    }
    for (const { asset, hash } of creators) {
      expect(credit).toContain(`/images/creators/${asset}`);
      const payload = readFileSync(new URL(`../public/images/creators/${asset}`, import.meta.url));
      expect(createHash("sha256").update(payload).digest("hex")).toBe(hash);
    }
  });
});
