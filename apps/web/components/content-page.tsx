import Image from "next/image";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function ContentPage({ children, eyebrow, image, imageAlt, title }: { children: React.ReactNode; eyebrow: string; image?: string; imageAlt?: string; title: string }) {
  return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></header>{image && <div className="content-hero-image"><Image alt={imageAlt ?? "Studio Balance"} fill priority sizes="(max-width: 760px) 100vw, 1180px" src={image} /></div>}<div className="content-prose">{children}</div></main><SiteFooter /></>;
}
