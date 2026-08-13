import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("keeps the public mobile navigation concise and makes client login discoverable", () => {
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).toContain('aria-label="Mobilní navigace"');
    expect(html).toContain('href="/lekce">Všechny lekce</a>');
    expect(html).toContain('href="/rozvrh">Rozvrh a rezervace</a>');
    expect(html).toContain('href="/muj-ucet">Přihlásit / Můj účet</a>');
    expect(html).toContain('class="mobile-nav-backdrop"');
    expect(html).not.toContain('href="/balance-flow">');
  });
});
