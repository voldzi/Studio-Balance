import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("makes client login and the Balance Flow method unambiguous in mobile navigation", () => {
    const html = renderToStaticMarkup(<SiteHeader />);

    expect(html).toContain('aria-label="Mobilní navigace"');
    expect(html).toContain('href="/lekce">Všechny lekce</a>');
    expect(html).toContain('href="/rozvrh">Rozvrh a rezervace</a>');
    expect(html).toContain('href="/balance-flow">Metoda Balance Flow</a>');
    expect(html).toContain('href="/muj-ucet">Přihlásit / Můj účet</a>');
  });
});
